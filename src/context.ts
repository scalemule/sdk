/**
 * Client Context Utilities (Framework-Agnostic)
 *
 * Extract end-user context from incoming HTTP requests and convert it
 * to X-Client-* headers for forwarding to ScaleMule.
 *
 * Works with any server framework: Express, Fastify, Hono, raw Node.js
 * http.IncomingMessage, Next.js, etc.
 *
 * For Next.js-specific helpers (App Router `NextRequest`, Pages Router
 * `NextApiRequest`), see `@scalemule/nextjs/server` which re-exports
 * these utilities plus Next.js-typed wrappers.
 */

import type { ClientContext } from './types'

// ============================================================================
// Request abstraction
// ============================================================================

/**
 * Minimal interface for an incoming HTTP request.
 *
 * Covers Node.js `http.IncomingMessage`, Express `Request`, Fastify
 * `FastifyRequest`, and similar. Headers are a plain object where values
 * can be `string`, `string[]`, or `undefined` (Node.js convention).
 */
export interface IncomingRequestLike {
  headers: Record<string, string | string[] | undefined>
  socket?: { remoteAddress?: string }
}

// ============================================================================
// IP validation
// ============================================================================

/**
 * Validate an IPv4 or IPv6 address.
 * Returns the trimmed IP if valid, `undefined` otherwise.
 */
export function validateIP(ip: string | undefined | null): string | undefined {
  if (!ip) return undefined
  const trimmed = ip.trim()
  if (!trimmed) return undefined

  // IPv4
  const ipv4 = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/
  // IPv6 (simplified)
  const ipv6 = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){0,6}::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}$/
  // IPv4-mapped IPv6  (::ffff:192.0.2.1)
  const mapped = /^::ffff:(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/i

  if (ipv4.test(trimmed) || ipv6.test(trimmed) || mapped.test(trimmed)) {
    return trimmed
  }
  return undefined
}

// ============================================================================
// Extract client context
// ============================================================================

/**
 * Extract end-user context from an incoming HTTP request.
 *
 * IP extraction priority (same chain as `@scalemule/nextjs`):
 *   1. CF-Connecting-IP       (Cloudflare)
 *   2. DO-Connecting-IP       (DigitalOcean)
 *   3. X-Real-IP              (nginx / DO K8s ingress)
 *   4. X-Forwarded-For        (first IP — standard proxy header)
 *   5. X-Vercel-Forwarded-For (Vercel)
 *   6. True-Client-IP         (Akamai / Cloudflare Enterprise)
 *   7. socket.remoteAddress   (direct connection fallback)
 *
 * @example
 * ```typescript
 * // Express
 * import { extractClientContext } from '@scalemule/sdk'
 * app.post('/upload', async (req, res) => {
 *   const ctx = extractClientContext(req)
 *   const result = await sm.storage.upload(file, { clientContext: ctx })
 * })
 * ```
 */
export function extractClientContext(request: IncomingRequestLike): ClientContext {
  const h = request.headers

  const getHeader = (name: string): string | undefined => {
    const v = h[name] ?? h[name.toLowerCase()]
    return Array.isArray(v) ? v[0] : v
  }

  // IP fallback chain
  let ip: string | undefined

  const cfIp = getHeader('cf-connecting-ip')
  if (cfIp) ip = validateIP(cfIp)

  if (!ip) {
    const doIp = getHeader('do-connecting-ip')
    if (doIp) ip = validateIP(doIp)
  }

  if (!ip) {
    const realIp = getHeader('x-real-ip')
    if (realIp) ip = validateIP(realIp)
  }

  if (!ip) {
    const xff = getHeader('x-forwarded-for')
    if (xff) ip = validateIP(xff.split(',')[0]?.trim())
  }

  if (!ip) {
    const vercel = getHeader('x-vercel-forwarded-for')
    if (vercel) ip = validateIP(vercel.split(',')[0]?.trim())
  }

  if (!ip) {
    const akamai = getHeader('true-client-ip')
    if (akamai) ip = validateIP(akamai)
  }

  if (!ip && request.socket?.remoteAddress) {
    ip = validateIP(request.socket.remoteAddress)
  }

  return {
    ip,
    userAgent: getHeader('user-agent') || undefined,
    deviceFingerprint: getHeader('x-device-fingerprint') || undefined,
    referrer: getHeader('referer') || undefined,
  }
}

// ============================================================================
// Build forwarded client context headers
// ============================================================================

/**
 * Convert a `ClientContext` into request headers for ScaleMule.
 *
 * `x-sm-forwarded-client-ip` is the authenticated server-side forwarding header
 * consumed by the gateway to derive trusted downstream IP context.
 *
 * We also keep the legacy `X-Client-*` headers during rollout for backward
 * compatibility with older gateway/service deployments.
 *
 * Used internally by `ServiceModule.resolveOptions()`. You normally don't
 * need to call this directly — just pass `clientContext` in `RequestOptions`.
 */
export function buildClientContextHeaders(
  context: ClientContext | undefined,
): Record<string, string> {
  if (!context) return {}
  const headers: Record<string, string> = {}
  if (context.ip) {
    headers['x-sm-forwarded-client-ip'] = context.ip
    headers['X-Client-IP'] = context.ip
  }
  if (context.userAgent) headers['X-Client-User-Agent'] = context.userAgent
  if (context.deviceFingerprint) headers['X-Client-Device-Fingerprint'] = context.deviceFingerprint
  if (context.referrer) headers['X-Client-Referrer'] = context.referrer
  return headers
}
