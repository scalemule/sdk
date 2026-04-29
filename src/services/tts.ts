import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

export type TtsAccessMode = 'owner_private' | 'tenant_shared' | 'public';
export type TtsSpeechProfile = 'private_default' | 'developer_summary' | 'public_blog' | 'enterprise_strict';

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

export interface TtsSpeechMetadata {
  speech_profile: TtsSpeechProfile;
  speech_profile_version: string;
  prepared_char_count: number;
}

export interface TtsSynthesizeReadyResult {
  status: 'ready';
  audio_id: string;
  cached: boolean;
  provider: string;
  chunks: number;
  speech_profile: TtsSpeechMetadata['speech_profile'];
  speech_profile_version: TtsSpeechMetadata['speech_profile_version'];
  prepared_char_count: TtsSpeechMetadata['prepared_char_count'];
  access_mode: TtsAccessMode;
  audio: TtsAudioInfo;
}

export interface TtsSynthesizeQueuedResult {
  status: 'queued';
  job_id: string;
  speech_profile: TtsSpeechMetadata['speech_profile'];
  speech_profile_version: TtsSpeechMetadata['speech_profile_version'];
  prepared_char_count: TtsSpeechMetadata['prepared_char_count'];
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
  /**
   * Built-in narration profile:
   * - private_default: pasted prose and private summaries
   * - developer_summary: technical summaries with safe spoken rewrites
   * - public_blog: public article narration
   * - enterprise_strict: stricter redaction for sensitive identifiers
   */
  speechProfile?: TtsSpeechProfile;
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
        speech_profile: params.speechProfile,
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
