import { ServiceModule } from '../service'
import type { ApiResponse, RequestOptions } from '../types'

export interface AuthRegisterAgentRequest {
  name: string
  agent_platform: string
  agent_identifier?: string
  description?: string
  email?: string
  phone?: string
  owner_contact_email?: string
  capabilities?: string[]
  model_name?: string
  model_version?: string
  model_provider?: string
  metadata?: Record<string, unknown>
  public_key_pem?: string
  ip_allowlist?: string[]
  enable_short_lived_tokens?: boolean
}

export interface SecurityLayers {
  request_signing: boolean
  ip_binding: boolean
  short_lived_tokens: boolean
}

export interface AuthRegisterAgentResponse {
  user_id: string
  name: string
  agent_token: string
  refresh_secret?: string
  signing_key_fingerprint?: string
  security_layers: SecurityLayers
}

export interface AgentToken {
  id: string
  name: string
  scopes?: string[]
  ip_allowlist?: string[]
  expires_at?: string
  last_used_at?: string
  created_at: string
}

export interface AgentSigningKey {
  id: string
  fingerprint: string
  key_algorithm: string
  status: string
  last_used_at?: string
  created_at: string
}

export interface AgentProfile {
  id: string
  full_name: string
  email: string
  phone?: string
  agent_platform?: string
  agent_identifier?: string
  agent_capabilities?: string
  owner_contact_email?: string
  agent_model_name?: string
  agent_model_version?: string
  agent_model_provider?: string
  created_at: string
}

export interface AgentSecurityPolicy {
  allow_agent_registration: boolean
  require_request_signing: boolean
  require_ip_binding: boolean
  require_short_lived_tokens: boolean
  max_tokens_per_agent: number
}

export class AgentAuthService extends ServiceModule {
  protected basePath = '/v1/auth'

  async registerAgent(data: AuthRegisterAgentRequest, options?: RequestOptions): Promise<ApiResponse<AuthRegisterAgentResponse>> {
    return this.post<AuthRegisterAgentResponse>('/register/agent', data, options)
  }

  async listTokens(options?: RequestOptions): Promise<ApiResponse<{ tokens: AgentToken[] }>> {
    return this._get<{ tokens: AgentToken[] }>('/agent-tokens', options)
  }

  async createToken(data: { name: string; scopes?: string[]; ip_allowlist?: string[]; expires_in_days?: number }, options?: RequestOptions): Promise<ApiResponse<{ id: string; token: string; name: string; expires_at?: string }>> {
    return this.post('/agent-tokens', data, options)
  }

  async revokeToken(id: string, options?: RequestOptions): Promise<ApiResponse<{ message: string }>> {
    return this.del<{ message: string }>(`/agent-tokens/${id}`, options)
  }

  async rotateToken(id: string, options?: RequestOptions): Promise<ApiResponse<{ new_token: string; old_token_grace_expires_at: string }>> {
    return this.post(`/agent-tokens/${id}/rotate`, undefined, options)
  }

  async exchangeToken(data: { refresh_secret: string; ttl_minutes?: number }, options?: RequestOptions): Promise<ApiResponse<{ access_token: string; expires_in: number }>> {
    return this.post('/agent-tokens/exchange', data, options)
  }

  async listSigningKeys(options?: RequestOptions): Promise<ApiResponse<{ keys: AgentSigningKey[] }>> {
    return this._get<{ keys: AgentSigningKey[] }>('/agent-signing-keys', options)
  }

  async addSigningKey(data: { public_key_pem: string }, options?: RequestOptions): Promise<ApiResponse<{ id: string; fingerprint: string }>> {
    return this.post('/agent-signing-keys', data, options)
  }

  async revokeSigningKey(id: string, options?: RequestOptions): Promise<ApiResponse<{ message: string }>> {
    return this.del<{ message: string }>(`/agent-signing-keys/${id}`, options)
  }

  async getProfile(options?: RequestOptions): Promise<ApiResponse<AgentProfile>> {
    return this._get<AgentProfile>('/agent-profile', options)
  }

  async updateProfile(data: Partial<{ model_name: string; model_version: string; model_provider: string; capabilities: string[]; owner_contact_email: string }>, options?: RequestOptions): Promise<ApiResponse<{ message: string }>> {
    return this.patch<{ message: string }>('/agent-profile', data, options)
  }

  async getSecurityPolicy(appId: string, options?: RequestOptions): Promise<ApiResponse<AgentSecurityPolicy>> {
    return this._get<AgentSecurityPolicy>(`/applications/${appId}/agent-security`, options)
  }

  async updateSecurityPolicy(appId: string, data: Partial<AgentSecurityPolicy>, options?: RequestOptions): Promise<ApiResponse<AgentSecurityPolicy>> {
    return this.put<AgentSecurityPolicy>(`/applications/${appId}/agent-security`, data, options)
  }
}
