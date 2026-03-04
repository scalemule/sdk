/**
 * Upload Telemetry Module
 *
 * Best-effort upload lifecycle telemetry that never blocks upload success.
 * Events are buffered and flushed every 2s via analytics batch.
 * Error/warn/info events are also sent immediately via LoggerService.
 * Debug events are buffered and sent via logBatch on flush.
 *
 * Payload excludes filename/body/PII; only operational metadata is emitted.
 */

import type { ScaleMuleClient } from '../client'
import { LoggerService } from './logger'
import type { Severity, LogInput } from './logger'

// ============================================================================
// Types
// ============================================================================

export type UploadTelemetryEvent =
  | 'upload.started'
  | 'upload.progress'
  | 'upload.completed'
  | 'upload.failed'
  | 'upload.aborted'
  | 'upload.retried'
  | 'upload.resumed'
  | 'upload.stalled'
  | 'upload.compression.started'
  | 'upload.compression.completed'
  | 'upload.compression.skipped'
  | 'upload.multipart.started'
  | 'upload.multipart.part_completed'
  | 'upload.multipart.part_failed'
  | 'upload.multipart.url_refreshed'
  | 'upload.multipart.completed'
  | 'upload.multipart.aborted'

export interface TelemetryPayload {
  /** Upload session correlation ID */
  upload_session_id: string
  /** Event name */
  event: UploadTelemetryEvent
  /** Timestamp in ISO 8601 */
  timestamp: string
  /** Operational metadata (no PII) */
  metadata: Record<string, unknown>
}

export interface UploadTelemetryConfig {
  /** Enable/disable telemetry (default: true) */
  enabled: boolean
  /** Flush interval in ms (default: 2000) */
  flushIntervalMs: number
  /** Max buffer size before forced flush (default: 50) */
  maxBufferSize: number
}

// ============================================================================
// Severity routing
// ============================================================================

const EVENT_SEVERITY: Record<UploadTelemetryEvent, Severity> = {
  'upload.failed': 'error',
  'upload.stalled': 'error',
  'upload.multipart.aborted': 'error',
  'upload.retried': 'warn',
  'upload.aborted': 'warn',
  'upload.multipart.part_failed': 'warn',
  'upload.multipart.url_refreshed': 'warn',
  'upload.compression.skipped': 'warn',
  'upload.started': 'info',
  'upload.completed': 'info',
  'upload.resumed': 'info',
  'upload.multipart.started': 'info',
  'upload.multipart.completed': 'info',
  'upload.compression.completed': 'info',
  'upload.progress': 'debug',
  'upload.multipart.part_completed': 'debug',
  'upload.compression.started': 'debug',
}

// ============================================================================
// UploadTelemetry
// ============================================================================

export class UploadTelemetry {
  private buffer: TelemetryPayload[] = []
  private debugLogBuffer: LogInput[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private client: ScaleMuleClient
  private logger: LoggerService
  private config: UploadTelemetryConfig
  private flushing = false

  constructor(client: ScaleMuleClient, config?: Partial<UploadTelemetryConfig>) {
    this.client = client
    this.logger = new LoggerService(client)
    this.config = {
      enabled: config?.enabled ?? true,
      flushIntervalMs: config?.flushIntervalMs ?? 2000,
      maxBufferSize: config?.maxBufferSize ?? 50,
    }

    if (this.config.enabled) {
      this.startFlushTimer()
    }
  }

  /** Emit a telemetry event. Never throws. */
  emit(
    sessionId: string,
    event: UploadTelemetryEvent,
    metadata: Record<string, unknown> = {},
  ): void {
    if (!this.config.enabled) return

    const payload: TelemetryPayload = {
      upload_session_id: sessionId,
      event,
      timestamp: new Date().toISOString(),
      metadata,
    }

    const severity = EVENT_SEVERITY[event] || 'info'

    // Error/warn/info events: send to logger immediately (fire-and-forget)
    if (severity !== 'debug') {
      this.sendToLogger(payload, severity)
    } else {
      // Debug events: buffer for batch send on flush
      this.debugLogBuffer.push({
        service: 'storage.upload',
        severity,
        message: `Upload ${event}: session=${sessionId}`,
        metadata: { upload_session_id: sessionId, event, ...metadata },
        trace_id: sessionId,
      })
    }

    // All events go to analytics batch buffer (unchanged)
    this.buffer.push(payload)

    if (this.buffer.length >= this.config.maxBufferSize) {
      this.flush()
    }
  }

  /** Flush buffered events immediately. Never throws. */
  async flush(): Promise<void> {
    if (!this.config.enabled || (this.buffer.length === 0 && this.debugLogBuffer.length === 0) || this.flushing) return

    this.flushing = true
    const batch = this.buffer.splice(0)
    const debugLogs = this.debugLogBuffer.splice(0)

    try {
      // Send analytics batch
      if (batch.length > 0) {
        const events = batch.map((p) => ({
          event: p.event,
          properties: {
            upload_session_id: p.upload_session_id,
            ...p.metadata,
          },
          timestamp: p.timestamp,
        }))

        // Fire-and-forget via analytics batch endpoint
        await this.client.post('/v1/analytics/v2/events/batch', { events }).catch(() => {
          // Telemetry failures are silently dropped
        })
      }

      // Send buffered debug logs via logBatch
      if (debugLogs.length > 0) {
        await this.logger.logBatch(debugLogs).catch(() => {
          // Logger failures are silently dropped
        })
      }
    } catch {
      // Never block on telemetry failure
    } finally {
      this.flushing = false
    }
  }

  /** Stop the flush timer and drain remaining events. */
  async destroy(): Promise<void> {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    await this.flush()
  }

  private startFlushTimer(): void {
    if (typeof setInterval !== 'undefined') {
      this.flushTimer = setInterval(() => {
        this.flush()
      }, this.config.flushIntervalMs)

      // Unref timer if available (Node.js) so it doesn't prevent process exit
      if (this.flushTimer && typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
        (this.flushTimer as { unref: () => void }).unref()
      }
    }
  }

  /** Send a log entry to the logger service (fire-and-forget) */
  private sendToLogger(payload: TelemetryPayload, severity: Severity): void {
    this.logger.log({
      service: 'storage.upload',
      severity,
      message: `Upload ${payload.event}: session=${payload.upload_session_id}`,
      metadata: {
        upload_session_id: payload.upload_session_id,
        event: payload.event,
        ...payload.metadata,
      },
      trace_id: payload.upload_session_id,
    }).catch(() => {
      // Silently drop logger failures
    })
  }
}

/** Generate a unique upload session ID */
export function generateUploadSessionId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 10)
  return `us_${timestamp}_${random}`
}
