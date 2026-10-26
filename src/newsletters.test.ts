import { describe, it, expect, vi } from 'vitest';
import { NewslettersService } from './services/newsletters';
import type { ScaleMuleClient } from './client';

function fakeClient() {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const record = (method: string) =>
    vi.fn(async (path: string, bodyOrOptions?: unknown) => {
      calls.push({ method, path, body: method === 'GET' ? undefined : bodyOrOptions });
      return { data: { ok: true }, error: null };
    });
  const client = { get: record('GET'), post: record('POST'), put: record('PUT') } as unknown as ScaleMuleClient;
  return { client, calls };
}

describe('NewslettersService', () => {
  it('signs up on the list slug with explicit consent and email channel', async () => {
    const { client, calls } = fakeClient();
    await new NewslettersService(client).subscribe('новини & news', {
      email: 'иван@пример.рф',
      consent: true,
      cadence: 'weekly',
      origin_ref: '/news/Новини-📰',
    });
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/v1/newsletters/lists/%D0%BD%D0%BE%D0%B2%D0%B8%D0%BD%D0%B8%20%26%20news/subscriptions',
      body: { channel: 'email', email: 'иван@пример.рф', consent: true, cadence: 'weekly', origin_ref: '/news/Новини-📰' },
    });
  });

  it('sends tokens in the body for confirm/unsubscribe and in the query for preferences', async () => {
    const { client, calls } = fakeClient();
    const nl = new NewslettersService(client);
    await nl.confirm('a'.repeat(64));
    await nl.unsubscribe('b'.repeat(64));
    await nl.unsubscribe('c'.repeat(64), 'too many emails');
    await nl.preferences('d'.repeat(64));
    await nl.updatePreferences('e'.repeat(64), [{ subscription_id: 's1', expected_revision: 3, active: false }]);
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/v1/newsletters/subscriptions/confirm', body: { token: 'a'.repeat(64) } });
    expect(calls[1].body).toEqual({ token: 'b'.repeat(64) });
    expect(calls[2].body).toEqual({ token: 'c'.repeat(64), reason: 'too many emails' });
    expect(calls[3]).toMatchObject({ method: 'GET', path: `/v1/newsletters/preferences?token=${'d'.repeat(64)}` });
    expect(calls[4]).toMatchObject({
      method: 'PUT',
      path: `/v1/newsletters/preferences?token=${'e'.repeat(64)}`,
      body: { changes: [{ subscription_id: 's1', expected_revision: 3, active: false }] },
    });
  });

  it('reads and updates the signed-in reader subscriptions', async () => {
    const { client, calls } = fakeClient();
    const nl = new NewslettersService(client);
    await nl.lists();
    await nl.mySubscriptions();
    await nl.updateMySubscriptions([{ subscription_id: 's2', expected_revision: 1, cadence: 'daily' }]);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /v1/newsletters/lists',
      'GET /v1/newsletters/me/subscriptions',
      'PUT /v1/newsletters/me/subscriptions',
    ]);
  });
});
