import { ServiceModule } from '../service'
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types'

export interface Session {
  id: string
  agent_id: string
  workspace_id: string
  project_id?: string
  task_id?: string
  status: string
  runtime_kind: string
  metadata?: Record<string, unknown>
  started_at?: string
  ended_at?: string
  exit_code?: number
  error_message?: string
  created_at: string
  updated_at: string
}

export interface CreateSessionResponse {
  session: Session
  session_token: string
}

export interface SessionLog {
  id: string
  session_id: string
  sequence_num: number
  log_level: string
  chunk_path: string
  byte_size: number
  line_count: number
  created_at: string
}

export interface SessionArtifact {
  id: string
  session_id: string
  artifact_type: string
  name: string
  storage_path: string
  content_type?: string
  size_bytes?: number
  metadata?: Record<string, unknown>
  created_at: string
}

export class AgentSessionsService extends ServiceModule {
  protected basePath = '/v1/agent-sessions'

  // Sessions
  async createSession(data: { agent_id: string; workspace_id: string; runtime_kind: string; project_id?: string; task_id?: string; metadata?: Record<string, unknown> }, options?: RequestOptions): Promise<ApiResponse<CreateSessionResponse>> {
    return this.post<CreateSessionResponse>('/sessions', data, options)
  }

  async listSessions(params?: PaginationParams & { application_id?: string; agent_id?: string; status?: string; project_id?: string }, options?: RequestOptions): Promise<PaginatedResponse<Session>> {
    return this._list<Session>('/sessions', params, options)
  }

  async getSession(id: string, options?: RequestOptions): Promise<ApiResponse<Session>> {
    return this._get<Session>(`/sessions/${id}`, options)
  }

  async startSession(id: string, options?: RequestOptions): Promise<ApiResponse<Session>> {
    return this.post<Session>(`/sessions/${id}/start`, undefined, options)
  }

  async endSession(id: string, data: { status: 'ended' | 'failed'; exit_code?: number; error_message?: string }, options?: RequestOptions): Promise<ApiResponse<Session>> {
    return this.post<Session>(`/sessions/${id}/end`, data, options)
  }

  // Logs
  async appendLog(sessionId: string, data: { log_level: string; chunk_path: string; byte_size: number; line_count: number }, options?: RequestOptions): Promise<ApiResponse<SessionLog>> {
    return this.post<SessionLog>(`/sessions/${sessionId}/logs`, data, options)
  }

  async listLogs(sessionId: string, options?: RequestOptions): Promise<ApiResponse<SessionLog[]>> {
    return this._get<SessionLog[]>(`/sessions/${sessionId}/logs`, options)
  }

  // Artifacts
  async addArtifact(sessionId: string, data: { artifact_type: string; name: string; storage_path: string; content_type?: string; size_bytes?: number; metadata?: Record<string, unknown> }, options?: RequestOptions): Promise<ApiResponse<SessionArtifact>> {
    return this.post<SessionArtifact>(`/sessions/${sessionId}/artifacts`, data, options)
  }

  async listArtifacts(sessionId: string, options?: RequestOptions): Promise<ApiResponse<SessionArtifact[]>> {
    return this._get<SessionArtifact[]>(`/sessions/${sessionId}/artifacts`, options)
  }
}
