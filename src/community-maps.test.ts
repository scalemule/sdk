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

describe('Community Maps engagement contracts', () => {
  it('preserves vote values, comment consent, reply and editorial revision boundaries', async () => {
    const get = vi.fn(async () => ({ data: {}, error: null }));
    const post = vi.fn(async () => ({ data: {}, error: null }));
    const put = vi.fn(async () => ({ data: {}, error: null }));
    const maps = new CommunityMapsService({ get, post, put } as unknown as ScaleMuleClient);
    await maps.vote('holiday/map', 'feature', -1);
    await maps.vote('holiday/map', 'feature', 0);
    await maps.listComments('holiday/map', { feature_id: 'feature', page: 2 });
    await maps.createComment(
      'holiday/map',
      {
        body: 'Здравей 🎃',
        author_name: 'Neighbor',
        parent_comment_id: 'parent',
        consent: { version: 'policy', accepted: true }
      },
      'feature'
    );
    await maps.editorial
      .forApplication('owner')
      .reviewComment('collection', 'comment', { status: 'approved', expected_revision: 2, guidelines_reviewed: true });
    expect(post.mock.calls[0][0]).toContain('/collections/holiday%2Fmap/features/feature/vote');
    expect(post.mock.calls[0][1]).toEqual({ value: -1 });
    expect(post.mock.calls[1][1]).toEqual({ value: 0 });
    expect(get.mock.calls[0][0]).toContain('feature_id=feature');
    expect(post.mock.calls[2][1]).toMatchObject({
      parent_comment_id: 'parent',
      consent: { version: 'policy', accepted: true }
    });
    expect(put.mock.calls[0][0]).toContain('/comments/comment?application_id=owner');
    expect(put.mock.calls[0][1]).toMatchObject({ expected_revision: 2, guidelines_reviewed: true });
  });
});
