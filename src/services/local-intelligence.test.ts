import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScaleMule } from '../index';
import {
  applyIntelligenceChanges,
  type IntelligenceCache,
  type IntelligenceChangePage,
  type LocalIntelligenceRecord
} from './local-intelligence';

const scope = { application_id: 'reader-app', publication_id: 'local-publication' };
const now = Date.parse('2026-10-13T12:00:00Z');
const record = (id: string, revision = 1) =>
  ({ id, revision, contract_version: 'basenews/1', refresh_after: '2026-10-13T12:05:00Z' }) as LocalIntelligenceRecord;
const cache = (): IntelligenceCache => ({ scope, sequence: '0', records: new Map() });
const page = (items: IntelligenceChangePage['items']): IntelligenceChangePage => ({
  scope,
  contract_version: 'basenews/1',
  items,
  next_cursor: 'opaque',
  has_more: false,
  lease_seconds: 300
});
const change = (sequence: string, id: string, value: LocalIntelligenceRecord | null) => ({
  sequence,
  id,
  record: value,
  removed: !value,
  changed_at: '2026-10-13T12:00:00Z'
});
afterEach(() => vi.unstubAllGlobals());

describe('local intelligence agent cache', () => {
  it('applies corrections and removals without replaying an older tombstone', () => {
    let state = applyIntelligenceChanges(
      cache(),
      page([change('1', 'record', record('record')), change('2', 'record', null)]),
      now
    );
    expect(state.records.size).toBe(0);
    state = applyIntelligenceChanges(state, page([change('3', 'record', record('record', 3))]), now);
    state = applyIntelligenceChanges(state, page([change('2', 'record', null)]), now);
    expect(state.records.get('record')?.revision).toBe(3);
    expect(state.sequence).toBe('3');
  });
  it('rejects cross-tenant, missing and out-of-order changes', () => {
    expect(() =>
      applyIntelligenceChanges(cache(), { ...page([]), scope: { ...scope, application_id: 'other' } }, now)
    ).toThrow(/scope/);
    expect(() => applyIntelligenceChanges(cache(), page([change('2', 'record', null)]), now)).toThrow(/gap/);
    expect(() =>
      applyIntelligenceChanges(cache(), page([change('1', 'record', null), change('1', 'record', null)]), now)
    ).toThrow(/Unordered/);
    expect(() => applyIntelligenceChanges(cache(), page([change('1', 'record', record('wrong'))]), now)).toThrow(
      /identity/
    );
  });
  it('keeps 64-bit sequence precision and expires cached evidence even on empty batches', () => {
    const initial = { ...cache(), sequence: '9007199254740992', records: new Map([['old', record('old')]]) };
    let state = applyIntelligenceChanges(initial, page([change('9007199254740993', 'new', record('new'))]), now);
    expect(state.sequence).toBe('9007199254740993');
    state = applyIntelligenceChanges(state, page([]), now + 300000);
    expect(state.records.size).toBe(0);
  });
});

describe('local intelligence API', () => {
  it('preserves SDK identity, opaque cursors and error contracts', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: page([]) }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetcher);
    const sdk = new ScaleMule({ apiKey: 'test-key', baseUrl: 'https://api.example.org', retry: { maxRetries: 0 } });
    const response = await sdk.localIntelligence.changes(
      'paper/id',
      { cursor: 'opaque+/?', limit: 20 },
      { headers: { authorization: 'Bearer reader-session' } }
    );
    expect(response.error).toBeNull();
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain('/v1/news/intelligence/publications/paper%2Fid/changes?');
    expect(new URL(String(url)).searchParams.get('cursor')).toBe('opaque+/?');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer reader-session');
    expect(new Headers(init.headers).get('x-sm-internal-token')).toBeNull();
  });
  it('sends ephemeral agent preferences without requesting a saved user profile', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { items: [] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetcher);
    const sdk = new ScaleMule({ apiKey: 'test-key', retry: { maxRetries: 0 } });
    await sdk.localIntelligence.briefingForPreferences('publication', {
      geography: 'area',
      preferences: {
        personalized: true,
        geography_ids: [],
        topic_codes: ['arts'],
        entity_ids: [],
        issue_ids: [],
        record_ids: []
      }
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetcher.mock.calls[0][1].body).preferences.topic_codes).toEqual(['arts']);
  });
});
