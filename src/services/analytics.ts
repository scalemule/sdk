/**
 * Analytics Service Module
 *
 * Event tracking (v2 JetStream-buffered), page views, funnels, metrics.
 *
 * Routes:
 *   POST /v2/events            → track event (JetStream buffered)
 *   POST /v2/events/batch      → batch track events
 *   POST /page-view            → track page view
 *   POST /identify             → identify user
 *   POST /alias                → alias anonymous to user
 *   GET  /events               → query events
 *   GET  /aggregations         → get aggregations
 *   GET  /top-events           → top events
 *   GET  /users/active         → active users
 *   POST /funnels              → create funnel
 *   GET  /funnels              → list funnels
 *   GET  /funnels/{id}/conversions → funnel conversions
 *   POST /metrics              → track metric
 *   GET  /metrics/query        → query metrics
 */

import { ServiceModule } from '../service';
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface AnalyticsEvent {
  id: string;
  event_name: string;
  user_id?: string;
  anonymous_id?: string;
  properties?: Record<string, unknown>;
  created_at: string;
}

export interface Funnel {
  id: string;
  funnel_name: string;
  steps: string;
  created_at: string;
}

export interface FunnelConversion {
  date_bucket: string;
  step_index: number;
  step_name: string;
  users_entered: number;
  users_completed: number;
  conversion_rate?: number;
}

export interface ActiveUsers {
  active_users: number;
  period: string;
}

export interface EventAggregation {
  time_bucket: string;
  event_name: string;
  count: number;
}

export interface TopEvent {
  event_name: string;
  count: number;
}

export interface MetricDataPoint {
  timestamp: string;
  value: number;
  dimensions?: Record<string, unknown>;
}

// ============================================================================
// Analytics Service
// ============================================================================

export class AnalyticsService extends ServiceModule {
  protected basePath = '/v1/analytics';

  // --------------------------------------------------------------------------
  // Event Tracking (v2 — JetStream buffered)
  // --------------------------------------------------------------------------

  async track(
    event: string,
    properties?: Record<string, unknown>,
    userId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ tracked: boolean }>> {
    return this.post<{ tracked: boolean }>('/v2/events', { event_name: event, properties, user_id: userId }, options);
  }

  async trackBatch(
    events: Array<{ event: string; properties?: Record<string, unknown>; user_id?: string; timestamp?: string }>,
    options?: RequestOptions
  ): Promise<ApiResponse<{ count: number }>> {
    const mapped = events.map(({ event, ...rest }) => ({ event_name: event, ...rest }));
    return this.post<{ count: number }>('/v2/events/batch', { events: mapped }, options);
  }

  async trackPageView(
    data?: { path?: string; title?: string; referrer?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<{ tracked: boolean }>> {
    return this.post<{ tracked: boolean }>('/page-view', data, options);
  }

  // --------------------------------------------------------------------------
  // Identity
  // --------------------------------------------------------------------------

  async identify(
    userId: string,
    traits?: Record<string, unknown>,
    anonymousId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ identified: boolean }>> {
    return this.post<{ identified: boolean }>(
      '/identify',
      { user_id: userId, traits, anonymous_id: anonymousId },
      options
    );
  }

  async alias(
    userId: string,
    anonymousId: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ aliased: boolean }>> {
    return this.post<{ aliased: boolean }>('/alias', { user_id: userId, anonymous_id: anonymousId }, options);
  }

  // --------------------------------------------------------------------------
  // Query & Aggregations
  // --------------------------------------------------------------------------

  async queryEvents(filters?: PaginationParams & Record<string, unknown>): Promise<PaginatedResponse<AnalyticsEvent>> {
    return this._list<AnalyticsEvent>('/events', filters);
  }

  async getAggregations(filters?: Record<string, unknown>): Promise<ApiResponse<EventAggregation[]>> {
    return this._get<EventAggregation[]>(this.withQuery('/aggregations', filters));
  }

  async getTopEvents(filters?: Record<string, unknown>): Promise<ApiResponse<TopEvent[]>> {
    return this._get<TopEvent[]>(this.withQuery('/top-events', filters));
  }

  async getActiveUsers(): Promise<ApiResponse<ActiveUsers>> {
    return this._get<ActiveUsers>('/users/active');
  }

  // --------------------------------------------------------------------------
  // Funnels
  // --------------------------------------------------------------------------

  async createFunnel(data: { name: string; steps: string[] }): Promise<ApiResponse<Funnel>> {
    return this.post<Funnel>('/funnels', data);
  }

  async listFunnels(): Promise<ApiResponse<Funnel[]>> {
    return this._get<Funnel[]>('/funnels');
  }

  async getFunnelConversions(id: string): Promise<ApiResponse<FunnelConversion[]>> {
    return this._get<FunnelConversion[]>(`/funnels/${id}/conversions`);
  }

  // --------------------------------------------------------------------------
  // Custom Metrics
  // --------------------------------------------------------------------------

  async trackMetric(
    data: { name: string; value: number; tags?: Record<string, string> },
    options?: RequestOptions
  ): Promise<ApiResponse<{ tracked: boolean }>> {
    return this.post<{ tracked: boolean }>('/metrics', data, options);
  }

  async queryMetrics(filters?: Record<string, unknown>): Promise<ApiResponse<MetricDataPoint[]>> {
    return this._get<MetricDataPoint[]>(this.withQuery('/metrics/query', filters));
  }

  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------

  /** @deprecated Use queryEvents() instead */
  async query(filters?: Record<string, unknown>) {
    return this._get<AnalyticsEvent[]>(this.withQuery('/events', filters));
  }
}
