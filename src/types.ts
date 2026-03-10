/**
 * ScaleMule SDK Types
 *
 * Core type definitions for the { data, error } response contract,
 * standardized error codes, and pagination.
 */

// ============================================================================
// Response Contract
// ============================================================================

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
export type ApiResponse<T> = {
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
export type ApiError = {
  /** Machine-readable error code (e.g., 'not_found', 'rate_limited') */
  code: string;
  /** Human-readable error message */
  message: string;
  /** HTTP status code */
  status: number;
  /** Additional context (field errors, retryAfter, etc.) */
  details?: Record<string, unknown>;
};

// ============================================================================
// Pagination
// ============================================================================

/**
 * Paginated response envelope.
 * Used by all methods that return lists.
 */
export type PaginatedResponse<T> = {
  data: T[];
  metadata: PaginationMetadata;
  error: ApiError | null;
};

/**
 * Pagination metadata returned with every list response.
 */
export type PaginationMetadata = {
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
export type PaginationParams = {
  page?: number;
  perPage?: number;
};

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Standardized error codes used across all services.
 *
 * These are the machine-readable `code` values on ApiError.
 * Services may also return service-specific codes beyond these.
 */
export const ErrorCodes = {
  // Auth & access
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',

  // Resources
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',

  // Input
  VALIDATION_ERROR: 'validation_error',

  // Rate limiting & quotas
  RATE_LIMITED: 'rate_limited',
  QUOTA_EXCEEDED: 'quota_exceeded',

  // Server
  INTERNAL_ERROR: 'internal_error',

  // Network (SDK-generated, not from server)
  NETWORK_ERROR: 'network_error',
  TIMEOUT: 'timeout',
  ABORTED: 'aborted',

  // Storage-specific
  FILE_SCANNING: 'file_scanning',
  FILE_THREAT: 'file_threat',
  FILE_QUARANTINED: 'file_quarantined',

  // Upload
  UPLOAD_ERROR: 'upload_error'
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ============================================================================
// Client Configuration
// ============================================================================

/**
 * Storage adapter interface for session persistence.
 * Supports both sync (localStorage) and async (AsyncStorage) implementations.
 */
export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/**
 * Configuration for the ScaleMule client.
 */
export interface ScaleMuleConfig {
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

// ============================================================================
// Request Options
// ============================================================================

/**
 * Per-request options that override client defaults.
 */
export interface RequestOptions {
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

// ============================================================================
// Client Context
// ============================================================================

/**
 * End-user context for server-to-server calls.
 *
 * When your server proxies requests to ScaleMule (e.g., from a Next.js API route),
 * pass this so ScaleMule records the real end-user's information instead of your
 * server's IP and user agent.
 *
 * Use `extractClientContext()` to build this from an incoming request.
 */
export interface ClientContext {
  /** End-user IP address */
  ip?: string;
  /** End-user browser User-Agent */
  userAgent?: string;
  /** End-user device fingerprint */
  deviceFingerprint?: string;
  /** HTTP Referer header from the end-user's request */
  referrer?: string;
}
