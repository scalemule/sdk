/**
 * Accounts Service Module
 *
 * Client and application management.
 *
 * Routes:
 *   POST /clients       → create client
 *   GET  /clients       → list clients
 *   POST /applications  → create application
 *   GET  /applications  → list applications
 */

import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface Client {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface Application {
  id: string;
  name: string;
  description?: string;
  api_key?: string;
  features?: string[];
  created_at: string;
}

// ============================================================================
// Accounts Service
// ============================================================================

export class AccountsService extends ServiceModule {
  protected basePath = '/v1/accounts';

  async createClient(data: { name: string; email: string }, options?: RequestOptions): Promise<ApiResponse<Client>> {
    return this.post<Client>('/clients', data, options);
  }

  async getClients(options?: RequestOptions): Promise<ApiResponse<Client[]>> {
    return this._get<Client[]>('/clients', options);
  }

  async createApplication(
    data: { name: string; description?: string; features?: string[] },
    options?: RequestOptions
  ): Promise<ApiResponse<Application>> {
    return this.post<Application>('/applications', data, options);
  }

  async getApplications(options?: RequestOptions): Promise<ApiResponse<Application[]>> {
    return this._get<Application[]>('/applications', options);
  }
}
