// src/services/upload-resume.ts
var DB_NAME = "sm_upload_sessions_v1";
var STORE_NAME = "sessions";
var DB_VERSION = 1;
var MAX_AGE_MS = 24 * 60 * 60 * 1e3;
var UploadResumeStore = class {
  constructor() {
    this.db = null;
  }
  /** Generate a deterministic resume key from upload identity */
  static async generateResumeKey(appId, userId, filename, size, lastModified) {
    const raw = `${appId}:${userId}:${filename}:${size}:${lastModified ?? 0}`;
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const buffer = new TextEncoder().encode(raw);
      const hash2 = await crypto.subtle.digest("SHA-256", buffer);
      return Array.from(new Uint8Array(hash2)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const chr = raw.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0;
    }
    return `fallback_${Math.abs(hash).toString(36)}`;
  }
  /** Open the IndexedDB store. No-ops if IndexedDB is unavailable. */
  async open() {
    if (typeof indexedDB === "undefined") return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
          store.createIndex("updated_at", "updated_at");
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  }
  /** Get a resume session by key. Returns null if not found or stale. */
  async get(key) {
    if (!this.db) return null;
    return new Promise((resolve) => {
      const tx = this.db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => {
        const entry = request.result;
        if (!entry) {
          resolve(null);
          return;
        }
        if (Date.now() - entry.updated_at > MAX_AGE_MS) {
          this.remove(key).catch(() => {
          });
          resolve(null);
          return;
        }
        resolve(entry.session);
      };
      request.onerror = () => resolve(null);
    });
  }
  /** Save a new resume session. */
  async save(key, session) {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const entry = {
        key,
        session: { ...session, created_at: Date.now() },
        updated_at: Date.now()
      };
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  /** Update a single completed part in an existing session. */
  async updatePart(key, partNumber, etag) {
    if (!this.db) return;
    return new Promise((resolve) => {
      const tx = this.db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getRequest = store.get(key);
      getRequest.onsuccess = () => {
        const entry = getRequest.result;
        if (!entry) {
          resolve();
          return;
        }
        const existing = entry.session.completed_parts.find((p) => p.part_number === partNumber);
        if (!existing) {
          entry.session.completed_parts.push({ part_number: partNumber, etag });
        }
        entry.updated_at = Date.now();
        const putRequest = store.put(entry);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => resolve();
      };
      getRequest.onerror = () => resolve();
    });
  }
  /** Remove a resume session (e.g., after successful completion). */
  async remove(key) {
    if (!this.db) return;
    return new Promise((resolve) => {
      const tx = this.db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  }
  /** Purge all stale entries (older than MAX_AGE_MS). */
  async purgeStale() {
    if (!this.db) return 0;
    return new Promise((resolve) => {
      const cutoff = Date.now() - MAX_AGE_MS;
      const tx = this.db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const index = store.index("updated_at");
      const range = IDBKeyRange.upperBound(cutoff);
      const request = index.openCursor(range);
      let count = 0;
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          count++;
          cursor.continue();
        } else {
          resolve(count);
        }
      };
      request.onerror = () => resolve(0);
    });
  }
  /** Close the database connection. */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
};

export {
  UploadResumeStore
};
