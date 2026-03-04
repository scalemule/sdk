/**
 * Logger Service Module
 *
 * Centralized logging: write and query logs.
 *
 * Routes:
 *   POST /logs        → write log entry
 *   POST /logs/batch  → write log entries in batch (max 100 per call, auto-chunked)
 *   GET  /logs        → query logs (paginated)
 */

import { ServiceModule } from '../service'
import type { ApiResponse, RequestOptions } from '../types'

// ============================================================================
// Types
// ============================================================================

export type Severity = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

/** Input for creating a log entry. Matches backend schema. */
export interface LogInput {
  /** Service name (required — maps to backend service_name) */
  service: string
  /** Log severity (required) */
  severity: Severity
  /** Log message (required) */
  message: string
  /** Arbitrary JSON metadata */
  metadata?: Record<string, unknown>
  /** Distributed tracing / correlation ID */
  trace_id?: string
  span_id?: string
  parent_span_id?: string
  /** ISO 8601 timestamp, defaults to now on backend */
  timestamp?: string
}

/** Legacy input shape for backward compatibility */
export interface LegacyLogInput {
  level: string
  message: string
  metadata?: Record<string, unknown>
}

/** Log record as returned by the backend query endpoint */
export interface LogRecord {
  id: string
  service_name: string
  severity: string
  message: string
  metadata?: Record<string, unknown>
  trace_id?: string
  span_id?: string
  parent_span_id?: string
  timestamp: string
}

/** Paginated query response from GET /logs */
export interface LogQueryResponse {
  logs: LogRecord[]
  total: number
  page: number
  limit: number
}

/** Query parameters for filtering logs */
export interface LogQueryParams {
  service?: string
  severity?: Severity
  search?: string
  trace_id?: string
  start_time?: string
  end_time?: string
  page?: number
  limit?: number
}

/** @deprecated Use LogRecord instead */
export interface LogEntry {
  id: string
  level: string
  message: string
  service?: string
  metadata?: Record<string, unknown>
  timestamp: string
}

// ============================================================================
// Logger Service
// ============================================================================

/** Max entries per batch call (backend hard limit) */
const BATCH_MAX_SIZE = 100

export class LoggerService extends ServiceModule {
  protected basePath = '/v1/logger'

  /**
   * Write a single log entry.
   * Accepts both new schema (LogInput) and legacy shape ({ level, message }) for backward compatibility.
   */
  async log(
    data: LogInput | LegacyLogInput,
    options?: RequestOptions,
  ): Promise<ApiResponse<void>> {
    const body = this.normalizeLogInput(data)
    return this.post<void>('/logs', body, options)
  }

  /**
   * Write log entries in batch.
   * Auto-chunks into groups of 100 (backend hard limit) and sends sequentially.
   * Returns total ingested count across all chunks.
   */
  async logBatch(
    logs: LogInput[],
    options?: RequestOptions,
  ): Promise<ApiResponse<{ ingested: number }>> {
    if (logs.length === 0) {
      return { data: { ingested: 0 }, error: null }
    }

    let totalIngested = 0

    for (let i = 0; i < logs.length; i += BATCH_MAX_SIZE) {
      const chunk = logs.slice(i, i + BATCH_MAX_SIZE)
      const result = await this.post<{ ingested: number }>('/logs/batch', { logs: chunk }, options)
      if (result.error) {
        return {
          data: { ingested: totalIngested },
          error: result.error,
        }
      }
      totalIngested += result.data?.ingested ?? chunk.length
    }

    return { data: { ingested: totalIngested }, error: null }
  }

  /**
   * Query logs with filters. Returns paginated response.
   */
  async queryLogs(
    filters?: LogQueryParams,
    requestOptions?: RequestOptions,
  ): Promise<ApiResponse<LogQueryResponse>> {
    return this._get<LogQueryResponse>(this.withQuery('/logs', filters as Record<string, unknown>), requestOptions)
  }

  // Convenience methods

  async debug(service: string, message: string, meta?: Record<string, unknown>, options?: RequestOptions): Promise<ApiResponse<void>> {
    return this.log({ service, severity: 'debug', message, metadata: meta }, options)
  }

  async info(service: string, message: string, meta?: Record<string, unknown>, options?: RequestOptions): Promise<ApiResponse<void>> {
    return this.log({ service, severity: 'info', message, metadata: meta }, options)
  }

  async warn(service: string, message: string, meta?: Record<string, unknown>, options?: RequestOptions): Promise<ApiResponse<void>> {
    return this.log({ service, severity: 'warn', message, metadata: meta }, options)
  }

  async error(service: string, message: string, meta?: Record<string, unknown>, options?: RequestOptions): Promise<ApiResponse<void>> {
    return this.log({ service, severity: 'error', message, metadata: meta }, options)
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  /** Normalize legacy { level, message } to { severity, service, message } */
  private normalizeLogInput(data: LogInput | LegacyLogInput): LogInput {
    if ('severity' in data && 'service' in data) {
      return data as LogInput
    }

    // Legacy shape: { level, message, metadata? }
    const legacy = data as LegacyLogInput
    return {
      service: 'sdk',
      severity: (legacy.level || 'info') as Severity,
      message: legacy.message,
      metadata: legacy.metadata,
    }
  }
}
