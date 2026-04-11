/**
 * Tests for ScaleMule SDK
 *
 * Tests cover:
 * - Client initialization and config
 * - { data, error } response contract
 * - Error code mapping
 * - Retry with backoff
 * - Session/token management
 * - Service module instantiation
 * - DataService (query POST, filters, sort)
 * - StorageService (split upload: getUploadUrl, completeUpload)
 * - QueueService (enqueue field names)
 * - FlagContentService
 * - Pagination normalization
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  ScaleMule,
  PHONE_COUNTRIES,
  composePhoneNumber,
  normalizeAndValidatePhone,
  normalizePhoneNumber,
} from './index'

// ============================================================================
// Global fetch mock
// ============================================================================

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

/** Helper to create a successful JSON response */
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Helper to create an error JSON response */
function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): Response {
  return new Response(
    JSON.stringify({ error: { code, message, details } }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}

// ============================================================================
// Test setup
// ============================================================================

let sm: ScaleMule

beforeEach(() => {
  mockFetch.mockReset()
  sm = new ScaleMule({
    apiKey: 'test_api_key',
    environment: 'prod',
    retry: { maxRetries: 0 }, // Disable retry for most tests
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// Client Initialization
// ============================================================================

describe('Client Initialization', () => {
  it('should initialize with required apiKey', () => {
    const client = new ScaleMule({ apiKey: 'sk_test' })
    expect(client).toBeDefined()
    expect(client.getBaseUrl()).toBe('https://api.scalemule.com')
  })

  it('should use prod gateway by default', () => {
    const client = new ScaleMule({ apiKey: 'sk_test' })
    expect(client.getBaseUrl()).toBe('https://api.scalemule.com')
  })

  it('should use dev gateway for dev environment', () => {
    const client = new ScaleMule({ apiKey: 'sk_test', environment: 'dev' })
    expect(client.getBaseUrl()).toBe('https://api-dev.scalemule.com')
  })

  it('should use custom baseUrl when provided', () => {
    const client = new ScaleMule({ apiKey: 'sk_test', baseUrl: 'https://custom.api.com' })
    expect(client.getBaseUrl()).toBe('https://custom.api.com')
  })

  it('should initialize all 31 services', () => {
    expect(sm.auth).toBeDefined()
    expect(sm.storage).toBeDefined()
    expect(sm.data).toBeDefined()
    expect(sm.video).toBeDefined()
    expect(sm.realtime).toBeDefined()
    expect(sm.chat).toBeDefined()
    expect(sm.social).toBeDefined()
    expect(sm.billing).toBeDefined()
    expect(sm.analytics).toBeDefined()
    expect(sm.flags).toBeDefined()
    expect(sm.communication).toBeDefined()
    expect(sm.scheduler).toBeDefined()
    expect(sm.permissions).toBeDefined()
    expect(sm.workspaces).toBeDefined()
    expect(sm.accounts).toBeDefined()
    expect(sm.identity).toBeDefined()
    expect(sm.cache).toBeDefined()
    expect(sm.queue).toBeDefined()
    expect(sm.search).toBeDefined()
    expect(sm.webhooks).toBeDefined()
    expect(sm.graph).toBeDefined()
    expect(sm.functions).toBeDefined()
    expect(sm.listings).toBeDefined()
    expect(sm.events).toBeDefined()
    expect(sm.leaderboard).toBeDefined()
    expect(sm.photo).toBeDefined()
    expect(sm.flagContent).toBeDefined()
    expect(sm.compliance).toBeDefined()
    expect(sm.orchestrator).toBeDefined()
    expect(sm.logger).toBeDefined()
    expect(sm.catalog).toBeDefined()
  })
})

describe('Phone utilities', () => {
  it('normalizes formatted phone strings', () => {
    expect(normalizePhoneNumber('+1 (415) 555-1234')).toBe('+14155551234')
    expect(normalizePhoneNumber('00 44 20 1234 5678')).toBe('+442012345678')
  })

  it('composes E.164 phone from country picker inputs', () => {
    expect(composePhoneNumber('+1', '(415) 555-1234')).toBe('+14155551234')
    expect(composePhoneNumber('+44', '20 1234 5678')).toBe('+442012345678')
  })

  it('validates normalized phone in E.164 format', () => {
    expect(normalizeAndValidatePhone('+1 (415) 555-1234')).toEqual({
      input: '+1 (415) 555-1234',
      normalized: '+14155551234',
      valid: true,
      error: null,
    })
  })

  it('exports country metadata for picker UIs', () => {
    const us = PHONE_COUNTRIES.find((country) => country.code === 'US')
    expect(us?.dialCode).toBe('+1')
    expect(PHONE_COUNTRIES.length).toBeGreaterThan(10)
  })
})

// ============================================================================
// Response Contract
// ============================================================================

describe('Response Contract — { data, error }', () => {
  it('should return { data, error: null } on success', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: '123', email: 'test@test.com' } }))

    const result = await sm.auth.me()

    expect(result.data).toEqual({ id: '123', email: 'test@test.com' })
    expect(result.error).toBeNull()
  })

  it('should return { data: null, error } on API error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse('unauthorized', 'Invalid token', 401))

    const result = await sm.auth.me()

    expect(result.data).toBeNull()
    expect(result.error).toEqual({
      code: 'unauthorized',
      message: 'Invalid token',
      status: 401,
      details: undefined,
    })
  })

  it('should return { data: null, error } on network error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))

    const result = await sm.auth.me()

    expect(result.data).toBeNull()
    expect(result.error!.code).toBe('network_error')
  })

  it('should unwrap nested data property from backend response', async () => {
    // Backend returns { data: { user: ... } }
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { name: 'Jane' } }))

    const result = await sm.auth.me()

    expect(result.data).toEqual({ name: 'Jane' })
  })

  it('should handle flat response (no data wrapper)', async () => {
    // Backend returns { id: '123', name: 'Jane' } without data wrapper
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: '123', name: 'Jane' }))

    const result = await sm.auth.me()

    expect(result.data).toEqual({ id: '123', name: 'Jane' })
  })
})

// ============================================================================
// Error Code Mapping
// ============================================================================

describe('Error Code Mapping', () => {
  const cases = [
    { status: 400, expectedCode: 'validation_error' },
    { status: 401, expectedCode: 'unauthorized' },
    { status: 403, expectedCode: 'forbidden' },
    { status: 404, expectedCode: 'not_found' },
    { status: 409, expectedCode: 'conflict' },
    { status: 422, expectedCode: 'validation_error' },
    { status: 429, expectedCode: 'rate_limited' },
    { status: 500, expectedCode: 'internal_error' },
    { status: 502, expectedCode: 'internal_error' },
    { status: 503, expectedCode: 'internal_error' },
  ]

  for (const { status, expectedCode } of cases) {
    it(`should map HTTP ${status} to '${expectedCode}'`, async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'error' }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      const result = await sm.auth.me()

      expect(result.error!.code).toBe(expectedCode)
      expect(result.error!.status).toBe(status)
    })
  }

  it('should use backend error code when provided', async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse('ACCOUNT_LOCKED', 'Account is locked', 403),
    )

    const result = await sm.auth.me()

    expect(result.error!.code).toBe('ACCOUNT_LOCKED')
    expect(result.error!.message).toBe('Account is locked')
  })
})

// ============================================================================
// Request Headers
// ============================================================================

describe('Request Headers', () => {
  it('should include x-api-key header', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))

    await sm.auth.me()

    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers['x-api-key']).toBe('test_api_key')
  })

  it('should include Authorization header when token is set', async () => {
    sm.setAccessToken('my_session_token')
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))

    await sm.auth.me()

    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers['Authorization']).toBe('Bearer my_session_token')
  })

  it('should NOT include Authorization header before setAccessToken', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))

    await sm.auth.me()

    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers['Authorization']).toBeUndefined()
  })

  it('should clear Authorization header after clearAccessToken', async () => {
    sm.setAccessToken('token')
    sm.clearAccessToken()
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))

    await sm.auth.me()

    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers['Authorization']).toBeUndefined()
  })
})

// ============================================================================
// Session Management
// ============================================================================

describe('Session Management', () => {
  it('should report unauthenticated initially', () => {
    expect(sm.isAuthenticated()).toBe(false)
    expect(sm.getSessionToken()).toBeNull()
  })

  it('should report authenticated after setAccessToken', () => {
    sm.setAccessToken('token')
    expect(sm.isAuthenticated()).toBe(true)
    expect(sm.getSessionToken()).toBe('token')
  })

  it('should report unauthenticated after clearAccessToken', () => {
    sm.setAccessToken('token')
    sm.clearAccessToken()
    expect(sm.isAuthenticated()).toBe(false)
  })
})

// ============================================================================
// Retry Logic
// ============================================================================

describe('Retry Logic', () => {
  it('should retry on 500 errors', async () => {
    const smRetry = new ScaleMule({
      apiKey: 'test',
      retry: { maxRetries: 2, backoffMs: 1 }, // 1ms backoff for fast tests
    })

    mockFetch
      .mockResolvedValueOnce(errorResponse('internal_error', 'Server error', 500))
      .mockResolvedValueOnce(errorResponse('internal_error', 'Server error', 500))
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }))

    const result = await smRetry.auth.me()

    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(result.data).toEqual({ ok: true })
    expect(result.error).toBeNull()
  })

  it('should NOT retry on 400 errors', async () => {
    const smRetry = new ScaleMule({
      apiKey: 'test',
      retry: { maxRetries: 2, backoffMs: 1 },
    })

    mockFetch.mockResolvedValueOnce(errorResponse('validation_error', 'Bad input', 400))

    const result = await smRetry.auth.me()

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(result.error!.code).toBe('validation_error')
  })

  it('should NOT retry on 401 errors', async () => {
    const smRetry = new ScaleMule({
      apiKey: 'test',
      retry: { maxRetries: 2, backoffMs: 1 },
    })

    mockFetch.mockResolvedValueOnce(errorResponse('unauthorized', 'Bad token', 401))

    const result = await smRetry.auth.me()

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('should return last error after all retries exhausted', async () => {
    const smRetry = new ScaleMule({
      apiKey: 'test',
      retry: { maxRetries: 1, backoffMs: 1 },
    })

    mockFetch
      .mockResolvedValueOnce(errorResponse('internal_error', 'Error 1', 500))
      .mockResolvedValueOnce(errorResponse('internal_error', 'Error 2', 500))

    const result = await smRetry.auth.me()

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(result.error!.message).toBe('Error 2')
  })
})

// ============================================================================
// DataService
// ============================================================================

describe('DataService', () => {
  describe('CRUD', () => {
    it('should POST to /{collection}/documents for create', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'doc1' } }))

      const result = await sm.data.create('todos', { title: 'Test' })

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/data/todos/documents')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body)).toEqual({ data: { title: 'Test' } })
      expect(result.data).toEqual({ id: 'doc1' })
    })

    it('should GET /{collection}/documents/{id} for get', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'doc1', data: { title: 'Test' } } }))

      await sm.data.get('todos', 'doc1')

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/data/todos/documents/doc1')
      expect(init.method).toBe('GET')
    })

    it('should PATCH /{collection}/documents/{id} for update', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'doc1' } }))

      await sm.data.update('todos', 'doc1', { done: true })

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/data/todos/documents/doc1')
      expect(init.method).toBe('PATCH')
      expect(JSON.parse(init.body)).toEqual({ data: { done: true } })
    })

    it('should DELETE /{collection}/documents/{id} for delete', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { deleted: true } }))

      await sm.data.delete('todos', 'doc1')

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/data/todos/documents/doc1')
      expect(init.method).toBe('DELETE')
    })

    it('should NOT include /collections/ prefix in document paths', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'doc1' } }))

      await sm.data.create('todos', { title: 'Test' })

      const [url] = mockFetch.mock.calls[0]
      expect(url).not.toContain('/collections/todos')
      expect(url).toContain('/todos/documents')
    })
  })

  describe('query', () => {
    it('should POST to /{collection}/query (not GET)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { documents: [], total: 0, page: 1, per_page: 20 },
      }))

      await sm.data.query('todos')

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/data/todos/query')
      expect(init.method).toBe('POST')
    })

    it('should send filters with operator field (not op)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { documents: [], total: 0 },
      }))

      await sm.data.query('todos', {
        filters: [{ operator: 'eq', field: 'done', value: false }],
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.filters[0]).toEqual({ operator: 'eq', field: 'done', value: false })
      expect(body.filters[0].op).toBeUndefined()
    })

    it('should send sort with direction field (not order)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { documents: [], total: 0 },
      }))

      await sm.data.query('todos', {
        sort: [{ field: 'created_at', direction: 'desc' }],
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.sort[0]).toEqual({ field: 'created_at', direction: 'desc' })
      expect(body.sort[0].order).toBeUndefined()
    })

    it('should use per_page (not perPage) in request body', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { documents: [], total: 0 },
      }))

      await sm.data.query('todos', { page: 2, perPage: 50 })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.page).toBe(2)
      expect(body.per_page).toBe(50)
    })

    it('should return PaginatedResponse with metadata', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: {
          documents: [{ id: 'doc1' }, { id: 'doc2' }],
          total: 42,
          page: 1,
          per_page: 20,
        },
      }))

      const result = await sm.data.query('todos')

      expect(result.data).toHaveLength(2)
      expect(result.metadata.total).toBe(42)
      expect(result.metadata.page).toBe(1)
      expect(result.metadata.perPage).toBe(20)
      expect(result.metadata.totalPages).toBe(3)
      expect(result.error).toBeNull()
    })

    it('should return empty data array on error', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse('unauthorized', 'Bad token', 401))

      const result = await sm.data.query('todos')

      expect(result.data).toEqual([])
      expect(result.error!.code).toBe('unauthorized')
    })
  })

  describe('collections', () => {
    it('should POST to /collections for createCollection', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { name: 'todos' } }))

      await sm.data.createCollection('todos')

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/data/collections')
      expect(init.method).toBe('POST')
    })

    it('should GET /collections for listCollections', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [{ name: 'todos' }] }))

      await sm.data.listCollections()

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/data/collections')
      expect(init.method).toBe('GET')
    })
  })
})

// ============================================================================
// StorageService
// ============================================================================

describe('StorageService', () => {
  describe('split upload flow', () => {
    it('should POST to /signed-url/upload for getUploadUrl', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: {
          file_id: 'f1',
          upload_url: 'https://s3.amazonaws.com/presigned',
          completion_token: 'tok123',
          expires_at: '2026-03-01T00:00:00Z',
          method: 'PUT',
        },
      }))

      const result = await sm.storage.getUploadUrl('photo.jpg', 'image/jpeg', {
        isPublic: true,
        sizeBytes: 12540534,
      })

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/storage/signed-url/upload')
      expect(init.method).toBe('POST')
      const body = JSON.parse(init.body)
      expect(body.filename).toBe('photo.jpg')
      expect(body.content_type).toBe('image/jpeg')
      expect(body.is_public).toBe(true)
      expect(body.size_bytes).toBe(12540534)
      expect(result.data!.file_id).toBe('f1')
      expect(result.data!.upload_url).toBe('https://s3.amazonaws.com/presigned')
    })

    it('should POST to /signed-url/complete for completeUpload', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: {
          file_id: 'f1',
          filename: 'photo.jpg',
          size_bytes: 12345,
          content_type: 'image/jpeg',
          url: 'https://cdn.example.com/photo.jpg',
          already_completed: false,
          scan_queued: true,
        },
      }))

      const result = await sm.storage.completeUpload('f1', 'tok123')

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/storage/signed-url/complete')
      expect(init.method).toBe('POST')
      const body = JSON.parse(init.body)
      expect(body.file_id).toBe('f1')
      expect(body.completion_token).toBe('tok123')
      expect(result.data!.scan_queued).toBe(true)
    })

    it('should POST to /signed-url/report-failure for reportUploadFailure', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: {
          file_id: 'f1',
          recorded: true,
          upload_status: 'failed',
        },
      }))

      const result = await sm.storage.reportUploadFailure({
        fileId: 'f1',
        completionToken: 'tok123',
        step: 's3_put',
        errorCode: 'upload_stalled',
        errorMessage: 'Upload stalled',
        httpStatus: 0,
        attempt: 2,
        diagnostics: { bytes_sent: 7340032, total_bytes: 12540534 },
      })

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/storage/signed-url/report-failure')
      expect(init.method).toBe('POST')
      const body = JSON.parse(init.body)
      expect(body.file_id).toBe('f1')
      expect(body.completion_token).toBe('tok123')
      expect(body.step).toBe('s3_put')
      expect(body.error_code).toBe('upload_stalled')
      expect(body.attempt).toBe(2)
      expect(body.diagnostics.bytes_sent).toBe(7340032)
      expect(result.data!.recorded).toBe(true)
    })
  })

  describe('view URLs', () => {
    it('should POST to /signed-url/view/{id} for getViewUrl', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { url: 'https://cdn.example.com/signed', expires_at: '2026-03-01T00:00:00Z' },
      }))

      const result = await sm.storage.getViewUrl('file1')

      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/storage/signed-url/view/file1')
      expect(result.data!.url).toBe('https://cdn.example.com/signed')
    })

    it('should POST to /signed-url/view-batch for getViewUrls', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: {
          file1: { url: 'https://cdn/file1', expires_at: '...' },
          file2: { url: 'https://cdn/file2', expires_at: '...' },
        },
      }))

      const result = await sm.storage.getViewUrls(['file1', 'file2'])

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/storage/signed-url/view-batch')
      const body = JSON.parse(init.body)
      expect(body.file_ids).toEqual(['file1', 'file2'])
    })

    it('should POST to /signed-url/download/{id} for getDownloadUrl', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { url: 'https://cdn.example.com/download', expires_at: '...' },
      }))

      await sm.storage.getDownloadUrl('file1')

      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/storage/signed-url/download/file1')
    })
  })

  describe('file operations', () => {
    it('should GET /files/{id}/info for getInfo', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        data: { id: 'f1', filename: 'photo.jpg', content_type: 'image/jpeg' },
      }))

      await sm.storage.getInfo('f1')

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/storage/files/f1/info')
      expect(init.method).toBe('GET')
    })

    it('should DELETE /files/{id} for delete', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { deleted: true } }))

      await sm.storage.delete('f1')

      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/storage/files/f1')
      expect(init.method).toBe('DELETE')
    })
  })
})

// ============================================================================
// QueueService
// ============================================================================

describe('QueueService', () => {
  it('should use job_type (not type) in enqueue body', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { job_id: 'j1' } }))

    await sm.queue.enqueue({
      job_type: 'email.welcome',
      payload: { userId: 'u1' },
      priority: 'high',
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.job_type).toBe('email.welcome')
    expect(body.type).toBeUndefined()
    expect(body.payload).toEqual({ userId: 'u1' })
    expect(body.priority).toBe('high')
  })

  it('should POST to /v1/queue/jobs', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { job_id: 'j1' } }))

    await sm.queue.enqueue({ job_type: 'test', payload: {} })

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/queue/jobs')
    expect(init.method).toBe('POST')
  })

  it('should support optional fields: queue, run_at, max_attempts', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { job_id: 'j1' } }))

    await sm.queue.enqueue({
      job_type: 'email.welcome',
      payload: {},
      queue: 'high-priority',
      priority: 'critical',
      run_at: '2026-03-01T00:00:00Z',
      max_attempts: 5,
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.queue).toBe('high-priority')
    expect(body.run_at).toBe('2026-03-01T00:00:00Z')
    expect(body.max_attempts).toBe(5)
  })
})

// ============================================================================
// FlagContentService
// ============================================================================

describe('FlagContentService', () => {
  it('should POST to /v1/flagcontent/flags for createFlag', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'flag1' } }))

    await sm.flagContent.createFlag({
      content_type: 'post',
      content_id: 'p1',
      category: 'spam',
    })

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/flagcontent/flags')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.content_type).toBe('post')
    expect(body.content_id).toBe('p1')
    expect(body.category).toBe('spam')
  })

  it('should GET /flags/check for checkFlag', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { flagged: false } }))

    await sm.flagContent.checkFlag({ content_type: 'post', content_id: 'p1' })

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('/v1/flagcontent/flags/check')
    expect(init.method).toBe('GET')
  })

  it('should POST to /appeals for submitAppeal', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'appeal1' } }))

    await sm.flagContent.submitAppeal({ flag_id: 'flag1', reason: 'Not spam' })

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/flagcontent/appeals')
    expect(init.method).toBe('POST')
  })
})

// ============================================================================
// Pagination Normalization
// ============================================================================

describe('Pagination Normalization', () => {
  it('should normalize { data, metadata } response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      data: {
        data: [{ id: 'f1' }, { id: 'f2' }],
        metadata: { total: 42, totalPages: 3, page: 1, perPage: 20 },
      },
    }))

    const result = await sm.storage.list()

    expect(result.data).toHaveLength(2)
    expect(result.metadata.total).toBe(42)
    expect(result.metadata.totalPages).toBe(3)
  })

  it('should normalize { items, total, page, per_page } legacy response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      data: {
        items: [{ id: 'f1' }],
        total: 10,
        page: 2,
        per_page: 5,
      },
    }))

    const result = await sm.storage.list({ page: 2, perPage: 5 })

    expect(result.data).toHaveLength(1)
    expect(result.metadata.total).toBe(10)
    expect(result.metadata.page).toBe(2)
    expect(result.metadata.perPage).toBe(5)
    expect(result.metadata.totalPages).toBe(2)
  })

  it('should normalize bare array response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      data: [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }],
    }))

    const result = await sm.storage.list()

    expect(result.data).toHaveLength(3)
    expect(result.metadata.total).toBe(3)
    expect(result.metadata.totalPages).toBe(1)
  })

  it('should return empty data on error', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse('forbidden', 'No access', 403))

    const result = await sm.storage.list()

    expect(result.data).toEqual([])
    expect(result.error!.code).toBe('forbidden')
  })
})

// ============================================================================
// Service URL Paths
// ============================================================================

describe('Service URL Paths', () => {
  const pathCases = [
    { name: 'auth', call: () => sm.auth.me(), expectedPath: '/v1/auth/me' },
    { name: 'storage getInfo', call: () => sm.storage.getInfo('f1'), expectedPath: '/v1/storage/files/f1/info' },
    { name: 'data create', call: () => sm.data.create('col', {}), expectedPath: '/v1/data/col/documents' },
    { name: 'data query', call: () => sm.data.query('col'), expectedPath: '/v1/data/col/query' },
    { name: 'queue enqueue', call: () => sm.queue.enqueue({ job_type: 't', payload: {} }), expectedPath: '/v1/queue/jobs' },
    { name: 'flagContent createFlag', call: () => sm.flagContent.createFlag({ content_type: 'a', content_id: 'b', category: 'c' }), expectedPath: '/v1/flagcontent/flags' },
  ]

  for (const { name, call, expectedPath } of pathCases) {
    it(`${name} → ${expectedPath}`, async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await call()
      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe(`https://api.scalemule.com${expectedPath}`)
    })
  }
})

// ============================================================================
// AuthService
// ============================================================================

describe('AuthService', () => {
  describe('core auth', () => {
    it('should POST to /register', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'u1', email: 'a@b.com' } }))
      const result = await sm.auth.register({ email: 'a@b.com', password: 'pass123', phone: '+14155551234' })
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/auth/register')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body).email).toBe('a@b.com')
      expect(JSON.parse(init.body).phone).toBe('+14155551234')
      expect(result.data).toEqual({ id: 'u1', email: 'a@b.com' })
    })

    it('should sanitize phone formatting on register', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'u1' } }))
      await sm.auth.register({ email: 'a@b.com', password: 'pass123', phone: '(415) 555-1234' })
      const [, init] = mockFetch.mock.calls[0]
      expect(JSON.parse(init.body).phone).toBe('+4155551234')
    })

    it('should POST to /login', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { token: 'tok', user: {} } }))
      await sm.auth.login({ email: 'a@b.com', password: 'pass123', remember_me: true })
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/auth/login')
      expect(JSON.parse(init.body).remember_me).toBe(true)
    })

    it('should POST to /logout', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.logout()
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/auth/logout')
      expect(init.method).toBe('POST')
    })

    it('should GET /me', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'u1' } }))
      await sm.auth.me()
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/auth/me')
      expect(init.method).toBe('GET')
    })

    it('should POST to /refresh for refreshSession', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { token: 'new_tok' } }))
      await sm.auth.refreshSession()
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/auth/refresh')
      expect(init.method).toBe('POST')
    })
  })

  describe('passwordless', () => {
    it('should POST to /otp/send for signInWithOtp', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { sent: true } }))
      await sm.auth.signInWithOtp({ email: 'a@b.com', channel: 'email' })
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/auth/otp/send')
      expect(JSON.parse(init.body)).toEqual({ email: 'a@b.com', channel: 'email' })
    })

    it('should POST to /otp/verify for verifyOtp', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { token: 'tok' } }))
      await sm.auth.verifyOtp({ email: 'a@b.com', code: '123456' })
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/auth/otp/verify')
      expect(JSON.parse(init.body).code).toBe('123456')
    })

    it('should POST to /magic-link/send', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { sent: true } }))
      await sm.auth.signInWithMagicLink({ email: 'a@b.com' })
      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/auth/magic-link/send')
    })

    it('should POST to /magic-link/verify', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { token: 'tok' } }))
      await sm.auth.verifyMagicLink({ token: 'magic_tok' })
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/auth/magic-link/verify')
      expect(JSON.parse(init.body).token).toBe('magic_tok')
    })
  })

  describe('phone OTP', () => {
    it('should POST to /phone/send-otp', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.sendPhoneOtp({ phone: '+1234567890', purpose: 'verify_phone' })
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/auth/phone/send-otp')
      expect(JSON.parse(init.body).phone).toBe('+1234567890')
    })

    it('should sanitize phone formatting in phone OTP methods', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.sendPhoneOtp({ phone: '(123) 456-7890', purpose: 'verify_phone' })
      const [, init] = mockFetch.mock.calls[0]
      expect(JSON.parse(init.body).phone).toBe('+1234567890')
    })

    it('should POST to /phone/verify-otp', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { verified: true } }))
      await sm.auth.verifyPhoneOtp({ phone: '+1234567890', code: '1234' })
      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/auth/phone/verify-otp')
    })
  })

  describe('password management', () => {
    it('should POST to /forgot-password', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.forgotPassword({ email: 'a@b.com' })
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/auth/forgot-password')
    })

    it('should POST to /reset-password', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.resetPassword({ token: 'tok', new_password: 'new123' })
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.token).toBe('tok')
      expect(body.new_password).toBe('new123')
    })

    it('should POST to /password/change', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.changePassword({ current_password: 'old', new_password: 'new' })
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/auth/password/change')
    })
  })

  describe('email & verification', () => {
    it('should POST to /verify-email', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.verifyEmail({ token: 'verify_tok' })
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/auth/verify-email')
    })

    it('should POST to /resend-verification', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.resendVerification({ email: 'a@b.com' })
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/auth/resend-verification')
    })

    it('should POST to /email/change', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.changeEmail({ new_email: 'new@b.com', password: 'pass' })
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.new_email).toBe('new@b.com')
    })
  })

  describe('account', () => {
    it('should DELETE /me for deleteAccount', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.deleteAccount()
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/auth/me')
      expect(init.method).toBe('DELETE')
    })

    it('should GET /me/export for exportData', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.exportData()
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/auth/me/export')
      expect(init.method).toBe('GET')
    })
  })

  describe('OAuth', () => {
    it('should GET /oauth/{provider}/authorize', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { url: 'https://google.com/auth' } }))
      await sm.auth.getOAuthUrl('google', 'https://myapp.com/callback')
      const [url] = mockFetch.mock.calls[0]
      expect(url).toContain('/v1/auth/oauth/google/authorize')
      expect(url).toContain('redirect_uri=')
    })

    it('should GET /oauth/providers', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: ['google', 'github'] }))
      await sm.auth.listOAuthProviders()
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/auth/oauth/providers')
    })

    it('should DELETE /oauth/providers/{provider}', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.unlinkOAuthProvider('google')
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/auth/oauth/providers/google')
      expect(init.method).toBe('DELETE')
    })
  })

  describe('sessions sub-API', () => {
    it('should GET /sessions', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
      await sm.auth.sessions.list()
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/auth/sessions')
      expect(init.method).toBe('GET')
    })

    it('should DELETE /sessions/{id} for revoke', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.sessions.revoke('s1')
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/auth/sessions/s1')
      expect(init.method).toBe('DELETE')
    })

    it('should DELETE /sessions/others for revokeAll', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.sessions.revokeAll()
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/auth/sessions/others')
      expect(init.method).toBe('DELETE')
    })
  })

  describe('devices sub-API', () => {
    it('should GET /devices', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
      await sm.auth.devices.list()
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/auth/devices')
    })

    it('should POST /{id}/trust', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.devices.trust('d1')
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/auth/devices/d1/trust')
    })

    it('should POST /{id}/block', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.devices.block('d1')
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/auth/devices/d1/block')
    })

    it('should DELETE /{id}', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.devices.delete('d1')
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/auth/devices/d1')
      expect(init.method).toBe('DELETE')
    })
  })

  describe('loginHistory sub-API', () => {
    it('should GET /login-history', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
      await sm.auth.loginHistory.list()
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/auth/login-history')
    })

    it('should GET /login-activity for getSummary', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.loginHistory.getSummary()
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/auth/login-activity')
    })
  })

  describe('MFA sub-API', () => {
    it('should GET /mfa/status', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { enabled: false } }))
      await sm.auth.mfa.getStatus()
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/auth/mfa/status')
    })

    it('should POST /mfa/totp/setup', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { secret: 'ABCD', qr_url: 'otpauth://...' } }))
      await sm.auth.mfa.setupTotp()
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/auth/mfa/totp/setup')
    })

    it('should POST /mfa/totp/verify-setup', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.mfa.verifySetup({ code: '123456' })
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/auth/mfa/totp/verify-setup')
    })

    it('should POST /mfa/disable', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.auth.mfa.disable({ password: 'pass' })
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/auth/mfa/disable')
    })

    it('should POST /mfa/verify', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { token: 'tok' } }))
      await sm.auth.mfa.verify({ pending_token: 'pt', code: '123456' })
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.pending_token).toBe('pt')
      expect(body.code).toBe('123456')
    })

    it('should POST /mfa/backup-codes/regenerate', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { codes: ['a', 'b'] } }))
      await sm.auth.mfa.regenerateBackupCodes()
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/auth/mfa/backup-codes/regenerate')
    })
  })
})

// ============================================================================
// ChatService
// ============================================================================

describe('ChatService', () => {
  it('should POST /conversations for createConversation', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'c1' } }))
    await sm.chat.createConversation({ name: 'Chat', participant_ids: ['u1', 'u2'] })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/chat/conversations')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.participant_ids).toEqual(['u1', 'u2'])
  })

  it('should GET /conversations for listConversations', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { data: [], metadata: { total: 0 } } }))
    await sm.chat.listConversations()
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/chat/conversations')
    expect(mockFetch.mock.calls[0][1].method).toBe('GET')
  })

  it('should GET /conversations/{id}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'c1' } }))
    await sm.chat.getConversation('c1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/chat/conversations/c1')
  })

  it('should POST /conversations/{id}/participants', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.chat.addParticipant('c1', 'u3')
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/chat/conversations/c1/participants')
    expect(JSON.parse(init.body).user_id).toBe('u3')
  })

  it('should DELETE /conversations/{id}/participants/{userId}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.chat.removeParticipant('c1', 'u3')
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/chat/conversations/c1/participants/u3')
    expect(init.method).toBe('DELETE')
  })

  it('should POST /conversations/{id}/messages', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'm1', content: 'Hello' } }))
    await sm.chat.sendMessage('c1', { content: 'Hello' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/chat/conversations/c1/messages')
    expect(JSON.parse(init.body).content).toBe('Hello')
  })

  it('should GET /conversations/{id}/messages', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.chat.getMessages('c1', { limit: 50 })
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/chat/conversations/c1/messages')
    expect(mockFetch.mock.calls[0][0]).toContain('limit=50')
  })

  it('should PATCH /messages/{id} for editMessage', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'm1' } }))
    await sm.chat.editMessage('m1', { content: 'Edited' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/chat/messages/m1')
    expect(init.method).toBe('PATCH')
  })

  it('should DELETE /messages/{id} for deleteMessage', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.chat.deleteMessage('m1')
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })

  it('should POST /messages/{id}/reactions', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.chat.addReaction('m1', { emoji: '👍' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/chat/messages/m1/reactions')
    expect(JSON.parse(init.body).emoji).toBe('👍')
  })

  it('should POST /conversations/{id}/typing', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.chat.sendTyping('c1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/chat/conversations/c1/typing')
  })

  it('should POST /conversations/{id}/read for markRead', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.chat.markRead('c1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/chat/conversations/c1/read')
  })

  it('should GET /conversations/{id}/read-status', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.chat.getReadStatus('c1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/chat/conversations/c1/read-status')
  })
})

// ============================================================================
// SocialService
// ============================================================================

describe('SocialService', () => {
  describe('follow/unfollow', () => {
    it('should POST /users/{id}/follow', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.social.follow('u1')
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/social/users/u1/follow')
      expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    })

    it('should DELETE /users/{id}/follow for unfollow', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.social.unfollow('u1')
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })

    it('should GET /users/{id}/followers', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { data: [], metadata: { total: 0 } } }))
      await sm.social.getFollowers('u1')
      expect(mockFetch.mock.calls[0][0]).toContain('/v1/social/users/u1/followers')
    })

    it('should GET /users/{id}/following', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { data: [], metadata: { total: 0 } } }))
      await sm.social.getFollowing('u1')
      expect(mockFetch.mock.calls[0][0]).toContain('/v1/social/users/u1/following')
    })

    it('should GET /users/{id}/follow-status', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { is_following: true, is_followed_by: false } }))
      const result = await sm.social.getFollowStatus('u1')
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/social/users/u1/follow-status')
      expect(result.data!.is_following).toBe(true)
    })
  })

  describe('posts', () => {
    it('should POST /posts for createPost', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'p1' } }))
      await sm.social.createPost({ content: 'Hello world', visibility: 'public' })
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/social/posts')
      expect(JSON.parse(init.body).visibility).toBe('public')
    })

    it('should GET /posts/{id}', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'p1' } }))
      await sm.social.getPost('p1')
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/social/posts/p1')
    })

    it('should DELETE /posts/{id}', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.social.deletePost('p1')
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })

    it('should GET /users/{id}/posts', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { data: [], metadata: { total: 0 } } }))
      await sm.social.getUserPosts('u1')
      expect(mockFetch.mock.calls[0][0]).toContain('/v1/social/users/u1/posts')
    })

    it('should GET /feed', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { data: [], metadata: { total: 0 } } }))
      await sm.social.getFeed()
      expect(mockFetch.mock.calls[0][0]).toContain('/v1/social/feed')
    })
  })

  describe('likes', () => {
    it('should POST /{type}/{id}/like', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.social.like('post', 'p1')
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/social/post/p1/like')
    })

    it('should DELETE /{type}/{id}/like for unlike', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.social.unlike('post', 'p1')
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
    })

    it('should GET /{type}/{id}/likes', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { data: [], metadata: { total: 0 } } }))
      await sm.social.getLikes('post', 'p1')
      expect(mockFetch.mock.calls[0][0]).toContain('/v1/social/post/p1/likes')
    })
  })

  describe('comments', () => {
    it('should POST /posts/{id}/comments', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'c1' } }))
      await sm.social.comment('p1', { content: 'Nice!' })
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/social/posts/p1/comments')
      expect(JSON.parse(init.body).content).toBe('Nice!')
    })

    it('should GET /posts/{id}/comments', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { data: [], metadata: { total: 0 } } }))
      await sm.social.getComments('p1')
      expect(mockFetch.mock.calls[0][0]).toContain('/v1/social/posts/p1/comments')
    })
  })

  describe('activity', () => {
    it('should GET /activity', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: { data: [], metadata: { total: 0 } } }))
      await sm.social.getActivity()
      expect(mockFetch.mock.calls[0][0]).toContain('/v1/social/activity')
    })

    it('should PATCH /activity/{id}/read', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.social.markActivityRead('a1')
      const [url, init] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.scalemule.com/v1/social/activity/a1/read')
      expect(init.method).toBe('PATCH')
    })

    it('should PATCH /activity/read-all', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.social.markAllRead()
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/social/activity/read-all')
    })
  })
})

// ============================================================================
// BillingService
// ============================================================================

describe('BillingService', () => {
  it('should POST /customers for createCustomer', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'cust1' } }))
    await sm.billing.createCustomer({ email: 'a@b.com', name: 'John' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/money/billing/customers')
    expect(JSON.parse(init.body).email).toBe('a@b.com')
  })

  it('should POST /payment-methods', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'pm1' } }))
    await sm.billing.addPaymentMethod({ type: 'card', token: 'tok_visa' })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/money/billing/payment-methods')
  })

  it('should reject retired subscription routes for subscribe', async () => {
    await expect(sm.billing.subscribe({ customer_id: 'c1', plan_id: 'plan1' })).rejects.toThrow(
      /retired after the money-services cutover/i
    )
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should reject retired subscription routes for listSubscriptions', async () => {
    await expect(sm.billing.listSubscriptions()).rejects.toThrow(/retired after the money-services cutover/i)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should reject retired subscription cancel routes', async () => {
    await expect(sm.billing.cancelSubscription('sub1')).rejects.toThrow(/retired after the money-services cutover/i)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should reject retired subscription resume routes', async () => {
    await expect(sm.billing.resumeSubscription('sub1')).rejects.toThrow(/retired after the money-services cutover/i)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should reject retired subscription upgrade routes', async () => {
    await expect(sm.billing.upgradeSubscription('sub1', { plan_id: 'plan2' })).rejects.toThrow(
      /retired after the money-services cutover/i
    )
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should reject retired usage routes for reportUsage', async () => {
    await expect(sm.billing.reportUsage({ metric: 'api_calls', quantity: 1000 })).rejects.toThrow(
      /retired after the money-services cutover/i
    )
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should reject retired usage summary routes', async () => {
    await expect(sm.billing.getUsageSummary()).rejects.toThrow(/retired after the money-services cutover/i)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('should GET /invoices/{id}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'inv1' } }))
    await sm.billing.getInvoice('inv1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/money/billing/invoices/inv1')
  })

  it('should POST /invoices/{id}/pay', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { status: 'paid' } }))
    await sm.billing.payInvoice('inv1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/money/billing/invoices/inv1/pay')
  })

  it('should GET /invoices/{id}/pdf', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { url: 'https://pdf.url' } }))
    await sm.billing.getInvoicePdf('inv1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/money/billing/invoices/inv1/pdf')
  })
})

// ============================================================================
// AnalyticsService
// ============================================================================

describe('AnalyticsService', () => {
  it('should POST /v2/events for track', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.analytics.track('button_clicked', { buttonId: 'signup' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/analytics/v2/events')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.event_name).toBe('button_clicked')
    expect(body.event).toBeUndefined()
    expect(body.properties.buttonId).toBe('signup')
  })

  it('should POST /v2/events/batch for trackBatch', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.analytics.trackBatch([
      { event: 'page_view', properties: { path: '/' } },
      { event: 'click', properties: { target: 'btn' } },
    ])
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/analytics/v2/events/batch')
    const body = JSON.parse(init.body)
    expect(body.events).toHaveLength(2)
    expect(body.events[0].event_name).toBe('page_view')
    expect(body.events[0].event).toBeUndefined()
    expect(body.events[1].event_name).toBe('click')
    expect(body.events[1].event).toBeUndefined()
  })

  it('should POST /page-view for trackPageView', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.analytics.trackPageView({ path: '/pricing', title: 'Pricing' })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/analytics/page-view')
  })

  it('should POST /identify', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.analytics.identify('u1', { plan: 'pro' }, 'anon123')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.user_id).toBe('u1')
    expect(body.traits.plan).toBe('pro')
    expect(body.anonymous_id).toBe('anon123')
  })

  it('should POST /alias', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.analytics.alias('u1', 'anon123')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.user_id).toBe('u1')
    expect(body.anonymous_id).toBe('anon123')
  })

  it('should GET /events for queryEvents', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { data: [], metadata: { total: 0 } } }))
    await sm.analytics.queryEvents()
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/analytics/events')
  })

  it('should GET /aggregations', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.analytics.getAggregations({ event: 'click' })
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/analytics/aggregations')
  })

  it('should GET /top-events', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.analytics.getTopEvents()
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/analytics/top-events')
  })

  it('should GET /users/active', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { daily: 100, weekly: 500, monthly: 2000 } }))
    const result = await sm.analytics.getActiveUsers()
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/analytics/users/active')
    expect(result.data!.daily).toBe(100)
  })

  it('should POST /funnels for createFunnel', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'f1' } }))
    await sm.analytics.createFunnel({ name: 'Signup', steps: ['page_view', 'register'] })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/analytics/funnels')
    expect(JSON.parse(init.body).steps).toHaveLength(2)
  })

  it('should GET /funnels for listFunnels', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.analytics.listFunnels()
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/analytics/funnels')
  })

  it('should GET /funnels/{id}/conversions', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.analytics.getFunnelConversions('f1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/analytics/funnels/f1/conversions')
  })

  it('should POST /metrics for trackMetric', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.analytics.trackMetric({ name: 'response_time', value: 42 })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/analytics/metrics')
  })

  it('should GET /metrics/query for queryMetrics', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.analytics.queryMetrics({ name: 'response_time' })
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/analytics/metrics/query')
  })
})

describe('FlagsService', () => {
  it('should POST /evaluate for evaluate', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.flags.evaluate('analytics.tracking_enabled', { user_id: 'user-1' }, 'prod')
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/flags/evaluate')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      flag_key: 'analytics.tracking_enabled',
      environment: 'prod',
      context: { user_id: 'user-1' },
    })
  })

  it('should POST /evaluate/all for evaluateAll', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.flags.evaluateAll({ user_id: 'user-1', plan: 'enterprise' }, 'staging')
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/flags/evaluate/all')
    expect(JSON.parse(init.body)).toEqual({
      environment: 'staging',
      context: { user_id: 'user-1', plan: 'enterprise' },
    })
  })
})

// ============================================================================
// CommunicationService
// ============================================================================

describe('CommunicationService', () => {
  it('should POST /email/send', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'msg1' } }))
    await sm.communication.sendEmail({ to: 'a@b.com', subject: 'Hi', body: '<p>Hello</p>' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/communication/email/send')
    expect(JSON.parse(init.body).to).toBe('a@b.com')
  })

  it('should POST /email/templates/{name}/send', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'msg1' } }))
    await sm.communication.sendEmailTemplate('welcome', { to: 'a@b.com', variables: { name: 'John' } })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/communication/email/templates/welcome/send')
  })

  it('should POST /sms/send', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'msg1' } }))
    await sm.communication.sendSms({ to: '+1234567890', message: 'Hello' })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/communication/sms/send')
  })

  it('should POST /sms/templates/{name}/send', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'msg1' } }))
    await sm.communication.sendSmsTemplate('verify', { to: '+1234567890' })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/communication/sms/templates/verify/send')
  })

  it('should POST /push/send', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'msg1' } }))
    await sm.communication.sendPush({ user_id: 'u1', title: 'New msg', body: 'Check it out' })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/communication/push/send')
  })

  it('should POST /push/register', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.communication.registerPushToken({ token: 'fcm_tok', platform: 'ios' })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.token).toBe('fcm_tok')
    expect(body.platform).toBe('ios')
  })

  it('should DELETE /push/tokens/{token}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.communication.unregisterPushToken('fcm_tok')
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/communication/push/tokens/fcm_tok')
    expect(init.method).toBe('DELETE')
  })

  it('should GET /messages/{id}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'msg1', status: 'delivered' } }))
    await sm.communication.getMessageStatus('msg1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/communication/messages/msg1')
  })
})

// ============================================================================
// SchedulerService
// ============================================================================

describe('SchedulerService', () => {
  it('should POST /jobs for createJob', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'j1' } }))
    await sm.scheduler.createJob({ name: 'daily-report', cron: '0 9 * * *', type: 'webhook', config: { url: 'https://x.com/report' } })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/scheduler/jobs')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.cron).toBe('0 9 * * *')
  })

  it('should GET /jobs for listJobs', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { data: [], metadata: { total: 0 } } }))
    await sm.scheduler.listJobs()
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/scheduler/jobs')
    expect(mockFetch.mock.calls[0][1].method).toBe('GET')
  })

  it('should GET /jobs/{id}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'j1' } }))
    await sm.scheduler.getJob('j1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/scheduler/jobs/j1')
  })

  it('should PATCH /jobs/{id} for updateJob', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'j1' } }))
    await sm.scheduler.updateJob('j1', { cron: '0 10 * * *' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/scheduler/jobs/j1')
    expect(init.method).toBe('PATCH')
  })

  it('should DELETE /jobs/{id}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.scheduler.deleteJob('j1')
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })

  it('should POST /jobs/{id}/pause', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { status: 'paused' } }))
    await sm.scheduler.pauseJob('j1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/scheduler/jobs/j1/pause')
  })

  it('should POST /jobs/{id}/resume', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { status: 'active' } }))
    await sm.scheduler.resumeJob('j1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/scheduler/jobs/j1/resume')
  })

  it('should POST /jobs/{id}/run-now', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'exec1' } }))
    await sm.scheduler.runNow('j1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/scheduler/jobs/j1/run-now')
  })

  it('should GET /jobs/{id}/executions', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { data: [], metadata: { total: 0 } } }))
    await sm.scheduler.getExecutions('j1')
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/scheduler/jobs/j1/executions')
  })

  it('should GET /jobs/{id}/stats', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { total_executions: 100 } }))
    await sm.scheduler.getStats('j1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/scheduler/jobs/j1/stats')
  })
})

// ============================================================================
// PermissionsService
// ============================================================================

describe('PermissionsService', () => {
  it('should POST /roles for createRole', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'r1', name: 'editor' } }))
    await sm.permissions.createRole({ name: 'editor', description: 'Can edit' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/permissions/roles')
    expect(JSON.parse(init.body).name).toBe('editor')
  })

  it('should GET /roles for listRoles', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.permissions.listRoles()
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/permissions/roles')
    expect(mockFetch.mock.calls[0][1].method).toBe('GET')
  })

  it('should POST /roles/{id}/permissions for assignPermissions', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.permissions.assignPermissions('r1', ['posts.create', 'posts.edit'])
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/permissions/roles/r1/permissions')
    expect(JSON.parse(init.body).permissions).toEqual(['posts.create', 'posts.edit'])
  })

  it('should POST /users/{id}/roles for assignRole', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.permissions.assignRole('u1', 'r1')
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/permissions/users/u1/roles')
    expect(JSON.parse(init.body).role_id).toBe('r1')
  })

  it('should POST /check', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { allowed: true, permission: 'posts.create' } }))
    const result = await sm.permissions.check('u1', 'posts.create')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.identity_id).toBe('u1')
    expect(body.identity_type).toBe('user')
    expect(body.permission).toBe('posts.create')
    expect(result.data!.allowed).toBe(true)
  })

  it('should POST /batch-check', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [{ allowed: true }, { allowed: false }] }))
    await sm.permissions.batchCheck('u1', ['posts.create', 'admin.delete'])
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.permissions).toEqual(['posts.create', 'admin.delete'])
  })

  it('should GET /users/{id}/permissions', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: ['posts.create', 'posts.edit'] }))
    await sm.permissions.getUserPermissions('u1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/permissions/users/u1/permissions')
  })

  it('should POST /policies for createPolicy', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'pol1' } }))
    await sm.permissions.createPolicy({ name: 'allow-edit', effect: 'allow', actions: ['edit'], resources: ['posts/*'] })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/permissions/policies')
  })

  it('should GET /policies', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.permissions.listPolicies()
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/permissions/policies')
  })

  it('should POST /evaluate', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { allowed: true } }))
    await sm.permissions.evaluate({ user_id: 'u1', action: 'edit', resource: 'posts/p1' })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/permissions/evaluate')
  })
})

// ============================================================================
// WorkspacesService
// ============================================================================

describe('WorkspacesService', () => {
  it('should POST / for create', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 't1', name: 'Engineering' } }))
    await sm.workspaces.create({ name: 'Engineering' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/workspaces')
    expect(init.method).toBe('POST')
  })

  it('should GET / for list', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { data: [], metadata: { total: 0 } } }))
    await sm.workspaces.list()
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/workspaces')
    expect(mockFetch.mock.calls[0][1].method).toBe('GET')
  })

  it('should GET /{id}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 't1' } }))
    await sm.workspaces.get('t1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/workspaces/t1')
  })

  it('should PATCH /{id} for update', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 't1' } }))
    await sm.workspaces.update('t1', { name: 'Eng v2' })
    expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
  })

  it('should DELETE /{id}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.workspaces.delete('t1')
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })

  it('should GET /{id}/members', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { data: [], metadata: { total: 0 } } }))
    await sm.workspaces.listMembers('t1')
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/workspaces/t1/members')
  })

  it('should POST /{id}/members for addMember', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.workspaces.addMember('t1', { user_id: 'u1', role: 'member' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/workspaces/t1/members')
    expect(JSON.parse(init.body).user_id).toBe('u1')
  })

  it('should PATCH /{id}/members/{userId} for updateMember', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.workspaces.updateMember('t1', 'u1', { role: 'admin' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/workspaces/t1/members/u1')
    expect(init.method).toBe('PATCH')
  })

  it('should DELETE /{id}/members/{userId} for removeMember', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.workspaces.removeMember('t1', 'u1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/workspaces/t1/members/u1')
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })

  it('should POST /{id}/invitations for invite', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'inv1' } }))
    await sm.workspaces.invite('t1', { email: 'dev@co.com', role: 'member' })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/workspaces/t1/invitations')
  })

  it('should GET /{id}/invitations', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.workspaces.listInvitations('t1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/workspaces/t1/invitations')
  })

  it('should POST /invitations/{token}/accept', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.workspaces.acceptInvitation('tok123')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/workspaces/invitations/tok123/accept')
  })

  it('should DELETE /invitations/{id} for cancelInvitation', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.workspaces.cancelInvitation('inv1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/workspaces/invitations/inv1')
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })

  it('should POST /{id}/sso/configure', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.workspaces.configureSso('t1', { provider: 'okta', domain: 'co.com' })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/workspaces/t1/sso/configure')
  })

  it('should GET /{id}/sso', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { provider: 'okta' } }))
    await sm.workspaces.getSso('t1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/workspaces/t1/sso')
  })

  it('should support deprecated teams alias', () => {
    expect(sm.teams).toBe(sm.workspaces)
  })
})

// ============================================================================
// GraphService
// ============================================================================

describe('GraphService', () => {
  it('should POST /nodes for createNode', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'n1' } }))
    await sm.graph.createNode({ label: 'person', properties: { name: 'Alice' } })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/graph/nodes')
    expect(JSON.parse(init.body).label).toBe('person')
  })

  it('should PATCH /nodes/{id} for updateNode', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'n1' } }))
    await sm.graph.updateNode('n1', { properties: { age: 30 } })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/graph/nodes/n1')
    expect(init.method).toBe('PATCH')
  })

  it('should POST /edges for createEdge', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'e1' } }))
    await sm.graph.createEdge({ from_id: 'n1', to_id: 'n2', type: 'knows' })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/graph/edges')
  })

  it('should GET /nodes/{id}/edges', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.graph.getEdges('n1', { type: 'knows', direction: 'out' })
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('/v1/graph/nodes/n1/edges')
    expect(url).toContain('type=knows')
    expect(url).toContain('direction=out')
  })

  it('should GET /nodes/{id}/traverse', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.graph.traverse('n1', { depth: 3 })
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/graph/nodes/n1/traverse')
  })

  it('should POST /shortest-path', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { path: ['n1', 'n3', 'n2'] } }))
    await sm.graph.shortestPath({ from: 'n1', to: 'n2' })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.from).toBe('n1')
    expect(body.to).toBe('n2')
  })

  it('should GET /nodes/{id}/neighbors', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.graph.neighbors('n1', { depth: 2 })
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/graph/nodes/n1/neighbors')
  })

  it('should POST /algorithms/pagerank', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.graph.pageRank({ iterations: 20 })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/graph/algorithms/pagerank')
  })

  it('should POST /algorithms/centrality', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.graph.centrality({ algorithm: 'betweenness' })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/graph/algorithms/centrality')
  })

  it('should POST /algorithms/connected-components', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.graph.connectedComponents()
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/graph/algorithms/connected-components')
  })
})

// ============================================================================
// FunctionsService
// ============================================================================

describe('FunctionsService', () => {
  it('should POST / for deploy', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { name: 'resize' } }))
    await sm.functions.deploy({ name: 'resize', runtime: 'node18', code: 'exports.handler=()=>{}' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/functions')
    expect(JSON.parse(init.body).runtime).toBe('node18')
  })

  it('should GET / for list', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.functions.list()
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/functions')
    expect(mockFetch.mock.calls[0][1].method).toBe('GET')
  })

  it('should GET /{name}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { name: 'resize' } }))
    await sm.functions.get('resize')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/functions/resize')
  })

  it('should PATCH /{name} for update', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.functions.update('resize', { code: 'new code' })
    expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
  })

  it('should DELETE /{name}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.functions.delete('resize')
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })

  it('should POST /{name}/invoke', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { result: 'ok' } }))
    await sm.functions.invoke('resize', { imageUrl: 'https://img.com/1.jpg', width: 200 })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/functions/resize/invoke')
    expect(JSON.parse(init.body).width).toBe(200)
  })

  it('should POST /{name}/invoke-async', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { execution_id: 'ex1' } }))
    await sm.functions.invokeAsync('resize', { imageUrl: 'https://img.com/1.jpg' })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/functions/resize/invoke-async')
  })

  it('should GET /{name}/logs', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.functions.getLogs('resize')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/functions/resize/logs')
  })

  it('should GET /{name}/executions', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { data: [], metadata: { total: 0 } } }))
    await sm.functions.getExecutions('resize')
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/functions/resize/executions')
  })

  it('should GET /{name}/metrics', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.functions.getMetrics('resize')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/functions/resize/metrics')
  })
})

// ============================================================================
// ListingsService
// ============================================================================

describe('ListingsService', () => {
  it('should POST / for create', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'l1' } }))
    await sm.listings.create({ title: 'Camera', description: 'DSLR', price: 150, category: 'electronics' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/listings')
    expect(JSON.parse(init.body).price).toBe(150)
  })

  it('should GET /{id}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'l1' } }))
    await sm.listings.get('l1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/listings/l1')
  })

  it('should PATCH /{id} for update', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.listings.update('l1', { price: 120 })
    expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
  })

  it('should DELETE /{id}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.listings.delete('l1')
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })

  it('should GET /search', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.listings.search('camera', { category: 'electronics', maxPrice: 200 })
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('/v1/listings/search')
    expect(url).toContain('query=camera')
  })

  it('should GET /nearby', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.listings.nearby({ lat: 40.7, lng: -74.0, radius: 10 })
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('/v1/listings/nearby')
    expect(url).toContain('lat=40.7')
  })

  it('should GET /categories/{category}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { data: [], metadata: { total: 0 } } }))
    await sm.listings.getByCategory('electronics')
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/listings/categories/electronics')
  })

  it('should POST /{id}/favorite', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.listings.favorite('l1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/listings/l1/favorite')
  })

  it('should DELETE /{id}/favorite for unfavorite', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.listings.unfavorite('l1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/listings/l1/favorite')
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })

  it('should GET /favorites', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { data: [], metadata: { total: 0 } } }))
    await sm.listings.getFavorites()
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/listings/favorites')
  })

  it('should POST /{id}/view for trackView', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.listings.trackView('l1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/listings/l1/view')
  })
})

// ============================================================================
// EventsService
// ============================================================================

describe('EventsService', () => {
  it('should POST / for create', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'ev1' } }))
    await sm.events.create({ title: 'Launch Party', description: 'SDK launch', start_date: '2026-03-01' })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/events')
    expect(mockFetch.mock.calls[0][1].method).toBe('POST')
  })

  it('should GET /{id}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'ev1' } }))
    await sm.events.get('ev1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/events/ev1')
  })

  it('should PATCH /{id} for update', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.events.update('ev1', { title: 'Updated Party' })
    expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
  })

  it('should DELETE /{id}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.events.delete('ev1')
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })

  it('should GET / for list', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { data: [], metadata: { total: 0 } } }))
    await sm.events.list()
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/events')
    expect(mockFetch.mock.calls[0][1].method).toBe('GET')
  })

  it('should POST /{id}/register', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.events.register('ev1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/events/ev1/register')
  })

  it('should DELETE /{id}/register for unregister', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.events.unregister('ev1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/events/ev1/register')
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })

  it('should GET /{id}/attendees', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { data: [], metadata: { total: 0 } } }))
    await sm.events.getAttendees('ev1')
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/events/ev1/attendees')
  })

  it('should POST /{id}/check-in', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.events.checkIn('ev1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/events/ev1/check-in')
  })
})

// ============================================================================
// LeaderboardService
// ============================================================================

describe('LeaderboardService', () => {
  it('should POST / for create', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'lb1' } }))
    await sm.leaderboard.create({ name: 'High Scores', sort_order: 'desc' })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/leaderboard')
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).sort_order).toBe('desc')
  })

  it('should POST /{boardId}/scores for submitScore', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.leaderboard.submitScore('lb1', { user_id: 'u1', score: 1500 })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/leaderboard/lb1/scores')
  })

  it('should GET /{boardId}/rankings', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.leaderboard.getRankings('lb1', { limit: 100 })
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('/v1/leaderboard/lb1/rankings')
    expect(url).toContain('limit=100')
  })

  it('should GET /{boardId}/users/{userId}/rank', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { rank: 5, score: 1500 } }))
    await sm.leaderboard.getUserRank('lb1', 'u1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/leaderboard/lb1/users/u1/rank')
  })

  it('should GET /{boardId}/users/{userId}/history', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.leaderboard.getUserHistory('lb1', 'u1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/leaderboard/lb1/users/u1/history')
  })

  it('should PATCH /{boardId}/users/{userId}/score for updateScore', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.leaderboard.updateScore('lb1', 'u1', { score: 2000 })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/leaderboard/lb1/users/u1/score')
    expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
  })

  it('should DELETE /{boardId}/users/{userId}/score for deleteScore', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.leaderboard.deleteScore('lb1', 'u1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/leaderboard/lb1/users/u1/score')
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })
})

// ============================================================================
// WebhooksService
// ============================================================================

describe('WebhooksService', () => {
  it('should POST / for create', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'wh1' } }))
    await sm.webhooks.create({ url: 'https://myapp.com/hooks', events: ['auth.user.created'] })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/webhooks')
    expect(JSON.parse(init.body).events).toEqual(['auth.user.created'])
  })

  it('should GET / for list', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.webhooks.list()
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/webhooks')
    expect(mockFetch.mock.calls[0][1].method).toBe('GET')
  })

  it('should GET /{id}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'wh1' } }))
    await sm.webhooks.get('wh1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/webhooks/wh1')
  })

  it('should PATCH /{id} for update', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.webhooks.update('wh1', { events: ['storage.file.uploaded'], is_active: false })
    expect(mockFetch.mock.calls[0][1].method).toBe('PATCH')
  })

  it('should DELETE /{id}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.webhooks.delete('wh1')
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })

  it('should GET /events for listEvents', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: ['auth.user.created', 'storage.file.uploaded'] }))
    await sm.webhooks.listEvents()
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/webhooks/events')
  })
})

// ============================================================================
// SearchService
// ============================================================================

describe('SearchService', () => {
  it('should POST / for query', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.search.query('widget', { index: 'products', limit: 10 })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/search')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.query).toBe('widget')
    expect(body.index).toBe('products')
    expect(body.limit).toBe(10)
  })

  it('should POST /documents for index', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.search.index('products', { id: '1', name: 'Widget', price: 9.99 })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/search/documents')
    const body = JSON.parse(init.body)
    expect(body.index).toBe('products')
    expect(body.name).toBe('Widget')
  })

  it('should DELETE /documents/{index}/{docId} for removeDocument', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.search.removeDocument('products', 'doc1')
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/search/documents/products/doc1')
    expect(init.method).toBe('DELETE')
  })
})

// ============================================================================
// VideoService
// ============================================================================

describe('VideoService', () => {
  it('should GET /{id} for get', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'v1', status: 'ready' } }))
    const result = await sm.video.get('v1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/videos/v1')
    expect(mockFetch.mock.calls[0][1].method).toBe('GET')
    expect(result.data!.status).toBe('ready')
  })

  it('should return stream URL without network call', async () => {
    const result = await sm.video.getStreamUrl('v1')
    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.data!.url).toBe('https://api.scalemule.com/v1/videos/v1/playlist.m3u8')
    expect(result.error).toBeNull()
  })

  it('should POST /{id}/track for trackPlayback', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.video.trackPlayback('v1', { event_type: 'play', position_seconds: 0 })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/videos/v1/track')
    expect(JSON.parse(init.body).event_type).toBe('play')
  })

  it('should GET /{id}/analytics for getAnalytics', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { views: 100 } }))
    await sm.video.getAnalytics('v1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/videos/v1/analytics')
  })
})

// ============================================================================
// CacheService
// ============================================================================

describe('CacheService', () => {
  it('should GET /{key} for get', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { value: 'cached_data' } }))
    await sm.cache.get('mykey')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/cache/mykey')
    expect(mockFetch.mock.calls[0][1].method).toBe('GET')
  })

  it('should POST / for set', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.cache.set('mykey', { value: 'data' }, 3600)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/cache')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.key).toBe('mykey')
    expect(body.ttl).toBe(3600)
  })

  it('should DELETE /{key}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.cache.delete('mykey')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/cache/mykey')
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })

  it('should DELETE / for flush', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.cache.flush()
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/cache')
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })
})

// ============================================================================
// ComplianceService
// ============================================================================

describe('ComplianceService', () => {
  it('should POST /audit-logs for log', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.compliance.log({ action: 'user.deleted', resource_type: 'user', resource_id: 'u1' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/compliance/audit-logs')
    expect(JSON.parse(init.body).action).toBe('user.deleted')
  })

  it('should POST /gdpr/access-request for requestDataExport', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.compliance.requestDataExport('u1')
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/compliance/gdpr/access-request')
    expect(JSON.parse(init.body).user_id).toBe('u1')
  })

  it('should POST /gdpr/deletion-request for requestDataDeletion', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.compliance.requestDataDeletion('u1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/compliance/gdpr/deletion-request')
  })
})

// ============================================================================
// OrchestratorService
// ============================================================================

describe('OrchestratorService', () => {
  it('should POST /workflows for createWorkflow', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'wf1' } }))
    await sm.orchestrator.createWorkflow({ name: 'onboarding', steps: [{ type: 'email' }] })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/orchestrator/workflows')
  })

  it('should POST /workflows/{id}/execute', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { execution_id: 'ex1' } }))
    await sm.orchestrator.execute('wf1', { userId: 'u1' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/orchestrator/workflows/wf1/execute')
    expect(JSON.parse(init.body).userId).toBe('u1')
  })

  it('should GET /executions/{id}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'ex1', status: 'completed' } }))
    await sm.orchestrator.getExecution('ex1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/orchestrator/executions/ex1')
  })
})

// ============================================================================
// AccountsService
// ============================================================================

describe('AccountsService', () => {
  it('should POST /clients for createClient', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'cl1' } }))
    await sm.accounts.createClient({ name: 'Acme', email: 'acme@co.com' })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/accounts/clients')
  })

  it('should GET /clients for getClients', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.accounts.getClients()
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/accounts/clients')
  })

  it('should POST /applications for createApplication', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'app1' } }))
    await sm.accounts.createApplication({ name: 'MyApp' })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/accounts/applications')
  })

  it('should GET /applications for getApplications', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.accounts.getApplications()
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/accounts/applications')
  })
})

// ============================================================================
// IdentityService
// ============================================================================

describe('IdentityService', () => {
  it('should POST /api-keys for createApiKey', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'key1', key: 'sm_pk_xxx' } }))
    await sm.identity.createApiKey({ name: 'Production Key' })
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/identity/api-keys')
  })

  it('should GET /api-keys for listApiKeys', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.identity.listApiKeys()
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/identity/api-keys')
  })

  it('should DELETE /api-keys/{id} for revokeApiKey', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.identity.revokeApiKey('key1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/identity/api-keys/key1')
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })
})

// ============================================================================
// CatalogService
// ============================================================================

describe('CatalogService', () => {
  it('should GET /services for listServices', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.catalog.listServices()
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/catalog/services')
  })

  it('should GET /services/{name}/health', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { status: 'healthy' } }))
    await sm.catalog.getServiceHealth('auth')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/catalog/services/auth/health')
  })
})

// ============================================================================
// LoggerService
// ============================================================================

describe('LoggerService', () => {
  it('should POST /logs with severity not level (new schema)', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.logger.log({ service: 'auth', severity: 'error', message: 'Something failed' })
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.scalemule.com/v1/logger/logs')
    const body = JSON.parse(init.body)
    expect(body.severity).toBe('error')
    expect(body.service).toBe('auth')
    expect(body.level).toBeUndefined()
  })

  it('should auto-map legacy { level, message } to { severity, service }', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.logger.log({ level: 'error', message: 'Something failed', metadata: { service: 'auth' } })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.severity).toBe('error')
    expect(body.service).toBe('sdk')
    expect(body.message).toBe('Something failed')
  })

  it('should POST /logs/batch and auto-chunk >100', async () => {
    // 150 entries → 2 POST calls (100 + 50)
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { ingested: 100 } }))
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { ingested: 50 } }))
    const logs = Array.from({ length: 150 }, (_, i) => ({
      service: 'test',
      severity: 'info' as const,
      message: `Log ${i}`,
    }))
    const result = await sm.logger.logBatch(logs)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/logger/logs/batch')
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).logs.length).toBe(100)
    expect(JSON.parse(mockFetch.mock.calls[1][1].body).logs.length).toBe(50)
    expect(result.data?.ingested).toBe(150)
  })

  it('should POST /logs/batch for small batch', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { ingested: 5 } }))
    const logs = Array.from({ length: 5 }, (_, i) => ({
      service: 'test',
      severity: 'debug' as const,
      message: `Log ${i}`,
    }))
    const result = await sm.logger.logBatch(logs)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(result.data?.ingested).toBe(5)
  })

  it('convenience methods should set correct severity', async () => {
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
      await sm.logger[level]('my-service', `test ${level}`)
      const body = JSON.parse(mockFetch.mock.calls[mockFetch.mock.calls.length - 1][1].body)
      expect(body.severity).toBe(level)
      expect(body.service).toBe('my-service')
    }
  })

  it('should GET /logs for queryLogs with new params', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { logs: [], total: 0, page: 1, limit: 20 } }))
    await sm.logger.queryLogs({ severity: 'error', service: 'auth' })
    const url = mockFetch.mock.calls[0][0]
    expect(url).toContain('/v1/logger/logs')
    expect(url).toContain('severity=error')
    expect(url).toContain('service=auth')
  })

  it('queryLogs response shape should match LogQueryResponse', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      data: { logs: [{ id: '1', service_name: 'auth', severity: 'info', message: 'ok', timestamp: '2026-01-01T00:00:00Z' }], total: 1, page: 1, limit: 20 },
    }))
    const result = await sm.logger.queryLogs()
    expect(result.data?.logs).toBeDefined()
    expect(result.data?.total).toBe(1)
    expect(result.data?.page).toBe(1)
    expect(result.data?.limit).toBe(20)
  })
})

// ============================================================================
// QueueService — Dead Letter sub-API
// ============================================================================

describe('QueueService — Dead Letter', () => {
  it('should GET /dead-letter for list', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))
    await sm.queue.deadLetter.list()
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/queue/dead-letter')
    expect(mockFetch.mock.calls[0][1].method).toBe('GET')
  })

  it('should GET /dead-letter/{id}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'dl1' } }))
    await sm.queue.deadLetter.get('dl1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/queue/dead-letter/dl1')
  })

  it('should POST /dead-letter/{id}/retry', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.queue.deadLetter.retry('dl1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/queue/dead-letter/dl1/retry')
  })

  it('should DELETE /dead-letter/{id}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: {} }))
    await sm.queue.deadLetter.delete('dl1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/queue/dead-letter/dl1')
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')
  })
})

// ============================================================================
// QueueService — getJob
// ============================================================================

describe('QueueService — getJob', () => {
  it('should GET /jobs/{id}', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { id: 'j1', status: 'processing' } }))
    await sm.queue.getJob('j1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/queue/jobs/j1')
    expect(mockFetch.mock.calls[0][1].method).toBe('GET')
  })
})

// ============================================================================
// StorageService — getViewStatus
// ============================================================================

describe('StorageService — getViewStatus', () => {
  it('should GET /files/{id}/view-status', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: { status: 'clean' } }))
    await sm.storage.getViewStatus('f1')
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.scalemule.com/v1/storage/files/f1/view-status')
  })
})
