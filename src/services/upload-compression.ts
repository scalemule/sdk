/**
 * Upload Compression Module
 *
 * Adaptive lossy image compression for browser runtimes.
 * Uses browser-image-compression via dynamic import.
 *
 * Behavior:
 * - Skip non-image files
 * - Skip already-compressed formats (gif, svg, webp, avif)
 * - Skip files < 100KB
 * - Apply adaptive quality profiles by network class
 * - Fallback to original on error or size regression
 */

import type { UploadTelemetry } from './upload-telemetry'

// ============================================================================
// Types
// ============================================================================

export interface CompressionConfig {
  maxWidth: number
  maxHeight: number
  quality: number
  maxSizeMB: number
}

// ============================================================================
// Constants
// ============================================================================

const MIN_COMPRESS_SIZE = 100 * 1024 // 100KB
const COMPRESSIBLE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/bmp',
  'image/tiff',
])
const SKIP_TYPES = new Set([
  'image/gif',
  'image/svg+xml',
  'image/webp',
  'image/avif',
])

/** Adaptive profiles by network quality */
const NETWORK_PROFILES: Record<string, CompressionConfig> = {
  'slow-2g': { maxWidth: 1280, maxHeight: 1280, quality: 0.6, maxSizeMB: 0.5 },
  '2g': { maxWidth: 1600, maxHeight: 1600, quality: 0.65, maxSizeMB: 1 },
  '3g': { maxWidth: 2048, maxHeight: 2048, quality: 0.75, maxSizeMB: 2 },
  '4g': { maxWidth: 3840, maxHeight: 3840, quality: 0.85, maxSizeMB: 5 },
}

// ============================================================================
// Compression
// ============================================================================

/**
 * Attempt to compress an image file.
 * Returns the compressed blob if smaller, null otherwise (caller uses original).
 */
export async function maybeCompressImage(
  file: File | Blob,
  userConfig: Partial<CompressionConfig> | undefined,
  sessionId: string,
  telemetry: UploadTelemetry | null,
): Promise<File | Blob | null> {
  // Skip non-images
  const type = file.type?.toLowerCase() || ''
  if (!type.startsWith('image/')) return null
  if (SKIP_TYPES.has(type)) {
    telemetry?.emit(sessionId, 'upload.compression.skipped', { reason: 'format', type })
    return null
  }
  if (!COMPRESSIBLE_TYPES.has(type)) {
    telemetry?.emit(sessionId, 'upload.compression.skipped', { reason: 'unsupported_type', type })
    return null
  }

  // Skip small files
  if (file.size < MIN_COMPRESS_SIZE) {
    telemetry?.emit(sessionId, 'upload.compression.skipped', { reason: 'too_small', size: file.size })
    return null
  }

  // Resolve config: user overrides > network profile > defaults
  const networkType = getNetworkEffectiveType()
  const defaultProfile: CompressionConfig = { maxWidth: 3840, maxHeight: 3840, quality: 0.85, maxSizeMB: 5 }
  const networkProfile = NETWORK_PROFILES[networkType] ?? defaultProfile
  const config: CompressionConfig = {
    maxWidth: userConfig?.maxWidth ?? networkProfile.maxWidth,
    maxHeight: userConfig?.maxHeight ?? networkProfile.maxHeight,
    quality: userConfig?.quality ?? networkProfile.quality,
    maxSizeMB: userConfig?.maxSizeMB ?? networkProfile.maxSizeMB,
  }

  telemetry?.emit(sessionId, 'upload.compression.started', {
    original_size: file.size,
    network: networkType,
    target_quality: config.quality,
  })

  try {
    // Dynamic import - only loads if compression is used
    const imageCompression = await loadImageCompression()
    if (!imageCompression) {
      telemetry?.emit(sessionId, 'upload.compression.skipped', { reason: 'library_unavailable' })
      return null
    }

    const compressed = await imageCompression(file as File, {
      maxSizeMB: config.maxSizeMB,
      maxWidthOrHeight: Math.max(config.maxWidth, config.maxHeight),
      initialQuality: config.quality,
      useWebWorker: true,
      fileType: type === 'image/png' ? 'image/webp' : undefined,
    })

    // Size regression check: if compressed is not meaningfully smaller, skip
    if (compressed.size >= file.size * 0.95) {
      telemetry?.emit(sessionId, 'upload.compression.skipped', {
        reason: 'no_size_reduction',
        original_size: file.size,
        compressed_size: compressed.size,
      })
      return null
    }

    telemetry?.emit(sessionId, 'upload.compression.completed', {
      original_size: file.size,
      compressed_size: compressed.size,
      ratio: (compressed.size / file.size).toFixed(2),
    })

    return compressed
  } catch (err) {
    // Compression error — fallback to original
    telemetry?.emit(sessionId, 'upload.compression.skipped', {
      reason: 'error',
      error: err instanceof Error ? err.message : 'Unknown compression error',
    })
    return null
  }
}

// ============================================================================
// Helpers
// ============================================================================

type ImageCompressionFn = (
  file: File,
  options: {
    maxSizeMB?: number
    maxWidthOrHeight?: number
    initialQuality?: number
    useWebWorker?: boolean
    fileType?: string
  },
) => Promise<Blob>

let cachedImport: ImageCompressionFn | null | false = null

async function loadImageCompression(): Promise<ImageCompressionFn | null> {
  if (cachedImport === false) return null
  if (cachedImport) return cachedImport

  try {
    // Dynamic import - external optional dependency
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = await (Function('return import("browser-image-compression")')() as Promise<{ default?: ImageCompressionFn }>)
    cachedImport = mod.default || (mod as unknown as ImageCompressionFn)
    return cachedImport as ImageCompressionFn
  } catch {
    cachedImport = false
    return null
  }
}

function getNetworkEffectiveType(): string {
  if (typeof navigator !== 'undefined' && 'connection' in navigator) {
    const conn = (navigator as unknown as { connection?: { effectiveType?: string } }).connection
    return conn?.effectiveType || '4g'
  }
  return '4g'
}
