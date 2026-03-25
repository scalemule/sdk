/**
 * Communication Service Module
 *
 * Email, SMS, push notifications with template support.
 *
 * Routes:
 *   POST   /email/send                         → send email
 *   POST   /email/templates/{name}/send        → send templated email
 *   POST   /sms/send                           → send SMS
 *   POST   /sms/templates/{name}/send          → send templated SMS
 *   POST   /push/send                          → send push notification
 *   POST   /push/register                      → register push token
 *   DELETE /push/tokens/{token}                → unregister push token (legacy)
 *   DELETE /push/tokens/by-id/{id}             → unregister push token by ID
 *   PUT    /push/tokens/by-id/{id}/user        → associate token with authenticated user
 *   DELETE /push/tokens/by-id/{id}/user        → disassociate user (logout)
 *   GET    /push/settings/me                   → get push settings for current app
 *   GET    /push/topics                        → list notification topics
 *   POST   /push/topics/{id}/subscribe         → subscribe to topic
 *   DELETE /push/topics/{id}/subscribe         → unsubscribe from topic
 *   GET    /push/subscriptions                 → list subscriptions
 *   GET    /push/preferences                   → get push preferences
 *   PUT    /push/preferences                   → update push preferences
 *   GET    /messages/{id}                      → get message status
 */

import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface MessageStatus {
  id: string;
  channel: string;
  recipient: string;
  status: string;
  provider: string;
  provider_message_id?: string;
  sent_at?: string;
  delivered_at?: string;
  opened_at?: string;
  clicked_at?: string;
  failed_at?: string;
  error_message?: string;
}

export interface PushToken {
  id: string;
  platform: 'ios' | 'android' | 'web';
  user_id?: string;
  is_active: boolean;
  created_at: string;
}

export interface PushTokenAssociationResult {
  id: string;
  user_id: string;
  subscriptions_copied: number;
}

export interface PushSettings {
  push_enabled: boolean;
  webpush_enabled: boolean;
  vapid_public_key: string | null;
  fcm_enabled: boolean;
  apns_enabled: boolean;
  silent_push_enabled: boolean;
  rich_media_enabled: boolean;
  broadcast_enabled: boolean;
  max_per_user_per_hour: number;
  max_per_user_per_day: number;
}

export interface PushTopic {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  is_default: boolean;
  is_visible: boolean;
  subscriber_count?: number;
}

export interface PushSubscriptionInfo {
  id: string;
  topic_id: string;
  topic_name?: string;
}

export interface PushPreferences {
  marketing_enabled: boolean;
  transactional_enabled: boolean;
  alert_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_tz: string | null;
}

export interface WebPushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface RegisterPushTokenData {
  token: string;
  platform: 'ios' | 'android' | 'web';
  device_id?: string;
  subscription?: WebPushSubscriptionData;
  app_version?: string;
  os_version?: string;
  device_model?: string;
}

// ============================================================================
// Communication Service
// ============================================================================

export class CommunicationService extends ServiceModule {
  protected basePath = '/v1/communication';

  // --------------------------------------------------------------------------
  // Email
  // --------------------------------------------------------------------------

  async sendEmail(
    data: { to: string; subject: string; html_body: string; text_body?: string; message_type?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<MessageStatus>> {
    return this.post<MessageStatus>('/email/send', data, options);
  }

  async sendEmailTemplate(
    template: string,
    data: { to: string; variables?: Record<string, unknown> },
    options?: RequestOptions
  ): Promise<ApiResponse<MessageStatus>> {
    return this.post<MessageStatus>(`/email/templates/${template}/send`, data, options);
  }

  // --------------------------------------------------------------------------
  // SMS
  // --------------------------------------------------------------------------

  async sendSms(data: { to: string; message: string }, options?: RequestOptions): Promise<ApiResponse<MessageStatus>> {
    return this.post<MessageStatus>('/sms/send', data, options);
  }

  async sendSmsTemplate(
    template: string,
    data: { to: string; variables?: Record<string, unknown> },
    options?: RequestOptions
  ): Promise<ApiResponse<MessageStatus>> {
    return this.post<MessageStatus>(`/sms/templates/${template}/send`, data, options);
  }

  // --------------------------------------------------------------------------
  // Push Notifications — Send
  // --------------------------------------------------------------------------

  async sendPush(
    data: { user_id: string; title: string; body: string; data?: Record<string, unknown> },
    options?: RequestOptions
  ): Promise<ApiResponse<MessageStatus>> {
    return this.post<MessageStatus>('/push/send', data, options);
  }

  // --------------------------------------------------------------------------
  // Push Notifications — Token Management
  // --------------------------------------------------------------------------

  async registerPushToken(data: RegisterPushTokenData, options?: RequestOptions): Promise<ApiResponse<PushToken>> {
    return this.post<PushToken>('/push/register', data, options);
  }

  /** @deprecated Use unregisterPushTokenById() for web push tokens */
  async unregisterPushToken(token: string, options?: RequestOptions): Promise<ApiResponse<{ unregistered: boolean }>> {
    return this.del<{ unregistered: boolean }>(`/push/tokens/${token}`, options);
  }

  async unregisterPushTokenById(id: string, options?: RequestOptions): Promise<ApiResponse<void>> {
    const result = await this.del<void>(`/push/tokens/by-id/${id}`, options);
    // 204 No Content — core client returns { data: { message: '' }, error: null }
    if (result.data && typeof result.data === 'object' && !('id' in (result.data as Record<string, unknown>))) {
      return { data: undefined as unknown as void, error: null };
    }
    return result;
  }

  async associatePushTokenUserById(
    id: string,
    options?: RequestOptions
  ): Promise<ApiResponse<PushTokenAssociationResult>> {
    return this.put<PushTokenAssociationResult>(`/push/tokens/by-id/${id}/user`, {}, options);
  }

  async disassociatePushTokenUser(id: string, options?: RequestOptions): Promise<ApiResponse<void>> {
    const result = await this.del<void>(`/push/tokens/by-id/${id}/user`, options);
    if (result.data && typeof result.data === 'object' && !('id' in (result.data as Record<string, unknown>))) {
      return { data: undefined as unknown as void, error: null };
    }
    return result;
  }

  // --------------------------------------------------------------------------
  // Push Notifications — Settings
  // --------------------------------------------------------------------------

  async getMyPushSettings(options?: RequestOptions): Promise<ApiResponse<PushSettings>> {
    return this._get<PushSettings>('/push/settings/me', options);
  }

  // --------------------------------------------------------------------------
  // Push Notifications — Topics & Subscriptions
  // --------------------------------------------------------------------------

  async listTopics(options?: RequestOptions): Promise<ApiResponse<PushTopic[]>> {
    return this._get<PushTopic[]>('/push/topics', options);
  }

  async subscribeTopic(
    topicId: string,
    data?: { push_token_id?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<void>> {
    return this.post<void>(`/push/topics/${topicId}/subscribe`, data || {}, options);
  }

  async unsubscribeTopic(topicId: string, options?: RequestOptions): Promise<ApiResponse<void>> {
    return this.del<void>(`/push/topics/${topicId}/subscribe`, options);
  }

  async listSubscriptions(options?: RequestOptions): Promise<ApiResponse<PushSubscriptionInfo[]>> {
    return this._get<PushSubscriptionInfo[]>('/push/subscriptions', options);
  }

  // --------------------------------------------------------------------------
  // Push Notifications — Preferences
  // --------------------------------------------------------------------------

  async getPushPreferences(options?: RequestOptions): Promise<ApiResponse<PushPreferences>> {
    return this._get<PushPreferences>('/push/preferences', options);
  }

  async updatePushPreferences(
    data: Partial<PushPreferences>,
    options?: RequestOptions
  ): Promise<ApiResponse<PushPreferences>> {
    return this.put<PushPreferences>('/push/preferences', data, options);
  }

  // --------------------------------------------------------------------------
  // Message Status
  // --------------------------------------------------------------------------

  async getMessageStatus(id: string, options?: RequestOptions): Promise<ApiResponse<MessageStatus>> {
    return this._get<MessageStatus>(`/messages/${id}`, options);
  }

  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------

  /** @deprecated Use sendSms() instead */
  async sendSMS(data: { to: string; message: string }) {
    return this.sendSms(data);
  }

  /** @deprecated Use sendPush() instead */
  async sendPushNotification(data: { user_id: string; title: string; body: string; data?: Record<string, unknown> }) {
    return this.sendPush(data);
  }
}
