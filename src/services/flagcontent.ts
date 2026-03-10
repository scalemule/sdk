/**
 * FlagContent Service Module (Content Moderation)
 *
 * Content flagging, checking, and appeals.
 *
 * Routes:
 *   POST /flags         → create flag
 *   GET  /flags/check   → check if content is flagged
 *   GET  /flags/{id}    → get flag details
 *   POST /appeals       → submit appeal
 *   GET  /appeals/{id}  → get appeal status
 */

import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface ContentFlag {
  id: string;
  content_type: string;
  content_id: string;
  category: string;
  subcategory?: string;
  status: string;
  description?: string;
  created_at: string;
}

export interface FlagCheck {
  flagged: boolean;
  flags?: ContentFlag[];
}

export interface Appeal {
  id: string;
  flag_id: string;
  reason: string;
  status: string;
  created_at: string;
  resolved_at?: string;
}

// ============================================================================
// FlagContent Service
// ============================================================================

export class FlagContentService extends ServiceModule {
  protected basePath = '/v1/flagcontent';

  async createFlag(
    data: {
      content_type: string;
      content_id: string;
      content_url?: string;
      category: string;
      subcategory?: string;
      description?: string;
      reporter_id?: string;
      reporter_email?: string;
      is_anonymous?: boolean;
    },
    options?: RequestOptions
  ): Promise<ApiResponse<ContentFlag>> {
    return this.post<ContentFlag>('/flags', data, options);
  }

  async checkFlag(
    params: { content_type: string; content_id: string },
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<FlagCheck>> {
    return this._get<FlagCheck>(this.withQuery('/flags/check', params), requestOptions);
  }

  async getFlag(id: string, options?: RequestOptions): Promise<ApiResponse<ContentFlag>> {
    return this._get<ContentFlag>(`/flags/${id}`, options);
  }

  async submitAppeal(
    data: { flag_id: string; reason: string },
    options?: RequestOptions
  ): Promise<ApiResponse<Appeal>> {
    return this.post<Appeal>('/appeals', data, options);
  }

  async getAppeal(id: string, options?: RequestOptions): Promise<ApiResponse<Appeal>> {
    return this._get<Appeal>(`/appeals/${id}`, options);
  }
}
