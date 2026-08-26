import { describe, it, expect, vi } from 'vitest';
import { DecisionsService } from './services/decisions';
import { BookingsService } from './services/bookings';
import type { ScaleMuleClient } from './client';

function fakeClient() {
  const calls: { method: string; path: string; body?: unknown; options?: unknown }[] = [];
  const client = {
    get: vi.fn(async (path: string, options?: unknown) => {
      calls.push({ method: 'GET', path, options });
      return { data: { ok: true }, error: null };
    }),
    post: vi.fn(async (path: string, body?: unknown, options?: unknown) => {
      calls.push({ method: 'POST', path, body, options });
      return { data: { ok: true }, error: null };
    })
  } as unknown as ScaleMuleClient;
  return { client, calls };
}

describe('DecisionsService', () => {
  it('posts inputs and options to /v1/decisions/evaluate/{key}', async () => {
    const { client, calls } = fakeClient();
    const decisions = new DecisionsService(client);
    await decisions.evaluate(
      'appointment.deposit',
      { appointment: { quote_id: 'q1' }, customer: { ref: 'c1' } },
      { idempotency_key: 'event:1', trace: 'summary' },
      { headers: { 'x-requested-account-id': 'acct' } }
    );
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/v1/decisions/evaluate/appointment.deposit',
      body: {
        inputs: { appointment: { quote_id: 'q1' }, customer: { ref: 'c1' } },
        options: { idempotency_key: 'event:1', trace: 'summary' }
      },
      options: { headers: { 'x-requested-account-id': 'acct' } }
    });
  });

  it('url-encodes decision keys and receipt ids', async () => {
    const { client, calls } = fakeClient();
    const decisions = new DecisionsService(client);
    await decisions.evaluate('a/b c', {});
    await decisions.verifyReceipt('r 1');
    await decisions.getReceipt('r/2');
    expect(calls[0].path).toBe('/v1/decisions/evaluate/a%2Fb%20c');
    expect(calls[1].path).toBe('/v1/decisions/receipts/r%201/verify');
    expect(calls[2].path).toBe('/v1/decisions/receipts/r%2F2');
  });

  it('batches items', async () => {
    const { client, calls } = fakeClient();
    await new DecisionsService(client).evaluateBatch([{ decision_key: 'x', inputs: {} }]);
    expect(calls[0]).toMatchObject({ path: '/v1/decisions/evaluate/batch', body: { items: [{ decision_key: 'x', inputs: {} }] } });
  });
});

describe('BookingsService', () => {
  it('creates, accepts and reads quotes on /v1/bookings', async () => {
    const { client, calls } = fakeClient();
    const bookings = new BookingsService(client);
    await bookings.createQuote({ customer_ref: 'c1', total_minor: 50000, currency: 'USD' });
    await bookings.acceptQuote('q1', {
      expected_version: 1,
      decision_receipt: { id: 'r', content_hash: 'h', signature: 's', signature_kid: 'k', signed_document: {} }
    });
    await bookings.getQuote('q1');
    await bookings.getCustomerStats('email:a@b.c');
    await bookings.completeBooking('b1', 'done');
    await bookings.markNoShow('b2');
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /v1/bookings/quotes',
      'POST /v1/bookings/quotes/q1/accept',
      'GET /v1/bookings/quotes/q1',
      'GET /v1/bookings/customers/email%3Aa%40b.c/stats',
      'POST /v1/bookings/dashboard/bookings/b1/complete',
      'POST /v1/bookings/dashboard/bookings/b2/no-show'
    ]);
    expect(calls[1].body).toMatchObject({ expected_version: 1 });
  });
});
