/**
 * Upload Engine Module
 *
 * Orchestrates the complete upload lifecycle:
 * - Strategy selection (direct vs multipart)
 * - Compression (browser images)
 * - Retry with backoff
 * - Stall detection
 * - Multipart with windowed presigns
 * - Cross-reload resume (IndexedDB)
 * - Telemetry (best-effort)
 * - Feature flag gating
 *
 * This module is the orchestrator consumed by StorageService.upload().
 * It delegates to upload-strategy, upload-compression, upload-resume,
 * and upload-telemetry for their respective concerns.
 */

import type { UploadStrategy } from './upload-strategy';
import { resolveStrategy } from './upload-strategy';
import type { UploadTelemetryConfig } from './upload-telemetry';

// ============================================================================
// Types
// ============================================================================

export interface UploadEngineConfig {
  /** Feature flag: enable multipart upload path (default: true) */
  multipartEnabled: boolean;
  /** Application allowlist for multipart (empty = all allowed) */
  multipartAllowlist: string[];
  /** Telemetry configuration */
  telemetry: Partial<UploadTelemetryConfig>;
}

export interface UploadPlan {
  /** Selected strategy */
  strategy: UploadStrategy;
  /** Chunk size in bytes (for multipart) */
  chunkSize: number;
  /** Max concurrent part uploads */
  concurrency: number;
  /** Stall timeout in ms */
  stallTimeoutMs: number;
  /** Whether compression should be attempted */
  shouldCompress: boolean;
  /** Whether resume should be attempted */
  shouldResume: boolean;
  /** Total number of parts (multipart only) */
  totalParts: number;
}

// ============================================================================
// Engine
// ============================================================================

const DEFAULT_CONFIG: UploadEngineConfig = {
  multipartEnabled: true,
  multipartAllowlist: [],
  telemetry: {}
};

/**
 * Create an upload plan based on file characteristics, user options, and runtime context.
 *
 * The plan determines strategy, chunk sizing, concurrency, compression,
 * and resume eligibility. The caller (StorageService) executes the plan.
 */
export function createUploadPlan(
  fileSize: number,
  contentType: string,
  options: {
    forceMultipart?: boolean;
    skipCompression?: boolean;
    resume?: 'auto' | 'off';
    chunkSize?: number;
    maxConcurrency?: number;
    appId?: string;
  } = {},
  engineConfig: Partial<UploadEngineConfig> = {}
): UploadPlan {
  const config = { ...DEFAULT_CONFIG, ...engineConfig };

  // Check feature flag and allowlist
  const multipartAllowed =
    config.multipartEnabled &&
    (config.multipartAllowlist.length === 0 ||
      (options.appId != null && config.multipartAllowlist.includes(options.appId)));

  const resolved = resolveStrategy(fileSize, {
    forceMultipart: multipartAllowed && options.forceMultipart,
    chunkSize: options.chunkSize,
    concurrency: options.maxConcurrency
  });

  // Override strategy if multipart is disabled
  const strategy: UploadStrategy =
    resolved.strategy === 'multipart' && !multipartAllowed ? 'direct' : resolved.strategy;

  // Compression: only in browser, only for images, and when not explicitly skipped
  const isBrowser = typeof window !== 'undefined';
  const isCompressibleType =
    contentType.startsWith('image/') &&
    !contentType.includes('gif') &&
    !contentType.includes('svg') &&
    !contentType.includes('webp') &&
    !contentType.includes('avif');
  const shouldCompress = isBrowser && !options.skipCompression && isCompressibleType && fileSize >= 100 * 1024;

  // Resume: only in browser, only for multipart, and when not explicitly disabled
  const shouldResume = isBrowser && strategy === 'multipart' && options.resume !== 'off';

  // Total parts for multipart
  const totalParts = strategy === 'multipart' ? Math.ceil(fileSize / resolved.chunkSize) : 1;

  return {
    strategy,
    chunkSize: resolved.chunkSize,
    concurrency: resolved.concurrency,
    stallTimeoutMs: resolved.stallTimeoutMs,
    shouldCompress,
    shouldResume,
    totalParts
  };
}

/**
 * Calculate the total number of parts needed for a multipart upload.
 */
export function calculateTotalParts(fileSize: number, chunkSize: number): number {
  return Math.ceil(fileSize / chunkSize);
}

/**
 * Get the byte range for a specific part number (1-indexed).
 */
export function getPartRange(
  partNumber: number,
  chunkSize: number,
  totalSize: number
): { start: number; end: number; size: number } {
  const start = (partNumber - 1) * chunkSize;
  const end = Math.min(start + chunkSize, totalSize);
  return { start, end, size: end - start };
}
