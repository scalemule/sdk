/**
 * Queue Service Module
 *
 * Job queue with dead letter sub-API.
 *
 * Routes:
 *   POST /jobs               → enqueue job
 *   GET  /jobs/{id}          → get job status
 *   GET  /dead-letter        → list dead letter jobs
 *   GET  /dead-letter/{id}   → get dead letter job
 *   POST /dead-letter/{id}/retry → retry dead letter job
 *   DELETE /dead-letter/{id} → delete dead letter job
 */

import type { ScaleMuleClient } from '../client';
import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface QueueJob {
  id: string;
  job_type: string;
  status: string;
  queue?: string;
  priority?: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
  created_at: string;
  completed_at?: string;
  error?: string;
}

export interface DeadLetterJob {
  id: string;
  original_job_id: string;
  job_type: string;
  payload: unknown;
  error: string;
  failed_at: string;
}

// ============================================================================
// Dead Letter Sub-API
// ============================================================================

class DeadLetterApi extends ServiceModule {
  protected basePath = '/v1/queue/dead-letter';

  async list(options?: RequestOptions): Promise<ApiResponse<DeadLetterJob[]>> {
    return this._get<DeadLetterJob[]>('', options);
  }

  async get(id: string, options?: RequestOptions): Promise<ApiResponse<DeadLetterJob>> {
    return this._get<DeadLetterJob>(`/${id}`, options);
  }

  async retry(id: string, options?: RequestOptions): Promise<ApiResponse<QueueJob>> {
    return this.post<QueueJob>(`/${id}/retry`, undefined, options);
  }

  async delete(id: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/${id}`, options);
  }
}

// ============================================================================
// Queue Service
// ============================================================================

export class QueueService extends ServiceModule {
  protected basePath = '/v1/queue';

  public readonly deadLetter: DeadLetterApi;

  constructor(client: ScaleMuleClient) {
    super(client);
    this.deadLetter = new DeadLetterApi(client);
  }

  async enqueue(
    data: {
      job_type: string;
      payload: unknown;
      queue?: string;
      priority?: 'low' | 'normal' | 'high' | 'critical';
      run_at?: string;
      max_attempts?: number;
    },
    options?: RequestOptions
  ): Promise<ApiResponse<QueueJob>> {
    return this.post<QueueJob>('/jobs', data, options);
  }

  async getJob(id: string, options?: RequestOptions): Promise<ApiResponse<QueueJob>> {
    return this._get<QueueJob>(`/jobs/${id}`, options);
  }
}
