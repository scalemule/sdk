/**
 * ScaleMule Signals error-context tests.
 *
 * The platform error envelope is
 * `{ success:false, error:{ code, message, field }, meta:{ timestamp, request_id } }`
 * and the gateway echoes `x-request-id` on every response. These tests pin the
 * additive fields the SDK surfaces on `ApiError` so `@scalemule/signals`
 * (`fromError`) can route a failure to the right field and correlate it with a
 * request id. Nothing here may change the existing `{ code, message, status,
 * details }` shape — that contract is asserted below too.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScaleMule } from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function errorResponse(
  body: unknown,
  status: number,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

describe('ApiError Signals context', () => {
  let sm: ScaleMule;

  beforeEach(() => {
    mockFetch.mockReset();
    sm = new ScaleMule({ apiKey: 'sm_pb_test', baseUrl: 'https://api.test' });
  });

  it('carries field, requestId, traceId, retryable and the raw problem', async () => {
    mockFetch.mockResolvedValue(
      errorResponse(
        {
          success: false,
          error: {
            code: 'validation_error',
            message: 'Email is already registered',
            field: 'email',
            retryable: false
          },
          meta: {
            timestamp: '2026-08-15T10:00:00Z',
            request_id: 'req_body_123',
            trace_id: 'trace_abc'
          }
        },
        422
      )
    );

    const { error } = await sm.getClient().post('/auth/signup', { email: 'a@b.c' });

    expect(error).toBeTruthy();
    // Existing contract is untouched.
    expect(error!.code).toBe('validation_error');
    expect(error!.message).toBe('Email is already registered');
    expect(error!.status).toBe(422);
    // Additive Signals context.
    expect(error!.field).toBe('email');
    expect(error!.requestId).toBe('req_body_123');
    expect(error!.traceId).toBe('trace_abc');
    expect(error!.retryable).toBe(false);
    expect(error!.problem).toEqual({
      code: 'validation_error',
      message: 'Email is already registered',
      field: 'email',
      retryable: false
    });
  });

  it('falls back to the x-request-id response header when meta is absent', async () => {
    mockFetch.mockResolvedValue(
      errorResponse(
        { success: false, error: { code: 'not_found', message: 'No such thing' } },
        404,
        { 'x-request-id': 'req_header_456' }
      )
    );

    const { error } = await sm.getClient().get('/things/1');

    expect(error!.requestId).toBe('req_header_456');
    expect(error!.traceId).toBeUndefined();
    expect(error!.field).toBeUndefined();
    expect(error!.retryable).toBeUndefined();
  });

  it('prefers meta.request_id over the x-request-id header', async () => {
    mockFetch.mockResolvedValue(
      errorResponse(
        {
          success: false,
          error: { code: 'forbidden', message: 'Nope' },
          meta: { request_id: 'req_body_wins' }
        },
        403,
        { 'x-request-id': 'req_header_loses' }
      )
    );

    const { error } = await sm.getClient().get('/things/1');

    expect(error!.requestId).toBe('req_body_wins');
  });

  it('leaves the new fields undefined for a bare legacy error body', async () => {
    mockFetch.mockResolvedValue(
      errorResponse({ code: 'conflict', message: 'Already exists' }, 409)
    );

    const { error } = await sm.getClient().post('/things', { name: 'x' });

    expect(error!.code).toBe('conflict');
    expect(error!.message).toBe('Already exists');
    expect(error!.field).toBeUndefined();
    expect(error!.requestId).toBeUndefined();
    expect(error!.traceId).toBeUndefined();
    expect(error!.retryable).toBeUndefined();
    expect(error!.problem).toBeUndefined();
  });

  it('does not attach Signals context to network errors', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));

    const { error } = await sm.getClient().get('/things', { skipRetry: true });

    expect(error!.code).toBe('network_error');
    expect(error!.status).toBe(0);
    expect(error!.requestId).toBeUndefined();
    expect(error!.problem).toBeUndefined();
  });
});
