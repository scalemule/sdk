import { ServiceModule } from '../service';
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types';

export interface Tool {
  id: string;
  name: string;
  description?: string;
  tool_type: string;
  status: string;
  config?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ToolCapability {
  id: string;
  tool_id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface ToolIntegration {
  id: string;
  name: string;
  tool_id: string;
  status: string;
  config?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Credential {
  id: string;
  name: string;
  credential_type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CredentialScope {
  id: string;
  credential_id: string;
  scope: string;
  created_at: string;
}

export interface AgentToolEntitlement {
  id: string;
  agent_id: string;
  tool_id: string;
  status: string;
  created_at: string;
}

export interface DataSource {
  id: string;
  name: string;
  source_type: string;
  status: string;
  config?: Record<string, unknown>;
  created_at: string;
}

export interface DataAccessPolicy {
  id: string;
  data_source_id: string;
  agent_id?: string;
  policy_type: string;
  created_at: string;
}

export class AgentToolsService extends ServiceModule {
  protected basePath = '/v1/agent-tools';

  // Tools
  async createTool(
    data: { name: string; description?: string; tool_type: string; config?: Record<string, unknown> },
    options?: RequestOptions
  ): Promise<ApiResponse<Tool>> {
    return this.post<Tool>('/tools', data, options);
  }

  async listTools(
    params?: PaginationParams & { application_id?: string },
    options?: RequestOptions
  ): Promise<PaginatedResponse<Tool>> {
    return this._list<Tool>('/tools', params, options);
  }

  async getTool(id: string, options?: RequestOptions): Promise<ApiResponse<Tool>> {
    return this._get<Tool>(`/tools/${id}`, options);
  }

  async createCapability(
    toolId: string,
    data: { name: string; description?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<ToolCapability>> {
    return this.post<ToolCapability>(`/tools/${toolId}/capabilities`, data, options);
  }

  async listCapabilities(toolId: string, options?: RequestOptions): Promise<ApiResponse<ToolCapability[]>> {
    return this._get<ToolCapability[]>(`/tools/${toolId}/capabilities`, options);
  }

  // Tool Integrations
  async createIntegration(
    data: { name: string; tool_id: string; config?: Record<string, unknown> },
    options?: RequestOptions
  ): Promise<ApiResponse<ToolIntegration>> {
    return this.post<ToolIntegration>('/tool-integrations', data, options);
  }

  async listIntegrations(
    params?: PaginationParams & { application_id?: string },
    options?: RequestOptions
  ): Promise<PaginatedResponse<ToolIntegration>> {
    return this._list<ToolIntegration>('/tool-integrations', params, options);
  }

  async updateIntegration(
    id: string,
    data: Partial<{ name: string; status: string; config: Record<string, unknown> }>,
    options?: RequestOptions
  ): Promise<ApiResponse<ToolIntegration>> {
    return this.patch<ToolIntegration>(`/tool-integrations/${id}`, data, options);
  }

  // Credentials
  async createCredential(
    data: { name: string; credential_type: string; secret: string },
    options?: RequestOptions
  ): Promise<ApiResponse<Credential>> {
    return this.post<Credential>('/credentials', data, options);
  }

  async listCredentials(
    params?: PaginationParams & { application_id?: string },
    options?: RequestOptions
  ): Promise<PaginatedResponse<Credential>> {
    return this._list<Credential>('/credentials', params, options);
  }

  async updateCredential(
    id: string,
    data: Partial<{ name: string; status: string }>,
    options?: RequestOptions
  ): Promise<ApiResponse<Credential>> {
    return this.patch<Credential>(`/credentials/${id}`, data, options);
  }

  async createScope(
    credentialId: string,
    data: { scope: string },
    options?: RequestOptions
  ): Promise<ApiResponse<CredentialScope>> {
    return this.post<CredentialScope>(`/credentials/${credentialId}/scopes`, data, options);
  }

  async listScopes(credentialId: string, options?: RequestOptions): Promise<ApiResponse<CredentialScope[]>> {
    return this._get<CredentialScope[]>(`/credentials/${credentialId}/scopes`, options);
  }

  // Entitlements
  async grantEntitlement(
    data: { agent_id: string; tool_id: string },
    options?: RequestOptions
  ): Promise<ApiResponse<AgentToolEntitlement>> {
    return this.post<AgentToolEntitlement>('/agent-tool-entitlements', data, options);
  }

  async listEntitlements(
    params?: PaginationParams & { application_id?: string },
    options?: RequestOptions
  ): Promise<PaginatedResponse<AgentToolEntitlement>> {
    return this._list<AgentToolEntitlement>('/agent-tool-entitlements', params, options);
  }

  async revokeEntitlement(id: string, options?: RequestOptions): Promise<ApiResponse<void>> {
    return this.del<void>(`/agent-tool-entitlements/${id}`, options);
  }

  async authorizeAction(
    data: { agent_id: string; tool_id: string; action: string },
    options?: RequestOptions
  ): Promise<ApiResponse<{ authorized: boolean }>> {
    return this.post('/authorize-action', data, options);
  }

  // Data Sources
  async createDataSource(
    data: { name: string; source_type: string; config?: Record<string, unknown> },
    options?: RequestOptions
  ): Promise<ApiResponse<DataSource>> {
    return this.post<DataSource>('/data-sources', data, options);
  }

  async listDataSources(
    params?: PaginationParams & { application_id?: string },
    options?: RequestOptions
  ): Promise<PaginatedResponse<DataSource>> {
    return this._list<DataSource>('/data-sources', params, options);
  }

  // Data Access Policies
  async createDataAccessPolicy(
    data: { data_source_id: string; agent_id?: string; policy_type: string },
    options?: RequestOptions
  ): Promise<ApiResponse<DataAccessPolicy>> {
    return this.post<DataAccessPolicy>('/data-access-policies', data, options);
  }

  async listDataAccessPolicies(
    params?: PaginationParams & { application_id?: string },
    options?: RequestOptions
  ): Promise<PaginatedResponse<DataAccessPolicy>> {
    return this._list<DataAccessPolicy>('/data-access-policies', params, options);
  }
}
