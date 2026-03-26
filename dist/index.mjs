import {
  UploadResumeStore
} from "./chunk-3FTGBRLU.mjs";

// src/types.ts
var ErrorCodes = {
  // Auth & access
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
  // Resources
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  // Input
  VALIDATION_ERROR: "validation_error",
  // Rate limiting & quotas
  RATE_LIMITED: "rate_limited",
  QUOTA_EXCEEDED: "quota_exceeded",
  // Server
  INTERNAL_ERROR: "internal_error",
  // Network (SDK-generated, not from server)
  NETWORK_ERROR: "network_error",
  TIMEOUT: "timeout",
  ABORTED: "aborted",
  // Storage-specific
  FILE_SCANNING: "file_scanning",
  FILE_THREAT: "file_threat",
  FILE_QUARANTINED: "file_quarantined",
  // Upload
  UPLOAD_ERROR: "upload_error"
};

// src/context.ts
function validateIP(ip) {
  if (!ip) return void 0;
  const trimmed = ip.trim();
  if (!trimmed) return void 0;
  const ipv4 = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
  const ipv6 = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){0,6}::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}$/;
  const mapped = /^::ffff:(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/i;
  if (ipv4.test(trimmed) || ipv6.test(trimmed) || mapped.test(trimmed)) {
    return trimmed;
  }
  return void 0;
}
function extractClientContext(request) {
  const h = request.headers;
  const getHeader = (name) => {
    const v = h[name] ?? h[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  };
  let ip;
  const cfIp = getHeader("cf-connecting-ip");
  if (cfIp) ip = validateIP(cfIp);
  if (!ip) {
    const doIp = getHeader("do-connecting-ip");
    if (doIp) ip = validateIP(doIp);
  }
  if (!ip) {
    const realIp = getHeader("x-real-ip");
    if (realIp) ip = validateIP(realIp);
  }
  if (!ip) {
    const xff = getHeader("x-forwarded-for");
    if (xff) ip = validateIP(xff.split(",")[0]?.trim());
  }
  if (!ip) {
    const vercel = getHeader("x-vercel-forwarded-for");
    if (vercel) ip = validateIP(vercel.split(",")[0]?.trim());
  }
  if (!ip) {
    const akamai = getHeader("true-client-ip");
    if (akamai) ip = validateIP(akamai);
  }
  if (!ip && request.socket?.remoteAddress) {
    ip = validateIP(request.socket.remoteAddress);
  }
  return {
    ip,
    userAgent: getHeader("user-agent") || void 0,
    deviceFingerprint: getHeader("x-device-fingerprint") || void 0,
    referrer: getHeader("referer") || void 0
  };
}
function buildClientContextHeaders(context) {
  if (!context) return {};
  const headers = {};
  if (context.ip) {
    headers["x-sm-forwarded-client-ip"] = context.ip;
    headers["X-Client-IP"] = context.ip;
  }
  if (context.userAgent) headers["X-Client-User-Agent"] = context.userAgent;
  if (context.deviceFingerprint) headers["X-Client-Device-Fingerprint"] = context.deviceFingerprint;
  if (context.referrer) headers["X-Client-Referrer"] = context.referrer;
  return headers;
}

// src/client.ts
var SDK_VERSION = "0.0.1";
var DEFAULT_TIMEOUT = 3e4;
var DEFAULT_MAX_RETRIES = 2;
var DEFAULT_BACKOFF_MS = 300;
var MAX_BACKOFF_MS = 3e4;
var SESSION_STORAGE_KEY = "scalemule_session";
var USER_ID_STORAGE_KEY = "scalemule_user_id";
var OFFLINE_QUEUE_KEY = "scalemule_offline_queue";
var WORKSPACE_STORAGE_KEY = "scalemule_workspace_id";
var ANONYMOUS_ID_STORAGE_KEY = "scalemule_anonymous_id";
var SESSION_POOL_KEY = "scalemule_session_pool";
var ACTIVE_ACCOUNT_KEY = "scalemule_active_account";
var GATEWAY_URLS = {
  dev: "https://api-dev.scalemule.com",
  prod: "https://api.scalemule.com"
};
var RETRYABLE_STATUS_CODES = /* @__PURE__ */ new Set([408, 429, 500, 502, 503, 504]);
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function getBackoffDelay(attempt, baseDelay) {
  const exponential = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponential;
  return Math.min(exponential + jitter, MAX_BACKOFF_MS);
}
function generateIdempotencyKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function sanitizeFilename(filename) {
  let sanitized = filename.replace(/[\x00-\x1f\x7f]/g, "");
  sanitized = sanitized.replace(/["\\/\n\r]/g, "_").normalize("NFC").replace(/[\u200b-\u200f\ufeff\u2028\u2029]/g, "");
  if (!sanitized || sanitized.trim() === "") {
    sanitized = "unnamed";
  }
  if (sanitized.length > 200) {
    const ext = sanitized.split(".").pop();
    const base = sanitized.substring(0, 190);
    sanitized = ext ? `${base}.${ext}` : base;
  }
  return sanitized.trim();
}
function statusToErrorCode(status) {
  switch (status) {
    case 400:
      return "validation_error";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 422:
      return "validation_error";
    case 429:
      return "rate_limited";
    default:
      return status >= 500 ? "internal_error" : `http_${status}`;
  }
}
function createDefaultStorage() {
  if (typeof window !== "undefined" && window.localStorage) {
    return {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
      removeItem: (key) => window.localStorage.removeItem(key)
    };
  }
  const memory = /* @__PURE__ */ new Map();
  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      memory.set(key, value);
    },
    removeItem: (key) => {
      memory.delete(key);
    }
  };
}
var RateLimitQueue = class {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.rateLimitedUntil = 0;
  }
  enqueue(execute, priority = 0) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        execute,
        resolve,
        reject,
        priority
      });
      this.queue.sort((a, b) => b.priority - a.priority);
      this.processQueue();
    });
  }
  async processQueue() {
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
        if (result.error?.code === "rate_limited") {
          this.queue.unshift(request);
          const retryAfter = result.error.details?.retryAfter || 60;
          this.rateLimitedUntil = Date.now() + retryAfter * 1e3;
        } else {
          request.resolve(result);
        }
      } catch (error) {
        request.reject(error);
      }
    }
    this.processing = false;
  }
  updateFromHeaders(headers) {
    const retryAfter = headers.get("Retry-After");
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        this.rateLimitedUntil = Date.now() + seconds * 1e3;
      }
    }
  }
  get length() {
    return this.queue.length;
  }
  get isRateLimited() {
    return Date.now() < this.rateLimitedUntil;
  }
};
var OfflineQueue = class {
  constructor(storage) {
    this.queue = [];
    this.onOnlineCallback = null;
    this.storage = storage;
    this.loadFromStorage();
    this.setupListeners();
  }
  setupListeners() {
    if (typeof window === "undefined") return;
    window.addEventListener("online", () => {
      if (this.onOnlineCallback) this.onOnlineCallback();
    });
  }
  async loadFromStorage() {
    try {
      const data = await this.storage.getItem(OFFLINE_QUEUE_KEY);
      if (data) this.queue = JSON.parse(data);
    } catch {
    }
  }
  async save() {
    try {
      await this.storage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(this.queue));
    } catch {
    }
  }
  async add(method, path, body) {
    this.queue.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      method,
      path,
      body: body ? JSON.stringify(body) : void 0,
      timestamp: Date.now()
    });
    await this.save();
  }
  getAll() {
    return [...this.queue];
  }
  async remove(id) {
    this.queue = this.queue.filter((item) => item.id !== id);
    await this.save();
  }
  async clear() {
    this.queue = [];
    await this.save();
  }
  setOnlineCallback(cb) {
    this.onOnlineCallback = cb;
  }
  get length() {
    return this.queue.length;
  }
  get online() {
    return typeof navigator === "undefined" || navigator.onLine;
  }
};
var ScaleMuleClient = class {
  constructor(config) {
    this.applicationId = null;
    this.sessionToken = null;
    this.userId = null;
    this.rateLimitQueue = null;
    this.offlineQueue = null;
    this.workspaceId = null;
    this.anonymousId = null;
    this.sessionPool = /* @__PURE__ */ new Map();
    this.apiKey = config.apiKey;
    this.applicationId = config.applicationId || null;
    this.baseUrl = config.baseUrl || GATEWAY_URLS[config.environment || "prod"];
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
    this.multiSessionEnabled = config.enableMultiSession || false;
  }
  // --------------------------------------------------------------------------
  // Session Management
  // --------------------------------------------------------------------------
  async initialize() {
    const token = await this.storage.getItem(SESSION_STORAGE_KEY);
    const userId = await this.storage.getItem(USER_ID_STORAGE_KEY);
    if (token) this.sessionToken = token;
    if (userId) this.userId = userId;
    const wsId = await this.storage.getItem(WORKSPACE_STORAGE_KEY);
    if (wsId) this.workspaceId = wsId;
    let anonId = await this.storage.getItem(ANONYMOUS_ID_STORAGE_KEY);
    if (!anonId) {
      anonId = crypto.randomUUID();
      await this.storage.setItem(ANONYMOUS_ID_STORAGE_KEY, anonId);
    }
    this.anonymousId = anonId;
    if (this.multiSessionEnabled) {
      const poolJson = await this.storage.getItem(SESSION_POOL_KEY);
      if (poolJson) {
        try {
          const entries = JSON.parse(poolJson);
          this.sessionPool = new Map(Object.entries(entries));
        } catch {
        }
      }
      if (token && userId && !this.sessionPool.has(userId)) {
        this.sessionPool.set(userId, {
          token,
          userId,
          email: "",
          addedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        await this.persistSessionPool();
      }
      const activeId = await this.storage.getItem(ACTIVE_ACCOUNT_KEY);
      if (activeId && this.sessionPool.has(activeId)) {
        const entry = this.sessionPool.get(activeId);
        this.sessionToken = entry.token;
        this.userId = activeId;
      }
    }
    if (this.debug)
      console.log(
        "[ScaleMule] Initialized, session:",
        !!this.sessionToken,
        "anonymousId:",
        anonId,
        "poolSize:",
        this.sessionPool.size
      );
  }
  async setSession(token, userId) {
    this.sessionToken = token;
    this.userId = userId;
    await this.storage.setItem(SESSION_STORAGE_KEY, token);
    await this.storage.setItem(USER_ID_STORAGE_KEY, userId);
  }
  async clearSession() {
    if (this.multiSessionEnabled && this.userId) {
      this.sessionPool.delete(this.userId);
      await this.persistSessionPool();
      const next = this.sessionPool.entries().next().value;
      if (next) {
        const [nextUserId, nextEntry] = next;
        this.sessionToken = nextEntry.token;
        this.userId = nextUserId;
        await this.storage.setItem(SESSION_STORAGE_KEY, nextEntry.token);
        await this.storage.setItem(USER_ID_STORAGE_KEY, nextUserId);
        await this.storage.setItem(ACTIVE_ACCOUNT_KEY, nextUserId);
        return;
      }
    }
    this.sessionToken = null;
    this.userId = null;
    this.workspaceId = null;
    await this.storage.removeItem(SESSION_STORAGE_KEY);
    await this.storage.removeItem(USER_ID_STORAGE_KEY);
    await this.storage.removeItem(WORKSPACE_STORAGE_KEY);
    await this.storage.removeItem(ACTIVE_ACCOUNT_KEY);
  }
  setAccessToken(token) {
    this.sessionToken = token;
  }
  clearAccessToken() {
    this.sessionToken = null;
  }
  getSessionToken() {
    return this.sessionToken;
  }
  getApplicationId() {
    return this.applicationId;
  }
  getUserId() {
    return this.userId;
  }
  isAuthenticated() {
    return this.sessionToken !== null;
  }
  getAnonymousId() {
    return this.anonymousId;
  }
  isMultiSessionEnabled() {
    return this.multiSessionEnabled;
  }
  // --------------------------------------------------------------------------
  // Multi-Account Session Pool (Phase 2)
  // --------------------------------------------------------------------------
  /** Get all accounts in the session pool */
  getSessionPool() {
    return Array.from(this.sessionPool.values());
  }
  /** Get the active account entry, or null */
  getActiveAccount() {
    if (!this.userId) return null;
    return this.sessionPool.get(this.userId) || null;
  }
  /** Add an account to the session pool and set it as active */
  async addAccount(entry) {
    this.sessionPool.set(entry.userId, entry);
    this.sessionToken = entry.token;
    this.userId = entry.userId;
    await this.storage.setItem(SESSION_STORAGE_KEY, entry.token);
    await this.storage.setItem(USER_ID_STORAGE_KEY, entry.userId);
    await this.storage.setItem(ACTIVE_ACCOUNT_KEY, entry.userId);
    await this.persistSessionPool();
  }
  /** Switch to a different account in the pool. Returns false if not found. */
  async switchAccount(userId) {
    const entry = this.sessionPool.get(userId);
    if (!entry) return false;
    this.sessionToken = entry.token;
    this.userId = userId;
    this.workspaceId = null;
    await this.storage.setItem(SESSION_STORAGE_KEY, entry.token);
    await this.storage.setItem(USER_ID_STORAGE_KEY, userId);
    await this.storage.setItem(ACTIVE_ACCOUNT_KEY, userId);
    await this.storage.removeItem(WORKSPACE_STORAGE_KEY);
    return true;
  }
  /** Remove a specific account from the pool */
  async removeAccount(userId) {
    this.sessionPool.delete(userId);
    await this.persistSessionPool();
    if (this.userId === userId) {
      const next = this.sessionPool.entries().next().value;
      if (next) {
        await this.switchAccount(next[0]);
      } else {
        await this.clearSession();
      }
    }
  }
  /** Clear all accounts from the pool */
  async clearAllAccounts() {
    this.sessionPool.clear();
    await this.storage.removeItem(SESSION_POOL_KEY);
    await this.storage.removeItem(ACTIVE_ACCOUNT_KEY);
    this.sessionToken = null;
    this.userId = null;
    this.workspaceId = null;
    await this.storage.removeItem(SESSION_STORAGE_KEY);
    await this.storage.removeItem(USER_ID_STORAGE_KEY);
    await this.storage.removeItem(WORKSPACE_STORAGE_KEY);
  }
  /** Persist session pool to storage */
  async persistSessionPool() {
    const obj = {};
    for (const [k, v] of this.sessionPool) {
      obj[k] = v;
    }
    await this.storage.setItem(SESSION_POOL_KEY, JSON.stringify(obj));
  }
  getBaseUrl() {
    return this.baseUrl;
  }
  getApiKey() {
    return this.apiKey;
  }
  isOnline() {
    if (this.offlineQueue) return this.offlineQueue.online;
    return typeof navigator === "undefined" || navigator.onLine;
  }
  getOfflineQueueLength() {
    return this.offlineQueue?.length || 0;
  }
  getRateLimitQueueLength() {
    return this.rateLimitQueue?.length || 0;
  }
  isRateLimited() {
    return this.rateLimitQueue?.isRateLimited || false;
  }
  setWorkspaceContext(id) {
    this.workspaceId = id;
    if (id) {
      this.storage.setItem(WORKSPACE_STORAGE_KEY, id);
    } else {
      this.storage.removeItem(WORKSPACE_STORAGE_KEY);
    }
  }
  getWorkspaceId() {
    return this.workspaceId;
  }
  // --------------------------------------------------------------------------
  // Core Request Method
  // --------------------------------------------------------------------------
  async request(path, init = {}) {
    const url = `${this.baseUrl}${path}`;
    const method = (init.method || "GET").toUpperCase();
    const timeout = init.timeout || this.defaultTimeout;
    const maxRetries = init.skipRetry ? 0 : init.retries ?? this.maxRetries;
    const headers = {
      "x-api-key": this.apiKey,
      "User-Agent": `ScaleMule-SDK-TypeScript/${SDK_VERSION}`,
      ...init.headers
    };
    if (!init.skipAuth && this.sessionToken) {
      headers["Authorization"] = `Bearer ${this.sessionToken}`;
    }
    if (this.workspaceId) {
      headers["x-sm-workspace-id"] = this.workspaceId;
    }
    if (!this.sessionToken && this.anonymousId) {
      headers["x-anonymous-id"] = this.anonymousId;
    }
    let bodyStr;
    if (init.body !== void 0 && init.body !== null) {
      bodyStr = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
    }
    if (this.debug) {
      console.log(`[ScaleMule] ${method} ${path}`);
    }
    const idempotencyKey = method === "POST" ? generateIdempotencyKey() : void 0;
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0 && idempotencyKey) {
        headers["x-idempotency-key"] = idempotencyKey;
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      if (init.signal) {
        if (init.signal.aborted) {
          clearTimeout(timeoutId);
          return { data: null, error: { code: "aborted", message: "Request aborted", status: 0 } };
        }
        init.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
      try {
        const response = await fetch(url, {
          method,
          headers,
          body: bodyStr,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (this.rateLimitQueue) {
          this.rateLimitQueue.updateFromHeaders(response.headers);
        }
        let responseData;
        const contentType = response.headers.get("Content-Type") || "";
        if (contentType.includes("application/json")) {
          responseData = await response.json();
        } else {
          const text = await response.text();
          try {
            responseData = JSON.parse(text);
          } catch {
            responseData = { message: text };
          }
        }
        if (!response.ok) {
          const error = {
            code: responseData?.error?.code || responseData?.code || statusToErrorCode(response.status),
            message: responseData?.error?.message || responseData?.message || response.statusText,
            status: response.status,
            details: responseData?.error?.details || responseData?.details
          };
          if (response.status === 429) {
            const retryAfter = response.headers.get("Retry-After");
            if (retryAfter) {
              error.details = { ...error.details, retryAfter: parseInt(retryAfter, 10) };
            }
          }
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
        const data = responseData?.data !== void 0 ? responseData.data : responseData;
        return { data, error: null };
      } catch (err) {
        clearTimeout(timeoutId);
        const isAbort = err instanceof Error && err.name === "AbortError";
        const error = {
          code: isAbort ? init.signal?.aborted ? "aborted" : "timeout" : "network_error",
          message: err instanceof Error ? err.message : "Network request failed",
          status: 0
        };
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
    return { data: null, error: lastError || { code: "internal_error", message: "Request failed", status: 0 } };
  }
  // --------------------------------------------------------------------------
  // HTTP Verb Shortcuts
  // --------------------------------------------------------------------------
  async get(path, options) {
    return this.request(path, { ...options, method: "GET" });
  }
  async post(path, body, options) {
    return this.request(path, { ...options, method: "POST", body });
  }
  async put(path, body, options) {
    return this.request(path, { ...options, method: "PUT", body });
  }
  async patch(path, body, options) {
    return this.request(path, { ...options, method: "PATCH", body });
  }
  async del(path, options) {
    return this.request(path, { ...options, method: "DELETE" });
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
  async upload(path, file, additionalFields, options) {
    const fileName = file.name || "file";
    const sanitizedName = sanitizeFilename(fileName);
    const sanitizedFile = sanitizedName !== fileName ? new File([file], sanitizedName, { type: file.type }) : file;
    const buildFormData = () => {
      const fd = new FormData();
      fd.append("file", sanitizedFile);
      if (additionalFields) {
        for (const [key, value] of Object.entries(additionalFields)) {
          fd.append(key, value);
        }
      }
      return fd;
    };
    const url = `${this.baseUrl}${path}`;
    if (this.debug) console.log(`[ScaleMule] UPLOAD ${path}`);
    if (options?.signal?.aborted) {
      return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
    }
    if (options?.onProgress && typeof XMLHttpRequest !== "undefined") {
      return this.uploadWithXHR(url, buildFormData, options.onProgress, options?.signal);
    }
    const maxRetries = options?.retries ?? this.maxRetries;
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const headers = { "x-api-key": this.apiKey };
      if (this.sessionToken) headers["Authorization"] = `Bearer ${this.sessionToken}`;
      if (this.workspaceId) headers["x-sm-workspace-id"] = this.workspaceId;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: buildFormData(),
          signal: options?.signal
        });
        const data = await response.json();
        if (!response.ok) {
          const error = {
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
        const result = data?.data !== void 0 ? data.data : data;
        return { data: result, error: null };
      } catch (err) {
        if (options?.signal?.aborted) {
          return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
        }
        lastError = {
          code: "upload_error",
          message: err instanceof Error ? err.message : "Upload failed",
          status: 0
        };
        if (attempt < maxRetries) {
          await sleep(getBackoffDelay(attempt, this.backoffMs));
          continue;
        }
      }
    }
    return { data: null, error: lastError || { code: "upload_error", message: "Upload failed", status: 0 } };
  }
  /**
   * Single upload with XMLHttpRequest for progress tracking.
   * Supports abort via AbortSignal.
   */
  async uploadWithXHR(url, buildFormData, onProgress, signal, maxRetries = this.maxRetries) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await new Promise((res) => {
        const xhr = new XMLHttpRequest();
        if (signal) {
          if (signal.aborted) {
            res({ data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } });
            return;
          }
          signal.addEventListener("abort", () => xhr.abort(), { once: true });
        }
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            onProgress(Math.round(event.loaded / event.total * 100));
          }
        });
        xhr.addEventListener("load", () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              const result2 = data?.data !== void 0 ? data.data : data;
              res({ data: result2, error: null });
            } else {
              res({
                data: null,
                error: {
                  code: data?.error?.code || statusToErrorCode(xhr.status),
                  message: data?.error?.message || data?.message || "Upload failed",
                  status: xhr.status,
                  details: data?.error?.details
                }
              });
            }
          } catch {
            res({ data: null, error: { code: "internal_error", message: "Failed to parse response", status: 0 } });
          }
        });
        xhr.addEventListener("error", () => {
          res({ data: null, error: { code: "upload_error", message: "Upload failed", status: 0 } });
        });
        xhr.addEventListener("abort", () => {
          res({ data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } });
        });
        xhr.open("POST", url);
        xhr.setRequestHeader("x-api-key", this.apiKey);
        if (this.sessionToken) {
          xhr.setRequestHeader("Authorization", `Bearer ${this.sessionToken}`);
        }
        if (this.workspaceId) {
          xhr.setRequestHeader("x-sm-workspace-id", this.workspaceId);
        }
        xhr.send(buildFormData());
      });
      if (result.error === null) {
        return result;
      }
      const isRetryable = result.error.code === "upload_error" || result.error.code === "network_error" || RETRYABLE_STATUS_CODES.has(result.error.status);
      if (result.error.code === "aborted") {
        return result;
      }
      if (attempt < maxRetries && isRetryable) {
        lastError = result.error;
        onProgress(0);
        await sleep(getBackoffDelay(attempt, this.backoffMs));
        continue;
      }
      return result;
    }
    return {
      data: null,
      error: lastError || { code: "upload_error", message: "Upload failed", status: 0 }
    };
  }
  // --------------------------------------------------------------------------
  // Offline Queue Sync
  // --------------------------------------------------------------------------
  async syncOfflineQueue() {
    if (!this.offlineQueue) return;
    const items = this.offlineQueue.getAll();
    if (this.debug && items.length > 0) {
      console.log(`[ScaleMule] Syncing ${items.length} offline requests`);
    }
    for (const item of items) {
      try {
        await this.request(item.path, {
          method: item.method,
          body: item.body ? JSON.parse(item.body) : void 0,
          skipRetry: true
        });
        await this.offlineQueue.remove(item.id);
      } catch {
        break;
      }
    }
  }
};

// src/service.ts
var ServiceModule = class {
  constructor(client) {
    this.client = client;
  }
  // --------------------------------------------------------------------------
  // Client context → headers resolution
  // --------------------------------------------------------------------------
  /**
   * Merge `clientContext` from RequestOptions into `headers`.
   * Explicit headers take precedence over context-derived ones.
   */
  resolveOptions(options) {
    if (!options?.clientContext) return options;
    const contextHeaders = buildClientContextHeaders(options.clientContext);
    const { clientContext: _, ...rest } = options;
    return { ...rest, headers: { ...contextHeaders, ...rest.headers } };
  }
  // --------------------------------------------------------------------------
  // HTTP verb shortcuts (path relative to basePath)
  // --------------------------------------------------------------------------
  _get(path, options) {
    return this.client.get(`${this.basePath}${path}`, this.resolveOptions(options));
  }
  post(path, body, options) {
    return this.client.post(`${this.basePath}${path}`, body, this.resolveOptions(options));
  }
  put(path, body, options) {
    return this.client.put(`${this.basePath}${path}`, body, this.resolveOptions(options));
  }
  patch(path, body, options) {
    return this.client.patch(`${this.basePath}${path}`, body, this.resolveOptions(options));
  }
  del(path, options) {
    return this.client.del(`${this.basePath}${path}`, this.resolveOptions(options));
  }
  // --------------------------------------------------------------------------
  // Paginated list
  // --------------------------------------------------------------------------
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
  async _list(path, params, options) {
    const qs = buildQueryString(params);
    const fullPath = qs ? `${this.basePath}${path}?${qs}` : `${this.basePath}${path}`;
    const response = await this.client.get(fullPath, this.resolveOptions(options));
    if (response.error) {
      return {
        data: [],
        metadata: { total: 0, totalPages: 0, page: asNum(params?.page) ?? 1, perPage: asNum(params?.perPage) ?? 20 },
        error: response.error
      };
    }
    return normalizePaginatedResponse(response.data, params);
  }
  // --------------------------------------------------------------------------
  // File upload (delegates to client.upload)
  // --------------------------------------------------------------------------
  _upload(path, file, additionalFields, options) {
    return this.client.upload(
      `${this.basePath}${path}`,
      file,
      additionalFields,
      this.resolveOptions(options)
    );
  }
  // --------------------------------------------------------------------------
  // Query string helper (available to subclasses)
  // --------------------------------------------------------------------------
  /**
   * Append query parameters to a relative path.
   * Use with verb methods: `this.get(this.withQuery('/items', { status: 'active' }))`
   * Does NOT add basePath — the verb methods handle that.
   */
  withQuery(path, params) {
    const qs = buildQueryString(params);
    return qs ? `${path}?${qs}` : path;
  }
};
function buildQueryString(params) {
  if (!params) return "";
  const pairs = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === void 0 || value === null) continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return pairs.join("&");
}
function normalizePaginatedResponse(raw, params) {
  if (raw === null || raw === void 0) {
    return {
      data: [],
      metadata: { total: 0, totalPages: 0, page: 1, perPage: 20 },
      error: null
    };
  }
  if (Array.isArray(raw)) {
    return {
      data: raw,
      metadata: {
        total: raw.length,
        totalPages: 1,
        page: 1,
        perPage: raw.length
      },
      error: null
    };
  }
  const obj = raw;
  const dataArray = obj.data ?? obj.items ?? [];
  const metadata = {
    total: asNumber(obj.metadata, "total") ?? asNumber(obj, "total") ?? dataArray.length,
    totalPages: asNumber(obj.metadata, "totalPages") ?? asNumber(obj.metadata, "total_pages") ?? asNumber(obj, "total_pages") ?? asNumber(obj, "totalPages") ?? 0,
    page: asNumber(obj.metadata, "page") ?? asNumber(obj, "page") ?? asNum(params?.page) ?? 1,
    perPage: asNumber(obj.metadata, "perPage") ?? asNumber(obj.metadata, "per_page") ?? asNumber(obj, "per_page") ?? asNumber(obj, "perPage") ?? asNum(params?.perPage) ?? 20
  };
  if (metadata.totalPages === 0 && metadata.total > 0 && metadata.perPage > 0) {
    metadata.totalPages = Math.ceil(metadata.total / metadata.perPage);
  }
  const nextCursor = asString(obj.metadata, "nextCursor") ?? asString(obj.metadata, "next_cursor") ?? asString(obj, "next_cursor") ?? asString(obj, "nextCursor");
  if (nextCursor) {
    metadata.nextCursor = nextCursor;
  }
  return { data: dataArray, metadata, error: null };
}
function asNumber(parent, key) {
  if (parent === null || parent === void 0 || typeof parent !== "object") return void 0;
  const value = parent[key];
  return typeof value === "number" ? value : void 0;
}
function asNum(value) {
  return typeof value === "number" ? value : void 0;
}
function asString(parent, key) {
  if (parent === null || parent === void 0 || typeof parent !== "object") return void 0;
  const value = parent[key];
  return typeof value === "string" ? value : void 0;
}

// src/utils/phone.ts
import {
  PHONE_COUNTRIES,
  normalizePhoneNumber,
  normalizeAndValidatePhone,
  composePhoneNumber,
  isValidE164Phone,
  findPhoneCountryByCode,
  findPhoneCountryByDialCode,
  detectCountryFromE164,
  countryFlag
} from "@scalemule/ui/phone";

// src/services/auth.ts
function collectDeviceFingerprint() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return void 0;
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
    return void 0;
  }
}
var AuthMfaApi = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/auth/mfa";
  }
  async getStatus() {
    return this._get("/status");
  }
  async setupTotp() {
    return this.post("/totp/setup");
  }
  async verifySetup(data) {
    return this.post("/totp/verify-setup", data);
  }
  async enableSms() {
    return this.post("/sms/enable");
  }
  async enableEmail() {
    return this.post("/email/enable");
  }
  async disable(data) {
    return this.post("/disable", data);
  }
  async regenerateBackupCodes() {
    return this.post("/backup-codes/regenerate");
  }
  async sendCode(data) {
    return this.post("/send-code", data);
  }
  async verify(data) {
    return this.post("/verify", data);
  }
};
var AuthSessionsApi = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/auth/sessions";
  }
  async list() {
    return this._get("");
  }
  async revoke(sessionId) {
    return this.del(`/${sessionId}`);
  }
  async revokeAll() {
    return this.del("/others");
  }
};
var AuthDevicesApi = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/auth/devices";
  }
  async list() {
    return this._get("");
  }
  async trust(deviceId) {
    return this.post(`/${deviceId}/trust`);
  }
  async block(deviceId) {
    return this.post(`/${deviceId}/block`);
  }
  async delete(deviceId) {
    return this.del(`/${deviceId}`);
  }
};
var AuthLoginHistoryApi = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/auth";
  }
  async list(params) {
    return this._get(this.withQuery("/login-history", params));
  }
  async getSummary() {
    return this._get("/login-activity");
  }
};
var AuthService = class extends ServiceModule {
  constructor(client) {
    super(client);
    this.basePath = "/v1/auth";
    this.mfa = new AuthMfaApi(client);
    this.sessions = new AuthSessionsApi(client);
    this.devices = new AuthDevicesApi(client);
    this.loginHistory = new AuthLoginHistoryApi(client);
  }
  sanitizePhoneField(value) {
    if (typeof value !== "string") return value;
    const normalized = normalizePhoneNumber(value);
    return normalized || void 0;
  }
  // --------------------------------------------------------------------------
  // Core Auth
  // --------------------------------------------------------------------------
  async register(data, options) {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone),
      anonymous_id: this.client.getAnonymousId()
    };
    const result = await this.post("/register", payload, options);
    if (result.data && this.client.isMultiSessionEnabled()) {
      await this.client.addAccount({
        token: result.data.session_token,
        userId: result.data.user.id,
        email: result.data.user.email,
        fullName: result.data.user.full_name,
        avatarUrl: result.data.user.avatar_url,
        expiresAt: result.data.expires_at,
        addedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    return result;
  }
  async login(data, options) {
    const payload = {
      ...data,
      anonymous_id: this.client.getAnonymousId(),
      device_fingerprint: data.device_fingerprint || collectDeviceFingerprint()
    };
    const result = await this.post("/login", payload, options);
    if (result.data && this.client.isMultiSessionEnabled()) {
      await this.client.addAccount({
        token: result.data.session_token,
        userId: result.data.user.id,
        email: result.data.user.email,
        fullName: result.data.user.full_name,
        avatarUrl: result.data.user.avatar_url,
        expiresAt: result.data.expires_at,
        addedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    return result;
  }
  async logout(options) {
    return this.post("/logout", void 0, options);
  }
  async me(options) {
    return this._get("/me", options);
  }
  /** Refresh the session. Alias: refreshToken() */
  async refreshSession(data, options) {
    return this.post("/refresh", data ?? {}, options);
  }
  /** @deprecated Use refreshSession() */
  async refreshToken(data) {
    return this.refreshSession(data);
  }
  // --------------------------------------------------------------------------
  // Passwordless Auth
  // --------------------------------------------------------------------------
  /**
   * Send a one-time password for passwordless sign-in.
   * @experimental Endpoint availability depends on backend deployment.
   */
  async signInWithOtp(data, options) {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone)
    };
    return this.post("/otp/send", payload, options);
  }
  /**
   * Verify OTP code and create a session.
   * @experimental Endpoint availability depends on backend deployment.
   */
  async verifyOtp(data, options) {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone)
    };
    return this.post("/otp/verify", payload, options);
  }
  /**
   * Send a magic link for passwordless sign-in.
   * @experimental Endpoint availability depends on backend deployment.
   */
  async signInWithMagicLink(data, options) {
    return this.post("/magic-link/send", data, options);
  }
  /**
   * Verify a magic link token and create a session.
   * @experimental Endpoint availability depends on backend deployment.
   */
  async verifyMagicLink(data, options) {
    return this.post("/magic-link/verify", data, options);
  }
  // --------------------------------------------------------------------------
  // Phone OTP (existing backend endpoints)
  // --------------------------------------------------------------------------
  async sendPhoneOtp(data, options) {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone) ?? ""
    };
    return this.post("/phone/send-otp", payload, options);
  }
  async verifyPhoneOtp(data, options) {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone) ?? ""
    };
    return this.post("/phone/verify-otp", payload, options);
  }
  async resendPhoneOtp(data, options) {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone) ?? ""
    };
    return this.post("/phone/resend-otp", payload, options);
  }
  /** Login with phone OTP (sends + verifies in one flow) */
  async loginWithPhone(data, options) {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone) ?? "",
      purpose: "login"
    };
    return this.post("/phone/verify-otp", payload, options);
  }
  // --------------------------------------------------------------------------
  // Password Management
  // --------------------------------------------------------------------------
  async forgotPassword(data, options) {
    return this.post("/forgot-password", data, options);
  }
  async resetPassword(data, options) {
    return this.post("/reset-password", data, options);
  }
  async changePassword(data, options) {
    return this.post("/password/change", data, options);
  }
  // --------------------------------------------------------------------------
  // Email & Phone Management
  // --------------------------------------------------------------------------
  async verifyEmail(data, options) {
    return this.post("/verify-email", data, options);
  }
  /** Resend email verification. Alias: resendEmailVerification() */
  async resendVerification(data, options) {
    return this.post("/resend-verification", data ?? {}, options);
  }
  /** @deprecated Use resendVerification() */
  async resendEmailVerification(data) {
    return this.resendVerification(data);
  }
  async changeEmail(data, options) {
    return this.post("/email/change", data, options);
  }
  async changePhone(data, options) {
    const payload = {
      ...data,
      new_phone: this.sanitizePhoneField(data.new_phone) ?? ""
    };
    return this.post("/phone/change", payload, options);
  }
  // --------------------------------------------------------------------------
  // Account
  // --------------------------------------------------------------------------
  async deleteAccount(options) {
    return this.del("/me", options);
  }
  async exportData(options) {
    return this._get("/me/export", options);
  }
  // --------------------------------------------------------------------------
  // OAuth
  // --------------------------------------------------------------------------
  async getOAuthUrl(provider, redirectUri, options) {
    return this._get(this.withQuery(`/oauth/${provider}/authorize`, { redirect_uri: redirectUri }), options);
  }
  async handleOAuthCallback(data, options) {
    const { provider, ...rest } = data;
    return this._get(this.withQuery(`/oauth/${provider}/callback`, rest), options);
  }
  async listOAuthProviders(options) {
    return this._get("/oauth/providers", options);
  }
  async unlinkOAuthProvider(provider, options) {
    return this.del(`/oauth/providers/${provider}`, options);
  }
  // --------------------------------------------------------------------------
  // Token Management
  // --------------------------------------------------------------------------
  async refreshAccessToken(data, options) {
    return this.post("/token/refresh", data ?? {}, options);
  }
  async revokeRefreshToken(data, options) {
    return this.post("/token/revoke", data, options);
  }
  // --------------------------------------------------------------------------
  // Flat methods for backward compatibility (delegate to sub-APIs)
  // --------------------------------------------------------------------------
  /** @deprecated Use auth.sessions.list() */
  async listSessions() {
    return this.sessions.list();
  }
  /** @deprecated Use auth.sessions.revoke() */
  async revokeSession(sessionId) {
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
  async trustDevice(deviceId) {
    return this.devices.trust(deviceId);
  }
  /** @deprecated Use auth.devices.block() */
  async blockDevice(deviceId) {
    return this.devices.block(deviceId);
  }
  /** @deprecated Use auth.devices.delete() */
  async deleteDevice(deviceId) {
    return this.devices.delete(deviceId);
  }
  /** @deprecated Use auth.loginHistory.list() */
  async getLoginHistory(params) {
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
  async verifyTotpSetup(data) {
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
  async disableMfa(data) {
    return this.mfa.disable(data);
  }
  /** @deprecated Use auth.mfa.regenerateBackupCodes() */
  async regenerateBackupCodes() {
    return this.mfa.regenerateBackupCodes();
  }
  /** @deprecated Use auth.mfa.sendCode() */
  async sendMfaCode(data) {
    return this.mfa.sendCode(data);
  }
  /** @deprecated Use auth.mfa.verify() */
  async verifyMfa(data) {
    return this.mfa.verify(data);
  }
};

// src/services/logger.ts
var BATCH_MAX_SIZE = 100;
var LoggerService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/logger";
  }
  /**
   * Write a single log entry.
   * Accepts both new schema (LogInput) and legacy shape ({ level, message }) for backward compatibility.
   */
  async log(data, options) {
    const body = this.normalizeLogInput(data);
    return this.post("/logs", body, options);
  }
  /**
   * Write log entries in batch.
   * Auto-chunks into groups of 100 (backend hard limit) and sends sequentially.
   * Returns total ingested count across all chunks.
   */
  async logBatch(logs, options) {
    if (logs.length === 0) {
      return { data: { ingested: 0 }, error: null };
    }
    let totalIngested = 0;
    for (let i = 0; i < logs.length; i += BATCH_MAX_SIZE) {
      const chunk = logs.slice(i, i + BATCH_MAX_SIZE);
      const result = await this.post("/logs/batch", { logs: chunk }, options);
      if (result.error) {
        return {
          data: { ingested: totalIngested },
          error: result.error
        };
      }
      totalIngested += result.data?.ingested ?? chunk.length;
    }
    return { data: { ingested: totalIngested }, error: null };
  }
  /**
   * Query logs with filters. Returns paginated response.
   */
  async queryLogs(filters, requestOptions) {
    return this._get(this.withQuery("/logs", filters), requestOptions);
  }
  // Convenience methods
  async debug(service, message, meta, options) {
    return this.log({ service, severity: "debug", message, metadata: meta }, options);
  }
  async info(service, message, meta, options) {
    return this.log({ service, severity: "info", message, metadata: meta }, options);
  }
  async warn(service, message, meta, options) {
    return this.log({ service, severity: "warn", message, metadata: meta }, options);
  }
  async error(service, message, meta, options) {
    return this.log({ service, severity: "error", message, metadata: meta }, options);
  }
  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------
  /** Normalize legacy { level, message } to { severity, service, message } */
  normalizeLogInput(data) {
    if ("severity" in data && "service" in data) {
      return data;
    }
    const legacy = data;
    return {
      service: "sdk",
      severity: legacy.level || "info",
      message: legacy.message,
      metadata: legacy.metadata
    };
  }
};

// src/services/upload-telemetry.ts
var EVENT_SEVERITY = {
  "upload.failed": "error",
  "upload.stalled": "error",
  "upload.multipart.aborted": "error",
  "upload.retried": "warn",
  "upload.aborted": "warn",
  "upload.multipart.part_failed": "warn",
  "upload.multipart.url_refreshed": "warn",
  "upload.compression.skipped": "warn",
  "upload.started": "info",
  "upload.completed": "info",
  "upload.resumed": "info",
  "upload.multipart.started": "info",
  "upload.multipart.completed": "info",
  "upload.compression.completed": "info",
  "upload.progress": "debug",
  "upload.multipart.part_completed": "debug",
  "upload.compression.started": "debug"
};
var UploadTelemetry = class {
  constructor(client, config) {
    this.buffer = [];
    this.debugLogBuffer = [];
    this.flushTimer = null;
    this.flushing = false;
    this.client = client;
    this.logger = new LoggerService(client);
    this.config = {
      enabled: config?.enabled ?? true,
      flushIntervalMs: config?.flushIntervalMs ?? 2e3,
      maxBufferSize: config?.maxBufferSize ?? 50
    };
    if (this.config.enabled) {
      this.startFlushTimer();
    }
  }
  /** Emit a telemetry event. Never throws. */
  emit(sessionId, event, metadata = {}) {
    if (!this.config.enabled) return;
    const payload = {
      upload_session_id: sessionId,
      event,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      metadata
    };
    const severity = EVENT_SEVERITY[event] || "info";
    if (severity !== "debug") {
      this.sendToLogger(payload, severity);
    } else {
      this.debugLogBuffer.push({
        service: "storage.upload",
        severity,
        message: `Upload ${event}: session=${sessionId}`,
        metadata: { upload_session_id: sessionId, event, ...metadata },
        trace_id: sessionId
      });
    }
    this.buffer.push(payload);
    if (this.buffer.length >= this.config.maxBufferSize) {
      this.flush();
    }
  }
  /** Flush buffered events immediately. Never throws. */
  async flush() {
    if (!this.config.enabled || this.buffer.length === 0 && this.debugLogBuffer.length === 0 || this.flushing) return;
    this.flushing = true;
    const batch = this.buffer.splice(0);
    const debugLogs = this.debugLogBuffer.splice(0);
    try {
      if (batch.length > 0) {
        const events = batch.map((p) => ({
          event: p.event,
          properties: {
            upload_session_id: p.upload_session_id,
            ...p.metadata
          },
          timestamp: p.timestamp
        }));
        await this.client.post("/v1/analytics/v2/events/batch", { events }).catch(() => {
        });
      }
      if (debugLogs.length > 0) {
        await this.logger.logBatch(debugLogs).catch(() => {
        });
      }
    } catch {
    } finally {
      this.flushing = false;
    }
  }
  /** Stop the flush timer and drain remaining events. */
  async destroy() {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
  startFlushTimer() {
    if (typeof setInterval !== "undefined") {
      this.flushTimer = setInterval(() => {
        this.flush();
      }, this.config.flushIntervalMs);
      if (this.flushTimer && typeof this.flushTimer === "object" && "unref" in this.flushTimer) {
        this.flushTimer.unref();
      }
    }
  }
  /** Send a log entry to the logger service (fire-and-forget) */
  sendToLogger(payload, severity) {
    this.logger.log({
      service: "storage.upload",
      severity,
      message: `Upload ${payload.event}: session=${payload.upload_session_id}`,
      metadata: {
        upload_session_id: payload.upload_session_id,
        event: payload.event,
        ...payload.metadata
      },
      trace_id: payload.upload_session_id
    }).catch(() => {
    });
  }
};
function generateUploadSessionId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `us_${timestamp}_${random}`;
}

// src/services/storage.ts
var RETRY_DELAYS = [0, 1e3, 3e3];
var RETRYABLE_STATUS_CODES2 = /* @__PURE__ */ new Set([500, 502, 503, 504]);
var NON_RETRYABLE_STATUS_CODES = /* @__PURE__ */ new Set([400, 403, 404, 413]);
var DEFAULT_STALL_TIMEOUT_MS = 45e3;
var SLOW_NETWORK_STALL_TIMEOUT_MS = 9e4;
var MULTIPART_THRESHOLD = 8 * 1024 * 1024;
var MULTIPART_THRESHOLD_SLOW = 4 * 1024 * 1024;
var StorageService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/storage";
    this.telemetry = null;
  }
  // --------------------------------------------------------------------------
  // Upload (unified: direct PUT or multipart, transparent to caller)
  // --------------------------------------------------------------------------
  /**
   * Upload a file using the optimal strategy.
   *
   * Small files (< 8MB): 3-step presigned URL flow with retry + stall guard.
   * Large files (>= 8MB): Multipart with windowed presigns, resumable.
   *
   * @returns The completed file record with id, url, etc.
   */
  async upload(file, options) {
    if (options?.signal?.aborted) {
      return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
    }
    const sessionId = generateUploadSessionId();
    const telemetryEnabled = options?.telemetry !== false;
    const telemetry = telemetryEnabled ? this.getOrCreateTelemetry() : null;
    const startTime = Date.now();
    telemetry?.emit(sessionId, "upload.started", {
      size_bytes: file.size,
      content_type: file.type,
      strategy: this.shouldUseMultipart(file, options) ? "multipart" : "direct",
      network_type: getNetworkEffectiveType()
    });
    try {
      let uploadFile = file;
      if (!options?.skipCompression && typeof window !== "undefined") {
        const compressed = await this.maybeCompress(file, options?.compression, sessionId, telemetry);
        if (compressed) uploadFile = compressed;
      }
      if (this.shouldUseMultipart(uploadFile, options)) {
        return await this.uploadMultipart(uploadFile, options, sessionId, telemetry);
      }
      return await this.uploadDirect(uploadFile, options, sessionId, telemetry);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      telemetry?.emit(sessionId, "upload.failed", { error: message, duration_ms: Date.now() - startTime });
      return { data: null, error: { code: "upload_error", message, status: 0 } };
    }
  }
  // --------------------------------------------------------------------------
  // Direct Upload (3-step with retry + stall)
  // --------------------------------------------------------------------------
  async uploadDirect(file, options, sessionId, telemetry) {
    const directStart = Date.now();
    const requestOpts = this.withSessionHeader(sessionId, options);
    const filename = options?.filename || file.name || "file";
    const initResult = await this.post(
      "/signed-url/upload",
      {
        filename,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        is_public: options?.isPublic ?? true,
        metadata: options?.metadata
      },
      requestOpts
    );
    if (initResult.error) {
      telemetry?.emit(sessionId, "upload.failed", { step: "presign", error: initResult.error.message });
      return { data: null, error: initResult.error };
    }
    const { file_id, upload_url, completion_token } = initResult.data;
    const uploadResult = await this.uploadToPresignedUrlWithRetry(
      upload_url,
      file,
      options?.onProgress,
      options?.signal,
      sessionId,
      telemetry
    );
    if (uploadResult.error) {
      if (uploadResult.error.code === "upload_stalled") {
        telemetry?.emit(sessionId, "upload.stalled", { step: "s3_put", file_id });
      }
      telemetry?.emit(sessionId, "upload.failed", {
        step: "s3_put",
        error: uploadResult.error.message,
        file_id,
        reason: uploadResult.error.code
      });
      await this.reportUploadFailureBestEffort(
        {
          fileId: file_id,
          completionToken: completion_token,
          step: "s3_put",
          errorCode: uploadResult.error.code,
          errorMessage: uploadResult.error.message,
          httpStatus: uploadResult.error.status || void 0,
          attempt: asNumber2(uploadResult.error.details?.attempt),
          diagnostics: {
            ...getUploadEnvironmentDiagnostics(),
            ...uploadResult.error.details || {}
          }
        },
        requestOpts
      );
      return { data: null, error: uploadResult.error };
    }
    const completeResult = await this.post(
      "/signed-url/complete",
      {
        file_id,
        completion_token
      },
      requestOpts
    );
    if (completeResult.error) {
      telemetry?.emit(sessionId, "upload.failed", {
        step: "complete",
        error: completeResult.error.message,
        file_id,
        duration_ms: Date.now() - directStart
      });
      await this.reportUploadFailureBestEffort(
        {
          fileId: file_id,
          completionToken: completion_token,
          step: "complete",
          errorCode: completeResult.error.code,
          errorMessage: completeResult.error.message,
          httpStatus: completeResult.error.status || void 0,
          diagnostics: {
            ...getUploadEnvironmentDiagnostics(),
            duration_ms: Date.now() - directStart
          }
        },
        requestOpts
      );
    } else {
      telemetry?.emit(sessionId, "upload.completed", {
        file_id,
        size_bytes: file.size,
        duration_ms: Date.now() - directStart
      });
    }
    return completeResult;
  }
  // --------------------------------------------------------------------------
  // Multipart Upload
  // --------------------------------------------------------------------------
  async uploadMultipart(file, options, sessionId, telemetry) {
    const multipartStart = Date.now();
    const requestOpts = this.withSessionHeader(sessionId, options);
    const filename = options?.filename || file.name || "file";
    telemetry?.emit(sessionId, "upload.multipart.started", { size_bytes: file.size });
    let resumeStore = null;
    let resumeData = null;
    if (options?.resume !== "off" && typeof window !== "undefined") {
      try {
        const { UploadResumeStore: UploadResumeStore2 } = await import("./upload-resume-RXLHBH5E.mjs");
        resumeStore = new UploadResumeStore2();
        await resumeStore.open();
        const resumeKey = await UploadResumeStore2.generateResumeKey(
          this.client.getApiKey?.() || "",
          this.client.getUserId?.() || "",
          filename,
          file.size,
          file.lastModified
        );
        resumeData = await resumeStore.get(resumeKey);
        if (resumeData) {
          telemetry?.emit(sessionId, "upload.resumed", {
            original_session_id: resumeData.upload_session_id,
            completed_parts: resumeData.completed_parts.length,
            total_parts: resumeData.total_parts
          });
        }
      } catch (err) {
        telemetry?.emit(sessionId, "upload.retried", {
          step: "resume_load",
          error: err instanceof Error ? err.message : "Resume store unavailable"
        });
        resumeStore = null;
        resumeData = null;
      }
    }
    let startData;
    let completionToken;
    const completedParts = /* @__PURE__ */ new Map();
    if (resumeData) {
      startData = {
        upload_session_id: resumeData.upload_session_id,
        file_id: resumeData.file_id,
        completion_token: "",
        // will request part URLs separately
        part_size_bytes: resumeData.part_size_bytes || this.defaultChunkSize(file.size),
        total_parts: resumeData.total_parts,
        part_urls: [],
        expires_at: ""
      };
      completionToken = resumeData.completion_token;
      for (const part of resumeData.completed_parts) {
        completedParts.set(part.part_number, part.etag);
      }
    } else {
      let clientUploadKey;
      try {
        const { UploadResumeStore: UploadResumeStore2 } = await import("./upload-resume-RXLHBH5E.mjs");
        clientUploadKey = await UploadResumeStore2.generateResumeKey(
          this.client.getApiKey?.() || "",
          this.client.getUserId?.() || "",
          filename,
          file.size,
          file.lastModified
        );
      } catch {
      }
      const startResult = await this.post(
        "/signed-url/multipart/start",
        {
          filename,
          content_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          is_public: options?.isPublic ?? true,
          metadata: options?.metadata,
          chunk_size: options?.chunkSize,
          ...clientUploadKey ? { client_upload_key: clientUploadKey } : {}
        },
        requestOpts
      );
      if (startResult.error) {
        telemetry?.emit(sessionId, "upload.multipart.aborted", { error: startResult.error.message });
        return { data: null, error: startResult.error };
      }
      startData = startResult.data;
      completionToken = startData.completion_token;
    }
    const { upload_session_id, file_id, part_size_bytes, total_parts } = startData;
    if (resumeStore && !resumeData) {
      try {
        const { UploadResumeStore: UploadResumeStore2 } = await import("./upload-resume-RXLHBH5E.mjs");
        const resumeKey = await UploadResumeStore2.generateResumeKey(
          this.client.getApiKey?.() || "",
          this.client.getUserId?.() || "",
          filename,
          file.size,
          file.lastModified
        );
        await resumeStore.save(resumeKey, {
          upload_session_id,
          file_id,
          completion_token: completionToken,
          total_parts,
          part_size_bytes,
          completed_parts: [],
          created_at: Date.now()
        });
      } catch (err) {
        telemetry?.emit(sessionId, "upload.retried", {
          step: "resume_save",
          error: err instanceof Error ? err.message : "Resume save failed"
        });
      }
    }
    const maxConcurrency = options?.maxConcurrency || this.defaultConcurrency();
    const availableUrls = /* @__PURE__ */ new Map();
    if (startData.part_urls.length > 0) {
      for (const pu of startData.part_urls) {
        availableUrls.set(pu.part_number, pu);
      }
    }
    const pendingParts = [];
    for (let i = 1; i <= total_parts; i++) {
      if (!completedParts.has(i)) {
        pendingParts.push(i);
      }
    }
    let uploadedCount = completedParts.size;
    let lastProgressMilestone = 0;
    const reportProgress = () => {
      const percent = Math.round(uploadedCount / total_parts * 100);
      if (options?.onProgress) {
        options.onProgress(percent);
      }
      const milestone = Math.floor(percent / 25) * 25;
      if (milestone > lastProgressMilestone && milestone < 100) {
        telemetry?.emit(sessionId, "upload.progress", {
          percent: milestone,
          uploaded_parts: uploadedCount,
          total_parts
        });
        lastProgressMilestone = milestone;
      }
    };
    reportProgress();
    let partIndex = 0;
    while (partIndex < pendingParts.length) {
      if (options?.signal?.aborted) {
        await this.abortMultipart(upload_session_id, completionToken, requestOpts);
        telemetry?.emit(sessionId, "upload.aborted", { file_id });
        await this.reportUploadFailureBestEffort(
          {
            fileId: file_id,
            completionToken,
            step: "multipart_abort",
            errorCode: "aborted",
            errorMessage: "Upload aborted",
            diagnostics: getUploadEnvironmentDiagnostics()
          },
          requestOpts
        );
        return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
      }
      const remainingUrlCount = pendingParts.slice(partIndex).filter((p) => availableUrls.has(p)).length;
      if (remainingUrlCount <= 4) {
        const neededParts = pendingParts.slice(partIndex, partIndex + 16).filter((p) => !availableUrls.has(p));
        if (neededParts.length > 0) {
          const urlResult = await this.post(
            "/signed-url/multipart/part-urls",
            { upload_session_id, part_numbers: neededParts, completion_token: completionToken },
            requestOpts
          );
          if (urlResult.data) {
            for (const pu of urlResult.data.part_urls) {
              availableUrls.set(pu.part_number, pu);
            }
          }
        }
      }
      const batch = pendingParts.slice(partIndex, partIndex + maxConcurrency);
      const batchPromises = batch.map(async (partNum) => {
        const partUrl = availableUrls.get(partNum);
        if (!partUrl) {
          const urlResult = await this.post(
            "/signed-url/multipart/part-urls",
            { upload_session_id, part_numbers: [partNum], completion_token: completionToken },
            requestOpts
          );
          if (!urlResult.data?.part_urls?.[0]) {
            return { partNum, error: "Failed to get part URL" };
          }
          availableUrls.set(partNum, urlResult.data.part_urls[0]);
        }
        const url = availableUrls.get(partNum).url;
        const start = (partNum - 1) * part_size_bytes;
        const end = Math.min(start + part_size_bytes, file.size);
        const partBlob = file.slice(start, end);
        const result = await this.uploadPartWithRetry(url, partBlob, options?.signal, partNum, sessionId, telemetry);
        if (result.error) {
          if (result.code === "upload_stalled") {
            telemetry?.emit(sessionId, "upload.stalled", { step: "multipart_part", part_number: partNum });
          }
          telemetry?.emit(sessionId, "upload.multipart.part_failed", {
            part_number: partNum,
            error: result.error,
            code: result.code
          });
          if (result.status === 403) {
            telemetry?.emit(sessionId, "upload.multipart.url_refreshed", { part_number: partNum });
            const refreshResult = await this.post(
              "/signed-url/multipart/part-urls",
              { upload_session_id, part_numbers: [partNum], completion_token: completionToken },
              requestOpts
            );
            if (refreshResult.data?.part_urls?.[0]) {
              availableUrls.set(partNum, refreshResult.data.part_urls[0]);
              const retryResult = await this.uploadPartWithRetry(
                refreshResult.data.part_urls[0].url,
                partBlob,
                options?.signal,
                partNum,
                sessionId,
                telemetry
              );
              if (retryResult.etag) {
                return { partNum, etag: retryResult.etag };
              }
            }
          }
          return { partNum, error: result.error };
        }
        return { partNum, etag: result.etag };
      });
      const results = await Promise.all(batchPromises);
      for (const result of results) {
        if (result.etag) {
          completedParts.set(result.partNum, result.etag);
          uploadedCount++;
          telemetry?.emit(sessionId, "upload.multipart.part_completed", { part_number: result.partNum });
          if (resumeStore) {
            try {
              const { UploadResumeStore: UploadResumeStore2 } = await import("./upload-resume-RXLHBH5E.mjs");
              const resumeKey = await UploadResumeStore2.generateResumeKey(
                this.client.getApiKey?.() || "",
                this.client.getUserId?.() || "",
                filename,
                file.size,
                file.lastModified
              );
              await resumeStore.updatePart(resumeKey, result.partNum, result.etag);
            } catch (err) {
              telemetry?.emit(sessionId, "upload.retried", {
                step: "resume_update",
                part_number: result.partNum,
                error: err instanceof Error ? err.message : "Resume update failed"
              });
            }
          }
        } else {
          const errorMsg = result.error || "Part upload returned no ETag";
          await this.abortMultipart(upload_session_id, completionToken, requestOpts);
          telemetry?.emit(sessionId, "upload.multipart.aborted", { file_id, error: errorMsg });
          await this.reportUploadFailureBestEffort(
            {
              fileId: file_id,
              completionToken,
              step: "multipart_part",
              errorCode: "upload_error",
              errorMessage: errorMsg,
              diagnostics: {
                ...getUploadEnvironmentDiagnostics(),
                part_number: result.partNum
              }
            },
            requestOpts
          );
          return {
            data: null,
            error: { code: "upload_error", message: `Part ${result.partNum} failed: ${errorMsg}`, status: 0 }
          };
        }
      }
      reportProgress();
      partIndex += batch.length;
    }
    const parts = Array.from(completedParts.entries()).sort(([a], [b]) => a - b).map(([part_number, etag]) => ({ part_number, etag }));
    const completeResult = await this.post(
      "/signed-url/multipart/complete",
      { upload_session_id, file_id, completion_token: completionToken, parts },
      requestOpts
    );
    if (resumeStore) {
      try {
        const { UploadResumeStore: UploadResumeStore2 } = await import("./upload-resume-RXLHBH5E.mjs");
        const resumeKey = await UploadResumeStore2.generateResumeKey(
          this.client.getApiKey?.() || "",
          this.client.getUserId?.() || "",
          filename,
          file.size,
          file.lastModified
        );
        await resumeStore.remove(resumeKey);
      } catch (err) {
        telemetry?.emit(sessionId, "upload.retried", {
          step: "resume_cleanup",
          error: err instanceof Error ? err.message : "Resume cleanup failed"
        });
      }
    }
    if (completeResult.error) {
      telemetry?.emit(sessionId, "upload.multipart.aborted", {
        file_id,
        error: completeResult.error.message,
        duration_ms: Date.now() - multipartStart
      });
      await this.reportUploadFailureBestEffort(
        {
          fileId: file_id,
          completionToken,
          step: "multipart_complete",
          errorCode: completeResult.error.code,
          errorMessage: completeResult.error.message,
          httpStatus: completeResult.error.status || void 0,
          diagnostics: {
            ...getUploadEnvironmentDiagnostics(),
            duration_ms: Date.now() - multipartStart
          }
        },
        requestOpts
      );
      return { data: null, error: completeResult.error };
    }
    telemetry?.emit(sessionId, "upload.multipart.completed", {
      file_id,
      size_bytes: file.size,
      duration_ms: Date.now() - multipartStart
    });
    telemetry?.emit(sessionId, "upload.completed", {
      file_id,
      size_bytes: file.size,
      duration_ms: Date.now() - multipartStart
    });
    options?.onProgress?.(100);
    const d = completeResult.data;
    return {
      data: {
        id: d.file_id,
        filename: d.filename,
        content_type: d.content_type,
        size_bytes: d.size_bytes,
        url: d.url,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      error: null
    };
  }
  // --------------------------------------------------------------------------
  // Multipart Abort
  // --------------------------------------------------------------------------
  async abortMultipart(uploadSessionId, completionToken, requestOpts) {
    try {
      await this.post(
        "/signed-url/multipart/abort",
        {
          upload_session_id: uploadSessionId,
          ...completionToken ? { completion_token: completionToken } : {}
        },
        requestOpts
      );
    } catch {
    }
  }
  // --------------------------------------------------------------------------
  // Split Upload (server-side: presigned URL → client S3 upload → complete)
  // --------------------------------------------------------------------------
  /**
   * Get a presigned URL for direct upload to S3.
   * Use this when the browser uploads directly (with progress tracking)
   * and the server only brokers the URLs.
   *
   * Flow: server calls getUploadUrl() → returns URL to client → client PUTs to S3 → server calls completeUpload()
   */
  async getUploadUrl(filename, contentType, options, requestOptions) {
    return this.post(
      "/signed-url/upload",
      {
        filename,
        content_type: contentType,
        is_public: options?.isPublic ?? true,
        expires_in: options?.expiresIn ?? 3600,
        size_bytes: options?.sizeBytes,
        metadata: options?.metadata
      },
      requestOptions
    );
  }
  /**
   * Complete a presigned upload after the file has been uploaded to S3.
   * Triggers scan and makes the file available.
   */
  async completeUpload(fileId, completionToken, options, requestOptions) {
    return this.post(
      "/signed-url/complete",
      {
        file_id: fileId,
        completion_token: completionToken,
        size_bytes: options?.sizeBytes,
        checksum: options?.checksum
      },
      requestOptions
    );
  }
  /**
   * Persist a structured client-side upload failure against a file record.
   * Best used by split-upload clients that call getUploadUrl() manually.
   */
  async reportUploadFailure(params, requestOptions) {
    return this.post(
      "/signed-url/report-failure",
      {
        file_id: params.fileId,
        completion_token: params.completionToken,
        step: params.step,
        error_code: params.errorCode,
        error_message: params.errorMessage,
        http_status: params.httpStatus,
        attempt: params.attempt,
        diagnostics: params.diagnostics
      },
      requestOptions
    );
  }
  // --------------------------------------------------------------------------
  // Multipart Public API (for advanced/server-side usage)
  // --------------------------------------------------------------------------
  /** Start a multipart upload session. */
  async startMultipartUpload(params, requestOptions) {
    return this.post("/signed-url/multipart/start", params, requestOptions);
  }
  /** Get presigned URLs for specific part numbers. */
  async getMultipartPartUrls(uploadSessionId, partNumbers, completionToken, requestOptions) {
    return this.post(
      "/signed-url/multipart/part-urls",
      {
        upload_session_id: uploadSessionId,
        part_numbers: partNumbers,
        ...completionToken ? { completion_token: completionToken } : {}
      },
      requestOptions
    );
  }
  /** Complete a multipart upload. */
  async completeMultipartUpload(params, requestOptions) {
    return this.post("/signed-url/multipart/complete", params, requestOptions);
  }
  /** Abort a multipart upload. */
  async abortMultipartUpload(uploadSessionId, completionToken, requestOptions) {
    return this.post(
      "/signed-url/multipart/abort",
      {
        upload_session_id: uploadSessionId,
        ...completionToken ? { completion_token: completionToken } : {}
      },
      requestOptions
    );
  }
  // --------------------------------------------------------------------------
  // File Operations
  // --------------------------------------------------------------------------
  /** Get file metadata (no signed URL). */
  async getInfo(fileId, options) {
    return this._get(`/files/${fileId}/info`, options);
  }
  /**
   * Get a signed view URL for inline display (img src, thumbnails).
   * Returns CloudFront signed URL (fast, ~1us) or S3 presigned fallback.
   */
  async getViewUrl(fileId, options) {
    return this.post(`/signed-url/view/${fileId}`, {}, options);
  }
  /**
   * Get signed view URLs for multiple files (batch, up to 100).
   * Single network call, returns all URLs.
   * The shared `expires_at` is a conservative lower bound — reflects the shortest-lived
   * URL in the batch. Individual URLs may remain valid longer if their files are public.
   */
  async getViewUrls(fileIds, options) {
    return this.post("/signed-url/view-batch", { file_ids: fileIds }, options);
  }
  /**
   * Get a signed download URL (Content-Disposition: attachment).
   */
  async getDownloadUrl(fileId, options) {
    return this.post(`/signed-url/download/${fileId}`, void 0, options);
  }
  /** Delete a file (soft delete). */
  async delete(fileId, options) {
    return this.del(`/files/${fileId}`, options);
  }
  /** List the current user's files (paginated). */
  async list(params, options) {
    return this.listMethod("/my-files", params, options);
  }
  /** Check file view/access status. */
  async getViewStatus(fileId, options) {
    return this._get(`/files/${fileId}/view-status`, options);
  }
  /**
   * Update a file's visibility (public/private).
   * Only the file owner can toggle this. Changes URL TTL — does not move the S3 object.
   * Public files get 7-day signed URLs; private files get 1-hour signed URLs.
   */
  async updateVisibility(fileId, isPublic, options) {
    return this.patch(
      `/files/${fileId}/visibility`,
      { is_public: isPublic },
      options
    );
  }
  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------
  /** @deprecated Use upload() instead */
  async uploadFile(file, options) {
    return this.upload(file, {
      isPublic: options?.is_public,
      metadata: options?.metadata,
      onProgress: options?.onProgress,
      signal: options?.signal
    });
  }
  /** @deprecated Use getInfo() instead */
  async getFile(id) {
    return this.getInfo(id);
  }
  /** @deprecated Use delete() instead */
  async deleteFile(id) {
    return this.delete(id);
  }
  /** @deprecated Use list() instead */
  async listFiles(params) {
    return this.list(params);
  }
  // --------------------------------------------------------------------------
  // Private: Upload to presigned URL with retry + stall guard
  // --------------------------------------------------------------------------
  async uploadToPresignedUrlWithRetry(url, file, onProgress, signal, sessionId, telemetry) {
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (signal?.aborted) {
        return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
      }
      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt] ?? 0;
        if (delay > 0) await sleep2(delay);
        telemetry?.emit(sessionId || "", "upload.retried", { attempt });
      }
      const result = await this.uploadToPresignedUrl(url, file, onProgress, signal);
      if (result.error) {
        result.error.details = {
          ...result.error.details || {},
          attempt: attempt + 1,
          max_attempts: RETRY_DELAYS.length
        };
      }
      if (!result.error) return result;
      if (result.error.code === "aborted") return result;
      if (result.error.status && NON_RETRYABLE_STATUS_CODES.has(result.error.status)) {
        return result;
      }
      const isRetryable = result.error.status === 0 || RETRYABLE_STATUS_CODES2.has(result.error.status);
      if (!isRetryable || attempt === RETRY_DELAYS.length - 1) {
        return result;
      }
    }
    return { data: null, error: { code: "upload_error", message: "Upload failed after retries", status: 0 } };
  }
  /**
   * Upload file directly to S3 presigned URL.
   * Uses XHR for progress tracking in browser, fetch otherwise.
   * Includes stall detection.
   */
  async uploadToPresignedUrl(url, file, onProgress, signal) {
    if (signal?.aborted) {
      return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
    }
    if (typeof XMLHttpRequest !== "undefined") {
      return this.uploadWithXHR(url, file, onProgress, signal);
    }
    const stallTimeout = DEFAULT_STALL_TIMEOUT_MS;
    const controller = new AbortController();
    let parentSignalCleanup;
    const combinedSignal = signal ? AbortSignal.any?.([signal, controller.signal]) ?? (() => {
      const onAbort = () => controller.abort();
      signal.addEventListener("abort", onAbort, { once: true });
      parentSignalCleanup = () => signal.removeEventListener("abort", onAbort);
      return controller.signal;
    })() : controller.signal;
    const timer = setTimeout(() => controller.abort(), stallTimeout);
    try {
      const response = await fetch(url, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream"
        },
        signal: combinedSignal
      });
      clearTimeout(timer);
      parentSignalCleanup?.();
      if (!response.ok) {
        return {
          data: null,
          error: {
            code: "upload_error",
            message: `S3 upload failed: ${response.status} ${response.statusText}`,
            status: response.status,
            details: {
              transport: "fetch",
              total_bytes: file.size,
              online: getOnlineStatus()
            }
          }
        };
      }
      onProgress?.(100);
      return { data: null, error: null };
    } catch (err) {
      clearTimeout(timer);
      parentSignalCleanup?.();
      if (signal?.aborted) {
        return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
      }
      const isStall = controller.signal.aborted && !signal?.aborted;
      return {
        data: null,
        error: {
          code: isStall ? "upload_stalled" : "upload_error",
          message: isStall ? `Upload stalled (no progress for ${stallTimeout / 1e3}s)` : err instanceof Error ? err.message : "S3 upload failed",
          status: 0,
          details: {
            transport: "fetch",
            total_bytes: file.size,
            online: getOnlineStatus()
          }
        }
      };
    }
  }
  uploadWithXHR(url, file, onProgress, signal) {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      const stallTimeout = getStallTimeout();
      let stallTimer = null;
      let lastLoaded = 0;
      let totalBytes = file.size;
      const resetStallTimer = () => {
        if (stallTimer !== null) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          xhr.abort();
          resolve({
            data: null,
            error: {
              code: "upload_stalled",
              message: `Upload stalled (no progress for ${stallTimeout / 1e3}s)`,
              status: 0,
              details: {
                transport: "xhr",
                bytes_sent: lastLoaded,
                total_bytes: totalBytes,
                progress_percent: totalBytes > 0 ? Math.round(lastLoaded / totalBytes * 100) : void 0,
                online: getOnlineStatus()
              }
            }
          });
        }, stallTimeout);
      };
      const clearStallTimer = () => {
        if (stallTimer !== null) {
          clearTimeout(stallTimer);
          stallTimer = null;
        }
      };
      if (signal) {
        if (signal.aborted) {
          resolve({ data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } });
          return;
        }
        signal.addEventListener(
          "abort",
          () => {
            clearStallTimer();
            xhr.abort();
          },
          { once: true }
        );
      }
      xhr.upload.addEventListener("progress", (event) => {
        resetStallTimer();
        lastLoaded = event.loaded;
        totalBytes = event.total || totalBytes;
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round(event.loaded / event.total * 100));
        }
      });
      xhr.addEventListener("load", () => {
        clearStallTimer();
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          resolve({ data: null, error: null });
        } else {
          resolve({
            data: null,
            error: {
              code: "upload_error",
              message: `S3 upload failed: ${xhr.status}`,
              status: xhr.status,
              details: {
                transport: "xhr",
                bytes_sent: lastLoaded,
                total_bytes: totalBytes,
                progress_percent: totalBytes > 0 ? Math.round(lastLoaded / totalBytes * 100) : void 0,
                online: getOnlineStatus()
              }
            }
          });
        }
      });
      xhr.addEventListener("error", () => {
        clearStallTimer();
        resolve({
          data: null,
          error: {
            code: "upload_error",
            message: "S3 upload failed",
            status: 0,
            details: {
              transport: "xhr",
              bytes_sent: lastLoaded,
              total_bytes: totalBytes,
              progress_percent: totalBytes > 0 ? Math.round(lastLoaded / totalBytes * 100) : void 0,
              online: getOnlineStatus()
            }
          }
        });
      });
      xhr.addEventListener("abort", () => {
        clearStallTimer();
        if (!signal?.aborted) return;
        resolve({
          data: null,
          error: { code: "aborted", message: "Upload aborted", status: 0 }
        });
      });
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.send(file);
      resetStallTimer();
    });
  }
  // --------------------------------------------------------------------------
  // Private: Part upload with retry
  // --------------------------------------------------------------------------
  async uploadPartWithRetry(url, blob, signal, partNumber, sessionId, telemetry) {
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (signal?.aborted) return { error: "Upload aborted", code: "aborted" };
      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt] ?? 0;
        if (delay > 0) await sleep2(delay);
        telemetry?.emit(sessionId || "", "upload.retried", { attempt, part_number: partNumber });
      }
      const controller = new AbortController();
      let partSignalCleanup;
      const combinedSignal = signal ? AbortSignal.any?.([signal, controller.signal]) ?? (() => {
        const onAbort = () => controller.abort();
        signal.addEventListener("abort", onAbort, { once: true });
        partSignalCleanup = () => signal.removeEventListener("abort", onAbort);
        return controller.signal;
      })() : controller.signal;
      const timer = setTimeout(() => controller.abort(), DEFAULT_STALL_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: "PUT",
          body: blob,
          signal: combinedSignal
        });
        clearTimeout(timer);
        partSignalCleanup?.();
        if (response.ok) {
          const etag = response.headers.get("etag");
          if (!etag) {
            if (attempt === RETRY_DELAYS.length - 1) {
              return { error: "Part upload succeeded but ETag missing \u2014 cannot verify integrity", code: "s3_error" };
            }
            continue;
          }
          return { etag };
        }
        if (NON_RETRYABLE_STATUS_CODES.has(response.status)) {
          return { error: `Part upload failed: ${response.status}`, status: response.status, code: "s3_error" };
        }
        if (attempt === RETRY_DELAYS.length - 1) {
          return {
            error: `Part upload failed after retries: ${response.status}`,
            status: response.status,
            code: "s3_error"
          };
        }
      } catch (err) {
        clearTimeout(timer);
        partSignalCleanup?.();
        if (signal?.aborted) return { error: "Upload aborted", code: "aborted" };
        const isStall = controller.signal.aborted && !signal?.aborted;
        if (attempt === RETRY_DELAYS.length - 1) {
          return {
            error: isStall ? `Part upload stalled (no progress for ${DEFAULT_STALL_TIMEOUT_MS / 1e3}s)` : err instanceof Error ? err.message : "Part upload failed",
            code: isStall ? "upload_stalled" : "network_error"
          };
        }
      }
    }
    return { error: "Part upload failed after retries", code: "network_error" };
  }
  // --------------------------------------------------------------------------
  // Private: Helpers
  // --------------------------------------------------------------------------
  shouldUseMultipart(file, options) {
    if (options?.forceMultipart) return true;
    const threshold = isSlowNetwork() ? MULTIPART_THRESHOLD_SLOW : MULTIPART_THRESHOLD;
    return file.size >= threshold;
  }
  defaultChunkSize(fileSize) {
    if (fileSize > 512 * 1024 * 1024) return 16 * 1024 * 1024;
    const effectiveType = getNetworkEffectiveType();
    if (effectiveType === "slow-2g" || effectiveType === "2g") return 5 * 1024 * 1024;
    if (effectiveType === "3g") return 5 * 1024 * 1024;
    return 8 * 1024 * 1024;
  }
  defaultConcurrency() {
    const effectiveType = getNetworkEffectiveType();
    if (effectiveType === "slow-2g" || effectiveType === "2g") return 1;
    if (effectiveType === "3g") return 2;
    return 4;
  }
  async maybeCompress(file, config, sessionId, telemetry) {
    try {
      const { maybeCompressImage } = await import("./upload-compression-VOUJRAIM.mjs");
      return await maybeCompressImage(file, config, sessionId, telemetry);
    } catch {
      return null;
    }
  }
  async reportUploadFailureBestEffort(params, requestOptions) {
    try {
      await this.reportUploadFailure(params, requestOptions);
    } catch {
    }
  }
  getOrCreateTelemetry() {
    if (!this.telemetry) {
      this.telemetry = new UploadTelemetry(this.client);
    }
    return this.telemetry;
  }
  /** Build RequestOptions with X-Upload-Session-Id header for cross-boundary correlation */
  withSessionHeader(sessionId, options) {
    const headers = { "X-Upload-Session-Id": sessionId };
    if (options?.clientContext) {
      return { clientContext: options.clientContext, headers };
    }
    return { headers };
  }
  /**
   * Use ServiceModule's list method but with a cleaner name internally
   * (can't call protected `list` from public method with same name).
   */
  listMethod(path, params, options) {
    return super._list(path, params, options);
  }
};
function sleep2(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function getStallTimeout() {
  return isSlowNetwork() ? SLOW_NETWORK_STALL_TIMEOUT_MS : DEFAULT_STALL_TIMEOUT_MS;
}
function isSlowNetwork() {
  const effectiveType = getNetworkEffectiveType();
  return effectiveType === "slow-2g" || effectiveType === "2g" || effectiveType === "3g";
}
function getNetworkEffectiveType() {
  if (typeof navigator !== "undefined" && "connection" in navigator) {
    const conn = navigator.connection;
    return conn?.effectiveType || "4g";
  }
  return "4g";
}
function getOnlineStatus() {
  if (typeof navigator === "undefined") return void 0;
  return navigator.onLine;
}
function getUploadEnvironmentDiagnostics() {
  const diagnostics = {
    network_type: getNetworkEffectiveType(),
    online: getOnlineStatus()
  };
  if (typeof navigator !== "undefined") {
    const nav = navigator;
    if (typeof nav.hardwareConcurrency === "number") {
      diagnostics.hardware_concurrency = nav.hardwareConcurrency;
    }
    if (typeof nav.deviceMemory === "number") {
      diagnostics.device_memory_gb = nav.deviceMemory;
    }
    if (nav.connection?.downlink != null) {
      diagnostics.downlink_mbps = nav.connection.downlink;
    }
    if (nav.connection?.rtt != null) {
      diagnostics.rtt_ms = nav.connection.rtt;
    }
  }
  if (typeof document !== "undefined") {
    diagnostics.visibility_state = document.visibilityState;
  }
  return diagnostics;
}
function asNumber2(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}

// src/services/upload-strategy.ts
var MULTIPART_THRESHOLD2 = 8 * 1024 * 1024;
var MULTIPART_THRESHOLD_SLOW2 = 1 * 1024 * 1024;
var DEFAULT_STALL_TIMEOUT_MS2 = 45e3;
var SLOW_STALL_TIMEOUT_MS = 9e4;
var CHUNK_SIZES = {
  "slow-2g": 5 * 1024 * 1024,
  "2g": 5 * 1024 * 1024,
  "3g": 5 * 1024 * 1024,
  "4g": 8 * 1024 * 1024,
  unknown: 8 * 1024 * 1024
};
var LARGE_FILE_CHUNK_SIZE = 16 * 1024 * 1024;
var CONCURRENCY = {
  "slow-2g": 1,
  "2g": 1,
  "3g": 2,
  "4g": 4,
  unknown: 4
};
function resolveStrategy(fileSize, overrides) {
  const network = detectNetworkClass();
  const isSlowNetwork2 = network === "slow-2g" || network === "2g" || network === "3g";
  const threshold = isSlowNetwork2 ? MULTIPART_THRESHOLD_SLOW2 : MULTIPART_THRESHOLD2;
  const strategy = overrides?.forceMultipart || fileSize >= threshold ? "multipart" : "direct";
  const chunkSize = overrides?.chunkSize || (fileSize > 512 * 1024 * 1024 ? LARGE_FILE_CHUNK_SIZE : CHUNK_SIZES[network]);
  const concurrency = overrides?.concurrency || adaptConcurrency(network);
  const stallTimeoutMs = isSlowNetwork2 ? SLOW_STALL_TIMEOUT_MS : DEFAULT_STALL_TIMEOUT_MS2;
  return { strategy, chunkSize, concurrency, stallTimeoutMs };
}
function detectNetworkClass() {
  if (typeof navigator === "undefined") return "unknown";
  const conn = navigator.connection;
  if (!conn) return "unknown";
  const effectiveType = conn.effectiveType;
  if (effectiveType === "slow-2g") return "slow-2g";
  if (effectiveType === "2g") return "2g";
  if (effectiveType === "3g") return "3g";
  if (effectiveType === "4g") return "4g";
  return "unknown";
}
function getMeasuredBandwidthMbps() {
  if (typeof navigator === "undefined") return null;
  const conn = navigator.connection;
  return conn?.downlink ?? null;
}
function adaptConcurrency(network) {
  const bandwidth = getMeasuredBandwidthMbps();
  if (bandwidth === null) return CONCURRENCY[network];
  if (bandwidth < 0.5) return 1;
  if (bandwidth < 2) return 2;
  if (bandwidth < 10) return 3;
  return 5;
}

// src/services/upload-engine.ts
var DEFAULT_CONFIG = {
  multipartEnabled: true,
  multipartAllowlist: [],
  telemetry: {}
};
function createUploadPlan(fileSize, contentType, options = {}, engineConfig = {}) {
  const config = { ...DEFAULT_CONFIG, ...engineConfig };
  const multipartAllowed = config.multipartEnabled && (config.multipartAllowlist.length === 0 || options.appId != null && config.multipartAllowlist.includes(options.appId));
  const resolved = resolveStrategy(fileSize, {
    forceMultipart: multipartAllowed && options.forceMultipart,
    chunkSize: options.chunkSize,
    concurrency: options.maxConcurrency
  });
  const strategy = resolved.strategy === "multipart" && !multipartAllowed ? "direct" : resolved.strategy;
  const isBrowser = typeof window !== "undefined";
  const isCompressibleType = contentType.startsWith("image/") && !contentType.includes("gif") && !contentType.includes("svg") && !contentType.includes("webp") && !contentType.includes("avif");
  const shouldCompress = isBrowser && !options.skipCompression && isCompressibleType && fileSize >= 100 * 1024;
  const shouldResume = isBrowser && strategy === "multipart" && options.resume !== "off";
  const totalParts = strategy === "multipart" ? Math.ceil(fileSize / resolved.chunkSize) : 1;
  return {
    strategy,
    chunkSize: resolved.chunkSize,
    concurrency: resolved.concurrency,
    stallTimeoutMs: resolved.stallTimeoutMs,
    shouldCompress,
    shouldResume,
    totalParts
  };
}
function calculateTotalParts(fileSize, chunkSize) {
  return Math.ceil(fileSize / chunkSize);
}
function getPartRange(partNumber, chunkSize, totalSize) {
  const start = (partNumber - 1) * chunkSize;
  const end = Math.min(start + chunkSize, totalSize);
  return { start, end, size: end - start };
}

// src/services/upload-to-s3.ts
var DEFAULT_RETRY_DELAYS = [0, 1e3, 3e3];
var DEFAULT_STALL_TIMEOUT_MS3 = 45e3;
var DEFAULT_CONCURRENCY = 3;
async function uploadSingleToS3(url, file, options) {
  const maxRetries = options?.maxRetries ?? 3;
  const retryDelays = DEFAULT_RETRY_DELAYS.slice(0, maxRetries);
  const stallTimeout = options?.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS3;
  for (let attempt = 0; attempt < retryDelays.length; attempt++) {
    if (attempt > 0) {
      await sleep3(retryDelays[attempt] || 1e3);
    }
    if (options?.signal?.aborted) {
      return { success: false, error: "Upload aborted" };
    }
    const result = await doSinglePut(url, file, options?.onProgress, options?.signal, stallTimeout);
    if (result === "success") return { success: true };
    if (result === "abort") return { success: false, error: "Upload aborted" };
  }
  return { success: false, error: "Upload failed after retries" };
}
function doSinglePut(url, file, onProgress, signal, stallTimeoutMs) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let stallTimer = null;
    const resetStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      if (stallTimeoutMs) {
        stallTimer = setTimeout(() => {
          xhr.abort();
          resolve("stall");
        }, stallTimeoutMs);
      }
    };
    xhr.upload.addEventListener("progress", (e) => {
      resetStallTimer();
      if (e.lengthComputable && onProgress) {
        onProgress({
          loaded: e.loaded,
          total: e.total,
          percentage: Math.round(e.loaded / e.total * 100)
        });
      }
    });
    xhr.addEventListener("load", () => {
      if (stallTimer) clearTimeout(stallTimer);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve("success");
      } else if (xhr.status >= 500) {
        resolve("retry");
      } else {
        resolve("retry");
      }
    });
    xhr.addEventListener("error", () => {
      if (stallTimer) clearTimeout(stallTimer);
      resolve("retry");
    });
    xhr.addEventListener("abort", () => {
      if (stallTimer) clearTimeout(stallTimer);
    });
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          xhr.abort();
          if (stallTimer) clearTimeout(stallTimer);
          resolve("abort");
        },
        { once: true }
      );
    }
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    resetStallTimer();
    xhr.send(file);
  });
}
async function uploadMultipartToS3(file, config, options) {
  const { partSizeBytes, totalParts, partUrls: initialPartUrls, fetchMoreUrls } = config;
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;
  const maxRetries = options?.maxRetries ?? 3;
  const stallTimeoutMs = options?.stallTimeoutMs;
  const completedParts = [];
  const availableUrls = /* @__PURE__ */ new Map();
  for (const pu of initialPartUrls) {
    availableUrls.set(pu.partNumber, pu.url);
  }
  let totalUploaded = 0;
  for (let i = 0; i < totalParts; i += concurrency) {
    if (options?.signal?.aborted) {
      return { success: false, error: "Upload aborted" };
    }
    const batchPartNumbers = [];
    for (let j = i; j < Math.min(i + concurrency, totalParts); j++) {
      batchPartNumbers.push(j + 1);
    }
    const missingUrls = batchPartNumbers.filter((p) => !availableUrls.has(p));
    if (missingUrls.length > 0 && fetchMoreUrls) {
      const fetched = await fetchMoreUrls(missingUrls);
      if (fetched) {
        for (const pu of fetched) availableUrls.set(pu.partNumber, pu.url);
      }
    }
    const results = await Promise.all(
      batchPartNumbers.map(async (partNum) => {
        const url = availableUrls.get(partNum);
        if (!url) return { partNum, error: "No URL available" };
        const start = (partNum - 1) * partSizeBytes;
        const end = Math.min(start + partSizeBytes, file.size);
        const blob = file.slice(start, end);
        let result = await uploadPartWithRetry(url, blob, partNum, maxRetries, options?.signal, stallTimeoutMs);
        if (!result && fetchMoreUrls) {
          const freshUrls = await fetchMoreUrls([partNum]);
          if (freshUrls?.[0]) {
            availableUrls.set(partNum, freshUrls[0].url);
            result = await uploadPartWithRetry(
              freshUrls[0].url,
              blob,
              partNum,
              maxRetries,
              options?.signal,
              stallTimeoutMs
            );
          }
        }
        if (result) {
          totalUploaded += end - start;
          options?.onProgress?.({
            loaded: totalUploaded,
            total: file.size,
            percentage: Math.round(totalUploaded / file.size * 100)
          });
          return { partNum, etag: result.etag };
        }
        return { partNum, error: "Part upload failed after retries" };
      })
    );
    for (const result of results) {
      if ("error" in result) {
        return { success: false, error: `Part ${result.partNum}: ${result.error}` };
      }
      completedParts.push({ partNumber: result.partNum, etag: result.etag });
    }
  }
  return {
    success: true,
    parts: completedParts.sort((a, b) => a.partNumber - b.partNumber)
  };
}
async function uploadPartWithRetry(url, blob, _partNumber, maxRetries, signal, stallTimeoutMs) {
  const retryDelays = DEFAULT_RETRY_DELAYS.slice(0, maxRetries);
  for (let attempt = 0; attempt < retryDelays.length; attempt++) {
    if (attempt > 0) await sleep3(retryDelays[attempt] || 1e3);
    if (signal?.aborted) return null;
    const result = await doPartPut(url, blob, signal, stallTimeoutMs);
    if (result === "abort") return null;
    if (typeof result === "object") return result;
  }
  return null;
}
function doPartPut(url, blob, signal, stallTimeoutMs) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let stallTimer = null;
    let resolved = false;
    const settle = (result) => {
      if (resolved) return;
      resolved = true;
      if (stallTimer) clearTimeout(stallTimer);
      resolve(result);
    };
    const resetStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      if (stallTimeoutMs) {
        stallTimer = setTimeout(() => {
          xhr.abort();
          settle("retry");
        }, stallTimeoutMs);
      }
    };
    xhr.upload.addEventListener("progress", () => {
      resetStallTimer();
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("etag");
        if (etag) {
          settle({ etag });
        } else {
          settle("retry");
        }
      } else if (xhr.status === 403) {
        settle("retry");
      } else if (xhr.status >= 500) {
        settle("retry");
      } else {
        settle("retry");
      }
    });
    xhr.addEventListener("error", () => settle("retry"));
    xhr.addEventListener("abort", () => {
      if (!resolved) settle("abort");
    });
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          xhr.abort();
          settle("abort");
        },
        { once: true }
      );
    }
    xhr.open("PUT", url);
    resetStallTimer();
    xhr.send(blob);
  });
}
function sleep3(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// src/services/realtime.ts
var DEFAULT_RECONNECT_BASE_MS = 1e3;
var MAX_RECONNECT_MS = 3e4;
var HEARTBEAT_INTERVAL_MS = 3e4;
var RealtimeService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/realtime";
    this.ws = null;
    this.subscriptions = /* @__PURE__ */ new Map();
    this.presenceCallbacks = /* @__PURE__ */ new Map();
    this.statusCallbacks = /* @__PURE__ */ new Set();
    this._status = "disconnected";
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.authenticated = false;
  }
  /** Current connection status */
  get status() {
    return this._status;
  }
  // --------------------------------------------------------------------------
  // Subscribe / Unsubscribe
  // --------------------------------------------------------------------------
  /**
   * Subscribe to a channel. Connects WebSocket on first call.
   * Returns an unsubscribe function.
   */
  subscribe(channel, callback) {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, /* @__PURE__ */ new Set());
    }
    this.subscriptions.get(channel).add(callback);
    if (this._status === "disconnected") {
      this.connect();
    } else if (this.authenticated) {
      this.sendWs({ type: "subscribe", channel });
    }
    return () => {
      const subs = this.subscriptions.get(channel);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscriptions.delete(channel);
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.sendWs({ type: "unsubscribe", channel });
          }
        }
      }
    };
  }
  // --------------------------------------------------------------------------
  // Publish
  // --------------------------------------------------------------------------
  /** Publish data to a channel via WebSocket. */
  publish(channel, data) {
    if (this._status !== "connected" || !this.authenticated) {
      throw new Error("Cannot publish: not connected");
    }
    this.sendWs({ type: "publish", channel, data });
  }
  // --------------------------------------------------------------------------
  // Presence
  // --------------------------------------------------------------------------
  /** Join a presence channel with optional user data. */
  joinPresence(channel, userData) {
    if (this._status !== "connected") {
      throw new Error("Cannot join presence: not connected");
    }
    this.sendWs({ type: "presence_join", channel, user_data: userData });
  }
  /** Leave a presence channel. */
  leavePresence(channel) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendWs({ type: "presence_leave", channel });
    }
  }
  /** Listen for presence events on a channel. Returns unsubscribe function. */
  onPresence(channel, callback) {
    if (!this.presenceCallbacks.has(channel)) {
      this.presenceCallbacks.set(channel, /* @__PURE__ */ new Set());
    }
    this.presenceCallbacks.get(channel).add(callback);
    return () => {
      const cbs = this.presenceCallbacks.get(channel);
      if (cbs) {
        cbs.delete(callback);
        if (cbs.size === 0) this.presenceCallbacks.delete(channel);
      }
    };
  }
  // --------------------------------------------------------------------------
  // Server-side broadcast (HTTP endpoints)
  // --------------------------------------------------------------------------
  /** Broadcast to all connections for this application. */
  async broadcast(event, data, options) {
    return this.post("/broadcast", { event, data }, options);
  }
  /** Broadcast to a specific channel. */
  async broadcastToChannel(channel, event, data, options) {
    return this.post(`/broadcast/channel/${channel}`, { event, data }, options);
  }
  /** Send to a specific user's connections. */
  async sendToUser(userId, event, data, options) {
    return this.post(`/broadcast/user/${userId}`, { event, data }, options);
  }
  // --------------------------------------------------------------------------
  // Connection Lifecycle
  // --------------------------------------------------------------------------
  /** Listen for connection status changes. */
  onStatusChange(callback) {
    this.statusCallbacks.add(callback);
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }
  /** Disconnect and clean up all subscriptions. */
  disconnect() {
    this.clearTimers();
    this.subscriptions.clear();
    this.presenceCallbacks.clear();
    this.statusCallbacks.clear();
    this.authenticated = false;
    this.reconnectAttempt = 0;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
  }
  // --------------------------------------------------------------------------
  // Private: WebSocket management
  // --------------------------------------------------------------------------
  connect() {
    if (this._status === "connecting" || this._status === "connected") return;
    const baseUrl = this.client.getBaseUrl();
    const wsUrl = baseUrl.replace(/^http/, "ws") + "/v1/realtime/ws";
    this.setStatus(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");
    try {
      this.ws = new WebSocket(wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.authenticate();
      this.startHeartbeat();
    };
    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch {
      }
    };
    this.ws.onclose = () => {
      this.authenticated = false;
      this.clearHeartbeat();
      this.scheduleReconnect();
    };
    this.ws.onerror = () => {
    };
  }
  authenticate() {
    const token = this.client.getSessionToken();
    const appId = this.client.getApplicationId();
    this.sendWs({
      type: "auth",
      token: token || void 0,
      app_id: appId || void 0
    });
  }
  handleMessage(msg) {
    const type = msg.type;
    switch (type) {
      case "auth_success":
        this.authenticated = true;
        this.setStatus("connected");
        for (const channel of this.subscriptions.keys()) {
          this.sendWs({ type: "subscribe", channel });
        }
        break;
      case "subscribed":
        break;
      case "message":
        this.dispatchMessage(msg.channel, msg.data);
        break;
      case "error":
        break;
      case "presence_state":
        this.dispatchPresence({
          type: "state",
          channel: msg.channel,
          members: msg.members
        });
        break;
      case "presence_join":
        this.dispatchPresence({
          type: "join",
          channel: msg.channel,
          user: msg.user
        });
        break;
      case "presence_leave":
        this.dispatchPresence({
          type: "leave",
          channel: msg.channel,
          user_id: msg.user_id
        });
        break;
    }
  }
  dispatchMessage(channel, data) {
    const subs = this.subscriptions.get(channel);
    if (subs) {
      for (const cb of subs) {
        try {
          cb(data, channel);
        } catch {
        }
      }
    }
  }
  dispatchPresence(event) {
    const cbs = this.presenceCallbacks.get(event.channel);
    if (cbs) {
      for (const cb of cbs) {
        try {
          cb(event);
        } catch {
        }
      }
    }
  }
  sendWs(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
  // --------------------------------------------------------------------------
  // Private: Reconnection
  // --------------------------------------------------------------------------
  scheduleReconnect() {
    if (this.subscriptions.size === 0 && this.presenceCallbacks.size === 0) {
      this.setStatus("disconnected");
      return;
    }
    this.setStatus("reconnecting");
    const delay = this.getReconnectDelay();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempt++;
      this.connect();
    }, delay);
  }
  getReconnectDelay() {
    const exponential = DEFAULT_RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt);
    const jitter = Math.random() * 0.3 * exponential;
    return Math.min(exponential + jitter, MAX_RECONNECT_MS);
  }
  // --------------------------------------------------------------------------
  // Private: Heartbeat
  // --------------------------------------------------------------------------
  startHeartbeat() {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send("ping");
      }
    }, HEARTBEAT_INTERVAL_MS);
  }
  clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  clearTimers() {
    this.clearHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
  // --------------------------------------------------------------------------
  // Private: Status
  // --------------------------------------------------------------------------
  setStatus(status) {
    if (this._status === status) return;
    this._status = status;
    for (const cb of this.statusCallbacks) {
      try {
        cb(status);
      } catch {
      }
    }
  }
};

// src/services/video.ts
var DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;
var MIN_CHUNK_SIZE = 5 * 1024 * 1024;
var VideoService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/videos";
  }
  // --------------------------------------------------------------------------
  // Upload (3-step chunked flow)
  // --------------------------------------------------------------------------
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
  async upload(file, options, requestOptions) {
    if (options?.signal?.aborted) {
      return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
    }
    const chunkSize = Math.max(options?.chunkSize ?? DEFAULT_CHUNK_SIZE, MIN_CHUNK_SIZE);
    const totalChunks = Math.ceil(file.size / chunkSize);
    const filename = options?.filename || file.name || "video";
    const startResult = await this.post(
      "/upload-start",
      {
        filename,
        content_type: file.type || "video/mp4",
        size_bytes: file.size,
        title: options?.title,
        description: options?.description,
        metadata: options?.metadata
      },
      requestOptions
    );
    if (startResult.error) return { data: null, error: startResult.error };
    const { video_id, upload_id } = startResult.data;
    const parts = [];
    for (let i = 0; i < totalChunks; i++) {
      if (options?.signal?.aborted) {
        return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
      }
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);
      const partNumber = i + 1;
      const partResult = await this.uploadPart(video_id, upload_id, partNumber, chunk, options?.signal);
      if (partResult.error) return { data: null, error: partResult.error };
      parts.push({
        part_number: partNumber,
        etag: partResult.data.etag
      });
      if (options?.onProgress) {
        const progress = Math.round(partNumber / totalChunks * 100);
        options.onProgress(progress);
      }
    }
    const completeResult = await this.post(
      `/${video_id}/upload-complete`,
      {
        upload_id,
        parts
      },
      requestOptions
    );
    return completeResult;
  }
  // --------------------------------------------------------------------------
  // Video Operations
  // --------------------------------------------------------------------------
  /** Get video metadata and status. */
  async get(videoId, options) {
    return super._get(`/${videoId}`, options);
  }
  /**
   * Get the HLS master playlist URL for streaming.
   * Returns the playlist URL that can be passed to a video player.
   */
  async getStreamUrl(videoId) {
    const baseUrl = this.client.getBaseUrl();
    return {
      data: { url: `${baseUrl}${this.basePath}/${videoId}/playlist.m3u8` },
      error: null
    };
  }
  /**
   * Track a playback event (view, play, pause, seek, complete, etc.).
   */
  async trackPlayback(videoId, event, options) {
    return this.post(`/${videoId}/track`, event, options);
  }
  /** Get video analytics (views, watch time, etc.). */
  async getAnalytics(videoId, options) {
    return super._get(
      `/${videoId}/analytics`,
      options
    );
  }
  /**
   * Update a video's access mode (public/private).
   * Public videos get 7-day signed URLs; private get 1-hour signed URLs.
   */
  async updateAccessMode(videoId, accessMode, options) {
    return this.patch(`/${videoId}`, { access_mode: accessMode }, options);
  }
  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------
  /** @deprecated Use upload() instead */
  async uploadVideo(file, options) {
    return this.upload(file, {
      metadata: options?.metadata,
      onProgress: options?.onProgress,
      signal: options?.signal
    });
  }
  /** @deprecated Use get() instead */
  async getVideo(id) {
    return this.get(id);
  }
  // --------------------------------------------------------------------------
  // Private: Chunk upload
  // --------------------------------------------------------------------------
  async uploadPart(videoId, uploadId, partNumber, chunk, signal) {
    const formData = new FormData();
    formData.append("file", chunk);
    const path = `${this.basePath}/${videoId}/upload-part?upload_id=${encodeURIComponent(uploadId)}&part_number=${partNumber}`;
    const headers = {
      "x-api-key": this.client.getApiKey()
    };
    const token = this.client.getSessionToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    try {
      const response = await fetch(`${this.client.getBaseUrl()}${path}`, {
        method: "POST",
        headers,
        body: formData,
        signal
      });
      const data = await response.json();
      if (!response.ok) {
        return {
          data: null,
          error: {
            code: data?.error?.code || "upload_error",
            message: data?.error?.message || data?.message || "Part upload failed",
            status: response.status
          }
        };
      }
      const result = data?.data !== void 0 ? data.data : data;
      return { data: result, error: null };
    } catch (err) {
      if (signal?.aborted) {
        return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
      }
      return {
        data: null,
        error: {
          code: "upload_error",
          message: err instanceof Error ? err.message : "Part upload failed",
          status: 0
        }
      };
    }
  }
};

// src/services/data.ts
var DataService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/data";
  }
  // --------------------------------------------------------------------------
  // Collections
  // --------------------------------------------------------------------------
  async createCollection(name, schema, options) {
    return this.post("/collections", { name, schema }, options);
  }
  async listCollections(options) {
    return this._get("/collections", options);
  }
  async deleteCollection(name, options) {
    return this.del(`/collections/${name}`, options);
  }
  // --------------------------------------------------------------------------
  // Documents — CRUD
  // --------------------------------------------------------------------------
  async create(collection, data, options) {
    return this.post(`/${collection}/documents`, { data }, options);
  }
  async get(collection, docId, options) {
    return this._get(`/${collection}/documents/${docId}`, options);
  }
  async update(collection, docId, data, options) {
    return this.patch(`/${collection}/documents/${docId}`, { data }, options);
  }
  async delete(collection, docId, options) {
    return this.del(`/${collection}/documents/${docId}`, options);
  }
  // --------------------------------------------------------------------------
  // Documents — Query & Aggregate
  // --------------------------------------------------------------------------
  async query(collection, options, requestOptions) {
    const filters = (options?.filters ?? []).map((f) => {
      if (f.operator === "in" && !f.values && f.value != null) {
        return { operator: f.operator, field: f.field, values: Array.isArray(f.value) ? f.value : [f.value] };
      }
      return f;
    });
    const body = {
      filters,
      sort: options?.sort ?? [],
      page: options?.page ?? 1,
      per_page: options?.perPage ?? 20
    };
    const response = await this.post(`/${collection}/query`, body, requestOptions);
    if (response.error) {
      return {
        data: [],
        metadata: { total: 0, totalPages: 0, page: body.page, perPage: body.per_page },
        error: response.error
      };
    }
    const raw = response.data;
    const documents = raw?.documents ?? raw?.data ?? [];
    const total = raw?.total ?? documents.length;
    const totalPages = raw?.total_pages ?? (total > 0 ? Math.ceil(total / body.per_page) : 0);
    return {
      data: documents,
      metadata: {
        total,
        totalPages,
        page: raw?.page ?? body.page,
        perPage: raw?.per_page ?? body.per_page
      },
      error: null
    };
  }
  async aggregate(collection, options, requestOptions) {
    return this.post(`/${collection}/aggregate`, options, requestOptions);
  }
  async myDocuments(collection, options, requestOptions) {
    return this._list(`/${collection}/my-documents`, options, requestOptions);
  }
  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------
  /** @deprecated Use create() instead */
  async createDocument(collection, data) {
    return this.create(collection, data);
  }
  /** @deprecated Use get() instead */
  async getDocument(collection, id) {
    return this.get(collection, id);
  }
  /** @deprecated Use update() instead */
  async updateDocument(collection, id, data) {
    return this.update(collection, id, data);
  }
  /** @deprecated Use delete() instead */
  async deleteDocument(collection, id) {
    return this.delete(collection, id);
  }
  /** @deprecated Use query() instead */
  async queryDocuments(collection, options) {
    return this.query(collection, options);
  }
};

// src/services/chat.ts
var ChatService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/chat";
  }
  // --------------------------------------------------------------------------
  // Conversations
  // --------------------------------------------------------------------------
  async createConversation(data, options) {
    return this.post("/conversations", data, options);
  }
  async listConversations(params, requestOptions) {
    return this._list("/conversations", params, requestOptions);
  }
  async getConversation(id, options) {
    return this._get(`/conversations/${id}`, options);
  }
  async addParticipant(conversationId, userId, options) {
    return this.post(`/conversations/${conversationId}/participants`, { user_id: userId }, options);
  }
  async removeParticipant(conversationId, userId, options) {
    return this.del(`/conversations/${conversationId}/participants/${userId}`, options);
  }
  // --------------------------------------------------------------------------
  // Messages
  // --------------------------------------------------------------------------
  async sendMessage(conversationId, data, options) {
    return this.post(`/conversations/${conversationId}/messages`, data, options);
  }
  async getMessages(conversationId, options, requestOptions) {
    return this._get(
      this.withQuery(`/conversations/${conversationId}/messages`, options),
      requestOptions
    );
  }
  async editMessage(messageId, data, options) {
    return this.patch(`/messages/${messageId}`, data, options);
  }
  async deleteMessage(messageId, options) {
    return this.del(`/messages/${messageId}`, options);
  }
  async addReaction(messageId, data, options) {
    return this.post(`/messages/${messageId}/reactions`, data, options);
  }
  // --------------------------------------------------------------------------
  // Typing & Read Receipts
  // --------------------------------------------------------------------------
  async sendTyping(conversationId, options) {
    return this.post(`/conversations/${conversationId}/typing`, void 0, options);
  }
  async markRead(conversationId, options) {
    return this.post(`/conversations/${conversationId}/read`, void 0, options);
  }
  async getReadStatus(conversationId, options) {
    return this._get(`/conversations/${conversationId}/read-status`, options);
  }
  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------
  /** @deprecated Use createConversation() instead */
  async createChat(data) {
    return this.createConversation(data);
  }
};

// src/services/social.ts
var SocialService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/social";
  }
  // --------------------------------------------------------------------------
  // Follow / Unfollow
  // --------------------------------------------------------------------------
  async follow(userId, options) {
    return this.post(`/users/${userId}/follow`, void 0, options);
  }
  async unfollow(userId, options) {
    return this.del(`/users/${userId}/follow`, options);
  }
  async getFollowers(userId, params, requestOptions) {
    return this._list(`/users/${userId}/followers`, params, requestOptions);
  }
  async getFollowing(userId, params, requestOptions) {
    return this._list(`/users/${userId}/following`, params, requestOptions);
  }
  async getFollowStatus(userId, options) {
    return this._get(`/users/${userId}/follow-status`, options);
  }
  // --------------------------------------------------------------------------
  // Posts
  // --------------------------------------------------------------------------
  async createPost(data, options) {
    return this.post("/posts", data, options);
  }
  async getPost(postId, options) {
    return this._get(`/posts/${postId}`, options);
  }
  async deletePost(postId, options) {
    return this.del(`/posts/${postId}`, options);
  }
  async getUserPosts(userId, params, requestOptions) {
    return this._list(`/users/${userId}/posts`, params, requestOptions);
  }
  async getFeed(options, requestOptions) {
    return this._list("/feed", options, requestOptions);
  }
  // --------------------------------------------------------------------------
  // Likes
  // --------------------------------------------------------------------------
  async like(targetType, targetId, options) {
    return this.post(`/${targetType}/${targetId}/like`, void 0, options);
  }
  async unlike(targetType, targetId, options) {
    return this.del(`/${targetType}/${targetId}/like`, options);
  }
  async getLikes(targetType, targetId, params, requestOptions) {
    return this._list(`/${targetType}/${targetId}/likes`, params, requestOptions);
  }
  // --------------------------------------------------------------------------
  // Comments
  // --------------------------------------------------------------------------
  async comment(postId, data, options) {
    return this.post(`/posts/${postId}/comments`, data, options);
  }
  async getComments(postId, params, requestOptions) {
    return this._list(`/posts/${postId}/comments`, params, requestOptions);
  }
  // --------------------------------------------------------------------------
  // Activity Feed
  // --------------------------------------------------------------------------
  async getActivity(params, requestOptions) {
    return this._list("/activity", params, requestOptions);
  }
  async markActivityRead(activityId, options) {
    return this.patch(`/activity/${activityId}/read`, {}, options);
  }
  async markAllRead(options) {
    return this.patch("/activity/read-all", {}, options);
  }
  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------
  /** @deprecated Use comment() instead */
  async addComment(postId, data) {
    return this.comment(postId, data);
  }
};

// src/services/referrals.ts
var ReferralsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/referrals";
  }
  /**
   * Get current user's referral code, share link, campaign, and stats.
   * Requires member auth.
   */
  async getMyReferral(options) {
    return this._get("/me", options);
  }
  /**
   * Generate a tracked share link. The `channel` param records where
   * the share was initiated (e.g., 'whatsapp', 'email', 'copy').
   * Requires member auth.
   */
  async createShareLink(channel, options) {
    return this.post("/links", channel ? { channel } : void 0, options);
  }
  /**
   * Get referral analytics for the current user over the last N days.
   * Requires member auth.
   */
  async getMyAnalytics(days, options) {
    const query = days ? `?days=${days}` : "";
    return this._get(`/me/analytics${query}`, options);
  }
  /**
   * Resolve a referral code to its campaign info.
   * Public endpoint — no member auth required, only API key.
   */
  async resolveCode(code, options) {
    return this._get(`/public?rc=${encodeURIComponent(code)}`, options);
  }
};

// src/services/billing.ts
var BillingService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/billing";
  }
  // --------------------------------------------------------------------------
  // Customers
  // --------------------------------------------------------------------------
  async createCustomer(data, options) {
    return this.post("/customers", data, options);
  }
  async addPaymentMethod(data, options) {
    return this.post("/payment-methods", data, options);
  }
  // --------------------------------------------------------------------------
  // Subscriptions
  // --------------------------------------------------------------------------
  async subscribe(data, options) {
    return this.post("/subscriptions", data, options);
  }
  async listSubscriptions(params, options) {
    return this._list("/subscriptions", params, options);
  }
  async cancelSubscription(id, options) {
    return this.post(`/subscriptions/${id}/cancel`, void 0, options);
  }
  async resumeSubscription(id, options) {
    return this.post(`/subscriptions/${id}/resume`, void 0, options);
  }
  async upgradeSubscription(id, data, options) {
    return this.patch(`/subscriptions/${id}/upgrade`, data, options);
  }
  // --------------------------------------------------------------------------
  // Usage
  // --------------------------------------------------------------------------
  async reportUsage(data, options) {
    return this.post("/usage", data, options);
  }
  async getUsageSummary(options) {
    return this._get("/usage/summary", options);
  }
  // --------------------------------------------------------------------------
  // Invoices
  // --------------------------------------------------------------------------
  async listInvoices(params, options) {
    return this._list("/invoices", params, options);
  }
  async getInvoice(id, options) {
    return this._get(`/invoices/${id}`, options);
  }
  async payInvoice(id, options) {
    return this.post(`/invoices/${id}/pay`, void 0, options);
  }
  async getInvoicePdf(id, options) {
    return this._get(`/invoices/${id}/pdf`, options);
  }
  // --------------------------------------------------------------------------
  // Connected Accounts (Marketplace)
  // --------------------------------------------------------------------------
  async createConnectedAccount(data, options) {
    return this.post("/connected-accounts", data, options);
  }
  async getConnectedAccount(id, options) {
    return this._get(`/connected-accounts/${id}`, options);
  }
  async getMyConnectedAccount(options) {
    return this._get("/connected-accounts/me", options);
  }
  async createOnboardingLink(id, data, options) {
    return this.post(`/connected-accounts/${id}/onboarding-link`, data, options);
  }
  async getAccountBalance(id, options) {
    return this._get(`/connected-accounts/${id}/balance`, options);
  }
  async createAccountSession(id, options) {
    return this.post(`/connected-accounts/${id}/account-session`, void 0, options);
  }
  // --------------------------------------------------------------------------
  // Config
  // --------------------------------------------------------------------------
  async getPublishableKey(options) {
    return this._get("/config/publishable-key", options);
  }
  // --------------------------------------------------------------------------
  // Payments (Marketplace)
  // --------------------------------------------------------------------------
  async createPayment(data, options) {
    return this.post("/payments", data, options);
  }
  async getPayment(id, options) {
    return this._get(`/payments/${id}`, options);
  }
  async listPayments(params, options) {
    return this._list("/payments", params, options);
  }
  // --------------------------------------------------------------------------
  // Refunds
  // --------------------------------------------------------------------------
  async refundPayment(id, data, options) {
    return this.post(`/payments/${id}/refund`, data, options);
  }
  // --------------------------------------------------------------------------
  // Payouts
  // --------------------------------------------------------------------------
  async getPayoutHistory(accountId, params, options) {
    return this._list(`/connected-accounts/${accountId}/payouts`, params, options);
  }
  async getPayoutSchedule(accountId, options) {
    return this._get(`/connected-accounts/${accountId}/payout-schedule`, options);
  }
  async setPayoutSchedule(accountId, data, options) {
    return this.put(`/connected-accounts/${accountId}/payout-schedule`, data, options);
  }
  // --------------------------------------------------------------------------
  // Ledger
  // --------------------------------------------------------------------------
  async getTransactions(params, options) {
    return this._list("/transactions", params, options);
  }
  async getTransactionSummary(params, options) {
    return this._get(
      this.withQuery("/transactions/summary", params),
      options
    );
  }
  // --------------------------------------------------------------------------
  // Setup Sessions
  // --------------------------------------------------------------------------
  async createSetupSession(data, options) {
    return this.post("/setup-sessions", data, options);
  }
  // --------------------------------------------------------------------------
  // Connected Account Operations: Products, Prices, Subscriptions, Transfers
  // --------------------------------------------------------------------------
  async createProduct(data, options) {
    return this.post("/products", data, options);
  }
  async createPrice(data, options) {
    return this.post("/prices", data, options);
  }
  async deactivatePrice(id, options) {
    return this.post(`/prices/${id}/deactivate`, void 0, options);
  }
  async createConnectedSubscription(data, options) {
    return this.post("/connected-subscriptions", data, options);
  }
  async cancelConnectedSubscription(id, data, options) {
    return this.post(`/connected-subscriptions/${id}/cancel`, data, options);
  }
  async listConnectedSubscriptions(params, options) {
    return this._list(
      "/connected-subscriptions",
      params,
      options
    );
  }
  async createConnectedSetupIntent(data, options) {
    return this.post("/connected-setup-intents", data, options);
  }
  async createTransfer(data, options) {
    return this.post("/transfers", data, options);
  }
  async syncPaymentStatus(id, options) {
    return this.post(`/payments/${id}/sync`, void 0, options);
  }
  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------
  /** @deprecated Use subscribe() instead */
  async createSubscription(data) {
    return this.subscribe(data);
  }
  /** @deprecated Use listInvoices() instead */
  async getInvoices(params) {
    return this.listInvoices(params);
  }
};

// src/services/analytics.ts
var AnalyticsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/analytics";
  }
  // --------------------------------------------------------------------------
  // Event Tracking (v2 — JetStream buffered)
  // --------------------------------------------------------------------------
  async track(event, properties, userId, options) {
    const payload = { event_name: event, properties, user_id: userId };
    if (!userId && !this.client.isAuthenticated()) {
      payload.anonymous_id = this.client.getAnonymousId();
    }
    return this.post("/v2/events", payload, options);
  }
  async trackBatch(events, options) {
    const mapped = events.map(({ event, ...rest }) => ({ event_name: event, ...rest }));
    return this.post("/v2/events/batch", { events: mapped }, options);
  }
  async trackPageView(data, options) {
    return this.post("/page-view", data, options);
  }
  // --------------------------------------------------------------------------
  // Identity
  // --------------------------------------------------------------------------
  async identify(userId, traits, anonymousId, options) {
    return this.post(
      "/identify",
      { user_id: userId, traits, anonymous_id: anonymousId },
      options
    );
  }
  async alias(userId, anonymousId, options) {
    return this.post("/alias", { user_id: userId, anonymous_id: anonymousId }, options);
  }
  // --------------------------------------------------------------------------
  // Query & Aggregations
  // --------------------------------------------------------------------------
  async queryEvents(filters) {
    return this._list("/events", filters);
  }
  async getAggregations(filters) {
    return this._get(this.withQuery("/aggregations", filters));
  }
  async getTopEvents(filters) {
    return this._get(this.withQuery("/top-events", filters));
  }
  async getActiveUsers() {
    return this._get("/users/active");
  }
  // --------------------------------------------------------------------------
  // Funnels
  // --------------------------------------------------------------------------
  async createFunnel(data) {
    return this.post("/funnels", data);
  }
  async listFunnels() {
    return this._get("/funnels");
  }
  async getFunnelConversions(id) {
    return this._get(`/funnels/${id}/conversions`);
  }
  // --------------------------------------------------------------------------
  // Custom Metrics
  // --------------------------------------------------------------------------
  async trackMetric(data, options) {
    return this.post("/metrics", data, options);
  }
  async queryMetrics(filters) {
    return this._get(this.withQuery("/metrics/query", filters));
  }
  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------
  /** @deprecated Use queryEvents() instead */
  async query(filters) {
    return this._get(this.withQuery("/events", filters));
  }
};

// src/services/flags.ts
var FlagsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/flags";
  }
  async evaluate(flagKey, context = {}, environment = "prod", options) {
    return this.post("/evaluate", { flag_key: flagKey, environment, context }, options);
  }
  async evaluateBatch(flagKeys, context = {}, environment = "prod", options) {
    return this.post(
      "/evaluate/batch",
      { flag_keys: flagKeys, environment, context },
      options
    );
  }
  async evaluateAll(context = {}, environment = "prod", options) {
    return this.post("/evaluate/all", { environment, context }, options);
  }
  async list(params, options) {
    return this._get(
      this.withQuery("", {
        application_id: params?.applicationId,
        status: params?.status,
        search: params?.search
      }),
      options
    );
  }
  async get(id, options) {
    return this._get(`/${id}`, options);
  }
  async create(data, params, options) {
    const path = this.withQuery("", { application_id: params?.applicationId });
    return this.post(path, data, options);
  }
  async update(id, data, options) {
    return this.patch(`/${id}`, data, options);
  }
  async archive(id, options) {
    return this.del(`/${id}`, options);
  }
  async activate(id, options) {
    return this.post(`/${id}/activate`, void 0, options);
  }
  async deactivate(id, options) {
    return this.post(`/${id}/deactivate`, void 0, options);
  }
  async listRules(id, options) {
    return this._get(`/${id}/rules`, options);
  }
  async createRule(id, data, options) {
    return this.post(`/${id}/rules`, data, options);
  }
  async updateRule(id, data, options) {
    return this.patch(`/rules/${id}`, data, options);
  }
  async deleteRule(id, options) {
    return this.del(`/rules/${id}`, options);
  }
  async listVariants(id, options) {
    return this._get(`/${id}/variants`, options);
  }
  async createVariant(id, data, options) {
    return this.post(`/${id}/variants`, data, options);
  }
  async updateVariant(id, data, options) {
    return this.patch(`/variants/${id}`, data, options);
  }
  async deleteVariant(id, options) {
    return this.del(`/variants/${id}`, options);
  }
  async listSegments(params, options) {
    return this._get(this.withQuery("/segments", { application_id: params?.applicationId }), options);
  }
  async createSegment(data, params, options) {
    return this.post(
      this.withQuery("/segments", { application_id: params?.applicationId }),
      data,
      options
    );
  }
  async updateSegment(id, data, options) {
    return this.patch(`/segments/${id}`, data, options);
  }
  async deleteSegment(id, options) {
    return this.del(`/segments/${id}`, options);
  }
  async listEnvironments(id, options) {
    return this._get(`/${id}/environments`, options);
  }
  async upsertEnvironment(id, environment, data, options) {
    return this.put(`/${id}/environments/${encodeURIComponent(environment)}`, data, options);
  }
  async listAudit(id, limit, options) {
    return this._get(this.withQuery(`/${id}/audit`, { limit }), options);
  }
};

// src/services/communication.ts
var CommunicationService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/communication";
  }
  // --------------------------------------------------------------------------
  // Email
  // --------------------------------------------------------------------------
  async sendEmail(data, options) {
    return this.post("/email/send", data, options);
  }
  async sendEmailTemplate(template, data, options) {
    return this.post(`/email/templates/${template}/send`, data, options);
  }
  // --------------------------------------------------------------------------
  // SMS
  // --------------------------------------------------------------------------
  async sendSms(data, options) {
    return this.post("/sms/send", data, options);
  }
  async sendSmsTemplate(template, data, options) {
    return this.post(`/sms/templates/${template}/send`, data, options);
  }
  // --------------------------------------------------------------------------
  // Push Notifications — Send
  // --------------------------------------------------------------------------
  async sendPush(data, options) {
    return this.post("/push/send", data, options);
  }
  // --------------------------------------------------------------------------
  // Push Notifications — Token Management
  // --------------------------------------------------------------------------
  async registerPushToken(data, options) {
    return this.post("/push/register", data, options);
  }
  /** @deprecated Use unregisterPushTokenById() for web push tokens */
  async unregisterPushToken(token, options) {
    return this.del(`/push/tokens/${token}`, options);
  }
  async unregisterPushTokenById(id, options) {
    const result = await this.del(`/push/tokens/by-id/${id}`, options);
    if (result.data && typeof result.data === "object" && !("id" in result.data)) {
      return { data: void 0, error: null };
    }
    return result;
  }
  async associatePushTokenUserById(id, options) {
    return this.put(`/push/tokens/by-id/${id}/user`, {}, options);
  }
  async disassociatePushTokenUser(id, options) {
    const result = await this.del(`/push/tokens/by-id/${id}/user`, options);
    if (result.data && typeof result.data === "object" && !("id" in result.data)) {
      return { data: void 0, error: null };
    }
    return result;
  }
  // --------------------------------------------------------------------------
  // Push Notifications — Settings
  // --------------------------------------------------------------------------
  async getMyPushSettings(options) {
    return this._get("/push/settings/me", options);
  }
  // --------------------------------------------------------------------------
  // Push Notifications — Topics & Subscriptions
  // --------------------------------------------------------------------------
  async listTopics(options) {
    return this._get("/push/topics", options);
  }
  async subscribeTopic(topicId, data, options) {
    return this.post(`/push/topics/${topicId}/subscribe`, data || {}, options);
  }
  async unsubscribeTopic(topicId, options) {
    return this.del(`/push/topics/${topicId}/subscribe`, options);
  }
  async listSubscriptions(options) {
    return this._get("/push/subscriptions", options);
  }
  // --------------------------------------------------------------------------
  // Push Notifications — Preferences
  // --------------------------------------------------------------------------
  async getPushPreferences(options) {
    return this._get("/push/preferences", options);
  }
  async updatePushPreferences(data, options) {
    return this.put("/push/preferences", data, options);
  }
  // --------------------------------------------------------------------------
  // Message Status
  // --------------------------------------------------------------------------
  async getMessageStatus(id, options) {
    return this._get(`/messages/${id}`, options);
  }
  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------
  /** @deprecated Use sendSms() instead */
  async sendSMS(data) {
    return this.sendSms(data);
  }
  /** @deprecated Use sendPush() instead */
  async sendPushNotification(data) {
    return this.sendPush(data);
  }
};

// src/services/notifications.ts
var NotificationsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/notifications";
  }
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
  async list(params, options) {
    const qs = new URLSearchParams();
    if (params?.unread_only) qs.set("unread_only", "true");
    if (params?.kind) qs.set("kind", params.kind);
    if (params?.since) qs.set("since", params.since);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.cursor) qs.set("cursor", params.cursor);
    const query = qs.toString();
    const path = query ? `?${query}` : "";
    return this._get(path, options);
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
  async unreadCount(options) {
    return this._get("/unread-count", options);
  }
  /**
   * Mark a single notification as read.
   */
  async markRead(id, options) {
    return this.patch(`/${id}/read`, void 0, options);
  }
  /**
   * Mark all notifications as read.
   */
  async markAllRead(options) {
    return this.patch("/read-all", void 0, options);
  }
  /**
   * Dismiss a notification (soft delete).
   */
  async dismiss(id, options) {
    return this.del(`/${id}`, options);
  }
};

// src/web-push.ts
var STORAGE_KEY = "scalemule_push_state";
var WebPushManager = class {
  constructor(options) {
    this.state = null;
    this.registration = null;
    if (typeof window === "undefined") {
      throw new Error("WebPushManager can only be used in a browser environment");
    }
    this.fetcher = options.fetcher;
    this.swUrl = options.serviceWorkerUrl || "/sw.js";
    this.registrationSource = options.registrationSource;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.state = JSON.parse(stored);
      }
    } catch {
    }
  }
  /** Whether the browser supports Web Push */
  isSupported() {
    return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }
  /** Current notification permission state */
  getPermissionState() {
    if (!this.isSupported()) return "unsupported";
    return Notification.permission;
  }
  /** Request notification permission from the user */
  async requestPermission() {
    if (!this.isSupported()) return "denied";
    return Notification.requestPermission();
  }
  /**
   * Full subscribe flow:
   * 1. Check browser support
   * 2. Request notification permission
   * 3. Register service worker
   * 4. Fetch VAPID public key from backend
   * 5. PushManager.subscribe() with VAPID key
   * 6. Register token with backend
   *
   * @param deviceId Optional device identifier for anonymous users.
   *                 If not provided, generates a random UUID stored in localStorage.
   */
  async subscribe(deviceId) {
    if (!this.isSupported()) return null;
    const permission = await this.requestPermission();
    if (permission !== "granted") return null;
    this.registration = await navigator.serviceWorker.register(this.swUrl);
    await navigator.serviceWorker.ready;
    const settings = await this.fetcher.getSettings();
    if (!settings.webpush_enabled || !settings.vapid_public_key) {
      throw new Error("Web Push is not enabled for this application");
    }
    const applicationServerKey = urlBase64ToUint8Array(settings.vapid_public_key);
    const pushSubscription = await this.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey.buffer
    });
    const endpoint = pushSubscription.endpoint;
    const p256dh = arrayBufferToBase64url(pushSubscription.getKey("p256dh"));
    const auth = arrayBufferToBase64url(pushSubscription.getKey("auth"));
    const subscription = {
      endpoint,
      keys: { p256dh, auth }
    };
    const resolvedDeviceId = deviceId || this.state?.deviceId || generateDeviceId();
    const result = await this.fetcher.registerToken({
      token: endpoint,
      platform: "web",
      device_id: resolvedDeviceId,
      subscription,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      browser: detectBrowser(),
      os_version: detectOS(),
      device_model: detectDeviceType(),
      registration_source: this.registrationSource
    });
    this.state = {
      endpoint,
      tokenId: result.id,
      deviceId: resolvedDeviceId
    };
    this.persistState();
    return { tokenId: result.id, endpoint };
  }
  /** Unsubscribe from browser push and deregister token */
  async unsubscribe() {
    const sub = await this.getSubscription();
    if (sub) {
      await sub.unsubscribe();
    }
    if (this.state?.tokenId) {
      try {
        await this.fetcher.unregisterToken(this.state.tokenId);
      } catch {
      }
    }
    this.state = null;
    this.clearState();
  }
  /** Link push token to the currently authenticated user (call after login) */
  async associateUser() {
    if (!this.state?.tokenId) return;
    await this.fetcher.associateUser(this.state.tokenId);
  }
  /** Clear user association from push token (call before logout) */
  async disassociateUser() {
    if (!this.state?.tokenId) return;
    await this.fetcher.disassociateUser(this.state.tokenId);
  }
  /** Check if currently subscribed to push notifications */
  async isSubscribed() {
    if (!this.isSupported()) return false;
    const sub = await this.getSubscription();
    return sub !== null && this.state !== null;
  }
  /** Get the active PushSubscription from the service worker */
  async getSubscription() {
    if (!this.isSupported()) return null;
    try {
      const reg = await navigator.serviceWorker.getRegistration(this.swUrl);
      if (!reg) return null;
      return reg.pushManager.getSubscription();
    } catch {
      return null;
    }
  }
  /** Get the stored token ID (for external use) */
  getTokenId() {
    return this.state?.tokenId || null;
  }
  persistState() {
    if (this.state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch {
      }
    }
  }
  clearState() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
    }
  }
};
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
function arrayBufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function generateDeviceId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
function detectBrowser() {
  if (typeof navigator === "undefined") return "Unknown";
  const ua = navigator.userAgent;
  if (ua.includes("Firefox/")) return "Firefox/" + (ua.split("Firefox/")[1] || "").split(" ")[0];
  if (ua.includes("Edg/")) return "Edge/" + (ua.split("Edg/")[1] || "").split(" ")[0];
  if (ua.includes("Chrome/")) return "Chrome/" + (ua.split("Chrome/")[1] || "").split(" ")[0];
  if (ua.includes("Safari/") && !ua.includes("Chrome")) {
    const ver = (ua.split("Version/")[1] || "").split(" ")[0];
    return "Safari/" + ver;
  }
  return "Unknown";
}
function detectOS() {
  if (typeof navigator === "undefined") return "Unknown";
  const ua = navigator.userAgent;
  if (ua.includes("Windows NT")) return "Windows/" + ((ua.split("Windows NT ")[1] || "").split(/[;)]/)[0] || "");
  if (ua.includes("Mac OS X"))
    return "macOS/" + ((ua.split("Mac OS X ")[1] || "").split(/[;)]/)[0] || "").replace(/_/g, ".");
  if (ua.includes("Android")) return "Android/" + ((ua.split("Android ")[1] || "").split(/[;)]/)[0] || "");
  if (ua.includes("iPhone OS"))
    return "iOS/" + ((ua.split("iPhone OS ")[1] || "").split(" ")[0] || "").replace(/_/g, ".");
  if (ua.includes("Linux")) return "Linux";
  return "Unknown";
}
function detectDeviceType() {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Mobi|Android.*Mobile|iPhone/i.test(ua)) return "mobile";
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) return "tablet";
  return "desktop";
}

// src/web-push-sw.ts
var WEB_PUSH_SERVICE_WORKER = `
// ScaleMule Push Notification Service Worker

self.addEventListener('push', function(event) {
  if (!event.data) return;

  var data;
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'New Notification', body: event.data.text() };
  }

  var title = data.title || 'Notification';
  var options = {
    body: data.body || '',
    icon: data.icon || undefined,
    image: data.image || undefined,
    badge: data.badge || undefined,
    data: data.data || data,
    tag: data.tag || undefined,
    actions: data.actions || undefined,
    requireInteraction: data.requireInteraction || false,
  };

  // Show the notification
  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(function() {
        // Post message to all client pages for foreground handling
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      })
      .then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({
            type: 'push-received',
            payload: data,
          });
        });
      })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  var url = '/';
  if (event.notification.data && event.notification.data.url) {
    url = event.notification.data.url;
  }

  // Handle action button clicks
  if (event.action && event.notification.data && event.notification.data.actions) {
    var action = event.notification.data.actions.find(function(a) {
      return a.action === event.action;
    });
    if (action && action.url) {
      url = action.url;
    }
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // Try to focus an existing window
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url.indexOf(self.registration.scope) !== -1 && 'focus' in client) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        // Open a new window if none exists
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});
`;

// src/services/scheduler.ts
var SchedulerService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/scheduler";
  }
  // --------------------------------------------------------------------------
  // Job CRUD
  // --------------------------------------------------------------------------
  async createJob(data, options) {
    return this.post("/jobs", data, options);
  }
  async listJobs(params, requestOptions) {
    return this._list("/jobs", params, requestOptions);
  }
  async getJob(id, options) {
    return this._get(`/jobs/${id}`, options);
  }
  async updateJob(id, data, options) {
    return this.patch(`/jobs/${id}`, data, options);
  }
  async deleteJob(id, options) {
    return this.del(`/jobs/${id}`, options);
  }
  // --------------------------------------------------------------------------
  // Job Control
  // --------------------------------------------------------------------------
  async pauseJob(id, options) {
    return this.post(`/jobs/${id}/pause`, void 0, options);
  }
  async resumeJob(id, options) {
    return this.post(`/jobs/${id}/resume`, void 0, options);
  }
  async runNow(id, options) {
    return this.post(`/jobs/${id}/run-now`, void 0, options);
  }
  // --------------------------------------------------------------------------
  // Execution History & Stats
  // --------------------------------------------------------------------------
  async getExecutions(jobId, params, requestOptions) {
    return this._list(`/jobs/${jobId}/executions`, params, requestOptions);
  }
  async getStats(jobId, options) {
    return this._get(`/jobs/${jobId}/stats`, options);
  }
};

// src/services/permissions.ts
function canPerform(matrix, resource, action) {
  if (!matrix) return false;
  const resourcePerms = matrix.permissions[resource];
  if (!resourcePerms) return false;
  return resourcePerms[action] === "allow";
}
function hasMinRoleLevel(matrix, minLevel) {
  if (!matrix) return false;
  if (matrix.roleLevel === void 0) return false;
  return matrix.roleLevel >= minLevel;
}
var PermissionsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/permissions";
  }
  // --------------------------------------------------------------------------
  // Roles
  // --------------------------------------------------------------------------
  async createRole(data, options) {
    return this.post("/roles", data, options);
  }
  async listRoles(options) {
    return this._get("/roles", options);
  }
  async assignPermissions(roleId, permissions, options) {
    return this.post(`/roles/${roleId}/permissions`, { permissions }, options);
  }
  async assignRole(userId, roleId, options) {
    return this.post(`/users/${userId}/roles`, { role_id: roleId }, options);
  }
  // --------------------------------------------------------------------------
  // Permission Checks (unified — supports both member and user identity types)
  // --------------------------------------------------------------------------
  /** Check a single permission. Supports identity_type for unified model. */
  async check(identityId, permission, options) {
    const { identityType, resourceType, resourceId, ...reqOptions } = options || {};
    return this.post(
      "/check",
      {
        identity_id: identityId,
        identity_type: identityType || "user",
        permission,
        resource_type: resourceType,
        resource_id: resourceId
      },
      reqOptions
    );
  }
  /** Batch check multiple permissions for an identity. */
  async batchCheck(identityId, permissions, options) {
    const { identityType, ...reqOptions } = options || {};
    return this.post(
      "/batch-check",
      {
        identity_id: identityId,
        identity_type: identityType || "user",
        permissions
      },
      reqOptions
    );
  }
  /** Fetch the full permission matrix for an identity (single request, no N+1). */
  async getMatrix(identityId, identityType = "user", options) {
    const params = new URLSearchParams({ identity_id: identityId, identity_type: identityType });
    return this._get(`/matrix?${params.toString()}`, options);
  }
  async getUserPermissions(userId, options) {
    return this._get(`/users/${userId}/permissions`, options);
  }
  // --------------------------------------------------------------------------
  // Policies
  // --------------------------------------------------------------------------
  async createPolicy(data, options) {
    return this.post("/policies", data, options);
  }
  async listPolicies(options) {
    return this._get("/policies", options);
  }
  async evaluate(data, options) {
    return this.post("/evaluate", data, options);
  }
  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------
  /** @deprecated Use assignPermissions() instead */
  async assignPermission(roleId, permission) {
    return this.assignPermissions(roleId, [permission]);
  }
  /** @deprecated Use check() instead */
  async checkPermission(userId, permission) {
    return this.check(userId, permission);
  }
};

// src/services/workspaces.ts
var WorkspacesService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/workspaces";
  }
  // --------------------------------------------------------------------------
  // Workspace CRUD
  // --------------------------------------------------------------------------
  async create(data, options) {
    return this.post("", data, options);
  }
  async list(params, requestOptions) {
    return this._list("", params, requestOptions);
  }
  async mine(params, options) {
    return this._list("/mine", params, options);
  }
  async get(id, options) {
    return this._get(`/${id}`, options);
  }
  async update(id, data, options) {
    return this.patch(`/${id}`, data, options);
  }
  async delete(id, options) {
    return this.del(`/${id}`, options);
  }
  // --------------------------------------------------------------------------
  // Members
  // --------------------------------------------------------------------------
  async listMembers(workspaceId, params, requestOptions) {
    return this._list(`/${workspaceId}/members`, params, requestOptions);
  }
  async addMember(workspaceId, data, options) {
    return this.post(`/${workspaceId}/members`, data, options);
  }
  async updateMember(workspaceId, userId, data, options) {
    return this.patch(`/${workspaceId}/members/${userId}`, data, options);
  }
  async removeMember(workspaceId, userId, options) {
    return this.del(`/${workspaceId}/members/${userId}`, options);
  }
  // --------------------------------------------------------------------------
  // Invitations
  // --------------------------------------------------------------------------
  async invite(workspaceId, data, options) {
    return this.post(`/${workspaceId}/invitations`, data, options);
  }
  async listInvitations(workspaceId, options) {
    return this._get(`/${workspaceId}/invitations`, options);
  }
  async acceptInvitation(token, options) {
    return this.post(`/invitations/${token}/accept`, void 0, options);
  }
  async cancelInvitation(id, options) {
    return this.del(`/invitations/${id}`, options);
  }
  // --------------------------------------------------------------------------
  // SSO (workspace-only)
  // --------------------------------------------------------------------------
  async configureSso(workspaceId, data, options) {
    return this.post(`/${workspaceId}/sso/configure`, data, options);
  }
  async getSso(workspaceId, options) {
    return this._get(`/${workspaceId}/sso`, options);
  }
};

// src/services/teams.ts
var TeamsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/teams";
  }
  // --------------------------------------------------------------------------
  // Team CRUD
  // --------------------------------------------------------------------------
  async create(data, options) {
    return this.post("", data, options);
  }
  async list(params, requestOptions) {
    return this._list("", params, requestOptions);
  }
  async mine(params, options) {
    return this._list("/mine", params, options);
  }
  async get(id, options) {
    return this._get(`/${id}`, options);
  }
  async update(id, data, options) {
    return this.patch(`/${id}`, data, options);
  }
  async delete(id, options) {
    return this.del(`/${id}`, options);
  }
  // --------------------------------------------------------------------------
  // Members
  // --------------------------------------------------------------------------
  async listMembers(teamId, params, requestOptions) {
    return this._list(`/${teamId}/members`, params, requestOptions);
  }
  async addMember(teamId, data, options) {
    return this.post(`/${teamId}/members`, data, options);
  }
  async updateMember(teamId, userId, data, options) {
    return this.patch(`/${teamId}/members/${userId}`, data, options);
  }
  async removeMember(teamId, userId, options) {
    return this.del(`/${teamId}/members/${userId}`, options);
  }
  // --------------------------------------------------------------------------
  // Invitations
  // --------------------------------------------------------------------------
  async invite(teamId, data, options) {
    return this.post(`/${teamId}/invitations`, data, options);
  }
  async listInvitations(teamId, options) {
    return this._get(`/${teamId}/invitations`, options);
  }
  async acceptInvitation(token, options) {
    return this.post(`/invitations/${token}/accept`, void 0, options);
  }
  async cancelInvitation(id, options) {
    return this.del(`/invitations/${id}`, options);
  }
};

// src/services/graph.ts
var GraphService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/graph";
  }
  async createNode(data, requestOptions) {
    return this.post("/nodes", data, requestOptions);
  }
  async updateNode(nodeId, data, requestOptions) {
    return this.patch(`/nodes/${nodeId}`, data, requestOptions);
  }
  async createEdge(data, requestOptions) {
    return this.post("/edges", data, requestOptions);
  }
  async getEdges(nodeId, options, requestOptions) {
    return this._get(this.withQuery(`/nodes/${nodeId}/edges`, options), requestOptions);
  }
  async traverse(nodeId, options, requestOptions) {
    return this._get(this.withQuery(`/nodes/${nodeId}/traverse`, options), requestOptions);
  }
  async shortestPath(options, requestOptions) {
    return this.post("/shortest-path", options, requestOptions);
  }
  async neighbors(nodeId, options, requestOptions) {
    return this._get(this.withQuery(`/nodes/${nodeId}/neighbors`, options), requestOptions);
  }
  async pageRank(options, requestOptions) {
    return this.post("/algorithms/pagerank", options, requestOptions);
  }
  async centrality(options, requestOptions) {
    return this.post("/algorithms/centrality", options, requestOptions);
  }
  async connectedComponents(options) {
    return this.post("/algorithms/connected-components", void 0, options);
  }
};

// src/services/functions.ts
var FunctionsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/functions";
  }
  async deploy(data, options) {
    return this.post("", data, options);
  }
  async list(options) {
    return this._get("", options);
  }
  async get(name, options) {
    return this._get(`/${name}`, options);
  }
  async update(name, data, options) {
    return this.patch(`/${name}`, data, options);
  }
  async delete(name, options) {
    return this.del(`/${name}`, options);
  }
  async invoke(name, payload, options) {
    return this.post(`/${name}/invoke`, payload, options);
  }
  async invokeAsync(name, payload, options) {
    return this.post(`/${name}/invoke-async`, payload, options);
  }
  async getLogs(name, options) {
    return this._get(`/${name}/logs`, options);
  }
  async getExecutions(name, params, requestOptions) {
    return this._list(`/${name}/executions`, params, requestOptions);
  }
  async getMetrics(name, options) {
    return this._get(`/${name}/metrics`, options);
  }
  /** @deprecated Use deploy() instead */
  async deployFunction(data) {
    return this.deploy(data);
  }
  /** @deprecated Use invoke() instead */
  async invokeFunction(name, payload) {
    return this.invoke(name, payload);
  }
};

// src/services/listings.ts
var ListingsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/listings";
  }
  async create(data, options) {
    return this.post("", data, options);
  }
  async get(id, options) {
    return this._get(`/${id}`, options);
  }
  async update(id, data, options) {
    return this.patch(`/${id}`, data, options);
  }
  async delete(id, options) {
    return this.del(`/${id}`, options);
  }
  async search(query, filters, options) {
    return this._get(this.withQuery("/search", { query, ...filters }), options);
  }
  async nearby(nearbyOptions, options) {
    return this._get(this.withQuery("/nearby", nearbyOptions), options);
  }
  async getByCategory(category, params, requestOptions) {
    return this._list(`/categories/${category}`, params, requestOptions);
  }
  async favorite(listingId, options) {
    return this.post(`/${listingId}/favorite`, void 0, options);
  }
  async unfavorite(listingId, options) {
    return this.del(`/${listingId}/favorite`, options);
  }
  async getFavorites(params, requestOptions) {
    return this._list("/favorites", params, requestOptions);
  }
  async trackView(listingId, options) {
    return this.post(`/${listingId}/view`, void 0, options);
  }
  /** @deprecated Use create() instead */
  async createListing(data) {
    return this.create(data);
  }
  /** @deprecated Use search() instead */
  async searchListings(query, filters) {
    return this.search(query, filters);
  }
  /** @deprecated Use get() instead */
  async getListing(id) {
    return this.get(id);
  }
};

// src/services/events.ts
var EventsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/events";
  }
  async create(data, options) {
    return this.post("", data, options);
  }
  async get(eventId, options) {
    return this._get(`/${eventId}`, options);
  }
  async update(eventId, data, options) {
    return this.patch(`/${eventId}`, data, options);
  }
  async delete(eventId, options) {
    return this.del(`/${eventId}`, options);
  }
  async list(filters, requestOptions) {
    return this._list("", filters, requestOptions);
  }
  async register(eventId, options) {
    return this.post(`/${eventId}/register`, void 0, options);
  }
  async unregister(eventId, options) {
    return this.del(`/${eventId}/register`, options);
  }
  async getAttendees(eventId, params, requestOptions) {
    return this._list(`/${eventId}/attendees`, params, requestOptions);
  }
  async checkIn(eventId, options) {
    return this.post(`/${eventId}/check-in`, void 0, options);
  }
  /** @deprecated Use create() instead */
  async createEvent(data) {
    return this.create(data);
  }
  /** @deprecated Use list() instead */
  async listEvents(filters) {
    return this.list(filters);
  }
};

// src/services/leaderboard.ts
var LeaderboardService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/leaderboard";
  }
  async create(data, options) {
    return this.post("", data, options);
  }
  async submitScore(boardId, data, options) {
    return this.post(`/${boardId}/scores`, data, options);
  }
  async getRankings(boardId, rankingOptions, requestOptions) {
    return this._get(this.withQuery(`/${boardId}/rankings`, rankingOptions), requestOptions);
  }
  async getUserRank(boardId, userId, options) {
    return this._get(`/${boardId}/users/${userId}/rank`, options);
  }
  async getUserHistory(boardId, userId, options) {
    return this._get(`/${boardId}/users/${userId}/history`, options);
  }
  async updateScore(boardId, userId, data, options) {
    return this.patch(`/${boardId}/users/${userId}/score`, data, options);
  }
  async deleteScore(boardId, userId, options) {
    return this.del(`/${boardId}/users/${userId}/score`, options);
  }
};

// src/services/webhooks.ts
var WebhooksService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/webhooks";
  }
  async create(data, options) {
    return this.post("", data, options);
  }
  async list(options) {
    return this._get("", options);
  }
  async get(id, options) {
    return this._get(`/${id}`, options);
  }
  async update(id, data, options) {
    return this.patch(`/${id}`, data, options);
  }
  async delete(id, options) {
    return this.del(`/${id}`, options);
  }
  async listEvents(options) {
    return this._get("/events", options);
  }
  /** @deprecated Use create() instead */
  async createWebhook(data) {
    return this.create(data);
  }
  /** @deprecated Use list() instead */
  async listWebhooks() {
    return this.list();
  }
  /** @deprecated Use delete() instead */
  async deleteWebhook(id) {
    return this.delete(id);
  }
};

// src/services/search.ts
var SearchService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/search";
  }
  async query(queryStr, queryOptions, requestOptions) {
    return this.post("", { query: queryStr, ...queryOptions }, requestOptions);
  }
  async index(indexName, document2, options) {
    return this.post("/documents", { index: indexName, ...document2 }, options);
  }
  async removeDocument(indexName, docId, options) {
    return this.del(`/documents/${indexName}/${docId}`, options);
  }
  /** @deprecated Use query() instead */
  async search(queryStr, options) {
    return this.query(queryStr, options);
  }
  /** @deprecated Use index() instead */
  async indexDocument(data) {
    return this.post("/documents", data);
  }
};

// src/services/photo.ts
var PHOTO_BREAKPOINTS = [150, 320, 640, 1080];
var PhotoService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/photos";
  }
  async upload(file, uploadOptions, requestOptions) {
    const fields = {};
    if (uploadOptions?.metadata) fields["metadata"] = JSON.stringify(uploadOptions.metadata);
    return this._upload("", file, fields, {
      ...requestOptions,
      onProgress: uploadOptions?.onProgress,
      signal: uploadOptions?.signal
    });
  }
  async transform(photoId, transformations, options) {
    return this.post(`/${photoId}/transform`, transformations, options);
  }
  async get(id, options) {
    return this._get(`/${id}`, options);
  }
  async delete(id, options) {
    return this.del(`/${id}`, options);
  }
  /**
   * Build an absolute URL for the on-demand transform endpoint.
   *
   * Use in `<img src>` or `srcset` — the server negotiates the best format
   * (AVIF > WebP > JPEG) from the browser's Accept header automatically.
   * Transformed images are cached server-side on first request.
   */
  getTransformUrl(photoId, options) {
    const params = new URLSearchParams();
    if (options?.width) params.set("width", String(options.width));
    if (options?.height) params.set("height", String(options.height));
    if (options?.fit) params.set("fit", options.fit);
    if (options?.format) params.set("format", options.format);
    if (options?.quality) params.set("quality", String(options.quality));
    const qs = params.toString();
    return `${this.client.getBaseUrl()}${this.basePath}/${photoId}/transform${qs ? `?${qs}` : ""}`;
  }
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
  getOptimalUrl(photoId, displayWidth, options) {
    const requestedDpr = options?.dpr ?? 1;
    const dpr = Number.isFinite(requestedDpr) && requestedDpr > 0 ? requestedDpr : 1;
    const cssWidth = Number.isFinite(displayWidth) && displayWidth > 0 ? displayWidth : PHOTO_BREAKPOINTS[0];
    const physicalWidth = Math.ceil(cssWidth * dpr);
    const size = PHOTO_BREAKPOINTS.find((bp) => bp >= physicalWidth) ?? PHOTO_BREAKPOINTS[PHOTO_BREAKPOINTS.length - 1];
    return this.getTransformUrl(photoId, { width: size, height: size, fit: "cover" });
  }
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
  getSrcSet(photoId) {
    return PHOTO_BREAKPOINTS.map(
      (size) => `${this.getTransformUrl(photoId, { width: size, height: size, fit: "cover" })} ${size}w`
    ).join(", ");
  }
  /**
   * Register a photo from an already-uploaded storage file.
   *
   * Creates a photo record so the optimization pipeline can process it.
   * Use this when files are uploaded via the storage service (presigned URL)
   * instead of the photo service's upload endpoint.
   *
   * If the file scan is still in progress, the server waits briefly (~5s) for it
   * to complete. In the rare case the scan exceeds that window, the server queues
   * the registration and returns 202; this method retries automatically until the
   * photo record is available.
   *
   * Returns the photo record with `id` that can be used with `getTransformUrl()`.
   */
  async register(registerOptions, requestOptions) {
    const body = {
      file_id: registerOptions.fileId,
      sm_user_id: registerOptions.userId
    };
    const result = await this.post("/register", body, requestOptions);
    const isPending = (r) => !r.error && r.data && "status" in r.data && r.data.status === "pending_scan";
    if (!isPending(result)) {
      return result;
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      await new Promise((r) => setTimeout(r, 1e3));
      const retry = await this.post("/register", body, requestOptions);
      if (!isPending(retry)) {
        return retry;
      }
    }
    return {
      data: null,
      error: {
        code: "scan_timeout",
        message: "File scan did not complete in time. The photo will be registered automatically when the scan finishes.",
        status: 202
      }
    };
  }
  /** @deprecated Use upload() instead */
  async uploadPhoto(file, options) {
    return this.upload(file, options);
  }
  /** @deprecated Use transform() instead */
  async transformPhoto(photoId, transformations) {
    return this.transform(photoId, transformations);
  }
  /** @deprecated Use get() instead */
  async getPhoto(id) {
    return this.get(id);
  }
};

// src/services/queue.ts
var DeadLetterApi = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/queue/dead-letter";
  }
  async list(options) {
    return this._get("", options);
  }
  async get(id, options) {
    return this._get(`/${id}`, options);
  }
  async retry(id, options) {
    return this.post(`/${id}/retry`, void 0, options);
  }
  async delete(id, options) {
    return this.del(`/${id}`, options);
  }
};
var QueueService = class extends ServiceModule {
  constructor(client) {
    super(client);
    this.basePath = "/v1/queue";
    this.deadLetter = new DeadLetterApi(client);
  }
  async enqueue(data, options) {
    return this.post("/jobs", data, options);
  }
  async getJob(id, options) {
    return this._get(`/jobs/${id}`, options);
  }
};

// src/services/cache.ts
var CacheService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/cache";
  }
  async get(key, options) {
    return this._get(`/${key}`, options);
  }
  async set(key, value, ttl, options) {
    return this.post("", { key, value, ttl }, options);
  }
  async delete(key, options) {
    return this.del(`/${key}`, options);
  }
  async flush(options) {
    return this.del("", options);
  }
};

// src/services/compliance.ts
var ComplianceService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/compliance";
  }
  /** Build query string from params object */
  qs(params) {
    if (!params) return "";
    const entries = Object.entries(params).filter(([, v]) => v !== void 0 && v !== null);
    if (entries.length === 0) return "";
    return "?" + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
  }
  // --- Audit Logs ---
  async log(data, options) {
    return this.post("/audit-logs", data, options);
  }
  async queryAuditLogs(params, requestOptions) {
    return this._get(`/audit-logs${this.qs(params)}`, requestOptions);
  }
  // --- Legacy GDPR (deprecated) ---
  /** @deprecated Use createDataSubjectRequest({ request_type: 'access', ... }) instead */
  async requestDataExport(userId) {
    return this.post("/gdpr/access-request", { user_id: userId });
  }
  /** @deprecated Use createDataSubjectRequest({ request_type: 'deletion', ... }) instead */
  async requestDataDeletion(userId) {
    return this.post("/gdpr/deletion-request", { user_id: userId });
  }
  /** @deprecated Use log() instead */
  async createAuditLog(data) {
    return this.log(data);
  }
  // --- Consent Purposes ---
  async listConsentPurposes(options) {
    return this._get("/consent-purposes", options);
  }
  async createConsentPurpose(data, options) {
    return this.post("/consent-purposes", data, options);
  }
  // --- Consent v2 ---
  async recordConsent(data, options) {
    return this.post("/consent/v2", data, options);
  }
  async getUserConsents(userId, options) {
    return this._get(`/consent/v2/${userId}`, options);
  }
  async withdrawConsent(consentId, data, options) {
    return this.put(`/consent/v2/${consentId}/withdraw`, data || {}, options);
  }
  // --- Data Subject Requests ---
  async createDataSubjectRequest(data, options) {
    return this.post("/dsr", data, options);
  }
  async listDataSubjectRequests(params, requestOptions) {
    return this._get(`/dsr${this.qs(params)}`, requestOptions);
  }
  async getDataSubjectRequest(id, options) {
    return this._get(`/dsr/${id}`, options);
  }
  async updateDsrStatus(id, data, options) {
    return this.put(`/dsr/${id}/status`, data, options);
  }
  async createDsrAction(dsrId, data, options) {
    return this.post(`/dsr/${dsrId}/actions`, data, options);
  }
  async listDsrActions(dsrId, options) {
    return this._get(`/dsr/${dsrId}/actions`, options);
  }
  // --- Data Breaches ---
  async reportBreach(data, options) {
    return this.post("/breaches", data, options);
  }
  async listBreaches(params, requestOptions) {
    return this._get(`/breaches${this.qs(params)}`, requestOptions);
  }
  async getBreach(id, options) {
    return this._get(`/breaches/${id}`, options);
  }
  async updateBreach(id, data, options) {
    return this.put(`/breaches/${id}`, data, options);
  }
  // --- Retention Policies ---
  async listRetentionPolicies(options) {
    return this._get("/retention/policies", options);
  }
  async createRetentionPolicy(data, options) {
    return this.post("/retention/policies", data, options);
  }
  // --- Processing Activities ---
  async createProcessingActivity(data, options) {
    return this.post("/processing-activities", data, options);
  }
  async listProcessingActivities(params, requestOptions) {
    return this._get(`/processing-activities${this.qs(params)}`, requestOptions);
  }
  async getProcessingActivity(id, options) {
    return this._get(`/processing-activities/${id}`, options);
  }
  async updateProcessingActivity(id, data, options) {
    return this.put(`/processing-activities/${id}`, data, options);
  }
};

// src/services/orchestrator.ts
var OrchestratorService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/orchestrator";
  }
  async createWorkflow(data, options) {
    return this.post("/workflows", data, options);
  }
  async execute(workflowId, input, options) {
    return this.post(`/workflows/${workflowId}/execute`, input, options);
  }
  async getExecution(executionId, options) {
    return this._get(`/executions/${executionId}`, options);
  }
  /** @deprecated Use execute() instead */
  async executeWorkflow(workflowId, input) {
    return this.execute(workflowId, input);
  }
};

// src/services/accounts.ts
var AccountsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/accounts";
  }
  async createClient(data, options) {
    return this.post("/clients", data, options);
  }
  async getClients(options) {
    return this._get("/clients", options);
  }
  async createApplication(data, options) {
    return this.post("/applications", data, options);
  }
  async getApplications(options) {
    return this._get("/applications", options);
  }
};

// src/services/identity.ts
var IdentityService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/identity";
  }
  async createApiKey(data, options) {
    return this.post("/api-keys", data, options);
  }
  async listApiKeys(options) {
    return this._get("/api-keys", options);
  }
  async revokeApiKey(id, options) {
    return this.del(`/api-keys/${id}`, options);
  }
  /**
   * Explicitly link an anonymous_id to the current authenticated user.
   * Called automatically on init when both a session and anonymous_id exist
   * (transitional path for users who registered before identity linking existed).
   */
  async identify(anonymousId, deviceFingerprintHash, options) {
    return this.post(
      "/identify",
      { anonymous_id: anonymousId, device_fingerprint_hash: deviceFingerprintHash },
      options
    );
  }
};

// src/services/catalog.ts
var CatalogService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/catalog";
  }
  async listServices(options) {
    return this._get("/services", options);
  }
  async getServiceHealth(name, options) {
    return this._get(`/services/${name}/health`, options);
  }
};

// src/services/flagcontent.ts
var FlagContentService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/flagcontent";
  }
  async createFlag(data, options) {
    return this.post("/flags", data, options);
  }
  async checkFlag(params, requestOptions) {
    return this._get(this.withQuery("/flags/check", params), requestOptions);
  }
  async getFlag(id, options) {
    return this._get(`/flags/${id}`, options);
  }
  async submitAppeal(data, options) {
    return this.post("/appeals", data, options);
  }
  async getAppeal(id, options) {
    return this._get(`/appeals/${id}`, options);
  }
};

// src/services/agent-auth.ts
var AgentAuthService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/auth";
  }
  async registerAgent(data, options) {
    return this.post("/register/agent", data, options);
  }
  async listTokens(options) {
    return this._get("/agent-tokens", options);
  }
  async createToken(data, options) {
    return this.post("/agent-tokens", data, options);
  }
  async revokeToken(id, options) {
    return this.del(`/agent-tokens/${id}`, options);
  }
  async rotateToken(id, options) {
    return this.post(`/agent-tokens/${id}/rotate`, void 0, options);
  }
  async exchangeToken(data, options) {
    return this.post("/agent-tokens/exchange", data, options);
  }
  async listSigningKeys(options) {
    return this._get("/agent-signing-keys", options);
  }
  async addSigningKey(data, options) {
    return this.post("/agent-signing-keys", data, options);
  }
  async revokeSigningKey(id, options) {
    return this.del(`/agent-signing-keys/${id}`, options);
  }
  async getProfile(options) {
    return this._get("/agent-profile", options);
  }
  async updateProfile(data, options) {
    return this.patch("/agent-profile", data, options);
  }
  async getSecurityPolicy(appId, options) {
    return this._get(`/applications/${appId}/agent-security`, options);
  }
  async updateSecurityPolicy(appId, data, options) {
    return this.put(`/applications/${appId}/agent-security`, data, options);
  }
};

// src/services/agents.ts
var AgentsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/agents";
  }
  // Orchestrated registration
  async registerAgent(data, options) {
    return this.post("/register-agent", data, options);
  }
  async deactivateAgent(id, options) {
    return this.post(`/agents/${id}/deactivate`, void 0, options);
  }
  // Agent CRUD
  async create(data, options) {
    return this.post("/agents", data, options);
  }
  async list(params, options) {
    return this._list("/agents", params, options);
  }
  async get(id, options) {
    return this._get(`/agents/${id}`, options);
  }
  async update(id, data, options) {
    return this.patch(`/agents/${id}`, data, options);
  }
  async remove(id, options) {
    return this.del(`/agents/${id}`, options);
  }
  async setDefaultWorkspace(id, data, options) {
    return this.post(`/agents/${id}/set-default-workspace`, data, options);
  }
  // Runtime Templates
  async createTemplate(data, options) {
    return this.post("/runtime-templates", data, options);
  }
  async listTemplates(params, options) {
    return this._list("/runtime-templates", params, options);
  }
  async getTemplate(id, options) {
    return this._get(
      `/runtime-templates/${id}`,
      options
    );
  }
  async createTemplateVersion(id, data, options) {
    return this.post(`/runtime-templates/${id}/versions`, data, options);
  }
  async listTemplateVersions(id, options) {
    return this._get(`/runtime-templates/${id}/versions`, options);
  }
  // Workspaces
  async createWorkspace(data, options) {
    return this.post("/workspaces", data, options);
  }
  async listWorkspaces(params, options) {
    return this._list("/workspaces", params, options);
  }
  async getWorkspace(id, options) {
    return this._get(`/workspaces/${id}`, options);
  }
  async updateWorkspace(id, data, options) {
    return this.patch(`/workspaces/${id}`, data, options);
  }
  async addOsAccount(workspaceId, data, options) {
    return this.post(`/workspaces/${workspaceId}/os-accounts`, data, options);
  }
};

// src/services/agent-projects.ts
var AgentProjectsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/agent-projects";
  }
  withAppId(path, applicationId) {
    return applicationId ? this.withQuery(path, { application_id: applicationId }) : path;
  }
  // Projects
  async createProject(data, applicationId, options) {
    return this.post(this.withAppId("/projects", applicationId), data, options);
  }
  async listProjects(params, options) {
    return this._list("/projects", params, options);
  }
  async getProject(id, applicationId, options) {
    return this._get(this.withAppId(`/projects/${id}`, applicationId), options);
  }
  async updateProject(id, data, applicationId, options) {
    return this.patch(this.withAppId(`/projects/${id}`, applicationId), data, options);
  }
  // Members (use auth user_id)
  async addMember(projectId, data, applicationId, options) {
    return this.post(this.withAppId(`/projects/${projectId}/members`, applicationId), data, options);
  }
  async listMembers(projectId, params, options) {
    const qs = {};
    if (params?.application_id) qs.application_id = params.application_id;
    if (params?.hydrate) qs.hydrate = "true";
    const path = Object.keys(qs).length ? this.withQuery(`/projects/${projectId}/members`, qs) : `/projects/${projectId}/members`;
    const result = await this._get(path, options);
    return { data: result.data?.members ?? [], error: result.error };
  }
  async updateMember(projectId, userId, data, applicationId, options) {
    return this.patch(
      this.withAppId(`/projects/${projectId}/members/${userId}`, applicationId),
      data,
      options
    );
  }
  async removeMember(projectId, userId, applicationId, options) {
    return this.del(this.withAppId(`/projects/${projectId}/members/${userId}`, applicationId), options);
  }
  // Tasks
  async createTask(projectId, data, applicationId, options) {
    return this.post(this.withAppId(`/projects/${projectId}/tasks`, applicationId), data, options);
  }
  async listTasks(projectId, params, options) {
    return this._list(`/projects/${projectId}/tasks`, params, options);
  }
  async getTask(id, applicationId, options) {
    return this._get(this.withAppId(`/tasks/${id}`, applicationId), options);
  }
  async updateTask(id, data, applicationId, options) {
    return this.patch(this.withAppId(`/tasks/${id}`, applicationId), data, options);
  }
  async reorderTasks(projectId, taskIds, applicationId, options) {
    return this.post(
      this.withAppId(`/projects/${projectId}/tasks/reorder`, applicationId),
      { task_ids: taskIds },
      options
    );
  }
  // Lifecycle (use registry agent_id)
  async claimNext(agentId, applicationId, options) {
    const result = await this.post(
      this.withAppId("/tasks/next-available", applicationId),
      { agent_id: agentId },
      options
    );
    if (!result.data || typeof result.data !== "object" || !("task_id" in result.data)) {
      return { data: null, error: result.error };
    }
    return result;
  }
  async claim(taskId, agentId, applicationId, options) {
    return this.post(
      this.withAppId(`/tasks/${taskId}/claim`, applicationId),
      { agent_id: agentId },
      options
    );
  }
  async heartbeat(taskId, agentId, applicationId, options) {
    return this.post(
      this.withAppId(`/tasks/${taskId}/heartbeat`, applicationId),
      { agent_id: agentId },
      options
    );
  }
  async submit(taskId, data, applicationId, options) {
    return this.post(this.withAppId(`/tasks/${taskId}/submit`, applicationId), data, options);
  }
  async block(taskId, data, applicationId, options) {
    return this.post(this.withAppId(`/tasks/${taskId}/block`, applicationId), data, options);
  }
  // Assignment
  async assignAgent(taskId, data, applicationId, options) {
    return this.post(this.withAppId(`/tasks/${taskId}/assign`, applicationId), data, options);
  }
  async unassignAgent(taskId, agentId, applicationId, options) {
    return this.del(this.withAppId(`/tasks/${taskId}/assign/${agentId}`, applicationId), options);
  }
  // History
  async listAttempts(taskId, applicationId, options) {
    const result = await this._get(
      this.withAppId(`/tasks/${taskId}/attempts`, applicationId),
      options
    );
    return { data: result.data?.attempts ?? [], error: result.error };
  }
  async listTransitions(taskId, applicationId, options) {
    const result = await this._get(
      this.withAppId(`/tasks/${taskId}/transitions`, applicationId),
      options
    );
    return { data: result.data?.transitions ?? [], error: result.error };
  }
  // Documents
  async createDocument(projectId, data, applicationId, options) {
    return this.post(this.withAppId(`/projects/${projectId}/documents`, applicationId), data, options);
  }
  async listDocuments(projectId, applicationId, options) {
    const result = await this._get(
      this.withAppId(`/projects/${projectId}/documents`, applicationId),
      options
    );
    return { data: result.data?.documents ?? [], error: result.error };
  }
  async deleteDocument(documentId, applicationId, options) {
    return this.del(this.withAppId(`/documents/${documentId}`, applicationId), options);
  }
  // Pipelines
  async createPipeline(projectId, data, applicationId, options) {
    return this.post(this.withAppId(`/projects/${projectId}/pipelines`, applicationId), data, options);
  }
  async listPipelines(projectId, applicationId, options) {
    const result = await this._get(
      this.withAppId(`/projects/${projectId}/pipelines`, applicationId),
      options
    );
    return { data: result.data?.pipelines ?? [], error: result.error };
  }
  async createPipelineVersion(pipelineId, data, applicationId, options) {
    return this.post(
      this.withAppId(`/pipelines/${pipelineId}/versions`, applicationId),
      data,
      options
    );
  }
  async listPipelineVersions(pipelineId, applicationId, options) {
    const result = await this._get(
      this.withAppId(`/pipelines/${pipelineId}/versions`, applicationId),
      options
    );
    return { data: result.data?.versions ?? [], error: result.error };
  }
  // --------------------------------------------------------------------------
  // Project Grants
  // --------------------------------------------------------------------------
  async createGrant(data, options) {
    return this.post("/project-grants", data, options);
  }
  async listGrants(projectId, options) {
    const result = await this._get(
      this.withQuery("/project-grants", { project_id: projectId }),
      options
    );
    return { data: result.data?.grants ?? result.data ?? [], error: result.error };
  }
  async getGrant(id, options) {
    return this._get(`/project-grants/${id}`, options);
  }
  /** Public endpoint — no auth required. Returns masked email + project name. */
  async getGrantInfo(id, options) {
    return this._get(`/project-grants/${id}/info`, { skipAuth: true, ...options });
  }
  async revokeGrant(id, options) {
    return this.del(`/project-grants/${id}`, options);
  }
  async resendGrantInvitation(id, data, options) {
    return this.post(`/project-grants/${id}/resend`, data, options);
  }
  async redeemGrant(id, options) {
    return this.post(`/project-grants/${id}/redeem`, void 0, options);
  }
};

// src/services/agent-tools.ts
var AgentToolsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/agent-tools";
  }
  // Tools
  async createTool(data, options) {
    return this.post("/tools", data, options);
  }
  async listTools(params, options) {
    return this._list("/tools", params, options);
  }
  async getTool(id, options) {
    return this._get(`/tools/${id}`, options);
  }
  async createCapability(toolId, data, options) {
    return this.post(`/tools/${toolId}/capabilities`, data, options);
  }
  async listCapabilities(toolId, options) {
    return this._get(`/tools/${toolId}/capabilities`, options);
  }
  // Tool Integrations
  async createIntegration(data, options) {
    return this.post("/tool-integrations", data, options);
  }
  async listIntegrations(params, options) {
    return this._list("/tool-integrations", params, options);
  }
  async updateIntegration(id, data, options) {
    return this.patch(`/tool-integrations/${id}`, data, options);
  }
  // Credentials
  async createCredential(data, options) {
    return this.post("/credentials", data, options);
  }
  async listCredentials(params, options) {
    return this._list("/credentials", params, options);
  }
  async updateCredential(id, data, options) {
    return this.patch(`/credentials/${id}`, data, options);
  }
  async createScope(credentialId, data, options) {
    return this.post(`/credentials/${credentialId}/scopes`, data, options);
  }
  async listScopes(credentialId, options) {
    return this._get(`/credentials/${credentialId}/scopes`, options);
  }
  // Entitlements
  async grantEntitlement(data, options) {
    return this.post("/agent-tool-entitlements", data, options);
  }
  async listEntitlements(params, options) {
    return this._list("/agent-tool-entitlements", params, options);
  }
  async revokeEntitlement(id, options) {
    return this.del(`/agent-tool-entitlements/${id}`, options);
  }
  async authorizeAction(data, options) {
    return this.post("/authorize-action", data, options);
  }
  // Data Sources
  async createDataSource(data, options) {
    return this.post("/data-sources", data, options);
  }
  async listDataSources(params, options) {
    return this._list("/data-sources", params, options);
  }
  // Data Access Policies
  async createDataAccessPolicy(data, options) {
    return this.post("/data-access-policies", data, options);
  }
  async listDataAccessPolicies(params, options) {
    return this._list("/data-access-policies", params, options);
  }
};

// src/services/agent-models.ts
var AgentModelsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/agent-models";
  }
  // Providers
  async createProvider(data, options) {
    return this.post("/model-providers", data, options);
  }
  async listProviders(params, options) {
    return this._list("/model-providers", params, options);
  }
  // Models
  async createModel(data, options) {
    return this.post("/models", data, options);
  }
  async listModels(params, options) {
    return this._list("/models", params, options);
  }
  async getModel(id, options) {
    return this._get(`/models/${id}`, options);
  }
  async createPricing(modelId, data, options) {
    return this.post(`/models/${modelId}/pricing`, data, options);
  }
  async listPricing(modelId, options) {
    return this._get(`/models/${modelId}/pricing`, options);
  }
  // Entitlements
  async createEntitlement(data, options) {
    return this.post("/model-entitlements", data, options);
  }
  async listEntitlements(params, options) {
    return this._list("/model-entitlements", params, options);
  }
  async deleteEntitlement(id, options) {
    return this.del(`/model-entitlements/${id}`, options);
  }
  // Usage & Reporting
  async recordUsage(data, options) {
    return this.post("/usage-records", data, options);
  }
  async listUsage(params, options) {
    return this._list("/usage-records", params, options);
  }
  async getUsageSummary(params, options) {
    return this._get(this.withQuery("/usage-records/summary", params), options);
  }
  async getCostReport(params, options) {
    return this._get(this.withQuery("/cost-report", params), options);
  }
};

// src/services/agent-sessions.ts
var AgentSessionsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/agent-sessions";
  }
  // Sessions
  async createSession(data, options) {
    return this.post("/sessions", data, options);
  }
  async listSessions(params, options) {
    return this._list("/sessions", params, options);
  }
  async getSession(id, options) {
    return this._get(`/sessions/${id}`, options);
  }
  async startSession(id, options) {
    return this.post(`/sessions/${id}/start`, void 0, options);
  }
  async endSession(id, data, options) {
    return this.post(`/sessions/${id}/end`, data, options);
  }
  // Logs
  async appendLog(sessionId, data, options) {
    return this.post(`/sessions/${sessionId}/logs`, data, options);
  }
  async listLogs(sessionId, options) {
    return this._get(`/sessions/${sessionId}/logs`, options);
  }
  // Artifacts
  async addArtifact(sessionId, data, options) {
    return this.post(`/sessions/${sessionId}/artifacts`, data, options);
  }
  async listArtifacts(sessionId, options) {
    return this._get(`/sessions/${sessionId}/artifacts`, options);
  }
};

// src/index.ts
var ScaleMule = class {
  /** @deprecated Use `workspaces` instead */
  get teams() {
    return this.workspaces;
  }
  constructor(config) {
    this._client = new ScaleMuleClient(config);
    this.auth = new AuthService(this._client);
    this.storage = new StorageService(this._client);
    this.realtime = new RealtimeService(this._client);
    this.video = new VideoService(this._client);
    this.data = new DataService(this._client);
    this.chat = new ChatService(this._client);
    this.social = new SocialService(this._client);
    this.referrals = new ReferralsService(this._client);
    this.billing = new BillingService(this._client);
    this.analytics = new AnalyticsService(this._client);
    this.flags = new FlagsService(this._client);
    this.communication = new CommunicationService(this._client);
    this.notifications = new NotificationsService(this._client);
    this.scheduler = new SchedulerService(this._client);
    this.permissions = new PermissionsService(this._client);
    this.workspaces = new WorkspacesService(this._client);
    this.accounts = new AccountsService(this._client);
    this.identity = new IdentityService(this._client);
    this.catalog = new CatalogService(this._client);
    this.cache = new CacheService(this._client);
    this.queue = new QueueService(this._client);
    this.search = new SearchService(this._client);
    this.logger = new LoggerService(this._client);
    this.webhooks = new WebhooksService(this._client);
    this.leaderboard = new LeaderboardService(this._client);
    this.listings = new ListingsService(this._client);
    this.events = new EventsService(this._client);
    this.graph = new GraphService(this._client);
    this.functions = new FunctionsService(this._client);
    this.photo = new PhotoService(this._client);
    this.flagContent = new FlagContentService(this._client);
    this.compliance = new ComplianceService(this._client);
    this.orchestrator = new OrchestratorService(this._client);
    this.agentAuth = new AgentAuthService(this._client);
    this.agents = new AgentsService(this._client);
    this.agentProjects = new AgentProjectsService(this._client);
    this.agentTools = new AgentToolsService(this._client);
    this.agentModels = new AgentModelsService(this._client);
    this.agentSessions = new AgentSessionsService(this._client);
  }
  /**
   * Initialize the client — loads persisted session from storage.
   * Call this once after construction, before making authenticated requests.
   */
  async initialize() {
    await this._client.initialize();
    const anonymousId = this._client.getAnonymousId();
    if (this._client.isAuthenticated() && anonymousId) {
      this.identity.identify(anonymousId).catch(() => {
      });
    }
  }
  /**
   * Set authentication session (token + userId).
   * Persisted to storage for cross-session continuity.
   */
  async setSession(token, userId) {
    return this._client.setSession(token, userId);
  }
  /** Clear the current session and remove from storage. */
  async clearSession() {
    return this._client.clearSession();
  }
  /** Set access token (in-memory only, not persisted). */
  setAccessToken(token) {
    this._client.setAccessToken(token);
  }
  /** Clear access token. */
  clearAccessToken() {
    this._client.clearAccessToken();
  }
  /** Current session token, or null. */
  getSessionToken() {
    return this._client.getSessionToken();
  }
  /** Current user ID, or null. */
  getUserId() {
    return this._client.getUserId();
  }
  /** Whether a session token is set. */
  isAuthenticated() {
    return this._client.isAuthenticated();
  }
  /** The anonymous visitor ID used for identity linking. */
  getAnonymousId() {
    return this._client.getAnonymousId();
  }
  // --------------------------------------------------------------------------
  // Multi-Account Session Pool (Phase 2)
  // --------------------------------------------------------------------------
  /** Get all accounts in the session pool (requires enableMultiSession) */
  getSessionPool() {
    return this._client.getSessionPool();
  }
  /** Get the active account, or null */
  getActiveAccount() {
    return this._client.getActiveAccount();
  }
  /** Switch to a different account in the pool. Returns false if not found. */
  async switchAccount(userId) {
    return this._client.switchAccount(userId);
  }
  /** Remove a specific account from the pool */
  async removeAccount(userId) {
    return this._client.removeAccount(userId);
  }
  /** Clear all accounts from the pool */
  async clearAllAccounts() {
    return this._client.clearAllAccounts();
  }
  /** The base URL being used for API requests. */
  getBaseUrl() {
    return this._client.getBaseUrl();
  }
  /** The application ID, or null if not configured. */
  getApplicationId() {
    return this._client.getApplicationId();
  }
  /** Set the active workspace context. All subsequent requests include this as x-sm-workspace-id. */
  setWorkspaceContext(id) {
    this._client.setWorkspaceContext(id);
  }
  /** Get the current workspace ID, or null. */
  getWorkspaceId() {
    return this._client.getWorkspaceId();
  }
  /** Access the underlying ScaleMuleClient for advanced usage. */
  getClient() {
    return this._client;
  }
};
var index_default = ScaleMule;
export {
  AccountsService,
  AgentAuthService,
  AgentModelsService,
  AgentProjectsService,
  AgentSessionsService,
  AgentToolsService,
  AgentsService,
  AnalyticsService,
  AuthService,
  BillingService,
  CacheService,
  CatalogService,
  ChatService,
  CommunicationService,
  ComplianceService,
  DataService,
  ErrorCodes,
  EventsService,
  FlagContentService,
  FlagsService,
  FunctionsService,
  GraphService,
  IdentityService,
  LeaderboardService,
  ListingsService,
  LoggerService,
  NotificationsService,
  OrchestratorService,
  PHONE_COUNTRIES,
  PHOTO_BREAKPOINTS,
  PermissionsService,
  PhotoService,
  QueueService,
  RealtimeService,
  ReferralsService,
  ScaleMule,
  ScaleMuleClient,
  SchedulerService,
  SearchService,
  ServiceModule,
  SocialService,
  StorageService,
  TeamsService,
  UploadResumeStore,
  UploadTelemetry,
  VideoService,
  WEB_PUSH_SERVICE_WORKER,
  WebPushManager,
  WebhooksService,
  WorkspacesService,
  buildClientContextHeaders,
  calculateTotalParts,
  canPerform,
  composePhoneNumber,
  countryFlag,
  createUploadPlan,
  index_default as default,
  detectCountryFromE164,
  detectNetworkClass,
  extractClientContext,
  findPhoneCountryByCode,
  findPhoneCountryByDialCode,
  generateUploadSessionId,
  getMeasuredBandwidthMbps,
  getPartRange,
  hasMinRoleLevel,
  isValidE164Phone,
  normalizeAndValidatePhone,
  normalizePhoneNumber,
  resolveStrategy,
  uploadMultipartToS3,
  uploadSingleToS3,
  validateIP
};
