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

export interface S3SingleUploadResult {
  success: boolean;
  error?: string;
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
}

export interface PartResult {
  partNumber: number;
  etag: string;
}

export interface S3MultipartResult {
  success: boolean;
  parts?: PartResult[];
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_RETRY_DELAYS = [0, 1000, 3000];
const DEFAULT_STALL_TIMEOUT_MS = 45_000;
const DEFAULT_CONCURRENCY = 3;

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

  for (let attempt = 0; attempt < retryDelays.length; attempt++) {
    if (attempt > 0) {
      await sleep(retryDelays[attempt] || 1000);
    }
    if (options?.signal?.aborted) {
      return { success: false, error: 'Upload aborted' };
    }

    const result = await doSinglePut(url, file, options?.onProgress, options?.signal, stallTimeout);
    if (result === 'success') return { success: true };
    if (result === 'abort') return { success: false, error: 'Upload aborted' };
    if (result === 'stall') return { success: false, error: 'Upload stalled — no progress' };
    // 'retry' — continue loop
  }

  return { success: false, error: 'Upload failed after retries' };
}

type PutResult = 'success' | 'retry' | 'abort' | 'stall';

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

    const resetStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      if (stallTimeoutMs) {
        stallTimer = setTimeout(() => {
          xhr.abort();
          resolve('stall');
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
      if (stallTimer) clearTimeout(stallTimer);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve('success');
      } else if (xhr.status >= 500) {
        resolve('retry');
      } else {
        resolve('retry'); // 4xx could be transient presigned URL issue
      }
    });

    xhr.addEventListener('error', () => {
      if (stallTimer) clearTimeout(stallTimer);
      resolve('retry');
    });

    xhr.addEventListener('abort', () => {
      if (stallTimer) clearTimeout(stallTimer);
      // Only resolve 'abort' if it was user-initiated, not stall
    });

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          xhr.abort();
          if (stallTimer) clearTimeout(stallTimer);
          resolve('abort');
        },
        { once: true }
      );
    }

    xhr.open('PUT', url);
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

        let result = await uploadPartWithRetry(url, blob, partNum, maxRetries, options?.signal);

        // On failure, try refreshing URL (signature may have expired)
        if (!result && fetchMoreUrls) {
          const freshUrls = await fetchMoreUrls([partNum]);
          if (freshUrls?.[0]) {
            availableUrls.set(partNum, freshUrls[0].url);
            result = await uploadPartWithRetry(freshUrls[0].url, blob, partNum, maxRetries, options?.signal);
          }
        }

        if (result) {
          totalUploaded += end - start;
          options?.onProgress?.({
            loaded: totalUploaded,
            total: file.size,
            percentage: Math.round((totalUploaded / file.size) * 100)
          });
          return { partNum, etag: result.etag } as const;
        }

        return { partNum, error: 'Part upload failed after retries' } as const;
      })
    );

    for (const result of results) {
      if ('error' in result) {
        return { success: false, error: `Part ${result.partNum}: ${result.error}` };
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

async function uploadPartWithRetry(
  url: string,
  blob: Blob,
  _partNumber: number,
  maxRetries: number,
  signal?: AbortSignal
): Promise<{ etag: string } | null> {
  const retryDelays = DEFAULT_RETRY_DELAYS.slice(0, maxRetries);

  for (let attempt = 0; attempt < retryDelays.length; attempt++) {
    if (attempt > 0) await sleep(retryDelays[attempt] || 1000);
    if (signal?.aborted) return null;

    const result = await doPartPut(url, blob, signal);

    if (result === 'abort') return null;
    if (typeof result === 'object') return result; // { etag }
    // 'retry' — continue
  }

  return null;
}

type PartPutResult = { etag: string } | 'retry' | 'abort';

function doPartPut(url: string, blob: Blob, signal?: AbortSignal): Promise<PartPutResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('etag');
        if (etag) {
          resolve({ etag });
        } else {
          resolve('retry'); // Missing ETag
        }
      } else if (xhr.status === 403) {
        // Signature expired — caller should refresh URL
        resolve('retry');
      } else if (xhr.status >= 500) {
        resolve('retry');
      } else {
        resolve('retry');
      }
    });

    xhr.addEventListener('error', () => resolve('retry'));
    xhr.addEventListener('abort', () => resolve('abort'));

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          xhr.abort();
          resolve('abort');
        },
        { once: true }
      );
    }

    xhr.open('PUT', url);
    xhr.send(blob);
  });
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
