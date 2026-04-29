import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

export type TtsAccessMode = 'owner_private' | 'tenant_shared' | 'public';

export interface TtsAudioInfo {
  id: string;
  status: string;
  access_mode: TtsAccessMode;
  codec?: string | null;
  duration_ms?: number | null;
  bit_rate_kbps?: number | null;
  waveform_peaks?: unknown;
  url?: string | null;
  expires_at?: string | null;
}

export interface TtsSynthesizeReadyResult {
  status: 'ready';
  audio_id: string;
  cached: boolean;
  provider: string;
  chunks: number;
  access_mode: TtsAccessMode;
  audio: TtsAudioInfo;
}

export interface TtsSynthesizeQueuedResult {
  status: 'queued';
  job_id: string;
}

export type TtsSynthesizeResult = TtsSynthesizeReadyResult | TtsSynthesizeQueuedResult;

export interface TtsJobStatus {
  id: string;
  access_mode: TtsAccessMode;
  provider: string;
  voice: string;
  model: string;
  format: string;
  status: 'queued' | 'chunking' | 'synthesizing' | 'concatenating' | 'ready' | 'failed';
  chunk_total: number;
  chunk_done: number;
  audio_id?: string | null;
  audio?: TtsAudioInfo | null;
  error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TtsVoice {
  provider: string;
  id: string;
  display_name: string;
  language?: string | null;
  gender?: string | null;
  preview_url?: string | null;
}

export interface TtsVoicesResponse {
  provider: string;
  voices: TtsVoice[];
}

export interface TtsSynthesizeParams {
  text: string;
  voice?: string;
  model?: string;
  provider?: string;
  async?: boolean;
  accessMode?: TtsAccessMode;
}

export interface TtsListVoicesParams {
  provider?: string;
}

export class TtsService extends ServiceModule {
  protected basePath = '/v1/tts';

  async synthesize(params: TtsSynthesizeParams, options?: RequestOptions): Promise<ApiResponse<TtsSynthesizeResult>> {
    return this.post<TtsSynthesizeResult>(
      '/synthesize',
      {
        text: params.text,
        voice: params.voice,
        model: params.model,
        provider: params.provider,
        async: params.async,
        access_mode: params.accessMode
      },
      options
    );
  }

  async getJob(id: string, options?: RequestOptions): Promise<ApiResponse<TtsJobStatus>> {
    return this._get<TtsJobStatus>(`/jobs/${id}`, options);
  }

  async listVoices(params?: TtsListVoicesParams, options?: RequestOptions): Promise<ApiResponse<TtsVoicesResponse>> {
    return this._get<TtsVoicesResponse>(this.withQuery('/voices', { provider: params?.provider }), options);
  }
}
