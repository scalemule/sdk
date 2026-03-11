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

import type { ApiResponse, ApiError, ScaleMuleConfig, StorageAdapter, RequestOptions } from './types';

// ============================================================================
// Constants
// ============================================================================

/** Shape of a raw JSON response before it's narrowed to ApiResponse<T>. */
interface RawApiResponse {
  data?: unknown;
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

const SDK_VERSION = '0.0.1';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 300;
const MAX_BACKOFF_MS = 30000;
const SESSION_STORAGE_KEY = 'scalemule_session';
const USER_ID_STORAGE_KEY = 'scalemule_user_id';
const OFFLINE_QUEUE_KEY = 'scalemule_offline_queue';
const WORKSPACE_STORAGE_KEY = 'scalemule_workspace_id';

const GATEWAY_URLS = {
  dev: 'https://api-dev.scalemule.com',
  prod: 'https://api.scalemule.com'
} as const;

/** HTTP status codes that trigger automatic retry */
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

// ============================================================================
// Utility Functions
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with 30% jitter, capped at MAX_BACKOFF_MS */
function getBackoffDelay(attempt: number, baseDelay: number): number {
  const exponential = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponential;
  return Math.min(exponential + jitter, MAX_BACKOFF_MS);
}

/** Generate a unique idempotency key for POST retries */
function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Sanitize filename for multipart uploads (handles Safari/iOS unicode) */
function sanitizeFilename(filename: string): string {
  // eslint-disable-next-line no-control-regex
  let sanitized = filename.replace(/[\x00-\x1f\x7f]/g, '');
  sanitized = sanitized
    .replace(/["\\/\n\r]/g, '_')
    .normalize('NFC')
    .replace(/[\u200b-\u200f\ufeff\u2028\u2029]/g, '');

  if (!sanitized || sanitized.trim() === '') {
    sanitized = 'unnamed';
  }

  if (sanitized.length > 200) {
    const ext = sanitized.split('.').pop();
    const base = sanitized.substring(0, 190);
    sanitized = ext ? `${base}.${ext}` : base;
  }

  return sanitized.trim();
}

/** Map HTTP status to standardized error code */
function statusToErrorCode(status: number): string {
  switch (status) {
    case 400:
      return 'validation_error';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 422:
      return 'validation_error';
    case 429:
      return 'rate_limited';
    default:
      return status >= 500 ? 'internal_error' : `http_${status}`;
  }
}

// ============================================================================
// Default Storage Adapter
// ============================================================================

function createDefaultStorage(): StorageAdapter {
  if (typeof window !== 'undefined' && window.localStorage) {
    return {
      getItem: (key: string) => window.localStorage.getItem(key),
      setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
      removeItem: (key: string) => window.localStorage.removeItem(key)
    };
  }

  const memory = new Map<string, string>();
  return {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    }
  };
}

// ============================================================================
// Rate Limit Queue
// ============================================================================

interface QueuedRequest<T> {
  execute: () => Promise<ApiResponse<T>>;
  resolve: (value: ApiResponse<T>) => void;
  reject: (reason: unknown) => void;
  priority: number;
}

class RateLimitQueue {
  private queue: QueuedRequest<unknown>[] = [];
  private processing = false;
  private rateLimitedUntil = 0;

  enqueue<T>(execute: () => Promise<ApiResponse<T>>, priority = 0): Promise<ApiResponse<T>> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        execute: execute as () => Promise<ApiResponse<unknown>>,
        resolve: resolve as (value: ApiResponse<unknown>) => void,
        reject,
        priority
      });
      this.queue.sort((a, b) => b.priority - a.priority);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      if (now < this.rateLimitedUntil) {
        await sleep(this.rateLimitedUntil - now);
      }

      const request = this.queue.shift();
      if (!request) continue;

      try {
        const result = await request.execute();
        if (result.error?.code === 'rate_limited') {
          this.queue.unshift(request);
          const retryAfter = (result.error.details?.retryAfter as number) || 60;
          this.rateLimitedUntil = Date.now() + retryAfter * 1000;
        } else {
          request.resolve(result);
        }
      } catch (error) {
        request.reject(error);
      }
    }

    this.processing = false;
  }

  updateFromHeaders(headers: Headers): void {
    const retryAfter = headers.get('Retry-After');
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        this.rateLimitedUntil = Date.now() + seconds * 1000;
      }
    }
  }

  get length(): number {
    return this.queue.length;
  }
  get isRateLimited(): boolean {
    return Date.now() < this.rateLimitedUntil;
  }
}

// ============================================================================
// Offline Queue
// ============================================================================

interface OfflineQueueItem {
  id: string;
  method: string;
  path: string;
  body?: string;
  timestamp: number;
}

class OfflineQueue {
  private queue: OfflineQueueItem[] = [];
  private onOnlineCallback: (() => void) | null = null;
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
    this.loadFromStorage();
    this.setupListeners();
  }

  private setupListeners(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => {
      if (this.onOnlineCallback) this.onOnlineCallback();
    });
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const data = await this.storage.getItem(OFFLINE_QUEUE_KEY);
      if (data) this.queue = JSON.parse(data);
    } catch {
      /* ignore */
    }
  }

  private async save(): Promise<void> {
    try {
      await this.storage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(this.queue));
    } catch {
      /* ignore */
    }
  }

  async add(method: string, path: string, body?: unknown): Promise<void> {
    this.queue.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      method,
      path,
      body: body ? JSON.stringify(body) : undefined,
      timestamp: Date.now()
    });
    await this.save();
  }

  getAll(): OfflineQueueItem[] {
    return [...this.queue];
  }

  async remove(id: string): Promise<void> {
    this.queue = this.queue.filter((item) => item.id !== id);
    await this.save();
  }

  async clear(): Promise<void> {
    this.queue = [];
    await this.save();
  }

  setOnlineCallback(cb: () => void): void {
    this.onOnlineCallback = cb;
  }
  get length(): number {
    return this.queue.length;
  }
  get online(): boolean {
    return typeof navigator === 'undefined' || navigator.onLine;
  }
}

// ============================================================================
// ScaleMule Client
// ============================================================================

export class ScaleMuleClient {
  private apiKey: string;
  private baseUrl: string;
  private debug: boolean;
  private storage: StorageAdapter;
  private defaultTimeout: number;
  private maxRetries: number;
  private backoffMs: number;
  private sessionToken: string | null = null;
  private userId: string | null = null;
  private rateLimitQueue: RateLimitQueue | null = null;
  private offlineQueue: OfflineQueue | null = null;
  private workspaceId: string | null = null;

  constructor(config: ScaleMuleConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || GATEWAY_URLS[config.environment || 'prod'];
    this.debug = config.debug || false;
    this.storage = config.storage || createDefaultStorage();
    this.defaultTimeout = config.timeout || DEFAULT_TIMEOUT;
    this.maxRetries = config.retry?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.backoffMs = config.retry?.backoffMs ?? DEFAULT_BACKOFF_MS;

    if (config.enableRateLimitQueue) {
      this.rateLimitQueue = new RateLimitQueue();
    }
    if (config.enableOfflineQueue) {
      this.offlineQueue = new OfflineQueue(this.storage);
      this.offlineQueue.setOnlineCallback(() => this.syncOfflineQueue());
    }
  }

  // --------------------------------------------------------------------------
  // Session Management
  // --------------------------------------------------------------------------

  async initialize(): Promise<void> {
    const token = await this.storage.getItem(SESSION_STORAGE_KEY);
    const userId = await this.storage.getItem(USER_ID_STORAGE_KEY);
    if (token) this.sessionToken = token;
    if (userId) this.userId = userId;
    const wsId = await this.storage.getItem(WORKSPACE_STORAGE_KEY);
    if (wsId) this.workspaceId = wsId;
    if (this.debug) console.log('[ScaleMule] Initialized, session:', !!token);
  }

  async setSession(token: string, userId: string): Promise<void> {
    this.sessionToken = token;
    this.userId = userId;
    await this.storage.setItem(SESSION_STORAGE_KEY, token);
    await this.storage.setItem(USER_ID_STORAGE_KEY, userId);
  }

  async clearSession(): Promise<void> {
    this.sessionToken = null;
    this.userId = null;
    this.workspaceId = null;
    await this.storage.removeItem(SESSION_STORAGE_KEY);
    await this.storage.removeItem(USER_ID_STORAGE_KEY);
    await this.storage.removeItem(WORKSPACE_STORAGE_KEY);
  }

  setAccessToken(token: string): void {
    this.sessionToken = token;
  }
  clearAccessToken(): void {
    this.sessionToken = null;
  }
  getSessionToken(): string | null {
    return this.sessionToken;
  }
  getUserId(): string | null {
    return this.userId;
  }
  isAuthenticated(): boolean {
    return this.sessionToken !== null;
  }
  getBaseUrl(): string {
    return this.baseUrl;
  }
  getApiKey(): string {
    return this.apiKey;
  }

  isOnline(): boolean {
    if (this.offlineQueue) return this.offlineQueue.online;
    return typeof navigator === 'undefined' || navigator.onLine;
  }

  getOfflineQueueLength(): number {
    return this.offlineQueue?.length || 0;
  }
  getRateLimitQueueLength(): number {
    return this.rateLimitQueue?.length || 0;
  }
  isRateLimited(): boolean {
    return this.rateLimitQueue?.isRateLimited || false;
  }

  setWorkspaceContext(id: string | null): void {
    this.workspaceId = id;
    if (id) {
      this.storage.setItem(WORKSPACE_STORAGE_KEY, id);
    } else {
      this.storage.removeItem(WORKSPACE_STORAGE_KEY);
    }
  }

  getWorkspaceId(): string | null {
    return this.workspaceId;
  }

  // --------------------------------------------------------------------------
  // Core Request Method
  // --------------------------------------------------------------------------

  async request<T>(
    path: string,
    init: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
      skipAuth?: boolean;
      timeout?: number;
      retries?: number;
      skipRetry?: boolean;
      signal?: AbortSignal;
    } = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const method = (init.method || 'GET').toUpperCase();
    const timeout = init.timeout || this.defaultTimeout;
    const maxRetries = init.skipRetry ? 0 : (init.retries ?? this.maxRetries);

    // Build headers
    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
      'User-Agent': `ScaleMule-SDK-TypeScript/${SDK_VERSION}`,
      ...init.headers
    };
    if (!init.skipAuth && this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }
    if (this.workspaceId) {
      headers['x-sm-workspace-id'] = this.workspaceId;
    }

    // Serialize body
    let bodyStr: string | undefined;
    if (init.body !== undefined && init.body !== null) {
      bodyStr = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
    }

    if (this.debug) {
      console.log(`[ScaleMule] ${method} ${path}`);
    }

    // Generate idempotency key once per logical request (reused on retries)
    const idempotencyKey = method === 'POST' ? generateIdempotencyKey() : undefined;

    let lastError: ApiError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // On retry for POST, attach the idempotency key
      if (attempt > 0 && idempotencyKey) {
        headers['x-idempotency-key'] = idempotencyKey;
      }

      // AbortController for timeout (compose with user signal if provided)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // If user provided a signal, abort our controller when theirs fires
      if (init.signal) {
        if (init.signal.aborted) {
          clearTimeout(timeoutId);
          return { data: null, error: { code: 'aborted', message: 'Request aborted', status: 0 } };
        }
        init.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      try {
        const response = await fetch(url, {
          method,
          headers,
          body: bodyStr,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Update rate limit queue from response headers
        if (this.rateLimitQueue) {
          this.rateLimitQueue.updateFromHeaders(response.headers);
        }

        // Parse response
        let responseData: RawApiResponse;
        const contentType = response.headers.get('Content-Type') || '';
        if (contentType.includes('application/json')) {
          responseData = await response.json();
        } else {
          const text = await response.text();
          try {
            responseData = JSON.parse(text);
          } catch {
            responseData = { message: text };
          }
        }

        // Handle error responses
        if (!response.ok) {
          const error: ApiError = {
            code: responseData?.error?.code || responseData?.code || statusToErrorCode(response.status),
            message: responseData?.error?.message || responseData?.message || response.statusText,
            status: response.status,
            details: responseData?.error?.details || responseData?.details
          };

          // Add retryAfter for rate limiting
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            if (retryAfter) {
              error.details = { ...error.details, retryAfter: parseInt(retryAfter, 10) };
            }
          }

          // Retry on transient failures
          if (attempt < maxRetries && RETRYABLE_STATUS_CODES.has(response.status)) {
            lastError = error;
            const delay = getBackoffDelay(attempt, this.backoffMs);
            if (this.debug) {
              console.log(`[ScaleMule] Retry ${attempt + 1}/${maxRetries} in ${Math.round(delay)}ms`);
            }
            await sleep(delay);
            continue;
          }

          return { data: null, error };
        }

        // Success — extract data from response
        // Backend may return { data: T } or just T at top level
        const data = responseData?.data !== undefined ? responseData.data : responseData;
        return { data: data as T, error: null };
      } catch (err) {
        clearTimeout(timeoutId);

        const isAbort = err instanceof Error && err.name === 'AbortError';
        const error: ApiError = {
          code: isAbort ? (init.signal?.aborted ? 'aborted' : 'timeout') : 'network_error',
          message: err instanceof Error ? err.message : 'Network request failed',
          status: 0
        };

        // Retry on network errors (not user aborts)
        if (attempt < maxRetries && !init.signal?.aborted) {
          lastError = error;
          const delay = getBackoffDelay(attempt, this.backoffMs);
          if (this.debug) {
            console.log(`[ScaleMule] Retry ${attempt + 1}/${maxRetries} in ${Math.round(delay)}ms (${error.code})`);
          }
          await sleep(delay);
          continue;
        }

        return { data: null, error };
      }
    }

    return { data: null, error: lastError || { code: 'internal_error', message: 'Request failed', status: 0 } };
  }

  // --------------------------------------------------------------------------
  // HTTP Verb Shortcuts
  // --------------------------------------------------------------------------

  async get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  async del<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  // --------------------------------------------------------------------------
  // File Upload
  // --------------------------------------------------------------------------

  /**
   * Upload a file using multipart/form-data.
   *
   * Supports progress tracking via XMLHttpRequest (browser only).
   * Supports cancellation via AbortController signal.
   * Retries with exponential backoff on transient failures.
   */
  async upload<T>(
    path: string,
    file: File | Blob,
    additionalFields?: Record<string, string>,
    options?: RequestOptions & { onProgress?: (progress: number) => void }
  ): Promise<ApiResponse<T>> {
    // Sanitize filename
    const fileName = (file as File).name || 'file';
    const sanitizedName = sanitizeFilename(fileName);
    const sanitizedFile = sanitizedName !== fileName ? new File([file], sanitizedName, { type: file.type }) : file;

    const buildFormData = (): FormData => {
      const fd = new FormData();
      fd.append('file', sanitizedFile);
      if (additionalFields) {
        for (const [key, value] of Object.entries(additionalFields)) {
          fd.append(key, value);
        }
      }
      return fd;
    };

    const url = `${this.baseUrl}${path}`;
    if (this.debug) console.log(`[ScaleMule] UPLOAD ${path}`);

    // Check if user aborted before starting
    if (options?.signal?.aborted) {
      return { data: null, error: { code: 'aborted', message: 'Upload aborted', status: 0 } };
    }

    // Use XMLHttpRequest for progress support in browser
    if (options?.onProgress && typeof XMLHttpRequest !== 'undefined') {
      return this.uploadWithXHR<T>(url, buildFormData, options.onProgress, options?.signal);
    }

    // Fetch-based upload with retry
    const maxRetries = options?.retries ?? this.maxRetries;
    let lastError: ApiError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const headers: Record<string, string> = { 'x-api-key': this.apiKey };
      if (this.sessionToken) headers['Authorization'] = `Bearer ${this.sessionToken}`;
      if (this.workspaceId) headers['x-sm-workspace-id'] = this.workspaceId;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: buildFormData(),
          signal: options?.signal
        });

        const data = await response.json();

        if (!response.ok) {
          const error: ApiError = {
            code: data?.error?.code || statusToErrorCode(response.status),
            message: data?.error?.message || data?.message || response.statusText,
            status: response.status,
            details: data?.error?.details
          };

          if (attempt < maxRetries && RETRYABLE_STATUS_CODES.has(response.status)) {
            lastError = error;
            await sleep(getBackoffDelay(attempt, this.backoffMs));
            continue;
          }
          return { data: null, error };
        }

        const result = data?.data !== undefined ? data.data : data;
        return { data: result as T, error: null };
      } catch (err) {
        if (options?.signal?.aborted) {
          return { data: null, error: { code: 'aborted', message: 'Upload aborted', status: 0 } };
        }
        lastError = {
          code: 'upload_error',
          message: err instanceof Error ? err.message : 'Upload failed',
          status: 0
        };
        if (attempt < maxRetries) {
          await sleep(getBackoffDelay(attempt, this.backoffMs));
          continue;
        }
      }
    }

    return { data: null, error: lastError || { code: 'upload_error', message: 'Upload failed', status: 0 } };
  }

  /**
   * Single upload with XMLHttpRequest for progress tracking.
   * Supports abort via AbortSignal.
   */
  private async uploadWithXHR<T>(
    url: string,
    buildFormData: () => FormData,
    onProgress: (progress: number) => void,
    signal?: AbortSignal,
    maxRetries = this.maxRetries
  ): Promise<ApiResponse<T>> {
    let lastError: ApiError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await new Promise<ApiResponse<T>>((res) => {
        const xhr = new XMLHttpRequest();

        // Abort support
        if (signal) {
          if (signal.aborted) {
            res({ data: null, error: { code: 'aborted', message: 'Upload aborted', status: 0 } });
            return;
          }
          signal.addEventListener('abort', () => xhr.abort(), { once: true });
        }

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        });

        xhr.addEventListener('load', () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              const result = data?.data !== undefined ? data.data : data;
              res({ data: result as T, error: null });
            } else {
              res({
                data: null,
                error: {
                  code: data?.error?.code || statusToErrorCode(xhr.status),
                  message: data?.error?.message || data?.message || 'Upload failed',
                  status: xhr.status,
                  details: data?.error?.details
                }
              });
            }
          } catch {
            res({ data: null, error: { code: 'internal_error', message: 'Failed to parse response', status: 0 } });
          }
        });

        xhr.addEventListener('error', () => {
          res({ data: null, error: { code: 'upload_error', message: 'Upload failed', status: 0 } });
        });

        xhr.addEventListener('abort', () => {
          res({ data: null, error: { code: 'aborted', message: 'Upload aborted', status: 0 } });
        });

        xhr.open('POST', url);
        xhr.setRequestHeader('x-api-key', this.apiKey);
        if (this.sessionToken) {
          xhr.setRequestHeader('Authorization', `Bearer ${this.sessionToken}`);
        }
        if (this.workspaceId) {
          xhr.setRequestHeader('x-sm-workspace-id', this.workspaceId);
        }
        xhr.send(buildFormData());
      });

      if (result.error === null) {
        return result;
      }

      // Check if retryable
      const isRetryable =
        result.error.code === 'upload_error' ||
        result.error.code === 'network_error' ||
        RETRYABLE_STATUS_CODES.has(result.error.status);

      if (result.error.code === 'aborted') {
        return result;
      }

      if (attempt < maxRetries && isRetryable) {
        lastError = result.error;
        onProgress(0); // Reset progress for retry
        await sleep(getBackoffDelay(attempt, this.backoffMs));
        continue;
      }

      return result;
    }

    return {
      data: null,
      error: lastError || { code: 'upload_error', message: 'Upload failed', status: 0 }
    };
  }

  // --------------------------------------------------------------------------
  // Offline Queue Sync
  // --------------------------------------------------------------------------

  private async syncOfflineQueue(): Promise<void> {
    if (!this.offlineQueue) return;

    const items = this.offlineQueue.getAll();
    if (this.debug && items.length > 0) {
      console.log(`[ScaleMule] Syncing ${items.length} offline requests`);
    }

    for (const item of items) {
      try {
        await this.request(item.path, {
          method: item.method,
          body: item.body ? JSON.parse(item.body) : undefined,
          skipRetry: true
        });
        await this.offlineQueue.remove(item.id);
      } catch {
        break; // Stop syncing if we hit an error
      }
    }
  }
}
