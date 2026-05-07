import { ServiceModule } from '../service';
import type { ApiError, ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types';
import type { ScaleMuleClient } from '../client';
import { StorageService, type FileInfo, type MediaPolicy, type UploadOptions, type Visibility } from './storage';
import { PhotoService } from './photo';
import { VideoService } from './video';
import { AudioService } from './audio';

export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'other';
export type MediaPreset = 'hero' | 'inline' | 'thumbnail' | 'avatar' | 'logo' | 'custom';
export type MediaUploadPhase = 'presigning' | 'uploading' | 'scanning' | 'optimizing' | 'ready';

export interface MediaUploadEvent {
  phase: MediaUploadPhase;
  progress?: number;
  file_id?: string;
}

export interface MediaPresetSpec {
  widths: readonly number[];
  fit?: 'cover' | 'contain';
}

export const MEDIA_PRESETS = {
  hero: { widths: [400, 800, 1200, 1600, 2400] },
  inline: { widths: [400, 800, 1200] },
  thumbnail: { widths: [120, 240, 360], fit: 'cover' },
  avatar: { widths: [64, 128, 256], fit: 'cover' },
  logo: { widths: [120, 240, 480] }
} as const satisfies Record<Exclude<MediaPreset, 'custom'>, MediaPresetSpec>;

export interface MediaManifest {
  file_id: string;
  content_type: string;
  preset: MediaPreset | 'original';
  variants: Record<string, string>;
  srcset: string | null;
  default: string | null;
}

export interface MediaAsset {
  file_id: string;
  photo_id: string | null;
  filename: string;
  content_type: string;
  size_bytes: number;
  kind: MediaKind;
  visibility: Visibility;
  is_public: boolean;
  scan_status?: string;
  created_at: string;
  original_url: string | null;
  cdn_url: string | null;
  manifest: MediaManifest | null;
}

export interface MediaUploadResult {
  file_id: string;
  photo_id: string | null;
  original_view_url: string | null;
  optimized_url_promise: Promise<string | null>;
  hls_url_promise: Promise<string | null>;
  mime_type: string;
  is_public: boolean;
  visibility: Visibility;
  cdn_url: string | null;
  asset: MediaAsset;
}

export interface MediaUploadOptions {
  visibility?: Visibility;
  isPublic?: boolean;
  policy?: MediaPolicy;
  filename?: string;
  metadata?: Record<string, unknown>;
  preset?: MediaPreset;
  customWidths?: number[];
  prewarm?: boolean;
  onProgress?: (event: MediaUploadEvent) => void;
  signal?: AbortSignal;
  skipPhotoRegister?: boolean;
}

export interface MediaManifestOptions {
  preset?: MediaPreset;
  customWidths?: number[];
}

export class MediaService extends ServiceModule {
  protected basePath = '';

  constructor(
    client: ScaleMuleClient,
    private readonly storage: StorageService,
    private readonly photo: PhotoService,
    private readonly video: VideoService,
    private readonly audio: AudioService
  ) {
    super(client);
  }

  getPresets(): Record<Exclude<MediaPreset, 'custom'>, MediaPresetSpec> {
    return MEDIA_PRESETS;
  }

  async upload(
    file: File | Blob,
    options?: MediaUploadOptions,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<MediaUploadResult>> {
    const mimeType = (file as File).type || 'application/octet-stream';
    const kind = detectKind(mimeType);
    const visibility = resolveVisibility(options);
    const isPublic = visibility !== 'private';
    const isAnonymous = visibility === 'anonymous_visible';
    const gateOnPipeline = shouldGateOnPipeline(options?.policy);

    const emit = (phase: MediaUploadPhase, progress?: number, fileId?: string): void => {
      options?.onProgress?.({ phase, progress, file_id: fileId });
    };

    const uploadOptions: UploadOptions = {
      filename: options?.filename,
      metadata: options?.metadata,
      signal: options?.signal,
      onProgress: (progress) => emit('uploading', progress)
    };

    emit('presigning', 0);

    try {
      if (isAnonymous) {
        return await this.uploadAnonymous(file, mimeType, kind, options, requestOptions, uploadOptions, emit);
      }

      if (kind === 'image' && !options?.skipPhotoRegister) {
        return await this.uploadImage(
          file,
          mimeType,
          visibility,
          gateOnPipeline,
          options,
          requestOptions,
          uploadOptions,
          emit
        );
      }

      if (kind === 'video' && visibility === 'private') {
        const result = await this.video.uploadViaStorage(file, uploadOptions, requestOptions);
        if (result.error || !result.data) {
          return { data: null, error: result.error };
        }
        if (gateOnPipeline) {
          emit('optimizing', 100, result.data.file_id);
          await result.data.hls_url_promise;
        }
        const info = await this.fetchInfoBestEffort(result.data.file_id, requestOptions);
        const asset = this.buildAsset(
          info ?? fallbackFileInfo(result.data.file_id, mimeType, visibility, result.data.original_view_url, null),
          {
            photoId: null,
            preset: options?.preset,
            customWidths: options?.customWidths
          }
        );
        emit('ready', 100, result.data.file_id);
        return {
          data: {
            file_id: result.data.file_id,
            photo_id: null,
            original_view_url: result.data.original_view_url,
            optimized_url_promise: Promise.resolve(null),
            hls_url_promise: result.data.hls_url_promise,
            mime_type: mimeType,
            is_public: false,
            visibility,
            cdn_url: null,
            asset
          },
          error: null
        };
      }

      if (kind === 'audio' && visibility === 'private') {
        const result = await this.audio.uploadViaStorage(file, uploadOptions, requestOptions);
        if (result.error || !result.data) {
          return { data: null, error: result.error };
        }
        const info = await this.fetchInfoBestEffort(result.data.file_id, requestOptions);
        const asset = this.buildAsset(
          info ?? fallbackFileInfo(result.data.file_id, mimeType, visibility, result.data.original_view_url, null),
          {
            photoId: null,
            preset: options?.preset,
            customWidths: options?.customWidths
          }
        );
        emit('ready', 100, result.data.file_id);
        return {
          data: {
            file_id: result.data.file_id,
            photo_id: null,
            original_view_url: result.data.original_view_url,
            optimized_url_promise: Promise.resolve(null),
            hls_url_promise: Promise.resolve(null),
            mime_type: mimeType,
            is_public: false,
            visibility,
            cdn_url: null,
            asset
          },
          error: null
        };
      }

      const storageResult = isPublic
        ? await this.storage.upload(file, {
            ...uploadOptions,
            visibility: 'app_public',
            skipCompression: true
          })
        : await this.storage.uploadPrivate(file, uploadOptions);

      if (storageResult.error || !storageResult.data) {
        return { data: null, error: storageResult.error };
      }

      const fileInfo = storageResult.data;
      const asset = this.buildAsset(fileInfo, {
        photoId: null,
        preset: options?.preset,
        customWidths: options?.customWidths
      });
      emit('ready', 100, fileInfo.id);
      return {
        data: {
          file_id: fileInfo.id,
          photo_id: null,
          original_view_url: fileInfo.url ?? null,
          optimized_url_promise: Promise.resolve(null),
          hls_url_promise: Promise.resolve(null),
          mime_type: mimeType,
          is_public: fileInfo.is_public ?? isPublic,
          visibility: resolveFileVisibility(fileInfo, visibility),
          cdn_url: fileInfo.cdn_url ?? null,
          asset
        },
        error: null
      };
    } catch (error) {
      return {
        data: null,
        error: normalizeThrownError(error)
      };
    }
  }

  async get(
    fileId: string,
    options?: MediaManifestOptions,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<MediaAsset>> {
    const result = await this.storage.getInfo(fileId, requestOptions);
    if (result.error || !result.data) {
      return { data: null, error: result.error };
    }
    return {
      data: this.buildAsset(result.data, {
        photoId: null,
        preset: options?.preset,
        customWidths: options?.customWidths
      }),
      error: null
    };
  }

  async list(
    params?: PaginationParams & MediaManifestOptions,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<MediaAsset>> {
    const result = await this.storage.list(params, requestOptions);
    return {
      data: result.data.map((file) =>
        this.buildAsset(file, {
          photoId: null,
          preset: params?.preset,
          customWidths: params?.customWidths
        })
      ),
      metadata: result.metadata,
      error: result.error
    };
  }

  async delete(fileId: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    try {
      const [, storageResult] = await Promise.all([
        this.photo
          .delete(fileId, options)
          .catch(() => ({ data: null, error: null }) as ApiResponse<{ deleted: boolean }>),
        this.storage.delete(fileId, options)
      ]);
      if (storageResult.error && storageResult.error.status !== 404) {
        return { data: null, error: storageResult.error };
      }
      return { data: { deleted: true }, error: null };
    } catch (error) {
      return { data: null, error: normalizeThrownError(error) };
    }
  }

  async releaseQuarantine(
    fileId: string,
    reason = 'Released via @scalemule/sdk media.releaseQuarantine()',
    options?: RequestOptions
  ): Promise<ApiResponse<MediaAsset>> {
    const response = await this.client.post<{ file_id: string }>(
      `/v1/storage/admin/files/${fileId}/scan-override`,
      { scan_status: 'clean', reason },
      options
    );
    if (response.error) {
      return { data: null, error: response.error };
    }
    return this.get(fileId, undefined, options);
  }

  async getManifest(
    fileId: string,
    options?: MediaManifestOptions,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<MediaManifest>> {
    const asset = await this.get(fileId, options, requestOptions);
    if (asset.error || !asset.data) {
      return { data: null, error: asset.error };
    }
    return { data: asset.data.manifest, error: null };
  }

  buildAsset(file: FileInfo, options?: MediaManifestOptions & { photoId?: string | null }): MediaAsset {
    const visibility = resolveFileVisibility(file);
    const photoId = options?.photoId ?? null;
    const originalUrl =
      visibility === 'anonymous_visible' ? (file.cdn_url ?? file.url ?? null) : (file.url ?? file.cdn_url ?? null);

    return {
      file_id: file.id,
      photo_id: photoId,
      filename: file.filename,
      content_type: file.content_type,
      size_bytes: file.size_bytes,
      kind: detectKind(file.content_type),
      visibility,
      is_public: file.is_public ?? visibility !== 'private',
      scan_status: file.scan_status,
      created_at: file.created_at,
      original_url: originalUrl,
      cdn_url: file.cdn_url ?? null,
      manifest: this.buildManifest(file, options)
    };
  }

  buildManifest(file: FileInfo, options?: MediaManifestOptions): MediaManifest | null {
    const kind = detectKind(file.content_type);
    const visibility = resolveFileVisibility(file);
    const originalUrl =
      visibility === 'anonymous_visible' ? (file.cdn_url ?? file.url ?? null) : (file.url ?? file.cdn_url ?? null);

    if (!originalUrl) {
      return null;
    }

    if (kind !== 'image' || file.content_type === 'image/svg+xml') {
      return {
        file_id: file.id,
        content_type: file.content_type,
        preset: 'original',
        variants: { original: originalUrl },
        srcset: null,
        default: originalUrl
      };
    }

    const preset = options?.preset ?? 'inline';
    const spec = resolvePresetSpec(preset, options?.customWidths);
    const variants = Object.fromEntries(
      spec.widths.map((width) => [
        String(width),
        visibility === 'anonymous_visible'
          ? this.photo.getPublicTransformUrl(file.id, transformOptions(width, spec.fit))
          : this.photo.getTransformUrl(file.id, transformOptions(width, spec.fit))
      ])
    );
    const defaultWidth = pickDefaultWidth(spec.widths);
    const defaultUrl = variants[String(defaultWidth)] ?? Object.values(variants)[0] ?? originalUrl;

    return {
      file_id: file.id,
      content_type: file.content_type,
      preset,
      variants,
      srcset: spec.widths.map((width) => `${variants[String(width)]} ${width}w`).join(', '),
      default: defaultUrl
    };
  }

  private async uploadAnonymous(
    file: File | Blob,
    mimeType: string,
    kind: MediaKind,
    options: MediaUploadOptions | undefined,
    requestOptions: RequestOptions | undefined,
    uploadOptions: UploadOptions,
    emit: (phase: MediaUploadPhase, progress?: number, fileId?: string) => void
  ): Promise<ApiResponse<MediaUploadResult>> {
    const result = await this.storage.uploadAnonymous(file, uploadOptions);
    if (result.error || !result.data) {
      return { data: null, error: result.error };
    }

    emit('scanning', 100, result.data.id);
    const ready = await this.waitForAnonymousReady(result.data.id, options?.signal, emit);
    if (ready.error) {
      return { data: null, error: ready.error };
    }

    const fileInfo = (await this.fetchInfoBestEffort(result.data.id, requestOptions)) ?? {
      ...result.data,
      cdn_url: ready.cdnUrl ?? result.data.cdn_url,
      scan_status: ready.scanStatus
    };

    const manifest = this.buildManifest(fileInfo, {
      preset: options?.preset,
      customWidths: options?.customWidths
    });

    if (kind === 'image' && fileInfo.content_type !== 'image/svg+xml' && options?.prewarm !== false) {
      emit('optimizing', 100, result.data.id);
      await this.prewarmManifest(manifest, options?.signal);
    }

    const asset = this.buildAsset(fileInfo, {
      photoId: null,
      preset: options?.preset,
      customWidths: options?.customWidths
    });
    emit('ready', 100, result.data.id);
    return {
      data: {
        file_id: result.data.id,
        photo_id: null,
        original_view_url: fileInfo.cdn_url ?? null,
        optimized_url_promise: Promise.resolve(manifest?.default ?? null),
        hls_url_promise: Promise.resolve(null),
        mime_type: mimeType,
        is_public: true,
        visibility: 'anonymous_visible',
        cdn_url: fileInfo.cdn_url ?? null,
        asset
      },
      error: null
    };
  }

  private async uploadImage(
    file: File | Blob,
    mimeType: string,
    visibility: Visibility,
    gateOnPipeline: boolean,
    options: MediaUploadOptions | undefined,
    requestOptions: RequestOptions | undefined,
    uploadOptions: UploadOptions,
    emit: (phase: MediaUploadPhase, progress?: number, fileId?: string) => void
  ): Promise<ApiResponse<MediaUploadResult>> {
    if (visibility === 'private') {
      const result = await this.photo.uploadViaStorage(file, uploadOptions, requestOptions);
      if (result.error || !result.data) {
        return { data: null, error: result.error };
      }
      if (gateOnPipeline) {
        emit('optimizing', 100, result.data.file_id);
        await result.data.optimized_url_promise;
      }
      const info = await this.fetchInfoBestEffort(result.data.file_id, requestOptions);
      const asset = this.buildAsset(
        info ?? fallbackFileInfo(result.data.file_id, mimeType, visibility, result.data.original_view_url, null),
        {
          photoId: result.data.photo_id,
          preset: options?.preset,
          customWidths: options?.customWidths
        }
      );
      emit('ready', 100, result.data.file_id);
      return {
        data: {
          file_id: result.data.file_id,
          photo_id: result.data.photo_id,
          original_view_url: result.data.original_view_url,
          optimized_url_promise: result.data.optimized_url_promise,
          hls_url_promise: Promise.resolve(null),
          mime_type: mimeType,
          is_public: false,
          visibility,
          cdn_url: null,
          asset
        },
        error: null
      };
    }

    const storageResult = await this.storage.upload(file, {
      ...uploadOptions,
      visibility: 'app_public',
      skipCompression: true
    });
    if (storageResult.error || !storageResult.data) {
      return { data: null, error: storageResult.error };
    }

    const originalViewUrl = storageResult.data.url ?? null;
    const registerResult = await this.photo.register({ fileId: storageResult.data.id }, requestOptions);
    const photoId = registerResult.error || !registerResult.data ? null : registerResult.data.id;
    const optimizedUrlPromise = photoId
      ? this.pollPhotoOptimizationComplete(photoId, requestOptions)
      : Promise.resolve<string | null>(null);

    if (gateOnPipeline) {
      emit('optimizing', 100, storageResult.data.id);
      await optimizedUrlPromise;
    }

    const info = (await this.fetchInfoBestEffort(storageResult.data.id, requestOptions)) ?? storageResult.data;
    const asset = this.buildAsset(info, {
      photoId,
      preset: options?.preset,
      customWidths: options?.customWidths
    });
    emit('ready', 100, storageResult.data.id);
    return {
      data: {
        file_id: storageResult.data.id,
        photo_id: photoId,
        original_view_url: originalViewUrl,
        optimized_url_promise: optimizedUrlPromise,
        hls_url_promise: Promise.resolve(null),
        mime_type: mimeType,
        is_public: true,
        visibility,
        cdn_url: info.cdn_url ?? null,
        asset
      },
      error: null
    };
  }

  private async waitForAnonymousReady(
    fileId: string,
    signal: AbortSignal | undefined,
    emit: (phase: MediaUploadPhase, progress?: number, fileId?: string) => void
  ): Promise<{ cdnUrl: string | null; scanStatus: string | undefined; error: ApiError | null }> {
    const delays = [500, 1000, 1500, 2000, 2500, 3000];
    for (let attempt = 0; attempt < 24; attempt++) {
      if (signal?.aborted) {
        return {
          cdnUrl: null,
          scanStatus: undefined,
          error: { code: 'aborted', message: 'Upload aborted', status: 0 }
        };
      }
      const status = await this.storage.getFileStatus(fileId);
      if (status.error || !status.data) {
        await sleep(delays[Math.min(attempt, delays.length - 1)] ?? 3000);
        continue;
      }
      const scanStatus = status.data.scan.status;
      if (status.data.urls.cdn_url) {
        return { cdnUrl: status.data.urls.cdn_url, scanStatus, error: null };
      }
      if (scanStatus === 'threat' || scanStatus === 'quarantined' || scanStatus === 'error') {
        return {
          cdnUrl: null,
          scanStatus,
          error: scanError(scanStatus)
        };
      }
      emit('scanning', Math.min(99, 10 + attempt * 4), fileId);
      await sleep(delays[Math.min(attempt, delays.length - 1)] ?? 3000);
    }
    return {
      cdnUrl: null,
      scanStatus: 'pending',
      error: {
        code: 'file_scanning',
        message: 'File scan did not complete in time. Re-fetch the file status and publish once cdn_url appears.',
        status: 202
      }
    };
  }

  private async fetchInfoBestEffort(fileId: string, requestOptions?: RequestOptions): Promise<FileInfo | null> {
    const result = await this.storage.getInfo(fileId, requestOptions);
    return result.error || !result.data ? null : result.data;
  }

  private async pollPhotoOptimizationComplete(
    photoId: string,
    requestOptions?: RequestOptions
  ): Promise<string | null> {
    for (let attempt = 0; attempt < 40; attempt++) {
      const result = await this.photo.get(photoId, requestOptions);
      const status = (result.data as ({ optimization_status?: string } & Record<string, unknown>) | null)
        ?.optimization_status;
      if (status === 'completed') {
        return this.photo.getTransformUrl(photoId, { width: 1200 });
      }
      await sleep(250);
    }
    return null;
  }

  private async prewarmManifest(manifest: MediaManifest | null, signal: AbortSignal | undefined): Promise<void> {
    if (!manifest || manifest.preset === 'original') {
      return;
    }
    const urls = Object.values(manifest.variants);
    await Promise.all(
      urls.map(async (url) => {
        try {
          const response = await fetch(url, {
            method: 'GET',
            signal,
            headers: {
              Accept: 'image/avif,image/webp,image/*,*/*;q=0.8'
            }
          });
          if (!response.ok) {
            throw new Error(`Prewarm failed with HTTP ${response.status}`);
          }
          await response.arrayBuffer();
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn('[scalemule-sdk] media prewarm failed', url, error);
        }
      })
    );
  }
}

function detectKind(contentType: string): MediaKind {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  if (
    contentType.includes('pdf') ||
    contentType.includes('text/') ||
    contentType.includes('word') ||
    contentType.includes('sheet') ||
    contentType.includes('presentation')
  ) {
    return 'document';
  }
  return 'other';
}

function resolveVisibility(options?: { visibility?: Visibility; isPublic?: boolean }): Visibility {
  if (options?.visibility) return options.visibility;
  if (options?.isPublic === true) return 'app_public';
  return 'private';
}

function resolveFileVisibility(
  file: Pick<FileInfo, 'visibility' | 'is_public'>,
  fallback: Visibility = 'private'
): Visibility {
  if (file.visibility) return file.visibility;
  if (file.is_public === true) return 'app_public';
  return fallback;
}

function shouldGateOnPipeline(policy?: MediaPolicy): boolean {
  return policy === 'safe_public' || policy === 'moderated' || policy === 'compliance';
}

function resolvePresetSpec(preset: MediaPreset, customWidths?: number[]): MediaPresetSpec {
  if (preset === 'custom') {
    const widths = Array.from(
      new Set((customWidths ?? []).filter((value) => Number.isFinite(value) && value > 0))
    ).sort((a, b) => a - b);
    return { widths: widths.length > 0 ? widths : MEDIA_PRESETS.inline.widths };
  }
  return MEDIA_PRESETS[preset];
}

function transformOptions(width: number, fit?: 'cover' | 'contain') {
  return fit === 'cover'
    ? { width, height: width, fit: 'cover' as const }
    : { width, fit: fit ?? ('contain' as const) };
}

function pickDefaultWidth(widths: readonly number[]): number {
  if (widths.includes(1200)) return 1200;
  return widths[Math.floor(widths.length / 2)] ?? widths[0] ?? 0;
}

function fallbackFileInfo(
  fileId: string,
  contentType: string,
  visibility: Visibility,
  originalUrl: string | null,
  cdnUrl: string | null
): FileInfo {
  return {
    id: fileId,
    filename: fileId,
    content_type: contentType,
    size_bytes: 0,
    is_public: visibility !== 'private',
    visibility,
    cdn_url: cdnUrl ?? undefined,
    url: originalUrl ?? undefined,
    created_at: new Date().toISOString()
  };
}

function normalizeThrownError(error: unknown): ApiError {
  if (typeof error === 'object' && error && 'code' in error && 'message' in error) {
    return error as ApiError;
  }
  return {
    code: 'upload_error',
    message: error instanceof Error ? error.message : 'Media operation failed',
    status: 500
  };
}

function scanError(status: string): ApiError {
  switch (status) {
    case 'threat':
      return {
        code: 'file_threat',
        message: 'File was flagged as malicious during scanning.',
        status: 409
      };
    case 'quarantined':
      return {
        code: 'file_quarantined',
        message: 'File was quarantined during scanning.',
        status: 409
      };
    default:
      return {
        code: 'upload_error',
        message: 'File scan failed.',
        status: 500
      };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
