/**
 * Video Service Module
 *
 * 3-step chunked upload flow (hidden from developer):
 *   1. POST /upload-start              → get video_id, upload_id, s3_key
 *   2. POST /{id}/upload-part (×N)     → upload chunks, get etags
 *   3. POST /{id}/upload-complete      → finalize, trigger transcode
 *
 * Streaming:
 *   GET /{id}/playlist.m3u8            → HLS master playlist
 *   GET /{id}/stream/{q}/index.m3u8   → quality-specific playlist
 *
 * Analytics:
 *   POST /{id}/track                   → playback events
 *   GET  /{id}/analytics               → video metrics
 */

import { ServiceModule } from '../service'
import type { ApiResponse, RequestOptions } from '../types'

// ============================================================================
// Types
// ============================================================================

export interface VideoUploadOptions {
  /** Custom filename */
  filename?: string
  /** Video title */
  title?: string
  /** Video description */
  description?: string
  /** Custom metadata */
  metadata?: Record<string, unknown>
  /** Upload progress callback (0-100) */
  onProgress?: (percent: number) => void
  /** AbortSignal for cancellation */
  signal?: AbortSignal
  /** Chunk size in bytes (default: 5MB) */
  chunkSize?: number
}

export interface VideoInfo {
  id: string
  title?: string
  description?: string
  status: string
  duration_seconds?: number
  width?: number
  height?: number
  content_type: string
  size_bytes: number
  qualities?: string[]
  thumbnail_url?: string
  created_at: string
  updated_at: string
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024 // 5MB
const MIN_CHUNK_SIZE = 5 * 1024 * 1024 // S3 minimum part size

// ============================================================================
// Video Service
// ============================================================================

export class VideoService extends ServiceModule {
  protected basePath = '/v1/videos'

  // --------------------------------------------------------------------------
  // Upload (3-step chunked flow)
  // --------------------------------------------------------------------------

  /**
   * Upload a video file using chunked multipart upload.
   *
   * Internally:
   *   1. Starts a multipart upload session
   *   2. Uploads chunks sequentially with progress tracking
   *   3. Completes the upload, triggering transcoding
   *
   * @returns The video record with id, status, etc.
   */
  async upload(
    file: File | Blob,
    options?: VideoUploadOptions,
    requestOptions?: RequestOptions,
  ): Promise<ApiResponse<VideoInfo>> {
    if (options?.signal?.aborted) {
      return { data: null, error: { code: 'aborted', message: 'Upload aborted', status: 0 } }
    }

    const chunkSize = Math.max(options?.chunkSize ?? DEFAULT_CHUNK_SIZE, MIN_CHUNK_SIZE)
    const totalChunks = Math.ceil(file.size / chunkSize)
    const filename = options?.filename || (file as File).name || 'video'

    // Step 1: Start upload session
    const startResult = await this.post<{
      video_id: string
      upload_id: string
      s3_key: string
    }>('/upload-start', {
      filename,
      content_type: file.type || 'video/mp4',
      size_bytes: file.size,
      title: options?.title,
      description: options?.description,
      metadata: options?.metadata,
    }, requestOptions)

    if (startResult.error) return { data: null, error: startResult.error }

    const { video_id, upload_id } = startResult.data!
    const parts: Array<{ part_number: number; etag: string }> = []

    // Step 2: Upload chunks
    for (let i = 0; i < totalChunks; i++) {
      if (options?.signal?.aborted) {
        return { data: null, error: { code: 'aborted', message: 'Upload aborted', status: 0 } }
      }

      const start = i * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      const chunk = file.slice(start, end)
      const partNumber = i + 1

      const partResult = await this.uploadPart(
        video_id,
        upload_id,
        partNumber,
        chunk,
        options?.signal,
      )

      if (partResult.error) return { data: null, error: partResult.error }

      parts.push({
        part_number: partNumber,
        etag: partResult.data!.etag,
      })

      // Report progress
      if (options?.onProgress) {
        const progress = Math.round((partNumber / totalChunks) * 100)
        options.onProgress(progress)
      }
    }

    // Step 3: Complete upload
    const completeResult = await this.post<VideoInfo>(`/${video_id}/upload-complete`, {
      upload_id,
      parts,
    }, requestOptions)

    return completeResult
  }

  // --------------------------------------------------------------------------
  // Video Operations
  // --------------------------------------------------------------------------

  /** Get video metadata and status. */
  async get(videoId: string, options?: RequestOptions): Promise<ApiResponse<VideoInfo>> {
    return super._get<VideoInfo>(`/${videoId}`, options)
  }

  /**
   * Get the HLS master playlist URL for streaming.
   * Returns the playlist URL that can be passed to a video player.
   */
  async getStreamUrl(videoId: string): Promise<ApiResponse<{ url: string }>> {
    // The master playlist is served directly at this path
    const baseUrl = this.client.getBaseUrl()
    return {
      data: { url: `${baseUrl}${this.basePath}/${videoId}/playlist.m3u8` },
      error: null,
    }
  }

  /**
   * Track a playback event (view, play, pause, seek, complete, etc.).
   */
  async trackPlayback(videoId: string, event: {
    event_type: string
    position_seconds?: number
    quality?: string
    duration_seconds?: number
  }, options?: RequestOptions) {
    return this.post<{ tracked: boolean }>(`/${videoId}/track`, event, options)
  }

  /** Get video analytics (views, watch time, etc.). */
  async getAnalytics(videoId: string, options?: RequestOptions): Promise<ApiResponse<{ views: number; watch_time_seconds: number; completions?: number }>> {
    return super._get<{ views: number; watch_time_seconds: number; completions?: number }>(`/${videoId}/analytics`, options)
  }

  /**
   * Update a video's access mode (public/private).
   * Public videos get 7-day signed URLs; private get 1-hour signed URLs.
   */
  async updateAccessMode(videoId: string, accessMode: 'public' | 'private', options?: RequestOptions): Promise<ApiResponse<{ video_id: string; access_mode: string }>> {
    return this.patch<{ video_id: string; access_mode: string }>(`/${videoId}`, { access_mode: accessMode }, options)
  }

  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------

  /** @deprecated Use upload() instead */
  async uploadVideo(
    file: File | Blob,
    options?: {
      metadata?: Record<string, unknown>
      onProgress?: (progress: number) => void
      signal?: AbortSignal
    },
  ) {
    return this.upload(file, {
      metadata: options?.metadata,
      onProgress: options?.onProgress,
      signal: options?.signal,
    })
  }

  /** @deprecated Use get() instead */
  async getVideo(id: string) {
    return this.get(id)
  }

  // --------------------------------------------------------------------------
  // Private: Chunk upload
  // --------------------------------------------------------------------------

  private async uploadPart(
    videoId: string,
    uploadId: string,
    partNumber: number,
    chunk: Blob,
    signal?: AbortSignal,
  ): Promise<ApiResponse<{ part_number: number; etag: string }>> {
    // Build form data for the part
    const formData = new FormData()
    formData.append('file', chunk)

    const path = `${this.basePath}/${videoId}/upload-part?upload_id=${encodeURIComponent(uploadId)}&part_number=${partNumber}`

    // Use raw client request since we need multipart
    const headers: Record<string, string> = {
      'x-api-key': this.client.getApiKey(),
    }
    const token = this.client.getSessionToken()
    if (token) headers['Authorization'] = `Bearer ${token}`

    try {
      const response = await fetch(`${this.client.getBaseUrl()}${path}`, {
        method: 'POST',
        headers,
        body: formData,
        signal,
      })

      const data = await response.json()

      if (!response.ok) {
        return {
          data: null,
          error: {
            code: data?.error?.code || 'upload_error',
            message: data?.error?.message || data?.message || 'Part upload failed',
            status: response.status,
          },
        }
      }

      const result = data?.data !== undefined ? data.data : data
      return { data: result, error: null }
    } catch (err) {
      if (signal?.aborted) {
        return { data: null, error: { code: 'aborted', message: 'Upload aborted', status: 0 } }
      }
      return {
        data: null,
        error: {
          code: 'upload_error',
          message: err instanceof Error ? err.message : 'Part upload failed',
          status: 0,
        },
      }
    }
  }
}
