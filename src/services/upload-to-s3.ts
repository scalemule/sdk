/**
 * Standalone S3 upload utilities for browser environments.
 *
 * These functions handle the client-side portion of presigned URL uploads:
 * - Single PUT for small files (with retry + stall detection)
 * - Multipart chunked upload for large files (parallel parts, per-chunk retry, ETag collection)
 *
 * Used by any app that gets presigned URLs from the server and needs to upload to S3.
 * The server-side proxy routes are app-specific; these utilities are app-agnostic.
 */

// ============================================================================
// Types
// ============================================================================

export interface S3UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface S3SingleUploadOptions {
  onProgress?: (progress: S3UploadProgress) => void;
  signal?: AbortSignal;
  /** Max retries per attempt (default: 3) */
  maxRetries?: number;
  /** Stall timeout in ms — abort if no progress for this long (default: 45000) */
  stallTimeoutMs?: number;
}

/** Structured failure code emitted by uploadSingleToS3 / uploadMultipartToS3. */
export type S3UploadErrorCode =
  | 's3_signature_error' // 403 — presigned URL invalid/expired/Content-Type mismatch
  | 's3_client_error' // other 4xx (400/404/411/412/413/415) — request shape rejected by S3
  | 's3_server_error' // 5xx — transient S3 failure
  | 's3_transient_error' // 408/429/other retryable status
  | 's3_missing_etag' // 2xx but ETag header missing on a part PUT (multipart only)
  | 'network_error' // browser network error / DNS / TLS
  | 'stalled' // no progress events for stallTimeoutMs
  | 'aborted' // caller's AbortSignal fired
  | 'aborted_unexpected'; // xhr abort fired without a known cause (treated as retryable)

export interface S3SingleUploadResult {
  success: boolean;
  error?: string;
  /** S3 HTTP status (when failure originated from S3) */
  status?: number;
  /** Structured failure code — see S3UploadErrorCode for the full enum. */
  code?: S3UploadErrorCode;
  /** Truncated S3 response body — invaluable for diagnosing SignatureDoesNotMatch vs RequestTimeout etc. */
  s3ErrorBody?: string;
}

export interface MultipartPartUrl {
  partNumber: number;
  url: string;
}

export interface MultipartConfig {
  partSizeBytes: number;
  totalParts: number;
  partUrls: MultipartPartUrl[];
  /** Fetch fresh URLs when needed (e.g., on 403 expiry). App provides this via its proxy route. */
  fetchMoreUrls?: (partNumbers: number[]) => Promise<MultipartPartUrl[] | null>;
}

export interface S3MultipartOptions {
  onProgress?: (progress: S3UploadProgress) => void;
  signal?: AbortSignal;
  /** Max concurrent part uploads (default: 3) */
  concurrency?: number;
  /** Max retries per part (default: 3) */
  maxRetries?: number;
  /** Stall timeout in ms — retry part if no progress for this long (default: none) */
  stallTimeoutMs?: number;
}

export interface PartResult {
  partNumber: number;
  etag: string;
}

export interface S3MultipartResult {
  success: boolean;
  parts?: PartResult[];
  error?: string;
  status?: number;
  /** Structured failure code — see S3UploadErrorCode for the full enum. */
  code?: S3UploadErrorCode;
  s3ErrorBody?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_RETRY_DELAYS = [0, 1000, 3000];
const DEFAULT_STALL_TIMEOUT_MS = 45_000;
const DEFAULT_CONCURRENCY = 3;

// 4xx codes from S3 that indicate a permanent problem with this request
// (signature, content-length, validation). Retrying the same URL won't help.
// 408 (timeout) and 429 (throttle) are intentionally NOT here — those should retry.
const FATAL_S3_STATUS = new Set([400, 403, 404, 411, 412, 413, 415]);

const MAX_ERROR_BODY_BYTES = 1024;

// ============================================================================
// Single PUT Upload
// ============================================================================

/**
 * Upload a file to S3 via a single presigned PUT.
 * Includes retry on 5xx/network errors and stall detection.
 */
export async function uploadSingleToS3(
  url: string,
  file: File | Blob,
  options?: S3SingleUploadOptions
): Promise<S3SingleUploadResult> {
  const maxRetries = options?.maxRetries ?? 3;
  const retryDelays = DEFAULT_RETRY_DELAYS.slice(0, maxRetries);
  const stallTimeout: number = options?.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;

  let lastFailure: PutResult | null = null;

  for (let attempt = 0; attempt < retryDelays.length; attempt++) {
    if (attempt > 0) {
      await sleep(retryDelays[attempt] || 1000);
    }
    if (options?.signal?.aborted) {
      return { success: false, error: 'Upload aborted', code: 'aborted' };
    }

    const result = await doSinglePut(url, file, options?.onProgress, options?.signal, stallTimeout);
    if (result.kind === 'success') return { success: true };
    if (result.kind === 'abort') return { success: false, error: 'Upload aborted', code: 'aborted' };

    lastFailure = result;

    // Fatal S3 status — retrying the same presigned URL cannot succeed.
    // The caller (e.g. multipart wrapper) needs the structured info to refresh the URL or fail fast.
    if (result.kind === 'fatal') {
      return {
        success: false,
        error: `S3 rejected upload: ${result.status} ${result.code}`,
        status: result.status,
        code: result.code,
        s3ErrorBody: result.body
      };
    }
    // 'retry' or 'stall' — continue loop
  }

  return {
    success: false,
    error: lastFailure?.kind === 'stall' ? 'Upload stalled after retries' : 'Upload failed after retries',
    status: lastFailure && 'status' in lastFailure ? lastFailure.status : undefined,
    code:
      lastFailure?.kind === 'stall'
        ? 'stalled'
        : lastFailure && 'code' in lastFailure
          ? lastFailure.code
          : 'network_error',
    s3ErrorBody: lastFailure && 'body' in lastFailure ? lastFailure.body : undefined
  };
}

type PutResult =
  | { kind: 'success' }
  | { kind: 'abort' }
  | { kind: 'stall' }
  | { kind: 'retry'; status?: number; code?: S3UploadErrorCode; body?: string }
  | { kind: 'fatal'; status: number; code: S3UploadErrorCode; body?: string };

function classifyS3Status(status: number): { fatal: boolean; code: S3UploadErrorCode } {
  if (status === 403) return { fatal: true, code: 's3_signature_error' };
  if (FATAL_S3_STATUS.has(status)) return { fatal: true, code: 's3_client_error' };
  if (status >= 500) return { fatal: false, code: 's3_server_error' };
  // 408 timeout, 429 throttle, anything else → retry
  return { fatal: false, code: 's3_transient_error' };
}

function doSinglePut(
  url: string,
  file: File | Blob,
  onProgress?: (p: S3UploadProgress) => void,
  signal?: AbortSignal,
  stallTimeoutMs?: number
): Promise<PutResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    let resolved = false;
    const settle = (r: PutResult) => {
      if (resolved) return;
      resolved = true;
      if (stallTimer) clearTimeout(stallTimer);
      resolve(r);
    };

    const resetStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      if (stallTimeoutMs) {
        stallTimer = setTimeout(() => {
          xhr.abort();
          settle({ kind: 'stall' });
        }, stallTimeoutMs);
      }
    };

    xhr.upload.addEventListener('progress', (e) => {
      resetStallTimer();
      if (e.lengthComputable && onProgress) {
        onProgress({
          loaded: e.loaded,
          total: e.total,
          percentage: Math.round((e.loaded / e.total) * 100)
        });
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        settle({ kind: 'success' });
        return;
      }
      const body = (xhr.responseText || '').slice(0, MAX_ERROR_BODY_BYTES);
      const { fatal, code } = classifyS3Status(xhr.status);
      settle({ kind: fatal ? 'fatal' : 'retry', status: xhr.status, code, body });
    });

    xhr.addEventListener('error', () => settle({ kind: 'retry', code: 'network_error' }));

    xhr.addEventListener('abort', () => {
      // If neither user-abort nor stall has resolved yet, treat as transient retry.
      if (!resolved) settle({ kind: 'retry', code: 'aborted_unexpected' });
    });

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          // Cancel the in-flight request — without this the upload keeps consuming
          // bandwidth in the background after the caller has aborted.
          try {
            xhr.abort();
          } catch {
            // xhr.abort() can throw if the request is already done; ignore.
          }
          settle({ kind: 'abort' });
        },
        { once: true }
      );
    }

    xhr.open('PUT', url);
    // Server signs single-PUT URLs WITH Content-Type (s3_client.rs:309). Must match.
    xhr.setRequestHeader('Content-Type', (file as File).type || 'application/octet-stream');
    resetStallTimer();
    xhr.send(file);
  });
}

// ============================================================================
// Multipart Chunked Upload
// ============================================================================

/**
 * Upload a file to S3 using multipart chunked upload.
 * Splits the file into chunks, uploads in parallel with per-chunk retry,
 * collects ETags for completion.
 */
export async function uploadMultipartToS3(
  file: File | Blob,
  config: MultipartConfig,
  options?: S3MultipartOptions
): Promise<S3MultipartResult> {
  const { partSizeBytes, totalParts, partUrls: initialPartUrls, fetchMoreUrls } = config;
  const concurrency: number = options?.concurrency ?? DEFAULT_CONCURRENCY;
  const maxRetries: number = options?.maxRetries ?? 3;
  const stallTimeoutMs: number | undefined = options?.stallTimeoutMs;

  const completedParts: PartResult[] = [];
  const availableUrls = new Map<number, string>();

  // Seed initial URLs
  for (const pu of initialPartUrls) {
    availableUrls.set(pu.partNumber, pu.url);
  }

  let totalUploaded = 0;

  // Process parts in batches
  for (let i = 0; i < totalParts; i += concurrency) {
    if (options?.signal?.aborted) {
      return { success: false, error: 'Upload aborted' };
    }

    const batchPartNumbers: number[] = [];
    for (let j = i; j < Math.min(i + concurrency, totalParts); j++) {
      batchPartNumbers.push(j + 1); // 1-indexed
    }

    // Pre-fetch URLs for parts that don't have one
    const missingUrls = batchPartNumbers.filter((p) => !availableUrls.has(p));
    if (missingUrls.length > 0 && fetchMoreUrls) {
      const fetched = await fetchMoreUrls(missingUrls);
      if (fetched) {
        for (const pu of fetched) availableUrls.set(pu.partNumber, pu.url);
      }
    }

    // Upload batch concurrently
    const results = await Promise.all(
      batchPartNumbers.map(async (partNum) => {
        const url = availableUrls.get(partNum);
        if (!url) return { partNum, error: 'No URL available' } as const;

        const start = (partNum - 1) * partSizeBytes;
        const end = Math.min(start + partSizeBytes, file.size);
        const blob = file.slice(start, end);

        let result = await uploadPartWithRetry(url, blob, partNum, maxRetries, options?.signal, stallTimeoutMs);

        // On URL-expired (403) or any failure, try refreshing the presigned URL once.
        // 403 is reported back fast (no retries burned) so this kicks in within ~0s instead of ~4s.
        if ('error' in result && fetchMoreUrls && (result.code === 's3_signature_error' || result.refreshable)) {
          const freshUrls = await fetchMoreUrls([partNum]);
          if (freshUrls?.[0]) {
            availableUrls.set(partNum, freshUrls[0].url);
            result = await uploadPartWithRetry(
              freshUrls[0].url,
              blob,
              partNum,
              maxRetries,
              options?.signal,
              stallTimeoutMs
            );
          }
        }

        if ('etag' in result) {
          totalUploaded += end - start;
          options?.onProgress?.({
            loaded: totalUploaded,
            total: file.size,
            percentage: Math.round((totalUploaded / file.size) * 100)
          });
          return { partNum, etag: result.etag } as const;
        }

        return {
          partNum,
          error: result.error,
          status: result.status,
          code: result.code,
          body: result.body
        } as const;
      })
    );

    for (const result of results) {
      if ('error' in result) {
        const detail = result.status ? ` (HTTP ${result.status} ${result.code ?? ''})` : '';
        return {
          success: false,
          error: `Part ${result.partNum}: ${result.error}${detail}`,
          status: result.status,
          code: result.code,
          s3ErrorBody: result.body
        };
      }
      completedParts.push({ partNumber: result.partNum, etag: result.etag });
    }
  }

  return {
    success: true,
    parts: completedParts.sort((a, b) => a.partNumber - b.partNumber)
  };
}

// ============================================================================
// Part Upload with Retry
// ============================================================================

type PartFailure = {
  error: string;
  status?: number;
  code: S3UploadErrorCode;
  body?: string;
  /** True when caller should refresh the presigned URL and retry (e.g. 403, expired signature). */
  refreshable: boolean;
};

async function uploadPartWithRetry(
  url: string,
  blob: Blob,
  _partNumber: number,
  maxRetries: number,
  signal?: AbortSignal,
  stallTimeoutMs?: number
): Promise<{ etag: string } | PartFailure> {
  const retryDelays = DEFAULT_RETRY_DELAYS.slice(0, maxRetries);
  let lastFailure: PartFailure = {
    error: 'Part upload failed',
    code: 'network_error',
    refreshable: false
  };

  for (let attempt = 0; attempt < retryDelays.length; attempt++) {
    if (attempt > 0) await sleep(retryDelays[attempt] || 1000);
    if (signal?.aborted) {
      return { error: 'Upload aborted', code: 'aborted', refreshable: false };
    }

    const result = await doPartPut(url, blob, signal, stallTimeoutMs);

    if (result.kind === 'success') return { etag: result.etag };
    if (result.kind === 'abort') {
      return { error: 'Upload aborted', code: 'aborted', refreshable: false };
    }

    if (result.kind === 'stall') {
      lastFailure = { error: 'Part stalled', code: 'stalled', refreshable: false };
      continue;
    }

    // Both 'retry' and 'fatal' carry status/code/body/refreshable
    lastFailure = {
      error: `Part HTTP ${result.status ?? 'network'}`,
      status: result.status,
      code: result.code ?? 'network_error',
      body: result.body,
      refreshable: !!result.refreshable
    };

    // Don't waste retries on a permanently broken signature — bubble up so the caller refreshes the URL.
    if (result.refreshable) return lastFailure;
    // Don't retry on other fatal client errors either.
    if (result.kind === 'fatal') return lastFailure;
  }

  return { ...lastFailure, error: `Part upload failed after retries: ${lastFailure.error}` };
}

type PartPutResult =
  | { kind: 'success'; etag: string }
  | { kind: 'abort' }
  | { kind: 'stall' }
  | { kind: 'retry'; status?: number; code?: S3UploadErrorCode; body?: string; refreshable?: boolean }
  | { kind: 'fatal'; status: number; code: S3UploadErrorCode; body?: string; refreshable?: boolean };

function doPartPut(url: string, blob: Blob, signal?: AbortSignal, stallTimeoutMs?: number): Promise<PartPutResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    let resolved = false;

    const settle = (result: PartPutResult) => {
      if (resolved) return;
      resolved = true;
      if (stallTimer) clearTimeout(stallTimer);
      resolve(result);
    };

    const resetStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      if (stallTimeoutMs) {
        stallTimer = setTimeout(() => {
          xhr.abort();
          settle({ kind: 'stall' });
        }, stallTimeoutMs);
      }
    };

    xhr.upload.addEventListener('progress', () => resetStallTimer());

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('etag');
        if (etag) {
          settle({ kind: 'success', etag });
        } else {
          // Missing ETag — retry, but capture body for diagnostics
          settle({
            kind: 'retry',
            status: xhr.status,
            code: 's3_missing_etag',
            body: (xhr.responseText || '').slice(0, MAX_ERROR_BODY_BYTES)
          });
        }
        return;
      }
      const body = (xhr.responseText || '').slice(0, MAX_ERROR_BODY_BYTES);
      const { fatal, code } = classifyS3Status(xhr.status);
      // 403 on a part is almost always an expired/mismatched signature — surface as refreshable
      // so the wrapper can fetch a fresh URL instead of burning the retry budget.
      const refreshable = xhr.status === 403;
      settle({
        kind: refreshable ? 'retry' : fatal ? 'fatal' : 'retry',
        status: xhr.status,
        code,
        body,
        refreshable
      });
    });

    xhr.addEventListener('error', () => settle({ kind: 'retry', code: 'network_error' }));
    xhr.addEventListener('abort', () => {
      if (!resolved) settle({ kind: 'abort' });
    });

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          // Cancel the in-flight request so the part stops uploading immediately.
          try {
            xhr.abort();
          } catch {
            // Already done; ignore.
          }
          settle({ kind: 'abort' });
        },
        { once: true }
      );
    }

    xhr.open('PUT', url);
    // Server signs part URLs WITHOUT Content-Type (s3_client.rs:391-398). Do not send one here.
    resetStallTimer();
    xhr.send(blob);
  });
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
