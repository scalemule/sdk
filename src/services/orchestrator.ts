/**
 * Orchestrator Service Module
 *
 * Workflow orchestration: create, execute, track.
 *
 * Routes:
 *   POST /workflows                → create workflow
 *   POST /workflows/{id}/execute   → execute workflow
 *   GET  /executions/{id}          → get execution status
 */

import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';
import { pathSegment } from '../utils/path';

// ============================================================================
// Types
// ============================================================================

export interface Workflow {
  id: string;
  name: string;
  steps: unknown[];
  created_at: string;
  updated_at: string;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  status: string;
  input?: unknown;
  output?: unknown;
  started_at: string;
  completed_at?: string;
  error?: string;
}

// ============================================================================
// Orchestrator Service
// ============================================================================

export class OrchestratorService extends ServiceModule {
  protected basePath = '/v1/orchestrator';

  async createWorkflow(
    data: { name: string; steps: unknown[] },
    options?: RequestOptions
  ): Promise<ApiResponse<Workflow>> {
    return this.post<Workflow>('/workflows', data, options);
  }

  async execute(
    workflowId: string,
    input?: unknown,
    options?: RequestOptions
  ): Promise<ApiResponse<WorkflowExecution>> {
    return this.post<WorkflowExecution>(`/workflows/${pathSegment(workflowId, 'workflowId')}/execute`, input, options);
  }

  async getExecution(executionId: string, options?: RequestOptions): Promise<ApiResponse<WorkflowExecution>> {
    return this._get<WorkflowExecution>(`/executions/${pathSegment(executionId, 'executionId')}`, options);
  }

  /** @deprecated Use execute() instead */
  async executeWorkflow(workflowId: string, input?: unknown) {
    return this.execute(workflowId, input);
  }
}
