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
import type { ApiResponse, RequestOptions } from '../types';

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
export const PHOTO_BREAKPOINTS = [150, 320, 640, 1080] as const;

// ============================================================================
// Photo Service
// ============================================================================

export class PhotoService extends ServiceModule {
  protected basePath = '/v1/photos';

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
   * Returns the photo record with `id` that can be used with `getTransformUrl()`.
   */
  async register(
    registerOptions: { fileId: string; userId?: string },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<PhotoInfo>> {
    return this.post<PhotoInfo>(
      '/register',
      {
        file_id: registerOptions.fileId,
        sm_user_id: registerOptions.userId
      },
      requestOptions
    );
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
