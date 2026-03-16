export { PHONE_COUNTRIES, PhoneCountry, PhoneNormalizationResult, composePhoneNumber, countryFlag, detectCountryFromE164, findPhoneCountryByCode, findPhoneCountryByDialCode, isValidE164Phone, normalizeAndValidatePhone, normalizePhoneNumber } from '@scalemule/ui/phone';

/**
 * ScaleMule SDK Types
 *
 * Core type definitions for the { data, error } response contract,
 * standardized error codes, and pagination.
 */
/**
 * Universal response type for all SDK methods.
 *
 * On success: { data: T, error: null }
 * On failure: { data: null, error: ApiError }
 *
 * Error is always present in the type (null when success).
 * Data is always present in the type (null when failure).
 * No exceptions thrown for expected API errors (4xx).
 */
type ApiResponse<T> = {
    data: T | null;
    error: ApiError | null;
};
/**
 * Standardized API error with machine-readable code.
 *
 * Codes are lowercase, underscore-separated identifiers.
 * The `details` field carries context-specific data like
 * field-level validation errors or rate limit reset times.
 */
type ApiError = {
    /** Machine-readable error code (e.g., 'not_found', 'rate_limited') */
    code: string;
    /** Human-readable error message */
    message: string;
    /** HTTP status code */
    status: number;
    /** Additional context (field errors, retryAfter, etc.) */
    details?: Record<string, unknown>;
};
/**
 * Paginated response envelope.
 * Used by all methods that return lists.
 */
type PaginatedResponse<T> = {
    data: T[];
    metadata: PaginationMetadata;
    error: ApiError | null;
};
/**
 * Pagination metadata returned with every list response.
 */
type PaginationMetadata = {
    total: number;
    totalPages: number;
    page: number;
    perPage: number;
    /** Reserved for future cursor-based pagination */
    nextCursor?: string;
};
/**
 * Pagination request parameters.
 * Accepted by any paginated method.
 */
type PaginationParams = {
    page?: number;
    perPage?: number;
};
/**
 * Standardized error codes used across all services.
 *
 * These are the machine-readable `code` values on ApiError.
 * Services may also return service-specific codes beyond these.
 */
declare const ErrorCodes: {
    readonly UNAUTHORIZED: "unauthorized";
    readonly FORBIDDEN: "forbidden";
    readonly NOT_FOUND: "not_found";
    readonly CONFLICT: "conflict";
    readonly VALIDATION_ERROR: "validation_error";
    readonly RATE_LIMITED: "rate_limited";
    readonly QUOTA_EXCEEDED: "quota_exceeded";
    readonly INTERNAL_ERROR: "internal_error";
    readonly NETWORK_ERROR: "network_error";
    readonly TIMEOUT: "timeout";
    readonly ABORTED: "aborted";
    readonly FILE_SCANNING: "file_scanning";
    readonly FILE_THREAT: "file_threat";
    readonly FILE_QUARANTINED: "file_quarantined";
    readonly UPLOAD_ERROR: "upload_error";
};
type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
/**
 * Storage adapter interface for session persistence.
 * Supports both sync (localStorage) and async (AsyncStorage) implementations.
 */
interface StorageAdapter {
    getItem(key: string): string | null | Promise<string | null>;
    setItem(key: string, value: string): void | Promise<void>;
    removeItem(key: string): void | Promise<void>;
}
/**
 * Configuration for the ScaleMule client.
 */
interface ScaleMuleConfig {
    /** API key (publishable key for browser, secret key for server) */
    apiKey: string;
    /** Base URL for API requests. Overrides environment preset. */
    baseUrl?: string;
    /** Environment preset ('dev' or 'prod'). Defaults to 'prod'. */
    environment?: 'dev' | 'prod';
    /** Retry configuration for transient failures */
    retry?: {
        /** Max retry attempts (default: 2) */
        maxRetries?: number;
        /** Base delay between retries in ms (default: 300) */
        backoffMs?: number;
    };
    /** Request timeout in ms (default: 30000) */
    timeout?: number;
    /** Enable debug logging to console */
    debug?: boolean;
    /** Custom storage adapter for session persistence */
    storage?: StorageAdapter;
    /** Enable rate limit queue — auto-queues requests when rate limited */
    enableRateLimitQueue?: boolean;
    /** Enable offline queue — queues requests when offline, syncs on reconnect */
    enableOfflineQueue?: boolean;
}
/**
 * Per-request options that override client defaults.
 */
interface RequestOptions {
    /** Skip adding auth headers (for public endpoints) */
    skipAuth?: boolean;
    /** Custom timeout in ms for this request */
    timeout?: number;
    /** Number of retry attempts for this request */
    retries?: number;
    /** Skip retries entirely for this request */
    skipRetry?: boolean;
    /** User-provided AbortSignal for cancellation */
    signal?: AbortSignal;
    /** Additional headers for this request */
    headers?: Record<string, string>;
    /** Client context to forward end-user info (IP, UA, etc.) in server-to-server calls */
    clientContext?: ClientContext;
}
/**
 * End-user context for server-to-server calls.
 *
 * When your server proxies requests to ScaleMule (e.g., from a Next.js API route),
 * pass this so ScaleMule records the real end-user's information instead of your
 * server's IP and user agent.
 *
 * Use `extractClientContext()` to build this from an incoming request.
 */
interface ClientContext {
    /** End-user IP address */
    ip?: string;
    /** End-user browser User-Agent */
    userAgent?: string;
    /** End-user device fingerprint */
    deviceFingerprint?: string;
    /** HTTP Referer header from the end-user's request */
    referrer?: string;
}

/**
 * Client Context Utilities (Framework-Agnostic)
 *
 * Extract end-user context from incoming HTTP requests and convert it
 * to X-Client-* headers for forwarding to ScaleMule.
 *
 * Works with any server framework: Express, Fastify, Hono, raw Node.js
 * http.IncomingMessage, Next.js, etc.
 *
 * For Next.js-specific helpers (App Router `NextRequest`, Pages Router
 * `NextApiRequest`), see `@scalemule/nextjs/server` which re-exports
 * these utilities plus Next.js-typed wrappers.
 */

/**
 * Minimal interface for an incoming HTTP request.
 *
 * Covers Node.js `http.IncomingMessage`, Express `Request`, Fastify
 * `FastifyRequest`, and similar. Headers are a plain object where values
 * can be `string`, `string[]`, or `undefined` (Node.js convention).
 */
interface IncomingRequestLike {
    headers: Record<string, string | string[] | undefined>;
    socket?: {
        remoteAddress?: string;
    };
}
/**
 * Validate an IPv4 or IPv6 address.
 * Returns the trimmed IP if valid, `undefined` otherwise.
 */
declare function validateIP(ip: string | undefined | null): string | undefined;
/**
 * Extract end-user context from an incoming HTTP request.
 *
 * IP extraction priority (same chain as `@scalemule/nextjs`):
 *   1. CF-Connecting-IP       (Cloudflare)
 *   2. DO-Connecting-IP       (DigitalOcean)
 *   3. X-Real-IP              (nginx / DO K8s ingress)
 *   4. X-Forwarded-For        (first IP — standard proxy header)
 *   5. X-Vercel-Forwarded-For (Vercel)
 *   6. True-Client-IP         (Akamai / Cloudflare Enterprise)
 *   7. socket.remoteAddress   (direct connection fallback)
 *
 * @example
 * ```typescript
 * // Express
 * import { extractClientContext } from '@scalemule/sdk'
 * app.post('/upload', async (req, res) => {
 *   const ctx = extractClientContext(req)
 *   const result = await sm.storage.upload(file, { clientContext: ctx })
 * })
 * ```
 */
declare function extractClientContext(request: IncomingRequestLike): ClientContext;
/**
 * Convert a `ClientContext` into request headers for ScaleMule.
 *
 * `x-sm-forwarded-client-ip` is the authenticated server-side forwarding header
 * consumed by the gateway to derive trusted downstream IP context.
 *
 * We also keep the legacy `X-Client-*` headers during rollout for backward
 * compatibility with older gateway/service deployments.
 *
 * Used internally by `ServiceModule.resolveOptions()`. You normally don't
 * need to call this directly — just pass `clientContext` in `RequestOptions`.
 */
declare function buildClientContextHeaders(context: ClientContext | undefined): Record<string, string>;

/**
 * ScaleMule Core HTTP Client
 *
 * Fetch-based client with:
 * - { data, error } response contract
 * - Exponential backoff with jitter on retries
 * - x-idempotency-key on POST retries (prevents duplicate side effects)
 * - Rate limit queue (auto-queues on 429)
 * - Offline queue with persistence
 * - AbortController / AbortSignal support
 * - Works in browser, Node.js 18+, and edge runtimes
 *
 * Promoted from sdks/scalemule-nextjs and adapted for the base SDK.
 */

declare class ScaleMuleClient {
    private apiKey;
    private baseUrl;
    private debug;
    private storage;
    private defaultTimeout;
    private maxRetries;
    private backoffMs;
    private sessionToken;
    private userId;
    private rateLimitQueue;
    private offlineQueue;
    private workspaceId;
    constructor(config: ScaleMuleConfig);
    initialize(): Promise<void>;
    setSession(token: string, userId: string): Promise<void>;
    clearSession(): Promise<void>;
    setAccessToken(token: string): void;
    clearAccessToken(): void;
    getSessionToken(): string | null;
    getUserId(): string | null;
    isAuthenticated(): boolean;
    getBaseUrl(): string;
    getApiKey(): string;
    isOnline(): boolean;
    getOfflineQueueLength(): number;
    getRateLimitQueueLength(): number;
    isRateLimited(): boolean;
    setWorkspaceContext(id: string | null): void;
    getWorkspaceId(): string | null;
    request<T>(path: string, init?: {
        method?: string;
        body?: unknown;
        headers?: Record<string, string>;
        skipAuth?: boolean;
        timeout?: number;
        retries?: number;
        skipRetry?: boolean;
        signal?: AbortSignal;
    }): Promise<ApiResponse<T>>;
    get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>>;
    post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>>;
    put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>>;
    patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>>;
    del<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>>;
    /**
     * Upload a file using multipart/form-data.
     *
     * Supports progress tracking via XMLHttpRequest (browser only).
     * Supports cancellation via AbortController signal.
     * Retries with exponential backoff on transient failures.
     */
    upload<T>(path: string, file: File | Blob, additionalFields?: Record<string, string>, options?: RequestOptions & {
        onProgress?: (progress: number) => void;
    }): Promise<ApiResponse<T>>;
    /**
     * Single upload with XMLHttpRequest for progress tracking.
     * Supports abort via AbortSignal.
     */
    private uploadWithXHR;
    private syncOfflineQueue;
}

/**
 * ServiceModule Base Class
 *
 * Abstract base that all service modules (auth, storage, etc.) extend.
 * Provides typed HTTP methods that delegate to ScaleMuleClient and
 * auto-normalize responses into the { data, error } contract.
 *
 * Pagination: The `list()` method normalizes backend pagination responses
 * into the standard PaginatedResponse<T> envelope.
 */

declare abstract class ServiceModule {
    protected client: ScaleMuleClient;
    protected abstract basePath: string;
    constructor(client: ScaleMuleClient);
    /**
     * Merge `clientContext` from RequestOptions into `headers`.
     * Explicit headers take precedence over context-derived ones.
     */
    private resolveOptions;
    protected _get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>>;
    protected post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>>;
    protected put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>>;
    protected patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>>;
    protected del<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>>;
    /**
     * Fetch a paginated list from the backend.
     *
     * Normalizes varying backend pagination shapes into the standard
     * PaginatedResponse<T> envelope. Supports backends that return:
     *   - { data: T[], metadata: { total, ... } }           (preferred)
     *   - { items: T[], total, page, per_page }              (legacy)
     *   - T[]                                                (bare array)
     *
     * Extra params beyond page/perPage are forwarded as query string parameters.
     */
    protected _list<T>(path: string, params?: Record<string, unknown>, options?: RequestOptions): Promise<PaginatedResponse<T>>;
    protected _upload<T>(path: string, file: File | Blob, additionalFields?: Record<string, string>, options?: RequestOptions & {
        onProgress?: (progress: number) => void;
    }): Promise<ApiResponse<T>>;
    /**
     * Append query parameters to a relative path.
     * Use with verb methods: `this.get(this.withQuery('/items', { status: 'active' }))`
     * Does NOT add basePath — the verb methods handle that.
     */
    protected withQuery(path: string, params?: Record<string, unknown>): string;
}

/**
 * Auth Service Module
 *
 * Full auth service with nested sub-APIs:
 *   auth.mfa.*          — Multi-factor authentication
 *   auth.sessions.*     — Session management
 *   auth.devices.*      — Device trust/block
 *   auth.loginHistory.* — Login history & activity
 */

interface AuthUser {
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
interface LoginDeviceInfo {
    id: string;
    name: string;
    trust_level: string;
    is_new: boolean;
}
interface LoginRiskInfo {
    score: number;
    action: string;
    factors: string[];
    action_required?: boolean;
}
interface AuthSession {
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
interface SessionInfo {
    id: string;
    ip_address?: string;
    user_agent?: string;
    device: string;
    created_at: string;
    last_active_at: string;
    is_current: boolean;
}
interface DeviceInfo {
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
interface MfaStatus {
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
interface TotpSetup {
    secret: string;
    qr_code_uri: string;
    issuer: string;
    account_name: string;
}
interface BackupCodes {
    backup_codes: string[];
    message: string;
}
interface LoginHistoryEntry {
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
interface LoginActivitySummary {
    total_logins_30d: number;
    successful_logins_30d: number;
    failed_logins_30d: number;
    unique_devices: number;
    unique_locations: number;
    high_risk_logins_30d: number;
    last_login?: string;
    last_failed_login?: string;
}
interface OAuthUrl {
    url: string;
    state?: string;
}
interface OAuthProvider {
    provider: string;
    provider_email?: string;
    linked_at: string;
}
interface DataExport {
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
declare class AuthMfaApi extends ServiceModule {
    protected basePath: string;
    getStatus(): Promise<ApiResponse<MfaStatus>>;
    setupTotp(): Promise<ApiResponse<TotpSetup>>;
    verifySetup(data: {
        code: string;
    }): Promise<ApiResponse<{
        success: boolean;
        backup_codes: string[];
        message: string;
    }>>;
    enableSms(): Promise<ApiResponse<{
        success: boolean;
        message: string;
        phone_last_digits: string;
    }>>;
    enableEmail(): Promise<ApiResponse<{
        success: boolean;
        message: string;
        email_masked: string;
    }>>;
    disable(data: {
        password: string;
        code?: string;
    }): Promise<ApiResponse<{
        success: boolean;
        message: string;
    }>>;
    regenerateBackupCodes(): Promise<ApiResponse<BackupCodes>>;
    sendCode(data: {
        pending_token: string;
        method: 'sms' | 'email';
    }): Promise<ApiResponse<{
        success: boolean;
        message: string;
        expires_in_seconds: number;
    }>>;
    verify(data: {
        pending_token: string;
        code: string;
        method?: 'totp' | 'sms' | 'email' | 'backup_code';
    }): Promise<ApiResponse<AuthSession>>;
}
declare class AuthSessionsApi extends ServiceModule {
    protected basePath: string;
    list(): Promise<ApiResponse<SessionInfo[]>>;
    revoke(sessionId: string): Promise<ApiResponse<{
        revoked: boolean;
    }>>;
    revokeAll(): Promise<ApiResponse<{
        revoked_count: number;
    }>>;
}
declare class AuthDevicesApi extends ServiceModule {
    protected basePath: string;
    list(): Promise<ApiResponse<DeviceInfo[]>>;
    trust(deviceId: string): Promise<ApiResponse<DeviceInfo>>;
    block(deviceId: string): Promise<ApiResponse<DeviceInfo>>;
    delete(deviceId: string): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
}
declare class AuthLoginHistoryApi extends ServiceModule {
    protected basePath: string;
    list(params?: PaginationParams & {
        success?: boolean;
    }): Promise<ApiResponse<LoginHistoryEntry[]>>;
    getSummary(): Promise<ApiResponse<LoginActivitySummary>>;
}
declare class AuthService extends ServiceModule {
    protected basePath: string;
    /** MFA sub-API: sm.auth.mfa.getStatus(), .setupTotp(), .verify(), etc. */
    readonly mfa: AuthMfaApi;
    /** Session sub-API: sm.auth.sessions.list(), .revoke(), .revokeAll() */
    readonly sessions: AuthSessionsApi;
    /** Device sub-API: sm.auth.devices.list(), .trust(), .block(), .delete() */
    readonly devices: AuthDevicesApi;
    /** Login history sub-API: sm.auth.loginHistory.list(), .getSummary() */
    readonly loginHistory: AuthLoginHistoryApi;
    constructor(client: ScaleMuleClient);
    private sanitizePhoneField;
    register(data: {
        email: string;
        password: string;
        name?: string;
        full_name?: string;
        username?: string;
        phone?: string;
        session_id?: string;
    }, options?: RequestOptions): Promise<ApiResponse<AuthSession>>;
    login(data: {
        email: string;
        password: string;
        remember_me?: boolean;
    }, options?: RequestOptions): Promise<ApiResponse<AuthSession>>;
    logout(options?: RequestOptions): Promise<ApiResponse<{
        logged_out: boolean;
    }>>;
    me(options?: RequestOptions): Promise<ApiResponse<AuthUser>>;
    /** Refresh the session. Alias: refreshToken() */
    refreshSession(data?: {
        refresh_token?: string;
        session_token?: string;
    }, options?: RequestOptions): Promise<ApiResponse<AuthSession>>;
    /** @deprecated Use refreshSession() */
    refreshToken(data?: {
        refresh_token?: string;
        session_token?: string;
    }): Promise<ApiResponse<AuthSession>>;
    /**
     * Send a one-time password for passwordless sign-in.
     * @experimental Endpoint availability depends on backend deployment.
     */
    signInWithOtp(data: {
        email?: string;
        phone?: string;
        channel?: 'email' | 'sms';
    }, options?: RequestOptions): Promise<ApiResponse<{
        sent: boolean;
    }>>;
    /**
     * Verify OTP code and create a session.
     * @experimental Endpoint availability depends on backend deployment.
     */
    verifyOtp(data: {
        email?: string;
        phone?: string;
        code: string;
    }, options?: RequestOptions): Promise<ApiResponse<AuthSession>>;
    /**
     * Send a magic link for passwordless sign-in.
     * @experimental Endpoint availability depends on backend deployment.
     */
    signInWithMagicLink(data: {
        email: string;
    }, options?: RequestOptions): Promise<ApiResponse<{
        sent: boolean;
    }>>;
    /**
     * Verify a magic link token and create a session.
     * @experimental Endpoint availability depends on backend deployment.
     */
    verifyMagicLink(data: {
        token: string;
    }, options?: RequestOptions): Promise<ApiResponse<AuthSession>>;
    sendPhoneOtp(data: {
        phone: string;
        purpose?: 'verify_phone' | 'login' | 'password_reset' | 'change_phone';
    }, options?: RequestOptions): Promise<ApiResponse<{
        sent: boolean;
    }>>;
    verifyPhoneOtp(data: {
        phone: string;
        code: string;
    }, options?: RequestOptions): Promise<ApiResponse<{
        verified: boolean;
    }>>;
    resendPhoneOtp(data: {
        phone: string;
    }, options?: RequestOptions): Promise<ApiResponse<{
        sent: boolean;
    }>>;
    /** Login with phone OTP (sends + verifies in one flow) */
    loginWithPhone(data: {
        phone: string;
        code: string;
    }, options?: RequestOptions): Promise<ApiResponse<AuthSession>>;
    forgotPassword(data: {
        email: string;
    }, options?: RequestOptions): Promise<ApiResponse<{
        sent: boolean;
    }>>;
    resetPassword(data: {
        token: string;
        password?: string;
        new_password?: string;
    }, options?: RequestOptions): Promise<ApiResponse<{
        reset: boolean;
    }>>;
    changePassword(data: {
        current_password: string;
        new_password: string;
    }, options?: RequestOptions): Promise<ApiResponse<{
        changed: boolean;
    }>>;
    verifyEmail(data: {
        token: string;
    }, options?: RequestOptions): Promise<ApiResponse<{
        verified: boolean;
    }>>;
    /** Resend email verification. Alias: resendEmailVerification() */
    resendVerification(data?: {
        email?: string;
    }, options?: RequestOptions): Promise<ApiResponse<{
        sent: boolean;
    }>>;
    /** @deprecated Use resendVerification() */
    resendEmailVerification(data?: {
        email?: string;
    }): Promise<ApiResponse<{
        sent: boolean;
    }>>;
    changeEmail(data: {
        new_email: string;
        password: string;
    }, options?: RequestOptions): Promise<ApiResponse<{
        changed: boolean;
    }>>;
    changePhone(data: {
        new_phone: string;
    }, options?: RequestOptions): Promise<ApiResponse<{
        changed: boolean;
    }>>;
    deleteAccount(options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    exportData(options?: RequestOptions): Promise<ApiResponse<DataExport>>;
    getOAuthUrl(provider: string, redirectUri: string, options?: RequestOptions): Promise<ApiResponse<OAuthUrl>>;
    handleOAuthCallback(data: {
        provider: string;
        code: string;
        state?: string;
    }, options?: RequestOptions): Promise<ApiResponse<AuthSession>>;
    listOAuthProviders(options?: RequestOptions): Promise<ApiResponse<OAuthProvider[]>>;
    unlinkOAuthProvider(provider: string, options?: RequestOptions): Promise<ApiResponse<{
        unlinked: boolean;
    }>>;
    refreshAccessToken(data?: {
        refresh_token?: string;
    }, options?: RequestOptions): Promise<ApiResponse<AuthSession>>;
    revokeRefreshToken(data: {
        refresh_token: string;
    }, options?: RequestOptions): Promise<ApiResponse<{
        revoked: boolean;
    }>>;
    /** @deprecated Use auth.sessions.list() */
    listSessions(): Promise<ApiResponse<SessionInfo[]>>;
    /** @deprecated Use auth.sessions.revoke() */
    revokeSession(sessionId: string): Promise<ApiResponse<{
        revoked: boolean;
    }>>;
    /** @deprecated Use auth.sessions.revokeAll() */
    revokeOtherSessions(): Promise<ApiResponse<{
        revoked_count: number;
    }>>;
    /** @deprecated Use auth.devices.list() */
    listDevices(): Promise<ApiResponse<DeviceInfo[]>>;
    /** @deprecated Use auth.devices.trust() */
    trustDevice(deviceId: string): Promise<ApiResponse<DeviceInfo>>;
    /** @deprecated Use auth.devices.block() */
    blockDevice(deviceId: string): Promise<ApiResponse<DeviceInfo>>;
    /** @deprecated Use auth.devices.delete() */
    deleteDevice(deviceId: string): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    /** @deprecated Use auth.loginHistory.list() */
    getLoginHistory(params?: {
        success?: boolean;
        page?: number;
        per_page?: number;
    }): Promise<ApiResponse<LoginHistoryEntry[]>>;
    /** @deprecated Use auth.loginHistory.getSummary() */
    getLoginActivitySummary(): Promise<ApiResponse<LoginActivitySummary>>;
    /** @deprecated Use auth.mfa.getStatus() */
    getMfaStatus(): Promise<ApiResponse<MfaStatus>>;
    /** @deprecated Use auth.mfa.setupTotp() */
    setupTotp(): Promise<ApiResponse<TotpSetup>>;
    /** @deprecated Use auth.mfa.verifySetup() */
    verifyTotpSetup(data: {
        code: string;
    }): Promise<ApiResponse<{
        success: boolean;
        backup_codes: string[];
        message: string;
    }>>;
    /** @deprecated Use auth.mfa.enableSms() */
    enableSmsMfa(): Promise<ApiResponse<{
        success: boolean;
        message: string;
        phone_last_digits: string;
    }>>;
    /** @deprecated Use auth.mfa.enableEmail() */
    enableEmailMfa(): Promise<ApiResponse<{
        success: boolean;
        message: string;
        email_masked: string;
    }>>;
    /** @deprecated Use auth.mfa.disable() */
    disableMfa(data: {
        password: string;
        code?: string;
    }): Promise<ApiResponse<{
        success: boolean;
        message: string;
    }>>;
    /** @deprecated Use auth.mfa.regenerateBackupCodes() */
    regenerateBackupCodes(): Promise<ApiResponse<BackupCodes>>;
    /** @deprecated Use auth.mfa.sendCode() */
    sendMfaCode(data: {
        pending_token: string;
        method: 'sms' | 'email';
    }): Promise<ApiResponse<{
        success: boolean;
        message: string;
        expires_in_seconds: number;
    }>>;
    /** @deprecated Use auth.mfa.verify() */
    verifyMfa(data: {
        pending_token: string;
        code: string;
        method?: 'totp' | 'sms' | 'email' | 'backup_code';
    }): Promise<ApiResponse<AuthSession>>;
}

interface UploadOptions {
    /** Display filename (sanitized automatically) */
    filename?: string;
    /** Make file publicly accessible */
    isPublic?: boolean;
    /** Custom metadata attached to the file */
    metadata?: Record<string, unknown>;
    /** Upload progress callback (0-100) */
    onProgress?: (percent: number) => void;
    /** AbortSignal for cancellation */
    signal?: AbortSignal;
    /** Client context to forward end-user info (IP, UA, etc.) in server-to-server calls */
    clientContext?: ClientContext;
    /** Skip client-side image compression (default: false) */
    skipCompression?: boolean;
    /** Compression configuration */
    compression?: Partial<CompressionConfig>;
    /** Force multipart upload regardless of file size */
    forceMultipart?: boolean;
    /** Resume behavior: 'auto' resumes from IndexedDB, 'off' disables (default: 'auto' in browser) */
    resume?: 'auto' | 'off';
    /** Chunk size in bytes for multipart upload */
    chunkSize?: number;
    /** Max concurrent part uploads */
    maxConcurrency?: number;
    /** Enable upload telemetry (default: true) */
    telemetry?: boolean;
}
interface CompressionConfig {
    /** Max width in pixels */
    maxWidth: number;
    /** Max height in pixels */
    maxHeight: number;
    /** JPEG/WebP quality 0-1 (default: 0.8) */
    quality: number;
    /** Max file size in MB to target */
    maxSizeMB: number;
}
interface PresignedUploadResponse {
    file_id: string;
    upload_url: string;
    completion_token: string;
    expires_at: string;
    method: string;
}
interface UploadCompleteResponse {
    file_id: string;
    filename: string;
    size_bytes: number;
    content_type: string;
    url: string;
    already_completed: boolean;
    scan_queued: boolean;
}
interface UploadFailureReport {
    fileId: string;
    completionToken: string;
    step: string;
    errorCode: string;
    errorMessage?: string;
    httpStatus?: number;
    attempt?: number;
    diagnostics?: Record<string, unknown>;
}
interface UploadFailureReportResponse {
    file_id: string;
    recorded: boolean;
    upload_status: string;
}
interface MultipartStartResponse {
    upload_session_id: string;
    file_id: string;
    completion_token: string;
    part_size_bytes: number;
    total_parts: number;
    part_urls: PartUrl[];
    expires_at: string;
}
interface PartUrl {
    part_number: number;
    url: string;
    expires_at: string;
}
interface MultipartPartUrlsResponse {
    part_urls: PartUrl[];
}
interface MultipartCompleteResponse {
    file_id: string;
    filename: string;
    size_bytes: number;
    content_type: string;
    url: string;
    scan_queued: boolean;
}
interface FileInfo {
    id: string;
    filename: string;
    content_type: string;
    size_bytes: number;
    is_public?: boolean;
    url?: string;
    scan_status?: string;
    scanned_at?: string;
    checksum?: string;
    created_at: string;
}
interface SignedUrlResponse {
    url: string;
    expires_at: string;
}
declare class StorageService extends ServiceModule {
    protected basePath: string;
    private telemetry;
    /**
     * Upload a file using the optimal strategy.
     *
     * Small files (< 8MB): 3-step presigned URL flow with retry + stall guard.
     * Large files (>= 8MB): Multipart with windowed presigns, resumable.
     *
     * @returns The completed file record with id, url, etc.
     */
    upload(file: File | Blob, options?: UploadOptions): Promise<ApiResponse<FileInfo>>;
    private uploadDirect;
    private uploadMultipart;
    private abortMultipart;
    /**
     * Get a presigned URL for direct upload to S3.
     * Use this when the browser uploads directly (with progress tracking)
     * and the server only brokers the URLs.
     *
     * Flow: server calls getUploadUrl() → returns URL to client → client PUTs to S3 → server calls completeUpload()
     */
    getUploadUrl(filename: string, contentType: string, options?: {
        isPublic?: boolean;
        expiresIn?: number;
        sizeBytes?: number;
        metadata?: Record<string, unknown>;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<PresignedUploadResponse>>;
    /**
     * Complete a presigned upload after the file has been uploaded to S3.
     * Triggers scan and makes the file available.
     */
    completeUpload(fileId: string, completionToken: string, options?: {
        sizeBytes?: number;
        checksum?: string;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<UploadCompleteResponse>>;
    /**
     * Persist a structured client-side upload failure against a file record.
     * Best used by split-upload clients that call getUploadUrl() manually.
     */
    reportUploadFailure(params: UploadFailureReport, requestOptions?: RequestOptions): Promise<ApiResponse<UploadFailureReportResponse>>;
    /** Start a multipart upload session. */
    startMultipartUpload(params: {
        filename: string;
        content_type: string;
        size_bytes: number;
        is_public?: boolean;
        metadata?: Record<string, unknown>;
        chunk_size?: number;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<MultipartStartResponse>>;
    /** Get presigned URLs for specific part numbers. */
    getMultipartPartUrls(uploadSessionId: string, partNumbers: number[], completionToken?: string, requestOptions?: RequestOptions): Promise<ApiResponse<MultipartPartUrlsResponse>>;
    /** Complete a multipart upload. */
    completeMultipartUpload(params: {
        upload_session_id: string;
        file_id: string;
        completion_token: string;
        parts: Array<{
            part_number: number;
            etag: string;
        }>;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<MultipartCompleteResponse>>;
    /** Abort a multipart upload. */
    abortMultipartUpload(uploadSessionId: string, completionToken?: string, requestOptions?: RequestOptions): Promise<ApiResponse<{
        aborted: boolean;
    }>>;
    /** Get file metadata (no signed URL). */
    getInfo(fileId: string, options?: RequestOptions): Promise<ApiResponse<FileInfo>>;
    /**
     * Get a signed view URL for inline display (img src, thumbnails).
     * Returns CloudFront signed URL (fast, ~1us) or S3 presigned fallback.
     */
    getViewUrl(fileId: string, options?: RequestOptions): Promise<ApiResponse<SignedUrlResponse>>;
    /**
     * Get signed view URLs for multiple files (batch, up to 100).
     * Single network call, returns all URLs.
     * The shared `expires_at` is a conservative lower bound — reflects the shortest-lived
     * URL in the batch. Individual URLs may remain valid longer if their files are public.
     */
    getViewUrls(fileIds: string[], options?: RequestOptions): Promise<ApiResponse<Record<string, SignedUrlResponse>>>;
    /**
     * Get a signed download URL (Content-Disposition: attachment).
     */
    getDownloadUrl(fileId: string, options?: RequestOptions): Promise<ApiResponse<SignedUrlResponse>>;
    /** Delete a file (soft delete). */
    delete(fileId: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    /** List the current user's files (paginated). */
    list(params?: PaginationParams, options?: RequestOptions): Promise<PaginatedResponse<FileInfo>>;
    /** Check file view/access status. */
    getViewStatus(fileId: string, options?: RequestOptions): Promise<ApiResponse<{
        status: string;
        url?: string;
    }>>;
    /**
     * Update a file's visibility (public/private).
     * Only the file owner can toggle this. Changes URL TTL — does not move the S3 object.
     * Public files get 7-day signed URLs; private files get 1-hour signed URLs.
     */
    updateVisibility(fileId: string, isPublic: boolean, options?: RequestOptions): Promise<ApiResponse<{
        file_id: string;
        is_public: boolean;
    }>>;
    /** @deprecated Use upload() instead */
    uploadFile(file: File | Blob, options?: {
        is_public?: boolean;
        metadata?: Record<string, unknown>;
        onProgress?: (progress: number) => void;
        signal?: AbortSignal;
    }): Promise<ApiResponse<FileInfo>>;
    /** @deprecated Use getInfo() instead */
    getFile(id: string): Promise<ApiResponse<FileInfo>>;
    /** @deprecated Use delete() instead */
    deleteFile(id: string): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    /** @deprecated Use list() instead */
    listFiles(params?: PaginationParams & {
        folder?: string;
    }): Promise<PaginatedResponse<FileInfo>>;
    private uploadToPresignedUrlWithRetry;
    /**
     * Upload file directly to S3 presigned URL.
     * Uses XHR for progress tracking in browser, fetch otherwise.
     * Includes stall detection.
     */
    private uploadToPresignedUrl;
    private uploadWithXHR;
    private uploadPartWithRetry;
    private shouldUseMultipart;
    private defaultChunkSize;
    private defaultConcurrency;
    private maybeCompress;
    private reportUploadFailureBestEffort;
    private getOrCreateTelemetry;
    /** Build RequestOptions with X-Upload-Session-Id header for cross-boundary correlation */
    private withSessionHeader;
    /**
     * Use ServiceModule's list method but with a cleaner name internally
     * (can't call protected `list` from public method with same name).
     */
    private listMethod;
}

/**
 * Upload Telemetry Module
 *
 * Best-effort upload lifecycle telemetry that never blocks upload success.
 * Events are buffered and flushed every 2s via analytics batch.
 * Error/warn/info events are also sent immediately via LoggerService.
 * Debug events are buffered and sent via logBatch on flush.
 *
 * Payload excludes filename/body/PII; only operational metadata is emitted.
 */

type UploadTelemetryEvent = 'upload.started' | 'upload.progress' | 'upload.completed' | 'upload.failed' | 'upload.aborted' | 'upload.retried' | 'upload.resumed' | 'upload.stalled' | 'upload.compression.started' | 'upload.compression.completed' | 'upload.compression.skipped' | 'upload.multipart.started' | 'upload.multipart.part_completed' | 'upload.multipart.part_failed' | 'upload.multipart.url_refreshed' | 'upload.multipart.completed' | 'upload.multipart.aborted';
interface TelemetryPayload {
    /** Upload session correlation ID */
    upload_session_id: string;
    /** Event name */
    event: UploadTelemetryEvent;
    /** Timestamp in ISO 8601 */
    timestamp: string;
    /** Operational metadata (no PII) */
    metadata: Record<string, unknown>;
}
interface UploadTelemetryConfig {
    /** Enable/disable telemetry (default: true) */
    enabled: boolean;
    /** Flush interval in ms (default: 2000) */
    flushIntervalMs: number;
    /** Max buffer size before forced flush (default: 50) */
    maxBufferSize: number;
}
declare class UploadTelemetry {
    private buffer;
    private debugLogBuffer;
    private flushTimer;
    private client;
    private logger;
    private config;
    private flushing;
    constructor(client: ScaleMuleClient, config?: Partial<UploadTelemetryConfig>);
    /** Emit a telemetry event. Never throws. */
    emit(sessionId: string, event: UploadTelemetryEvent, metadata?: Record<string, unknown>): void;
    /** Flush buffered events immediately. Never throws. */
    flush(): Promise<void>;
    /** Stop the flush timer and drain remaining events. */
    destroy(): Promise<void>;
    private startFlushTimer;
    /** Send a log entry to the logger service (fire-and-forget) */
    private sendToLogger;
}
/** Generate a unique upload session ID */
declare function generateUploadSessionId(): string;

/**
 * Upload Resume Module
 *
 * Provides cross-reload resume for multipart uploads using IndexedDB.
 * Browser-only; gracefully no-ops in non-browser runtimes.
 *
 * Store: sm_upload_sessions_v1 (IndexedDB)
 * Key: hash of app_id + user_id + filename + size + lastModified
 */
interface CompletedPart {
    part_number: number;
    etag: string;
}
interface ResumeSession {
    upload_session_id: string;
    file_id: string;
    completion_token: string;
    total_parts: number;
    part_size_bytes: number;
    completed_parts: CompletedPart[];
    created_at: number;
}
declare class UploadResumeStore {
    private db;
    /** Generate a deterministic resume key from upload identity */
    static generateResumeKey(appId: string, userId: string, filename: string, size: number, lastModified?: number): Promise<string>;
    /** Open the IndexedDB store. No-ops if IndexedDB is unavailable. */
    open(): Promise<void>;
    /** Get a resume session by key. Returns null if not found or stale. */
    get(key: string): Promise<ResumeSession | null>;
    /** Save a new resume session. */
    save(key: string, session: ResumeSession): Promise<void>;
    /** Update a single completed part in an existing session. */
    updatePart(key: string, partNumber: number, etag: string): Promise<void>;
    /** Remove a resume session (e.g., after successful completion). */
    remove(key: string): Promise<void>;
    /** Purge all stale entries (older than MAX_AGE_MS). */
    purgeStale(): Promise<number>;
    /** Close the database connection. */
    close(): void;
}

/**
 * Upload Strategy Module
 *
 * Determines the optimal upload strategy (direct PUT vs. multipart)
 * based on file size, network conditions, and user preferences.
 *
 * Also provides adaptive chunk size and concurrency defaults.
 */
type UploadStrategy = 'direct' | 'multipart';
type NetworkClass = 'slow-2g' | '2g' | '3g' | '4g' | 'unknown';
interface StrategyResult {
    strategy: UploadStrategy;
    chunkSize: number;
    concurrency: number;
    stallTimeoutMs: number;
}
/**
 * Determine the optimal upload strategy for a file.
 */
declare function resolveStrategy(fileSize: number, overrides?: {
    forceMultipart?: boolean;
    chunkSize?: number;
    concurrency?: number;
}): StrategyResult;
/** Detect the current network class from the Network Information API. */
declare function detectNetworkClass(): NetworkClass;
/** Estimate measured bandwidth (Mbps) from the Network Information API. */
declare function getMeasuredBandwidthMbps(): number | null;

/**
 * Upload Engine Module
 *
 * Orchestrates the complete upload lifecycle:
 * - Strategy selection (direct vs multipart)
 * - Compression (browser images)
 * - Retry with backoff
 * - Stall detection
 * - Multipart with windowed presigns
 * - Cross-reload resume (IndexedDB)
 * - Telemetry (best-effort)
 * - Feature flag gating
 *
 * This module is the orchestrator consumed by StorageService.upload().
 * It delegates to upload-strategy, upload-compression, upload-resume,
 * and upload-telemetry for their respective concerns.
 */

interface UploadEngineConfig {
    /** Feature flag: enable multipart upload path (default: true) */
    multipartEnabled: boolean;
    /** Application allowlist for multipart (empty = all allowed) */
    multipartAllowlist: string[];
    /** Telemetry configuration */
    telemetry: Partial<UploadTelemetryConfig>;
}
interface UploadPlan {
    /** Selected strategy */
    strategy: UploadStrategy;
    /** Chunk size in bytes (for multipart) */
    chunkSize: number;
    /** Max concurrent part uploads */
    concurrency: number;
    /** Stall timeout in ms */
    stallTimeoutMs: number;
    /** Whether compression should be attempted */
    shouldCompress: boolean;
    /** Whether resume should be attempted */
    shouldResume: boolean;
    /** Total number of parts (multipart only) */
    totalParts: number;
}
/**
 * Create an upload plan based on file characteristics, user options, and runtime context.
 *
 * The plan determines strategy, chunk sizing, concurrency, compression,
 * and resume eligibility. The caller (StorageService) executes the plan.
 */
declare function createUploadPlan(fileSize: number, contentType: string, options?: {
    forceMultipart?: boolean;
    skipCompression?: boolean;
    resume?: 'auto' | 'off';
    chunkSize?: number;
    maxConcurrency?: number;
    appId?: string;
}, engineConfig?: Partial<UploadEngineConfig>): UploadPlan;
/**
 * Calculate the total number of parts needed for a multipart upload.
 */
declare function calculateTotalParts(fileSize: number, chunkSize: number): number;
/**
 * Get the byte range for a specific part number (1-indexed).
 */
declare function getPartRange(partNumber: number, chunkSize: number, totalSize: number): {
    start: number;
    end: number;
    size: number;
};

/**
 * Standalone S3 upload utilities for browser environments.
 *
 * These functions handle the client-side portion of presigned URL uploads:
 * - Single PUT for small files (with retry + stall detection)
 * - Multipart chunked upload for large files (parallel parts, per-chunk retry, ETag collection)
 *
 * Used by any app that gets presigned URLs from the server and needs to upload to S3.
 * The server-side proxy routes are app-specific; these utilities are app-agnostic.
 */
interface S3UploadProgress {
    loaded: number;
    total: number;
    percentage: number;
}
interface S3SingleUploadOptions {
    onProgress?: (progress: S3UploadProgress) => void;
    signal?: AbortSignal;
    /** Max retries per attempt (default: 3) */
    maxRetries?: number;
    /** Stall timeout in ms — abort if no progress for this long (default: 45000) */
    stallTimeoutMs?: number;
}
interface S3SingleUploadResult {
    success: boolean;
    error?: string;
}
interface MultipartPartUrl {
    partNumber: number;
    url: string;
}
interface MultipartConfig {
    partSizeBytes: number;
    totalParts: number;
    partUrls: MultipartPartUrl[];
    /** Fetch fresh URLs when needed (e.g., on 403 expiry). App provides this via its proxy route. */
    fetchMoreUrls?: (partNumbers: number[]) => Promise<MultipartPartUrl[] | null>;
}
interface S3MultipartOptions {
    onProgress?: (progress: S3UploadProgress) => void;
    signal?: AbortSignal;
    /** Max concurrent part uploads (default: 3) */
    concurrency?: number;
    /** Max retries per part (default: 3) */
    maxRetries?: number;
}
interface PartResult {
    partNumber: number;
    etag: string;
}
interface S3MultipartResult {
    success: boolean;
    parts?: PartResult[];
    error?: string;
}
/**
 * Upload a file to S3 via a single presigned PUT.
 * Includes retry on 5xx/network errors and stall detection.
 */
declare function uploadSingleToS3(url: string, file: File | Blob, options?: S3SingleUploadOptions): Promise<S3SingleUploadResult>;
/**
 * Upload a file to S3 using multipart chunked upload.
 * Splits the file into chunks, uploads in parallel with per-chunk retry,
 * collects ETags for completion.
 */
declare function uploadMultipartToS3(file: File | Blob, config: MultipartConfig, options?: S3MultipartOptions): Promise<S3MultipartResult>;

/**
 * Realtime Service Module
 *
 * WebSocket client with:
 *   - Lazy connection (connects on first subscribe)
 *   - Auto-reconnect with exponential backoff + jitter
 *   - Auto re-subscribe on reconnect
 *   - Re-auth on reconnect (sends fresh session token)
 *   - Heartbeat detection
 *   - Presence support (join/leave/state)
 *
 * WebSocket protocol (JSON messages with `type` discriminator):
 *   Client → Server: auth, subscribe, unsubscribe, publish, presence_join, presence_leave
 *   Server → Client: auth_success, subscribed, message, error, presence_*
 *
 * HTTP endpoints for server-side broadcast:
 *   POST /broadcast              → all connections
 *   POST /broadcast/channel/{c}  → channel subscribers
 *   POST /broadcast/user/{uid}   → specific user
 */

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
type MessageCallback = (data: unknown, channel: string) => void;
type StatusCallback = (status: ConnectionStatus) => void;
type PresenceCallback = (event: PresenceEvent) => void;
interface PresenceEvent {
    type: 'join' | 'leave' | 'state';
    channel: string;
    user_id?: string;
    user?: {
        user_id: string;
        user_data?: unknown;
        joined_at?: string;
    };
    members?: Array<{
        user_id: string;
        user_data?: unknown;
        joined_at?: string;
    }>;
}
declare class RealtimeService extends ServiceModule {
    protected basePath: string;
    private ws;
    private subscriptions;
    private presenceCallbacks;
    private statusCallbacks;
    private _status;
    private reconnectAttempt;
    private reconnectTimer;
    private heartbeatTimer;
    private authenticated;
    /** Current connection status */
    get status(): ConnectionStatus;
    /**
     * Subscribe to a channel. Connects WebSocket on first call.
     * Returns an unsubscribe function.
     */
    subscribe(channel: string, callback: MessageCallback): () => void;
    /** Publish data to a channel via WebSocket. */
    publish(channel: string, data: unknown): void;
    /** Join a presence channel with optional user data. */
    joinPresence(channel: string, userData?: unknown): void;
    /** Leave a presence channel. */
    leavePresence(channel: string): void;
    /** Listen for presence events on a channel. Returns unsubscribe function. */
    onPresence(channel: string, callback: PresenceCallback): () => void;
    /** Broadcast to all connections for this application. */
    broadcast(event: string, data: unknown, options?: RequestOptions): Promise<ApiResponse<{
        sent: boolean;
    }>>;
    /** Broadcast to a specific channel. */
    broadcastToChannel(channel: string, event: string, data: unknown, options?: RequestOptions): Promise<ApiResponse<{
        sent: boolean;
    }>>;
    /** Send to a specific user's connections. */
    sendToUser(userId: string, event: string, data: unknown, options?: RequestOptions): Promise<ApiResponse<{
        sent: boolean;
    }>>;
    /** Listen for connection status changes. */
    onStatusChange(callback: StatusCallback): () => void;
    /** Disconnect and clean up all subscriptions. */
    disconnect(): void;
    private connect;
    private authenticate;
    private handleMessage;
    private dispatchMessage;
    private dispatchPresence;
    private sendWs;
    private scheduleReconnect;
    private getReconnectDelay;
    private startHeartbeat;
    private clearHeartbeat;
    private clearTimers;
    private setStatus;
}

/**
 * Video Service Module
 *
 * 3-step chunked upload flow (hidden from developer):
 *   1. POST /upload-start              → get video_id, upload_id, s3_key
 *   2. POST /{id}/upload-part (×N)     → upload chunks, get etags
 *   3. POST /{id}/upload-complete      → finalize, trigger transcode
 *
 * Streaming:
 *   GET /{id}/playlist.m3u8            → HLS master playlist
 *   GET /{id}/stream/{q}/index.m3u8   → quality-specific playlist
 *
 * Analytics:
 *   POST /{id}/track                   → playback events
 *   GET  /{id}/analytics               → video metrics
 */

interface VideoUploadOptions {
    /** Custom filename */
    filename?: string;
    /** Video title */
    title?: string;
    /** Video description */
    description?: string;
    /** Custom metadata */
    metadata?: Record<string, unknown>;
    /** Upload progress callback (0-100) */
    onProgress?: (percent: number) => void;
    /** AbortSignal for cancellation */
    signal?: AbortSignal;
    /** Chunk size in bytes (default: 5MB) */
    chunkSize?: number;
}
interface VideoInfo {
    id: string;
    title?: string;
    description?: string;
    status: string;
    duration_seconds?: number;
    width?: number;
    height?: number;
    content_type: string;
    size_bytes: number;
    qualities?: string[];
    thumbnail_url?: string;
    created_at: string;
    updated_at: string;
}
declare class VideoService extends ServiceModule {
    protected basePath: string;
    /**
     * Upload a video file using chunked multipart upload.
     *
     * Internally:
     *   1. Starts a multipart upload session
     *   2. Uploads chunks sequentially with progress tracking
     *   3. Completes the upload, triggering transcoding
     *
     * @returns The video record with id, status, etc.
     */
    upload(file: File | Blob, options?: VideoUploadOptions, requestOptions?: RequestOptions): Promise<ApiResponse<VideoInfo>>;
    /** Get video metadata and status. */
    get(videoId: string, options?: RequestOptions): Promise<ApiResponse<VideoInfo>>;
    /**
     * Get the HLS master playlist URL for streaming.
     * Returns the playlist URL that can be passed to a video player.
     */
    getStreamUrl(videoId: string): Promise<ApiResponse<{
        url: string;
    }>>;
    /**
     * Track a playback event (view, play, pause, seek, complete, etc.).
     */
    trackPlayback(videoId: string, event: {
        event_type: string;
        position_seconds?: number;
        quality?: string;
        duration_seconds?: number;
    }, options?: RequestOptions): Promise<ApiResponse<{
        tracked: boolean;
    }>>;
    /** Get video analytics (views, watch time, etc.). */
    getAnalytics(videoId: string, options?: RequestOptions): Promise<ApiResponse<{
        views: number;
        watch_time_seconds: number;
        completions?: number;
    }>>;
    /**
     * Update a video's access mode (public/private).
     * Public videos get 7-day signed URLs; private get 1-hour signed URLs.
     */
    updateAccessMode(videoId: string, accessMode: 'public' | 'private', options?: RequestOptions): Promise<ApiResponse<{
        video_id: string;
        access_mode: string;
    }>>;
    /** @deprecated Use upload() instead */
    uploadVideo(file: File | Blob, options?: {
        metadata?: Record<string, unknown>;
        onProgress?: (progress: number) => void;
        signal?: AbortSignal;
    }): Promise<ApiResponse<VideoInfo>>;
    /** @deprecated Use get() instead */
    getVideo(id: string): Promise<ApiResponse<VideoInfo>>;
    private uploadPart;
}

/**
 * Data Service Module
 *
 * Document-oriented data storage with collections, CRUD, query, and aggregation.
 *
 * Routes:
 *   POST   /collections                    → create collection
 *   GET    /collections                    → list collections
 *   DELETE /collections/{name}             → delete collection
 *   POST   /{collection}/documents         → create document
 *   GET    /{collection}/documents/{id}    → get document
 *   PATCH  /{collection}/documents/{id}    → update document
 *   DELETE /{collection}/documents/{id}    → delete document
 *   POST   /{collection}/query             → query documents
 *   POST   /{collection}/aggregate         → aggregate
 *   GET    /{collection}/my-documents      → user's documents
 */

interface Collection {
    id: string;
    collection_name: string;
    schema_definition?: unknown;
    indexes?: unknown;
    created_at: string;
}
interface Document {
    id: string;
    collection_id: string;
    sm_user_id?: string;
    data: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}
interface QueryFilter {
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
    field: string;
    value: unknown;
    /** For 'in' operator */
    values?: unknown[];
}
interface QuerySort {
    field: string;
    direction?: 'asc' | 'desc';
}
interface QueryOptions extends PaginationParams {
    filters?: QueryFilter[];
    sort?: QuerySort[];
}
interface AggregateOptions {
    pipeline: Array<Record<string, unknown>>;
}
interface AggregateResult {
    results: Array<Record<string, unknown>>;
}
declare class DataService extends ServiceModule {
    protected basePath: string;
    createCollection(name: string, schema?: unknown, options?: RequestOptions): Promise<ApiResponse<Collection>>;
    listCollections(options?: RequestOptions): Promise<ApiResponse<Collection[]>>;
    deleteCollection(name: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    create(collection: string, data: unknown, options?: RequestOptions): Promise<ApiResponse<Document>>;
    get(collection: string, docId: string, options?: RequestOptions): Promise<ApiResponse<Document>>;
    update(collection: string, docId: string, data: unknown, options?: RequestOptions): Promise<ApiResponse<Document>>;
    delete(collection: string, docId: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    query(collection: string, options?: QueryOptions, requestOptions?: RequestOptions): Promise<PaginatedResponse<Document>>;
    aggregate(collection: string, options: AggregateOptions, requestOptions?: RequestOptions): Promise<ApiResponse<AggregateResult>>;
    myDocuments(collection: string, options?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<Document>>;
    /** @deprecated Use create() instead */
    createDocument(collection: string, data: unknown): Promise<ApiResponse<Document>>;
    /** @deprecated Use get() instead */
    getDocument(collection: string, id: string): Promise<ApiResponse<Document>>;
    /** @deprecated Use update() instead */
    updateDocument(collection: string, id: string, data: unknown): Promise<ApiResponse<Document>>;
    /** @deprecated Use delete() instead */
    deleteDocument(collection: string, id: string): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    /** @deprecated Use query() instead */
    queryDocuments(collection: string, options?: QueryOptions): Promise<PaginatedResponse<Document>>;
}

/**
 * Chat Service Module
 *
 * Conversations, messages, typing indicators, read receipts, reactions.
 *
 * Routes:
 *   POST   /conversations                           → create conversation
 *   GET    /conversations                            → list conversations
 *   GET    /conversations/{id}                       → get conversation
 *   POST   /conversations/{id}/participants          → add participant
 *   DELETE /conversations/{id}/participants/{userId} → remove participant
 *   POST   /conversations/{id}/messages              → send message
 *   GET    /conversations/{id}/messages              → get messages
 *   PATCH  /messages/{id}                            → edit message
 *   DELETE /messages/{id}                            → delete message
 *   POST   /messages/{id}/reactions                  → add reaction
 *   POST   /conversations/{id}/typing                → send typing indicator
 *   POST   /conversations/{id}/read                  → mark as read
 *   GET    /conversations/{id}/read-status            → get read status
 */

interface Participant {
    user_id: string;
    role: string;
    joined_at: string;
}
interface Conversation {
    id: string;
    conversation_type: 'direct' | 'group';
    name?: string;
    created_by?: string;
    participant_count: number;
    last_message_at?: string;
    unread_count?: number;
    created_at: string;
    updated_at?: string;
    participants?: Participant[];
}
interface Attachment {
    file_id: string;
    file_name: string;
    file_size: number;
    mime_type: string;
}
interface ChatMessage {
    id: string;
    content: string;
    message_type: 'text' | 'image' | 'file' | 'system';
    sender_id: string;
    sender_type: string;
    sender_agent_model?: string;
    attachments?: Attachment[];
    is_edited: boolean;
    created_at: string;
}
interface ReadStatus {
    user_id: string;
    last_read_at?: string;
}
interface ChatReaction {
    emoji: string;
    user_id: string;
    message_id: string;
    created_at: string;
}
declare class ChatService extends ServiceModule {
    protected basePath: string;
    createConversation(data: {
        name?: string;
        participant_ids: string[];
    }, options?: RequestOptions): Promise<ApiResponse<Conversation>>;
    listConversations(params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<Conversation>>;
    getConversation(id: string, options?: RequestOptions): Promise<ApiResponse<Conversation>>;
    addParticipant(conversationId: string, userId: string, options?: RequestOptions): Promise<ApiResponse<{
        added: boolean;
    }>>;
    removeParticipant(conversationId: string, userId: string, options?: RequestOptions): Promise<ApiResponse<{
        removed: boolean;
    }>>;
    sendMessage(conversationId: string, data: {
        content: string;
        type?: string;
    }, options?: RequestOptions): Promise<ApiResponse<ChatMessage>>;
    getMessages(conversationId: string, options?: {
        limit?: number;
        before?: string;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<ChatMessage[]>>;
    editMessage(messageId: string, data: {
        content: string;
    }, options?: RequestOptions): Promise<ApiResponse<ChatMessage>>;
    deleteMessage(messageId: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    addReaction(messageId: string, data: {
        emoji: string;
    }, options?: RequestOptions): Promise<ApiResponse<ChatReaction>>;
    sendTyping(conversationId: string, options?: RequestOptions): Promise<ApiResponse<{
        sent: boolean;
    }>>;
    markRead(conversationId: string, options?: RequestOptions): Promise<ApiResponse<{
        marked: boolean;
    }>>;
    getReadStatus(conversationId: string, options?: RequestOptions): Promise<ApiResponse<ReadStatus[]>>;
    /** @deprecated Use createConversation() instead */
    createChat(data: {
        participant_ids: string[];
        name?: string;
    }): Promise<ApiResponse<Conversation>>;
}

/**
 * Social Service Module
 *
 * Follow/unfollow, posts, feed, likes, comments, activity feed.
 *
 * Routes:
 *   POST   /users/{id}/follow        → follow user
 *   DELETE /users/{id}/follow        → unfollow user
 *   GET    /users/{id}/followers     → get followers
 *   GET    /users/{id}/following     → get following
 *   GET    /users/{id}/follow-status → check follow status
 *   POST   /posts                    → create post
 *   GET    /posts/{id}               → get post
 *   DELETE /posts/{id}               → delete post
 *   GET    /users/{id}/posts         → user's posts
 *   GET    /feed                     → user's feed
 *   POST   /{type}/{id}/like         → like content
 *   DELETE /{type}/{id}/like         → unlike content
 *   GET    /{type}/{id}/likes        → get likes
 *   POST   /posts/{id}/comments      → comment on post
 *   GET    /posts/{id}/comments      → get comments
 *   GET    /activity                 → activity feed
 *   PATCH  /activity/{id}/read       → mark activity read
 *   PATCH  /activity/read-all        → mark all read
 */

interface SocialPost {
    id: string;
    user_id: string;
    content: string;
    media_urls?: string[];
    visibility: 'public' | 'followers' | 'private';
    likes_count: number;
    comments_count: number;
    shares_count: number;
    created_at: string;
}
interface Comment {
    id: string;
    post_id: string;
    user_id: string;
    parent_comment_id?: string;
    content: string;
    likes_count: number;
    created_at: string;
}
interface FollowStatus {
    is_following: boolean;
    is_followed_by: boolean;
}
interface ActivityItem {
    id: string;
    activity_type: string;
    actor_user_id: string;
    target_type?: string;
    target_id?: string;
    metadata?: string;
    is_read: boolean;
    created_at: string;
}
/** Follower/following entry */
interface SocialUser {
    user_id: string;
    followed_at: string;
}
interface Like {
    user_id: string;
    created_at: string;
}
declare class SocialService extends ServiceModule {
    protected basePath: string;
    follow(userId: string, options?: RequestOptions): Promise<ApiResponse<{
        followed: boolean;
    }>>;
    unfollow(userId: string, options?: RequestOptions): Promise<ApiResponse<{
        unfollowed: boolean;
    }>>;
    getFollowers(userId: string, params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<SocialUser>>;
    getFollowing(userId: string, params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<SocialUser>>;
    getFollowStatus(userId: string, options?: RequestOptions): Promise<ApiResponse<FollowStatus>>;
    createPost(data: {
        content: string;
        visibility?: string;
    }, options?: RequestOptions): Promise<ApiResponse<SocialPost>>;
    getPost(postId: string, options?: RequestOptions): Promise<ApiResponse<SocialPost>>;
    deletePost(postId: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    getUserPosts(userId: string, params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<SocialPost>>;
    getFeed(options?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<SocialPost>>;
    like(targetType: string, targetId: string, options?: RequestOptions): Promise<ApiResponse<{
        liked: boolean;
    }>>;
    unlike(targetType: string, targetId: string, options?: RequestOptions): Promise<ApiResponse<{
        unliked: boolean;
    }>>;
    getLikes(targetType: string, targetId: string, params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<Like>>;
    comment(postId: string, data: {
        content: string;
    }, options?: RequestOptions): Promise<ApiResponse<Comment>>;
    getComments(postId: string, params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<Comment>>;
    getActivity(params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<ActivityItem>>;
    markActivityRead(activityId: string, options?: RequestOptions): Promise<ApiResponse<ActivityItem>>;
    markAllRead(options?: RequestOptions): Promise<ApiResponse<{
        marked_count: number;
    }>>;
    /** @deprecated Use comment() instead */
    addComment(postId: string, data: {
        content: string;
    }): Promise<ApiResponse<Comment>>;
}

/**
 * Billing Service Module
 *
 * Customers, subscriptions, usage, invoices, marketplace payments, payouts.
 *
 * Routes:
 *   POST   /customers                    → create customer
 *   POST   /payment-methods              → add payment method
 *   POST   /subscriptions                → create subscription
 *   GET    /subscriptions                 → list subscriptions
 *   POST   /subscriptions/{id}/cancel     → cancel subscription
 *   POST   /subscriptions/{id}/resume     → resume subscription
 *   PATCH  /subscriptions/{id}/upgrade    → upgrade plan
 *   POST   /usage                         → report usage
 *   GET    /usage/summary                 → usage summary
 *   GET    /invoices                       → list invoices
 *   GET    /invoices/{id}                  → get invoice
 *   POST   /invoices/{id}/pay              → pay invoice
 *   GET    /invoices/{id}/pdf              → invoice PDF
 *   POST   /connected-accounts             → create connected account
 *   GET    /connected-accounts/me          → get own connected account
 *   GET    /connected-accounts/{id}        → get connected account
 *   POST   /connected-accounts/{id}/onboarding-link → create onboarding link
 *   GET    /connected-accounts/{id}/balance → get account balance
 *   POST   /connected-accounts/{id}/account-session → create account session (embedded onboarding)
 *   POST   /payments                       → create payment
 *   GET    /payments                       → list payments
 *   GET    /payments/{id}                  → get payment
 *   POST   /payments/{id}/refund           → refund payment
 *   GET    /connected-accounts/{id}/payouts → payout history
 *   GET    /connected-accounts/{id}/payout-schedule → get payout schedule
 *   PUT    /connected-accounts/{id}/payout-schedule → set payout schedule
 *   GET    /transactions                   → ledger transactions
 *   GET    /transactions/summary           → transaction summary
 *   POST   /setup-sessions                 → create setup session
 */

interface Customer {
    id: string;
    stripe_customer_id?: string;
    email: string;
    metadata?: Record<string, unknown>;
    created_at: string;
}
interface Subscription {
    id: string;
    customer_id: string;
    stripe_subscription_id?: string;
    plan_id: string;
    status: string;
    current_period_start: string;
    current_period_end: string;
    cancel_at?: string;
    metadata?: Record<string, unknown>;
    created_at: string;
}
interface Invoice {
    id: string;
    customer_id: string;
    stripe_invoice_id?: string;
    amount_due: number;
    amount_paid: number;
    currency: string;
    status: string;
    due_date?: string;
    paid_at?: string;
    created_at: string;
}
interface UsageSummary$1 {
    customer_id: string;
    event_type: string;
    total_quantity: number;
    total_cost: number;
    event_count: number;
}
interface PaymentMethod {
    id: string;
    customer_id: string;
    stripe_payment_method_id?: string;
    type: string;
    last4?: string;
    brand?: string;
    exp_month?: number;
    exp_year?: number;
    is_default: boolean;
    created_at: string;
}
interface ConnectedAccount {
    id: string;
    email: string;
    country: string;
    status: 'pending' | 'onboarding' | 'active' | 'restricted' | 'disabled';
    charges_enabled: boolean;
    payouts_enabled: boolean;
    onboarding_complete: boolean;
    details_submitted: boolean;
    metadata?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}
interface AccountBalance {
    currency: string;
    available_cents: number;
    pending_cents: number;
    reserved_cents: number;
}
interface Payment {
    id: string;
    customer_id: string;
    connected_account_id?: string;
    amount_cents: number;
    currency: string;
    platform_fee_cents: number;
    provider_fee_cents: number;
    creator_net_cents: number;
    status: string;
    payment_type?: string;
    client_secret?: string;
    metadata?: Record<string, unknown>;
    created_at: string;
}
interface Refund {
    id: string;
    payment_id: string;
    amount_cents: number;
    platform_fee_reversal_cents: number;
    reason?: string;
    status: string;
    created_at: string;
}
interface Payout {
    id: string;
    amount_cents: number;
    currency: string;
    status: string;
    arrival_date?: string;
    created_at: string;
}
interface PayoutSchedule {
    schedule_interval: string;
    minimum_amount_cents: number;
    day_of_week?: number;
    day_of_month?: number;
}
interface Transaction {
    id: string;
    entry_type: string;
    account_type: string;
    amount_cents: number;
    currency: string;
    category: string;
    reference_type: string;
    description?: string;
    created_at: string;
}
interface TransactionSummary {
    gross_cents: number;
    platform_fee_cents: number;
    net_cents: number;
    payout_cents: number;
    refund_cents: number;
}
interface PaymentListParams extends PaginationParams {
    status?: string;
    connected_account_id?: string;
    payment_type?: string;
}
interface TransactionListParams extends PaginationParams {
    account_id?: string;
    category?: string;
    date_from?: string;
    date_to?: string;
}
interface TransactionSummaryParams {
    account_id?: string;
    date_from?: string;
    date_to?: string;
}
interface Product {
    id: string;
    connected_account_id: string;
    external_product_id: string;
    name: string;
    description?: string;
    active: boolean;
    created_at: string;
}
interface Price {
    id: string;
    connected_account_id: string;
    product_id: string;
    external_price_id: string;
    unit_amount_cents: number;
    currency: string;
    recurring_interval?: string;
    active: boolean;
    created_at: string;
}
interface ConnectedAccountSubscription {
    id: string;
    connected_account_id: string;
    price_id: string;
    external_subscription_id: string;
    external_account_id: string;
    status: string;
    current_period_start?: string;
    current_period_end?: string;
    cancel_at_period_end: boolean;
    created_at: string;
}
interface Transfer {
    id: string;
    connected_account_id: string;
    payment_id?: string;
    amount_cents: number;
    currency: string;
    status: 'created' | 'processing' | 'succeeded' | 'failed' | 'needs_reconciliation';
    external_transfer_id?: string;
    idempotency_key: string;
    created_at: string;
}
interface ConnectedSetupIntentResponse {
    client_secret: string;
    external_account_id: string;
}
interface PaymentStatusResponse extends Payment {
    updated_at: string;
}
interface ConnectedSubscriptionListParams extends PaginationParams {
    connected_account_id?: string;
}
declare class BillingService extends ServiceModule {
    protected basePath: string;
    createCustomer(data: {
        email: string;
        name?: string;
    }, options?: RequestOptions): Promise<ApiResponse<Customer>>;
    addPaymentMethod(data: {
        type: string;
        token: string;
    }, options?: RequestOptions): Promise<ApiResponse<PaymentMethod>>;
    subscribe(data: {
        customer_id: string;
        plan_id: string;
    }, options?: RequestOptions): Promise<ApiResponse<Subscription>>;
    listSubscriptions(params?: PaginationParams, options?: RequestOptions): Promise<PaginatedResponse<Subscription>>;
    cancelSubscription(id: string, options?: RequestOptions): Promise<ApiResponse<Subscription>>;
    resumeSubscription(id: string, options?: RequestOptions): Promise<ApiResponse<Subscription>>;
    upgradeSubscription(id: string, data: {
        plan_id: string;
    }, options?: RequestOptions): Promise<ApiResponse<Subscription>>;
    reportUsage(data: {
        metric: string;
        quantity: number;
    }, options?: RequestOptions): Promise<ApiResponse<{
        recorded: boolean;
    }>>;
    getUsageSummary(options?: RequestOptions): Promise<ApiResponse<UsageSummary$1[]>>;
    listInvoices(params?: PaginationParams, options?: RequestOptions): Promise<PaginatedResponse<Invoice>>;
    getInvoice(id: string, options?: RequestOptions): Promise<ApiResponse<Invoice>>;
    payInvoice(id: string, options?: RequestOptions): Promise<ApiResponse<Invoice>>;
    getInvoicePdf(id: string, options?: RequestOptions): Promise<ApiResponse<{
        url: string;
    }>>;
    createConnectedAccount(data: {
        email: string;
        country?: string;
    }, options?: RequestOptions): Promise<ApiResponse<ConnectedAccount>>;
    getConnectedAccount(id: string, options?: RequestOptions): Promise<ApiResponse<ConnectedAccount>>;
    getMyConnectedAccount(options?: RequestOptions): Promise<ApiResponse<ConnectedAccount>>;
    createOnboardingLink(id: string, data: {
        return_url: string;
        refresh_url: string;
    }, options?: RequestOptions): Promise<ApiResponse<{
        url: string;
    }>>;
    getAccountBalance(id: string, options?: RequestOptions): Promise<ApiResponse<AccountBalance>>;
    createAccountSession(id: string, options?: RequestOptions): Promise<ApiResponse<{
        client_secret: string;
    }>>;
    getPublishableKey(options?: RequestOptions): Promise<ApiResponse<{
        publishable_key: string;
    }>>;
    createPayment(data: {
        amount_cents: number;
        currency?: string;
        connected_account_id?: string;
        platform_fee_percent?: number;
        platform_fee_cents?: number;
        payment_type?: string;
        metadata?: Record<string, unknown>;
    }, options?: RequestOptions): Promise<ApiResponse<Payment>>;
    getPayment(id: string, options?: RequestOptions): Promise<ApiResponse<Payment>>;
    listPayments(params?: PaymentListParams, options?: RequestOptions): Promise<PaginatedResponse<Payment>>;
    refundPayment(id: string, data?: {
        amount_cents?: number;
        reason?: string;
    }, options?: RequestOptions): Promise<ApiResponse<Refund>>;
    getPayoutHistory(accountId: string, params?: PaginationParams, options?: RequestOptions): Promise<PaginatedResponse<Payout>>;
    getPayoutSchedule(accountId: string, options?: RequestOptions): Promise<ApiResponse<PayoutSchedule>>;
    setPayoutSchedule(accountId: string, data: {
        schedule_interval: string;
        minimum_amount_cents?: number;
        day_of_week?: number;
        day_of_month?: number;
    }, options?: RequestOptions): Promise<ApiResponse<PayoutSchedule>>;
    getTransactions(params?: TransactionListParams, options?: RequestOptions): Promise<PaginatedResponse<Transaction>>;
    getTransactionSummary(params?: TransactionSummaryParams, options?: RequestOptions): Promise<ApiResponse<TransactionSummary>>;
    createSetupSession(data: {
        return_url: string;
        cancel_url: string;
    }, options?: RequestOptions): Promise<ApiResponse<{
        client_secret: string;
    }>>;
    createProduct(data: {
        connected_account_id: string;
        name: string;
        description?: string;
        metadata?: Record<string, unknown>;
    }, options?: RequestOptions): Promise<ApiResponse<Product>>;
    createPrice(data: {
        connected_account_id: string;
        product_id: string;
        unit_amount_cents: number;
        currency?: string;
        recurring_interval?: string;
    }, options?: RequestOptions): Promise<ApiResponse<Price>>;
    deactivatePrice(id: string, options?: RequestOptions): Promise<ApiResponse<Price>>;
    createConnectedSubscription(data: {
        connected_account_id: string;
        price_id: string;
        email: string;
        payment_method_id?: string;
        setup_intent_id?: string;
    }, options?: RequestOptions): Promise<ApiResponse<ConnectedAccountSubscription>>;
    cancelConnectedSubscription(id: string, data?: {
        at_period_end?: boolean;
    }, options?: RequestOptions): Promise<ApiResponse<ConnectedAccountSubscription>>;
    listConnectedSubscriptions(params?: ConnectedSubscriptionListParams, options?: RequestOptions): Promise<PaginatedResponse<ConnectedAccountSubscription>>;
    createConnectedSetupIntent(data: {
        connected_account_id: string;
        return_url: string;
    }, options?: RequestOptions): Promise<ApiResponse<ConnectedSetupIntentResponse>>;
    createTransfer(data: {
        connected_account_id: string;
        amount_cents: number;
        currency?: string;
        payment_id?: string;
        idempotency_key: string;
        metadata?: Record<string, unknown>;
    }, options?: RequestOptions): Promise<ApiResponse<Transfer>>;
    syncPaymentStatus(id: string, options?: RequestOptions): Promise<ApiResponse<PaymentStatusResponse>>;
    /** @deprecated Use subscribe() instead */
    createSubscription(data: {
        customer_id: string;
        plan_id: string;
    }): Promise<ApiResponse<Subscription>>;
    /** @deprecated Use listInvoices() instead */
    getInvoices(params?: PaginationParams): Promise<PaginatedResponse<Invoice>>;
}

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

interface AnalyticsEvent {
    id: string;
    event_name: string;
    user_id?: string;
    anonymous_id?: string;
    properties?: Record<string, unknown>;
    created_at: string;
}
interface Funnel {
    id: string;
    funnel_name: string;
    steps: string;
    created_at: string;
}
interface FunnelConversion {
    date_bucket: string;
    step_index: number;
    step_name: string;
    users_entered: number;
    users_completed: number;
    conversion_rate?: number;
}
interface ActiveUsers {
    active_users: number;
    period: string;
}
interface EventAggregation {
    time_bucket: string;
    event_name: string;
    count: number;
}
interface TopEvent {
    event_name: string;
    count: number;
}
interface MetricDataPoint {
    timestamp: string;
    value: number;
    dimensions?: Record<string, unknown>;
}
declare class AnalyticsService extends ServiceModule {
    protected basePath: string;
    track(event: string, properties?: Record<string, unknown>, userId?: string, options?: RequestOptions): Promise<ApiResponse<{
        tracked: boolean;
    }>>;
    trackBatch(events: Array<{
        event: string;
        properties?: Record<string, unknown>;
        user_id?: string;
        timestamp?: string;
    }>, options?: RequestOptions): Promise<ApiResponse<{
        count: number;
    }>>;
    trackPageView(data?: {
        path?: string;
        title?: string;
        referrer?: string;
    }, options?: RequestOptions): Promise<ApiResponse<{
        tracked: boolean;
    }>>;
    identify(userId: string, traits?: Record<string, unknown>, anonymousId?: string, options?: RequestOptions): Promise<ApiResponse<{
        identified: boolean;
    }>>;
    alias(userId: string, anonymousId: string, options?: RequestOptions): Promise<ApiResponse<{
        aliased: boolean;
    }>>;
    queryEvents(filters?: PaginationParams & Record<string, unknown>): Promise<PaginatedResponse<AnalyticsEvent>>;
    getAggregations(filters?: Record<string, unknown>): Promise<ApiResponse<EventAggregation[]>>;
    getTopEvents(filters?: Record<string, unknown>): Promise<ApiResponse<TopEvent[]>>;
    getActiveUsers(): Promise<ApiResponse<ActiveUsers>>;
    createFunnel(data: {
        name: string;
        steps: string[];
    }): Promise<ApiResponse<Funnel>>;
    listFunnels(): Promise<ApiResponse<Funnel[]>>;
    getFunnelConversions(id: string): Promise<ApiResponse<FunnelConversion[]>>;
    trackMetric(data: {
        name: string;
        value: number;
        tags?: Record<string, string>;
    }, options?: RequestOptions): Promise<ApiResponse<{
        tracked: boolean;
    }>>;
    queryMetrics(filters?: Record<string, unknown>): Promise<ApiResponse<MetricDataPoint[]>>;
    /** @deprecated Use queryEvents() instead */
    query(filters?: Record<string, unknown>): Promise<ApiResponse<AnalyticsEvent[]>>;
}

interface FlagDefinition {
    id: string;
    application_id: string;
    flag_key: string;
    name: string;
    description?: string | null;
    flag_type: 'boolean' | 'string' | 'number' | 'json';
    default_value: unknown;
    status: 'active' | 'inactive' | 'archived';
    tags: string[];
    created_by?: string | null;
    created_at: string;
    updated_at: string;
}
interface FlagEnvironment {
    id: string;
    application_id: string;
    flag_id: string;
    environment: string;
    enabled: boolean;
    default_value?: unknown;
}
interface FlagCondition {
    attribute: string;
    operator: 'eq' | 'neq' | 'in' | 'not_in' | 'contains' | 'starts_with' | 'ends_with' | 'gt' | 'gte' | 'lt' | 'lte' | 'regex' | 'semver_eq' | 'semver_neq' | 'semver_gt' | 'semver_gte' | 'semver_lt' | 'semver_lte' | 'exists' | 'not_exists' | string;
    value?: unknown;
    values?: unknown[];
}
interface TargetingRule {
    id: string;
    application_id: string;
    flag_id: string;
    environment: string;
    name: string;
    priority: number;
    serve_value: unknown;
    rollout_percentage?: number | null;
    conditions: FlagCondition[];
    enabled: boolean;
    created_at: string;
    updated_at: string;
}
interface FlagVariant {
    id: string;
    application_id: string;
    flag_id: string;
    variant_key: string;
    value: unknown;
    weight: number;
    created_at: string;
    updated_at: string;
}
interface FlagSegment {
    id: string;
    application_id: string;
    segment_key: string;
    name: string;
    description?: string | null;
    conditions: FlagCondition[];
    included_users: string[];
    excluded_users: string[];
    created_at: string;
    updated_at: string;
}
interface FlagAuditEntry {
    id: string;
    application_id: string;
    flag_id?: string | null;
    actor_type: string;
    actor_id: string;
    actor_email?: string | null;
    action: string;
    before_value?: unknown;
    after_value?: unknown;
    metadata?: unknown;
    created_at: string;
}
interface FlagDetail {
    flag: FlagDefinition;
    environments: FlagEnvironment[];
    rules: TargetingRule[];
    variants: FlagVariant[];
}
interface FlagEvaluation<T = unknown> {
    flag_id: string;
    flag_key: string;
    environment: string;
    value: T;
    reason: 'disabled' | 'rule_match' | 'variant' | 'default' | string;
    matched_rule_id?: string | null;
    variant_key?: string | null;
    bucket?: number | null;
}
interface CreateFlagRequest {
    flag_key: string;
    name: string;
    description?: string;
    flag_type?: 'boolean' | 'string' | 'number' | 'json';
    default_value?: unknown;
    tags?: string[];
}
interface UpdateFlagRequest {
    flag_key?: string;
    name?: string;
    description?: string | null;
    flag_type?: 'boolean' | 'string' | 'number' | 'json';
    default_value?: unknown;
    tags?: string[];
    status?: 'active' | 'inactive' | 'archived';
}
interface CreateRuleRequest {
    environment: string;
    name: string;
    priority?: number;
    serve_value: unknown;
    rollout_percentage?: number | null;
    conditions?: FlagCondition[];
    enabled?: boolean;
}
interface UpdateRuleRequest extends Partial<CreateRuleRequest> {
}
interface CreateVariantRequest {
    variant_key: string;
    value: unknown;
    weight: number;
}
interface UpdateVariantRequest extends Partial<CreateVariantRequest> {
}
interface CreateSegmentRequest {
    segment_key: string;
    name: string;
    description?: string;
    conditions?: FlagCondition[];
    included_users?: string[];
    excluded_users?: string[];
}
interface UpdateSegmentRequest extends Partial<CreateSegmentRequest> {
}
interface UpsertEnvironmentRequest {
    enabled: boolean;
    default_value?: unknown;
}
declare class FlagsService extends ServiceModule {
    protected basePath: string;
    evaluate<T = unknown>(flagKey: string, context?: Record<string, unknown>, environment?: string, options?: RequestOptions): Promise<ApiResponse<FlagEvaluation<T>>>;
    evaluateBatch(flagKeys: string[], context?: Record<string, unknown>, environment?: string, options?: RequestOptions): Promise<ApiResponse<Record<string, FlagEvaluation>>>;
    evaluateAll(context?: Record<string, unknown>, environment?: string, options?: RequestOptions): Promise<ApiResponse<Record<string, FlagEvaluation>>>;
    list(params?: {
        applicationId?: string;
        status?: string;
        search?: string;
    }, options?: RequestOptions): Promise<ApiResponse<FlagDefinition[]>>;
    get(id: string, options?: RequestOptions): Promise<ApiResponse<FlagDetail>>;
    create(data: CreateFlagRequest, params?: {
        applicationId?: string;
    }, options?: RequestOptions): Promise<ApiResponse<FlagDetail>>;
    update(id: string, data: UpdateFlagRequest, options?: RequestOptions): Promise<ApiResponse<FlagDetail>>;
    archive(id: string, options?: RequestOptions): Promise<ApiResponse<FlagDetail>>;
    activate(id: string, options?: RequestOptions): Promise<ApiResponse<FlagDetail>>;
    deactivate(id: string, options?: RequestOptions): Promise<ApiResponse<FlagDetail>>;
    listRules(id: string, options?: RequestOptions): Promise<ApiResponse<TargetingRule[]>>;
    createRule(id: string, data: CreateRuleRequest, options?: RequestOptions): Promise<ApiResponse<TargetingRule>>;
    updateRule(id: string, data: UpdateRuleRequest, options?: RequestOptions): Promise<ApiResponse<TargetingRule>>;
    deleteRule(id: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    listVariants(id: string, options?: RequestOptions): Promise<ApiResponse<FlagVariant[]>>;
    createVariant(id: string, data: CreateVariantRequest, options?: RequestOptions): Promise<ApiResponse<FlagVariant>>;
    updateVariant(id: string, data: UpdateVariantRequest, options?: RequestOptions): Promise<ApiResponse<FlagVariant>>;
    deleteVariant(id: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    listSegments(params?: {
        applicationId?: string;
    }, options?: RequestOptions): Promise<ApiResponse<FlagSegment[]>>;
    createSegment(data: CreateSegmentRequest, params?: {
        applicationId?: string;
    }, options?: RequestOptions): Promise<ApiResponse<FlagSegment>>;
    updateSegment(id: string, data: UpdateSegmentRequest, options?: RequestOptions): Promise<ApiResponse<FlagSegment>>;
    deleteSegment(id: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    listEnvironments(id: string, options?: RequestOptions): Promise<ApiResponse<FlagEnvironment[]>>;
    upsertEnvironment(id: string, environment: string, data: UpsertEnvironmentRequest, options?: RequestOptions): Promise<ApiResponse<FlagEnvironment>>;
    listAudit(id: string, limit?: number, options?: RequestOptions): Promise<ApiResponse<FlagAuditEntry[]>>;
}

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

interface MessageStatus {
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
interface PushToken {
    token: string;
    platform: string;
    created_at: string;
}
declare class CommunicationService extends ServiceModule {
    protected basePath: string;
    sendEmail(data: {
        to: string;
        subject: string;
        html_body: string;
        text_body?: string;
        message_type?: string;
    }, options?: RequestOptions): Promise<ApiResponse<MessageStatus>>;
    sendEmailTemplate(template: string, data: {
        to: string;
        variables?: Record<string, unknown>;
    }, options?: RequestOptions): Promise<ApiResponse<MessageStatus>>;
    sendSms(data: {
        to: string;
        message: string;
    }, options?: RequestOptions): Promise<ApiResponse<MessageStatus>>;
    sendSmsTemplate(template: string, data: {
        to: string;
        variables?: Record<string, unknown>;
    }, options?: RequestOptions): Promise<ApiResponse<MessageStatus>>;
    sendPush(data: {
        user_id: string;
        title: string;
        body: string;
        data?: Record<string, unknown>;
    }, options?: RequestOptions): Promise<ApiResponse<MessageStatus>>;
    registerPushToken(data: {
        token: string;
        platform: string;
    }, options?: RequestOptions): Promise<ApiResponse<PushToken>>;
    unregisterPushToken(token: string, options?: RequestOptions): Promise<ApiResponse<{
        unregistered: boolean;
    }>>;
    getMessageStatus(id: string, options?: RequestOptions): Promise<ApiResponse<MessageStatus>>;
    /** @deprecated Use sendSms() instead */
    sendSMS(data: {
        to: string;
        message: string;
    }): Promise<ApiResponse<MessageStatus>>;
    /** @deprecated Use sendPush() instead */
    sendPushNotification(data: {
        user_id: string;
        title: string;
        body: string;
        data?: Record<string, unknown>;
    }): Promise<ApiResponse<MessageStatus>>;
}

/**
 * Scheduler Service Module
 *
 * Cron jobs with pause/resume, execution history, and on-demand runs.
 *
 * Routes:
 *   POST   /jobs                 → create job
 *   GET    /jobs                  → list jobs
 *   GET    /jobs/{id}             → get job
 *   PATCH  /jobs/{id}             → update job
 *   DELETE /jobs/{id}             → delete job
 *   POST   /jobs/{id}/pause       → pause job
 *   POST   /jobs/{id}/resume      → resume job
 *   POST   /jobs/{id}/run-now     → trigger immediate run
 *   GET    /jobs/{id}/executions  → execution history
 *   GET    /jobs/{id}/stats       → job statistics
 */

interface SchedulerJob {
    id: string;
    name: string;
    job_name?: string;
    schedule_type: string;
    cron_expression?: string;
    interval_seconds?: number;
    scheduled_at?: string;
    timezone: string;
    target_type: string;
    target_config: unknown;
    is_enabled: boolean;
    status: string;
    next_run_at?: string;
    last_run_at?: string;
    run_count: number;
    created_at: string;
    updated_at: string;
}
interface JobExecution {
    id: string;
    scheduled_job_id: string;
    started_at: string;
    completed_at?: string;
    status: string;
    result?: string;
    error?: string;
    execution_time_ms?: number;
}
interface JobStats {
    id: string;
    scheduled_job_id: string;
    total_executions: number;
    successful_executions: number;
    failed_executions: number;
    avg_execution_time_ms?: number;
    last_success_at?: string;
    last_failure_at?: string;
    updated_at: string;
}
declare class SchedulerService extends ServiceModule {
    protected basePath: string;
    createJob(data: {
        name: string;
        cron: string;
        type: string;
        config: unknown;
    }, options?: RequestOptions): Promise<ApiResponse<SchedulerJob>>;
    listJobs(params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<SchedulerJob>>;
    getJob(id: string, options?: RequestOptions): Promise<ApiResponse<SchedulerJob>>;
    updateJob(id: string, data: Partial<{
        name: string;
        cron: string;
        config: unknown;
    }>, options?: RequestOptions): Promise<ApiResponse<SchedulerJob>>;
    deleteJob(id: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    pauseJob(id: string, options?: RequestOptions): Promise<ApiResponse<SchedulerJob>>;
    resumeJob(id: string, options?: RequestOptions): Promise<ApiResponse<SchedulerJob>>;
    runNow(id: string, options?: RequestOptions): Promise<ApiResponse<JobExecution>>;
    getExecutions(jobId: string, params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<JobExecution>>;
    getStats(jobId: string, options?: RequestOptions): Promise<ApiResponse<JobStats>>;
}

/**
 * Permissions Service Module
 *
 * RBAC: roles, permissions, policies, checks.
 *
 * Routes:
 *   POST /roles                      → create role
 *   GET  /roles                       → list roles
 *   POST /roles/{id}/permissions      → assign permissions to role
 *   POST /users/{id}/roles            → assign role to user
 *   POST /check                       → check single permission
 *   POST /batch-check                 → check multiple permissions
 *   GET  /users/{id}/permissions      → get user's permissions
 *   POST /policies                    → create policy
 *   GET  /policies                    → list policies
 *   POST /evaluate                    → evaluate policy
 */

type IdentityType = 'member' | 'user';
interface Role {
    id: string;
    role_name: string;
    description?: string;
    role_level?: number;
    created_at: string;
}
interface PermissionCheck {
    granted: boolean;
    permission: string;
    resource_type?: string;
    resource_id?: string;
    reason: string;
}
interface Policy {
    id: string;
    policy_name: string;
    description?: string;
    effect: string;
    resource_pattern: string;
    action_pattern: string;
    conditions?: Record<string, unknown>;
    priority: number;
    is_active: boolean;
    principals: Array<{
        principal_type: string;
        principal_id: string;
    }>;
    created_at: string;
}
/** Full permission matrix for an identity — single request, no N+1 */
interface PermissionMatrix {
    identityId: string;
    identityType: IdentityType;
    role?: string;
    roleLevel?: number;
    policyVersion: number;
    permissions: Record<string, Record<string, 'allow' | 'deny'>>;
}
/** Check if a specific resource:action is allowed in the matrix */
declare function canPerform(matrix: PermissionMatrix | null, resource: string, action: string): boolean;
/** Check if the matrix identity has at least the given role level */
declare function hasMinRoleLevel(matrix: PermissionMatrix | null, minLevel: number): boolean;
declare class PermissionsService extends ServiceModule {
    protected basePath: string;
    createRole(data: {
        name: string;
        description?: string;
    }, options?: RequestOptions): Promise<ApiResponse<Role>>;
    listRoles(options?: RequestOptions): Promise<ApiResponse<Role[]>>;
    assignPermissions(roleId: string, permissions: string[], options?: RequestOptions): Promise<ApiResponse<Role>>;
    assignRole(userId: string, roleId: string, options?: RequestOptions): Promise<ApiResponse<{
        assigned: boolean;
    }>>;
    /** Check a single permission. Supports identity_type for unified model. */
    check(identityId: string, permission: string, options?: RequestOptions & {
        identityType?: IdentityType;
        resourceType?: string;
        resourceId?: string;
    }): Promise<ApiResponse<PermissionCheck>>;
    /** Batch check multiple permissions for an identity. */
    batchCheck(identityId: string, permissions: string[], options?: RequestOptions & {
        identityType?: IdentityType;
    }): Promise<ApiResponse<PermissionCheck[]>>;
    /** Fetch the full permission matrix for an identity (single request, no N+1). */
    getMatrix(identityId: string, identityType?: IdentityType, options?: RequestOptions): Promise<ApiResponse<PermissionMatrix>>;
    getUserPermissions(userId: string, options?: RequestOptions): Promise<ApiResponse<string[]>>;
    createPolicy(data: {
        name: string;
        effect: 'allow' | 'deny';
        actions: string[];
        resources: string[];
        conditions?: Record<string, unknown>;
    }, options?: RequestOptions): Promise<ApiResponse<Policy>>;
    listPolicies(options?: RequestOptions): Promise<ApiResponse<Policy[]>>;
    evaluate(data: {
        user_id: string;
        action: string;
        resource: string;
        context?: Record<string, unknown>;
    }, options?: RequestOptions): Promise<ApiResponse<{
        allowed: boolean;
        reason?: string;
    }>>;
    /** @deprecated Use assignPermissions() instead */
    assignPermission(roleId: string, permission: string): Promise<ApiResponse<Role>>;
    /** @deprecated Use check() instead */
    checkPermission(userId: string, permission: string): Promise<ApiResponse<PermissionCheck>>;
}

/**
 * Workspaces Service Module
 *
 * Workspace CRUD, members, invitations, SSO.
 * Workspaces are resource containers (own projects, goals, settings, people, agents).
 *
 * Routes (via /v1/workspaces):
 *   POST   /                              → create workspace
 *   GET    /                               → list workspaces
 *   GET    /mine                           → list my workspaces
 *   GET    /{id}                           → get workspace
 *   PATCH  /{id}                           → update workspace
 *   DELETE /{id}                           → delete workspace
 *   GET    /{id}/members                   → list members
 *   POST   /{id}/members                   → add member
 *   PATCH  /{id}/members/{userId}          → update member role
 *   DELETE /{id}/members/{userId}          → remove member
 *   POST   /{id}/invitations               → invite
 *   GET    /{id}/invitations               → list invitations
 *   POST   /invitations/{token}/accept     → accept invitation
 *   DELETE /invitations/{id}               → cancel invitation
 *   POST   /{id}/sso/configure             → configure SSO
 *   GET    /{id}/sso                        → get SSO config
 */

interface Workspace$1 {
    id: string;
    kind: 'workspace';
    name: string;
    description?: string;
    owner_user_id: string;
    plan_type?: string;
    member_limit?: number;
    created_at: string;
}
interface WorkspaceMember {
    id: string;
    container_id: string;
    sm_user_id: string;
    role: string;
    joined_at: string;
    full_name?: string;
    email?: string;
    avatar_url?: string;
}
interface WorkspaceInvitation {
    id: string;
    container_id: string;
    email: string;
    invited_by: string;
    role: string;
    token?: string;
    status: string;
    expires_at: string;
    created_at: string;
}
interface SsoConfig {
    id: string;
    container_id: string;
    provider_type: string;
    provider_name?: string;
    saml_idp_entity_id?: string;
    saml_idp_sso_url?: string;
    oauth_client_id?: string;
    oauth_authorize_url?: string;
    oauth_token_url?: string;
    oauth_userinfo_url?: string;
    allowed_domains?: string[];
    attribute_mapping?: Record<string, unknown>;
    is_enabled: boolean;
    is_enforced: boolean;
    jit_provisioning_enabled: boolean;
    default_role: string;
    metadata?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}
declare class WorkspacesService extends ServiceModule {
    protected basePath: string;
    create(data: {
        name: string;
        description?: string;
    }, options?: RequestOptions): Promise<ApiResponse<Workspace$1>>;
    list(params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<Workspace$1>>;
    mine(params?: PaginationParams, options?: RequestOptions): Promise<PaginatedResponse<Workspace$1>>;
    get(id: string, options?: RequestOptions): Promise<ApiResponse<Workspace$1>>;
    update(id: string, data: Partial<{
        name: string;
        description: string;
    }>, options?: RequestOptions): Promise<ApiResponse<Workspace$1>>;
    delete(id: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    listMembers(workspaceId: string, params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<WorkspaceMember>>;
    addMember(workspaceId: string, data: {
        user_id: string;
        role: string;
    }, options?: RequestOptions): Promise<ApiResponse<WorkspaceMember>>;
    updateMember(workspaceId: string, userId: string, data: {
        role: string;
    }, options?: RequestOptions): Promise<ApiResponse<WorkspaceMember>>;
    removeMember(workspaceId: string, userId: string, options?: RequestOptions): Promise<ApiResponse<{
        removed: boolean;
    }>>;
    invite(workspaceId: string, data: {
        email: string;
        role: string;
    }, options?: RequestOptions): Promise<ApiResponse<WorkspaceInvitation>>;
    listInvitations(workspaceId: string, options?: RequestOptions): Promise<ApiResponse<WorkspaceInvitation[]>>;
    acceptInvitation(token: string, options?: RequestOptions): Promise<ApiResponse<WorkspaceInvitation>>;
    cancelInvitation(id: string, options?: RequestOptions): Promise<ApiResponse<{
        cancelled: boolean;
    }>>;
    configureSso(workspaceId: string, data: {
        provider: string;
        domain: string;
        metadata_url?: string;
    }, options?: RequestOptions): Promise<ApiResponse<SsoConfig>>;
    getSso(workspaceId: string, options?: RequestOptions): Promise<ApiResponse<SsoConfig>>;
}

/**
 * Teams Service Module
 *
 * Team CRUD, members, invitations.
 * Teams are membership/coordination groups (group people and agents; do not own resources).
 * SSO is NOT available for teams — use workspaces for SSO.
 *
 * Routes (via /v1/teams):
 *   POST   /                              → create team
 *   GET    /                               → list teams
 *   GET    /mine                           → list my teams
 *   GET    /{id}                           → get team
 *   PATCH  /{id}                           → update team
 *   DELETE /{id}                           → delete team
 *   GET    /{id}/members                   → list members
 *   POST   /{id}/members                   → add member
 *   PATCH  /{id}/members/{userId}          → update member role
 *   DELETE /{id}/members/{userId}          → remove member
 *   POST   /{id}/invitations               → invite
 *   GET    /{id}/invitations               → list invitations
 *   POST   /invitations/{token}/accept     → accept invitation
 *   DELETE /invitations/{id}               → cancel invitation
 */

interface Team {
    id: string;
    kind: 'team';
    name: string;
    description?: string;
    owner_user_id: string;
    plan_type?: string;
    member_limit?: number;
    created_at: string;
}
interface TeamMember {
    id: string;
    container_id: string;
    sm_user_id: string;
    role: string;
    joined_at: string;
    full_name?: string;
    email?: string;
    avatar_url?: string;
}
interface TeamInvitation {
    id: string;
    container_id: string;
    email: string;
    invited_by: string;
    role: string;
    token?: string;
    status: string;
    expires_at: string;
    created_at: string;
}
declare class TeamsService extends ServiceModule {
    protected basePath: string;
    create(data: {
        name: string;
        description?: string;
    }, options?: RequestOptions): Promise<ApiResponse<Team>>;
    list(params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<Team>>;
    mine(params?: PaginationParams, options?: RequestOptions): Promise<PaginatedResponse<Team>>;
    get(id: string, options?: RequestOptions): Promise<ApiResponse<Team>>;
    update(id: string, data: Partial<{
        name: string;
        description: string;
    }>, options?: RequestOptions): Promise<ApiResponse<Team>>;
    delete(id: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    listMembers(teamId: string, params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<TeamMember>>;
    addMember(teamId: string, data: {
        user_id: string;
        role: string;
    }, options?: RequestOptions): Promise<ApiResponse<TeamMember>>;
    updateMember(teamId: string, userId: string, data: {
        role: string;
    }, options?: RequestOptions): Promise<ApiResponse<TeamMember>>;
    removeMember(teamId: string, userId: string, options?: RequestOptions): Promise<ApiResponse<{
        removed: boolean;
    }>>;
    invite(teamId: string, data: {
        email: string;
        role: string;
    }, options?: RequestOptions): Promise<ApiResponse<TeamInvitation>>;
    listInvitations(teamId: string, options?: RequestOptions): Promise<ApiResponse<TeamInvitation[]>>;
    acceptInvitation(token: string, options?: RequestOptions): Promise<ApiResponse<TeamInvitation>>;
    cancelInvitation(id: string, options?: RequestOptions): Promise<ApiResponse<{
        cancelled: boolean;
    }>>;
}

/**
 * Graph Service Module
 *
 * Graph database: nodes, edges, traversal, algorithms.
 *
 * Routes:
 *   POST /nodes                           → create node
 *   PATCH /nodes/{id}                     → update node
 *   POST /edges                           → create edge
 *   GET  /nodes/{id}/edges                → get edges for node
 *   GET  /nodes/{id}/traverse             → traverse graph
 *   POST /shortest-path                   → shortest path
 *   GET  /nodes/{id}/neighbors            → neighbors
 *   POST /algorithms/pagerank             → PageRank
 *   POST /algorithms/centrality           → centrality
 *   POST /algorithms/connected-components → connected components
 */

interface GraphNode {
    node_id: string;
    node_type: string;
    properties: Record<string, unknown>;
    created_at: string;
}
interface GraphEdge {
    edge_id: string;
    from_node_id: string;
    to_node_id: string;
    edge_type: string;
    properties?: Record<string, unknown>;
    weight: number;
    created_at: string;
}
interface TraversalResult {
    nodes: GraphNode[];
    edges: GraphEdge[];
    depth: number;
}
interface ShortestPathResult {
    path: string[];
    distance: number;
    edges: GraphEdge[];
}
declare class GraphService extends ServiceModule {
    protected basePath: string;
    createNode(data: {
        label: string;
        properties?: Record<string, unknown>;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<GraphNode>>;
    updateNode(nodeId: string, data: {
        properties: Record<string, unknown>;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<GraphNode>>;
    createEdge(data: {
        from_id: string;
        to_id: string;
        type: string;
        properties?: Record<string, unknown>;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<GraphEdge>>;
    getEdges(nodeId: string, options?: {
        type?: string;
        direction?: 'in' | 'out' | 'both';
    }, requestOptions?: RequestOptions): Promise<ApiResponse<GraphEdge[]>>;
    traverse(nodeId: string, options?: {
        depth?: number;
        direction?: string;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<TraversalResult>>;
    shortestPath(options: {
        from: string;
        to: string;
        max_depth?: number;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<ShortestPathResult>>;
    neighbors(nodeId: string, options?: {
        depth?: number;
        type?: string;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<GraphNode[]>>;
    pageRank(options?: {
        iterations?: number;
        damping?: number;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<Record<string, number>>>;
    centrality(options?: {
        algorithm?: string;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<Record<string, number>>>;
    connectedComponents(options?: RequestOptions): Promise<ApiResponse<string[][]>>;
}

/**
 * Functions Service Module
 *
 * Serverless functions: deploy, invoke, logs, executions, metrics.
 *
 * Routes:
 *   POST   /                    → deploy function
 *   GET    /                    → list functions
 *   GET    /{name}              → get function
 *   PATCH  /{name}              → update function
 *   DELETE /{name}              → delete function
 *   POST   /{name}/invoke       → invoke synchronously
 *   POST   /{name}/invoke-async → invoke asynchronously
 *   GET    /{name}/logs         → function logs
 *   GET    /{name}/executions   → execution history
 *   GET    /{name}/metrics      → function metrics
 */

interface ServerlessFunction {
    name: string;
    runtime: string;
    status: string;
    memory_mb?: number;
    timeout_seconds?: number;
    environment?: Record<string, string>;
    created_at: string;
    updated_at: string;
}
interface FunctionExecution {
    id: string;
    function_name: string;
    status: string;
    started_at: string;
    completed_at?: string;
    duration_ms?: number;
    result?: unknown;
    error?: string;
}
interface FunctionMetrics {
    invocations: number;
    errors: number;
    avg_duration_ms: number;
    p99_duration_ms: number;
}
declare class FunctionsService extends ServiceModule {
    protected basePath: string;
    deploy(data: {
        name: string;
        runtime: string;
        code: string;
    }, options?: RequestOptions): Promise<ApiResponse<ServerlessFunction>>;
    list(options?: RequestOptions): Promise<ApiResponse<ServerlessFunction[]>>;
    get(name: string, options?: RequestOptions): Promise<ApiResponse<ServerlessFunction>>;
    update(name: string, data: {
        code?: string;
        config?: Record<string, unknown>;
    }, options?: RequestOptions): Promise<ApiResponse<ServerlessFunction>>;
    delete(name: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    invoke(name: string, payload?: unknown, options?: RequestOptions): Promise<ApiResponse<unknown>>;
    invokeAsync(name: string, payload?: unknown, options?: RequestOptions): Promise<ApiResponse<{
        execution_id: string;
    }>>;
    getLogs(name: string, options?: RequestOptions): Promise<ApiResponse<unknown[]>>;
    getExecutions(name: string, params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<FunctionExecution>>;
    getMetrics(name: string, options?: RequestOptions): Promise<ApiResponse<FunctionMetrics>>;
    /** @deprecated Use deploy() instead */
    deployFunction(data: {
        name: string;
        runtime: string;
        code: string;
    }): Promise<ApiResponse<ServerlessFunction>>;
    /** @deprecated Use invoke() instead */
    invokeFunction(name: string, payload?: unknown): Promise<ApiResponse<unknown>>;
}

/**
 * Listings Service Module
 *
 * Marketplace listings: CRUD, search, nearby, favorites.
 *
 * Routes:
 *   POST   /                      → create listing
 *   GET    /{id}                  → get listing
 *   PATCH  /{id}                  → update listing
 *   DELETE /{id}                  → delete listing
 *   GET    /search                → search listings
 *   GET    /nearby                → nearby listings
 *   GET    /categories/{category} → by category
 *   POST   /{id}/favorite         → favorite
 *   DELETE /{id}/favorite         → unfavorite
 *   GET    /favorites             → user's favorites
 *   POST   /{id}/view             → track view
 */

interface Listing {
    id: string;
    title: string;
    description: string;
    price?: number;
    category?: string;
    location?: {
        lat: number;
        lng: number;
    };
    images?: string[];
    status: string;
    view_count?: number;
    favorite_count?: number;
    created_at: string;
    updated_at: string;
}
declare class ListingsService extends ServiceModule {
    protected basePath: string;
    create(data: {
        title: string;
        description: string;
        price?: number;
        category?: string;
    }, options?: RequestOptions): Promise<ApiResponse<Listing>>;
    get(id: string, options?: RequestOptions): Promise<ApiResponse<Listing>>;
    update(id: string, data: Record<string, unknown>, options?: RequestOptions): Promise<ApiResponse<Listing>>;
    delete(id: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    search(query: string, filters?: Record<string, unknown>, options?: RequestOptions): Promise<ApiResponse<Listing[]>>;
    nearby(nearbyOptions: {
        lat: number;
        lng: number;
        radius: number;
        category?: string;
    }, options?: RequestOptions): Promise<ApiResponse<Listing[]>>;
    getByCategory(category: string, params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<Listing>>;
    favorite(listingId: string, options?: RequestOptions): Promise<ApiResponse<{
        favorited: boolean;
    }>>;
    unfavorite(listingId: string, options?: RequestOptions): Promise<ApiResponse<{
        unfavorited: boolean;
    }>>;
    getFavorites(params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<Listing>>;
    trackView(listingId: string, options?: RequestOptions): Promise<ApiResponse<{
        tracked: boolean;
    }>>;
    /** @deprecated Use create() instead */
    createListing(data: {
        title: string;
        description: string;
        price?: number;
        category?: string;
    }): Promise<ApiResponse<Listing>>;
    /** @deprecated Use search() instead */
    searchListings(query: string, filters?: Record<string, unknown>): Promise<ApiResponse<Listing[]>>;
    /** @deprecated Use get() instead */
    getListing(id: string): Promise<ApiResponse<Listing>>;
}

/**
 * Events Service Module
 *
 * Event management: CRUD, registration, attendees, check-in.
 *
 * Routes:
 *   POST   /                  → create event
 *   GET    /{id}              → get event
 *   PATCH  /{id}              → update event
 *   DELETE /{id}              → delete event
 *   GET    /                  → list events
 *   POST   /{id}/register     → register for event
 *   DELETE /{id}/register     → unregister
 *   GET    /{id}/attendees    → list attendees
 *   POST   /{id}/check-in     → check in
 */

interface CalendarEvent {
    id: string;
    title: string;
    description: string;
    start_date: string;
    end_date?: string;
    location?: string;
    capacity?: number;
    attendee_count?: number;
    status: string;
    created_at: string;
    updated_at: string;
}
interface Attendee {
    user_id: string;
    event_id: string;
    status: string;
    checked_in_at?: string;
    registered_at: string;
}
declare class EventsService extends ServiceModule {
    protected basePath: string;
    create(data: {
        title: string;
        description: string;
        start_date: string;
        end_date?: string;
    }, options?: RequestOptions): Promise<ApiResponse<CalendarEvent>>;
    get(eventId: string, options?: RequestOptions): Promise<ApiResponse<CalendarEvent>>;
    update(eventId: string, data: Record<string, unknown>, options?: RequestOptions): Promise<ApiResponse<CalendarEvent>>;
    delete(eventId: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    list(filters?: PaginationParams & Record<string, unknown>, requestOptions?: RequestOptions): Promise<PaginatedResponse<CalendarEvent>>;
    register(eventId: string, options?: RequestOptions): Promise<ApiResponse<Attendee>>;
    unregister(eventId: string, options?: RequestOptions): Promise<ApiResponse<{
        unregistered: boolean;
    }>>;
    getAttendees(eventId: string, params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<Attendee>>;
    checkIn(eventId: string, options?: RequestOptions): Promise<ApiResponse<Attendee>>;
    /** @deprecated Use create() instead */
    createEvent(data: {
        title: string;
        description: string;
        start_date: string;
        end_date: string;
    }): Promise<ApiResponse<CalendarEvent>>;
    /** @deprecated Use list() instead */
    listEvents(filters?: PaginationParams & Record<string, unknown>): Promise<PaginatedResponse<CalendarEvent>>;
}

/**
 * Leaderboard Service Module
 *
 * Leaderboards: create, scores, rankings, history.
 *
 * Routes:
 *   POST   /                              → create leaderboard
 *   POST   /{boardId}/scores              → submit score
 *   GET    /{boardId}/rankings            → get rankings
 *   GET    /{boardId}/users/{userId}/rank → user rank
 *   GET    /{boardId}/users/{userId}/history → user history
 *   PATCH  /{boardId}/users/{userId}/score  → update score
 *   DELETE /{boardId}/users/{userId}/score  → delete score
 */

interface Leaderboard {
    id: string;
    name: string;
    sort_order: 'asc' | 'desc';
    entry_count?: number;
    created_at: string;
}
interface LeaderboardEntry {
    user_id: string;
    score: number;
    rank: number;
    updated_at: string;
}
interface UserRank {
    rank: number;
    score: number;
    total_entries: number;
}
declare class LeaderboardService extends ServiceModule {
    protected basePath: string;
    create(data: {
        name: string;
        sort_order?: 'asc' | 'desc';
    }, options?: RequestOptions): Promise<ApiResponse<Leaderboard>>;
    submitScore(boardId: string, data: {
        user_id: string;
        score: number;
    }, options?: RequestOptions): Promise<ApiResponse<LeaderboardEntry>>;
    getRankings(boardId: string, rankingOptions?: {
        limit?: number;
        offset?: number;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<LeaderboardEntry[]>>;
    getUserRank(boardId: string, userId: string, options?: RequestOptions): Promise<ApiResponse<UserRank>>;
    getUserHistory(boardId: string, userId: string, options?: RequestOptions): Promise<ApiResponse<LeaderboardEntry[]>>;
    updateScore(boardId: string, userId: string, data: {
        score: number;
    }, options?: RequestOptions): Promise<ApiResponse<LeaderboardEntry>>;
    deleteScore(boardId: string, userId: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
}

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

interface Webhook {
    id: string;
    url: string;
    events: string[];
    secret?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}
declare class WebhooksService extends ServiceModule {
    protected basePath: string;
    create(data: {
        url: string;
        events: string[];
        secret?: string;
    }, options?: RequestOptions): Promise<ApiResponse<Webhook>>;
    list(options?: RequestOptions): Promise<ApiResponse<Webhook[]>>;
    get(id: string, options?: RequestOptions): Promise<ApiResponse<Webhook>>;
    update(id: string, data: {
        url?: string;
        events?: string[];
        is_active?: boolean;
    }, options?: RequestOptions): Promise<ApiResponse<Webhook>>;
    delete(id: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    listEvents(options?: RequestOptions): Promise<ApiResponse<string[]>>;
    /** @deprecated Use create() instead */
    createWebhook(data: {
        url: string;
        events: string[];
        secret?: string;
    }): Promise<ApiResponse<Webhook>>;
    /** @deprecated Use list() instead */
    listWebhooks(): Promise<ApiResponse<Webhook[]>>;
    /** @deprecated Use delete() instead */
    deleteWebhook(id: string): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
}

/**
 * Search Service Module
 *
 * Full-text search: index, query, remove.
 *
 * Routes:
 *   POST   /                         → search/query
 *   POST   /documents                → index document
 *   DELETE /documents/{index}/{docId} → remove document
 */

interface SearchResult {
    id: string;
    index: string;
    score: number;
    document: Record<string, unknown>;
    highlights?: Record<string, string[]>;
}
declare class SearchService extends ServiceModule {
    protected basePath: string;
    query(queryStr: string, queryOptions?: {
        index?: string;
        limit?: number;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<SearchResult[]>>;
    index(indexName: string, document: {
        id: string;
        [key: string]: unknown;
    }, options?: RequestOptions): Promise<ApiResponse<{
        indexed: boolean;
    }>>;
    removeDocument(indexName: string, docId: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    /** @deprecated Use query() instead */
    search(queryStr: string, options?: {
        index?: string;
        limit?: number;
    }): Promise<ApiResponse<SearchResult[]>>;
    /** @deprecated Use index() instead */
    indexDocument(data: {
        index: string;
        id: string;
        document: unknown;
    }): Promise<ApiResponse<{
        indexed: boolean;
    }>>;
}

/**
 * Photo Service Module
 *
 * Photo upload, transformation, management.
 *
 * Routes:
 *   POST   /                   → upload photo
 *   POST   /{id}/transform     → transform photo
 *   GET    /{id}               → get photo info
 *   DELETE /{id}               → delete photo
 */

interface PhotoInfo {
    id: string;
    filename: string;
    content_type: string;
    width?: number;
    height?: number;
    size_bytes: number;
    url?: string;
    thumbnails?: Array<{
        url: string;
        width: number;
        height: number;
    }>;
    metadata?: Record<string, unknown>;
    created_at: string;
}
interface TransformResult {
    id: string;
    url: string;
    width: number;
    height: number;
    format: string;
}
/** Options for building a transform URL or requesting a transform */
interface TransformOptions {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill' | 'scaledown';
    /** Output format. Omit to let the server negotiate from the Accept header (AVIF > WebP > JPEG). */
    format?: 'jpeg' | 'jpg' | 'png' | 'webp' | 'gif' | 'avif';
    /** Quality 1-100 (default: 85) */
    quality?: number;
}
/**
 * Pre-generated square crop sizes (px).
 * URLs built with these sizes + fit=cover get instant cache hits (no server-side transform).
 */
declare const PHOTO_BREAKPOINTS: readonly [150, 320, 640, 1080];
declare class PhotoService extends ServiceModule {
    protected basePath: string;
    upload(file: File | Blob, uploadOptions?: {
        metadata?: Record<string, unknown>;
        onProgress?: (progress: number) => void;
        signal?: AbortSignal;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<PhotoInfo>>;
    transform(photoId: string, transformations: Record<string, unknown>, options?: RequestOptions): Promise<ApiResponse<TransformResult>>;
    get(id: string, options?: RequestOptions): Promise<ApiResponse<PhotoInfo>>;
    delete(id: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    /**
     * Build an absolute URL for the on-demand transform endpoint.
     *
     * Use in `<img src>` or `srcset` — the server negotiates the best format
     * (AVIF > WebP > JPEG) from the browser's Accept header automatically.
     * Transformed images are cached server-side on first request.
     */
    getTransformUrl(photoId: string, options?: TransformOptions): string;
    /**
     * Get a transform URL optimized for the given display area.
     *
     * Snaps UP to the nearest pre-generated square breakpoint (150, 320, 640, 1080)
     * so the response is served instantly from cache. Format is auto-negotiated
     * by the browser's Accept header (WebP in modern browsers, JPEG fallback).
     *
     * @param photoId  Photo ID
     * @param displayWidth  CSS pixel width of the display area
     * @param options.dpr  Device pixel ratio (default: 1). Pass `window.devicePixelRatio` in browsers.
     *
     * @example
     * ```typescript
     * // 280px card on 2x Retina -> snaps to 640px (280×2=560, next breakpoint up)
     * const url = sm.photo.getOptimalUrl(photoId, 280, { dpr: 2 })
     *
     * // Profile avatar at 48px -> snaps to 150px
     * const url = sm.photo.getOptimalUrl(photoId, 48)
     * ```
     */
    getOptimalUrl(photoId: string, displayWidth: number, options?: {
        dpr?: number;
    }): string;
    /**
     * Generate an HTML srcset string for responsive square photo display.
     *
     * Returns all pre-generated breakpoints as width descriptors. Pair with
     * the `sizes` attribute so the browser picks the optimal variant automatically.
     *
     * @example
     * ```tsx
     * const srcset = sm.photo.getSrcSet(photoId)
     * // -> ".../transform?width=150&height=150&fit=cover 150w, .../transform?width=320..."
     *
     * <img
     *   src={sm.photo.getOptimalUrl(photoId, 320)}
     *   srcSet={srcset}
     *   sizes="(max-width: 640px) 100vw, 640px"
     *   alt="Photo"
     * />
     * ```
     */
    getSrcSet(photoId: string): string;
    /**
     * Register a photo from an already-uploaded storage file.
     *
     * Creates a photo record so the optimization pipeline can process it.
     * Use this when files are uploaded via the storage service (presigned URL)
     * instead of the photo service's upload endpoint.
     *
     * Returns the photo record with `id` that can be used with `getTransformUrl()`.
     */
    register(registerOptions: {
        fileId: string;
        userId?: string;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<PhotoInfo>>;
    /** @deprecated Use upload() instead */
    uploadPhoto(file: File | Blob, options?: {
        metadata?: Record<string, unknown>;
        onProgress?: (progress: number) => void;
        signal?: AbortSignal;
    }): Promise<ApiResponse<PhotoInfo>>;
    /** @deprecated Use transform() instead */
    transformPhoto(photoId: string, transformations: Record<string, unknown>): Promise<ApiResponse<TransformResult>>;
    /** @deprecated Use get() instead */
    getPhoto(id: string): Promise<ApiResponse<PhotoInfo>>;
}

/**
 * Queue Service Module
 *
 * Job queue with dead letter sub-API.
 *
 * Routes:
 *   POST /jobs               → enqueue job
 *   GET  /jobs/{id}          → get job status
 *   GET  /dead-letter        → list dead letter jobs
 *   GET  /dead-letter/{id}   → get dead letter job
 *   POST /dead-letter/{id}/retry → retry dead letter job
 *   DELETE /dead-letter/{id} → delete dead letter job
 */

interface QueueJob {
    id: string;
    job_type: string;
    status: string;
    queue?: string;
    priority?: string;
    payload: unknown;
    attempts: number;
    max_attempts: number;
    created_at: string;
    completed_at?: string;
    error?: string;
}
interface DeadLetterJob {
    id: string;
    original_job_id: string;
    job_type: string;
    payload: unknown;
    error: string;
    failed_at: string;
}
declare class DeadLetterApi extends ServiceModule {
    protected basePath: string;
    list(options?: RequestOptions): Promise<ApiResponse<DeadLetterJob[]>>;
    get(id: string, options?: RequestOptions): Promise<ApiResponse<DeadLetterJob>>;
    retry(id: string, options?: RequestOptions): Promise<ApiResponse<QueueJob>>;
    delete(id: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
}
declare class QueueService extends ServiceModule {
    protected basePath: string;
    readonly deadLetter: DeadLetterApi;
    constructor(client: ScaleMuleClient);
    enqueue(data: {
        job_type: string;
        payload: unknown;
        queue?: string;
        priority?: 'low' | 'normal' | 'high' | 'critical';
        run_at?: string;
        max_attempts?: number;
    }, options?: RequestOptions): Promise<ApiResponse<QueueJob>>;
    getJob(id: string, options?: RequestOptions): Promise<ApiResponse<QueueJob>>;
}

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

interface CacheEntry {
    key: string;
    value: unknown;
    ttl?: number;
    expires_at?: string;
}
declare class CacheService extends ServiceModule {
    protected basePath: string;
    get(key: string, options?: RequestOptions): Promise<ApiResponse<CacheEntry>>;
    set(key: string, value: unknown, ttl?: number, options?: RequestOptions): Promise<ApiResponse<CacheEntry>>;
    delete(key: string, options?: RequestOptions): Promise<ApiResponse<{
        deleted: boolean;
    }>>;
    flush(options?: RequestOptions): Promise<ApiResponse<{
        flushed: boolean;
    }>>;
}

/**
 * Compliance Service Module
 *
 * GDPR/CCPA data subject requests, consent management, breach tracking,
 * data retention policies, processing activities, and audit logging.
 *
 * Routes:
 *   POST /audit-logs              → create audit log
 *   GET  /audit-logs              → query audit logs
 *
 *   Legacy GDPR (deprecated — use DSR endpoints):
 *   POST /gdpr/access-request     → request data export
 *   POST /gdpr/deletion-request   → request data deletion
 *
 *   Consent Purposes:
 *   POST /consent-purposes        → create consent purpose
 *   GET  /consent-purposes        → list consent purposes
 *
 *   Consent v2:
 *   POST /consent/v2              → record consent
 *   GET  /consent/v2/:userId      → get user consents
 *   PUT  /consent/v2/:id/withdraw → withdraw consent
 *
 *   Data Subject Requests (DSR):
 *   POST /dsr                     → create DSR
 *   GET  /dsr                     → list DSRs
 *   GET  /dsr/:id                 → get DSR
 *   PUT  /dsr/:id/status          → update DSR status
 *   POST /dsr/:id/actions         → create DSR action
 *   GET  /dsr/:id/actions         → list DSR actions
 *
 *   Breaches:
 *   POST /breaches                → report breach
 *   GET  /breaches                → list breaches
 *   GET  /breaches/:id            → get breach
 *   PUT  /breaches/:id            → update breach
 *
 *   Retention Policies:
 *   GET  /retention/policies      → list retention policies
 *   POST /retention/policies      → create retention policy
 *
 *   Processing Activities:
 *   POST /processing-activities   → create processing activity
 *   GET  /processing-activities   → list processing activities
 *   GET  /processing-activities/:id → get processing activity
 *   PUT  /processing-activities/:id → update processing activity
 */

interface AuditLog {
    id: string;
    action: string;
    resource_type: string;
    resource_id: string;
    actor_id?: string;
    metadata?: Record<string, unknown>;
    created_at: string;
}
/** @deprecated Use DataSubjectRequest instead */
interface GdprRequest {
    id: string;
    type: 'access' | 'deletion';
    user_id: string;
    status: string;
    created_at: string;
    completed_at?: string;
}
interface ConsentPurpose {
    id: string;
    name: string;
    description?: string;
    legal_basis: string;
    category: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}
interface ConsentRecord {
    id: string;
    user_id: string;
    purpose_id: string;
    purpose_name: string;
    consent_given: boolean;
    consent_method?: string;
    double_opt_in_verified: boolean;
    granted_at: string;
    withdrawn_at?: string;
}
interface DataSubjectRequest {
    id: string;
    request_type: string;
    status: string;
    priority: string;
    reference_number: string;
    requester_email: string;
    requester_name?: string;
    description?: string;
    deadline: string;
    completed_at?: string;
    created_at: string;
    updated_at: string;
}
interface DsrAction {
    id: string;
    dsr_id: string;
    service_name: string;
    action_type: string;
    status: string;
    details?: string;
    completed_at?: string;
    created_at: string;
}
interface DataBreach {
    id: string;
    reference_number: string;
    title: string;
    description?: string;
    incident_type: string;
    severity: string;
    status: string;
    discovered_at: string;
    reported_to_authority: boolean;
    individuals_affected?: number;
    created_at: string;
    updated_at: string;
}
interface RetentionPolicy {
    id: string;
    data_type: string;
    table_name?: string;
    retention_days: number;
    name?: string;
    description?: string;
    is_active: boolean;
    last_execution_at?: string;
    last_execution_result?: string;
    records_deleted_last_run?: number;
}
interface ProcessingActivity {
    id: string;
    name: string;
    description?: string;
    purpose: string;
    legal_basis: string;
    data_categories?: string;
    data_subjects?: string;
    recipients?: string;
    international_transfers?: string;
    retention_period?: string;
    technical_measures?: string;
    dpia_required: boolean;
    dpia_conducted: boolean;
    status: string;
    created_at: string;
    updated_at: string;
}
interface CreateConsentPurposeRequest {
    name: string;
    description?: string;
    legal_basis: string;
    category: string;
}
interface RecordConsentRequest {
    user_id: string;
    purpose_id: string;
    consent_given: boolean;
    consent_method?: string;
}
interface CreateDsrRequest {
    request_type: 'access' | 'deletion' | 'rectification' | 'portability' | 'restriction' | 'objection';
    requester_email: string;
    requester_name?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
}
interface UpdateDsrStatusRequest {
    status: string;
    reason?: string;
    actor?: string;
}
interface CreateDsrActionRequest {
    service_name: string;
    action_type: string;
    details?: string;
}
interface ReportBreachRequest {
    title: string;
    description?: string;
    incident_type: string;
    severity: string;
    discovered_at: string;
    individuals_affected?: number;
}
interface UpdateBreachRequest {
    title?: string;
    description?: string;
    status?: string;
    severity?: string;
    reported_to_authority?: boolean;
    authority_reference?: string;
    individuals_affected?: number;
}
interface CreateRetentionPolicyRequest {
    data_type: string;
    table_name?: string;
    retention_days: number;
    name?: string;
    description?: string;
}
interface CreateProcessingActivityRequest {
    name: string;
    description?: string;
    purpose: string;
    legal_basis: string;
    data_categories?: string;
    data_subjects?: string;
    recipients?: string;
    international_transfers?: string;
    retention_period?: string;
    technical_measures?: string;
    dpia_required?: boolean;
}
declare class ComplianceService extends ServiceModule {
    protected basePath: string;
    /** Build query string from params object */
    private qs;
    log(data: {
        action: string;
        resource_type: string;
        resource_id: string;
        metadata?: Record<string, unknown>;
    }, options?: RequestOptions): Promise<ApiResponse<AuditLog>>;
    queryAuditLogs(params?: {
        page?: number;
        per_page?: number;
        action?: string;
        resource_type?: string;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<AuditLog[]>>;
    /** @deprecated Use createDataSubjectRequest({ request_type: 'access', ... }) instead */
    requestDataExport(userId: string): Promise<ApiResponse<GdprRequest>>;
    /** @deprecated Use createDataSubjectRequest({ request_type: 'deletion', ... }) instead */
    requestDataDeletion(userId: string): Promise<ApiResponse<GdprRequest>>;
    /** @deprecated Use log() instead */
    createAuditLog(data: {
        action: string;
        resource_type: string;
        resource_id: string;
    }): Promise<ApiResponse<AuditLog>>;
    listConsentPurposes(options?: RequestOptions): Promise<ApiResponse<ConsentPurpose[]>>;
    createConsentPurpose(data: CreateConsentPurposeRequest, options?: RequestOptions): Promise<ApiResponse<ConsentPurpose>>;
    recordConsent(data: RecordConsentRequest, options?: RequestOptions): Promise<ApiResponse<ConsentRecord>>;
    getUserConsents(userId: string, options?: RequestOptions): Promise<ApiResponse<ConsentRecord[]>>;
    withdrawConsent(consentId: string, data?: {
        reason?: string;
        actor?: string;
    }, options?: RequestOptions): Promise<ApiResponse<ConsentRecord>>;
    createDataSubjectRequest(data: CreateDsrRequest, options?: RequestOptions): Promise<ApiResponse<DataSubjectRequest>>;
    listDataSubjectRequests(params?: {
        page?: number;
        per_page?: number;
        status?: string;
        request_type?: string;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<DataSubjectRequest[]>>;
    getDataSubjectRequest(id: string, options?: RequestOptions): Promise<ApiResponse<DataSubjectRequest>>;
    updateDsrStatus(id: string, data: UpdateDsrStatusRequest, options?: RequestOptions): Promise<ApiResponse<DataSubjectRequest>>;
    createDsrAction(dsrId: string, data: CreateDsrActionRequest, options?: RequestOptions): Promise<ApiResponse<DsrAction>>;
    listDsrActions(dsrId: string, options?: RequestOptions): Promise<ApiResponse<DsrAction[]>>;
    reportBreach(data: ReportBreachRequest, options?: RequestOptions): Promise<ApiResponse<DataBreach>>;
    listBreaches(params?: {
        page?: number;
        per_page?: number;
        status?: string;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<DataBreach[]>>;
    getBreach(id: string, options?: RequestOptions): Promise<ApiResponse<DataBreach>>;
    updateBreach(id: string, data: UpdateBreachRequest, options?: RequestOptions): Promise<ApiResponse<DataBreach>>;
    listRetentionPolicies(options?: RequestOptions): Promise<ApiResponse<RetentionPolicy[]>>;
    createRetentionPolicy(data: CreateRetentionPolicyRequest, options?: RequestOptions): Promise<ApiResponse<RetentionPolicy>>;
    createProcessingActivity(data: CreateProcessingActivityRequest, options?: RequestOptions): Promise<ApiResponse<ProcessingActivity>>;
    listProcessingActivities(params?: {
        page?: number;
        per_page?: number;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<ProcessingActivity[]>>;
    getProcessingActivity(id: string, options?: RequestOptions): Promise<ApiResponse<ProcessingActivity>>;
    updateProcessingActivity(id: string, data: Partial<CreateProcessingActivityRequest>, options?: RequestOptions): Promise<ApiResponse<ProcessingActivity>>;
}

/**
 * Orchestrator Service Module
 *
 * Workflow orchestration: create, execute, track.
 *
 * Routes:
 *   POST /workflows                → create workflow
 *   POST /workflows/{id}/execute   → execute workflow
 *   GET  /executions/{id}          → get execution status
 */

interface Workflow {
    id: string;
    name: string;
    steps: unknown[];
    created_at: string;
    updated_at: string;
}
interface WorkflowExecution {
    id: string;
    workflow_id: string;
    status: string;
    input?: unknown;
    output?: unknown;
    started_at: string;
    completed_at?: string;
    error?: string;
}
declare class OrchestratorService extends ServiceModule {
    protected basePath: string;
    createWorkflow(data: {
        name: string;
        steps: unknown[];
    }, options?: RequestOptions): Promise<ApiResponse<Workflow>>;
    execute(workflowId: string, input?: unknown, options?: RequestOptions): Promise<ApiResponse<WorkflowExecution>>;
    getExecution(executionId: string, options?: RequestOptions): Promise<ApiResponse<WorkflowExecution>>;
    /** @deprecated Use execute() instead */
    executeWorkflow(workflowId: string, input?: unknown): Promise<ApiResponse<WorkflowExecution>>;
}

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

interface Client {
    id: string;
    name: string;
    email: string;
    created_at: string;
}
interface Application {
    id: string;
    name: string;
    description?: string;
    api_key?: string;
    created_at: string;
}
declare class AccountsService extends ServiceModule {
    protected basePath: string;
    createClient(data: {
        name: string;
        email: string;
    }, options?: RequestOptions): Promise<ApiResponse<Client>>;
    getClients(options?: RequestOptions): Promise<ApiResponse<Client[]>>;
    createApplication(data: {
        name: string;
        description?: string;
    }, options?: RequestOptions): Promise<ApiResponse<Application>>;
    getApplications(options?: RequestOptions): Promise<ApiResponse<Application[]>>;
}

/**
 * Identity Service Module
 *
 * API key management.
 *
 * Routes:
 *   POST   /api-keys      → create API key
 *   GET    /api-keys       → list API keys
 *   DELETE /api-keys/{id}  → revoke API key
 */

interface ApiKey {
    id: string;
    name: string;
    key?: string;
    prefix: string;
    expires_at?: string;
    last_used_at?: string;
    created_at: string;
}
declare class IdentityService extends ServiceModule {
    protected basePath: string;
    createApiKey(data: {
        name: string;
        expires_at?: string;
    }, options?: RequestOptions): Promise<ApiResponse<ApiKey>>;
    listApiKeys(options?: RequestOptions): Promise<ApiResponse<ApiKey[]>>;
    revokeApiKey(id: string, options?: RequestOptions): Promise<ApiResponse<{
        revoked: boolean;
    }>>;
}

/**
 * Catalog Service Module
 *
 * Service catalog and health checks.
 *
 * Routes:
 *   GET /services              → list services
 *   GET /services/{name}/health → service health check
 */

interface CatalogEntry {
    name: string;
    version: string;
    status: string;
    port: number;
    description?: string;
}
interface ServiceHealth {
    status: string;
    uptime_seconds?: number;
    checks?: Record<string, {
        status: string;
        message?: string;
    }>;
}
declare class CatalogService extends ServiceModule {
    protected basePath: string;
    listServices(options?: RequestOptions): Promise<ApiResponse<CatalogEntry[]>>;
    getServiceHealth(name: string, options?: RequestOptions): Promise<ApiResponse<ServiceHealth>>;
}

/**
 * Logger Service Module
 *
 * Centralized logging: write and query logs.
 *
 * Routes:
 *   POST /logs        → write log entry
 *   POST /logs/batch  → write log entries in batch (max 100 per call, auto-chunked)
 *   GET  /logs        → query logs (paginated)
 */

type Severity = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
/** Input for creating a log entry. Matches backend schema. */
interface LogInput {
    /** Service name (required — maps to backend service_name) */
    service: string;
    /** Log severity (required) */
    severity: Severity;
    /** Log message (required) */
    message: string;
    /** Arbitrary JSON metadata */
    metadata?: Record<string, unknown>;
    /** Distributed tracing / correlation ID */
    trace_id?: string;
    span_id?: string;
    parent_span_id?: string;
    /** ISO 8601 timestamp, defaults to now on backend */
    timestamp?: string;
}
/** Legacy input shape for backward compatibility */
interface LegacyLogInput {
    level: string;
    message: string;
    metadata?: Record<string, unknown>;
}
/** Log record as returned by the backend query endpoint */
interface LogRecord {
    id: string;
    service_name: string;
    severity: string;
    message: string;
    metadata?: Record<string, unknown>;
    trace_id?: string;
    span_id?: string;
    parent_span_id?: string;
    timestamp: string;
}
/** Paginated query response from GET /logs */
interface LogQueryResponse {
    logs: LogRecord[];
    total: number;
    page: number;
    limit: number;
}
/** Query parameters for filtering logs */
interface LogQueryParams {
    service?: string;
    severity?: Severity;
    search?: string;
    trace_id?: string;
    start_time?: string;
    end_time?: string;
    page?: number;
    limit?: number;
}
/** @deprecated Use LogRecord instead */
interface LogEntry {
    id: string;
    level: string;
    message: string;
    service?: string;
    metadata?: Record<string, unknown>;
    timestamp: string;
}
declare class LoggerService extends ServiceModule {
    protected basePath: string;
    /**
     * Write a single log entry.
     * Accepts both new schema (LogInput) and legacy shape ({ level, message }) for backward compatibility.
     */
    log(data: LogInput | LegacyLogInput, options?: RequestOptions): Promise<ApiResponse<void>>;
    /**
     * Write log entries in batch.
     * Auto-chunks into groups of 100 (backend hard limit) and sends sequentially.
     * Returns total ingested count across all chunks.
     */
    logBatch(logs: LogInput[], options?: RequestOptions): Promise<ApiResponse<{
        ingested: number;
    }>>;
    /**
     * Query logs with filters. Returns paginated response.
     */
    queryLogs(filters?: LogQueryParams, requestOptions?: RequestOptions): Promise<ApiResponse<LogQueryResponse>>;
    debug(service: string, message: string, meta?: Record<string, unknown>, options?: RequestOptions): Promise<ApiResponse<void>>;
    info(service: string, message: string, meta?: Record<string, unknown>, options?: RequestOptions): Promise<ApiResponse<void>>;
    warn(service: string, message: string, meta?: Record<string, unknown>, options?: RequestOptions): Promise<ApiResponse<void>>;
    error(service: string, message: string, meta?: Record<string, unknown>, options?: RequestOptions): Promise<ApiResponse<void>>;
    /** Normalize legacy { level, message } to { severity, service, message } */
    private normalizeLogInput;
}

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

interface ContentFlag {
    id: string;
    content_type: string;
    content_id: string;
    category: string;
    subcategory?: string;
    status: string;
    description?: string;
    created_at: string;
}
interface FlagCheck {
    flagged: boolean;
    flags?: ContentFlag[];
}
interface Appeal {
    id: string;
    flag_id: string;
    reason: string;
    status: string;
    created_at: string;
    resolved_at?: string;
}
declare class FlagContentService extends ServiceModule {
    protected basePath: string;
    createFlag(data: {
        content_type: string;
        content_id: string;
        content_url?: string;
        category: string;
        subcategory?: string;
        description?: string;
        reporter_id?: string;
        reporter_email?: string;
        is_anonymous?: boolean;
    }, options?: RequestOptions): Promise<ApiResponse<ContentFlag>>;
    checkFlag(params: {
        content_type: string;
        content_id: string;
    }, requestOptions?: RequestOptions): Promise<ApiResponse<FlagCheck>>;
    getFlag(id: string, options?: RequestOptions): Promise<ApiResponse<ContentFlag>>;
    submitAppeal(data: {
        flag_id: string;
        reason: string;
    }, options?: RequestOptions): Promise<ApiResponse<Appeal>>;
    getAppeal(id: string, options?: RequestOptions): Promise<ApiResponse<Appeal>>;
}

interface AuthRegisterAgentRequest {
    name: string;
    agent_platform: string;
    agent_identifier?: string;
    description?: string;
    email?: string;
    phone?: string;
    owner_contact_email?: string;
    capabilities?: string[];
    model_name?: string;
    model_version?: string;
    model_provider?: string;
    metadata?: Record<string, unknown>;
    public_key_pem?: string;
    ip_allowlist?: string[];
    enable_short_lived_tokens?: boolean;
}
interface SecurityLayers {
    request_signing: boolean;
    ip_binding: boolean;
    short_lived_tokens: boolean;
}
interface AuthRegisterAgentResponse {
    user_id: string;
    name: string;
    agent_token: string;
    refresh_secret?: string;
    signing_key_fingerprint?: string;
    security_layers: SecurityLayers;
}
interface AgentToken {
    id: string;
    name: string;
    scopes?: string[];
    ip_allowlist?: string[];
    expires_at?: string;
    last_used_at?: string;
    created_at: string;
}
interface AgentSigningKey {
    id: string;
    fingerprint: string;
    key_algorithm: string;
    status: string;
    last_used_at?: string;
    created_at: string;
}
interface AgentProfile {
    id: string;
    full_name: string;
    email: string;
    phone?: string;
    agent_platform?: string;
    agent_identifier?: string;
    agent_capabilities?: string;
    owner_contact_email?: string;
    agent_model_name?: string;
    agent_model_version?: string;
    agent_model_provider?: string;
    created_at: string;
}
interface AgentSecurityPolicy {
    allow_agent_registration: boolean;
    require_request_signing: boolean;
    require_ip_binding: boolean;
    require_short_lived_tokens: boolean;
    max_tokens_per_agent: number;
}
declare class AgentAuthService extends ServiceModule {
    protected basePath: string;
    registerAgent(data: AuthRegisterAgentRequest, options?: RequestOptions): Promise<ApiResponse<AuthRegisterAgentResponse>>;
    listTokens(options?: RequestOptions): Promise<ApiResponse<{
        tokens: AgentToken[];
    }>>;
    createToken(data: {
        name: string;
        scopes?: string[];
        ip_allowlist?: string[];
        expires_in_days?: number;
    }, options?: RequestOptions): Promise<ApiResponse<{
        id: string;
        token: string;
        name: string;
        expires_at?: string;
    }>>;
    revokeToken(id: string, options?: RequestOptions): Promise<ApiResponse<{
        message: string;
    }>>;
    rotateToken(id: string, options?: RequestOptions): Promise<ApiResponse<{
        new_token: string;
        old_token_grace_expires_at: string;
    }>>;
    exchangeToken(data: {
        refresh_secret: string;
        ttl_minutes?: number;
    }, options?: RequestOptions): Promise<ApiResponse<{
        access_token: string;
        expires_in: number;
    }>>;
    listSigningKeys(options?: RequestOptions): Promise<ApiResponse<{
        keys: AgentSigningKey[];
    }>>;
    addSigningKey(data: {
        public_key_pem: string;
    }, options?: RequestOptions): Promise<ApiResponse<{
        id: string;
        fingerprint: string;
    }>>;
    revokeSigningKey(id: string, options?: RequestOptions): Promise<ApiResponse<{
        message: string;
    }>>;
    getProfile(options?: RequestOptions): Promise<ApiResponse<AgentProfile>>;
    updateProfile(data: Partial<{
        model_name: string;
        model_version: string;
        model_provider: string;
        capabilities: string[];
        owner_contact_email: string;
    }>, options?: RequestOptions): Promise<ApiResponse<{
        message: string;
    }>>;
    getSecurityPolicy(appId: string, options?: RequestOptions): Promise<ApiResponse<AgentSecurityPolicy>>;
    updateSecurityPolicy(appId: string, data: Partial<AgentSecurityPolicy>, options?: RequestOptions): Promise<ApiResponse<AgentSecurityPolicy>>;
}

interface AgentResponse {
    id: string;
    auth_user_id?: string;
    name: string;
    agent_type: string;
    description?: string;
    status: string;
    default_workspace_id?: string;
    metadata?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}
interface RegisterAgentRequest {
    name: string;
    agent_type?: string;
    description?: string;
    metadata?: Record<string, unknown>;
    project_ids?: string[];
    agent_platform?: string;
    agent_identifier?: string;
    owner_contact_email?: string;
    capabilities?: string[];
    model_name?: string;
    model_version?: string;
    model_provider?: string;
    public_key_pem?: string;
    ip_allowlist?: string[];
    enable_short_lived_tokens?: boolean;
}
interface RegisterAgentResponse {
    agent_id: string;
    agent_token: string;
    refresh_secret?: string;
    signing_key_fingerprint?: string;
    security_layers: SecurityLayers;
    warnings?: string[];
}
interface RuntimeTemplate {
    id: string;
    name: string;
    description?: string;
    runtime_kind: string;
    status: string;
    created_at: string;
    updated_at: string;
}
interface RuntimeTemplateVersion {
    id: string;
    template_id: string;
    version_number: number;
    config: Record<string, unknown>;
    changelog?: string;
    effective_from: string;
    effective_to?: string;
    created_at: string;
}
interface Workspace {
    id: string;
    agent_id?: string;
    template_version_id: string;
    name: string;
    description?: string;
    status: string;
    config_overrides?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}
declare class AgentsService extends ServiceModule {
    protected basePath: string;
    registerAgent(data: RegisterAgentRequest, options?: RequestOptions): Promise<ApiResponse<RegisterAgentResponse>>;
    deactivateAgent(id: string, options?: RequestOptions): Promise<ApiResponse<{
        message: string;
    }>>;
    create(data: {
        name: string;
        agent_type?: string;
        description?: string;
        metadata?: Record<string, unknown>;
    }, options?: RequestOptions): Promise<ApiResponse<AgentResponse>>;
    list(params?: PaginationParams & {
        application_id?: string;
    }, options?: RequestOptions): Promise<PaginatedResponse<AgentResponse>>;
    get(id: string, options?: RequestOptions): Promise<ApiResponse<AgentResponse>>;
    update(id: string, data: Partial<{
        name: string;
        agent_type: string;
        description: string;
        status: string;
        metadata: Record<string, unknown>;
    }>, options?: RequestOptions): Promise<ApiResponse<AgentResponse>>;
    remove(id: string, options?: RequestOptions): Promise<ApiResponse<void>>;
    setDefaultWorkspace(id: string, data: {
        workspace_id: string;
    }, options?: RequestOptions): Promise<ApiResponse<AgentResponse>>;
    createTemplate(data: {
        name: string;
        description?: string;
        runtime_kind: string;
    }, options?: RequestOptions): Promise<ApiResponse<RuntimeTemplate>>;
    listTemplates(params?: PaginationParams & {
        application_id?: string;
    }, options?: RequestOptions): Promise<PaginatedResponse<RuntimeTemplate>>;
    getTemplate(id: string, options?: RequestOptions): Promise<ApiResponse<{
        template: RuntimeTemplate;
        versions: RuntimeTemplateVersion[];
    }>>;
    createTemplateVersion(id: string, data: {
        config: Record<string, unknown>;
        changelog?: string;
    }, options?: RequestOptions): Promise<ApiResponse<RuntimeTemplateVersion>>;
    listTemplateVersions(id: string, options?: RequestOptions): Promise<ApiResponse<RuntimeTemplateVersion[]>>;
    createWorkspace(data: {
        template_version_id: string;
        name: string;
        description?: string;
        agent_id?: string;
        config_overrides?: Record<string, unknown>;
    }, options?: RequestOptions): Promise<ApiResponse<Workspace>>;
    listWorkspaces(params?: PaginationParams & {
        application_id?: string;
    }, options?: RequestOptions): Promise<PaginatedResponse<Workspace>>;
    getWorkspace(id: string, options?: RequestOptions): Promise<ApiResponse<Workspace>>;
    updateWorkspace(id: string, data: Partial<{
        name: string;
        description: string;
        status: string;
        config_overrides: Record<string, unknown>;
    }>, options?: RequestOptions): Promise<ApiResponse<Workspace>>;
    addOsAccount(workspaceId: string, data: {
        username: string;
        auth_type: string;
        secret_ref: string;
    }, options?: RequestOptions): Promise<ApiResponse<{
        id: string;
        workspace_id: string;
        username: string;
        auth_type: string;
    }>>;
}

interface Project {
    id: string;
    name: string;
    description?: string;
    status: string;
    owner_user_id?: string;
    metadata?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}
interface ProjectMember {
    id: string;
    project_id: string;
    user_id: string;
    role: string;
    created_at: string;
    /** Populated when ?hydrate=true */
    full_name?: string;
    /** Populated when ?hydrate=true */
    email?: string;
    /** Populated when ?hydrate=true */
    avatar_url?: string;
}
interface Task {
    id: string;
    project_id: string;
    title: string;
    description?: string;
    status: string;
    priority?: string;
    due_date?: string;
    assigned_agent_id?: string;
    metadata?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}
interface ClaimResult {
    task_id: string;
    agent_id: string;
    attempt_number: number;
    lease_expires_at: string;
}
interface SubmitResult {
    task_id: string;
    idempotent?: boolean;
}
interface TaskTransition {
    id: string;
    task_id: string;
    from_state?: string;
    to_state: string;
    actor_id?: string;
    actor_type: string;
    reason?: string;
    metadata?: Record<string, unknown>;
    created_at: string;
}
interface TaskAttempt {
    id: string;
    task_id: string;
    attempt_number: number;
    agent_id?: string;
    status: string;
    lease_expires_at?: string;
    started_at: string;
    ended_at?: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    error_message?: string;
    metadata?: Record<string, unknown>;
}
interface ProjectDocument {
    id: string;
    project_id: string;
    title: string;
    content?: string;
    created_at: string;
}
interface Pipeline {
    id: string;
    project_id: string;
    name: string;
    status: string;
    created_at: string;
}
interface PipelineVersion {
    id: string;
    pipeline_id: string;
    version_number: number;
    config: Record<string, unknown>;
    created_at: string;
}
interface ProjectGrant {
    id: string;
    project_id: string;
    role: string;
    user_email: string;
    status: 'pending' | 'redeemed' | 'revoked' | 'expired';
    created_by: string;
    created_at: string;
    expires_at: string;
    redeemed_at?: string;
    email_sent?: boolean;
    container_invitation_id?: string;
    /** @deprecated Use container_invitation_id */
    team_invitation_id?: string;
}
interface GrantInfo {
    id: string;
    project_name: string;
    role: string;
    email_hint: string;
    status: string;
    expires_at: string;
}
interface RedeemResult {
    project_id: string;
    role: string;
    already_member: boolean;
}
declare class AgentProjectsService extends ServiceModule {
    protected basePath: string;
    private withAppId;
    createProject(data: {
        name: string;
        description?: string;
        metadata?: Record<string, unknown>;
    }, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<Project>>;
    listProjects(params?: PaginationParams & {
        application_id?: string;
        team_id?: string;
    }, options?: RequestOptions): Promise<PaginatedResponse<Project>>;
    getProject(id: string, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<Project>>;
    updateProject(id: string, data: Partial<{
        name: string;
        description: string;
        status: string;
        metadata: Record<string, unknown>;
    }>, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<Project>>;
    addMember(projectId: string, data: {
        user_id: string;
        role: string;
    }, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<ProjectMember>>;
    listMembers(projectId: string, params?: {
        application_id?: string;
        hydrate?: boolean;
    }, options?: RequestOptions): Promise<ApiResponse<ProjectMember[]>>;
    updateMember(projectId: string, userId: string, data: {
        role: string;
    }, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<ProjectMember>>;
    removeMember(projectId: string, userId: string, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<void>>;
    createTask(projectId: string, data: {
        title: string;
        description?: string;
        priority?: string;
        due_date?: string;
        metadata?: Record<string, unknown>;
    }, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<Task>>;
    listTasks(projectId: string, params?: PaginationParams & {
        application_id?: string;
        status?: string;
        priority?: string;
        agent_id?: string;
    }, options?: RequestOptions): Promise<PaginatedResponse<Task>>;
    getTask(id: string, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<Task>>;
    updateTask(id: string, data: Partial<{
        title: string;
        description: string;
        status: string;
        priority: string;
        due_date: string;
        actual_hours: number;
        metadata: Record<string, unknown>;
    }>, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<Task>>;
    claimNext(agentId: string, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<ClaimResult | null>>;
    claim(taskId: string, agentId: string, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<ClaimResult>>;
    heartbeat(taskId: string, agentId: string, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<{
        lease_expires_at: string;
    }>>;
    submit(taskId: string, data: {
        agent_id: string;
        idempotency_key: string;
        output?: Record<string, unknown>;
        input_tokens?: number;
        output_tokens?: number;
        cost_usd?: number;
        notes?: string;
    }, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<SubmitResult>>;
    block(taskId: string, data: {
        agent_id: string;
        reason: string;
        question?: string;
    }, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<Task>>;
    assignAgent(taskId: string, data: {
        agent_id: string;
    }, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<{
        task_id: string;
        agent_id: string;
    }>>;
    unassignAgent(taskId: string, agentId: string, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<void>>;
    listAttempts(taskId: string, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<TaskAttempt[]>>;
    listTransitions(taskId: string, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<TaskTransition[]>>;
    createDocument(projectId: string, data: {
        title: string;
        content?: string;
    }, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<ProjectDocument>>;
    listDocuments(projectId: string, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<ProjectDocument[]>>;
    deleteDocument(documentId: string, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<void>>;
    createPipeline(projectId: string, data: {
        name: string;
    }, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<Pipeline>>;
    listPipelines(projectId: string, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<Pipeline[]>>;
    createPipelineVersion(pipelineId: string, data: {
        config: Record<string, unknown>;
    }, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<PipelineVersion>>;
    listPipelineVersions(pipelineId: string, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<PipelineVersion[]>>;
    createGrant(data: {
        project_id: string;
        role: string;
        user_email: string;
        expires_at: string;
        invite_url?: string;
        container_invitation_id?: string;
        container_id?: string;
        /** @deprecated Use container_invitation_id */
        team_invitation_id?: string;
        /** @deprecated Use container_id */
        team_id?: string;
    }, options?: RequestOptions): Promise<ApiResponse<ProjectGrant>>;
    listGrants(projectId: string, options?: RequestOptions): Promise<ApiResponse<ProjectGrant[]>>;
    getGrant(id: string, options?: RequestOptions): Promise<ApiResponse<ProjectGrant>>;
    /** Public endpoint — no auth required. Returns masked email + project name. */
    getGrantInfo(id: string, options?: RequestOptions): Promise<ApiResponse<GrantInfo>>;
    revokeGrant(id: string, options?: RequestOptions): Promise<ApiResponse<void>>;
    resendGrantInvitation(id: string, data: {
        invite_url: string;
    }, options?: RequestOptions): Promise<ApiResponse<{
        email_sent: boolean;
    }>>;
    redeemGrant(id: string, options?: RequestOptions): Promise<ApiResponse<RedeemResult>>;
}

interface Tool {
    id: string;
    name: string;
    description?: string;
    tool_type: string;
    status: string;
    config?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}
interface ToolCapability {
    id: string;
    tool_id: string;
    name: string;
    description?: string;
    created_at: string;
}
interface ToolIntegration {
    id: string;
    name: string;
    tool_id: string;
    status: string;
    config?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}
interface Credential {
    id: string;
    name: string;
    credential_type: string;
    status: string;
    created_at: string;
    updated_at: string;
}
interface CredentialScope {
    id: string;
    credential_id: string;
    scope: string;
    created_at: string;
}
interface AgentToolEntitlement {
    id: string;
    agent_id: string;
    tool_id: string;
    status: string;
    created_at: string;
}
interface DataSource {
    id: string;
    name: string;
    source_type: string;
    status: string;
    config?: Record<string, unknown>;
    created_at: string;
}
interface DataAccessPolicy {
    id: string;
    data_source_id: string;
    agent_id?: string;
    policy_type: string;
    created_at: string;
}
declare class AgentToolsService extends ServiceModule {
    protected basePath: string;
    createTool(data: {
        name: string;
        description?: string;
        tool_type: string;
        config?: Record<string, unknown>;
    }, options?: RequestOptions): Promise<ApiResponse<Tool>>;
    listTools(params?: PaginationParams & {
        application_id?: string;
    }, options?: RequestOptions): Promise<PaginatedResponse<Tool>>;
    getTool(id: string, options?: RequestOptions): Promise<ApiResponse<Tool>>;
    createCapability(toolId: string, data: {
        name: string;
        description?: string;
    }, options?: RequestOptions): Promise<ApiResponse<ToolCapability>>;
    listCapabilities(toolId: string, options?: RequestOptions): Promise<ApiResponse<ToolCapability[]>>;
    createIntegration(data: {
        name: string;
        tool_id: string;
        config?: Record<string, unknown>;
    }, options?: RequestOptions): Promise<ApiResponse<ToolIntegration>>;
    listIntegrations(params?: PaginationParams & {
        application_id?: string;
    }, options?: RequestOptions): Promise<PaginatedResponse<ToolIntegration>>;
    updateIntegration(id: string, data: Partial<{
        name: string;
        status: string;
        config: Record<string, unknown>;
    }>, options?: RequestOptions): Promise<ApiResponse<ToolIntegration>>;
    createCredential(data: {
        name: string;
        credential_type: string;
        secret: string;
    }, options?: RequestOptions): Promise<ApiResponse<Credential>>;
    listCredentials(params?: PaginationParams & {
        application_id?: string;
    }, options?: RequestOptions): Promise<PaginatedResponse<Credential>>;
    updateCredential(id: string, data: Partial<{
        name: string;
        status: string;
    }>, options?: RequestOptions): Promise<ApiResponse<Credential>>;
    createScope(credentialId: string, data: {
        scope: string;
    }, options?: RequestOptions): Promise<ApiResponse<CredentialScope>>;
    listScopes(credentialId: string, options?: RequestOptions): Promise<ApiResponse<CredentialScope[]>>;
    grantEntitlement(data: {
        agent_id: string;
        tool_id: string;
    }, options?: RequestOptions): Promise<ApiResponse<AgentToolEntitlement>>;
    listEntitlements(params?: PaginationParams & {
        application_id?: string;
    }, options?: RequestOptions): Promise<PaginatedResponse<AgentToolEntitlement>>;
    revokeEntitlement(id: string, options?: RequestOptions): Promise<ApiResponse<void>>;
    authorizeAction(data: {
        agent_id: string;
        tool_id: string;
        action: string;
    }, options?: RequestOptions): Promise<ApiResponse<{
        authorized: boolean;
    }>>;
    createDataSource(data: {
        name: string;
        source_type: string;
        config?: Record<string, unknown>;
    }, options?: RequestOptions): Promise<ApiResponse<DataSource>>;
    listDataSources(params?: PaginationParams & {
        application_id?: string;
    }, options?: RequestOptions): Promise<PaginatedResponse<DataSource>>;
    createDataAccessPolicy(data: {
        data_source_id: string;
        agent_id?: string;
        policy_type: string;
    }, options?: RequestOptions): Promise<ApiResponse<DataAccessPolicy>>;
    listDataAccessPolicies(params?: PaginationParams & {
        application_id?: string;
    }, options?: RequestOptions): Promise<PaginatedResponse<DataAccessPolicy>>;
}

interface ModelProvider {
    id: string;
    name: string;
    description?: string;
    status: string;
    created_at: string;
}
interface Model {
    id: string;
    provider_id: string;
    name: string;
    description?: string;
    model_type: string;
    status: string;
    capabilities?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}
interface ModelPricing {
    id: string;
    model_id: string;
    pricing_type: string;
    input_cost_per_token?: number;
    output_cost_per_token?: number;
    effective_from: string;
    effective_to?: string;
    created_at: string;
}
interface ModelEntitlement {
    id: string;
    agent_id?: string;
    model_id: string;
    status: string;
    created_at: string;
}
interface UsageRecord {
    id: string;
    model_id: string;
    agent_id?: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    created_at: string;
}
interface UsageSummary {
    model_id: string;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost_usd: number;
    request_count: number;
}
interface CostReportDay {
    date: string;
    model_id: string;
    total_cost_usd: number;
    request_count: number;
}
declare class AgentModelsService extends ServiceModule {
    protected basePath: string;
    createProvider(data: {
        name: string;
        description?: string;
    }, options?: RequestOptions): Promise<ApiResponse<ModelProvider>>;
    listProviders(params?: PaginationParams & {
        application_id?: string;
    }, options?: RequestOptions): Promise<PaginatedResponse<ModelProvider>>;
    createModel(data: {
        provider_id: string;
        name: string;
        description?: string;
        model_type: string;
        capabilities?: Record<string, unknown>;
    }, options?: RequestOptions): Promise<ApiResponse<Model>>;
    listModels(params?: PaginationParams & {
        application_id?: string;
        provider_id?: string;
    }, options?: RequestOptions): Promise<PaginatedResponse<Model>>;
    getModel(id: string, options?: RequestOptions): Promise<ApiResponse<Model>>;
    createPricing(modelId: string, data: {
        pricing_type: string;
        input_cost_per_token?: number;
        output_cost_per_token?: number;
    }, options?: RequestOptions): Promise<ApiResponse<ModelPricing>>;
    listPricing(modelId: string, options?: RequestOptions): Promise<ApiResponse<ModelPricing[]>>;
    createEntitlement(data: {
        agent_id?: string;
        model_id: string;
    }, options?: RequestOptions): Promise<ApiResponse<ModelEntitlement>>;
    listEntitlements(params?: PaginationParams & {
        application_id?: string;
    }, options?: RequestOptions): Promise<PaginatedResponse<ModelEntitlement>>;
    deleteEntitlement(id: string, options?: RequestOptions): Promise<ApiResponse<void>>;
    recordUsage(data: {
        model_id: string;
        agent_id?: string;
        input_tokens: number;
        output_tokens: number;
        cost_usd?: number;
    }, options?: RequestOptions): Promise<ApiResponse<UsageRecord>>;
    listUsage(params?: PaginationParams & {
        application_id?: string;
        model_id?: string;
        agent_id?: string;
    }, options?: RequestOptions): Promise<PaginatedResponse<UsageRecord>>;
    getUsageSummary(params?: {
        application_id?: string;
    }, options?: RequestOptions): Promise<ApiResponse<UsageSummary[]>>;
    getCostReport(params?: {
        application_id?: string;
        days?: number;
    }, options?: RequestOptions): Promise<ApiResponse<CostReportDay[]>>;
}

interface Session {
    id: string;
    agent_id: string;
    workspace_id: string;
    project_id?: string;
    task_id?: string;
    status: string;
    runtime_kind: string;
    metadata?: Record<string, unknown>;
    started_at?: string;
    ended_at?: string;
    exit_code?: number;
    error_message?: string;
    created_at: string;
    updated_at: string;
}
interface CreateSessionResponse {
    session: Session;
    session_token: string;
}
interface SessionLog {
    id: string;
    session_id: string;
    sequence_num: number;
    log_level: string;
    chunk_path: string;
    byte_size: number;
    line_count: number;
    created_at: string;
}
interface SessionArtifact {
    id: string;
    session_id: string;
    artifact_type: string;
    name: string;
    storage_path: string;
    content_type?: string;
    size_bytes?: number;
    metadata?: Record<string, unknown>;
    created_at: string;
}
declare class AgentSessionsService extends ServiceModule {
    protected basePath: string;
    createSession(data: {
        agent_id: string;
        workspace_id: string;
        runtime_kind: string;
        project_id?: string;
        task_id?: string;
        metadata?: Record<string, unknown>;
    }, options?: RequestOptions): Promise<ApiResponse<CreateSessionResponse>>;
    listSessions(params?: PaginationParams & {
        application_id?: string;
        agent_id?: string;
        status?: string;
        project_id?: string;
    }, options?: RequestOptions): Promise<PaginatedResponse<Session>>;
    getSession(id: string, options?: RequestOptions): Promise<ApiResponse<Session>>;
    startSession(id: string, options?: RequestOptions): Promise<ApiResponse<Session>>;
    endSession(id: string, data: {
        status: 'ended' | 'failed';
        exit_code?: number;
        error_message?: string;
    }, options?: RequestOptions): Promise<ApiResponse<Session>>;
    appendLog(sessionId: string, data: {
        log_level: string;
        chunk_path: string;
        byte_size: number;
        line_count: number;
    }, options?: RequestOptions): Promise<ApiResponse<SessionLog>>;
    listLogs(sessionId: string, options?: RequestOptions): Promise<ApiResponse<SessionLog[]>>;
    addArtifact(sessionId: string, data: {
        artifact_type: string;
        name: string;
        storage_path: string;
        content_type?: string;
        size_bytes?: number;
        metadata?: Record<string, unknown>;
    }, options?: RequestOptions): Promise<ApiResponse<SessionArtifact>>;
    listArtifacts(sessionId: string, options?: RequestOptions): Promise<ApiResponse<SessionArtifact[]>>;
}

/**
 * ScaleMule SDK for TypeScript/JavaScript
 *
 * Official SDK for ScaleMule Backend-as-a-Service (v2)
 *
 * All methods return { data, error } — never throws on API errors.
 * List methods return { data[], metadata, error } with standardized pagination.
 *
 * @packageDocumentation
 */

/**
 * Main entry point for the ScaleMule SDK.
 *
 * @example
 * ```typescript
 * import { ScaleMule } from '@scalemule/sdk'
 *
 * const sm = new ScaleMule({ apiKey: 'pk_live_...' })
 * await sm.initialize()
 *
 * // Auth
 * const { data, error } = await sm.auth.signInWithOtp({ email: 'user@example.com' })
 *
 * // Data
 * const { data: doc } = await sm.data.create('todos', { title: 'Ship SDK', done: false })
 * const { data: todos } = await sm.data.query('todos', {
 *   filters: [{ operator: 'eq', field: 'done', value: false }],
 * })
 *
 * // Storage
 * const { data: file } = await sm.storage.upload(blob, { onProgress: (p) => {} })
 * const { data: url } = await sm.storage.getViewUrl(file.id)
 *
 * // Realtime
 * const unsub = sm.realtime.subscribe('chat:room-1', (msg) => console.log(msg))
 *
 * // All methods return { data, error } — never throws
 * if (error) console.error(error.code, error.message)
 * ```
 */
declare class ScaleMule {
    private readonly _client;
    readonly auth: AuthService;
    readonly storage: StorageService;
    readonly realtime: RealtimeService;
    readonly video: VideoService;
    readonly data: DataService;
    readonly chat: ChatService;
    readonly social: SocialService;
    readonly billing: BillingService;
    readonly analytics: AnalyticsService;
    readonly flags: FlagsService;
    readonly communication: CommunicationService;
    readonly scheduler: SchedulerService;
    readonly permissions: PermissionsService;
    readonly workspaces: WorkspacesService;
    /** @deprecated Use `workspaces` instead */
    get teams(): WorkspacesService;
    readonly accounts: AccountsService;
    readonly identity: IdentityService;
    readonly catalog: CatalogService;
    readonly cache: CacheService;
    readonly queue: QueueService;
    readonly search: SearchService;
    readonly logger: LoggerService;
    readonly webhooks: WebhooksService;
    readonly leaderboard: LeaderboardService;
    readonly listings: ListingsService;
    readonly events: EventsService;
    readonly graph: GraphService;
    readonly functions: FunctionsService;
    readonly photo: PhotoService;
    readonly flagContent: FlagContentService;
    readonly compliance: ComplianceService;
    readonly orchestrator: OrchestratorService;
    readonly agentAuth: AgentAuthService;
    readonly agents: AgentsService;
    readonly agentProjects: AgentProjectsService;
    readonly agentTools: AgentToolsService;
    readonly agentModels: AgentModelsService;
    readonly agentSessions: AgentSessionsService;
    constructor(config: ScaleMuleConfig);
    /**
     * Initialize the client — loads persisted session from storage.
     * Call this once after construction, before making authenticated requests.
     */
    initialize(): Promise<void>;
    /**
     * Set authentication session (token + userId).
     * Persisted to storage for cross-session continuity.
     */
    setSession(token: string, userId: string): Promise<void>;
    /** Clear the current session and remove from storage. */
    clearSession(): Promise<void>;
    /** Set access token (in-memory only, not persisted). */
    setAccessToken(token: string): void;
    /** Clear access token. */
    clearAccessToken(): void;
    /** Current session token, or null. */
    getSessionToken(): string | null;
    /** Current user ID, or null. */
    getUserId(): string | null;
    /** Whether a session token is set. */
    isAuthenticated(): boolean;
    /** The base URL being used for API requests. */
    getBaseUrl(): string;
    /** Set the active workspace context. All subsequent requests include this as x-sm-workspace-id. */
    setWorkspaceContext(id: string | null): void;
    /** Get the current workspace ID, or null. */
    getWorkspaceId(): string | null;
    /** Access the underlying ScaleMuleClient for advanced usage. */
    getClient(): ScaleMuleClient;
}

export { type AccountBalance, AccountsService, type ActiveUsers, type ActivityItem, AgentAuthService, AgentModelsService, type AgentProfile, AgentProjectsService, type AgentResponse, type AgentSecurityPolicy, AgentSessionsService, type AgentSigningKey, type AgentToken, type AgentToolEntitlement, AgentToolsService, type Workspace as AgentWorkspace, AgentsService, type AggregateOptions, type AggregateResult, type AnalyticsEvent, AnalyticsService, type ApiError, type ApiKey, type ApiResponse, type Appeal, type Application, type Attachment, type Attendee, type AuditLog, type AuthRegisterAgentRequest, type AuthRegisterAgentResponse, AuthService, type AuthSession, type AuthUser, type BackupCodes, BillingService, type CacheEntry, CacheService, type CalendarEvent, type CatalogEntry, CatalogService, type ChatMessage, type ChatReaction, ChatService, type ClaimResult, type Client, type ClientContext, type Collection, type Comment, CommunicationService, type CompletedPart, ComplianceService, type CompressionConfig, type ConnectedAccount, type ConnectedAccountSubscription, type ConnectedSetupIntentResponse, type ConnectedSubscriptionListParams, type ConnectionStatus, type ContentFlag, type Conversation, type CostReportDay, type CreateFlagRequest, type CreateRuleRequest, type CreateSegmentRequest, type CreateSessionResponse, type CreateVariantRequest, type Credential, type CredentialScope, type Customer, type DataAccessPolicy, type DataExport, DataService, type DataSource, type DeadLetterJob, type DeviceInfo, type Document, type ErrorCode, ErrorCodes, type EventAggregation, EventsService, type FileInfo, type FlagAuditEntry, type FlagCheck, type FlagCondition, FlagContentService, type FlagDefinition, type FlagDetail, type FlagEnvironment, type FlagEvaluation, type FlagSegment, type FlagVariant, FlagsService, type FollowStatus, type FunctionExecution, type FunctionMetrics, FunctionsService, type Funnel, type FunnelConversion, type GdprRequest, type GrantInfo, type GraphEdge, type GraphNode, GraphService, IdentityService, type IdentityType, type IncomingRequestLike, type Invoice, type JobExecution, type JobStats, type Leaderboard, type LeaderboardEntry, LeaderboardService, type Like, type Listing, ListingsService, type LogEntry, type LogInput, type LogQueryParams, type LogQueryResponse, type LogRecord, LoggerService, type LoginActivitySummary, type LoginDeviceInfo, type LoginHistoryEntry, type LoginRiskInfo, type MessageCallback, type MessageStatus, type MetricDataPoint, type MfaStatus, type Model, type ModelEntitlement, type ModelPricing, type ModelProvider, type UsageSummary as ModelUsageSummary, type MultipartCompleteResponse, type MultipartConfig, type MultipartPartUrl, type MultipartPartUrlsResponse, type MultipartStartResponse, type NetworkClass, type OAuthProvider, type OAuthUrl, OrchestratorService, PHOTO_BREAKPOINTS, type PaginatedResponse, type PaginationMetadata, type PaginationParams, type PartResult, type PartUrl, type Participant, type Payment, type PaymentListParams, type PaymentMethod, type PaymentStatusResponse, type Payout, type PayoutSchedule, type PermissionCheck, type PermissionMatrix, PermissionsService, type PhotoInfo, PhotoService, type Pipeline, type PipelineVersion, type Policy, type PresenceCallback, type PresenceEvent, type PresignedUploadResponse, type Price, type Product, type Project, type ProjectDocument, type ProjectGrant, type ProjectMember, type PushToken, type QueryFilter, type QueryOptions, type QuerySort, type QueueJob, QueueService, type ReadStatus, RealtimeService, type RedeemResult, type Refund, type RegisterAgentRequest, type RegisterAgentResponse, type RequestOptions, type ResumeSession, type Role, type RuntimeTemplate, type RuntimeTemplateVersion, type S3MultipartOptions, type S3MultipartResult, type S3SingleUploadOptions, type S3SingleUploadResult, type S3UploadProgress, ScaleMule, ScaleMuleClient, type ScaleMuleConfig, type SchedulerJob, SchedulerService, type SearchResult, SearchService, type SecurityLayers, type ServerlessFunction, type ServiceHealth, ServiceModule, type Session, type SessionArtifact, type SessionInfo, type SessionLog, type Severity, type ShortestPathResult, type SignedUrlResponse, type SocialPost, SocialService, type SocialUser, type SsoConfig, type StatusCallback, type StorageAdapter, StorageService, type StrategyResult, type SubmitResult, type Subscription, type TargetingRule, type Task, type TaskAttempt, type TaskTransition, type Team, type TeamInvitation, type TeamMember, TeamsService, type TelemetryPayload, type Tool, type ToolCapability, type ToolIntegration, type TopEvent, type TotpSetup, type Transaction, type TransactionListParams, type TransactionSummary, type TransactionSummaryParams, type Transfer, type TransformOptions, type TransformResult, type TraversalResult, type UpdateFlagRequest, type UpdateRuleRequest, type UpdateSegmentRequest, type UpdateVariantRequest, type UploadCompleteResponse, type UploadEngineConfig, type UploadFailureReport, type UploadFailureReportResponse, type UploadOptions, type UploadPlan, UploadResumeStore, type UploadStrategy, UploadTelemetry, type UploadTelemetryConfig, type UploadTelemetryEvent, type UpsertEnvironmentRequest, type UsageRecord, type UsageSummary$1 as UsageSummary, type UserRank, type VideoInfo, VideoService, type VideoUploadOptions, type Webhook, WebhooksService, type Workflow, type WorkflowExecution, type Workspace$1 as Workspace, type WorkspaceInvitation, type WorkspaceMember, WorkspacesService, buildClientContextHeaders, calculateTotalParts, canPerform, createUploadPlan, ScaleMule as default, detectNetworkClass, extractClientContext, generateUploadSessionId, getMeasuredBandwidthMbps, getPartRange, hasMinRoleLevel, resolveStrategy, uploadMultipartToS3, uploadSingleToS3, validateIP };
