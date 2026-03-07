import { ServiceModule } from '../service'
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types'
import type { SecurityLayers } from './agent-auth'

export interface AgentResponse {
  id: string
  auth_user_id?: string
  name: string
  agent_type: string
  description?: string
  status: string
  default_workspace_id?: string
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface RegisterAgentRequest {
  name: string
  agent_type?: string
  description?: string
  metadata?: Record<string, unknown>
  project_ids?: string[]
  agent_platform?: string
  agent_identifier?: string
  owner_contact_email?: string
  capabilities?: string[]
  model_name?: string
  model_version?: string
  model_provider?: string
  public_key_pem?: string
  ip_allowlist?: string[]
  enable_short_lived_tokens?: boolean
}

export interface RegisterAgentResponse {
  agent_id: string
  agent_token: string
  refresh_secret?: string
  signing_key_fingerprint?: string
  security_layers: SecurityLayers
  warnings?: string[]
}

export interface RuntimeTemplate {
  id: string
  name: string
  description?: string
  runtime_kind: string
  status: string
  created_at: string
  updated_at: string
}

export interface RuntimeTemplateVersion {
  id: string
  template_id: string
  version_number: number
  config: Record<string, unknown>
  changelog?: string
  effective_from: string
  effective_to?: string
  created_at: string
}

export interface Workspace {
  id: string
  agent_id?: string
  template_version_id: string
  name: string
  description?: string
  status: string
  config_overrides?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export class AgentsService extends ServiceModule {
  protected basePath = '/v1/agents'

  // Orchestrated registration
  async registerAgent(data: RegisterAgentRequest, options?: RequestOptions): Promise<ApiResponse<RegisterAgentResponse>> {
    return this.post<RegisterAgentResponse>('/register-agent', data, options)
  }

  async deactivateAgent(id: string, options?: RequestOptions): Promise<ApiResponse<{ message: string }>> {
    return this.post<{ message: string }>(`/agents/${id}/deactivate`, undefined, options)
  }

  // Agent CRUD
  async create(data: { name: string; agent_type?: string; description?: string; metadata?: Record<string, unknown> }, options?: RequestOptions): Promise<ApiResponse<AgentResponse>> {
    return this.post<AgentResponse>('/agents', data, options)
  }

  async list(params?: PaginationParams & { application_id?: string }, options?: RequestOptions): Promise<PaginatedResponse<AgentResponse>> {
    return this._list<AgentResponse>('/agents', params, options)
  }

  async get(id: string, options?: RequestOptions): Promise<ApiResponse<AgentResponse>> {
    return this._get<AgentResponse>(`/agents/${id}`, options)
  }

  async update(id: string, data: Partial<{ name: string; agent_type: string; description: string; status: string; metadata: Record<string, unknown> }>, options?: RequestOptions): Promise<ApiResponse<AgentResponse>> {
    return this.patch<AgentResponse>(`/agents/${id}`, data, options)
  }

  async remove(id: string, options?: RequestOptions): Promise<ApiResponse<void>> {
    return this.del<void>(`/agents/${id}`, options)
  }

  async setDefaultWorkspace(id: string, data: { workspace_id: string }, options?: RequestOptions): Promise<ApiResponse<AgentResponse>> {
    return this.post<AgentResponse>(`/agents/${id}/set-default-workspace`, data, options)
  }

  // Runtime Templates
  async createTemplate(data: { name: string; description?: string; runtime_kind: string }, options?: RequestOptions): Promise<ApiResponse<RuntimeTemplate>> {
    return this.post<RuntimeTemplate>('/runtime-templates', data, options)
  }

  async listTemplates(params?: PaginationParams & { application_id?: string }, options?: RequestOptions): Promise<PaginatedResponse<RuntimeTemplate>> {
    return this._list<RuntimeTemplate>('/runtime-templates', params, options)
  }

  async getTemplate(id: string, options?: RequestOptions): Promise<ApiResponse<{ template: RuntimeTemplate; versions: RuntimeTemplateVersion[] }>> {
    return this._get<{ template: RuntimeTemplate; versions: RuntimeTemplateVersion[] }>(`/runtime-templates/${id}`, options)
  }

  async createTemplateVersion(id: string, data: { config: Record<string, unknown>; changelog?: string }, options?: RequestOptions): Promise<ApiResponse<RuntimeTemplateVersion>> {
    return this.post<RuntimeTemplateVersion>(`/runtime-templates/${id}/versions`, data, options)
  }

  async listTemplateVersions(id: string, options?: RequestOptions): Promise<ApiResponse<RuntimeTemplateVersion[]>> {
    return this._get<RuntimeTemplateVersion[]>(`/runtime-templates/${id}/versions`, options)
  }

  // Workspaces
  async createWorkspace(data: { template_version_id: string; name: string; description?: string; agent_id?: string; config_overrides?: Record<string, unknown> }, options?: RequestOptions): Promise<ApiResponse<Workspace>> {
    return this.post<Workspace>('/workspaces', data, options)
  }

  async listWorkspaces(params?: PaginationParams & { application_id?: string }, options?: RequestOptions): Promise<PaginatedResponse<Workspace>> {
    return this._list<Workspace>('/workspaces', params, options)
  }

  async getWorkspace(id: string, options?: RequestOptions): Promise<ApiResponse<Workspace>> {
    return this._get<Workspace>(`/workspaces/${id}`, options)
  }

  async updateWorkspace(id: string, data: Partial<{ name: string; description: string; status: string; config_overrides: Record<string, unknown> }>, options?: RequestOptions): Promise<ApiResponse<Workspace>> {
    return this.patch<Workspace>(`/workspaces/${id}`, data, options)
  }

  async addOsAccount(workspaceId: string, data: { username: string; auth_type: string; secret_ref: string }, options?: RequestOptions): Promise<ApiResponse<{ id: string; workspace_id: string; username: string; auth_type: string }>> {
    return this.post(`/workspaces/${workspaceId}/os-accounts`, data, options)
  }
}
