/**
 * Catalog Service Module
 *
 * Service catalog and health checks.
 *
 * Routes:
 *   GET /services              → list services
 *   GET /services/{name}/health → service health check
 */

import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface CatalogEntry {
  name: string;
  version: string;
  status: string;
  port: number;
  description?: string;
}

export interface ServiceHealth {
  status: string;
  uptime_seconds?: number;
  checks?: Record<string, { status: string; message?: string }>;
}

// ============================================================================
// Catalog Service
// ============================================================================

export class CatalogService extends ServiceModule {
  protected basePath = '/v1/catalog';

  async listServices(options?: RequestOptions): Promise<ApiResponse<CatalogEntry[]>> {
    return this._get<CatalogEntry[]>('/services', options);
  }

  async getServiceHealth(name: string, options?: RequestOptions): Promise<ApiResponse<ServiceHealth>> {
    return this._get<ServiceHealth>(`/services/${name}/health`, options);
  }
}
