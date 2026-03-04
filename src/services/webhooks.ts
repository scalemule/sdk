/**
 * Webhooks Service Module
 *
 * Webhook management: CRUD, event types.
 *
 * Routes:
 *   POST   /          → create webhook
 *   GET    /          → list webhooks
 *   GET    /{id}      → get webhook
 *   PATCH  /{id}      → update webhook
 *   DELETE /{id}      → delete webhook
 *   GET    /events    → list available event types
 */

import { ServiceModule } from '../service'
import type { ApiResponse, RequestOptions } from '../types'

// ============================================================================
// Types
// ============================================================================

export interface Webhook {
  id: string
  url: string
  events: string[]
  secret?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// ============================================================================
// Webhooks Service
// ============================================================================

export class WebhooksService extends ServiceModule {
  protected basePath = '/v1/webhooks'

  async create(data: { url: string; events: string[]; secret?: string }, options?: RequestOptions): Promise<ApiResponse<Webhook>> {
    return this.post<Webhook>('', data, options)
  }

  async list(options?: RequestOptions): Promise<ApiResponse<Webhook[]>> {
    return this._get<Webhook[]>('', options)
  }

  async get(id: string, options?: RequestOptions): Promise<ApiResponse<Webhook>> {
    return this._get<Webhook>(`/${id}`, options)
  }

  async update(id: string, data: { url?: string; events?: string[]; is_active?: boolean }, options?: RequestOptions): Promise<ApiResponse<Webhook>> {
    return this.patch<Webhook>(`/${id}`, data, options)
  }

  async delete(id: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/${id}`, options)
  }

  async listEvents(options?: RequestOptions): Promise<ApiResponse<string[]>> {
    return this._get<string[]>('/events', options)
  }

  /** @deprecated Use create() instead */
  async createWebhook(data: { url: string; events: string[]; secret?: string }) {
    return this.create(data)
  }

  /** @deprecated Use list() instead */
  async listWebhooks() {
    return this.list()
  }

  /** @deprecated Use delete() instead */
  async deleteWebhook(id: string) {
    return this.delete(id)
  }
}
