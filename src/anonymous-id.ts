/**
 * Anonymous-ID Contract (Shared)
 *
 * Single source of truth for the visitor's anonymous ID across every
 * ScaleMule client package (`@scalemule/sdk`, `@scalemule/nextjs`, future
 * react-native, etc).
 *
 * Why this lives here, in `@scalemule/sdk`:
 *   The platform contract is the HTTP header `x-anonymous-id`. The backend
 *   (`ms/scalemule-auth/src/handlers/register.rs`, `login.rs`, `oauth.rs`)
 *   reads that header to link anonymous activity to a newly registered user.
 *   If two packages disagree on the localStorage key they read/write, the
 *   visitor's analytics events and their `x-anonymous-id` header don't
 *   match, and the link pipeline attributes events to the wrong identity.
 *   Past drift: `@scalemule/nextjs` minted its own ID under `sm_anonymous_id`
 *   while this package wrote `scalemule_anonymous_id`. This module collapses
 *   that into one helper everyone calls.
 *
 * Migration:
 *   `ensureAnonymousId()` reads canonical first, falls back to the legacy
 *   key, and dual-writes both during the rollout window. The dual-write +
 *   legacy-read can be retired once every maintained `@scalemule/nextjs`
 *   consumer has been on a fixed version in production for two release
 *   cycles. Tracked in code by the comment near `LEGACY_ANONYMOUS_ID_KEYS`.
 */

import type { StorageAdapter } from './types';

/**
 * Canonical browser storage keys owned by `@scalemule/sdk`. Other packages
 * MUST import these rather than redeclare their own strings.
 */
export const STORAGE_KEYS = {
  SESSION: 'scalemule_session',
  USER_ID: 'scalemule_user_id',
  WORKSPACE_ID: 'scalemule_workspace_id',
  ANONYMOUS_ID: 'scalemule_anonymous_id',
  SESSION_POOL: 'scalemule_session_pool',
  ACTIVE_ACCOUNT: 'scalemule_active_account',
  KNOWN_ACCOUNTS: 'scalemule_known_accounts',
  OFFLINE_QUEUE: 'scalemule_offline_queue'
} as const;

/**
 * Legacy anonymous-ID keys read for migration. Drop entries from this list
 * once we're confident no shipping client still writes them.
 *
 * - `sm_anonymous_id`: previously minted by the `useAnalytics` hook in
 *   `@scalemule/nextjs` versions prior to the consolidation.
 */
export const LEGACY_ANONYMOUS_ID_KEYS: readonly string[] = ['sm_anonymous_id'];

/** UUIDv4 generator with a graceful fallback for environments without `crypto.randomUUID`. */
export function generateAnonymousId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Math.random fallback — fine for analytics IDs, not used as a security token.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Sync-style read of the canonical anonymous-ID without minting.
 *
 * Returns `null` if storage hasn't been touched yet. Useful when you want
 * to check "is there already a cached ID" without triggering an async
 * write. For the create-if-missing path, use `ensureAnonymousId()`.
 */
export async function readAnonymousId(storage: StorageAdapter): Promise<string | null> {
  const canonical = await storage.getItem(STORAGE_KEYS.ANONYMOUS_ID);
  if (canonical) return canonical;
  for (const legacyKey of LEGACY_ANONYMOUS_ID_KEYS) {
    const legacy = await storage.getItem(legacyKey);
    if (legacy) return legacy;
  }
  return null;
}

/**
 * Per-storage in-flight promise cache. `StorageAdapter` is async, so the
 * read-then-mint sequence inside `ensureAnonymousId` is interleavable —
 * without this guard, two concurrent first calls can both observe empty
 * storage, mint distinct UUIDs, and persist whichever write lands last,
 * leaving one in-flight request with a header value that no longer matches
 * stored state. The WeakMap collapses concurrent calls to a single resolve.
 *
 * Keyed by the storage object identity (not by some hash of its contents),
 * so callers that share a single adapter instance share the guard.
 */
const inFlight = new WeakMap<StorageAdapter, Promise<string>>();

/**
 * Read-or-create the anonymous ID with legacy-key migration and dual-write.
 *
 * Algorithm:
 *   1. Read canonical key — if present, return it (no writes).
 *   2. Read any legacy key — if present, promote it: write to canonical AND
 *      keep the legacy key in step with it so a stale tab running old code
 *      doesn't desync. Return the value.
 *   3. No ID exists — mint a new UUID, dual-write canonical + legacy keys,
 *      return it.
 *
 * Concurrent callers against the same storage adapter are single-flighted
 * — the second caller receives the same promise as the first.
 *
 * Idempotent. Safe to call on every request that needs the header. If you
 * cache the result in memory on the client, you can avoid the storage
 * round-trip after the first call.
 */
export function ensureAnonymousId(storage: StorageAdapter): Promise<string> {
  const existing = inFlight.get(storage);
  if (existing) return existing;
  const promise = (async () => {
    try {
      return await resolveAnonymousId(storage);
    } finally {
      // Release the slot so callers that arrive after the resolve don't
      // pin a stale promise. By the time we get here the value is already
      // persisted; the next caller will hit a fast canonical-read path.
      inFlight.delete(storage);
    }
  })();
  inFlight.set(storage, promise);
  return promise;
}

async function resolveAnonymousId(storage: StorageAdapter): Promise<string> {
  const canonical = await storage.getItem(STORAGE_KEYS.ANONYMOUS_ID);
  if (canonical) {
    // Best-effort: keep the legacy key in sync so any code still reading it
    // sees the same value. Cheap; ignore errors (private mode, quota, etc).
    for (const legacyKey of LEGACY_ANONYMOUS_ID_KEYS) {
      const legacy = await storage.getItem(legacyKey);
      if (legacy !== canonical) {
        try {
          await storage.setItem(legacyKey, canonical);
        } catch {
          /* storage unavailable — non-fatal */
        }
      }
    }
    return canonical;
  }

  // No canonical value — try legacy, promote if found.
  for (const legacyKey of LEGACY_ANONYMOUS_ID_KEYS) {
    const legacy = await storage.getItem(legacyKey);
    if (legacy) {
      try {
        await storage.setItem(STORAGE_KEYS.ANONYMOUS_ID, legacy);
      } catch {
        /* storage unavailable — non-fatal */
      }
      return legacy;
    }
  }

  // Nothing anywhere — mint and dual-write.
  const fresh = generateAnonymousId();
  try {
    await storage.setItem(STORAGE_KEYS.ANONYMOUS_ID, fresh);
  } catch {
    /* storage unavailable — non-fatal, value is still returned */
  }
  for (const legacyKey of LEGACY_ANONYMOUS_ID_KEYS) {
    try {
      await storage.setItem(legacyKey, fresh);
    } catch {
      /* storage unavailable — non-fatal */
    }
  }
  return fresh;
}
