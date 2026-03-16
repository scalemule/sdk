import { createHash } from 'node:crypto';

/**
 * Hash-to-bucket matching Rust: SHA256(salt.flag_key.identifier) → first 4 bytes → u32 BE → mod 10_000
 * Synchronous node:crypto — matches Rust evaluation exactly.
 */
export function hashToBucket(flagKey: string, identifier: string, salt: string): number {
  const hash = createHash('sha256').update(`${salt}.${flagKey}.${identifier}`).digest();
  return hash.readUInt32BE(0) % 10_000;
}
