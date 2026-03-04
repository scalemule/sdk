/**
 * Functions Service Module
 *
 * Serverless functions: deploy, invoke, logs, executions, metrics.
 *
 * Routes:
 *   POST   /                    → deploy function
 *   GET    /                    → list functions
 *   GET    /{name}              → get function
 *   PATCH  /{name}              → update function
 *   DELETE /{name}              → delete function
 *   POST   /{name}/invoke       → invoke synchronously
 *   POST   /{name}/invoke-async → invoke asynchronously
 *   GET    /{name}/logs         → function logs
 *   GET    /{name}/executions   → execution history
 *   GET    /{name}/metrics      → function metrics
 */

import { ServiceModule } from '../service'
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types'

// ============================================================================
// Types
// ============================================================================

export interface ServerlessFunction {
  name: string
  runtime: string
  status: string
  memory_mb?: number
  timeout_seconds?: number
  environment?: Record<string, string>
  created_at: string
  updated_at: string
}

export interface FunctionExecution {
  id: string
  function_name: string
  status: string
  started_at: string
  completed_at?: string
  duration_ms?: number
  result?: unknown
  error?: string
}

export interface FunctionMetrics {
  invocations: number
  errors: number
  avg_duration_ms: number
  p99_duration_ms: number
}

// ============================================================================
// Functions Service
// ============================================================================

export class FunctionsService extends ServiceModule {
  protected basePath = '/v1/functions'

  async deploy(data: { name: string; runtime: string; code: string }, options?: RequestOptions): Promise<ApiResponse<ServerlessFunction>> {
    return this.post<ServerlessFunction>('', data, options)
  }

  async list(options?: RequestOptions): Promise<ApiResponse<ServerlessFunction[]>> {
    return this._get<ServerlessFunction[]>('', options)
  }

  async get(name: string, options?: RequestOptions): Promise<ApiResponse<ServerlessFunction>> {
    return this._get<ServerlessFunction>(`/${name}`, options)
  }

  async update(name: string, data: { code?: string; config?: Record<string, unknown> }, options?: RequestOptions): Promise<ApiResponse<ServerlessFunction>> {
    return this.patch<ServerlessFunction>(`/${name}`, data, options)
  }

  async delete(name: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/${name}`, options)
  }

  async invoke(name: string, payload?: unknown, options?: RequestOptions): Promise<ApiResponse<unknown>> {
    return this.post<unknown>(`/${name}/invoke`, payload, options)
  }

  async invokeAsync(name: string, payload?: unknown, options?: RequestOptions): Promise<ApiResponse<{ execution_id: string }>> {
    return this.post<{ execution_id: string }>(`/${name}/invoke-async`, payload, options)
  }

  async getLogs(name: string, options?: RequestOptions): Promise<ApiResponse<unknown[]>> {
    return this._get<unknown[]>(`/${name}/logs`, options)
  }

  async getExecutions(name: string, params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<FunctionExecution>> {
    return this._list<FunctionExecution>(`/${name}/executions`, params, requestOptions)
  }

  async getMetrics(name: string, options?: RequestOptions): Promise<ApiResponse<FunctionMetrics>> {
    return this._get<FunctionMetrics>(`/${name}/metrics`, options)
  }

  /** @deprecated Use deploy() instead */
  async deployFunction(data: { name: string; runtime: string; code: string }) {
    return this.deploy(data)
  }

  /** @deprecated Use invoke() instead */
  async invokeFunction(name: string, payload?: unknown) {
    return this.invoke(name, payload)
  }
}
