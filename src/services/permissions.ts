/**
 * Permissions Service Module
 *
 * RBAC: roles, permissions, policies, checks.
 *
 * Routes:
 *   POST /roles                      → create role
 *   GET  /roles                       → list roles
 *   POST /roles/{id}/permissions      → assign permissions to role
 *   POST /users/{id}/roles            → assign role to user
 *   POST /check                       → check single permission
 *   POST /batch-check                 → check multiple permissions
 *   GET  /users/{id}/permissions      → get user's permissions
 *   POST /policies                    → create policy
 *   GET  /policies                    → list policies
 *   POST /evaluate                    → evaluate policy
 */

import { ServiceModule } from '../service'
import type { ApiResponse, RequestOptions } from '../types'

// ============================================================================
// Types
// ============================================================================

export type IdentityType = 'member' | 'user'

export interface Role {
  id: string
  role_name: string
  description?: string
  role_level?: number
  created_at: string
}

export interface PermissionCheck {
  granted: boolean
  permission: string
  resource_type?: string
  resource_id?: string
  reason: string
}

export interface Policy {
  id: string
  policy_name: string
  description?: string
  effect: string
  resource_pattern: string
  action_pattern: string
  conditions?: Record<string, unknown>
  priority: number
  is_active: boolean
  principals: Array<{ principal_type: string; principal_id: string }>
  created_at: string
}

/** Full permission matrix for an identity — single request, no N+1 */
export interface PermissionMatrix {
  identityId: string
  identityType: IdentityType
  role?: string
  roleLevel?: number
  policyVersion: number
  permissions: Record<string, Record<string, 'allow' | 'deny'>>
}

/** Check if a specific resource:action is allowed in the matrix */
export function canPerform(matrix: PermissionMatrix | null, resource: string, action: string): boolean {
  if (!matrix) return false
  const resourcePerms = matrix.permissions[resource]
  if (!resourcePerms) return false
  return resourcePerms[action] === 'allow'
}

/** Check if the matrix identity has at least the given role level */
export function hasMinRoleLevel(matrix: PermissionMatrix | null, minLevel: number): boolean {
  if (!matrix) return false
  if (matrix.roleLevel === undefined) return false
  return matrix.roleLevel >= minLevel
}

// ============================================================================
// Permissions Service
// ============================================================================

export class PermissionsService extends ServiceModule {
  protected basePath = '/v1/permissions'

  // --------------------------------------------------------------------------
  // Roles
  // --------------------------------------------------------------------------

  async createRole(data: { name: string; description?: string }, options?: RequestOptions): Promise<ApiResponse<Role>> {
    return this.post<Role>('/roles', data, options)
  }

  async listRoles(options?: RequestOptions): Promise<ApiResponse<Role[]>> {
    return this._get<Role[]>('/roles', options)
  }

  async assignPermissions(roleId: string, permissions: string[], options?: RequestOptions): Promise<ApiResponse<Role>> {
    return this.post<Role>(`/roles/${roleId}/permissions`, { permissions }, options)
  }

  async assignRole(userId: string, roleId: string, options?: RequestOptions): Promise<ApiResponse<{ assigned: boolean }>> {
    return this.post<{ assigned: boolean }>(`/users/${userId}/roles`, { role_id: roleId }, options)
  }

  // --------------------------------------------------------------------------
  // Permission Checks (unified — supports both member and user identity types)
  // --------------------------------------------------------------------------

  /** Check a single permission. Supports identity_type for unified model. */
  async check(
    identityId: string,
    permission: string,
    options?: RequestOptions & { identityType?: IdentityType; resourceType?: string; resourceId?: string }
  ): Promise<ApiResponse<PermissionCheck>> {
    const { identityType, resourceType, resourceId, ...reqOptions } = options || {}
    return this.post<PermissionCheck>('/check', {
      identity_id: identityId,
      identity_type: identityType || 'user',
      permission,
      resource_type: resourceType,
      resource_id: resourceId,
    }, reqOptions)
  }

  /** Batch check multiple permissions for an identity. */
  async batchCheck(
    identityId: string,
    permissions: string[],
    options?: RequestOptions & { identityType?: IdentityType }
  ): Promise<ApiResponse<PermissionCheck[]>> {
    const { identityType, ...reqOptions } = options || {}
    return this.post<PermissionCheck[]>('/batch-check', {
      identity_id: identityId,
      identity_type: identityType || 'user',
      permissions,
    }, reqOptions)
  }

  /** Fetch the full permission matrix for an identity (single request, no N+1). */
  async getMatrix(
    identityId: string,
    identityType: IdentityType = 'user',
    options?: RequestOptions
  ): Promise<ApiResponse<PermissionMatrix>> {
    const params = new URLSearchParams({ identity_id: identityId, identity_type: identityType })
    return this._get<PermissionMatrix>(`/matrix?${params.toString()}`, options)
  }

  async getUserPermissions(userId: string, options?: RequestOptions): Promise<ApiResponse<string[]>> {
    return this._get<string[]>(`/users/${userId}/permissions`, options)
  }

  // --------------------------------------------------------------------------
  // Policies
  // --------------------------------------------------------------------------

  async createPolicy(data: { name: string; effect: 'allow' | 'deny'; actions: string[]; resources: string[]; conditions?: Record<string, unknown> }, options?: RequestOptions): Promise<ApiResponse<Policy>> {
    return this.post<Policy>('/policies', data, options)
  }

  async listPolicies(options?: RequestOptions): Promise<ApiResponse<Policy[]>> {
    return this._get<Policy[]>('/policies', options)
  }

  async evaluate(data: { user_id: string; action: string; resource: string; context?: Record<string, unknown> }, options?: RequestOptions): Promise<ApiResponse<{ allowed: boolean; reason?: string }>> {
    return this.post<{ allowed: boolean; reason?: string }>('/evaluate', data, options)
  }

  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------

  /** @deprecated Use assignPermissions() instead */
  async assignPermission(roleId: string, permission: string) {
    return this.assignPermissions(roleId, [permission])
  }

  /** @deprecated Use check() instead */
  async checkPermission(userId: string, permission: string) {
    return this.check(userId, permission)
  }
}
