/**
 * Upload Resume Module
 *
 * Provides cross-reload resume for multipart uploads using IndexedDB.
 * Browser-only; gracefully no-ops in non-browser runtimes.
 *
 * Store: sm_upload_sessions_v1 (IndexedDB)
 * Key: hash of app_id + user_id + filename + size + lastModified
 */

// ============================================================================
// Types
// ============================================================================

export interface CompletedPart {
  part_number: number
  etag: string
}

export interface ResumeSession {
  upload_session_id: string
  file_id: string
  completion_token: string
  total_parts: number
  part_size_bytes: number
  completed_parts: CompletedPart[]
  created_at: number
}

interface ResumeEntry {
  key: string
  session: ResumeSession
  updated_at: number
}

// ============================================================================
// Constants
// ============================================================================

const DB_NAME = 'sm_upload_sessions_v1'
const STORE_NAME = 'sessions'
const DB_VERSION = 1
/** Max age before a resume entry is considered stale (24h) */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

// ============================================================================
// UploadResumeStore
// ============================================================================

export class UploadResumeStore {
  private db: IDBDatabase | null = null

  /** Generate a deterministic resume key from upload identity */
  static async generateResumeKey(
    appId: string,
    userId: string,
    filename: string,
    size: number,
    lastModified?: number,
  ): Promise<string> {
    const raw = `${appId}:${userId}:${filename}:${size}:${lastModified ?? 0}`

    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buffer = new TextEncoder().encode(raw)
      const hash = await crypto.subtle.digest('SHA-256', buffer)
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    }

    // Simple fallback hash for environments without crypto.subtle
    let hash = 0
    for (let i = 0; i < raw.length; i++) {
      const chr = raw.charCodeAt(i)
      hash = ((hash << 5) - hash) + chr
      hash |= 0
    }
    return `fallback_${Math.abs(hash).toString(36)}`
  }

  /** Open the IndexedDB store. No-ops if IndexedDB is unavailable. */
  async open(): Promise<void> {
    if (typeof indexedDB === 'undefined') return

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
          store.createIndex('updated_at', 'updated_at')
        }
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onerror = () => {
        // IndexedDB unavailable; resume will be disabled
        reject(request.error)
      }
    })
  }

  /** Get a resume session by key. Returns null if not found or stale. */
  async get(key: string): Promise<ResumeSession | null> {
    if (!this.db) return null

    return new Promise((resolve) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(key)

      request.onsuccess = () => {
        const entry = request.result as ResumeEntry | undefined
        if (!entry) {
          resolve(null)
          return
        }

        // Check staleness
        if (Date.now() - entry.updated_at > MAX_AGE_MS) {
          this.remove(key).catch(() => {})
          resolve(null)
          return
        }

        resolve(entry.session)
      }

      request.onerror = () => resolve(null)
    })
  }

  /** Save a new resume session. */
  async save(key: string, session: ResumeSession): Promise<void> {
    if (!this.db) return

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const entry: ResumeEntry = {
        key,
        session: { ...session, created_at: Date.now() },
        updated_at: Date.now(),
      }

      const request = store.put(entry)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /** Update a single completed part in an existing session. */
  async updatePart(key: string, partNumber: number, etag: string): Promise<void> {
    if (!this.db) return

    return new Promise((resolve) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const getRequest = store.get(key)

      getRequest.onsuccess = () => {
        const entry = getRequest.result as ResumeEntry | undefined
        if (!entry) {
          resolve()
          return
        }

        // Add part if not already present
        const existing = entry.session.completed_parts.find((p) => p.part_number === partNumber)
        if (!existing) {
          entry.session.completed_parts.push({ part_number: partNumber, etag })
        }
        entry.updated_at = Date.now()

        const putRequest = store.put(entry)
        putRequest.onsuccess = () => resolve()
        putRequest.onerror = () => resolve()
      }

      getRequest.onerror = () => resolve()
    })
  }

  /** Remove a resume session (e.g., after successful completion). */
  async remove(key: string): Promise<void> {
    if (!this.db) return

    return new Promise((resolve) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.delete(key)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
    })
  }

  /** Purge all stale entries (older than MAX_AGE_MS). */
  async purgeStale(): Promise<number> {
    if (!this.db) return 0

    return new Promise((resolve) => {
      const cutoff = Date.now() - MAX_AGE_MS
      const tx = this.db!.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const index = store.index('updated_at')
      const range = IDBKeyRange.upperBound(cutoff)
      const request = index.openCursor(range)
      let count = 0

      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          cursor.delete()
          count++
          cursor.continue()
        } else {
          resolve(count)
        }
      }

      request.onerror = () => resolve(0)
    })
  }

  /** Close the database connection. */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}
