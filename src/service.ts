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

import type { ScaleMuleClient } from './client'
import type {
  ApiResponse,
  PaginatedResponse,
  PaginationMetadata,
  RequestOptions,
} from './types'
import { buildClientContextHeaders } from './context'

// ============================================================================
// ServiceModule
// ============================================================================

export abstract class ServiceModule {
  protected client: ScaleMuleClient
  protected abstract basePath: string

  constructor(client: ScaleMuleClient) {
    this.client = client
  }

  // --------------------------------------------------------------------------
  // Client context → headers resolution
  // --------------------------------------------------------------------------

  /**
   * Merge `clientContext` from RequestOptions into `headers`.
   * Explicit headers take precedence over context-derived ones.
   */
  private resolveOptions(options?: RequestOptions): RequestOptions | undefined {
    if (!options?.clientContext) return options
    const contextHeaders = buildClientContextHeaders(options.clientContext)
    const { clientContext: _, ...rest } = options
    return { ...rest, headers: { ...contextHeaders, ...rest.headers } }
  }

  // --------------------------------------------------------------------------
  // HTTP verb shortcuts (path relative to basePath)
  // --------------------------------------------------------------------------

  protected _get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.client.get<T>(`${this.basePath}${path}`, this.resolveOptions(options))
  }

  protected post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.client.post<T>(`${this.basePath}${path}`, body, this.resolveOptions(options))
  }

  protected put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.client.put<T>(`${this.basePath}${path}`, body, this.resolveOptions(options))
  }

  protected patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.client.patch<T>(`${this.basePath}${path}`, body, this.resolveOptions(options))
  }

  protected del<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.client.del<T>(`${this.basePath}${path}`, this.resolveOptions(options))
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
  protected async _list<T>(
    path: string,
    params?: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<PaginatedResponse<T>> {
    // Convert params to query string
    const qs = buildQueryString(params)
    const fullPath = qs
      ? `${this.basePath}${path}?${qs}`
      : `${this.basePath}${path}`

    const response = await this.client.get<unknown>(fullPath, this.resolveOptions(options))

    // Error path — return empty list with error
    if (response.error) {
      return {
        data: [],
        metadata: { total: 0, totalPages: 0, page: asNum(params?.page) ?? 1, perPage: asNum(params?.perPage) ?? 20 },
        error: response.error,
      }
    }

    // Normalize the backend response into PaginatedResponse
    return normalizePaginatedResponse<T>(response.data, params)
  }

  // --------------------------------------------------------------------------
  // File upload (delegates to client.upload)
  // --------------------------------------------------------------------------

  protected _upload<T>(
    path: string,
    file: File | Blob,
    additionalFields?: Record<string, string>,
    options?: RequestOptions & { onProgress?: (progress: number) => void },
  ): Promise<ApiResponse<T>> {
    return this.client.upload<T>(`${this.basePath}${path}`, file, additionalFields, this.resolveOptions(options) as typeof options)
  }

  // --------------------------------------------------------------------------
  // Query string helper (available to subclasses)
  // --------------------------------------------------------------------------

  /**
   * Append query parameters to a relative path.
   * Use with verb methods: `this.get(this.withQuery('/items', { status: 'active' }))`
   * Does NOT add basePath — the verb methods handle that.
   */
  protected withQuery(path: string, params?: Record<string, unknown>): string {
    const qs = buildQueryString(params)
    return qs ? `${path}?${qs}` : path
  }
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Build a URL query string from a params object.
 * Skips undefined/null values. Encodes both keys and values.
 */
function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return ''
  const pairs: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  }
  return pairs.join('&')
}

/**
 * Normalize varying backend pagination responses into PaginatedResponse<T>.
 */
function normalizePaginatedResponse<T>(
  raw: unknown,
  params?: Record<string, unknown>,
): PaginatedResponse<T> {
  // If raw is null/undefined, return empty
  if (raw === null || raw === undefined) {
    return {
      data: [],
      metadata: { total: 0, totalPages: 0, page: 1, perPage: 20 },
      error: null,
    }
  }

  // If raw is a bare array, wrap it
  if (Array.isArray(raw)) {
    return {
      data: raw as T[],
      metadata: {
        total: raw.length,
        totalPages: 1,
        page: 1,
        perPage: raw.length,
      },
      error: null,
    }
  }

  // Object shape — extract data array and metadata
  const obj = raw as Record<string, unknown>
  const dataArray = (obj.data ?? obj.items ?? []) as T[]

  const metadata: PaginationMetadata = {
    total: asNumber(obj.metadata, 'total') ?? asNumber(obj, 'total') ?? dataArray.length,
    totalPages: asNumber(obj.metadata, 'totalPages') ?? asNumber(obj.metadata, 'total_pages')
      ?? asNumber(obj, 'total_pages') ?? asNumber(obj, 'totalPages') ?? 0,
    page: asNumber(obj.metadata, 'page') ?? asNumber(obj, 'page') ?? asNum(params?.page) ?? 1,
    perPage: asNumber(obj.metadata, 'perPage') ?? asNumber(obj.metadata, 'per_page')
      ?? asNumber(obj, 'per_page') ?? asNumber(obj, 'perPage') ?? asNum(params?.perPage) ?? 20,
  }

  // Compute totalPages if backend didn't provide it
  if (metadata.totalPages === 0 && metadata.total > 0 && metadata.perPage > 0) {
    metadata.totalPages = Math.ceil(metadata.total / metadata.perPage)
  }

  // Optional cursor
  const nextCursor = asString(obj.metadata, 'nextCursor') ?? asString(obj.metadata, 'next_cursor')
    ?? asString(obj, 'next_cursor') ?? asString(obj, 'nextCursor')
  if (nextCursor) {
    metadata.nextCursor = nextCursor
  }

  return { data: dataArray, metadata, error: null }
}

/** Safely extract a number from a nested object */
function asNumber(parent: unknown, key: string): number | undefined {
  if (parent === null || parent === undefined || typeof parent !== 'object') return undefined
  const value = (parent as Record<string, unknown>)[key]
  return typeof value === 'number' ? value : undefined
}

/** Coerce unknown to number (returns undefined if not a number) */
function asNum(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

/** Safely extract a string from a nested object */
function asString(parent: unknown, key: string): string | undefined {
  if (parent === null || parent === undefined || typeof parent !== 'object') return undefined
  const value = (parent as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}
