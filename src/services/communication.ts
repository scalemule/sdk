/**
 * Communication Service Module
 *
 * Email, SMS, push notifications with template support.
 *
 * Routes:
 *   POST   /email/send                    → send email
 *   POST   /email/templates/{name}/send   → send templated email
 *   POST   /sms/send                      → send SMS
 *   POST   /sms/templates/{name}/send     → send templated SMS
 *   POST   /push/send                     → send push notification
 *   POST   /push/register                 → register push token
 *   DELETE /push/tokens/{token}           → unregister push token
 *   GET    /messages/{id}                  → get message status
 */

import { ServiceModule } from '../service'
import type { ApiResponse, RequestOptions } from '../types'

// ============================================================================
// Types
// ============================================================================

export interface MessageStatus {
  id: string
  channel: string
  recipient: string
  status: string
  provider: string
  provider_message_id?: string
  sent_at?: string
  delivered_at?: string
  opened_at?: string
  clicked_at?: string
  failed_at?: string
  error_message?: string
}

export interface PushToken {
  token: string
  platform: string
  created_at: string
}

// ============================================================================
// Communication Service
// ============================================================================

export class CommunicationService extends ServiceModule {
  protected basePath = '/v1/communication'

  // --------------------------------------------------------------------------
  // Email
  // --------------------------------------------------------------------------

  async sendEmail(data: { to: string; subject: string; body: string; template_id?: string }, options?: RequestOptions): Promise<ApiResponse<MessageStatus>> {
    return this.post<MessageStatus>('/email/send', data, options)
  }

  async sendEmailTemplate(template: string, data: { to: string; variables?: Record<string, unknown> }, options?: RequestOptions): Promise<ApiResponse<MessageStatus>> {
    return this.post<MessageStatus>(`/email/templates/${template}/send`, data, options)
  }

  // --------------------------------------------------------------------------
  // SMS
  // --------------------------------------------------------------------------

  async sendSms(data: { to: string; message: string }, options?: RequestOptions): Promise<ApiResponse<MessageStatus>> {
    return this.post<MessageStatus>('/sms/send', data, options)
  }

  async sendSmsTemplate(template: string, data: { to: string; variables?: Record<string, unknown> }, options?: RequestOptions): Promise<ApiResponse<MessageStatus>> {
    return this.post<MessageStatus>(`/sms/templates/${template}/send`, data, options)
  }

  // --------------------------------------------------------------------------
  // Push Notifications
  // --------------------------------------------------------------------------

  async sendPush(data: { user_id: string; title: string; body: string; data?: Record<string, unknown> }, options?: RequestOptions): Promise<ApiResponse<MessageStatus>> {
    return this.post<MessageStatus>('/push/send', data, options)
  }

  async registerPushToken(data: { token: string; platform: string }, options?: RequestOptions): Promise<ApiResponse<PushToken>> {
    return this.post<PushToken>('/push/register', data, options)
  }

  async unregisterPushToken(token: string, options?: RequestOptions): Promise<ApiResponse<{ unregistered: boolean }>> {
    return this.del<{ unregistered: boolean }>(`/push/tokens/${token}`, options)
  }

  // --------------------------------------------------------------------------
  // Message Status
  // --------------------------------------------------------------------------

  async getMessageStatus(id: string, options?: RequestOptions): Promise<ApiResponse<MessageStatus>> {
    return this._get<MessageStatus>(`/messages/${id}`, options)
  }

  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------

  /** @deprecated Use sendSms() instead */
  async sendSMS(data: { to: string; message: string }) {
    return this.sendSms(data)
  }

  /** @deprecated Use sendPush() instead */
  async sendPushNotification(data: { user_id: string; title: string; body: string; data?: Record<string, unknown> }) {
    return this.sendPush(data)
  }
}
