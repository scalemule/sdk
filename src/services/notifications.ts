/**
 * Notifications Service
 *
 * In-app notification management — list, read, dismiss.
 * Notifications are created server-side by the notification pipeline
 * and delivered in real-time via WebSocket or fetched via these endpoints.
 */

import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  icon_url?: string;
  action_url?: string;
  data: unknown;
  priority: 'high' | 'normal' | 'low';
  is_read: boolean;
  read_at?: string;
  created_at: string;
}

export interface NotificationListResponse {
  notifications: Notification[];
  has_more: boolean;
}

export interface UnreadCountResponse {
  count: number;
}

export interface ListNotificationsParams {
  /** Only return unread notifications */
  unread_only?: boolean;
  /** Filter by notification kind (e.g., 'video.ready') */
  kind?: string;
  /** ISO 8601 timestamp — return notifications created after this time */
  since?: string;
  /** Max results per page (default: 20, max: 100) */
  limit?: number;
  /** Cursor for pagination (created_at of last item) */
  cursor?: string;
}

// ============================================================================
// Service
// ============================================================================

export class NotificationsService extends ServiceModule {
  protected basePath = '/notifications';

  /**
   * List notifications for the authenticated user.
   *
   * @example
   * ```ts
   * // All unread
   * const { data } = await sm.notifications.list({ unread_only: true })
   *
   * // With pagination
   * const { data } = await sm.notifications.list({ limit: 10, cursor: lastCreatedAt })
   *
   * // Since last seen (reconnect catch-up)
   * const { data } = await sm.notifications.list({ unread_only: true, since: '2026-03-25T00:00:00Z' })
   * ```
   */
  async list(
    params?: ListNotificationsParams,
    options?: RequestOptions
  ): Promise<ApiResponse<NotificationListResponse>> {
    const qs = new URLSearchParams();
    if (params?.unread_only) qs.set('unread_only', 'true');
    if (params?.kind) qs.set('kind', params.kind);
    if (params?.since) qs.set('since', params.since);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.cursor) qs.set('cursor', params.cursor);

    const query = qs.toString();
    const path = query ? `?${query}` : '';
    return this._get<NotificationListResponse>(path, options);
  }

  /**
   * Get the count of unread notifications.
   *
   * @example
   * ```ts
   * const { data } = await sm.notifications.unreadCount()
   * console.log(`${data.count} unread`)
   * ```
   */
  async unreadCount(options?: RequestOptions): Promise<ApiResponse<UnreadCountResponse>> {
    return this._get<UnreadCountResponse>('/unread-count', options);
  }

  /**
   * Mark a single notification as read.
   */
  async markRead(id: string, options?: RequestOptions): Promise<ApiResponse<void>> {
    return this.patch<void>(`/${id}/read`, undefined, options);
  }

  /**
   * Mark all notifications as read.
   */
  async markAllRead(options?: RequestOptions): Promise<ApiResponse<void>> {
    return this.patch<void>('/read-all', undefined, options);
  }

  /**
   * Dismiss a notification (soft delete).
   */
  async dismiss(id: string, options?: RequestOptions): Promise<ApiResponse<void>> {
    return this.del<void>(`/${id}`, options);
  }
}
