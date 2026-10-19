import { afterEach, describe, it, expect, vi } from 'vitest';
import { prepareCommunityMapAttachment, startMediaCapture } from './browser-capture';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('bounded browser capture', () => {
  it('never re-encodes a photograph: the chosen bytes are what gets uploaded', async () => {
    // A phone photo well above any client-side compression threshold.
    const bytes = new Uint8Array(3 * 1024 * 1024);
    bytes.set([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66], 0);
    const file = new File([bytes], 'IMG_0001.jpg', { type: 'image/jpeg', lastModified: 1 });
    const prepared = await prepareCommunityMapAttachment(file);
    expect(prepared).toBe(file);
    expect(new Uint8Array(await prepared.arrayBuffer())).toEqual(bytes);
  });
  it('rejects unsupported/oversize media before image decoding', async () => {
    await expect(
      prepareCommunityMapAttachment(new File(['x'], 'image.svg', { type: 'image/svg+xml' }))
    ).rejects.toThrow('Choose JPEG');
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', { value: 26 * 1024 * 1024 });
    await expect(prepareCommunityMapAttachment(file)).rejects.toThrow('25 MiB');
  });
  it('releases late-granted tracks when the capture view was closed', async () => {
    const stop = vi.fn();
    let grant!: (value: unknown) => void;
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: () =>
          new Promise((resolve) => {
            grant = resolve;
          })
      }
    });
    vi.stubGlobal(
      'MediaRecorder',
      class {
        static isTypeSupported() {
          return true;
        }
      }
    );
    const controller = new AbortController();
    const pending = startMediaCapture('audio', controller.signal);
    controller.abort();
    grant({ getTracks: () => [{ stop }] });
    await expect(pending).rejects.toThrow();
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it('caps video duration and releases tracks after stopping', async () => {
    vi.useFakeTimers();
    const stopTrack = vi.fn();
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] })) }
    });
    vi.stubGlobal(
      'MediaRecorder',
      class {
        static isTypeSupported() {
          return true;
        }
        state = 'inactive';
        mimeType = 'video/mp4';
        ondataavailable?: (event: { data: Blob }) => void;
        onstop?: () => void;
        start() {
          this.state = 'recording';
        }
        stop() {
          this.state = 'inactive';
          this.ondataavailable?.({ data: new Blob(['video']) });
          this.onstop?.();
        }
      }
    );
    const capture = await startMediaCapture('video');
    await vi.advanceTimersByTimeAsync(15000);
    const file = await capture.result;
    expect(file?.type).toBe('video/mp4');
    expect(stopTrack).toHaveBeenCalled();
  });
});
