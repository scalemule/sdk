/**
 * Creator Maker Service Module
 *
 * Thin integration for AI image/clip generation via the creator-maker service.
 * For rich features (React hooks, waitForJob, WebSocket status), use
 * the standalone @scalemule/creator-maker package instead.
 */

import { ServiceModule } from '../service';
import type { ApiResponse, PaginatedResponse, RequestOptions } from '../types';

// ── Types ──

export interface GenerateInput {
  project_id?: string;
  output_type: 'image' | 'clip';
  content_mode: 'promo' | 'cartoon';
  aspect_ratio: '9:16' | '16:9' | '1:1';
  style_preset_slug?: string;
  prompt: string;
  provider_mode?: 'auto' | 'fast' | 'balanced' | 'quality';
  source_assets?: Array<{
    storage_file_id: string;
    role: 'reference' | 'init_image' | 'style_ref';
    weight?: number;
  }>;
  composition?: {
    caption?: string;
    watermark?: boolean;
  };
}

export interface GenerationJob {
  id: string;
  project_id: string;
  output_type: string;
  content_mode: string;
  aspect_ratio: string;
  prompt: string;
  status: string;
  estimated_credits: number;
  actual_credits?: number;
  outputs: GenerationOutput[];
  error_code?: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

export interface GenerationOutput {
  id: string;
  output_type: string;
  cdn_url?: string;
  width: number;
  height: number;
  mime_type: string;
  created_at: string;
}

export interface StylePreset {
  id: string;
  mode: string;
  slug: string;
  name: string;
  description?: string;
  thumbnail_url?: string;
  estimated_credits: number;
}

export interface CreatorUsage {
  balance_credits: number;
  total_generations: number;
  completed_generations: number;
}

export interface CreateProjectInput {
  title?: string;
  content_mode: 'promo' | 'cartoon';
}

export interface CreatorProject {
  id: string;
  title: string;
  content_mode: string;
  created_at: string;
  updated_at: string;
}

// ── Service Module ──

export class CreatorMakerService extends ServiceModule {
  protected basePath = '/v1/creator-maker';

  /** Submit a generation job. */
  async generate(data: GenerateInput, options?: RequestOptions): Promise<ApiResponse<GenerationJob>> {
    return this.post<GenerationJob>('/jobs', data, options);
  }

  /** Get a generation job by ID. */
  async getJob(jobId: string, options?: RequestOptions): Promise<ApiResponse<GenerationJob>> {
    return this._get<GenerationJob>(`/jobs/${jobId}`, options);
  }

  /** Long-poll for job completion (server holds up to 30s). */
  async pollJob(jobId: string, options?: RequestOptions): Promise<ApiResponse<GenerationJob>> {
    return this._get<GenerationJob>(`/jobs/${jobId}/poll`, {
      ...options,
      timeout: 35_000
    });
  }

  /** List the current user's generation jobs. */
  async listJobs(
    params?: Record<string, unknown>,
    options?: RequestOptions
  ): Promise<PaginatedResponse<GenerationJob>> {
    return this._list<GenerationJob>('/jobs', params, options);
  }

  /** Cancel a pending or queued job. */
  async cancelJob(jobId: string, options?: RequestOptions): Promise<ApiResponse<{ id: string; status: string }>> {
    return this.post(`/jobs/${jobId}/cancel`, undefined, options);
  }

  /** Retry a failed job. */
  async retryJob(jobId: string, options?: RequestOptions): Promise<ApiResponse<GenerationJob>> {
    return this.post<GenerationJob>(`/jobs/${jobId}/retry`, undefined, options);
  }

  /** Generate variations of a completed job. */
  async generateVariations(jobId: string, options?: RequestOptions): Promise<ApiResponse<GenerationJob[]>> {
    return this.post<GenerationJob[]>(`/jobs/${jobId}/variations`, undefined, options);
  }

  /** List available style presets, optionally filtered by mode. */
  async listPresets(params?: { mode?: string }, options?: RequestOptions): Promise<ApiResponse<StylePreset[]>> {
    return this._get<StylePreset[]>(this.withQuery('/presets', params), options);
  }

  /** Get a style preset by slug. */
  async getPreset(slug: string, options?: RequestOptions): Promise<ApiResponse<StylePreset>> {
    return this._get<StylePreset>(`/presets/${slug}`, options);
  }

  /** Create a project. */
  async createProject(data: CreateProjectInput, options?: RequestOptions): Promise<ApiResponse<CreatorProject>> {
    return this.post<CreatorProject>('/projects', data, options);
  }

  /** List the current user's projects. */
  async listProjects(
    params?: Record<string, unknown>,
    options?: RequestOptions
  ): Promise<PaginatedResponse<CreatorProject>> {
    return this._list<CreatorProject>('/projects', params, options);
  }

  /** Get generation usage and credit balance. */
  async getUsage(options?: RequestOptions): Promise<ApiResponse<CreatorUsage>> {
    return this._get<CreatorUsage>('/usage', options);
  }

  /** Get a generation output by ID. */
  async getOutput(outputId: string, options?: RequestOptions): Promise<ApiResponse<GenerationOutput>> {
    return this._get<GenerationOutput>(`/outputs/${outputId}`, options);
  }

  /** Get a download URL for a generation output. */
  async getDownloadUrl(outputId: string, options?: RequestOptions): Promise<ApiResponse<{ cdn_url: string }>> {
    return this._get(`/outputs/${outputId}/download`, options);
  }
}
