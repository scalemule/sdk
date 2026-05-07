import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScaleMuleClient } from './client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function errorResponse(code: string, message: string, status: number): Response {
  const resp = new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
  // Vitest/jsdom Response might not set .ok correctly for some status codes in mocks
  Object.defineProperty(resp, 'ok', { value: false });
  return resp;
}

describe('401 Auto-Refresh Interceptor', () => {
  let sm: ScaleMuleClient;
  const onRefreshStart = vi.fn();
  const onRefreshEnd = vi.fn();
  const onAutoRefreshFailed = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    onRefreshStart.mockReset();
    onRefreshEnd.mockReset();
    onAutoRefreshFailed.mockReset();

    sm = new ScaleMuleClient({
      apiKey: 'test_api_key',
      onRefreshStart,
      onRefreshEnd,
      retry: { maxRetries: 0 },
      debug: true
    });
    sm.setAccessToken('old_token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should automatically refresh and retry on 401', async () => {
    // 1st call: 401
    mockFetch.mockResolvedValueOnce(errorResponse('unauthorized', 'Expired', 401));
    // 2nd call: /auth/refresh success
    mockFetch.mockResolvedValueOnce(jsonResponse({ access_token: 'new_token', user_id: 'u1' }));
    // 3rd call: original request success
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

    const result = await sm.get('/test');

    expect(result.data).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify refresh call
    const refreshCall = mockFetch.mock.calls[1];
    expect(refreshCall![0]).toContain('/auth/refresh');

    // Verify retry call used new token
    const retryCall = mockFetch.mock.calls[2];
    const headers = retryCall![1]!.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer new_token');

    expect(onRefreshStart).toHaveBeenCalled();
    expect(onRefreshEnd).toHaveBeenCalled();
  });

  it('should call onAutoRefreshFailed and return original error if refresh fails', async () => {
    // 1st call: 401
    mockFetch.mockResolvedValueOnce(errorResponse('unauthorized', 'Expired', 401));
    // 2nd call: /auth/refresh fails
    mockFetch.mockResolvedValueOnce(errorResponse('refresh_failed', 'Invalid refresh', 400));

    const result = await sm.get('/test', { onAutoRefreshFailed });

    expect(result.error?.status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(onAutoRefreshFailed).toHaveBeenCalled();
    expect(onRefreshEnd).toHaveBeenCalled();
  });

  it('should coalesce concurrent 401s into a single refresh request', async () => {
    // Two concurrent requests both hit 401
    mockFetch.mockResolvedValueOnce(errorResponse('unauthorized', 'Expired', 401));
    mockFetch.mockResolvedValueOnce(errorResponse('unauthorized', 'Expired', 401));

    // Refresh call (only one should happen)
    mockFetch.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return jsonResponse({ access_token: 'new_token' });
    });

    // Retry calls
    mockFetch.mockImplementation(() => Promise.resolve(jsonResponse({ success: true })));

    const [res1, res2] = await Promise.all([sm.get('/test1'), sm.get('/test2')]);

    expect(res1.data).toEqual({ success: true });
    expect(res2.data).toEqual({ success: true });

    // Calls: 2 initial 401s + 1 refresh + 2 retries = 5 total
    expect(mockFetch).toHaveBeenCalledTimes(5);

    const refreshCalls = mockFetch.mock.calls.filter((c) => (c[0] as string).includes('/auth/refresh'));
    expect(refreshCalls.length).toBe(1);
  });
});
