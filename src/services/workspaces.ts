/**
 * Workspaces Service Module
 *
 * Workspace CRUD, members, invitations, SSO.
 * Workspaces are resource containers (own projects, goals, settings, people, agents).
 *
 * Routes (via /v1/workspaces):
 *   POST   /                              → create workspace
 *   GET    /                               → list workspaces
 *   GET    /mine                           → list my workspaces
 *   GET    /{id}                           → get workspace
 *   PATCH  /{id}                           → update workspace
 *   DELETE /{id}                           → delete workspace
 *   GET    /{id}/members                   → list members
 *   POST   /{id}/members                   → add member
 *   PATCH  /{id}/members/{userId}          → update member role
 *   DELETE /{id}/members/{userId}          → remove member
 *   POST   /{id}/invitations               → invite
 *   GET    /{id}/invitations               → list invitations
 *   POST   /invitations/{token}/accept     → accept invitation
 *   DELETE /invitations/{id}               → cancel invitation
 *   POST   /{id}/sso/configure             → configure SSO
 *   GET    /{id}/sso                        → get SSO config
 */

import { ServiceModule } from '../service';
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface Workspace {
  id: string;
  kind: 'workspace';
  name: string;
  description?: string;
  owner_user_id: string;
  plan_type?: string;
  member_limit?: number;
  created_at: string;
}

export interface WorkspaceMember {
  id: string;
  container_id: string;
  sm_user_id: string;
  role: string;
  joined_at: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
}

export interface WorkspaceInvitation {
  id: string;
  container_id: string;
  email: string;
  invited_by: string;
  role: string;
  token?: string;
  status: string;
  expires_at: string;
  created_at: string;
}

export interface SsoConfig {
  id: string;
  container_id: string;
  provider_type: string;
  provider_name?: string;
  saml_idp_entity_id?: string;
  saml_idp_sso_url?: string;
  oauth_client_id?: string;
  oauth_authorize_url?: string;
  oauth_token_url?: string;
  oauth_userinfo_url?: string;
  allowed_domains?: string[];
  attribute_mapping?: Record<string, unknown>;
  is_enabled: boolean;
  is_enforced: boolean;
  jit_provisioning_enabled: boolean;
  default_role: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Workspaces Service
// ============================================================================

export class WorkspacesService extends ServiceModule {
  protected basePath = '/v1/workspaces';

  // --------------------------------------------------------------------------
  // Workspace CRUD
  // --------------------------------------------------------------------------

  async create(
    data: { name: string; description?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<Workspace>> {
    return this.post<Workspace>('', data, options);
  }

  async list(params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<Workspace>> {
    return this._list<Workspace>('', params, requestOptions);
  }

  async mine(params?: PaginationParams, options?: RequestOptions): Promise<PaginatedResponse<Workspace>> {
    return this._list<Workspace>('/mine', params, options);
  }

  async get(id: string, options?: RequestOptions): Promise<ApiResponse<Workspace>> {
    return this._get<Workspace>(`/${id}`, options);
  }

  async update(
    id: string,
    data: Partial<{ name: string; description: string }>,
    options?: RequestOptions
  ): Promise<ApiResponse<Workspace>> {
    return this.patch<Workspace>(`/${id}`, data, options);
  }

  async delete(id: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/${id}`, options);
  }

  // --------------------------------------------------------------------------
  // Members
  // --------------------------------------------------------------------------

  async listMembers(
    workspaceId: string,
    params?: PaginationParams,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<WorkspaceMember>> {
    return this._list<WorkspaceMember>(`/${workspaceId}/members`, params, requestOptions);
  }

  async addMember(
    workspaceId: string,
    data: { user_id: string; role: string },
    options?: RequestOptions
  ): Promise<ApiResponse<WorkspaceMember>> {
    return this.post<WorkspaceMember>(`/${workspaceId}/members`, data, options);
  }

  async updateMember(
    workspaceId: string,
    userId: string,
    data: { role: string },
    options?: RequestOptions
  ): Promise<ApiResponse<WorkspaceMember>> {
    return this.patch<WorkspaceMember>(`/${workspaceId}/members/${userId}`, data, options);
  }

  async removeMember(
    workspaceId: string,
    userId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ removed: boolean }>> {
    return this.del<{ removed: boolean }>(`/${workspaceId}/members/${userId}`, options);
  }

  // --------------------------------------------------------------------------
  // Invitations
  // --------------------------------------------------------------------------

  async invite(
    workspaceId: string,
    data: { email: string; role: string },
    options?: RequestOptions
  ): Promise<ApiResponse<WorkspaceInvitation>> {
    return this.post<WorkspaceInvitation>(`/${workspaceId}/invitations`, data, options);
  }

  async listInvitations(workspaceId: string, options?: RequestOptions): Promise<ApiResponse<WorkspaceInvitation[]>> {
    return this._get<WorkspaceInvitation[]>(`/${workspaceId}/invitations`, options);
  }

  async acceptInvitation(token: string, options?: RequestOptions): Promise<ApiResponse<WorkspaceInvitation>> {
    return this.post<WorkspaceInvitation>(`/invitations/${token}/accept`, undefined, options);
  }

  async cancelInvitation(id: string, options?: RequestOptions): Promise<ApiResponse<{ cancelled: boolean }>> {
    return this.del<{ cancelled: boolean }>(`/invitations/${id}`, options);
  }

  // --------------------------------------------------------------------------
  // SSO (workspace-only)
  // --------------------------------------------------------------------------

  async configureSso(
    workspaceId: string,
    data: { provider: string; domain: string; metadata_url?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<SsoConfig>> {
    return this.post<SsoConfig>(`/${workspaceId}/sso/configure`, data, options);
  }

  async getSso(workspaceId: string, options?: RequestOptions): Promise<ApiResponse<SsoConfig>> {
    return this._get<SsoConfig>(`/${workspaceId}/sso`, options);
  }
}
