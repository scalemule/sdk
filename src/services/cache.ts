/**
 * Cache Service Module
 *
 * Key-value cache: get, set, delete, flush.
 *
 * Routes:
 *   GET    /{key}  → get cached value
 *   POST   /       → set value
 *   DELETE /{key}  → delete key
 *   DELETE /       → flush all
 */

import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface CacheEntry {
  key: string;
  value: unknown;
  ttl?: number;
  expires_at?: string;
}

// ============================================================================
// Cache Service
// ============================================================================

export class CacheService extends ServiceModule {
  protected basePath = '/v1/cache';

  async get(key: string, options?: RequestOptions): Promise<ApiResponse<CacheEntry>> {
    return this._get<CacheEntry>(`/${key}`, options);
  }

  async set(key: string, value: unknown, ttl?: number, options?: RequestOptions): Promise<ApiResponse<CacheEntry>> {
    return this.post<CacheEntry>('', { key, value, ttl }, options);
  }

  async delete(key: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/${key}`, options);
  }

  async flush(options?: RequestOptions): Promise<ApiResponse<{ flushed: boolean }>> {
    return this.del<{ flushed: boolean }>('', options);
  }
}
