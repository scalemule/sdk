/**
 * Teams Service Module
 *
 * Team CRUD, members, invitations.
 * Teams are membership/coordination groups (group people and agents; do not own resources).
 * SSO is NOT available for teams — use workspaces for SSO.
 *
 * Routes (via /v1/teams):
 *   POST   /                              → create team
 *   GET    /                               → list teams
 *   GET    /mine                           → list my teams
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
 */

import { ServiceModule } from '../service';
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface Team {
  id: string;
  kind: 'team';
  name: string;
  description?: string;
  owner_user_id: string;
  plan_type?: string;
  member_limit?: number;
  created_at: string;
}

export interface TeamMember {
  id: string;
  container_id: string;
  sm_user_id: string;
  role: string;
  joined_at: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
}

export interface TeamInvitation {
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

// ============================================================================
// Teams Service
// ============================================================================

export class TeamsService extends ServiceModule {
  protected basePath = '/v1/teams';

  // --------------------------------------------------------------------------
  // Team CRUD
  // --------------------------------------------------------------------------

  async create(data: { name: string; description?: string }, options?: RequestOptions): Promise<ApiResponse<Team>> {
    return this.post<Team>('', data, options);
  }

  async list(params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<Team>> {
    return this._list<Team>('', params, requestOptions);
  }

  async mine(params?: PaginationParams, options?: RequestOptions): Promise<PaginatedResponse<Team>> {
    return this._list<Team>('/mine', params, options);
  }

  async get(id: string, options?: RequestOptions): Promise<ApiResponse<Team>> {
    return this._get<Team>(`/${id}`, options);
  }

  async update(
    id: string,
    data: Partial<{ name: string; description: string }>,
    options?: RequestOptions
  ): Promise<ApiResponse<Team>> {
    return this.patch<Team>(`/${id}`, data, options);
  }

  async delete(id: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/${id}`, options);
  }

  // --------------------------------------------------------------------------
  // Members
  // --------------------------------------------------------------------------

  async listMembers(
    teamId: string,
    params?: PaginationParams,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<TeamMember>> {
    return this._list<TeamMember>(`/${teamId}/members`, params, requestOptions);
  }

  async addMember(
    teamId: string,
    data: { user_id: string; role: string },
    options?: RequestOptions
  ): Promise<ApiResponse<TeamMember>> {
    return this.post<TeamMember>(`/${teamId}/members`, data, options);
  }

  async updateMember(
    teamId: string,
    userId: string,
    data: { role: string },
    options?: RequestOptions
  ): Promise<ApiResponse<TeamMember>> {
    return this.patch<TeamMember>(`/${teamId}/members/${userId}`, data, options);
  }

  async removeMember(
    teamId: string,
    userId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ removed: boolean }>> {
    return this.del<{ removed: boolean }>(`/${teamId}/members/${userId}`, options);
  }

  // --------------------------------------------------------------------------
  // Invitations
  // --------------------------------------------------------------------------

  async invite(
    teamId: string,
    data: { email: string; role: string },
    options?: RequestOptions
  ): Promise<ApiResponse<TeamInvitation>> {
    return this.post<TeamInvitation>(`/${teamId}/invitations`, data, options);
  }

  async listInvitations(teamId: string, options?: RequestOptions): Promise<ApiResponse<TeamInvitation[]>> {
    return this._get<TeamInvitation[]>(`/${teamId}/invitations`, options);
  }

  async acceptInvitation(token: string, options?: RequestOptions): Promise<ApiResponse<TeamInvitation>> {
    return this.post<TeamInvitation>(`/invitations/${token}/accept`, undefined, options);
  }

  async cancelInvitation(id: string, options?: RequestOptions): Promise<ApiResponse<{ cancelled: boolean }>> {
    return this.del<{ cancelled: boolean }>(`/invitations/${id}`, options);
  }
}
