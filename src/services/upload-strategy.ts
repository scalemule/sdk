/**
 * Upload Strategy Module
 *
 * Determines the optimal upload strategy (direct PUT vs. multipart)
 * based on file size, network conditions, and user preferences.
 *
 * Also provides adaptive chunk size and concurrency defaults.
 */

// ============================================================================
// Types
// ============================================================================

export type UploadStrategy = 'direct' | 'multipart';

export type NetworkClass = 'slow-2g' | '2g' | '3g' | '4g' | 'unknown';

export interface StrategyResult {
  strategy: UploadStrategy;
  chunkSize: number;
  concurrency: number;
  stallTimeoutMs: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Multipart threshold: files >= this size use multipart */
const MULTIPART_THRESHOLD = 8 * 1024 * 1024; // 8MB
/** Multipart threshold on slow networks (lowered from 4MB to gain per-part retry + IndexedDB resume) */
const MULTIPART_THRESHOLD_SLOW = 1 * 1024 * 1024; // 1MB

/** Default stall timeout */
const DEFAULT_STALL_TIMEOUT_MS = 45_000;
/** Stall timeout for slow networks */
const SLOW_STALL_TIMEOUT_MS = 90_000;

/** Chunk sizes by network class */
const CHUNK_SIZES: Record<NetworkClass, number> = {
  'slow-2g': 5 * 1024 * 1024,
  '2g': 5 * 1024 * 1024,
  '3g': 5 * 1024 * 1024,
  '4g': 8 * 1024 * 1024,
  unknown: 8 * 1024 * 1024
};

/** Large file chunk size (for files > 512MB) */
const LARGE_FILE_CHUNK_SIZE = 16 * 1024 * 1024;

/** Concurrency by network class */
const CONCURRENCY: Record<NetworkClass, number> = {
  'slow-2g': 1,
  '2g': 1,
  '3g': 2,
  '4g': 4,
  unknown: 4
};

// ============================================================================
// Strategy Resolution
// ============================================================================

/**
 * Determine the optimal upload strategy for a file.
 */
export function resolveStrategy(
  fileSize: number,
  overrides?: {
    forceMultipart?: boolean;
    chunkSize?: number;
    concurrency?: number;
  }
): StrategyResult {
  const network = detectNetworkClass();
  const isSlowNetwork = network === 'slow-2g' || network === '2g' || network === '3g';
  const threshold = isSlowNetwork ? MULTIPART_THRESHOLD_SLOW : MULTIPART_THRESHOLD;

  const strategy: UploadStrategy = overrides?.forceMultipart || fileSize >= threshold ? 'multipart' : 'direct';

  const chunkSize =
    overrides?.chunkSize || (fileSize > 512 * 1024 * 1024 ? LARGE_FILE_CHUNK_SIZE : CHUNK_SIZES[network]);

  const concurrency = overrides?.concurrency || adaptConcurrency(network);

  const stallTimeoutMs = isSlowNetwork ? SLOW_STALL_TIMEOUT_MS : DEFAULT_STALL_TIMEOUT_MS;

  return { strategy, chunkSize, concurrency, stallTimeoutMs };
}

// ============================================================================
// Network Detection
// ============================================================================

/** Detect the current network class from the Network Information API. */
export function detectNetworkClass(): NetworkClass {
  if (typeof navigator === 'undefined') return 'unknown';

  const conn = (navigator as unknown as { connection?: NetworkInformation }).connection;
  if (!conn) return 'unknown';

  const effectiveType = conn.effectiveType;
  if (effectiveType === 'slow-2g') return 'slow-2g';
  if (effectiveType === '2g') return '2g';
  if (effectiveType === '3g') return '3g';
  if (effectiveType === '4g') return '4g';
  return 'unknown';
}

/** Estimate measured bandwidth (Mbps) from the Network Information API. */
export function getMeasuredBandwidthMbps(): number | null {
  if (typeof navigator === 'undefined') return null;

  const conn = (navigator as unknown as { connection?: NetworkInformation }).connection;
  return conn?.downlink ?? null;
}

/**
 * Adapt concurrency based on measured bandwidth.
 * Bandwidth thresholds: <0.5 Mbps=1, 0.5-2=2, 2-10=3, >10=5
 */
function adaptConcurrency(network: NetworkClass): number {
  const bandwidth = getMeasuredBandwidthMbps();
  if (bandwidth === null) return CONCURRENCY[network];

  if (bandwidth < 0.5) return 1;
  if (bandwidth < 2) return 2;
  if (bandwidth < 10) return 3;
  return 5;
}

// ============================================================================
// Network Information API type (partial)
// ============================================================================

interface NetworkInformation {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}
