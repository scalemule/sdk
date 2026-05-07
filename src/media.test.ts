import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScaleMule } from './index';

describe('MediaService', () => {
  let sm: ScaleMule;

  beforeEach(() => {
    vi.restoreAllMocks();
    sm = new ScaleMule({
      apiKey: 'test_api_key',
      environment: 'prod',
      retry: { maxRetries: 0 }
    });
  });

  it('builds a public hero manifest for anonymous raster images', () => {
    const asset = sm.media.buildAsset({
      id: 'file_1',
      filename: 'hero.webp',
      content_type: 'image/webp',
      size_bytes: 1234,
      visibility: 'anonymous_visible',
      is_public: true,
      cdn_url: 'https://cdn-public.scalemule.com/app/anonymous/file_1',
      created_at: '2026-05-07T00:00:00Z'
    }, { preset: 'hero' });

    expect(asset.manifest?.preset).toBe('hero');
    expect(asset.manifest?.default).toContain('/v1/photos/public/file_1/transform');
    expect(asset.manifest?.srcset).toContain('2400w');
    expect(asset.manifest?.variants['1200']).toContain('width=1200');
  });

  it('keeps SVG manifests original-only', () => {
    const asset = sm.media.buildAsset({
      id: 'file_svg',
      filename: 'logo.svg',
      content_type: 'image/svg+xml',
      size_bytes: 321,
      visibility: 'anonymous_visible',
      is_public: true,
      cdn_url: 'https://cdn-public.scalemule.com/app/anonymous/logo.svg',
      created_at: '2026-05-07T00:00:00Z'
    });

    expect(asset.manifest).toEqual({
      file_id: 'file_svg',
      content_type: 'image/svg+xml',
      preset: 'original',
      variants: { original: 'https://cdn-public.scalemule.com/app/anonymous/logo.svg' },
      srcset: null,
      default: 'https://cdn-public.scalemule.com/app/anonymous/logo.svg'
    });
  });

  it('routes app-public images through storage upload plus photo register', async () => {
    const upload = vi.spyOn(sm.storage, 'upload').mockResolvedValue({
      data: {
        id: 'file_pub',
        filename: 'avatar.png',
        content_type: 'image/png',
        size_bytes: 456,
        visibility: 'app_public',
        is_public: true,
        url: 'https://signed.example/avatar.png',
        created_at: '2026-05-07T00:00:00Z'
      },
      error: null
    });
    const register = vi.spyOn(sm.photo, 'register').mockResolvedValue({
      data: {
        id: 'photo_pub',
        filename: 'avatar.png',
        content_type: 'image/png',
        size_bytes: 456,
        created_at: '2026-05-07T00:00:00Z'
      },
      error: null
    });
    vi.spyOn(sm.storage, 'getInfo').mockResolvedValue({
      data: {
        id: 'file_pub',
        filename: 'avatar.png',
        content_type: 'image/png',
        size_bytes: 456,
        visibility: 'app_public',
        is_public: true,
        url: 'https://signed.example/avatar.png',
        created_at: '2026-05-07T00:00:00Z'
      },
      error: null
    });

    const result = await sm.media.upload(new Blob(['img'], { type: 'image/png' }), {
      visibility: 'app_public',
      prewarm: false
    });

    expect(result.error).toBeNull();
    expect(upload).toHaveBeenCalled();
    expect(register).toHaveBeenCalledWith({ fileId: 'file_pub' }, undefined);
    expect(result.data?.photo_id).toBe('photo_pub');
    expect(result.data?.visibility).toBe('app_public');
  });
});
