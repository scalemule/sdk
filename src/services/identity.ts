/**
 * Identity Service Module
 *
 * API key management.
 *
 * Routes:
 *   POST   /api-keys      → create API key
 *   GET    /api-keys       → list API keys
 *   DELETE /api-keys/{id}  → revoke API key
 */

import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface ApiKey {
  id: string;
  name: string;
  key?: string;
  prefix: string;
  expires_at?: string;
  last_used_at?: string;
  created_at: string;
}

// ============================================================================
// Identity Service
// ============================================================================

export class IdentityService extends ServiceModule {
  protected basePath = '/v1/identity';

  async createApiKey(
    data: { name: string; expires_at?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<ApiKey>> {
    return this.post<ApiKey>('/api-keys', data, options);
  }

  async listApiKeys(options?: RequestOptions): Promise<ApiResponse<ApiKey[]>> {
    return this._get<ApiKey[]>('/api-keys', options);
  }

  async revokeApiKey(id: string, options?: RequestOptions): Promise<ApiResponse<{ revoked: boolean }>> {
    return this.del<{ revoked: boolean }>(`/api-keys/${id}`, options);
  }

  /**
   * Explicitly link an anonymous_id to the current authenticated user.
   * Called automatically on init when both a session and anonymous_id exist
   * (transitional path for users who registered before identity linking existed).
   */
  async identify(
    anonymousId: string,
    deviceFingerprintHash?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ linked: boolean; anonymous_id: string; message: string }>> {
    return this.post<{ linked: boolean; anonymous_id: string; message: string }>(
      '/identify',
      { anonymous_id: anonymousId, device_fingerprint_hash: deviceFingerprintHash },
      options
    );
  }
}
