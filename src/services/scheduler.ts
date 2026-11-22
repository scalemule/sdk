/**
 * Scheduler Service Module
 *
 * Cron jobs with pause/resume, execution history, and on-demand runs.
 *
 * Routes:
 *   POST   /jobs                 → create job
 *   GET    /jobs                  → list jobs
 *   GET    /jobs/{id}             → get job
 *   PATCH  /jobs/{id}             → update job
 *   DELETE /jobs/{id}             → delete job
 *   POST   /jobs/{id}/pause       → pause job
 *   POST   /jobs/{id}/resume      → resume job
 *   POST   /jobs/{id}/run-now     → trigger immediate run
 *   GET    /jobs/{id}/executions  → execution history
 *   GET    /jobs/{id}/stats       → job statistics
 */

import { ServiceModule } from '../service';
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types';
import { pathSegment } from '../utils/path';

// ============================================================================
// Types
// ============================================================================

export interface SchedulerJob {
  id: string;
  name: string;
  job_name?: string;
  schedule_type: string;
  cron_expression?: string;
  interval_seconds?: number;
  scheduled_at?: string;
  timezone: string;
  target_type: string;
  target_config: unknown;
  is_enabled: boolean;
  status: string;
  next_run_at?: string;
  last_run_at?: string;
  run_count: number;
  created_at: string;
  updated_at: string;
}

export interface JobExecution {
  id: string;
  scheduled_job_id: string;
  started_at: string;
  completed_at?: string;
  status: string;
  result?: string;
  error?: string;
  execution_time_ms?: number;
}

export interface JobStats {
  id: string;
  scheduled_job_id: string;
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  avg_execution_time_ms?: number;
  last_success_at?: string;
  last_failure_at?: string;
  updated_at: string;
}

// ============================================================================
// Scheduler Service
// ============================================================================

export class SchedulerService extends ServiceModule {
  protected basePath = '/v1/scheduler';

  // --------------------------------------------------------------------------
  // Job CRUD
  // --------------------------------------------------------------------------

  async createJob(
    data: { name: string; cron: string; type: string; config: unknown },
    options?: RequestOptions
  ): Promise<ApiResponse<SchedulerJob>> {
    return this.post<SchedulerJob>('/jobs', data, options);
  }

  async listJobs(params?: PaginationParams, requestOptions?: RequestOptions): Promise<PaginatedResponse<SchedulerJob>> {
    return this._list<SchedulerJob>('/jobs', params, requestOptions);
  }

  async getJob(id: string, options?: RequestOptions): Promise<ApiResponse<SchedulerJob>> {
    return this._get<SchedulerJob>(`/jobs/${pathSegment(id, 'id')}`, options);
  }

  async updateJob(
    id: string,
    data: Partial<{ name: string; cron: string; config: unknown }>,
    options?: RequestOptions
  ): Promise<ApiResponse<SchedulerJob>> {
    return this.patch<SchedulerJob>(`/jobs/${pathSegment(id, 'id')}`, data, options);
  }

  async deleteJob(id: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/jobs/${pathSegment(id, 'id')}`, options);
  }

  // --------------------------------------------------------------------------
  // Job Control
  // --------------------------------------------------------------------------

  async pauseJob(id: string, options?: RequestOptions): Promise<ApiResponse<SchedulerJob>> {
    return this.post<SchedulerJob>(`/jobs/${pathSegment(id, 'id')}/pause`, undefined, options);
  }

  async resumeJob(id: string, options?: RequestOptions): Promise<ApiResponse<SchedulerJob>> {
    return this.post<SchedulerJob>(`/jobs/${pathSegment(id, 'id')}/resume`, undefined, options);
  }

  async runNow(id: string, options?: RequestOptions): Promise<ApiResponse<JobExecution>> {
    return this.post<JobExecution>(`/jobs/${pathSegment(id, 'id')}/run-now`, undefined, options);
  }

  // --------------------------------------------------------------------------
  // Execution History & Stats
  // --------------------------------------------------------------------------

  async getExecutions(
    jobId: string,
    params?: PaginationParams,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<JobExecution>> {
    return this._list<JobExecution>(`/jobs/${pathSegment(jobId, 'jobId')}/executions`, params, requestOptions);
  }

  async getStats(jobId: string, options?: RequestOptions): Promise<ApiResponse<JobStats>> {
    return this._get<JobStats>(`/jobs/${pathSegment(jobId, 'jobId')}/stats`, options);
  }
}
