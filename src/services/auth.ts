/**
 * Auth Service Module
 *
 * Full auth service with nested sub-APIs:
 *   auth.mfa.*          — Multi-factor authentication
 *   auth.sessions.*     — Session management
 *   auth.devices.*      — Device trust/block
 *   auth.loginHistory.* — Login history & activity
 */

import type { ScaleMuleClient } from '../client';
import { ServiceModule } from '../service';
import type { ApiResponse, PaginationParams, RequestOptions } from '../types';
import { normalizePhoneNumber } from '../utils/phone';

/** Auto-collect device fingerprint components in browser environments */
function collectDeviceFingerprint(): Record<string, unknown> | undefined {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return undefined;
  try {
    return {
      screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      platform: navigator.platform,
      cookie_enabled: navigator.cookieEnabled,
      do_not_track: navigator.doNotTrack
    };
  } catch {
    return undefined;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface AuthUser {
  id: string;
  email: string;
  email_verified: boolean;
  phone?: string;
  phone_verified: boolean;
  full_name?: string;
  username?: string;
  avatar_url?: string;
  status: string;
  created_at: string;
}

export interface LoginDeviceInfo {
  id: string;
  name: string;
  trust_level: string;
  is_new: boolean;
}

export interface LoginRiskInfo {
  score: number;
  action: string;
  factors: string[];
  action_required?: boolean;
}

export interface AuthSession {
  session_token: string;
  user: AuthUser;
  expires_at: string;
  absolute_expires_at: string;
  access_token?: string;
  refresh_token?: string;
  access_token_expires_in?: number;
  device?: LoginDeviceInfo;
  risk?: LoginRiskInfo;
}

export interface SessionInfo {
  id: string;
  ip_address?: string;
  user_agent?: string;
  device: string;
  created_at: string;
  last_active_at: string;
  is_current: boolean;
}

export interface DeviceInfo {
  id: string;
  device_name?: string;
  trust_level: string;
  successful_logins: number;
  last_successful_login?: string;
  last_ip?: string;
  last_country?: string;
  last_city?: string;
  is_blocked: boolean;
  is_current: boolean;
  created_at: string;
}

export interface MfaStatus {
  mfa_enabled: boolean;
  mfa_method?: string;
  totp_configured: boolean;
  sms_configured: boolean;
  email_configured: boolean;
  backup_codes_remaining: number;
  allowed_methods: string[];
  mfa_required: boolean;
  requirement_source: string;
}

export interface TotpSetup {
  secret: string;
  qr_code_uri: string;
  issuer: string;
  account_name: string;
}

export interface BackupCodes {
  backup_codes: string[];
  message: string;
}

export interface LoginHistoryEntry {
  id: string;
  login_method: string;
  success: boolean;
  failure_reason?: string;
  risk_score: number;
  risk_action: string;
  device?: {
    id?: string;
    name: string;
    user_agent?: string;
  };
  location?: {
    ip_address: string;
    country?: string;
    city?: string;
  };
  created_at: string;
}

export interface LoginActivitySummary {
  total_logins_30d: number;
  successful_logins_30d: number;
  failed_logins_30d: number;
  unique_devices: number;
  unique_locations: number;
  high_risk_logins_30d: number;
  last_login?: string;
  last_failed_login?: string;
}

export interface OAuthUrl {
  url: string;
  state?: string;
}

export interface OAuthProvider {
  provider: string;
  provider_email?: string;
  linked_at: string;
}

export interface DataExport {
  user: {
    id: string;
    email: string;
    email_verified: boolean;
    phone?: string;
    phone_verified: boolean;
    full_name?: string;
    username?: string;
    avatar_url?: string;
    status: string;
    created_at: string;
  };
  sessions: Array<{
    id: string;
    ip_address?: string;
    user_agent?: string;
    created_at: string;
    expires_at: string;
  }>;
  oauth_providers: Array<{
    provider: string;
    provider_email?: string;
    linked_at: string;
  }>;
  exported_at: string;
}

// ----------------------------------------------------------------------------
// User directory (customer-scoped)
// ----------------------------------------------------------------------------
//
// These types model the customer-scoped user directory endpoints at
//   GET /v1/auth/users
//   GET /v1/auth/users/{id}
//
// They are scoped by the gateway-injected x-app-id header when called with
// a customer API key + user session, and must NEVER be called with platform
// admin credentials from a customer-facing application.

/** Summary fields returned by the user-directory list endpoint. */
export interface DirectoryUser {
  id: string;
  sm_application_id: string;
  email?: string;
  email_verified: boolean;
  phone?: string;
  phone_verified: boolean;
  full_name?: string;
  avatar_url?: string;
  status: string;
  created_at: string;
  last_login_at?: string;
  login_count: number;
  auth_methods: string[];
}

/** Detailed user record returned by the user-directory get-by-id endpoint. */
export interface DirectoryUserDetail {
  id: string;
  sm_application_id: string;
  email?: string;
  email_verified: boolean;
  phone?: string;
  phone_verified: boolean;
  full_name?: string;
  username?: string;
  avatar_url?: string;
  status: string;
  created_at: string;
  locale?: string;
  time_zone?: string;
  external_role?: string;
  auth_methods: string[];
}

export interface DirectoryUsersListResponse {
  users: DirectoryUser[];
  total: number;
}

export interface SearchUsersParams {
  /** Substring match against email or full_name. */
  search?: string;
  /** Filter by user status (e.g. "active"). */
  status?: string;
  /** Filter by email verification state. */
  email_verified?: boolean;
  /** Filter by phone verification state. */
  phone_verified?: boolean;
  /** 1-indexed page. Server returns 50 results per page (non-configurable). */
  page?: number;
}

// ============================================================================
// Nested Sub-API Classes
// ============================================================================

class AuthMfaApi extends ServiceModule {
  protected basePath = '/v1/auth/mfa';

  async getStatus(): Promise<ApiResponse<MfaStatus>> {
    return this._get<MfaStatus>('/status');
  }

  async setupTotp(): Promise<ApiResponse<TotpSetup>> {
    return this.post<TotpSetup>('/totp/setup');
  }

  async verifySetup(data: {
    code: string;
  }): Promise<ApiResponse<{ success: boolean; backup_codes: string[]; message: string }>> {
    return this.post<{ success: boolean; backup_codes: string[]; message: string }>('/totp/verify-setup', data);
  }

  async enableSms(): Promise<ApiResponse<{ success: boolean; message: string; phone_last_digits: string }>> {
    return this.post<{ success: boolean; message: string; phone_last_digits: string }>('/sms/enable');
  }

  async enableEmail(): Promise<ApiResponse<{ success: boolean; message: string; email_masked: string }>> {
    return this.post<{ success: boolean; message: string; email_masked: string }>('/email/enable');
  }

  async disable(data: {
    password: string;
    code?: string;
  }): Promise<ApiResponse<{ success: boolean; message: string }>> {
    return this.post<{ success: boolean; message: string }>('/disable', data);
  }

  async regenerateBackupCodes(): Promise<ApiResponse<BackupCodes>> {
    return this.post<BackupCodes>('/backup-codes/regenerate');
  }

  async sendCode(data: {
    pending_token: string;
    method: 'sms' | 'email';
  }): Promise<ApiResponse<{ success: boolean; message: string; expires_in_seconds: number }>> {
    return this.post<{ success: boolean; message: string; expires_in_seconds: number }>('/send-code', data);
  }

  async verify(data: {
    pending_token: string;
    code: string;
    method?: 'totp' | 'sms' | 'email' | 'backup_code';
  }): Promise<ApiResponse<AuthSession>> {
    return this.post<AuthSession>('/verify', data);
  }
}

class AuthSessionsApi extends ServiceModule {
  protected basePath = '/v1/auth/sessions';

  async list(): Promise<ApiResponse<SessionInfo[]>> {
    return this._get<SessionInfo[]>('');
  }

  async revoke(sessionId: string): Promise<ApiResponse<{ revoked: boolean }>> {
    return this.del<{ revoked: boolean }>(`/${sessionId}`);
  }

  async revokeAll(): Promise<ApiResponse<{ revoked_count: number }>> {
    return this.del<{ revoked_count: number }>('/others');
  }
}

class AuthDevicesApi extends ServiceModule {
  protected basePath = '/v1/auth/devices';

  async list(): Promise<ApiResponse<DeviceInfo[]>> {
    return this._get<DeviceInfo[]>('');
  }

  async trust(deviceId: string): Promise<ApiResponse<DeviceInfo>> {
    return this.post<DeviceInfo>(`/${deviceId}/trust`);
  }

  async block(deviceId: string): Promise<ApiResponse<DeviceInfo>> {
    return this.post<DeviceInfo>(`/${deviceId}/block`);
  }

  async delete(deviceId: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/${deviceId}`);
  }
}

class AuthLoginHistoryApi extends ServiceModule {
  protected basePath = '/v1/auth';

  async list(params?: PaginationParams & { success?: boolean }): Promise<ApiResponse<LoginHistoryEntry[]>> {
    return this._get<LoginHistoryEntry[]>(this.withQuery('/login-history', params));
  }

  async getSummary(): Promise<ApiResponse<LoginActivitySummary>> {
    return this._get<LoginActivitySummary>('/login-activity');
  }
}

// ============================================================================
// Main Auth Service
// ============================================================================

export class AuthService extends ServiceModule {
  protected basePath = '/v1/auth';

  /** MFA sub-API: sm.auth.mfa.getStatus(), .setupTotp(), .verify(), etc. */
  public readonly mfa: AuthMfaApi;
  /** Session sub-API: sm.auth.sessions.list(), .revoke(), .revokeAll() */
  public readonly sessions: AuthSessionsApi;
  /** Device sub-API: sm.auth.devices.list(), .trust(), .block(), .delete() */
  public readonly devices: AuthDevicesApi;
  /** Login history sub-API: sm.auth.loginHistory.list(), .getSummary() */
  public readonly loginHistory: AuthLoginHistoryApi;

  constructor(client: ScaleMuleClient) {
    super(client);
    this.mfa = new AuthMfaApi(client);
    this.sessions = new AuthSessionsApi(client);
    this.devices = new AuthDevicesApi(client);
    this.loginHistory = new AuthLoginHistoryApi(client);
  }

  private sanitizePhoneField(value?: string): string | undefined {
    if (typeof value !== 'string') return value;
    const normalized = normalizePhoneNumber(value);
    return normalized || undefined;
  }

  // --------------------------------------------------------------------------
  // Core Auth
  // --------------------------------------------------------------------------

  async register(
    data: {
      email: string;
      password: string;
      name?: string;
      full_name?: string;
      username?: string;
      phone?: string;
      session_id?: string;
    },
    options?: RequestOptions
  ): Promise<ApiResponse<AuthSession>> {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone),
      anonymous_id: this.client.getAnonymousId()
    };
    const result = await this.post<AuthSession>('/register', payload, options);
    if (result.data && this.client.isMultiSessionEnabled()) {
      await this.client.addAccount({
        token: result.data.session_token,
        userId: result.data.user.id,
        email: result.data.user.email,
        fullName: result.data.user.full_name,
        avatarUrl: result.data.user.avatar_url,
        expiresAt: result.data.expires_at,
        addedAt: new Date().toISOString()
      });
    }
    if (result.data && this.client.isAccountSwitcherEnabled()) {
      await this.client.addKnownAccount({
        userId: result.data.user.id,
        email: result.data.user.email,
        fullName: result.data.user.full_name,
        avatarUrl: result.data.user.avatar_url,
        provider: 'email',
        lastActiveAt: new Date().toISOString()
      });
    }
    return result;
  }

  async login(
    data: {
      email: string;
      password: string;
      remember_me?: boolean;
      device_fingerprint?: Record<string, unknown>;
    },
    options?: RequestOptions
  ): Promise<ApiResponse<AuthSession>> {
    const payload = {
      ...data,
      anonymous_id: this.client.getAnonymousId(),
      device_fingerprint: data.device_fingerprint || collectDeviceFingerprint()
    };
    const result = await this.post<AuthSession>('/login', payload, options);
    if (result.data && this.client.isMultiSessionEnabled()) {
      await this.client.addAccount({
        token: result.data.session_token,
        userId: result.data.user.id,
        email: result.data.user.email,
        fullName: result.data.user.full_name,
        avatarUrl: result.data.user.avatar_url,
        expiresAt: result.data.expires_at,
        addedAt: new Date().toISOString()
      });
    }
    if (result.data && this.client.isAccountSwitcherEnabled()) {
      await this.client.addKnownAccount({
        userId: result.data.user.id,
        email: result.data.user.email,
        fullName: result.data.user.full_name,
        avatarUrl: result.data.user.avatar_url,
        provider: 'email',
        lastActiveAt: new Date().toISOString()
      });
    }
    return result;
  }

  async logout(options?: RequestOptions): Promise<ApiResponse<{ logged_out: boolean }>> {
    return this.post<{ logged_out: boolean }>('/logout', undefined, options);
  }

  async me(options?: RequestOptions): Promise<ApiResponse<AuthUser>> {
    return this._get<AuthUser>('/me', options);
  }

  // --------------------------------------------------------------------------
  // User directory (customer-scoped)
  // --------------------------------------------------------------------------
  //
  // Search / fetch users within the caller's application. These endpoints are
  // scoped by the gateway-injected x-app-id header, so when invoked with a
  // customer API key + user session they will only return users belonging to
  // the caller's application. They replace the prior pattern of customer apps
  // reaching for platform admin credentials to hit admin-only user routes.
  //
  // DO NOT call these with platform admin credentials from customer-facing
  // applications. Use the standard customer auth path (API key + user session)
  // and let the gateway inject x-app-id on your behalf.

  /**
   * Search users within the caller's application.
   *
   * Results are automatically scoped to the caller's application via the
   * x-app-id header injected by the gateway. Server-side page size is fixed
   * at 50 (the `per_page` query param is not honored upstream).
   *
   * @example
   *   const res = await sm.auth.searchUsers({ search: 'alice' });
   *   res.data?.users.forEach(u => console.log(u.email));
   */
  async searchUsers(
    params?: SearchUsersParams,
    options?: RequestOptions
  ): Promise<ApiResponse<DirectoryUsersListResponse>> {
    const query: Record<string, unknown> = {};
    if (params?.search !== undefined) query.search = params.search;
    if (params?.status !== undefined) query.status = params.status;
    if (params?.email_verified !== undefined) {
      query.email_verified = params.email_verified ? 'true' : 'false';
    }
    if (params?.phone_verified !== undefined) {
      query.phone_verified = params.phone_verified ? 'true' : 'false';
    }
    if (params?.page !== undefined) query.page = params.page;
    return this._get<DirectoryUsersListResponse>(this.withQuery('/users', query), options);
  }

  /**
   * Fetch a single user by ID within the caller's application.
   *
   * Returns 404 if the user is not in the caller's application — cross-tenant
   * reads are blocked at the gateway via the x-app-id header scope.
   */
  async getUser(userId: string, options?: RequestOptions): Promise<ApiResponse<DirectoryUserDetail>> {
    return this._get<DirectoryUserDetail>(`/users/${encodeURIComponent(userId)}`, options);
  }

  /** Refresh the session. Alias: refreshToken() */
  async refreshSession(
    data?: { refresh_token?: string; session_token?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<AuthSession>> {
    return this.post<AuthSession>('/refresh', data ?? {}, options);
  }

  /** @deprecated Use refreshSession() */
  async refreshToken(data?: { refresh_token?: string; session_token?: string }) {
    return this.refreshSession(data);
  }

  // --------------------------------------------------------------------------
  // Passwordless Auth
  // --------------------------------------------------------------------------

  /**
   * Send a one-time password for passwordless sign-in.
   * @experimental Endpoint availability depends on backend deployment.
   */
  async signInWithOtp(
    data: { email?: string; phone?: string; channel?: 'email' | 'sms' },
    options?: RequestOptions
  ): Promise<ApiResponse<{ sent: boolean }>> {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone)
    };
    return this.post<{ sent: boolean }>('/otp/send', payload, options);
  }

  /**
   * Verify OTP code and create a session.
   * @experimental Endpoint availability depends on backend deployment.
   */
  async verifyOtp(
    data: { email?: string; phone?: string; code: string },
    options?: RequestOptions
  ): Promise<ApiResponse<AuthSession>> {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone)
    };
    return this.post<AuthSession>('/otp/verify', payload, options);
  }

  /**
   * Send a magic link for passwordless sign-in.
   * @experimental Endpoint availability depends on backend deployment.
   */
  async signInWithMagicLink(
    data: { email: string },
    options?: RequestOptions
  ): Promise<ApiResponse<{ sent: boolean }>> {
    return this.post<{ sent: boolean }>('/magic-link/send', data, options);
  }

  /**
   * Verify a magic link token and create a session.
   * @experimental Endpoint availability depends on backend deployment.
   */
  async verifyMagicLink(data: { token: string }, options?: RequestOptions): Promise<ApiResponse<AuthSession>> {
    return this.post<AuthSession>('/magic-link/verify', data, options);
  }

  // --------------------------------------------------------------------------
  // Phone OTP (existing backend endpoints)
  // --------------------------------------------------------------------------

  async sendPhoneOtp(
    data: { phone: string; purpose?: 'verify_phone' | 'login' | 'password_reset' | 'change_phone' },
    options?: RequestOptions
  ): Promise<ApiResponse<{ sent: boolean }>> {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone) ?? ''
    };
    return this.post<{ sent: boolean }>('/phone/send-otp', payload, options);
  }

  async verifyPhoneOtp(
    data: { phone: string; code: string },
    options?: RequestOptions
  ): Promise<ApiResponse<{ verified: boolean }>> {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone) ?? ''
    };
    return this.post<{ verified: boolean }>('/phone/verify-otp', payload, options);
  }

  async resendPhoneOtp(data: { phone: string }, options?: RequestOptions): Promise<ApiResponse<{ sent: boolean }>> {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone) ?? ''
    };
    return this.post<{ sent: boolean }>('/phone/resend-otp', payload, options);
  }

  /** Login with phone OTP (sends + verifies in one flow) */
  async loginWithPhone(
    data: { phone: string; code: string },
    options?: RequestOptions
  ): Promise<ApiResponse<AuthSession>> {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone) ?? '',
      purpose: 'login' as const
    };
    return this.post<AuthSession>('/phone/verify-otp', payload, options);
  }

  // --------------------------------------------------------------------------
  // Password Management
  // --------------------------------------------------------------------------

  async forgotPassword(data: { email: string }, options?: RequestOptions): Promise<ApiResponse<{ sent: boolean }>> {
    return this.post<{ sent: boolean }>('/forgot-password', data, options);
  }

  async resetPassword(
    data: { token: string; password?: string; new_password?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<{ reset: boolean }>> {
    return this.post<{ reset: boolean }>('/reset-password', data, options);
  }

  async changePassword(
    data: { current_password: string; new_password: string },
    options?: RequestOptions
  ): Promise<ApiResponse<{ changed: boolean }>> {
    return this.post<{ changed: boolean }>('/password/change', data, options);
  }

  // --------------------------------------------------------------------------
  // Email & Phone Management
  // --------------------------------------------------------------------------

  async verifyEmail(data: { token: string }, options?: RequestOptions): Promise<ApiResponse<{ verified: boolean }>> {
    return this.post<{ verified: boolean }>('/verify-email', data, options);
  }

  /** Resend email verification. Alias: resendEmailVerification() */
  async resendVerification(
    data?: { email?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<{ sent: boolean }>> {
    return this.post<{ sent: boolean }>('/resend-verification', data ?? {}, options);
  }

  /** @deprecated Use resendVerification() */
  async resendEmailVerification(data?: { email?: string }) {
    return this.resendVerification(data);
  }

  async changeEmail(
    data: { new_email: string; password: string },
    options?: RequestOptions
  ): Promise<ApiResponse<{ changed: boolean }>> {
    return this.post<{ changed: boolean }>('/email/change', data, options);
  }

  async changePhone(data: { new_phone: string }, options?: RequestOptions): Promise<ApiResponse<{ changed: boolean }>> {
    const payload = {
      ...data,
      new_phone: this.sanitizePhoneField(data.new_phone) ?? ''
    };
    return this.post<{ changed: boolean }>('/phone/change', payload, options);
  }

  // --------------------------------------------------------------------------
  // Account
  // --------------------------------------------------------------------------

  async deleteAccount(options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>('/me', options);
  }

  async exportData(options?: RequestOptions): Promise<ApiResponse<DataExport>> {
    return this._get<DataExport>('/me/export', options);
  }

  // --------------------------------------------------------------------------
  // OAuth
  // --------------------------------------------------------------------------

  async getOAuthUrl(provider: string, redirectUri: string, options?: RequestOptions): Promise<ApiResponse<OAuthUrl>> {
    return this._get<OAuthUrl>(this.withQuery(`/oauth/${provider}/authorize`, { redirect_uri: redirectUri }), options);
  }

  async handleOAuthCallback(
    data: { provider: string; code: string; state?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<AuthSession>> {
    const { provider, ...rest } = data;
    const result = await this._get<AuthSession>(this.withQuery(`/oauth/${provider}/callback`, rest), options);
    if (result.data && this.client.isAccountSwitcherEnabled()) {
      await this.client.addKnownAccount({
        userId: result.data.user.id,
        email: result.data.user.email,
        fullName: result.data.user.full_name,
        avatarUrl: result.data.user.avatar_url,
        provider,
        lastActiveAt: new Date().toISOString()
      });
    }
    return result;
  }

  async listOAuthProviders(options?: RequestOptions): Promise<ApiResponse<OAuthProvider[]>> {
    return this._get<OAuthProvider[]>('/oauth/providers', options);
  }

  async unlinkOAuthProvider(provider: string, options?: RequestOptions): Promise<ApiResponse<{ unlinked: boolean }>> {
    return this.del<{ unlinked: boolean }>(`/oauth/providers/${provider}`, options);
  }

  // --------------------------------------------------------------------------
  // Token Management
  // --------------------------------------------------------------------------

  async refreshAccessToken(
    data?: { refresh_token?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<AuthSession>> {
    return this.post<AuthSession>('/token/refresh', data ?? {}, options);
  }

  async revokeRefreshToken(
    data: { refresh_token: string },
    options?: RequestOptions
  ): Promise<ApiResponse<{ revoked: boolean }>> {
    return this.post<{ revoked: boolean }>('/token/revoke', data, options);
  }

  // --------------------------------------------------------------------------
  // Flat methods for backward compatibility (delegate to sub-APIs)
  // --------------------------------------------------------------------------

  /** @deprecated Use auth.sessions.list() */
  async listSessions() {
    return this.sessions.list();
  }
  /** @deprecated Use auth.sessions.revoke() */
  async revokeSession(sessionId: string) {
    return this.sessions.revoke(sessionId);
  }
  /** @deprecated Use auth.sessions.revokeAll() */
  async revokeOtherSessions() {
    return this.sessions.revokeAll();
  }

  /** @deprecated Use auth.devices.list() */
  async listDevices() {
    return this.devices.list();
  }
  /** @deprecated Use auth.devices.trust() */
  async trustDevice(deviceId: string) {
    return this.devices.trust(deviceId);
  }
  /** @deprecated Use auth.devices.block() */
  async blockDevice(deviceId: string) {
    return this.devices.block(deviceId);
  }
  /** @deprecated Use auth.devices.delete() */
  async deleteDevice(deviceId: string) {
    return this.devices.delete(deviceId);
  }

  /** @deprecated Use auth.loginHistory.list() */
  async getLoginHistory(params?: { success?: boolean; page?: number; per_page?: number }) {
    return this.loginHistory.list(params);
  }
  /** @deprecated Use auth.loginHistory.getSummary() */
  async getLoginActivitySummary() {
    return this.loginHistory.getSummary();
  }

  /** @deprecated Use auth.mfa.getStatus() */
  async getMfaStatus() {
    return this.mfa.getStatus();
  }
  /** @deprecated Use auth.mfa.setupTotp() */
  async setupTotp() {
    return this.mfa.setupTotp();
  }
  /** @deprecated Use auth.mfa.verifySetup() */
  async verifyTotpSetup(data: { code: string }) {
    return this.mfa.verifySetup(data);
  }
  /** @deprecated Use auth.mfa.enableSms() */
  async enableSmsMfa() {
    return this.mfa.enableSms();
  }
  /** @deprecated Use auth.mfa.enableEmail() */
  async enableEmailMfa() {
    return this.mfa.enableEmail();
  }
  /** @deprecated Use auth.mfa.disable() */
  async disableMfa(data: { password: string; code?: string }) {
    return this.mfa.disable(data);
  }
  /** @deprecated Use auth.mfa.regenerateBackupCodes() */
  async regenerateBackupCodes() {
    return this.mfa.regenerateBackupCodes();
  }
  /** @deprecated Use auth.mfa.sendCode() */
  async sendMfaCode(data: { pending_token: string; method: 'sms' | 'email' }) {
    return this.mfa.sendCode(data);
  }
  /** @deprecated Use auth.mfa.verify() */
  async verifyMfa(data: { pending_token: string; code: string; method?: 'totp' | 'sms' | 'email' | 'backup_code' }) {
    return this.mfa.verify(data);
  }
}
