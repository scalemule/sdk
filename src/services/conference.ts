/**
 * Conference Service Module
 *
 * Audio/video conferencing: call lifecycle, participants, recording, settings, stats.
 *
 * Routes:
 *   POST   /calls                          -> create call
 *   GET    /calls/{id}                     -> get call
 *   GET    /calls                          -> list calls
 *   POST   /calls/{id}/end                 -> end call
 *   POST   /calls/{id}/join               -> join call
 *   POST   /calls/{id}/leave              -> leave call
 *   GET    /calls/{id}/participants        -> list participants
 *   POST   /calls/{id}/recording/start    -> start recording
 *   POST   /calls/{id}/recording/stop     -> stop recording
 *   POST   /calls/{id}/recording/consent  -> consent to recording
 *   GET    /settings                       -> get settings
 *   PUT    /settings                       -> update settings
 *   POST   /calls/{id}/stats              -> submit WebRTC stats
 */

import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface CallSession {
  id: string;
  conversation_id?: string;
  call_type: 'audio' | 'video' | 'screen_share';
  status: 'created' | 'active' | 'ended';
  created_by: string;
  started_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  participant_count?: number;
  max_concurrent_participants?: number;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface CallParticipant {
  id: string;
  user_id: string;
  role: 'host' | 'participant' | 'viewer';
  status: 'invited' | 'joined' | 'left' | 'kicked';
  joined_at?: string;
  left_at?: string;
  duration_seconds?: number;
  has_audio: boolean;
  has_video: boolean;
}

export interface JoinCallResponse {
  call_id: string;
  livekit_url: string;
  livekit_token: string;
  participant: CallParticipant;
}

export interface ConferenceSettings {
  max_participants_per_call: number;
  max_concurrent_calls: number;
  max_call_duration_seconds: number;
  max_recording_storage_gb: number;
  recording_enabled: boolean;
  recording_auto_start: boolean;
  video_enabled: boolean;
  screen_share_enabled: boolean;
}

export interface WebrtcStats {
  bitrate_kbps?: number;
  packet_loss_pct?: number;
  jitter_ms?: number;
  round_trip_ms?: number;
  audio_level?: number;
  video_resolution?: string;
  connection_quality?: 'excellent' | 'good' | 'poor' | 'lost';
}

// ============================================================================
// Conference Service
// ============================================================================

export class ConferenceService extends ServiceModule {
  protected basePath = '/v1/conference';

  // --------------------------------------------------------------------------
  // Call Lifecycle
  // --------------------------------------------------------------------------

  async createCall(
    data: {
      conversation_id?: string;
      call_type?: 'audio' | 'video' | 'screen_share';
      metadata?: Record<string, unknown>;
    },
    options?: RequestOptions
  ): Promise<ApiResponse<CallSession>> {
    return this.post<CallSession>('/calls', data, options);
  }

  async getCall(callId: string, options?: RequestOptions): Promise<ApiResponse<CallSession>> {
    return this._get<CallSession>(`/calls/${callId}`, options);
  }

  async listCalls(
    params?: { conversation_id?: string; status?: string; page?: number; per_page?: number },
    options?: RequestOptions
  ): Promise<ApiResponse<{ data: CallSession[]; pagination: { page: number; per_page: number; total: number } }>> {
    return this._get(this.withQuery('/calls', params as Record<string, unknown>), options);
  }

  async endCall(callId: string, options?: RequestOptions): Promise<ApiResponse<CallSession>> {
    return this.post<CallSession>(`/calls/${callId}/end`, undefined, options);
  }

  // --------------------------------------------------------------------------
  // Participants
  // --------------------------------------------------------------------------

  async joinCall(callId: string, options?: RequestOptions): Promise<ApiResponse<JoinCallResponse>> {
    return this.post<JoinCallResponse>(`/calls/${callId}/join`, undefined, options);
  }

  async leaveCall(callId: string, options?: RequestOptions): Promise<ApiResponse<{ left: boolean }>> {
    return this.post<{ left: boolean }>(`/calls/${callId}/leave`, undefined, options);
  }

  async listParticipants(callId: string, options?: RequestOptions): Promise<ApiResponse<CallParticipant[]>> {
    return this._get<CallParticipant[]>(`/calls/${callId}/participants`, options);
  }

  // --------------------------------------------------------------------------
  // Recording
  // --------------------------------------------------------------------------

  async startRecording(
    callId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ recording_id: string; status: string }>> {
    return this.post(`/calls/${callId}/recording/start`, undefined, options);
  }

  async stopRecording(
    callId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ recording_id: string; status: string }>> {
    return this.post(`/calls/${callId}/recording/stop`, undefined, options);
  }

  async consentToRecording(callId: string, options?: RequestOptions): Promise<ApiResponse<{ granted: boolean }>> {
    return this.post(`/calls/${callId}/recording/consent`, undefined, options);
  }

  // --------------------------------------------------------------------------
  // Settings
  // --------------------------------------------------------------------------

  async getSettings(options?: RequestOptions): Promise<ApiResponse<ConferenceSettings>> {
    return this._get<ConferenceSettings>('/settings', options);
  }

  async updateSettings(
    data: Partial<ConferenceSettings>,
    options?: RequestOptions
  ): Promise<ApiResponse<ConferenceSettings>> {
    return this.put<ConferenceSettings>('/settings', data, options);
  }

  // --------------------------------------------------------------------------
  // Stats
  // --------------------------------------------------------------------------

  async submitStats(
    callId: string,
    stats: WebrtcStats,
    options?: RequestOptions
  ): Promise<ApiResponse<{ success: boolean }>> {
    return this.post(`/calls/${callId}/stats`, stats, options);
  }
}
