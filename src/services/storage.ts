/**
 * Storage Service Module
 *
 * 3-step presigned URL upload flow (hidden from developer):
 *   1. POST /signed-url/upload     → get presigned URL + file_id + token
 *   2. PUT  file to S3 presigned   → direct upload with progress tracking
 *   3. POST /signed-url/complete   → finalize, trigger scan
 *
 * Multipart upload flow (transparent, activated for files >= 8MB):
 *   1. POST /signed-url/multipart/start       → session + first part URLs
 *   2. PUT  parts to S3 presigned             → parallel part uploads
 *   3. POST /signed-url/multipart/part-urls   → request more URLs as needed
 *   4. POST /signed-url/multipart/complete    → finalize multipart
 *
 * CloudFront signed URLs for access (transparent to SDK):
 *   - getViewUrl()       → inline display (img src, thumbnails)
 *   - getViewUrls()      → batch up to 100
 *   - getDownloadUrl()   → attachment download
 *
 * Scan status error codes:
 *   - file_scanning    (202) → retry later
 *   - file_threat      (403) → malware detected
 *   - file_quarantined (403) → quarantined for review
 */

import { ServiceModule } from '../service'
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types'
import { UploadTelemetry, generateUploadSessionId } from './upload-telemetry'

// ============================================================================
// Constants
// ============================================================================

/** Retry delays for direct S3 PUT (ms) */
const RETRY_DELAYS = [0, 1000, 3000]
/** HTTP status codes safe to retry */
const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504])
/** HTTP status codes that should NOT be retried */
const NON_RETRYABLE_STATUS_CODES = new Set([400, 403, 404, 413])
/** Default stall timeout (no progress for this long = stalled) */
const DEFAULT_STALL_TIMEOUT_MS = 45_000
/** Stall timeout for slow networks */
const SLOW_NETWORK_STALL_TIMEOUT_MS = 90_000
/** Multipart threshold: files >= this size use multipart */
const MULTIPART_THRESHOLD = 8 * 1024 * 1024 // 8MB
/** Multipart threshold on slow networks */
const MULTIPART_THRESHOLD_SLOW = 4 * 1024 * 1024 // 4MB

// ============================================================================
// Types
// ============================================================================

export interface UploadOptions {
  /** Display filename (sanitized automatically) */
  filename?: string
  /** Make file publicly accessible */
  isPublic?: boolean
  /** Custom metadata attached to the file */
  metadata?: Record<string, unknown>
  /** Upload progress callback (0-100) */
  onProgress?: (percent: number) => void
  /** AbortSignal for cancellation */
  signal?: AbortSignal
  /** Client context to forward end-user info (IP, UA, etc.) in server-to-server calls */
  clientContext?: import('../types').ClientContext
  /** Skip client-side image compression (default: false) */
  skipCompression?: boolean
  /** Compression configuration */
  compression?: Partial<CompressionConfig>
  /** Force multipart upload regardless of file size */
  forceMultipart?: boolean
  /** Resume behavior: 'auto' resumes from IndexedDB, 'off' disables (default: 'auto' in browser) */
  resume?: 'auto' | 'off'
  /** Chunk size in bytes for multipart upload */
  chunkSize?: number
  /** Max concurrent part uploads */
  maxConcurrency?: number
  /** Enable upload telemetry (default: true) */
  telemetry?: boolean
}

export interface CompressionConfig {
  /** Max width in pixels */
  maxWidth: number
  /** Max height in pixels */
  maxHeight: number
  /** JPEG/WebP quality 0-1 (default: 0.8) */
  quality: number
  /** Max file size in MB to target */
  maxSizeMB: number
}

export interface PresignedUploadResponse {
  file_id: string
  upload_url: string
  completion_token: string
  expires_at: string
  method: string
}

export interface UploadCompleteResponse {
  file_id: string
  filename: string
  size_bytes: number
  content_type: string
  url: string
  already_completed: boolean
  scan_queued: boolean
}

export interface MultipartStartResponse {
  upload_session_id: string
  file_id: string
  completion_token: string
  part_size_bytes: number
  total_parts: number
  part_urls: PartUrl[]
  expires_at: string
}

export interface PartUrl {
  part_number: number
  url: string
  expires_at: string
}

export interface MultipartPartUrlsResponse {
  part_urls: PartUrl[]
}

export interface MultipartCompleteResponse {
  file_id: string
  filename: string
  size_bytes: number
  content_type: string
  url: string
  scan_queued: boolean
}

export interface FileInfo {
  id: string
  filename: string
  content_type: string
  size_bytes: number
  is_public?: boolean
  url?: string
  scan_status?: string
  scanned_at?: string
  checksum?: string
  created_at: string
}

export interface SignedUrlResponse {
  url: string
  expires_at: string
}

// ============================================================================
// Storage Service
// ============================================================================

export class StorageService extends ServiceModule {
  protected basePath = '/v1/storage'
  private telemetry: UploadTelemetry | null = null

  // --------------------------------------------------------------------------
  // Upload (unified: direct PUT or multipart, transparent to caller)
  // --------------------------------------------------------------------------

  /**
   * Upload a file using the optimal strategy.
   *
   * Small files (< 8MB): 3-step presigned URL flow with retry + stall guard.
   * Large files (>= 8MB): Multipart with windowed presigns, resumable.
   *
   * @returns The completed file record with id, url, etc.
   */
  async upload(
    file: File | Blob,
    options?: UploadOptions,
  ): Promise<ApiResponse<FileInfo>> {
    // Check abort before starting
    if (options?.signal?.aborted) {
      return { data: null, error: { code: 'aborted', message: 'Upload aborted', status: 0 } }
    }

    const sessionId = generateUploadSessionId()
    const telemetryEnabled = options?.telemetry !== false
    const telemetry = telemetryEnabled ? this.getOrCreateTelemetry() : null
    const startTime = Date.now()

    telemetry?.emit(sessionId, 'upload.started', {
      size_bytes: file.size,
      content_type: file.type,
      strategy: this.shouldUseMultipart(file, options) ? 'multipart' : 'direct',
      network_type: getNetworkEffectiveType(),
    })

    try {
      // Attempt compression for browser image uploads
      let uploadFile: File | Blob = file
      if (!options?.skipCompression && typeof window !== 'undefined') {
        const compressed = await this.maybeCompress(file, options?.compression, sessionId, telemetry)
        if (compressed) uploadFile = compressed
      }

      // Route to multipart or direct
      if (this.shouldUseMultipart(uploadFile, options)) {
        return await this.uploadMultipart(uploadFile, options, sessionId, telemetry)
      }
      return await this.uploadDirect(uploadFile, options, sessionId, telemetry)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      telemetry?.emit(sessionId, 'upload.failed', { error: message, duration_ms: Date.now() - startTime })
      return { data: null, error: { code: 'upload_error', message, status: 0 } }
    }
  }

  // --------------------------------------------------------------------------
  // Direct Upload (3-step with retry + stall)
  // --------------------------------------------------------------------------

  private async uploadDirect(
    file: File | Blob,
    options: UploadOptions | undefined,
    sessionId: string,
    telemetry: UploadTelemetry | null,
  ): Promise<ApiResponse<FileInfo>> {
    const directStart = Date.now()
    const requestOpts: RequestOptions | undefined = this.withSessionHeader(sessionId, options)

    // Step 1: Get presigned upload URL
    const filename = options?.filename || (file as File).name || 'file'
    const initResult = await this.post<{
      file_id: string
      upload_url: string
      completion_token: string
      expires_at: string
    }>('/signed-url/upload', {
      filename,
      content_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      is_public: options?.isPublic ?? true,
      metadata: options?.metadata,
    }, requestOpts)

    if (initResult.error) {
      telemetry?.emit(sessionId, 'upload.failed', { step: 'presign', error: initResult.error.message })
      return { data: null, error: initResult.error } as ApiResponse<FileInfo>
    }

    const { file_id, upload_url, completion_token } = initResult.data!

    // Step 2: Upload directly to S3 with retry
    const uploadResult = await this.uploadToPresignedUrlWithRetry(
      upload_url,
      file,
      options?.onProgress,
      options?.signal,
      sessionId,
      telemetry,
    )

    if (uploadResult.error) {
      if (uploadResult.error.code === 'upload_stalled') {
        telemetry?.emit(sessionId, 'upload.stalled', { step: 's3_put', file_id })
      }
      telemetry?.emit(sessionId, 'upload.failed', {
        step: 's3_put',
        error: uploadResult.error.message,
        file_id,
        reason: uploadResult.error.code,
      })
      return { data: null, error: uploadResult.error } as ApiResponse<FileInfo>
    }

    // Step 3: Complete the upload
    const completeResult = await this.post<FileInfo>('/signed-url/complete', {
      file_id,
      completion_token,
    }, requestOpts)

    if (completeResult.error) {
      telemetry?.emit(sessionId, 'upload.failed', { step: 'complete', error: completeResult.error.message, file_id, duration_ms: Date.now() - directStart })
    } else {
      telemetry?.emit(sessionId, 'upload.completed', { file_id, size_bytes: file.size, duration_ms: Date.now() - directStart })
    }

    return completeResult
  }

  // --------------------------------------------------------------------------
  // Multipart Upload
  // --------------------------------------------------------------------------

  private async uploadMultipart(
    file: File | Blob,
    options: UploadOptions | undefined,
    sessionId: string,
    telemetry: UploadTelemetry | null,
  ): Promise<ApiResponse<FileInfo>> {
    const multipartStart = Date.now()
    const requestOpts: RequestOptions | undefined = this.withSessionHeader(sessionId, options)
    const filename = options?.filename || (file as File).name || 'file'

    telemetry?.emit(sessionId, 'upload.multipart.started', { size_bytes: file.size })

    // Attempt resume if available
    let resumeStore: import('./upload-resume').UploadResumeStore | null = null
    let resumeData: import('./upload-resume').ResumeSession | null = null
    if (options?.resume !== 'off' && typeof window !== 'undefined') {
      try {
        const { UploadResumeStore } = await import('./upload-resume')
        resumeStore = new UploadResumeStore()
        await resumeStore.open()
        const resumeKey = await UploadResumeStore.generateResumeKey(
          this.client.getApiKey?.() || '',
          this.client.getUserId?.() || '',
          filename,
          file.size,
          (file as File).lastModified,
        )
        resumeData = await resumeStore.get(resumeKey)
        if (resumeData) {
          telemetry?.emit(sessionId, 'upload.resumed', {
            original_session_id: resumeData.upload_session_id,
            completed_parts: resumeData.completed_parts.length,
            total_parts: resumeData.total_parts,
          })
        }
      } catch (err) {
        // Resume unavailable, proceed fresh
        telemetry?.emit(sessionId, 'upload.retried', { step: 'resume_load', error: err instanceof Error ? err.message : 'Resume store unavailable' })
        resumeStore = null
        resumeData = null
      }
    }

    // Step 1: Start multipart upload (or use resume data)
    let startData: MultipartStartResponse
    let completionToken: string
    let completedParts: Map<number, string> = new Map()

    if (resumeData) {
      // Resuming from previous session
      startData = {
        upload_session_id: resumeData.upload_session_id,
        file_id: resumeData.file_id,
        completion_token: '', // will request part URLs separately
        part_size_bytes: resumeData.part_size_bytes || this.defaultChunkSize(file.size),
        total_parts: resumeData.total_parts,
        part_urls: [],
        expires_at: '',
      }
      completionToken = resumeData.completion_token
      for (const part of resumeData.completed_parts) {
        completedParts.set(part.part_number, part.etag)
      }
    } else {
      // Generate client_upload_key for server-side idempotency
      let clientUploadKey: string | undefined
      try {
        const { UploadResumeStore } = await import('./upload-resume')
        clientUploadKey = await UploadResumeStore.generateResumeKey(
          this.client.getApiKey?.() || '',
          this.client.getUserId?.() || '',
          filename,
          file.size,
          (file as File).lastModified,
        )
      } catch {
        // Non-fatal: idempotency just won't be active
      }

      const startResult = await this.post<MultipartStartResponse>('/signed-url/multipart/start', {
        filename,
        content_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
        is_public: options?.isPublic ?? true,
        metadata: options?.metadata,
        chunk_size: options?.chunkSize,
        ...(clientUploadKey ? { client_upload_key: clientUploadKey } : {}),
      }, requestOpts)

      if (startResult.error) {
        telemetry?.emit(sessionId, 'upload.multipart.aborted', { error: startResult.error.message })
        return { data: null, error: startResult.error } as ApiResponse<FileInfo>
      }

      startData = startResult.data!
      completionToken = startData.completion_token
    }

    const { upload_session_id, file_id, part_size_bytes, total_parts } = startData

    // Save to resume store
    if (resumeStore && !resumeData) {
      try {
        const { UploadResumeStore } = await import('./upload-resume')
        const resumeKey = await UploadResumeStore.generateResumeKey(
          this.client.getApiKey?.() || '',
          this.client.getUserId?.() || '',
          filename,
          file.size,
          (file as File).lastModified,
        )
        await resumeStore.save(resumeKey, {
          upload_session_id,
          file_id,
          completion_token: completionToken,
          total_parts,
          part_size_bytes,
          completed_parts: [],
          created_at: Date.now(),
        })
      } catch (err) {
        telemetry?.emit(sessionId, 'upload.retried', { step: 'resume_save', error: err instanceof Error ? err.message : 'Resume save failed' })
      }
    }

    // Step 2: Upload parts with windowed presigns
    const maxConcurrency = options?.maxConcurrency || this.defaultConcurrency()
    let availableUrls: Map<number, PartUrl> = new Map()

    // Load initial URLs
    if (startData.part_urls.length > 0) {
      for (const pu of startData.part_urls) {
        availableUrls.set(pu.part_number, pu)
      }
    }

    // Build list of parts to upload
    const pendingParts: number[] = []
    for (let i = 1; i <= total_parts; i++) {
      if (!completedParts.has(i)) {
        pendingParts.push(i)
      }
    }

    let uploadedCount = completedParts.size
    let lastProgressMilestone = 0
    const reportProgress = () => {
      const percent = Math.round((uploadedCount / total_parts) * 100)
      if (options?.onProgress) {
        options.onProgress(percent)
      }
      // Emit upload.progress at 25/50/75% milestones
      const milestone = Math.floor(percent / 25) * 25
      if (milestone > lastProgressMilestone && milestone < 100) {
        telemetry?.emit(sessionId, 'upload.progress', { percent: milestone, uploaded_parts: uploadedCount, total_parts })
        lastProgressMilestone = milestone
      }
    }
    reportProgress()

    // Process parts in windows
    let partIndex = 0
    while (partIndex < pendingParts.length) {
      if (options?.signal?.aborted) {
        await this.abortMultipart(upload_session_id, completionToken, requestOpts)
        telemetry?.emit(sessionId, 'upload.aborted', { file_id })
        return { data: null, error: { code: 'aborted', message: 'Upload aborted', status: 0 } }
      }

      // Request more URLs if running low
      const remainingUrlCount = pendingParts.slice(partIndex).filter(p => availableUrls.has(p)).length
      if (remainingUrlCount <= 4) {
        const neededParts = pendingParts.slice(partIndex, partIndex + 16).filter(p => !availableUrls.has(p))
        if (neededParts.length > 0) {
          const urlResult = await this.post<MultipartPartUrlsResponse>(
            '/signed-url/multipart/part-urls',
            { upload_session_id, part_numbers: neededParts, completion_token: completionToken },
            requestOpts,
          )
          if (urlResult.data) {
            for (const pu of urlResult.data.part_urls) {
              availableUrls.set(pu.part_number, pu)
            }
          }
        }
      }

      // Upload a batch of concurrent parts
      const batch = pendingParts.slice(partIndex, partIndex + maxConcurrency)
      const batchPromises = batch.map(async (partNum) => {
        const partUrl = availableUrls.get(partNum)
        if (!partUrl) {
          // Fetch URL for this part
          const urlResult = await this.post<MultipartPartUrlsResponse>(
            '/signed-url/multipart/part-urls',
            { upload_session_id, part_numbers: [partNum], completion_token: completionToken },
            requestOpts,
          )
          if (!urlResult.data?.part_urls?.[0]) {
            return { partNum, error: 'Failed to get part URL' }
          }
          availableUrls.set(partNum, urlResult.data.part_urls[0])
        }

        const url = availableUrls.get(partNum)!.url
        const start = (partNum - 1) * part_size_bytes
        const end = Math.min(start + part_size_bytes, file.size)
        const partBlob = file.slice(start, end)

        // Upload part with retry
        const result = await this.uploadPartWithRetry(url, partBlob, options?.signal, partNum, sessionId, telemetry)
        if (result.error) {
          if (result.code === 'upload_stalled') {
            telemetry?.emit(sessionId, 'upload.stalled', { step: 'multipart_part', part_number: partNum })
          }
          telemetry?.emit(sessionId, 'upload.multipart.part_failed', {
            part_number: partNum,
            error: result.error,
            code: result.code,
          })
          // On signature expiry, try refreshing URL
          if (result.status === 403) {
            telemetry?.emit(sessionId, 'upload.multipart.url_refreshed', { part_number: partNum })
            const refreshResult = await this.post<MultipartPartUrlsResponse>(
              '/signed-url/multipart/part-urls',
              { upload_session_id, part_numbers: [partNum], completion_token: completionToken },
              requestOpts,
            )
            if (refreshResult.data?.part_urls?.[0]) {
              availableUrls.set(partNum, refreshResult.data.part_urls[0])
              const retryResult = await this.uploadPartWithRetry(
                refreshResult.data.part_urls[0].url,
                partBlob,
                options?.signal,
                partNum,
                sessionId,
                telemetry,
              )
              if (retryResult.etag) {
                return { partNum, etag: retryResult.etag }
              }
            }
          }
          return { partNum, error: result.error }
        }
        return { partNum, etag: result.etag }
      })

      const results = await Promise.all(batchPromises)

      for (const result of results) {
        if (result.etag) {
          completedParts.set(result.partNum, result.etag)
          uploadedCount++
          telemetry?.emit(sessionId, 'upload.multipart.part_completed', { part_number: result.partNum })

          // Update resume store
          if (resumeStore) {
            try {
              const { UploadResumeStore } = await import('./upload-resume')
              const resumeKey = await UploadResumeStore.generateResumeKey(
                this.client.getApiKey?.() || '',
                this.client.getUserId?.() || '',
                filename,
                file.size,
                (file as File).lastModified,
              )
              await resumeStore.updatePart(resumeKey, result.partNum, result.etag)
            } catch (err) {
              telemetry?.emit(sessionId, 'upload.retried', { step: 'resume_update', part_number: result.partNum, error: err instanceof Error ? err.message : 'Resume update failed' })
            }
          }
        } else {
          // Part failed (explicit error or missing etag)
          const errorMsg = result.error || 'Part upload returned no ETag'
          await this.abortMultipart(upload_session_id, completionToken, requestOpts)
          telemetry?.emit(sessionId, 'upload.multipart.aborted', { file_id, error: errorMsg })
          return {
            data: null,
            error: { code: 'upload_error', message: `Part ${result.partNum} failed: ${errorMsg}`, status: 0 },
          }
        }
      }

      reportProgress()
      partIndex += batch.length
    }

    // Step 3: Complete multipart
    const parts = Array.from(completedParts.entries())
      .sort(([a], [b]) => a - b)
      .map(([part_number, etag]) => ({ part_number, etag }))

    const completeResult = await this.post<MultipartCompleteResponse>(
      '/signed-url/multipart/complete',
      { upload_session_id, file_id, completion_token: completionToken, parts },
      requestOpts,
    )

    // Clean up resume store on success
    if (resumeStore) {
      try {
        const { UploadResumeStore } = await import('./upload-resume')
        const resumeKey = await UploadResumeStore.generateResumeKey(
          this.client.getApiKey?.() || '',
          this.client.getUserId?.() || '',
          filename,
          file.size,
          (file as File).lastModified,
        )
        await resumeStore.remove(resumeKey)
      } catch (err) {
        telemetry?.emit(sessionId, 'upload.retried', { step: 'resume_cleanup', error: err instanceof Error ? err.message : 'Resume cleanup failed' })
      }
    }

    if (completeResult.error) {
      telemetry?.emit(sessionId, 'upload.multipart.aborted', { file_id, error: completeResult.error.message, duration_ms: Date.now() - multipartStart })
      return { data: null, error: completeResult.error } as ApiResponse<FileInfo>
    }

    telemetry?.emit(sessionId, 'upload.multipart.completed', { file_id, size_bytes: file.size, duration_ms: Date.now() - multipartStart })
    telemetry?.emit(sessionId, 'upload.completed', { file_id, size_bytes: file.size, duration_ms: Date.now() - multipartStart })
    options?.onProgress?.(100)

    const d = completeResult.data!
    return {
      data: {
        id: d.file_id,
        filename: d.filename,
        content_type: d.content_type,
        size_bytes: d.size_bytes,
        url: d.url,
        created_at: new Date().toISOString(),
      },
      error: null,
    }
  }

  // --------------------------------------------------------------------------
  // Multipart Abort
  // --------------------------------------------------------------------------

  private async abortMultipart(uploadSessionId: string, completionToken?: string, requestOpts?: RequestOptions): Promise<void> {
    try {
      await this.post('/signed-url/multipart/abort', {
        upload_session_id: uploadSessionId,
        ...(completionToken ? { completion_token: completionToken } : {}),
      }, requestOpts)
    } catch {
      // Best-effort abort
    }
  }

  // --------------------------------------------------------------------------
  // Split Upload (server-side: presigned URL → client S3 upload → complete)
  // --------------------------------------------------------------------------

  /**
   * Get a presigned URL for direct upload to S3.
   * Use this when the browser uploads directly (with progress tracking)
   * and the server only brokers the URLs.
   *
   * Flow: server calls getUploadUrl() → returns URL to client → client PUTs to S3 → server calls completeUpload()
   */
  async getUploadUrl(
    filename: string,
    contentType: string,
    options?: { isPublic?: boolean; expiresIn?: number; metadata?: Record<string, unknown> },
    requestOptions?: RequestOptions,
  ): Promise<ApiResponse<PresignedUploadResponse>> {
    return this.post<PresignedUploadResponse>('/signed-url/upload', {
      filename,
      content_type: contentType,
      is_public: options?.isPublic ?? true,
      expires_in: options?.expiresIn ?? 3600,
      metadata: options?.metadata,
    }, requestOptions)
  }

  /**
   * Complete a presigned upload after the file has been uploaded to S3.
   * Triggers scan and makes the file available.
   */
  async completeUpload(
    fileId: string,
    completionToken: string,
    options?: { sizeBytes?: number; checksum?: string },
    requestOptions?: RequestOptions,
  ): Promise<ApiResponse<UploadCompleteResponse>> {
    return this.post<UploadCompleteResponse>('/signed-url/complete', {
      file_id: fileId,
      completion_token: completionToken,
      size_bytes: options?.sizeBytes,
      checksum: options?.checksum,
    }, requestOptions)
  }

  // --------------------------------------------------------------------------
  // Multipart Public API (for advanced/server-side usage)
  // --------------------------------------------------------------------------

  /** Start a multipart upload session. */
  async startMultipartUpload(
    params: {
      filename: string
      content_type: string
      size_bytes: number
      is_public?: boolean
      metadata?: Record<string, unknown>
      chunk_size?: number
    },
    requestOptions?: RequestOptions,
  ): Promise<ApiResponse<MultipartStartResponse>> {
    return this.post<MultipartStartResponse>('/signed-url/multipart/start', params, requestOptions)
  }

  /** Get presigned URLs for specific part numbers. */
  async getMultipartPartUrls(
    uploadSessionId: string,
    partNumbers: number[],
    completionToken?: string,
    requestOptions?: RequestOptions,
  ): Promise<ApiResponse<MultipartPartUrlsResponse>> {
    return this.post<MultipartPartUrlsResponse>('/signed-url/multipart/part-urls', {
      upload_session_id: uploadSessionId,
      part_numbers: partNumbers,
      ...(completionToken ? { completion_token: completionToken } : {}),
    }, requestOptions)
  }

  /** Complete a multipart upload. */
  async completeMultipartUpload(
    params: {
      upload_session_id: string
      file_id: string
      completion_token: string
      parts: Array<{ part_number: number; etag: string }>
    },
    requestOptions?: RequestOptions,
  ): Promise<ApiResponse<MultipartCompleteResponse>> {
    return this.post<MultipartCompleteResponse>('/signed-url/multipart/complete', params, requestOptions)
  }

  /** Abort a multipart upload. */
  async abortMultipartUpload(
    uploadSessionId: string,
    completionToken?: string,
    requestOptions?: RequestOptions,
  ): Promise<ApiResponse<{ aborted: boolean }>> {
    return this.post<{ aborted: boolean }>('/signed-url/multipart/abort', {
      upload_session_id: uploadSessionId,
      ...(completionToken ? { completion_token: completionToken } : {}),
    }, requestOptions)
  }

  // --------------------------------------------------------------------------
  // File Operations
  // --------------------------------------------------------------------------

  /** Get file metadata (no signed URL). */
  async getInfo(fileId: string, options?: RequestOptions): Promise<ApiResponse<FileInfo>> {
    return this._get<FileInfo>(`/files/${fileId}/info`, options)
  }

  /**
   * Get a signed view URL for inline display (img src, thumbnails).
   * Returns CloudFront signed URL (fast, ~1us) or S3 presigned fallback.
   */
  async getViewUrl(fileId: string, options?: RequestOptions): Promise<ApiResponse<SignedUrlResponse>> {
    return this.post<SignedUrlResponse>(`/signed-url/view/${fileId}`, {}, options)
  }

  /**
   * Get signed view URLs for multiple files (batch, up to 100).
   * Single network call, returns all URLs.
   * The shared `expires_at` is a conservative lower bound — reflects the shortest-lived
   * URL in the batch. Individual URLs may remain valid longer if their files are public.
   */
  async getViewUrls(fileIds: string[], options?: RequestOptions): Promise<ApiResponse<Record<string, SignedUrlResponse>>> {
    return this.post<Record<string, SignedUrlResponse>>('/signed-url/view-batch', { file_ids: fileIds }, options)
  }

  /**
   * Get a signed download URL (Content-Disposition: attachment).
   */
  async getDownloadUrl(fileId: string, options?: RequestOptions): Promise<ApiResponse<SignedUrlResponse>> {
    return this.post<SignedUrlResponse>(`/signed-url/download/${fileId}`, undefined, options)
  }

  /** Delete a file (soft delete). */
  async delete(fileId: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/files/${fileId}`, options)
  }

  /** List the current user's files (paginated). */
  async list(params?: PaginationParams, options?: RequestOptions): Promise<PaginatedResponse<FileInfo>> {
    return this.listMethod<FileInfo>('/my-files', params, options)
  }

  /** Check file view/access status. */
  async getViewStatus(fileId: string, options?: RequestOptions): Promise<ApiResponse<{ status: string; url?: string }>> {
    return this._get<{ status: string; url?: string }>(`/files/${fileId}/view-status`, options)
  }

  /**
   * Update a file's visibility (public/private).
   * Only the file owner can toggle this. Changes URL TTL — does not move the S3 object.
   * Public files get 7-day signed URLs; private files get 1-hour signed URLs.
   */
  async updateVisibility(fileId: string, isPublic: boolean, options?: RequestOptions): Promise<ApiResponse<{ file_id: string; is_public: boolean }>> {
    return this.patch<{ file_id: string; is_public: boolean }>(`/files/${fileId}/visibility`, { is_public: isPublic }, options)
  }

  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------

  /** @deprecated Use upload() instead */
  async uploadFile(
    file: File | Blob,
    options?: {
      is_public?: boolean
      metadata?: Record<string, unknown>
      onProgress?: (progress: number) => void
      signal?: AbortSignal
    },
  ) {
    return this.upload(file, {
      isPublic: options?.is_public,
      metadata: options?.metadata,
      onProgress: options?.onProgress,
      signal: options?.signal,
    })
  }

  /** @deprecated Use getInfo() instead */
  async getFile(id: string) {
    return this.getInfo(id)
  }

  /** @deprecated Use delete() instead */
  async deleteFile(id: string) {
    return this.delete(id)
  }

  /** @deprecated Use list() instead */
  async listFiles(params?: PaginationParams & { folder?: string }) {
    return this.list(params)
  }

  // --------------------------------------------------------------------------
  // Private: Upload to presigned URL with retry + stall guard
  // --------------------------------------------------------------------------

  private async uploadToPresignedUrlWithRetry(
    url: string,
    file: File | Blob,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
    sessionId?: string,
    telemetry?: UploadTelemetry | null,
  ): Promise<ApiResponse<null>> {
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (signal?.aborted) {
        return { data: null, error: { code: 'aborted', message: 'Upload aborted', status: 0 } }
      }

      // Wait for retry delay
      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt] ?? 0
        if (delay > 0) await sleep(delay)
        telemetry?.emit(sessionId || '', 'upload.retried', { attempt })
      }

      const result = await this.uploadToPresignedUrl(url, file, onProgress, signal)

      // Success
      if (!result.error) return result

      // Abort - don't retry
      if (result.error.code === 'aborted') return result

      // Non-retryable status
      if (result.error.status && NON_RETRYABLE_STATUS_CODES.has(result.error.status)) {
        return result
      }

      // Retryable status or network error (status 0)
      const isRetryable = result.error.status === 0 || RETRYABLE_STATUS_CODES.has(result.error.status)
      if (!isRetryable || attempt === RETRY_DELAYS.length - 1) {
        return result
      }

      // Will retry
    }

    return { data: null, error: { code: 'upload_error', message: 'Upload failed after retries', status: 0 } }
  }

  /**
   * Upload file directly to S3 presigned URL.
   * Uses XHR for progress tracking in browser, fetch otherwise.
   * Includes stall detection.
   */
  private async uploadToPresignedUrl(
    url: string,
    file: File | Blob,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<ApiResponse<null>> {
    if (signal?.aborted) {
      return { data: null, error: { code: 'aborted', message: 'Upload aborted', status: 0 } }
    }

    // Use XHR for progress tracking in browser (also enables stall detection)
    if (typeof XMLHttpRequest !== 'undefined') {
      return this.uploadWithXHR(url, file, onProgress, signal)
    }

    // Fetch-based upload (Node.js / edge) with timeout
    const stallTimeout = DEFAULT_STALL_TIMEOUT_MS
    const controller = new AbortController()
    let parentSignalCleanup: (() => void) | undefined
    const combinedSignal = signal
      ? AbortSignal.any?.([signal, controller.signal]) ?? (() => {
          // Fallback: wire parent signal to controller when AbortSignal.any is unavailable
          const onAbort = () => controller.abort()
          signal.addEventListener('abort', onAbort, { once: true })
          parentSignalCleanup = () => signal.removeEventListener('abort', onAbort)
          return controller.signal
        })()
      : controller.signal

    const timer = setTimeout(() => controller.abort(), stallTimeout)

    try {
      const response = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        signal: combinedSignal,
      })

      clearTimeout(timer)
      parentSignalCleanup?.()

      if (!response.ok) {
        return {
          data: null,
          error: {
            code: 'upload_error',
            message: `S3 upload failed: ${response.status} ${response.statusText}`,
            status: response.status,
          },
        }
      }

      onProgress?.(100)
      return { data: null, error: null }
    } catch (err) {
      clearTimeout(timer)
      parentSignalCleanup?.()

      if (signal?.aborted) {
        return { data: null, error: { code: 'aborted', message: 'Upload aborted', status: 0 } }
      }
      const isStall = controller.signal.aborted && !signal?.aborted
      return {
        data: null,
        error: {
          code: isStall ? 'upload_stalled' : 'upload_error',
          message: isStall
            ? `Upload stalled (no progress for ${stallTimeout / 1000}s)`
            : (err instanceof Error ? err.message : 'S3 upload failed'),
          status: 0,
        },
      }
    }
  }

  private uploadWithXHR(
    url: string,
    file: File | Blob,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<ApiResponse<null>> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()
      const stallTimeout = getStallTimeout()
      let stallTimer: ReturnType<typeof setTimeout> | null = null

      const resetStallTimer = () => {
        if (stallTimer !== null) clearTimeout(stallTimer)
        stallTimer = setTimeout(() => {
          xhr.abort()
          resolve({
            data: null,
            error: {
              code: 'upload_stalled',
              message: `Upload stalled (no progress for ${stallTimeout / 1000}s)`,
              status: 0,
            },
          })
        }, stallTimeout)
      }

      const clearStallTimer = () => {
        if (stallTimer !== null) {
          clearTimeout(stallTimer)
          stallTimer = null
        }
      }

      if (signal) {
        if (signal.aborted) {
          resolve({ data: null, error: { code: 'aborted', message: 'Upload aborted', status: 0 } })
          return
        }
        signal.addEventListener('abort', () => {
          clearStallTimer()
          xhr.abort()
        }, { once: true })
      }

      xhr.upload.addEventListener('progress', (event) => {
        resetStallTimer()
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100))
        }
      })

      xhr.addEventListener('load', () => {
        clearStallTimer()
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100)
          resolve({ data: null, error: null })
        } else {
          resolve({
            data: null,
            error: {
              code: 'upload_error',
              message: `S3 upload failed: ${xhr.status}`,
              status: xhr.status,
            },
          })
        }
      })

      xhr.addEventListener('error', () => {
        clearStallTimer()
        resolve({
          data: null,
          error: { code: 'upload_error', message: 'S3 upload failed', status: 0 },
        })
      })

      xhr.addEventListener('abort', () => {
        clearStallTimer()
        if (!signal?.aborted) return // stall handler already resolved
        resolve({
          data: null,
          error: { code: 'aborted', message: 'Upload aborted', status: 0 },
        })
      })

      xhr.open('PUT', url)
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
      xhr.send(file)
      resetStallTimer()
    })
  }

  // --------------------------------------------------------------------------
  // Private: Part upload with retry
  // --------------------------------------------------------------------------

  private async uploadPartWithRetry(
    url: string,
    blob: Blob,
    signal?: AbortSignal,
    partNumber?: number,
    sessionId?: string,
    telemetry?: UploadTelemetry | null,
  ): Promise<{ etag?: string; error?: string; status?: number; code?: string }> {
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (signal?.aborted) return { error: 'Upload aborted', code: 'aborted' }

      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt] ?? 0
        if (delay > 0) await sleep(delay)
        telemetry?.emit(sessionId || '', 'upload.retried', { attempt, part_number: partNumber })
      }

      const controller = new AbortController()
      let partSignalCleanup: (() => void) | undefined
      const combinedSignal = signal
        ? AbortSignal.any?.([signal, controller.signal]) ?? (() => {
            const onAbort = () => controller.abort()
            signal.addEventListener('abort', onAbort, { once: true })
            partSignalCleanup = () => signal.removeEventListener('abort', onAbort)
            return controller.signal
          })()
        : controller.signal

      const timer = setTimeout(() => controller.abort(), DEFAULT_STALL_TIMEOUT_MS)

      try {
        const response = await fetch(url, {
          method: 'PUT',
          body: blob,
          signal: combinedSignal,
        })

        clearTimeout(timer)
        partSignalCleanup?.()

        if (response.ok) {
          const etag = response.headers.get('etag')
          if (!etag) {
            // Missing ETag is a retryable failure — S3 should always return one
            if (attempt === RETRY_DELAYS.length - 1) {
              return { error: 'Part upload succeeded but ETag missing — cannot verify integrity', code: 's3_error' }
            }
            continue // retry
          }
          return { etag }
        }

        if (NON_RETRYABLE_STATUS_CODES.has(response.status)) {
          return { error: `Part upload failed: ${response.status}`, status: response.status, code: 's3_error' }
        }

        if (attempt === RETRY_DELAYS.length - 1) {
          return { error: `Part upload failed after retries: ${response.status}`, status: response.status, code: 's3_error' }
        }
      } catch (err) {
        clearTimeout(timer)
        partSignalCleanup?.()
        if (signal?.aborted) return { error: 'Upload aborted', code: 'aborted' }
        const isStall = controller.signal.aborted && !signal?.aborted
        if (attempt === RETRY_DELAYS.length - 1) {
          return {
            error: isStall
              ? `Part upload stalled (no progress for ${DEFAULT_STALL_TIMEOUT_MS / 1000}s)`
              : (err instanceof Error ? err.message : 'Part upload failed'),
            code: isStall ? 'upload_stalled' : 'network_error',
          }
        }
      }
    }

    return { error: 'Part upload failed after retries', code: 'network_error' }
  }

  // --------------------------------------------------------------------------
  // Private: Helpers
  // --------------------------------------------------------------------------

  private shouldUseMultipart(file: File | Blob, options?: UploadOptions): boolean {
    if (options?.forceMultipart) return true
    const threshold = isSlowNetwork() ? MULTIPART_THRESHOLD_SLOW : MULTIPART_THRESHOLD
    return file.size >= threshold
  }

  private defaultChunkSize(fileSize: number): number {
    if (fileSize > 512 * 1024 * 1024) return 16 * 1024 * 1024 // 16MB for >512MB files
    const effectiveType = getNetworkEffectiveType()
    if (effectiveType === 'slow-2g' || effectiveType === '2g') return 5 * 1024 * 1024
    if (effectiveType === '3g') return 5 * 1024 * 1024
    return 8 * 1024 * 1024 // 8MB default
  }

  private defaultConcurrency(): number {
    const effectiveType = getNetworkEffectiveType()
    if (effectiveType === 'slow-2g' || effectiveType === '2g') return 1
    if (effectiveType === '3g') return 2
    return 4
  }

  private async maybeCompress(
    file: File | Blob,
    config: Partial<CompressionConfig> | undefined,
    sessionId: string,
    telemetry: UploadTelemetry | null,
  ): Promise<File | Blob | null> {
    try {
      const { maybeCompressImage } = await import('./upload-compression')
      return await maybeCompressImage(file, config, sessionId, telemetry)
    } catch {
      return null
    }
  }

  private getOrCreateTelemetry(): UploadTelemetry {
    if (!this.telemetry) {
      this.telemetry = new UploadTelemetry(this.client)
    }
    return this.telemetry
  }

  /** Build RequestOptions with X-Upload-Session-Id header for cross-boundary correlation */
  private withSessionHeader(sessionId: string, options?: UploadOptions): RequestOptions | undefined {
    const headers: Record<string, string> = { 'X-Upload-Session-Id': sessionId }
    if (options?.clientContext) {
      return { clientContext: options.clientContext, headers }
    }
    return { headers }
  }

  /**
   * Use ServiceModule's list method but with a cleaner name internally
   * (can't call protected `list` from public method with same name).
   */
  private listMethod<T>(
    path: string,
    params?: PaginationParams & Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<PaginatedResponse<T>> {
    return super._list<T>(path, params, options)
  }
}

// ============================================================================
// Module-level helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getStallTimeout(): number {
  return isSlowNetwork() ? SLOW_NETWORK_STALL_TIMEOUT_MS : DEFAULT_STALL_TIMEOUT_MS
}

function isSlowNetwork(): boolean {
  const effectiveType = getNetworkEffectiveType()
  return effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g'
}

function getNetworkEffectiveType(): string {
  if (typeof navigator !== 'undefined' && 'connection' in navigator) {
    const conn = (navigator as unknown as { connection?: { effectiveType?: string } }).connection
    return conn?.effectiveType || '4g'
  }
  return '4g'
}
