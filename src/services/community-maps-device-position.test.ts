import { describe, expect, it, vi } from 'vitest';
import { CommunityMapsService, devicePositionPayload } from './community-maps';

describe('community maps device position', () => {
  it('sends only the documented fields as one JSON multipart field', async () => {
    const upload = vi.fn(async () => ({ success: true, data: { id: 'm', status: 'SUBMITTED' } }));
    const service = new CommunityMapsService({ upload } as never);
    await service.uploadMedia('halloween', 'sub', new Blob(['x']), {
      caption: '',
      attribution: '',
      rights_confirmed: true,
      consent_version: 'v',
      device_position: {
        latitude: 38.00112,
        longitude: -122.03216,
        accuracy_m: 12,
        read_at: '2026-10-25T01:49:11Z',
        method: 'camera',
        // A stray field from a spread must not reach the service (deny_unknown_fields).
        ...({ heading: 90 } as object)
      }
    });
    const fields = upload.mock.calls[0][2] as Record<string, string>;
    expect(JSON.parse(fields.device_position)).toEqual({
      latitude: 38.00112,
      longitude: -122.03216,
      accuracy_m: 12,
      read_at: '2026-10-25T01:49:11Z',
      method: 'camera'
    });
    expect(fields.rights_confirmed).toBe('true');
  });
  it('omits the field when no position was attached', async () => {
    const upload = vi.fn(async () => ({ success: true, data: { id: 'm', status: 'SUBMITTED' } }));
    const service = new CommunityMapsService({ upload } as never);
    await service.uploadMedia('halloween', 'sub', new Blob(['x']), {
      caption: '',
      attribution: '',
      rights_confirmed: true,
      consent_version: 'v',
      device_position: null
    });
    expect('device_position' in (upload.mock.calls[0][2] as object)).toBe(false);
  });
  it('payload keeps southern and western hemisphere signs', () => {
    expect(devicePositionPayload({ latitude: -33.8688, longitude: 151.2093, accuracy_m: 5, read_at: 't', method: 'at-display' }))
      .toEqual({ latitude: -33.8688, longitude: 151.2093, accuracy_m: 5, read_at: 't', method: 'at-display' });
  });
});
