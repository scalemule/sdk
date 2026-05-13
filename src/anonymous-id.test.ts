import { describe, it, expect, beforeEach } from 'vitest';
import {
  STORAGE_KEYS,
  LEGACY_ANONYMOUS_ID_KEYS,
  ensureAnonymousId,
  readAnonymousId,
  generateAnonymousId
} from './anonymous-id';
import type { StorageAdapter } from './types';

function makeStorage(initial: Record<string, string> = {}): StorageAdapter & { dump(): Record<string, string> } {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    dump: () => Object.fromEntries(data)
  };
}

describe('anonymous-id', () => {
  describe('generateAnonymousId', () => {
    it('returns a UUID-shaped string', () => {
      const id = generateAnonymousId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('returns a different value each call', () => {
      expect(generateAnonymousId()).not.toBe(generateAnonymousId());
    });
  });

  describe('readAnonymousId', () => {
    it('returns null when no key is set', async () => {
      const storage = makeStorage();
      expect(await readAnonymousId(storage)).toBeNull();
    });

    it('returns canonical value when present', async () => {
      const storage = makeStorage({ [STORAGE_KEYS.ANONYMOUS_ID]: 'canon-1' });
      expect(await readAnonymousId(storage)).toBe('canon-1');
    });

    it('falls back to legacy key when canonical missing', async () => {
      const storage = makeStorage({ [LEGACY_ANONYMOUS_ID_KEYS[0]]: 'legacy-1' });
      expect(await readAnonymousId(storage)).toBe('legacy-1');
    });

    it('does not write when only reading', async () => {
      const storage = makeStorage({ [LEGACY_ANONYMOUS_ID_KEYS[0]]: 'legacy-1' });
      await readAnonymousId(storage);
      expect(storage.dump()[STORAGE_KEYS.ANONYMOUS_ID]).toBeUndefined();
    });
  });

  describe('ensureAnonymousId', () => {
    it('mints a new ID and dual-writes when nothing is stored', async () => {
      const storage = makeStorage();
      const id = await ensureAnonymousId(storage);
      expect(id).toMatch(/^[0-9a-f-]{36}$/i);
      const dump = storage.dump();
      expect(dump[STORAGE_KEYS.ANONYMOUS_ID]).toBe(id);
      // Dual-write: legacy key gets the new value too so any code still
      // reading it doesn't drift from canonical.
      for (const legacyKey of LEGACY_ANONYMOUS_ID_KEYS) {
        expect(dump[legacyKey]).toBe(id);
      }
    });

    it('returns canonical when present, without re-minting', async () => {
      const storage = makeStorage({ [STORAGE_KEYS.ANONYMOUS_ID]: 'canon-1' });
      const id = await ensureAnonymousId(storage);
      expect(id).toBe('canon-1');
    });

    it('promotes legacy value to canonical and keeps legacy in sync', async () => {
      const storage = makeStorage({ [LEGACY_ANONYMOUS_ID_KEYS[0]]: 'legacy-1' });
      const id = await ensureAnonymousId(storage);
      expect(id).toBe('legacy-1');
      const dump = storage.dump();
      expect(dump[STORAGE_KEYS.ANONYMOUS_ID]).toBe('legacy-1');
      expect(dump[LEGACY_ANONYMOUS_ID_KEYS[0]]).toBe('legacy-1');
    });

    it('prefers canonical when both keys exist with different values', async () => {
      // This is the "user already on the fixed SDK but a stale tab wrote the
      // legacy key" case — canonical wins, and the legacy gets rewritten so
      // both ends agree.
      const storage = makeStorage({
        [STORAGE_KEYS.ANONYMOUS_ID]: 'canon-1',
        [LEGACY_ANONYMOUS_ID_KEYS[0]]: 'legacy-stale'
      });
      const id = await ensureAnonymousId(storage);
      expect(id).toBe('canon-1');
      expect(storage.dump()[LEGACY_ANONYMOUS_ID_KEYS[0]]).toBe('canon-1');
    });

    it('is idempotent across repeated calls', async () => {
      const storage = makeStorage();
      const first = await ensureAnonymousId(storage);
      const second = await ensureAnonymousId(storage);
      const third = await ensureAnonymousId(storage);
      expect(first).toBe(second);
      expect(second).toBe(third);
    });

    it('survives a storage that throws on setItem (returns value anyway)', async () => {
      const throwing: StorageAdapter = {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota exceeded');
        },
        removeItem: () => undefined
      };
      // Must not throw — quota errors / private mode shouldn't crash the
      // first unauthenticated request. Value still returned for the caller
      // to attach to the request header.
      const id = await ensureAnonymousId(throwing);
      expect(id).toMatch(/^[0-9a-f-]{36}$/i);
    });
  });
});
