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

import { ServiceModule } from '../service';
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types';
import { UploadTelemetry, generateUploadSessionId } from './upload-telemetry';

// ============================================================================
// Constants
// ============================================================================

/** Retry delays for direct S3 PUT (ms) */
const RETRY_DELAYS = [0, 1000, 3000];
/** HTTP status codes safe to retry */
const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504]);
/** HTTP status codes that should NOT be retried */
const NON_RETRYABLE_STATUS_CODES = new Set([400, 403, 404, 413]);
/** Default stall timeout (no progress for this long = stalled) */
const DEFAULT_STALL_TIMEOUT_MS = 45_000;
/** Stall timeout for slow networks */
const SLOW_NETWORK_STALL_TIMEOUT_MS = 90_000;
/** Multipart threshold: files >= this size use multipart */
const MULTIPART_THRESHOLD = 8 * 1024 * 1024; // 8MB
/** Multipart threshold on slow networks */
const MULTIPART_THRESHOLD_SLOW = 4 * 1024 * 1024; // 4MB

// ============================================================================
// Types
// ============================================================================

/**
 * Tri-state file visibility — replaces the overloaded `isPublic`
 * boolean. Three modes, ordered most-restrictive to most-permissive:
 *
 *   - `'private'`           — signed/private access only. Owner +
 *                             app members only.
 *   - `'app_public'`        — readable by ANY authenticated end-user
 *                             inside the same application. Same
 *                             semantics the legacy `isPublic: true`
 *                             flag has always carried — NOT
 *                             world-readable.
 *   - `'anonymous_visible'` — world-readable on a separate public
 *                             CDN with no auth at request time.
 *                             Suitable for direct `<img src="…">` use
 *                             on a logged-out marketing or blog page.
 *                             Must be requested explicitly — never
 *                             derived from `isPublic`.
 *
 * The storage service backs `anonymous_visible` with a separate S3
 * bucket fronted by an unsigned CloudFront distribution. When the
 * environment hasn't provisioned that bucket, `anonymous_visible`
 * uploads fail loud with HTTP 503 `ANONYMOUS_DELIVERY_NOT_CONFIGURED`
 * — the SDK never silently demotes them to `app_public`.
 */
export type Visibility = 'private' | 'app_public' | 'anonymous_visible';

export interface UploadOptions {
  /** Display filename (sanitized automatically) */
  filename?: string;
  /**
   * Tri-state visibility (preferred — see {@link Visibility}).
   * If both `visibility` and `isPublic` are provided, `visibility`
   * wins. If neither is provided, the storage service defaults to
   * `app_public` (matching the historical pre-tristate wire
   * contract). Callers wanting world-visible uploads MUST pass
   * `'anonymous_visible'` explicitly — `isPublic: true` only ever
   * means `app_public`.
   */
  visibility?: Visibility;
  /**
   * Legacy two-state visibility flag.
   *
   * - `true`  → `app_public`  (NOT `anonymous_visible`)
   * - `false` → `private`
   *
   * Prefer the {@link visibility} field for new code. Kept for
   * back-compat with apps that haven't migrated.
   */
  isPublic?: boolean;
  /** Custom metadata attached to the file */
  metadata?: Record<string, unknown>;
  /** Upload progress callback (0-100) */
  onProgress?: (percent: number) => void;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Client context to forward end-user info (IP, UA, etc.) in server-to-server calls */
  clientContext?: import('../types').ClientContext;
  /** Skip client-side image compression (default: false) */
  skipCompression?: boolean;
  /** Compression configuration */
  compression?: Partial<CompressionConfig>;
  /** Force multipart upload regardless of file size */
  forceMultipart?: boolean;
  /** Resume behavior: 'auto' resumes from IndexedDB, 'off' disables (default: 'auto' in browser) */
  resume?: 'auto' | 'off';
  /** Chunk size in bytes for multipart upload */
  chunkSize?: number;
  /** Max concurrent part uploads */
  maxConcurrency?: number;
  /** Enable upload telemetry (default: true) */
  telemetry?: boolean;
}

export interface CompressionConfig {
  /** Max width in pixels */
  maxWidth: number;
  /** Max height in pixels */
  maxHeight: number;
  /** JPEG/WebP quality 0-1 (default: 0.8) */
  quality: number;
  /** Max file size in MB to target */
  maxSizeMB: number;
}

export interface PresignedUploadResponse {
  file_id: string;
  upload_url: string;
  completion_token: string;
  expires_at: string;
  method: string;
  /**
   * Resolved visibility for this upload — may differ from the value
   * the caller sent (e.g. legacy `is_public: true` → `app_public`).
   * Returned by storage so the SDK can surface back to callers.
   */
  visibility?: Visibility;
  /**
   * Stable unsigned CDN URL the file will be served at after upload
   * completion. Populated only when `visibility === 'anonymous_visible'`.
   * Safe to embed directly in `<img src>` on a logged-out page.
   */
  cdn_url?: string;
}

export interface UploadCompleteResponse {
  file_id: string;
  filename: string;
  size_bytes: number;
  content_type: string;
  url: string;
  already_completed: boolean;
  scan_queued: boolean;
  /** Resolved visibility (see {@link PresignedUploadResponse.visibility}). */
  visibility?: Visibility;
  /** Unsigned CDN URL — populated only for `anonymous_visible` files. */
  cdn_url?: string;
}

export interface UploadFailureReport {
  fileId: string;
  completionToken: string;
  step: string;
  errorCode: string;
  errorMessage?: string;
  httpStatus?: number;
  attempt?: number;
  diagnostics?: Record<string, unknown>;
}

export interface UploadFailureReportResponse {
  file_id: string;
  recorded: boolean;
  upload_status: string;
}

export interface MultipartStartResponse {
  upload_session_id: string;
  file_id: string;
  completion_token: string;
  part_size_bytes: number;
  total_parts: number;
  part_urls: PartUrl[];
  expires_at: string;
}

export interface PartUrl {
  part_number: number;
  url: string;
  expires_at: string;
}

export interface MultipartPartUrlsResponse {
  part_urls: PartUrl[];
}

export interface MultipartCompleteResponse {
  file_id: string;
  filename: string;
  size_bytes: number;
  content_type: string;
  url: string;
  scan_queued: boolean;
  /** Resolved visibility — present on multipart_complete responses. */
  visibility?: Visibility;
  /** Unsigned CDN URL — populated only for `anonymous_visible` files. */
  cdn_url?: string;
}

export interface FileInfo {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  is_public?: boolean;
  /**
   * Tri-state visibility from the storage service. Preferred over
   * `is_public` — `is_public: true` covers both `app_public` and
   * `anonymous_visible`, which have very different delivery
   * contracts.
   */
  visibility?: Visibility;
  /**
   * Bucket the file's bytes live in. For `anonymous_visible` files
   * this is the storage anonymous bucket; otherwise the standard
   * `scalemule-storage*` bucket. Empty string when older storage
   * instances don't return it — callers should treat that as
   * "primary bucket".
   */
  bucket_name?: string;
  /**
   * Stable unsigned public-CDN URL — populated only when
   * `visibility === 'anonymous_visible'`. Drop directly into
   * `<img src>` on logged-out pages. For private/app_public files
   * use {@link StorageService.getViewUrl} or
   * {@link StorageService.getDownloadUrl} instead.
   */
  cdn_url?: string;
  url?: string;
  scan_status?: string;
  scanned_at?: string;
  checksum?: string;
  created_at: string;
}

export interface SignedUrlResponse {
  url: string;
  expires_at: string;
}

/**
 * Per-app media-pipeline policy. Drives release-gating + processing
 * behavior. Orthogonal to `is_public`. Five modes — see
 * `docs/MEDIA-UPLOADS.md` and ADR-2026-04-26 for the full taxonomy.
 */
export type MediaPolicy = 'fast_trusted' | 'safe_visible' | 'safe_public' | 'moderated' | 'compliance';

/** Content-type allow/block policy for uploads. */
export interface ContentPolicy {
  mode: 'allow' | 'block' | 'none';
  allowed_types?: string[];
  blocked_extensions?: string[];
}

/**
 * Per-app storage + media settings. Returned by {@link StorageService.getSettings}
 * and accepted by {@link StorageService.updateSettings}.
 */
export interface StorageSettings {
  content_policy?: ContentPolicy;
  media_policy?: MediaPolicy;
  default_retention_hours?: number | null;
  max_retention_hours?: number | null;
  max_file_size_bytes?: number | null;
}

/**
 * Aggregate file status — returned by {@link StorageService.getFileStatus}.
 *
 * Foundational primitive for the chat / progressive media read side.
 * `optimize` and `transcode` are reserved for Phase 3 enrichment; until
 * filled, callers should attempt the constructed `urls.optimized` /
 * `urls.hls` directly (404 means pipeline still running).
 */
export interface FileStatus {
  file_id: string;
  mime_type: string;
  scan: {
    /** pending | scanning | clean | threat | error | quarantined */
    status: string;
    scanned_at?: string;
  };
  optimize: { status: string; breakpoints?: number[] } | null;
  transcode: { status: string; manifest_url?: string } | null;
  urls: {
    /**
     * Direct-to-CDN view URL (CloudFront-signed where configured,
     * S3-presigned otherwise). Absent when scan is `threat` /
     * `quarantined` / `error` — consumers render a blocked
     * placeholder when this is null + scan is non-clean.
     *
     * For `visibility = anonymous_visible` files, this field is
     * ALSO null until scan has flipped to `clean` — the
     * release-async carve-out only applies to auth-gated tiers,
     * since for anon files any URL is world-readable. Use
     * {@link cdn_url} (which has the same gate but is typed
     * specifically for the public-CDN case) to branch reliably.
     */
    original?: string;
    /** Gateway path for the photo transform — present only when the
     *  photo pipeline reports `optimize.status === 'done'` (image only). */
    optimized?: string;
    /** Gateway path for the HLS master playlist — present only when the
     *  transcode worker reports `transcode.status === 'done'` (video only). */
    hls?: string;
    /**
     * **Typed** unsigned public CDN URL — populated only when
     * `visibility === 'anonymous_visible'` AND scan has flipped to
     * `clean` (or admin-released). Lets polling consumers
     * (`useFileStatus()`) surface the public URL the moment it
     * becomes available without a separate `getInfo()` /
     * `list()` call. Mirrors the contract on
     * {@link FileInfo.cdn_url} and the upload-complete response.
     *
     * Polling pattern:
     * ```ts
     * while (true) {
     *   const r = await sm.storage.getFileStatus(fileId);
     *   if (r.data.urls.cdn_url) break;       // safe to publish
     *   if (['threat','quarantined','error'].includes(r.data.scan.status))
     *     break;                              // failed terminal
     *   await sleep(1000);
     * }
     * ```
     */
    cdn_url?: string;
  };
}

// ============================================================================
// Visibility wire helper
// ============================================================================

/**
 * Build the visibility-related fields the storage service expects on
 * upload-init requests (`/signed-url/upload`, `/signed-url/multipart/start`).
 *
 * Precedence (matches the storage service's resolver):
 *   1. Typed `options.visibility` wins outright.
 *   2. Otherwise, derive from legacy `options.isPublic`:
 *        true  → `app_public`
 *        false → `private`
 *   3. If neither is set, the storage service applies its own
 *      default (`app_public`, for wire-compat with pre-tristate
 *      callers). The SDK omits both fields in that case so the
 *      server-side default rules — sending an explicit value here
 *      would lock customers to whatever the SDK *thought* the
 *      default should be at the time it was published.
 *
 * The function emits BOTH `visibility` (typed, preferred) and
 * `is_public` (legacy) when possible — the storage service tolerates
 * both, with `visibility` winning. Older storage versions that don't
 * yet understand `visibility` see the legacy `is_public` field.
 */
function buildVisibilityWire(options: UploadOptions | undefined): Record<string, unknown> {
  if (!options) return {};
  if (options.visibility) {
    return {
      visibility: options.visibility,
      // Legacy field for old storage instances that haven't deployed
      // the tristate handler yet — omit `is_public` for the
      // `anonymous_visible` case so an old server that doesn't know
      // the new value at least falls through to its own default
      // rather than mis-treating it as `app_public`.
      ...(options.visibility === 'private'
        ? { is_public: false }
        : options.visibility === 'app_public'
          ? { is_public: true }
          : {})
    };
  }
  if (typeof options.isPublic === 'boolean') {
    return { is_public: options.isPublic };
  }
  return {};
}

// ============================================================================
// Storage Service
// ============================================================================

export class StorageService extends ServiceModule {
  protected basePath = '/v1/storage';
  private telemetry: UploadTelemetry | null = null;

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
  async upload(file: File | Blob, options?: UploadOptions): Promise<ApiResponse<FileInfo>> {
    // Check abort before starting
    if (options?.signal?.aborted) {
      return { data: null, error: { code: 'aborted', message: 'Upload aborted', status: 0 } };
    }

    const sessionId = generateUploadSessionId();
    const telemetryEnabled = options?.telemetry !== false;
    const telemetry = telemetryEnabled ? this.getOrCreateTelemetry() : null;
    const startTime = Date.now();

    telemetry?.emit(sessionId, 'upload.started', {
      size_bytes: file.size,
      content_type: file.type,
      strategy: this.shouldUseMultipart(file, options) ? 'multipart' : 'direct',
      network_type: getNetworkEffectiveType()
    });

    try {
      // Attempt compression for browser image uploads
      let uploadFile: File | Blob = file;
      if (!options?.skipCompression && typeof window !== 'undefined') {
        const compressed = await this.maybeCompress(file, options?.compression, sessionId, telemetry);
        if (compressed) uploadFile = compressed;
      }

      // Route to multipart or direct
      if (this.shouldUseMultipart(uploadFile, options)) {
        return await this.uploadMultipart(uploadFile, options, sessionId, telemetry);
      }
      return await this.uploadDirect(uploadFile, options, sessionId, telemetry);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      telemetry?.emit(sessionId, 'upload.failed', { error: message, duration_ms: Date.now() - startTime });
      return { data: null, error: { code: 'upload_error', message, status: 0 } };
    }
  }

  /**
   * Upload a file as a private attachment (e.g. chat / DM attachment).
   *
   * Same browser→S3 pipeline as {@link upload}, but enforces:
   *   - `is_public: false` — caller cannot opt out
   *   - no client-side compression — preserve the original bytes
   *   - fail-closed if storage returns `is_public: true` for any reason
   *
   * The shared primitive used by `@scalemule/chat`'s chat-attachment uploader
   * and by `@scalemule/nextjs`'s `useMedia()` when an app's media policy is
   * `fast_trusted`. Both packages call this method via `@scalemule/sdk` —
   * `@scalemule/nextjs` does not depend on `@scalemule/chat`.
   *
   * See ADR-2026-04-26 (realtime-chat media pipeline) and
   * docs/MEDIA-UPLOADS.md for the full pattern.
   */
  async uploadPrivate(
    file: File | Blob,
    options?: Omit<UploadOptions, 'isPublic' | 'skipCompression'>
  ): Promise<ApiResponse<FileInfo>> {
    const result = await this.upload(file, {
      ...options,
      isPublic: false,
      skipCompression: true
    });

    // Defense-in-depth: never propagate a public file from this entry point,
    // even if the service erroneously flips visibility somewhere downstream.
    if (result.data && result.data.is_public === true) {
      return {
        data: null,
        error: {
          code: 'visibility_violation',
          message:
            'Storage returned is_public=true for an uploadPrivate() call. ' +
            'This usually indicates a server-side bug or an admin override; ' +
            'the caller asked for a private upload.',
          status: 0
        }
      };
    }

    return result;
  }

  /**
   * Upload a file as world-readable on the anonymous public CDN.
   *
   * Same browser→S3 pipeline as {@link upload}, but pins
   * `visibility: 'anonymous_visible'` — caller cannot opt out.
   *
   * Use this for media meant to render on logged-out marketing
   * pages, blog posts, embed snippets — anywhere a customer needs
   * to drop a URL into `<img src>` without an authenticated
   * session. For everything else (chat attachments, private
   * uploads, app-internal galleries) prefer {@link upload} or
   * {@link uploadPrivate}.
   *
   * **`cdn_url` may be `null` on the immediate response.** Storage
   * intentionally withholds the public CDN URL until the AV scan
   * has flipped to `clean` — exposing the URL pre-scan would let a
   * customer embed the bytes in a logged-out page before the
   * platform has verified them. The upload itself succeeds
   * regardless; consumers should check `result.data.cdn_url` and:
   *   - if non-null → it's safe to publish
   *   - if null → poll {@link getFileStatus} on a small backoff
   *     until `urls.cdn_url` populates (or `scan.status` flips to
   *     `threat` / `quarantined` / `error` — terminal failure)
   *
   * Requires the operator to have provisioned the anonymous
   * delivery bucket + CDN. When they haven't, the storage service
   * returns 503 `ANONYMOUS_DELIVERY_NOT_CONFIGURED` (an error
   * propagated through this helper) — it never silently demotes
   * to `app_public`.
   */
  async uploadAnonymous(
    file: File | Blob,
    options?: Omit<UploadOptions, 'visibility' | 'isPublic'>
  ): Promise<ApiResponse<FileInfo>> {
    return this.upload(file, {
      ...options,
      visibility: 'anonymous_visible'
    });
  }

  // --------------------------------------------------------------------------
  // Direct Upload (3-step with retry + stall)
  // --------------------------------------------------------------------------

  private async uploadDirect(
    file: File | Blob,
    options: UploadOptions | undefined,
    sessionId: string,
    telemetry: UploadTelemetry | null
  ): Promise<ApiResponse<FileInfo>> {
    const directStart = Date.now();
    const requestOpts: RequestOptions | undefined = this.withSessionHeader(sessionId, options);

    // Step 1: Get presigned upload URL
    const filename = options?.filename || (file as File).name || 'file';
    const initResult = await this.post<{
      file_id: string;
      upload_url: string;
      completion_token: string;
      expires_at: string;
      visibility?: Visibility;
      cdn_url?: string;
    }>(
      '/signed-url/upload',
      {
        filename,
        content_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
        ...buildVisibilityWire(options),
        metadata: options?.metadata
      },
      requestOpts
    );

    if (initResult.error) {
      telemetry?.emit(sessionId, 'upload.failed', { step: 'presign', error: initResult.error.message });
      return { data: null, error: initResult.error } as ApiResponse<FileInfo>;
    }

    const { file_id, upload_url, completion_token } = initResult.data!;

    // Step 2: Upload directly to S3 with retry
    const uploadResult = await this.uploadToPresignedUrlWithRetry(
      upload_url,
      file,
      options?.onProgress,
      options?.signal,
      sessionId,
      telemetry
    );

    if (uploadResult.error) {
      if (uploadResult.error.code === 'upload_stalled') {
        telemetry?.emit(sessionId, 'upload.stalled', { step: 's3_put', file_id });
      }
      telemetry?.emit(sessionId, 'upload.failed', {
        step: 's3_put',
        error: uploadResult.error.message,
        file_id,
        reason: uploadResult.error.code
      });
      await this.reportUploadFailureBestEffort(
        {
          fileId: file_id,
          completionToken: completion_token,
          step: 's3_put',
          errorCode: uploadResult.error.code,
          errorMessage: uploadResult.error.message,
          httpStatus: uploadResult.error.status || undefined,
          attempt: asNumber(uploadResult.error.details?.attempt),
          diagnostics: {
            ...getUploadEnvironmentDiagnostics(),
            ...(uploadResult.error.details || {})
          }
        },
        requestOpts
      );
      return { data: null, error: uploadResult.error } as ApiResponse<FileInfo>;
    }

    // Step 3: Complete the upload.
    // The server returns `UploadCompleteResponse` (`file_id`, …); we
    // normalize to `FileInfo` (`id`, …) so downstream callers — notably
    // photo / video / audio `uploadViaStorage` which read `result.data.id`
    // — get a usable id. The multipart path does the same normalization
    // a few hundred lines below; without it here, every direct (small-file)
    // upload returns `id: undefined`, which then propagates into a
    // `photo.register({fileId: undefined})` POST that the photo service
    // rejects with 422 "missing field `file_id`".
    const completeResult = await this.post<UploadCompleteResponse>(
      '/signed-url/complete',
      {
        file_id,
        completion_token
      },
      requestOpts
    );

    if (completeResult.error) {
      telemetry?.emit(sessionId, 'upload.failed', {
        step: 'complete',
        error: completeResult.error.message,
        file_id,
        duration_ms: Date.now() - directStart
      });
      await this.reportUploadFailureBestEffort(
        {
          fileId: file_id,
          completionToken: completion_token,
          step: 'complete',
          errorCode: completeResult.error.code,
          errorMessage: completeResult.error.message,
          httpStatus: completeResult.error.status || undefined,
          diagnostics: {
            ...getUploadEnvironmentDiagnostics(),
            duration_ms: Date.now() - directStart
          }
        },
        requestOpts
      );
      return { data: null, error: completeResult.error };
    }

    telemetry?.emit(sessionId, 'upload.completed', {
      file_id,
      size_bytes: file.size,
      duration_ms: Date.now() - directStart
    });

    const d = completeResult.data!;
    return {
      data: {
        id: d.file_id,
        filename: d.filename,
        content_type: d.content_type,
        size_bytes: d.size_bytes,
        url: d.url,
        // Surface visibility + cdn_url all the way out so callers
        // can branch on visibility without a follow-up getInfo()
        // round-trip. Anonymous-visible callers especially need
        // `cdn_url` here to render the image immediately.
        visibility: d.visibility,
        cdn_url: d.cdn_url,
        is_public: d.visibility ? d.visibility !== 'private' : undefined,
        created_at: new Date().toISOString()
      },
      error: null
    };
  }

  // --------------------------------------------------------------------------
  // Multipart Upload
  // --------------------------------------------------------------------------

  private async uploadMultipart(
    file: File | Blob,
    options: UploadOptions | undefined,
    sessionId: string,
    telemetry: UploadTelemetry | null
  ): Promise<ApiResponse<FileInfo>> {
    const multipartStart = Date.now();
    const requestOpts: RequestOptions | undefined = this.withSessionHeader(sessionId, options);
    const filename = options?.filename || (file as File).name || 'file';

    telemetry?.emit(sessionId, 'upload.multipart.started', { size_bytes: file.size });

    // Attempt resume if available
    let resumeStore: import('./upload-resume').UploadResumeStore | null = null;
    let resumeData: import('./upload-resume').ResumeSession | null = null;
    if (options?.resume !== 'off' && typeof window !== 'undefined') {
      try {
        const { UploadResumeStore } = await import('./upload-resume');
        resumeStore = new UploadResumeStore();
        await resumeStore.open();
        const resumeKey = await UploadResumeStore.generateResumeKey(
          this.client.getApiKey?.() || '',
          this.client.getUserId?.() || '',
          filename,
          file.size,
          (file as File).lastModified
        );
        resumeData = await resumeStore.get(resumeKey);
        if (resumeData) {
          telemetry?.emit(sessionId, 'upload.resumed', {
            original_session_id: resumeData.upload_session_id,
            completed_parts: resumeData.completed_parts.length,
            total_parts: resumeData.total_parts
          });
        }
      } catch (err) {
        // Resume unavailable, proceed fresh
        telemetry?.emit(sessionId, 'upload.retried', {
          step: 'resume_load',
          error: err instanceof Error ? err.message : 'Resume store unavailable'
        });
        resumeStore = null;
        resumeData = null;
      }
    }

    // Step 1: Start multipart upload (or use resume data)
    let startData: MultipartStartResponse;
    let completionToken: string;
    const completedParts: Map<number, string> = new Map();

    if (resumeData) {
      // Resuming from previous session
      startData = {
        upload_session_id: resumeData.upload_session_id,
        file_id: resumeData.file_id,
        completion_token: '', // will request part URLs separately
        part_size_bytes: resumeData.part_size_bytes || this.defaultChunkSize(file.size),
        total_parts: resumeData.total_parts,
        part_urls: [],
        expires_at: ''
      };
      completionToken = resumeData.completion_token;
      for (const part of resumeData.completed_parts) {
        completedParts.set(part.part_number, part.etag);
      }
    } else {
      // Generate client_upload_key for server-side idempotency
      let clientUploadKey: string | undefined;
      try {
        const { UploadResumeStore } = await import('./upload-resume');
        clientUploadKey = await UploadResumeStore.generateResumeKey(
          this.client.getApiKey?.() || '',
          this.client.getUserId?.() || '',
          filename,
          file.size,
          (file as File).lastModified
        );
      } catch {
        // Non-fatal: idempotency just won't be active
      }

      const startResult = await this.post<MultipartStartResponse>(
        '/signed-url/multipart/start',
        {
          filename,
          content_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
          ...buildVisibilityWire(options),
          metadata: options?.metadata,
          chunk_size: options?.chunkSize,
          ...(clientUploadKey ? { client_upload_key: clientUploadKey } : {})
        },
        requestOpts
      );

      if (startResult.error) {
        telemetry?.emit(sessionId, 'upload.multipart.aborted', { error: startResult.error.message });
        return { data: null, error: startResult.error } as ApiResponse<FileInfo>;
      }

      startData = startResult.data!;
      completionToken = startData.completion_token;
    }

    const { upload_session_id, file_id, part_size_bytes, total_parts } = startData;

    // Save to resume store
    if (resumeStore && !resumeData) {
      try {
        const { UploadResumeStore } = await import('./upload-resume');
        const resumeKey = await UploadResumeStore.generateResumeKey(
          this.client.getApiKey?.() || '',
          this.client.getUserId?.() || '',
          filename,
          file.size,
          (file as File).lastModified
        );
        await resumeStore.save(resumeKey, {
          upload_session_id,
          file_id,
          completion_token: completionToken,
          total_parts,
          part_size_bytes,
          completed_parts: [],
          created_at: Date.now()
        });
      } catch (err) {
        telemetry?.emit(sessionId, 'upload.retried', {
          step: 'resume_save',
          error: err instanceof Error ? err.message : 'Resume save failed'
        });
      }
    }

    // Step 2: Upload parts with windowed presigns
    const maxConcurrency = options?.maxConcurrency || this.defaultConcurrency();
    const availableUrls: Map<number, PartUrl> = new Map();

    // Load initial URLs
    if (startData.part_urls.length > 0) {
      for (const pu of startData.part_urls) {
        availableUrls.set(pu.part_number, pu);
      }
    }

    // Build list of parts to upload
    const pendingParts: number[] = [];
    for (let i = 1; i <= total_parts; i++) {
      if (!completedParts.has(i)) {
        pendingParts.push(i);
      }
    }

    let uploadedCount = completedParts.size;
    let lastProgressMilestone = 0;
    const reportProgress = () => {
      const percent = Math.round((uploadedCount / total_parts) * 100);
      if (options?.onProgress) {
        options.onProgress(percent);
      }
      // Emit upload.progress at 25/50/75% milestones
      const milestone = Math.floor(percent / 25) * 25;
      if (milestone > lastProgressMilestone && milestone < 100) {
        telemetry?.emit(sessionId, 'upload.progress', {
          percent: milestone,
          uploaded_parts: uploadedCount,
          total_parts
        });
        lastProgressMilestone = milestone;
      }
    };
    reportProgress();

    // Process parts in windows
    let partIndex = 0;
    while (partIndex < pendingParts.length) {
      if (options?.signal?.aborted) {
        await this.abortMultipart(upload_session_id, completionToken, requestOpts);
        telemetry?.emit(sessionId, 'upload.aborted', { file_id });
        await this.reportUploadFailureBestEffort(
          {
            fileId: file_id,
            completionToken,
            step: 'multipart_abort',
            errorCode: 'aborted',
            errorMessage: 'Upload aborted',
            diagnostics: getUploadEnvironmentDiagnostics()
          },
          requestOpts
        );
        return { data: null, error: { code: 'aborted', message: 'Upload aborted', status: 0 } };
      }

      // Request more URLs if running low
      const remainingUrlCount = pendingParts.slice(partIndex).filter((p) => availableUrls.has(p)).length;
      if (remainingUrlCount <= 4) {
        const neededParts = pendingParts.slice(partIndex, partIndex + 16).filter((p) => !availableUrls.has(p));
        if (neededParts.length > 0) {
          const urlResult = await this.post<MultipartPartUrlsResponse>(
            '/signed-url/multipart/part-urls',
            { upload_session_id, part_numbers: neededParts, completion_token: completionToken },
            requestOpts
          );
          if (urlResult.data) {
            for (const pu of urlResult.data.part_urls) {
              availableUrls.set(pu.part_number, pu);
            }
          }
        }
      }

      // Upload a batch of concurrent parts
      const batch = pendingParts.slice(partIndex, partIndex + maxConcurrency);
      const batchPromises = batch.map(async (partNum) => {
        const partUrl = availableUrls.get(partNum);
        if (!partUrl) {
          // Fetch URL for this part
          const urlResult = await this.post<MultipartPartUrlsResponse>(
            '/signed-url/multipart/part-urls',
            { upload_session_id, part_numbers: [partNum], completion_token: completionToken },
            requestOpts
          );
          if (!urlResult.data?.part_urls?.[0]) {
            return { partNum, error: 'Failed to get part URL' };
          }
          availableUrls.set(partNum, urlResult.data.part_urls[0]);
        }

        const url = availableUrls.get(partNum)!.url;
        const start = (partNum - 1) * part_size_bytes;
        const end = Math.min(start + part_size_bytes, file.size);
        const partBlob = file.slice(start, end);

        // Upload part with retry
        const result = await this.uploadPartWithRetry(url, partBlob, options?.signal, partNum, sessionId, telemetry);
        if (result.error) {
          if (result.code === 'upload_stalled') {
            telemetry?.emit(sessionId, 'upload.stalled', { step: 'multipart_part', part_number: partNum });
          }
          telemetry?.emit(sessionId, 'upload.multipart.part_failed', {
            part_number: partNum,
            error: result.error,
            code: result.code
          });
          // On signature expiry, try refreshing URL
          if (result.status === 403) {
            telemetry?.emit(sessionId, 'upload.multipart.url_refreshed', { part_number: partNum });
            const refreshResult = await this.post<MultipartPartUrlsResponse>(
              '/signed-url/multipart/part-urls',
              { upload_session_id, part_numbers: [partNum], completion_token: completionToken },
              requestOpts
            );
            if (refreshResult.data?.part_urls?.[0]) {
              availableUrls.set(partNum, refreshResult.data.part_urls[0]);
              const retryResult = await this.uploadPartWithRetry(
                refreshResult.data.part_urls[0].url,
                partBlob,
                options?.signal,
                partNum,
                sessionId,
                telemetry
              );
              if (retryResult.etag) {
                return { partNum, etag: retryResult.etag };
              }
            }
          }
          return { partNum, error: result.error };
        }
        return { partNum, etag: result.etag };
      });

      const results = await Promise.all(batchPromises);

      for (const result of results) {
        if (result.etag) {
          completedParts.set(result.partNum, result.etag);
          uploadedCount++;
          telemetry?.emit(sessionId, 'upload.multipart.part_completed', { part_number: result.partNum });

          // Update resume store
          if (resumeStore) {
            try {
              const { UploadResumeStore } = await import('./upload-resume');
              const resumeKey = await UploadResumeStore.generateResumeKey(
                this.client.getApiKey?.() || '',
                this.client.getUserId?.() || '',
                filename,
                file.size,
                (file as File).lastModified
              );
              await resumeStore.updatePart(resumeKey, result.partNum, result.etag);
            } catch (err) {
              telemetry?.emit(sessionId, 'upload.retried', {
                step: 'resume_update',
                part_number: result.partNum,
                error: err instanceof Error ? err.message : 'Resume update failed'
              });
            }
          }
        } else {
          // Part failed (explicit error or missing etag)
          const errorMsg = result.error || 'Part upload returned no ETag';
          await this.abortMultipart(upload_session_id, completionToken, requestOpts);
          telemetry?.emit(sessionId, 'upload.multipart.aborted', { file_id, error: errorMsg });
          await this.reportUploadFailureBestEffort(
            {
              fileId: file_id,
              completionToken,
              step: 'multipart_part',
              errorCode: 'upload_error',
              errorMessage: errorMsg,
              diagnostics: {
                ...getUploadEnvironmentDiagnostics(),
                part_number: result.partNum
              }
            },
            requestOpts
          );
          return {
            data: null,
            error: { code: 'upload_error', message: `Part ${result.partNum} failed: ${errorMsg}`, status: 0 }
          };
        }
      }

      reportProgress();
      partIndex += batch.length;
    }

    // Step 3: Complete multipart
    const parts = Array.from(completedParts.entries())
      .sort(([a], [b]) => a - b)
      .map(([part_number, etag]) => ({ part_number, etag }));

    const completeResult = await this.post<MultipartCompleteResponse>(
      '/signed-url/multipart/complete',
      { upload_session_id, file_id, completion_token: completionToken, parts },
      requestOpts
    );

    // Clean up resume store on success
    if (resumeStore) {
      try {
        const { UploadResumeStore } = await import('./upload-resume');
        const resumeKey = await UploadResumeStore.generateResumeKey(
          this.client.getApiKey?.() || '',
          this.client.getUserId?.() || '',
          filename,
          file.size,
          (file as File).lastModified
        );
        await resumeStore.remove(resumeKey);
      } catch (err) {
        telemetry?.emit(sessionId, 'upload.retried', {
          step: 'resume_cleanup',
          error: err instanceof Error ? err.message : 'Resume cleanup failed'
        });
      }
    }

    if (completeResult.error) {
      telemetry?.emit(sessionId, 'upload.multipart.aborted', {
        file_id,
        error: completeResult.error.message,
        duration_ms: Date.now() - multipartStart
      });
      await this.reportUploadFailureBestEffort(
        {
          fileId: file_id,
          completionToken,
          step: 'multipart_complete',
          errorCode: completeResult.error.code,
          errorMessage: completeResult.error.message,
          httpStatus: completeResult.error.status || undefined,
          diagnostics: {
            ...getUploadEnvironmentDiagnostics(),
            duration_ms: Date.now() - multipartStart
          }
        },
        requestOpts
      );
      return { data: null, error: completeResult.error } as ApiResponse<FileInfo>;
    }

    telemetry?.emit(sessionId, 'upload.multipart.completed', {
      file_id,
      size_bytes: file.size,
      duration_ms: Date.now() - multipartStart
    });
    telemetry?.emit(sessionId, 'upload.completed', {
      file_id,
      size_bytes: file.size,
      duration_ms: Date.now() - multipartStart
    });
    options?.onProgress?.(100);

    const d = completeResult.data!;
    return {
      data: {
        id: d.file_id,
        filename: d.filename,
        content_type: d.content_type,
        size_bytes: d.size_bytes,
        url: d.url,
        visibility: d.visibility,
        cdn_url: d.cdn_url,
        is_public: d.visibility ? d.visibility !== 'private' : undefined,
        created_at: new Date().toISOString()
      },
      error: null
    };
  }

  // --------------------------------------------------------------------------
  // Multipart Abort
  // --------------------------------------------------------------------------

  private async abortMultipart(
    uploadSessionId: string,
    completionToken?: string,
    requestOpts?: RequestOptions
  ): Promise<void> {
    try {
      await this.post(
        '/signed-url/multipart/abort',
        {
          upload_session_id: uploadSessionId,
          ...(completionToken ? { completion_token: completionToken } : {})
        },
        requestOpts
      );
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
    options?: {
      /** Tri-state visibility (preferred). See {@link Visibility}. */
      visibility?: Visibility;
      /** Legacy boolean. `true` → app_public, `false` → private. */
      isPublic?: boolean;
      expiresIn?: number;
      sizeBytes?: number;
      metadata?: Record<string, unknown>;
    },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<PresignedUploadResponse>> {
    return this.post<PresignedUploadResponse>(
      '/signed-url/upload',
      {
        filename,
        content_type: contentType,
        ...buildVisibilityWire(options as UploadOptions | undefined),
        expires_in: options?.expiresIn ?? 3600,
        size_bytes: options?.sizeBytes,
        metadata: options?.metadata
      },
      requestOptions
    );
  }

  /**
   * Complete a presigned upload after the file has been uploaded to S3.
   * Triggers scan and makes the file available.
   */
  async completeUpload(
    fileId: string,
    completionToken: string,
    options?: { sizeBytes?: number; checksum?: string },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<UploadCompleteResponse>> {
    return this.post<UploadCompleteResponse>(
      '/signed-url/complete',
      {
        file_id: fileId,
        completion_token: completionToken,
        size_bytes: options?.sizeBytes,
        checksum: options?.checksum
      },
      requestOptions
    );
  }

  /**
   * Persist a structured client-side upload failure against a file record.
   * Best used by split-upload clients that call getUploadUrl() manually.
   */
  async reportUploadFailure(
    params: UploadFailureReport,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<UploadFailureReportResponse>> {
    return this.post<UploadFailureReportResponse>(
      '/signed-url/report-failure',
      {
        file_id: params.fileId,
        completion_token: params.completionToken,
        step: params.step,
        error_code: params.errorCode,
        error_message: params.errorMessage,
        http_status: params.httpStatus,
        attempt: params.attempt,
        diagnostics: params.diagnostics
      },
      requestOptions
    );
  }

  // --------------------------------------------------------------------------
  // Multipart Public API (for advanced/server-side usage)
  // --------------------------------------------------------------------------

  /**
   * Start a multipart upload session.
   *
   * Accepts both the typed `visibility` field (preferred) and the
   * legacy `is_public` boolean for back-compat. If both are sent the
   * storage service uses `visibility`. `'anonymous_visible'` requires
   * the operator to have provisioned the anonymous bucket — the
   * service returns 503 `ANONYMOUS_DELIVERY_NOT_CONFIGURED`
   * otherwise (the SDK never silently demotes).
   */
  async startMultipartUpload(
    params: {
      filename: string;
      content_type: string;
      size_bytes: number;
      visibility?: Visibility;
      is_public?: boolean;
      metadata?: Record<string, unknown>;
      chunk_size?: number;
    },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<MultipartStartResponse>> {
    return this.post<MultipartStartResponse>('/signed-url/multipart/start', params, requestOptions);
  }

  /** Get presigned URLs for specific part numbers. */
  async getMultipartPartUrls(
    uploadSessionId: string,
    partNumbers: number[],
    completionToken?: string,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<MultipartPartUrlsResponse>> {
    return this.post<MultipartPartUrlsResponse>(
      '/signed-url/multipart/part-urls',
      {
        upload_session_id: uploadSessionId,
        part_numbers: partNumbers,
        ...(completionToken ? { completion_token: completionToken } : {})
      },
      requestOptions
    );
  }

  /** Complete a multipart upload. */
  async completeMultipartUpload(
    params: {
      upload_session_id: string;
      file_id: string;
      completion_token: string;
      parts: Array<{ part_number: number; etag: string }>;
    },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<MultipartCompleteResponse>> {
    return this.post<MultipartCompleteResponse>('/signed-url/multipart/complete', params, requestOptions);
  }

  /** Abort a multipart upload. */
  async abortMultipartUpload(
    uploadSessionId: string,
    completionToken?: string,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<{ aborted: boolean }>> {
    return this.post<{ aborted: boolean }>(
      '/signed-url/multipart/abort',
      {
        upload_session_id: uploadSessionId,
        ...(completionToken ? { completion_token: completionToken } : {})
      },
      requestOptions
    );
  }

  // --------------------------------------------------------------------------
  // File Operations
  // --------------------------------------------------------------------------

  /** Get file metadata (no signed URL). */
  async getInfo(fileId: string, options?: RequestOptions): Promise<ApiResponse<FileInfo>> {
    return this._get<FileInfo>(`/files/${fileId}/info`, options);
  }

  /**
   * Get the calling app's storage + media settings — content policy,
   * retention, max upload size, and the per-app `media_policy`.
   *
   * `media_policy` drives release-gating in the SDK upload helpers:
   * `fast_trusted` / `safe_visible` resolve immediately on upload; the
   * `safe_public` / `moderated` / `compliance` modes await pipeline
   * completion before resolving the upload promise.
   */
  async getSettings(options?: RequestOptions): Promise<ApiResponse<StorageSettings>> {
    return this._get<StorageSettings>('/settings', options);
  }

  /**
   * Update the calling app's storage + media settings. Admin-only on the
   * platform side (callers without the right role get 403).
   */
  async updateSettings(settings: StorageSettings, options?: RequestOptions): Promise<ApiResponse<StorageSettings>> {
    return this.put<StorageSettings>('/settings', settings, options);
  }

  /**
   * Aggregate status for a file — single call returns scan + reserved
   * optimize/transcode slots + the canonical view URL paths for image
   * (transform endpoint) and video (HLS playlist) MIME types.
   *
   * Foundational primitive for the chat / progressive media read side.
   * `useFileStatus()` (in `@scalemule/nextjs`) consumes this for both
   * first-paint and refresh-on-demand scenarios.
   *
   * `optimize` and `transcode` are reserved for Phase 3 enrichment. Until
   * the photo/video services expose internal status endpoints, callers
   * should attempt the constructed URLs directly to discover readiness
   * (404 means the pipeline is still running).
   *
   * @example
   * ```ts
   * const r = await client.storage.getFileStatus(fileId);
   * if (r.data?.scan.status === 'clean' && r.data.urls.optimized) {
   *   // image: try transform URL for an optimized variant
   * }
   * ```
   */
  async getFileStatus(fileId: string, options?: RequestOptions): Promise<ApiResponse<FileStatus>> {
    return this._get<FileStatus>(`/files/${fileId}/status`, options);
  }

  /**
   * Read the application's active media policy. Lightweight endpoint
   * (`GET /v1/storage/policy`) used by the SDK on boot to pick up the
   * platform-default `media_policy` without requiring app-admin auth.
   *
   * @example
   * ```ts
   * const { data } = await client.storage.getPolicy();
   * console.log(data?.media_policy); // 'safe_visible'
   * ```
   */
  async getPolicy(options?: RequestOptions): Promise<ApiResponse<{ media_policy: MediaPolicy }>> {
    return this._get<{ media_policy: MediaPolicy }>(`/policy`, options);
  }

  /**
   * Get a signed view URL for inline display (img src, thumbnails).
   * Returns CloudFront signed URL (fast, ~1us) or S3 presigned fallback.
   */
  async getViewUrl(fileId: string, options?: RequestOptions): Promise<ApiResponse<SignedUrlResponse>> {
    return this.post<SignedUrlResponse>(`/signed-url/view/${fileId}`, {}, options);
  }

  /**
   * Get signed view URLs for multiple files (batch, up to 100).
   * Single network call, returns all URLs.
   * The shared `expires_at` is a conservative lower bound — reflects the shortest-lived
   * URL in the batch. Individual URLs may remain valid longer if their files are public.
   */
  async getViewUrls(
    fileIds: string[],
    options?: RequestOptions
  ): Promise<ApiResponse<Record<string, SignedUrlResponse>>> {
    return this.post<Record<string, SignedUrlResponse>>('/signed-url/view-batch', { file_ids: fileIds }, options);
  }

  /**
   * Get a signed download URL (Content-Disposition: attachment).
   */
  async getDownloadUrl(fileId: string, options?: RequestOptions): Promise<ApiResponse<SignedUrlResponse>> {
    return this.post<SignedUrlResponse>(`/signed-url/download/${fileId}`, undefined, options);
  }

  /** Delete a file (soft delete). */
  async delete(fileId: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/files/${fileId}`, options);
  }

  /** List the current user's files (paginated). */
  async list(params?: PaginationParams, options?: RequestOptions): Promise<PaginatedResponse<FileInfo>> {
    return this.listMethod<FileInfo>('/my-files', params, options);
  }

  /** Check file view/access status. */
  async getViewStatus(
    fileId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ status: string; url?: string }>> {
    return this._get<{ status: string; url?: string }>(`/files/${fileId}/view-status`, options);
  }

  /**
   * Update a file's visibility.
   *
   * Accepts either:
   *   - a tri-state {@link Visibility} string (preferred), or
   *   - a legacy boolean (`true` → `app_public`, `false` → `private`).
   *
   * Only the file owner / app member can toggle this. Same-bucket
   * transitions (`private` ↔ `app_public`) succeed and the service
   * keeps the legacy `is_public` column in sync via a DB trigger.
   * Cross-bucket transitions (any flip into or out of
   * `'anonymous_visible'`) currently return 409
   * `VISIBILITY_TRANSITION_UNSUPPORTED` — the bytes would need to
   * move between S3 buckets and that orchestration is not yet
   * shipped. Re-upload the file with the desired visibility instead.
   */
  async updateVisibility(
    fileId: string,
    visibility: Visibility | boolean,
    options?: RequestOptions
  ): Promise<ApiResponse<{ file_id: string; visibility: Visibility; is_public: boolean }>> {
    const body =
      typeof visibility === 'boolean'
        ? { is_public: visibility }
        : { visibility };
    return this.patch<{ file_id: string; visibility: Visibility; is_public: boolean }>(
      `/files/${fileId}/visibility`,
      body,
      options
    );
  }

  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------

  /** @deprecated Use upload() instead */
  async uploadFile(
    file: File | Blob,
    options?: {
      is_public?: boolean;
      metadata?: Record<string, unknown>;
      onProgress?: (progress: number) => void;
      signal?: AbortSignal;
    }
  ) {
    return this.upload(file, {
      isPublic: options?.is_public,
      metadata: options?.metadata,
      onProgress: options?.onProgress,
      signal: options?.signal
    });
  }

  /** @deprecated Use getInfo() instead */
  async getFile(id: string) {
    return this.getInfo(id);
  }

  /** @deprecated Use delete() instead */
  async deleteFile(id: string) {
    return this.delete(id);
  }

  /** @deprecated Use list() instead */
  async listFiles(params?: PaginationParams & { folder?: string }) {
    return this.list(params);
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
    telemetry?: UploadTelemetry | null
  ): Promise<ApiResponse<null>> {
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (signal?.aborted) {
        return { data: null, error: { code: 'aborted', message: 'Upload aborted', status: 0 } };
      }

      // Wait for retry delay
      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt] ?? 0;
        if (delay > 0) await sleep(delay);
        telemetry?.emit(sessionId || '', 'upload.retried', { attempt });
      }

      const result = await this.uploadToPresignedUrl(url, file, onProgress, signal);

      if (result.error) {
        result.error.details = {
          ...(result.error.details || {}),
          attempt: attempt + 1,
          max_attempts: RETRY_DELAYS.length
        };
      }

      // Success
      if (!result.error) return result;

      // Abort - don't retry
      if (result.error.code === 'aborted') return result;

      // Non-retryable status
      if (result.error.status && NON_RETRYABLE_STATUS_CODES.has(result.error.status)) {
        return result;
      }

      // Retryable status or network error (status 0)
      const isRetryable = result.error.status === 0 || RETRYABLE_STATUS_CODES.has(result.error.status);
      if (!isRetryable || attempt === RETRY_DELAYS.length - 1) {
        return result;
      }

      // Will retry
    }

    return { data: null, error: { code: 'upload_error', message: 'Upload failed after retries', status: 0 } };
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
    signal?: AbortSignal
  ): Promise<ApiResponse<null>> {
    if (signal?.aborted) {
      return { data: null, error: { code: 'aborted', message: 'Upload aborted', status: 0 } };
    }

    // Use XHR for progress tracking in browser (also enables stall detection)
    if (typeof XMLHttpRequest !== 'undefined') {
      return this.uploadWithXHR(url, file, onProgress, signal);
    }

    // Fetch-based upload (Node.js / edge) with timeout
    const stallTimeout = DEFAULT_STALL_TIMEOUT_MS;
    const controller = new AbortController();
    let parentSignalCleanup: (() => void) | undefined;
    const combinedSignal = signal
      ? ((AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any?.([
          signal,
          controller.signal
        ]) ??
        (() => {
          // Fallback: wire parent signal to controller when AbortSignal.any is unavailable
          const onAbort = () => controller.abort();
          signal.addEventListener('abort', onAbort, { once: true });
          parentSignalCleanup = () => signal.removeEventListener('abort', onAbort);
          return controller.signal;
        })())
      : controller.signal;

    const timer = setTimeout(() => controller.abort(), stallTimeout);

    try {
      const response = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream'
        },
        signal: combinedSignal
      });

      clearTimeout(timer);
      parentSignalCleanup?.();

      if (!response.ok) {
        // Read body to capture AWS error code (e.g. SignatureDoesNotMatch, RequestTimeout).
        // Without this, every failure looks identical in our logs.
        const s3ErrorBody = await response.text().catch(() => '');
        return {
          data: null,
          error: {
            code: 'upload_error',
            message: `S3 upload failed: ${response.status} ${response.statusText}`,
            status: response.status,
            details: {
              transport: 'fetch',
              total_bytes: file.size,
              online: getOnlineStatus(),
              s3_error_body: s3ErrorBody.slice(0, 1024),
              s3_error_code: extractS3ErrorCode(s3ErrorBody)
            }
          }
        };
      }

      onProgress?.(100);
      return { data: null, error: null };
    } catch (err) {
      clearTimeout(timer);
      parentSignalCleanup?.();

      if (signal?.aborted) {
        return { data: null, error: { code: 'aborted', message: 'Upload aborted', status: 0 } };
      }
      const isStall = controller.signal.aborted && !signal?.aborted;
      return {
        data: null,
        error: {
          code: isStall ? 'upload_stalled' : 'upload_error',
          message: isStall
            ? `Upload stalled (no progress for ${stallTimeout / 1000}s)`
            : err instanceof Error
              ? err.message
              : 'S3 upload failed',
          status: 0,
          details: {
            transport: 'fetch',
            total_bytes: file.size,
            online: getOnlineStatus()
          }
        }
      };
    }
  }

  private uploadWithXHR(
    url: string,
    file: File | Blob,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal
  ): Promise<ApiResponse<null>> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      const stallTimeout = getStallTimeout();
      let stallTimer: ReturnType<typeof setTimeout> | null = null;
      let lastLoaded = 0;
      let totalBytes = file.size;

      const resetStallTimer = () => {
        if (stallTimer !== null) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          xhr.abort();
          resolve({
            data: null,
            error: {
              code: 'upload_stalled',
              message: `Upload stalled (no progress for ${stallTimeout / 1000}s)`,
              status: 0,
              details: {
                transport: 'xhr',
                bytes_sent: lastLoaded,
                total_bytes: totalBytes,
                progress_percent: totalBytes > 0 ? Math.round((lastLoaded / totalBytes) * 100) : undefined,
                online: getOnlineStatus()
              }
            }
          });
        }, stallTimeout);
      };

      const clearStallTimer = () => {
        if (stallTimer !== null) {
          clearTimeout(stallTimer);
          stallTimer = null;
        }
      };

      if (signal) {
        if (signal.aborted) {
          resolve({ data: null, error: { code: 'aborted', message: 'Upload aborted', status: 0 } });
          return;
        }
        signal.addEventListener(
          'abort',
          () => {
            clearStallTimer();
            xhr.abort();
          },
          { once: true }
        );
      }

      xhr.upload.addEventListener('progress', (event) => {
        resetStallTimer();
        lastLoaded = event.loaded;
        totalBytes = event.total || totalBytes;
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      });

      xhr.addEventListener('load', () => {
        clearStallTimer();
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          resolve({ data: null, error: null });
        } else {
          const body = (xhr.responseText || '').slice(0, 1024);
          resolve({
            data: null,
            error: {
              code: 'upload_error',
              message: `S3 upload failed: ${xhr.status}`,
              status: xhr.status,
              details: {
                transport: 'xhr',
                bytes_sent: lastLoaded,
                total_bytes: totalBytes,
                progress_percent: totalBytes > 0 ? Math.round((lastLoaded / totalBytes) * 100) : undefined,
                online: getOnlineStatus(),
                s3_error_body: body,
                s3_error_code: extractS3ErrorCode(body)
              }
            }
          });
        }
      });

      xhr.addEventListener('error', () => {
        clearStallTimer();
        resolve({
          data: null,
          error: {
            code: 'upload_error',
            message: 'S3 upload failed',
            status: 0,
            details: {
              transport: 'xhr',
              bytes_sent: lastLoaded,
              total_bytes: totalBytes,
              progress_percent: totalBytes > 0 ? Math.round((lastLoaded / totalBytes) * 100) : undefined,
              online: getOnlineStatus()
            }
          }
        });
      });

      xhr.addEventListener('abort', () => {
        clearStallTimer();
        if (!signal?.aborted) return; // stall handler already resolved
        resolve({
          data: null,
          error: { code: 'aborted', message: 'Upload aborted', status: 0 }
        });
      });

      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.send(file);
      resetStallTimer();
    });
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
    telemetry?: UploadTelemetry | null
  ): Promise<{ etag?: string; error?: string; status?: number; code?: string }> {
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (signal?.aborted) return { error: 'Upload aborted', code: 'aborted' };

      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt] ?? 0;
        if (delay > 0) await sleep(delay);
        telemetry?.emit(sessionId || '', 'upload.retried', { attempt, part_number: partNumber });
      }

      const controller = new AbortController();
      let partSignalCleanup: (() => void) | undefined;
      const combinedSignal = signal
        ? ((AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any?.([
            signal,
            controller.signal
          ]) ??
          (() => {
            const onAbort = () => controller.abort();
            signal.addEventListener('abort', onAbort, { once: true });
            partSignalCleanup = () => signal.removeEventListener('abort', onAbort);
            return controller.signal;
          })())
        : controller.signal;

      const timer = setTimeout(() => controller.abort(), DEFAULT_STALL_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method: 'PUT',
          body: blob,
          signal: combinedSignal
        });

        clearTimeout(timer);
        partSignalCleanup?.();

        if (response.ok) {
          const etag = response.headers.get('etag');
          if (!etag) {
            // Missing ETag is a retryable failure — S3 should always return one
            if (attempt === RETRY_DELAYS.length - 1) {
              return { error: 'Part upload succeeded but ETag missing — cannot verify integrity', code: 's3_error' };
            }
            continue; // retry
          }
          return { etag };
        }

        // Capture body so we can tell SignatureDoesNotMatch from RequestTimeout etc.
        const body = await response.text().catch(() => '');
        const s3ErrorCode = extractS3ErrorCode(body);

        if (NON_RETRYABLE_STATUS_CODES.has(response.status)) {
          return {
            error: `Part upload failed: ${response.status}${s3ErrorCode ? ` (${s3ErrorCode})` : ''}`,
            status: response.status,
            code: response.status === 403 ? 's3_signature_error' : 's3_error'
          };
        }

        if (attempt === RETRY_DELAYS.length - 1) {
          return {
            error: `Part upload failed after retries: ${response.status}${s3ErrorCode ? ` (${s3ErrorCode})` : ''}`,
            status: response.status,
            code: 's3_error'
          };
        }
      } catch (err) {
        clearTimeout(timer);
        partSignalCleanup?.();
        if (signal?.aborted) return { error: 'Upload aborted', code: 'aborted' };
        const isStall = controller.signal.aborted && !signal?.aborted;
        if (attempt === RETRY_DELAYS.length - 1) {
          return {
            error: isStall
              ? `Part upload stalled (no progress for ${DEFAULT_STALL_TIMEOUT_MS / 1000}s)`
              : err instanceof Error
                ? err.message
                : 'Part upload failed',
            code: isStall ? 'upload_stalled' : 'network_error'
          };
        }
      }
    }

    return { error: 'Part upload failed after retries', code: 'network_error' };
  }

  // --------------------------------------------------------------------------
  // Private: Helpers
  // --------------------------------------------------------------------------

  private shouldUseMultipart(file: File | Blob, options?: UploadOptions): boolean {
    if (options?.forceMultipart) return true;
    const threshold = isSlowNetwork() ? MULTIPART_THRESHOLD_SLOW : MULTIPART_THRESHOLD;
    return file.size >= threshold;
  }

  private defaultChunkSize(fileSize: number): number {
    if (fileSize > 512 * 1024 * 1024) return 16 * 1024 * 1024; // 16MB for >512MB files
    const effectiveType = getNetworkEffectiveType();
    if (effectiveType === 'slow-2g' || effectiveType === '2g') return 5 * 1024 * 1024;
    if (effectiveType === '3g') return 5 * 1024 * 1024;
    return 8 * 1024 * 1024; // 8MB default
  }

  private defaultConcurrency(): number {
    const effectiveType = getNetworkEffectiveType();
    if (effectiveType === 'slow-2g' || effectiveType === '2g') return 1;
    if (effectiveType === '3g') return 2;
    return 4;
  }

  private async maybeCompress(
    file: File | Blob,
    config: Partial<CompressionConfig> | undefined,
    sessionId: string,
    telemetry: UploadTelemetry | null
  ): Promise<File | Blob | null> {
    try {
      const { maybeCompressImage } = await import('./upload-compression');
      return await maybeCompressImage(file, config, sessionId, telemetry);
    } catch {
      return null;
    }
  }

  private async reportUploadFailureBestEffort(
    params: UploadFailureReport,
    requestOptions?: RequestOptions
  ): Promise<void> {
    try {
      await this.reportUploadFailure(params, requestOptions);
    } catch {
      // Failure reporting must never block the caller.
    }
  }

  private getOrCreateTelemetry(): UploadTelemetry {
    if (!this.telemetry) {
      this.telemetry = new UploadTelemetry(this.client);
    }
    return this.telemetry;
  }

  /** Build RequestOptions with X-Upload-Session-Id header for cross-boundary correlation */
  private withSessionHeader(sessionId: string, options?: UploadOptions): RequestOptions | undefined {
    const headers: Record<string, string> = { 'X-Upload-Session-Id': sessionId };
    if (options?.clientContext) {
      return { clientContext: options.clientContext, headers };
    }
    return { headers };
  }

  /**
   * Use ServiceModule's list method but with a cleaner name internally
   * (can't call protected `list` from public method with same name).
   */
  private listMethod<T>(
    path: string,
    params?: PaginationParams & Record<string, unknown>,
    options?: RequestOptions
  ): Promise<PaginatedResponse<T>> {
    return super._list<T>(path, params, options);
  }
}

// ============================================================================
// Module-level helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStallTimeout(): number {
  return isSlowNetwork() ? SLOW_NETWORK_STALL_TIMEOUT_MS : DEFAULT_STALL_TIMEOUT_MS;
}

function isSlowNetwork(): boolean {
  const effectiveType = getNetworkEffectiveType();
  return effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g';
}

function getNetworkEffectiveType(): string {
  if (typeof navigator !== 'undefined' && 'connection' in navigator) {
    const conn = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;
    return conn?.effectiveType || '4g';
  }
  return '4g';
}

function getOnlineStatus(): boolean | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.onLine;
}

function getUploadEnvironmentDiagnostics(): Record<string, unknown> {
  const diagnostics: Record<string, unknown> = {
    network_type: getNetworkEffectiveType(),
    online: getOnlineStatus()
  };

  if (typeof navigator !== 'undefined') {
    const nav = navigator as Navigator & {
      connection?: { effectiveType?: string; downlink?: number; rtt?: number };
      deviceMemory?: number;
    };
    if (typeof nav.hardwareConcurrency === 'number') {
      diagnostics.hardware_concurrency = nav.hardwareConcurrency;
    }
    if (typeof nav.deviceMemory === 'number') {
      diagnostics.device_memory_gb = nav.deviceMemory;
    }
    if (nav.connection?.downlink != null) {
      diagnostics.downlink_mbps = nav.connection.downlink;
    }
    if (nav.connection?.rtt != null) {
      diagnostics.rtt_ms = nav.connection.rtt;
    }
  }

  if (typeof document !== 'undefined') {
    diagnostics.visibility_state = document.visibilityState;
  }

  return diagnostics;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Extract the AWS error code from an S3 XML error response.
 * S3 returns errors like:
 *   <Error><Code>SignatureDoesNotMatch</Code><Message>...</Message>...</Error>
 * Knowing the code is the difference between "fix the signature" and "retry".
 */
function extractS3ErrorCode(body: string): string | undefined {
  if (!body) return undefined;
  const m = body.match(/<Code>([^<]+)<\/Code>/);
  return m ? m[1] : undefined;
}
