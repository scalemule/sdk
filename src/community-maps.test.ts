import { describe, it, expect, vi } from 'vitest';
import { ScaleMule } from './index';
import { CommunityMapsService } from './services/community-maps';
import type { ScaleMuleClient } from './client';
describe('Community Maps SDK contracts', () => {
  it('is available on the official client', () =>
    expect(new ScaleMule({ apiKey: 'test' }).communityMaps).toBeInstanceOf(CommunityMapsService));
  it('encodes public routes, filters and trusted reader context', async () => {
    const get = vi.fn(async () => ({ data: { items: [], next_cursor: null }, error: null }));
    const maps = new CommunityMapsService({ get } as unknown as ScaleMuleClient);
    await maps.listFeatures(
      'город/map',
      { featured: false, geometry_type: 'LineString', bbox: '-123,37,-121,39', limit: 20 },
      { clientContext: { anonymousId: 'reader' }, headers: { 'x-request-id': 'request' } }
    );
    const [path, opts] = get.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(path).toContain('/collections/%D0%B3%D0%BE%D1%80%D0%BE%D0%B4%2Fmap/features?');
    const url = new URL(path, 'https://example.test');
    expect(url.searchParams.get('featured')).toBe('false');
    expect(url.searchParams.get('bbox')).toBe('-123,37,-121,39');
    expect(opts.headers['x-anonymous-id']).toBe('reader');
    expect(opts.headers['x-request-id']).toBe('request');
  });
  it('scopes editorial calls without changing the shared client or public routes', async () => {
    const get = vi.fn(async () => ({ data: {}, error: null }));
    const put = vi.fn(async () => ({ data: {}, error: null }));
    const maps = new CommunityMapsService({ get, put } as unknown as ScaleMuleClient);
    const editor = maps.editorial.forApplication('tenant-one');
    await editor.listMedia('collection', { after: 'cursor', limit: 7 });
    await editor.reviewMedia('collection', 'photo', {
      expected_revision: 3,
      status: 'REJECTED',
      caption: '',
      attribution: ''
    });
    await maps.getCollection('holiday-lights-2026');
    expect(get.mock.calls[0][0]).toContain('application_id=tenant-one');
    expect(get.mock.calls[0][0]).toContain('after=cursor');
    expect(put.mock.calls[0][0]).toContain('/manage/collections/collection/media/photo?application_id=tenant-one');
    expect(get.mock.calls[1][0]).not.toContain('application_id');
  });
});
