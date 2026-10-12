import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScaleMule } from './index';
const reader = '019a12ec-1234-7000-8000-123456789abc';
const options = {
  clientContext: { anonymousId: reader, ip: '192.0.2.8' },
  headers: { authorization: 'Bearer forwarded-reader', 'Content-Type': 'application/json' },
  retries: 0
};
afterEach(() => vi.unstubAllGlobals());
describe('forwarded identity across JSON and multipart requests', () => {
  it('preserves a server-selected reader across fresh SDK instances and a photo upload', async () => {
    const fetch = vi.fn(async () => Response.json({ data: { id: 'receipt' } }));
    vi.stubGlobal('fetch', fetch);
    const make = () => new ScaleMule({ apiKey: 'server-key', baseUrl: 'https://api.example.test' });
    await make().communityMaps.getCollection('halloween-2026', options);
    await make().communityMaps.uploadPhoto(
      'halloween-2026',
      reader,
      new Blob(['image'], { type: 'image/png' }),
      {
        caption: 'Снимка 🎃',
        attribution: 'Contributor',
        rights_confirmed: true
      },
      options
    );
    for (const [, init] of fetch.mock.calls as unknown as [string, RequestInit][]) {
      const headers = new Headers(init.headers);
      expect(headers.get('x-anonymous-id')).toBe(reader);
      expect(headers.get('x-client-ip')).toBe('192.0.2.8');
      expect(headers.get('authorization')).toBe('Bearer forwarded-reader');
    }
    const upload = (fetch.mock.calls[1] as unknown as [string, RequestInit])[1];
    expect(new Headers(upload.headers).has('content-type')).toBe(false);
    expect(upload.body).toBeInstanceOf(FormData);
    expect((upload.body as FormData).get('caption')).toBe('Снимка 🎃');
    expect((upload.body as FormData).get('rights_confirmed')).toBe('true');
  });
  it('preserves the same context in browser uploads with progress', async () => {
    const headers = new Headers();
    class UploadXHR {
      status = 200;
      responseText = JSON.stringify({ data: { id: 'photo' } });
      upload = { addEventListener: vi.fn() };
      handlers = new Map<string, () => void>();
      addEventListener(name: string, handler: () => void) {
        this.handlers.set(name, handler);
      }
      open() {}
      setRequestHeader(name: string, value: string) {
        headers.set(name, value);
      }
      send() {
        queueMicrotask(() => this.handlers.get('load')?.());
      }
      abort() {
        this.handlers.get('abort')?.();
      }
    }
    vi.stubGlobal('XMLHttpRequest', UploadXHR);
    const sm = new ScaleMule({ apiKey: 'server-key', baseUrl: 'https://api.example.test' });
    const result = await sm.getClient().upload('/upload', new Blob(['image']), undefined, {
      headers: {
        'X-Anonymous-ID': reader,
        'x-client-ip': '192.0.2.8',
        authorization: 'Bearer forwarded-reader',
        'content-type': 'application/json'
      },
      onProgress: vi.fn(),
      retries: 0
    });
    expect(result.error).toBeNull();
    expect(headers.get('x-anonymous-id')).toBe(reader);
    expect(headers.get('x-client-ip')).toBe('192.0.2.8');
    expect(headers.get('authorization')).toBe('Bearer forwarded-reader');
    expect(headers.has('content-type')).toBe(false);
  });
});
