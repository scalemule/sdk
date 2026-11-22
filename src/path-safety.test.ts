import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScaleMule, pathSegment, findUnsafePathReason, ScaleMulePathError } from './index';

const TRAVERSAL_IDS = [
  '..',
  '.',
  '../auth/me',
  '..%2Fauth%2Fme',
  '%2e%2e',
  '%252e%252e%252f',
  'a\\b',
  'a?b',
  'a#b',
  '\u0000',
  'id\u001fx',
  'id\u007f',
  '',
  'a/b'
];

function sdk() {
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: { ok: true } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  );
  vi.stubGlobal('fetch', fetcher);
  const sm = new ScaleMule({ apiKey: 'sm_sk_test', baseUrl: 'https://api.example.org', retry: { maxRetries: 0 } });
  return { sm, fetcher, url: (n = 0) => String(fetcher.mock.calls[n][0]) };
}

/** Sync throws and async rejections both surface as a rejection here. */
function attempt(fn: () => unknown): Promise<unknown> {
  return Promise.resolve().then(fn);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pathSegment', () => {
  it.each(TRAVERSAL_IDS)('refuses %j', (id) => {
    expect(() => pathSegment(id)).toThrow(ScaleMulePathError);
  });

  it('refuses non-strings and non-finite numbers', () => {
    expect(() => pathSegment(undefined)).toThrow(ScaleMulePathError);
    expect(() => pathSegment(null)).toThrow(ScaleMulePathError);
    expect(() => pathSegment({ toString: () => '..' })).toThrow(ScaleMulePathError);
    expect(() => pathSegment(Number.NaN)).toThrow(ScaleMulePathError);
    expect(pathSegment(42)).toBe('42');
  });

  it('encodes Unicode and reserved characters into one segment', () => {
    expect(pathSegment('019d3ab8-0000-7000-8000-000000000001')).toBe('019d3ab8-0000-7000-8000-000000000001');
    expect(pathSegment('видео')).toBe('%D0%B2%D0%B8%D0%B4%D0%B5%D0%BE');
    expect(pathSegment('视频')).toBe('%E8%A7%86%E9%A2%91');
    expect(pathSegment('clip🎬')).toBe('clip%F0%9F%8E%AC');
    expect(pathSegment('a:b c@d')).toBe('a%3Ab%20c%40d');
    expect(pathSegment('file.v2..final')).toBe('file.v2..final');
  });

  it('carries a code and status for callers', () => {
    try {
      pathSegment('..', 'videoId');
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ScaleMulePathError);
      expect((error as ScaleMulePathError).code).toBe('invalid_path_segment');
      expect((error as ScaleMulePathError).status).toBe(400);
      expect((error as Error).message).toContain('videoId');
    }
  });
});

describe('findUnsafePathReason', () => {
  it.each([
    '/v1/videos/../auth/me',
    '/v1/videos/./x',
    '/v1/videos/..',
    '/v1/videos/%2e%2e/auth',
    '/v1/videos/%2E%2E/auth',
    '/v1/videos/..%2Fauth%2Fme',
    '/v1/videos/x%2fy',
    '/v1/videos/x%5Cy',
    '/v1/videos/%252e%252e%252fauth',
    '/v1/videos/a\\b',
    '/v1/videos/a\u0000b'
  ])('refuses %j', (path) => {
    expect(findUnsafePathReason(path)).not.toBeNull();
  });

  it('allows encoded IDs and ignores the query string', () => {
    expect(findUnsafePathReason('/v1/videos/%D0%B2%D0%B8%D0%B4%D0%B5%D0%BE')).toBeNull();
    expect(findUnsafePathReason('/v1/news/x/changes?cursor=..%2F%2e%2e')).toBeNull();
    expect(findUnsafePathReason('/v1/videos/file.v2')).toBeNull();
  });
});

describe('service methods encode IDs and refuse traversal before fetch', () => {
  const cases: Array<{
    name: string;
    call: (sm: ScaleMule, id: string) => unknown;
    url: (encoded: string) => string;
  }> = [
    { name: 'video.get', call: (sm, id) => sm.video.get(id), url: (e) => `/v1/videos/${e}` },
    {
      name: 'video.trackPlayback',
      call: (sm, id) => sm.video.trackPlayback(id, { event_type: 'play' }),
      url: (e) => `/v1/videos/${e}/track`
    },
    { name: 'storage.delete', call: (sm, id) => sm.storage.delete(id), url: (e) => `/v1/storage/files/${e}` },
    {
      name: 'social.getFollowers',
      call: (sm, id) => sm.social.getFollowers(id),
      url: (e) => `/v1/social/users/${e}/followers`
    },
    {
      name: 'chat.sendMessage',
      call: (sm, id) => sm.chat.sendMessage(id, { content: 'hi' }),
      url: (e) => `/v1/chat/conversations/${e}/messages`
    },
    { name: 'chat.deleteMessage', call: (sm, id) => sm.chat.deleteMessage(id), url: (e) => `/v1/chat/messages/${e}` },
    {
      name: 'data.get (collection)',
      call: (sm, id) => sm.data.get(id, 'doc1'),
      url: (e) => `/v1/data/${e}/documents/doc1`
    },
    {
      name: 'data.get (document)',
      call: (sm, id) => sm.data.get('posts', id),
      url: (e) => `/v1/data/posts/documents/${e}`
    },
    { name: 'cache.get', call: (sm, id) => sm.cache.get(id), url: (e) => `/v1/cache/${e}` },
    {
      name: 'communication.unregisterPushToken',
      call: (sm, id) => sm.communication.unregisterPushToken(id),
      url: (e) => `/v1/communication/push/tokens/${e}`
    }
  ];

  for (const c of cases) {
    it(`${c.name}: encodes a Unicode ID`, async () => {
      const { sm, fetcher, url } = sdk();
      await c.call(sm, 'видео-视频-🎬');
      expect(fetcher).toHaveBeenCalledTimes(1);
      const encoded = encodeURIComponent('видео-视频-🎬');
      expect(new URL(url()).pathname).toBe(c.url(encoded));
    });

    it.each(TRAVERSAL_IDS)(`${c.name}: refuses %j without calling fetch`, async (id) => {
      const { sm, fetcher } = sdk();
      await expect(attempt(() => c.call(sm, id))).rejects.toThrow(ScaleMulePathError);
      expect(fetcher).not.toHaveBeenCalled();
    });
  }

  it('photo.getTransformUrl refuses traversal (URL builders throw too)', () => {
    const { sm } = sdk();
    expect(() => sm.photo.getTransformUrl('../auth/me')).toThrow(ScaleMulePathError);
    expect(sm.photo.getTransformUrl('p1')).toContain('/v1/photos/p1/transform');
  });
});

describe('client.request guard (raw paths)', () => {
  it.each(['/v1/videos/../auth/me', '/v1/push/..%2F..%2Fauth%2Fme', '/v1/x/%2e%2e/y', '/v1/x/a\\b'])(
    'returns invalid_path for %j without calling fetch',
    async (path) => {
      const { sm, fetcher } = sdk();
      const result = await sm.getClient().get(path);
      expect(result.data).toBeNull();
      expect(result.error).toMatchObject({ code: 'invalid_path', status: 400 });
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it('still sends a normal path', async () => {
    const { sm, fetcher, url } = sdk();
    const result = await sm.getClient().get('/v1/videos/abc?x=..%2F');
    expect(result.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(url()).toBe('https://api.example.org/v1/videos/abc?x=..%2F');
  });
});
