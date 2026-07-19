/**
 * Regression tests for request Content-Type handling.
 *
 * Background: PR #39 rewrote `request()` and dropped the block that defaulted
 * `Content-Type: application/json` for JSON bodies. `fetch()` then labeled
 * string bodies `text/plain;charset=UTF-8`, which the platform's strict JSON
 * extractors reject with 400 SM-VAL-TYP-802 "Failed to deserialize request
 * body" — this broke every body-carrying POST fleet-wide (found via MergeYard
 * chat, 2026-07-19). These tests pin the contract so it cannot regress again.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScaleMule } from './index';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function lastRequestHeaders(): Record<string, string> {
  const [, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return init.headers as Record<string, string>;
}

describe('request Content-Type contract', () => {
  let sm: ScaleMule;

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(jsonResponse({ data: { ok: true } }));
    sm = new ScaleMule({ apiKey: 'sm_pb_test', baseUrl: 'https://api.test' });
  });

  it('sets Content-Type: application/json on POST with a JSON body', async () => {
    await sm.getClient().post('/things', { name: 'x' });
    expect(lastRequestHeaders()['Content-Type']).toBe('application/json');
  });

  it('sets Content-Type on PUT and PATCH bodies too', async () => {
    await sm.getClient().put('/things/1', { name: 'y' });
    expect(lastRequestHeaders()['Content-Type']).toBe('application/json');
    await sm.getClient().patch('/things/1', { name: 'z' });
    expect(lastRequestHeaders()['Content-Type']).toBe('application/json');
  });

  it('does not set Content-Type on body-less requests', async () => {
    await sm.getClient().get('/things');
    const headers = lastRequestHeaders();
    expect(
      Object.keys(headers).find((k) => k.toLowerCase() === 'content-type')
    ).toBeUndefined();
  });

  it('respects an explicit caller-provided Content-Type (any casing)', async () => {
    await sm.getClient().request('/upload', {
      method: 'POST',
      body: 'raw-text',
      headers: { 'content-type': 'text/csv' }
    });
    const headers = lastRequestHeaders();
    expect(headers['content-type']).toBe('text/csv');
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('passes pre-stringified bodies through without double-encoding', async () => {
    await sm.getClient().post('/things', JSON.stringify({ name: 'x' }));
    const [, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    expect(init.body).toBe('{"name":"x"}');
    expect(lastRequestHeaders()['Content-Type']).toBe('application/json');
  });
});
