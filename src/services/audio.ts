/**
 * Audio service — typed wrapper over `/v1/audios`.
 *
 * Phase 5 MVP scope:
 *   - `uploadViaStorage()` — presigned-direct-to-S3 upload + register flow,
 *     mirrors `photo.uploadViaStorage()` and `video.uploadViaStorage()`.
 *   - `register()` — explicitly register an already-uploaded storage file
 *     with the audio service so it gets typed metadata + ownership.
 *
 * Out of scope today (future phases): waveform peaks, codec normalization,
 * derivative transcoding profiles. The audio service stores metadata; the
 * actual bytes live in scalemule-storage and are served via the storage
 * view URL. Once the audio worker ships, this service will gain a
 * `transcoded_url_promise` field analogous to photo's
 * `optimized_url_promise`.
 */
import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';
import type { FileInfo } from './storage';
import { StorageService } from './storage';
import { ScaleMuleClient } from '../client';

/** Result of {@link AudioService.register}. */
export interface AudioRegisterResult {
  /** Audio service id. `audio_id == file_id` invariant holds. */
  audio_id: string;
  /** Storage file_id (same as `audio_id`). */
  file_id: string;
  /** `'ready'` once the audio row exists. The audio service's pipeline
   * is metadata-only today; bytes are immediately playable via the
   * storage view URL. */
  status: 'ready' | 'processing' | 'failed';
}

/** Result of {@link AudioService.uploadViaStorage}. */
export interface AudioUploadViaStorageResult {
  /** Storage file_id. */
  file_id: string;
  /** Audio service id (== file_id). `null` when register failed but the
   * storage upload succeeded — the file is still usable as a generic
   * private file. */
  audio_id: string | null;
  /** Short-lived signed URL to the original bytes. Usable immediately. */
  original_view_url: string | null;
}

export class AudioService extends ServiceModule {
  protected basePath = '/v1/audios';

  /**
   * @param storage Required for {@link uploadViaStorage}. Wired up by the
   *   top-level {@link ScaleMule} constructor — most call sites should not
   *   instantiate `AudioService` directly.
   */
  constructor(
    client: ScaleMuleClient,
    private readonly storage: StorageService
  ) {
    super(client);
  }

  /**
   * Register a storage-uploaded audio asset with the audio service.
   * Idempotent — re-calling with the same `file_id` returns the existing
   * record.
   */
  async register(
    args: { fileId: string; userId?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<AudioRegisterResult>> {
    return this.post<AudioRegisterResult>(
      '/register',
      { file_id: args.fileId, sm_user_id: args.userId },
      options
    );
  }

  /**
   * Upload a file to storage (browser → S3 direct, private, uncompressed)
   * and register it with the audio service.
   *
   * Mirrors `photo.uploadViaStorage()` / `video.uploadViaStorage()`. If
   * `register()` fails after a successful storage upload, the file is *not*
   * lost — the returned `file_id` is still valid as a generic private storage
   * file. The SDK logs a warning and returns `audio_id: null`.
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
  ): Promise<ApiResponse<AudioUploadViaStorageResult>> {
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

    // Step 2 — register with audio service.
    const registerResult = await this.register(
      { fileId, userId: uploadOptions?.userId },
      requestOptions
    );

    if (registerResult.error || !registerResult.data) {
      // Surface as success — caller has a valid file_id. Audio service
      // didn't accept it but the bytes are usable.
      // eslint-disable-next-line no-console
      console.warn(
        '[scalemule-sdk] audio.register() failed after storage upload; typed audio metadata unavailable.',
        registerResult.error
      );
      return {
        data: {
          file_id: fileId,
          audio_id: null,
          original_view_url: originalViewUrl
        },
        error: null
      };
    }

    return {
      data: {
        file_id: fileId,
        audio_id: registerResult.data.audio_id,
        original_view_url: originalViewUrl
      },
      error: null
    };
  }
}
