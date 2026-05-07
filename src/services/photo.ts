/**
 * Photo Service Module
 *
 * Photo upload, transformation, management.
 *
 * Routes:
 *   POST   /                   → upload photo
 *   POST   /{id}/transform     → transform photo
 *   GET    /{id}               → get photo info
 *   DELETE /{id}               → delete photo
 */

import { ServiceModule } from '../service';
import type { ScaleMuleClient } from '../client';
import type { ApiResponse, RequestOptions } from '../types';
import type { StorageService, FileInfo } from './storage';

// ============================================================================
// Types
// ============================================================================

export interface PhotoInfo {
  id: string;
  filename: string;
  content_type: string;
  width?: number;
  height?: number;
  size_bytes: number;
  url?: string;
  thumbnails?: Array<{ url: string; width: number; height: number }>;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface TransformResult {
  id: string;
  url: string;
  width: number;
  height: number;
  format: string;
}

export type PhotoPreset = 'hero' | 'inline' | 'thumbnail' | 'avatar' | 'logo';

export interface PhotoManifest {
  file_id: string;
  photo_id: string;
  content_type: string;
  preset: PhotoPreset | 'original';
  ready: boolean;
  variants: Record<string, string>;
  srcset: string | null;
  default: string | null;
}

/** Options for building a transform URL or requesting a transform */
export interface TransformOptions {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'fill' | 'scaledown';
  /** Output format. Omit to let the server negotiate from the Accept header (AVIF > WebP > JPEG). */
  format?: 'jpeg' | 'jpg' | 'png' | 'webp' | 'gif' | 'avif';
  /** Quality 1-100 (default: 85) */
  quality?: number;
}

/**
 * Pre-generated square crop sizes (px).
 * URLs built with these sizes + fit=cover get instant cache hits (no server-side transform).
 */
export const PHOTO_BREAKPOINTS = [36, 150, 320, 640, 1080] as const;

/** Result of {@link PhotoService.uploadViaStorage}. */
export interface UploadViaStorageResult {
  /** Storage file_id — pass this to chat-message attachment metadata. */
  file_id: string;
  /**
   * Photo service's photo_id. Use with `getTransformUrl()` /
   * `getOptimalUrl()` to fetch responsive variants. `null` when register
   * failed after a successful storage upload (the file_id is still usable
   * as a generic storage file).
   */
  photo_id: string | null;
  /**
   * Short-lived signed URL to the original bytes — usable immediately on the
   * recipient side, before optimization completes.
   */
  original_view_url: string | null;
  /**
   * Resolves once the optimization worker finishes (or times out at 10s).
   * On resolution: a transform URL pointing at the largest pre-cached
   * breakpoint. On timeout: `null` — caller should fall back to
   * `getTransformUrl()` which uses the on-demand transform path.
   */
  optimized_url_promise: Promise<string | null>;
}

// ============================================================================
// Photo Service
// ============================================================================

export class PhotoService extends ServiceModule {
  protected basePath = '/v1/photos';

  /**
   * @param storage Required for {@link uploadViaStorage}. Wired up by the
   *   top-level {@link ScaleMule} constructor — most call sites should not
   *   instantiate `PhotoService` directly.
   */
  constructor(
    client: ScaleMuleClient,
    private readonly storage: StorageService
  ) {
    super(client);
  }

  async upload(
    file: File | Blob,
    uploadOptions?: {
      metadata?: Record<string, unknown>;
      onProgress?: (progress: number) => void;
      signal?: AbortSignal;
    },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<PhotoInfo>> {
    const fields: Record<string, string> = {};
    if (uploadOptions?.metadata) fields['metadata'] = JSON.stringify(uploadOptions.metadata);

    return this._upload<PhotoInfo>('', file, fields, {
      ...requestOptions,
      onProgress: uploadOptions?.onProgress,
      signal: uploadOptions?.signal
    });
  }

  async transform(
    photoId: string,
    transformations: Record<string, unknown>,
    options?: RequestOptions
  ): Promise<ApiResponse<TransformResult>> {
    return this.post<TransformResult>(`/${photoId}/transform`, transformations, options);
  }

  async get(id: string, options?: RequestOptions): Promise<ApiResponse<PhotoInfo>> {
    return this._get<PhotoInfo>(`/${id}`, options);
  }

  async delete(id: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/${id}`, options);
  }

  async getPresets(options?: RequestOptions): Promise<ApiResponse<Record<PhotoPreset, { widths: number[] }>>> {
    return this._get<Record<PhotoPreset, { widths: number[] }>>('/presets', options);
  }

  async getManifest(
    id: string,
    params?: { preset?: PhotoPreset },
    options?: RequestOptions
  ): Promise<ApiResponse<PhotoManifest>> {
    return this._get<PhotoManifest>(this.withQuery(`/${id}/manifest`, params), options);
  }

  async getPublicManifest(
    id: string,
    params?: { preset?: PhotoPreset },
    options?: RequestOptions
  ): Promise<ApiResponse<PhotoManifest>> {
    return this._get<PhotoManifest>(this.withQuery(`/public/${id}/manifest`, params), options);
  }

  /**
   * Build an absolute URL for the on-demand transform endpoint.
   *
   * Use in `<img src>` or `srcset` — the server negotiates the best format
   * (AVIF > WebP > JPEG) from the browser's Accept header automatically.
   * Transformed images are cached server-side on first request.
   */
  getTransformUrl(photoId: string, options?: TransformOptions): string {
    const params = new URLSearchParams();
    if (options?.width) params.set('width', String(options.width));
    if (options?.height) params.set('height', String(options.height));
    if (options?.fit) params.set('fit', options.fit);
    if (options?.format) params.set('format', options.format);
    if (options?.quality) params.set('quality', String(options.quality));
    const qs = params.toString();
    return `${this.client.getBaseUrl()}${this.basePath}/${photoId}/transform${qs ? `?${qs}` : ''}`;
  }

  /**
   * Build an absolute URL for the **public** transform endpoint —
   * the unauthenticated path that serves transformed bytes for
   * `<img src>` use on logged-out marketing pages, blogs, embeds.
   *
   * The photo service refuses any photo that isn't:
   *   - `visibility = 'anonymous_visible'` (the customer explicitly
   *     opted into world-readable for this file at upload time)
   *   - `scan_status = 'clean'` (no exception for pending/scanning)
   *
   * Anything else returns 404 — the endpoint refuses to disambiguate
   * "not found" from "not anonymous" so it can't be probed to
   * discover existence or visibility of private photos.
   *
   * Pair with {@link getTransformUrl} for the authenticated case:
   * customer apps that already have a session should keep using the
   * authed transform URL (which also handles `anonymous_visible`
   * photos transparently) — this URL is for cross-origin embedding.
   *
   * @example
   * ```tsx
   * // photo was uploaded with visibility: 'anonymous_visible'
   * <img src={sm.photo.getPublicTransformUrl(photoId, { width: 800 })} />
   * ```
   */
  getPublicTransformUrl(photoId: string, options?: TransformOptions): string {
    const params = new URLSearchParams();
    if (options?.width) params.set('width', String(options.width));
    if (options?.height) params.set('height', String(options.height));
    if (options?.fit) params.set('fit', options.fit);
    if (options?.format) params.set('format', options.format);
    if (options?.quality) params.set('quality', String(options.quality));
    const qs = params.toString();
    return `${this.client.getBaseUrl()}${this.basePath}/public/${photoId}/transform${qs ? `?${qs}` : ''}`;
  }

  /**
   * Get a transform URL optimized for the given display area.
   *
   * Snaps UP to the nearest pre-generated square breakpoint (150, 320, 640, 1080)
   * so the response is served instantly from cache. Format is auto-negotiated
   * by the browser's Accept header (WebP in modern browsers, JPEG fallback).
   *
   * @param photoId  Photo ID
   * @param displayWidth  CSS pixel width of the display area
   * @param options.dpr  Device pixel ratio (default: 1). Pass `window.devicePixelRatio` in browsers.
   *
   * @example
   * ```typescript
   * // 280px card on 2x Retina -> snaps to 640px (280×2=560, next breakpoint up)
   * const url = sm.photo.getOptimalUrl(photoId, 280, { dpr: 2 })
   *
   * // Profile avatar at 48px -> snaps to 150px
   * const url = sm.photo.getOptimalUrl(photoId, 48)
   *
   * // Tiny avatar at 36px -> exact cache hit on 36px micro-thumbnail
   * const url = sm.photo.getOptimalUrl(photoId, 36)
   * ```
   */
  getOptimalUrl(photoId: string, displayWidth: number, options?: { dpr?: number }): string {
    const requestedDpr = options?.dpr ?? 1;
    const dpr = Number.isFinite(requestedDpr) && requestedDpr > 0 ? requestedDpr : 1;
    const cssWidth = Number.isFinite(displayWidth) && displayWidth > 0 ? displayWidth : PHOTO_BREAKPOINTS[0];
    const physicalWidth = Math.ceil(cssWidth * dpr);
    const size = PHOTO_BREAKPOINTS.find((bp) => bp >= physicalWidth) ?? PHOTO_BREAKPOINTS[PHOTO_BREAKPOINTS.length - 1];

    return this.getTransformUrl(photoId, { width: size, height: size, fit: 'cover' });
  }

  /**
   * Get the 36px avatar micro-thumbnail URL for a photo.
   * Hits the pre-generated 36x36 bicubic-resized cached variant.
   */
  getAvatarThumbnailUrl(photoId: string): string {
    return this.getOptimalUrl(photoId, 36);
  }

  /**
   * Generate an HTML srcset string for responsive square photo display.
   *
   * Returns all pre-generated breakpoints as width descriptors. Pair with
   * the `sizes` attribute so the browser picks the optimal variant automatically.
   *
   * @example
   * ```tsx
   * const srcset = sm.photo.getSrcSet(photoId)
   * // -> ".../transform?width=150&height=150&fit=cover 150w, .../transform?width=320..."
   *
   * <img
   *   src={sm.photo.getOptimalUrl(photoId, 320)}
   *   srcSet={srcset}
   *   sizes="(max-width: 640px) 100vw, 640px"
   *   alt="Photo"
   * />
   * ```
   */
  getSrcSet(photoId: string): string {
    return PHOTO_BREAKPOINTS.map(
      (size) => `${this.getTransformUrl(photoId, { width: size, height: size, fit: 'cover' })} ${size}w`
    ).join(', ');
  }

  /**
   * Register a photo from an already-uploaded storage file.
   *
   * Creates a photo record so the optimization pipeline can process it.
   * Use this when files are uploaded via the storage service (presigned URL)
   * instead of the photo service's upload endpoint.
   *
   * If the file scan is still in progress, the server waits briefly (~5s) for it
   * to complete. In the rare case the scan exceeds that window, the server queues
   * the registration and returns 202; this method retries automatically until the
   * photo record is available.
   *
   * Returns the photo record with `id` that can be used with `getTransformUrl()`.
   */
  async register(
    registerOptions: { fileId: string; userId?: string },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<PhotoInfo>> {
    const body = {
      file_id: registerOptions.fileId,
      sm_user_id: registerOptions.userId
    };

    // First attempt — the server polls for scan completion internally (~5s).
    // If scan completes, we get 200/201 with PhotoInfo immediately.
    const result = await this.post<PhotoInfo>('/register', body, requestOptions);
    const isPending = (r: ApiResponse<PhotoInfo>) =>
      !r.error && r.data && 'status' in r.data && (r.data as Record<string, unknown>).status === 'pending_scan';

    if (!isPending(result)) {
      return result;
    }

    // Rare path: scan didn't finish within the server's ~5s timeout.
    // Retry POST /register (idempotent) twice with 1s gaps. Each retry also waits
    // up to 5s server-side, so worst case is ~17s total (5 + 1 + 5 + 1 + 5).
    for (let attempt = 0; attempt < 2; attempt++) {
      await new Promise((r) => setTimeout(r, 1000));
      const retry = await this.post<PhotoInfo>('/register', body, requestOptions);
      if (!isPending(retry)) {
        return retry;
      }
    }

    // Exhausted retries — return as error so callers don't silently get a non-PhotoInfo object
    return {
      data: null,
      error: {
        code: 'scan_timeout',
        message:
          'File scan did not complete in time. The photo will be registered automatically when the scan finishes.',
        status: 202
      }
    };
  }

  /**
   * Upload a file to storage (browser → S3 direct, private, uncompressed) and
   * register it with the photo service so optimization + transform URLs work.
   *
   * The canonical chat-attachment / progressive-image upload primitive. Same
   * presigned-direct-to-S3 path as `storage.uploadPrivate()`, plus a follow-up
   * `photo.register()` call so `getTransformUrl()` / `getOptimalUrl()` return
   * usable URLs.
   *
   * The returned `optimized_url_promise` resolves once the photo's
   * `optimization_status` flips to `completed` (or once a 10s timeout fires;
   * the caller can still use `getTransformUrl()` directly — the on-demand
   * transform path produces a variant even before pre-rendered breakpoints
   * are cached). Phase 3 of ADR-2026-04-26 replaces the poll with a realtime
   * subscription.
   *
   * If `register()` fails after a successful storage upload (e.g. scan times
   * out), the file is *not* lost: the returned `file_id` is still valid as a
   * generic storage file. The SDK logs a warning and resolves
   * `optimized_url_promise` to `null`.
   */
  async uploadViaStorage(
    file: File | Blob,
    uploadOptions?: {
      userId?: string;
      filename?: string;
      metadata?: Record<string, unknown>;
      onProgress?: (progress: number) => void;
      signal?: AbortSignal;
    },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<UploadViaStorageResult>> {
    // Step 1 — private direct-to-S3 upload via storage.
    const uploadResult = await this.storage.uploadPrivate(file, {
      filename: uploadOptions?.filename,
      metadata: uploadOptions?.metadata,
      onProgress: uploadOptions?.onProgress,
      signal: uploadOptions?.signal
    });

    if (uploadResult.error || !uploadResult.data) {
      return { data: null, error: uploadResult.error };
    }

    const fileInfo: FileInfo = uploadResult.data;
    const fileId = fileInfo.id;
    const originalViewUrl = fileInfo.url ?? null;

    // Step 2 — register with photo service. `register()` polls scan completion
    // internally (~5s server-side, retried up to ~17s). On success the photo
    // record exists; on failure the storage file is still usable as-is.
    const registerResult = await this.register({ fileId, userId: uploadOptions?.userId }, requestOptions);

    if (registerResult.error || !registerResult.data) {
      // Surface as success — caller has a valid file_id — but no optimized variants.
      // eslint-disable-next-line no-console
      console.warn(
        '[scalemule-sdk] photo.register() failed after storage upload; optimized variants unavailable.',
        registerResult.error
      );
      return {
        data: {
          file_id: fileId,
          photo_id: null,
          original_view_url: originalViewUrl,
          optimized_url_promise: Promise.resolve(null)
        },
        error: null
      };
    }

    const photoId = registerResult.data.id;

    // Step 3 — start polling for optimization completion in the background.
    // Phase 1: poll every 250ms up to 10s. Phase 3 swaps for realtime.
    const optimizedUrlPromise = this.pollOptimizationComplete(photoId, requestOptions);

    return {
      data: {
        file_id: fileId,
        photo_id: photoId,
        original_view_url: originalViewUrl,
        optimized_url_promise: optimizedUrlPromise
      },
      error: null
    };
  }

  /**
   * Poll {@link get} until the photo's `optimization_status` is `completed`
   * or the 10s timeout fires. Resolves to a usable transform URL on success;
   * `null` on timeout (caller should fall back to {@link getTransformUrl}
   * which uses the on-demand transform path).
   */
  private async pollOptimizationComplete(photoId: string, requestOptions?: RequestOptions): Promise<string | null> {
    const intervalMs = 250;
    const maxAttempts = 40; // 40 × 250ms = 10s

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const result = await this.get(photoId, requestOptions);
      // optimization_status isn't in the typed PhotoInfo today; the photo
      // service emits it on GET. Read defensively.
      const status = (result.data as (PhotoInfo & { optimization_status?: string }) | null)?.optimization_status;
      if (status === 'completed') {
        return this.getOptimalUrl(photoId, 1080);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return null;
  }

  /** @deprecated Use upload() instead */
  async uploadPhoto(
    file: File | Blob,
    options?: { metadata?: Record<string, unknown>; onProgress?: (progress: number) => void; signal?: AbortSignal }
  ) {
    return this.upload(file, options);
  }

  /** @deprecated Use transform() instead */
  async transformPhoto(photoId: string, transformations: Record<string, unknown>) {
    return this.transform(photoId, transformations);
  }

  /** @deprecated Use get() instead */
  async getPhoto(id: string) {
    return this.get(id);
  }
}
