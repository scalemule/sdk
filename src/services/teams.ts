/**
 * Teams Service Module
 *
 * Team CRUD, members, invitations, SSO.
 *
 * Routes:
 *   POST   /                              → create team
 *   GET    /                               → list teams
 *   GET    /{id}                           → get team
 *   PATCH  /{id}                           → update team
 *   DELETE /{id}                           → delete team
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

import { ServiceModule } from '../service'
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types'

// ============================================================================
// Types
// ============================================================================

export interface Team {
  id: string
  team_name: string
  description?: string
  owner_user_id: string
  plan_type?: string
  member_limit?: number
  created_at: string
}

export interface TeamMember {
  id: string
  team_id: string
  sm_user_id: string
  role: string
  joined_at: string
}

export interface TeamInvitation {
  id: string
  team_id: string
  email: string
  invited_by: string
  role: string
  token: string
  status: string
  expires_at: string
  created_at: string
}

export interface SsoConfig {
  id: string
  team_id: string
  provider_type: string
  provider_name?: string
  saml_idp_entity_id?: string
  saml_idp_sso_url?: string
  oauth_client_id?: string
  oauth_authorize_url?: string
  oauth_token_url?: string
  oauth_userinfo_url?: string
  allowed_domains?: string[]
  attribute_mapping?: Record<string, unknown>
  is_enabled: boolean
  is_enforced: boolean
  jit_provisioning_enabled: boolean
  default_role: string
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ============================================================================
// Teams Service
// ============================================================================

export class TeamsService extends ServiceModule {
  protected basePath = '/v1/teams'

  // --------------------------------------------------------------------------
  // Team CRUD
  // --------------------------------------------------------------------------

  async create(data: { name: string; description?: string }, options?: RequestOptions): Promise<ApiResponse<Team>> {
    return this.post<Team>('', data, options)
  }

  async list(params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<Team>> {
    return this._list<Team>('', params, requestOptions)
  }

  async get(id: string, options?: RequestOptions): Promise<ApiResponse<Team>> {
    return this._get<Team>(`/${id}`, options)
  }

  async update(id: string, data: Partial<{ name: string; description: string }>, options?: RequestOptions): Promise<ApiResponse<Team>> {
    return this.patch<Team>(`/${id}`, data, options)
  }

  async delete(id: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/${id}`, options)
  }

  // --------------------------------------------------------------------------
  // Members
  // --------------------------------------------------------------------------

  async listMembers(teamId: string, params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<TeamMember>> {
    return this._list<TeamMember>(`/${teamId}/members`, params, requestOptions)
  }

  async addMember(teamId: string, data: { user_id: string; role: string }, options?: RequestOptions): Promise<ApiResponse<TeamMember>> {
    return this.post<TeamMember>(`/${teamId}/members`, data, options)
  }

  async updateMember(teamId: string, userId: string, data: { role: string }, options?: RequestOptions): Promise<ApiResponse<TeamMember>> {
    return this.patch<TeamMember>(`/${teamId}/members/${userId}`, data, options)
  }

  async removeMember(teamId: string, userId: string, options?: RequestOptions): Promise<ApiResponse<{ removed: boolean }>> {
    return this.del<{ removed: boolean }>(`/${teamId}/members/${userId}`, options)
  }

  // --------------------------------------------------------------------------
  // Invitations
  // --------------------------------------------------------------------------

  async invite(teamId: string, data: { email: string; role: string }, options?: RequestOptions): Promise<ApiResponse<TeamInvitation>> {
    return this.post<TeamInvitation>(`/${teamId}/invitations`, data, options)
  }

  async listInvitations(teamId: string, options?: RequestOptions): Promise<ApiResponse<TeamInvitation[]>> {
    return this._get<TeamInvitation[]>(`/${teamId}/invitations`, options)
  }

  async acceptInvitation(token: string, options?: RequestOptions): Promise<ApiResponse<TeamMember>> {
    return this.post<TeamMember>(`/invitations/${token}/accept`, undefined, options)
  }

  async cancelInvitation(id: string, options?: RequestOptions): Promise<ApiResponse<{ cancelled: boolean }>> {
    return this.del<{ cancelled: boolean }>(`/invitations/${id}`, options)
  }

  // --------------------------------------------------------------------------
  // SSO
  // --------------------------------------------------------------------------

  async configureSso(teamId: string, data: { provider: string; domain: string; metadata_url?: string }, options?: RequestOptions): Promise<ApiResponse<SsoConfig>> {
    return this.post<SsoConfig>(`/${teamId}/sso/configure`, data, options)
  }

  async getSso(teamId: string, options?: RequestOptions): Promise<ApiResponse<SsoConfig>> {
    return this._get<SsoConfig>(`/${teamId}/sso`, options)
  }

  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------

  /** @deprecated Use create() instead */
  async createTeam(data: { name: string; description?: string }) {
    return this.create(data)
  }

  /** @deprecated Use invite() instead */
  async inviteMember(teamId: string, email: string, role: string) {
    return this.invite(teamId, { email, role })
  }
}
