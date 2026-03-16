import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlagClient } from './client';

const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      ...headers
    }
  });
}

describe('FlagClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('falls back to polling when the initial stream connection fails', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse(
          {
            data: {
              version: 1,
              rollout_salt: 'test-salt',
              environment: 'prod',
              segments: [],
              flags: []
            }
          },
          { etag: '"v1"' }
        )
      )
      .mockRejectedValueOnce(new Error('stream unavailable'))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));

    const client = new FlagClient({
      apiKey: 'sm_secret_test',
      environment: 'prod',
      gatewayUrl: 'https://api.scalemule.com'
    });

    await client.init();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockFetch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[2]?.[0]).toBe(
      'https://api.scalemule.com/v1/flags/config?environment=prod'
    );
    expect(mockFetch.mock.calls[2]?.[1]).toMatchObject({
      headers: {
        'x-api-key': 'sm_secret_test',
        'if-none-match': '"v1"'
      }
    });

    await client.shutdown();
  });
});
