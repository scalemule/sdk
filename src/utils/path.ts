/**
 * Path-building safety for gateway requests.
 *
 * Every ID or name a caller passes to a service method becomes exactly one
 * URL path segment. Without encoding, an ID such as `../vault/secrets` or
 * `..%2Fauth%2Fme` (which Next.js route params arrive already decoded as)
 * lets the request leave the intended route: `fetch()` resolves `..`, so a
 * server route that forwards a route param with the app's secret key becomes
 * a proxy to any gateway path.
 *
 * `pathSegment()` refuses anything that could change the path shape and
 * percent-encodes the rest. `findUnsafePathReason()` is the defence-in-depth
 * check `ScaleMuleClient.request()` runs on every final path.
 */

export const INVALID_PATH_SEGMENT = 'invalid_path_segment';
export const INVALID_PATH = 'invalid_path';

/** Thrown (before any network call) when an ID cannot be a single path segment. */
export class ScaleMulePathError extends Error {
  readonly code = INVALID_PATH_SEGMENT;
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'ScaleMulePathError';
  }
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Validate one ID / name and return it percent-encoded as a single path segment.
 *
 * Refused: non-string (finite integers are allowed), empty, `.`, `..`, and any
 * value containing `/`, `\`, `%` (so pre-encoded `%2F`, `%2E`, `%5C` and
 * double-encoded `%252F` cannot smuggle a separator), `?`, `#` or a control
 * character. Unicode IDs are allowed and encoded.
 *
 * @throws ScaleMulePathError
 */
export function pathSegment(value: unknown, name = 'id'): string {
  let text: string;
  if (typeof value === 'string') {
    text = value;
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    text = String(value);
  } else {
    throw new ScaleMulePathError(`${name} must be a string`);
  }
  if (text.length === 0) throw new ScaleMulePathError(`${name} must not be empty`);
  if (text === '.' || text === '..') throw new ScaleMulePathError(`${name} must not be "." or ".."`);
  if (/[/\\%?#]/.test(text) || CONTROL_CHARS.test(text)) {
    throw new ScaleMulePathError(`${name} contains a character that is not allowed in a path segment`);
  }
  return encodeURIComponent(text);
}

/**
 * Return why a request path is unsafe, or null when it is fine.
 *
 * Only the path part (before `?` / `#`) is checked. Refuses `.` / `..`
 * segments, backslashes, control characters, and encoded dot, slash or
 * backslash (`%2e`, `%2f`, `%5c`, also double-encoded `%252e` ...), none of
 * which `pathSegment()` ever produces.
 */
export function findUnsafePathReason(path: string): string | null {
  if (typeof path !== 'string') return 'path must be a string';
  const end = path.search(/[?#]/);
  const pathPart = end === -1 ? path : path.slice(0, end);
  if (CONTROL_CHARS.test(pathPart)) return 'path contains a control character';
  if (pathPart.includes('\\')) return 'path contains a backslash';
  if (/%(25)*(2e|2f|5c)/i.test(pathPart)) return 'path contains an encoded dot, slash or backslash';
  for (const segment of pathPart.split('/')) {
    if (segment === '.' || segment === '..') return 'path contains a "." or ".." segment';
  }
  return null;
}
