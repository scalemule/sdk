import { describe, expect, it, vi } from 'vitest';
import { AiService } from './services/ai';
import type { ScaleMuleClient } from './client';

function fakeClient(session: string | null, workspace: string | null) {
  return {
    getBaseUrl: () => 'https://api.example.com',
    getApiKey: () => 'pk_test',
    getSessionToken: () => session,
    getWorkspaceId: () => workspace
  } as unknown as ScaleMuleClient;
}

function okFetch(body: unknown, status = 201) {
  return vi.fn(async () => new Response(JSON.stringify({ success: true, data: body }), { status, headers: { 'content-type': 'application/json' } }));
}

describe('AiService', () => {
  it('summarizes through /v1/ai/runs with SDK credentials and the active workspace', async () => {
    const fetcher = okFetch({ id: 'r1', operation: 'summarize', version: 1, status: 'succeeded', attempt: 1, created_at: 't', output_expired: false, cancel_requested: false, output: { summary: 'Кратко', format: 'brief', truncated: false } });
    const ai = new AiService(fakeClient('sess-token', 'acct-1'), { fetch: fetcher as unknown as typeof fetch });
    const result = await ai.summarize({ text: 'long text' });
    expect(result.error).toBeNull();
    expect(result.data?.summary).toBe('Кратко');
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/ai/runs');
    const headers = init.headers as Headers;
    expect(headers.get('x-api-key')).toBe('pk_test');
    expect(headers.get('authorization')).toBe('Bearer sess-token');
    expect(headers.get('x-requested-account-id')).toBe('acct-1');
    expect(headers.get('x-idempotency-key')).toMatch(/^ai_/);
    expect(JSON.parse(init.body as string)).toMatchObject({ operation: 'summarize', input: { text: 'long text' } });
  });

  it('lets a call override the account and omits auth without a session', async () => {
    const fetcher = okFetch({ id: 'r1', operation: 'summarize', version: 1, status: 'queued', attempt: 0, created_at: 't', output_expired: false, cancel_requested: false }, 202);
    const ai = new AiService(fakeClient(null, 'acct-1'), { fetch: fetcher as unknown as typeof fetch });
    await ai.runs.create({ operation: 'summarize', input: { text: 'x' } }, { accountId: 'acct-2', idempotencyKey: 'ai_fixed' });
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-requested-account-id')).toBe('acct-2');
    expect(headers.get('x-idempotency-key')).toBe('ai_fixed');
  });

  it('returns the error envelope without throwing', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ success: false, error: { code: 'ACTIVATION_UNAVAILABLE', message: 'not activated' } }), { status: 404 }));
    const ai = new AiService(fakeClient('s', 'a'), { fetch: fetcher as unknown as typeof fetch });
    const result = await ai.getRun('missing');
    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ code: 'ACTIVATION_UNAVAILABLE', status: 404 });
  });
});
