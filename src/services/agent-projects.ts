import { ServiceModule } from '../service';
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types';

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  created_at: string;
  /** Populated when ?hydrate=true */
  full_name?: string;
  /** Populated when ?hydrate=true */
  email?: string;
  /** Populated when ?hydrate=true */
  avatar_url?: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  due_date?: string;
  assigned_agent_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ClaimResult {
  task_id: string;
  agent_id: string;
  attempt_number: number;
  lease_expires_at: string;
}

export interface SubmitResult {
  task_id: string;
  idempotent?: boolean;
}

export interface TaskTransition {
  id: string;
  task_id: string;
  from_state?: string;
  to_state: string;
  actor_id?: string;
  actor_type: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface TaskAttempt {
  id: string;
  task_id: string;
  attempt_number: number;
  agent_id?: string;
  status: string;
  lease_expires_at?: string;
  started_at: string;
  ended_at?: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  error_message?: string;
  metadata?: Record<string, unknown>;
}

export interface ProjectDocument {
  id: string;
  project_id: string;
  title: string;
  content?: string;
  created_at: string;
}

export interface Pipeline {
  id: string;
  project_id: string;
  name: string;
  status: string;
  created_at: string;
}

export interface PipelineVersion {
  id: string;
  pipeline_id: string;
  version_number: number;
  config: Record<string, unknown>;
  created_at: string;
}

// ============================================================================
// Project Grants
// ============================================================================

export interface ProjectGrant {
  id: string;
  project_id: string;
  role: string;
  user_email: string;
  status: 'pending' | 'redeemed' | 'revoked' | 'expired';
  created_by: string;
  created_at: string;
  expires_at: string;
  redeemed_at?: string;
  email_sent?: boolean;
}

export interface GrantInfo {
  id: string;
  project_name: string;
  role: string;
  email_hint: string;
  status: string;
  expires_at: string;
}

export interface RedeemResult {
  project_id: string;
  role: string;
  already_member: boolean;
}

export class AgentProjectsService extends ServiceModule {
  protected basePath = '/v1/agent-projects';

  private withAppId(path: string, applicationId?: string): string {
    return applicationId ? this.withQuery(path, { application_id: applicationId }) : path;
  }

  // Projects
  async createProject(
    data: { name: string; description?: string },
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<Project>> {
    return this.post<Project>(this.withAppId('/projects', applicationId), data, options);
  }

  async listProjects(
    params?: PaginationParams & { application_id?: string },
    options?: RequestOptions
  ): Promise<PaginatedResponse<Project>> {
    return this._list<Project>('/projects', params, options);
  }

  async getProject(id: string, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<Project>> {
    return this._get<Project>(this.withAppId(`/projects/${id}`, applicationId), options);
  }

  async updateProject(
    id: string,
    data: Partial<{ name: string; description: string; status: string }>,
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<Project>> {
    return this.patch<Project>(this.withAppId(`/projects/${id}`, applicationId), data, options);
  }

  // Members (use auth user_id)
  async addMember(
    projectId: string,
    data: { user_id: string; role: string },
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<ProjectMember>> {
    return this.post<ProjectMember>(this.withAppId(`/projects/${projectId}/members`, applicationId), data, options);
  }

  async listMembers(
    projectId: string,
    params?: { application_id?: string; hydrate?: boolean },
    options?: RequestOptions
  ): Promise<ApiResponse<ProjectMember[]>> {
    const qs: Record<string, string> = {};
    if (params?.application_id) qs.application_id = params.application_id;
    if (params?.hydrate) qs.hydrate = 'true';
    const path = Object.keys(qs).length
      ? this.withQuery(`/projects/${projectId}/members`, qs)
      : `/projects/${projectId}/members`;
    const result = await this._get<{ members: ProjectMember[] }>(path, options);
    return { data: result.data?.members ?? [], error: result.error };
  }

  async updateMember(
    projectId: string,
    userId: string,
    data: { role: string },
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<ProjectMember>> {
    return this.patch<ProjectMember>(
      this.withAppId(`/projects/${projectId}/members/${userId}`, applicationId),
      data,
      options
    );
  }

  async removeMember(
    projectId: string,
    userId: string,
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<void>> {
    return this.del<void>(this.withAppId(`/projects/${projectId}/members/${userId}`, applicationId), options);
  }

  // Tasks
  async createTask(
    projectId: string,
    data: {
      title: string;
      description?: string;
      priority?: string;
      due_date?: string;
      metadata?: Record<string, unknown>;
    },
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<Task>> {
    return this.post<Task>(this.withAppId(`/projects/${projectId}/tasks`, applicationId), data, options);
  }

  async listTasks(
    projectId: string,
    params?: PaginationParams & { application_id?: string; status?: string; priority?: string; agent_id?: string },
    options?: RequestOptions
  ): Promise<PaginatedResponse<Task>> {
    return this._list<Task>(`/projects/${projectId}/tasks`, params, options);
  }

  async getTask(id: string, applicationId?: string, options?: RequestOptions): Promise<ApiResponse<Task>> {
    return this._get<Task>(this.withAppId(`/tasks/${id}`, applicationId), options);
  }

  async updateTask(
    id: string,
    data: Partial<{
      title: string;
      description: string;
      status: string;
      priority: string;
      due_date: string;
      actual_hours: number;
      metadata: Record<string, unknown>;
    }>,
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<Task>> {
    return this.patch<Task>(this.withAppId(`/tasks/${id}`, applicationId), data, options);
  }

  // Lifecycle (use registry agent_id)
  async claimNext(
    agentId: string,
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<ClaimResult | null>> {
    const result = await this.post<ClaimResult>(
      this.withAppId('/tasks/next-available', applicationId),
      { agent_id: agentId },
      options
    );
    // 204 No Content — core client returns { data: { message: '' }, error: null }
    if (!result.data || typeof result.data !== 'object' || !('task_id' in result.data)) {
      return { data: null, error: result.error };
    }
    return result as ApiResponse<ClaimResult | null>;
  }

  async claim(
    taskId: string,
    agentId: string,
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<ClaimResult>> {
    return this.post<ClaimResult>(
      this.withAppId(`/tasks/${taskId}/claim`, applicationId),
      { agent_id: agentId },
      options
    );
  }

  async heartbeat(
    taskId: string,
    agentId: string,
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ lease_expires_at: string }>> {
    return this.post<{ lease_expires_at: string }>(
      this.withAppId(`/tasks/${taskId}/heartbeat`, applicationId),
      { agent_id: agentId },
      options
    );
  }

  async submit(
    taskId: string,
    data: {
      agent_id: string;
      idempotency_key: string;
      output?: Record<string, unknown>;
      input_tokens?: number;
      output_tokens?: number;
      cost_usd?: number;
      notes?: string;
    },
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<SubmitResult>> {
    return this.post<SubmitResult>(this.withAppId(`/tasks/${taskId}/submit`, applicationId), data, options);
  }

  async block(
    taskId: string,
    data: { agent_id: string; reason: string; question?: string },
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<Task>> {
    return this.post<Task>(this.withAppId(`/tasks/${taskId}/block`, applicationId), data, options);
  }

  // Assignment
  async assignAgent(
    taskId: string,
    data: { agent_id: string },
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ task_id: string; agent_id: string }>> {
    return this.post(this.withAppId(`/tasks/${taskId}/assign`, applicationId), data, options);
  }

  async unassignAgent(
    taskId: string,
    agentId: string,
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<void>> {
    return this.del<void>(this.withAppId(`/tasks/${taskId}/assign/${agentId}`, applicationId), options);
  }

  // History
  async listAttempts(
    taskId: string,
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<TaskAttempt[]>> {
    const result = await this._get<{ attempts: TaskAttempt[] }>(
      this.withAppId(`/tasks/${taskId}/attempts`, applicationId),
      options
    );
    return { data: result.data?.attempts ?? [], error: result.error };
  }

  async listTransitions(
    taskId: string,
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<TaskTransition[]>> {
    const result = await this._get<{ transitions: TaskTransition[] }>(
      this.withAppId(`/tasks/${taskId}/transitions`, applicationId),
      options
    );
    return { data: result.data?.transitions ?? [], error: result.error };
  }

  // Documents
  async createDocument(
    projectId: string,
    data: { title: string; content?: string },
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<ProjectDocument>> {
    return this.post<ProjectDocument>(this.withAppId(`/projects/${projectId}/documents`, applicationId), data, options);
  }

  async listDocuments(
    projectId: string,
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<ProjectDocument[]>> {
    const result = await this._get<{ documents: ProjectDocument[] }>(
      this.withAppId(`/projects/${projectId}/documents`, applicationId),
      options
    );
    return { data: result.data?.documents ?? [], error: result.error };
  }

  async deleteDocument(
    documentId: string,
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<void>> {
    return this.del<void>(this.withAppId(`/documents/${documentId}`, applicationId), options);
  }

  // Pipelines
  async createPipeline(
    projectId: string,
    data: { name: string },
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<Pipeline>> {
    return this.post<Pipeline>(this.withAppId(`/projects/${projectId}/pipelines`, applicationId), data, options);
  }

  async listPipelines(
    projectId: string,
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<Pipeline[]>> {
    const result = await this._get<{ pipelines: Pipeline[] }>(
      this.withAppId(`/projects/${projectId}/pipelines`, applicationId),
      options
    );
    return { data: result.data?.pipelines ?? [], error: result.error };
  }

  async createPipelineVersion(
    pipelineId: string,
    data: { config: Record<string, unknown> },
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<PipelineVersion>> {
    return this.post<PipelineVersion>(
      this.withAppId(`/pipelines/${pipelineId}/versions`, applicationId),
      data,
      options
    );
  }

  async listPipelineVersions(
    pipelineId: string,
    applicationId?: string,
    options?: RequestOptions
  ): Promise<ApiResponse<PipelineVersion[]>> {
    const result = await this._get<{ versions: PipelineVersion[] }>(
      this.withAppId(`/pipelines/${pipelineId}/versions`, applicationId),
      options
    );
    return { data: result.data?.versions ?? [], error: result.error };
  }

  // --------------------------------------------------------------------------
  // Project Grants
  // --------------------------------------------------------------------------

  async createGrant(
    data: { project_id: string; role: string; user_email: string; expires_at: string; invite_url?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<ProjectGrant>> {
    return this.post<ProjectGrant>('/project-grants', data, options);
  }

  async listGrants(projectId: string, options?: RequestOptions): Promise<ApiResponse<ProjectGrant[]>> {
    const result = await this._get<{ grants: ProjectGrant[] }>(
      this.withQuery('/project-grants', { project_id: projectId }),
      options
    );
    return { data: result.data?.grants ?? (result.data as unknown as ProjectGrant[]) ?? [], error: result.error };
  }

  async getGrant(id: string, options?: RequestOptions): Promise<ApiResponse<ProjectGrant>> {
    return this._get<ProjectGrant>(`/project-grants/${id}`, options);
  }

  /** Public endpoint — no auth required. Returns masked email + project name. */
  async getGrantInfo(id: string, options?: RequestOptions): Promise<ApiResponse<GrantInfo>> {
    return this._get<GrantInfo>(`/project-grants/${id}/info`, { skipAuth: true, ...options });
  }

  async revokeGrant(id: string, options?: RequestOptions): Promise<ApiResponse<void>> {
    return this.del<void>(`/project-grants/${id}`, options);
  }

  async resendGrantInvitation(
    id: string,
    data: { invite_url: string },
    options?: RequestOptions
  ): Promise<ApiResponse<{ email_sent: boolean }>> {
    return this.post<{ email_sent: boolean }>(`/project-grants/${id}/resend`, data, options);
  }

  async redeemGrant(id: string, options?: RequestOptions): Promise<ApiResponse<RedeemResult>> {
    return this.post<RedeemResult>(`/project-grants/${id}/redeem`, undefined, options);
  }
}
