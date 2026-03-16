import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

export interface FlagDefinition {
  id: string;
  application_id: string;
  flag_key: string;
  name: string;
  description?: string | null;
  flag_type: 'boolean' | 'string' | 'number' | 'json';
  default_value: unknown;
  status: 'active' | 'inactive' | 'archived';
  tags: string[];
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlagEnvironment {
  id: string;
  application_id: string;
  flag_id: string;
  environment: string;
  enabled: boolean;
  default_value?: unknown;
}

export interface FlagCondition {
  attribute: string;
  operator:
    | 'eq'
    | 'neq'
    | 'in'
    | 'not_in'
    | 'contains'
    | 'starts_with'
    | 'ends_with'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'regex'
    | 'semver_eq'
    | 'semver_neq'
    | 'semver_gt'
    | 'semver_gte'
    | 'semver_lt'
    | 'semver_lte'
    | 'exists'
    | 'not_exists'
    | string;
  value?: unknown;
  values?: unknown[];
}

export interface TargetingRule {
  id: string;
  application_id: string;
  flag_id: string;
  environment: string;
  name: string;
  priority: number;
  serve_value: unknown;
  rollout_percentage?: number | null;
  conditions: FlagCondition[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface FlagVariant {
  id: string;
  application_id: string;
  flag_id: string;
  variant_key: string;
  value: unknown;
  weight: number;
  created_at: string;
  updated_at: string;
}

export interface FlagSegment {
  id: string;
  application_id: string;
  segment_key: string;
  name: string;
  description?: string | null;
  conditions: FlagCondition[];
  included_users: string[];
  excluded_users: string[];
  created_at: string;
  updated_at: string;
}

export interface FlagAuditEntry {
  id: string;
  application_id: string;
  flag_id?: string | null;
  actor_type: string;
  actor_id: string;
  actor_email?: string | null;
  action: string;
  before_value?: unknown;
  after_value?: unknown;
  metadata?: unknown;
  created_at: string;
}

export interface FlagDetail {
  flag: FlagDefinition;
  environments: FlagEnvironment[];
  rules: TargetingRule[];
  variants: FlagVariant[];
}

export interface FlagEvaluation<T = unknown> {
  flag_id: string;
  flag_key: string;
  environment: string;
  value: T;
  reason: 'disabled' | 'rule_match' | 'variant' | 'default' | string;
  matched_rule_id?: string | null;
  variant_key?: string | null;
  bucket?: number | null;
}

export interface CreateFlagRequest {
  flag_key: string;
  name: string;
  description?: string;
  flag_type?: 'boolean' | 'string' | 'number' | 'json';
  default_value?: unknown;
  tags?: string[];
}

export interface UpdateFlagRequest {
  flag_key?: string;
  name?: string;
  description?: string | null;
  flag_type?: 'boolean' | 'string' | 'number' | 'json';
  default_value?: unknown;
  tags?: string[];
  status?: 'active' | 'inactive' | 'archived';
}

export interface CreateRuleRequest {
  environment: string;
  name: string;
  priority?: number;
  serve_value: unknown;
  rollout_percentage?: number | null;
  conditions?: FlagCondition[];
  enabled?: boolean;
}

export interface UpdateRuleRequest extends Partial<CreateRuleRequest> {}

export interface CreateVariantRequest {
  variant_key: string;
  value: unknown;
  weight: number;
}

export interface UpdateVariantRequest extends Partial<CreateVariantRequest> {}

export interface CreateSegmentRequest {
  segment_key: string;
  name: string;
  description?: string;
  conditions?: FlagCondition[];
  included_users?: string[];
  excluded_users?: string[];
}

export interface UpdateSegmentRequest extends Partial<CreateSegmentRequest> {}

export interface UpsertEnvironmentRequest {
  enabled: boolean;
  default_value?: unknown;
}

export class FlagsService extends ServiceModule {
  protected basePath = '/v1/flags';

  async evaluate<T = unknown>(
    flagKey: string,
    context: Record<string, unknown> = {},
    environment: string = 'prod',
    options?: RequestOptions
  ): Promise<ApiResponse<FlagEvaluation<T>>> {
    return this.post<FlagEvaluation<T>>('/evaluate', { flag_key: flagKey, environment, context }, options);
  }

  async evaluateBatch(
    flagKeys: string[],
    context: Record<string, unknown> = {},
    environment: string = 'prod',
    options?: RequestOptions
  ): Promise<ApiResponse<Record<string, FlagEvaluation>>> {
    return this.post<Record<string, FlagEvaluation>>(
      '/evaluate/batch',
      { flag_keys: flagKeys, environment, context },
      options
    );
  }

  async evaluateAll(
    context: Record<string, unknown> = {},
    environment: string = 'prod',
    options?: RequestOptions
  ): Promise<ApiResponse<Record<string, FlagEvaluation>>> {
    return this.post<Record<string, FlagEvaluation>>('/evaluate/all', { environment, context }, options);
  }

  async list(
    params?: { applicationId?: string; status?: string; search?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<FlagDefinition[]>> {
    return this._get<FlagDefinition[]>(
      this.withQuery('', {
        application_id: params?.applicationId,
        status: params?.status,
        search: params?.search
      }),
      options
    );
  }

  async get(id: string, options?: RequestOptions): Promise<ApiResponse<FlagDetail>> {
    return this._get<FlagDetail>(`/${id}`, options);
  }

  async create(
    data: CreateFlagRequest,
    params?: { applicationId?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<FlagDetail>> {
    const path = this.withQuery('', { application_id: params?.applicationId });
    return this.post<FlagDetail>(path, data, options);
  }

  async update(id: string, data: UpdateFlagRequest, options?: RequestOptions): Promise<ApiResponse<FlagDetail>> {
    return this.patch<FlagDetail>(`/${id}`, data, options);
  }

  async archive(id: string, options?: RequestOptions): Promise<ApiResponse<FlagDetail>> {
    return this.del<FlagDetail>(`/${id}`, options);
  }

  async activate(id: string, options?: RequestOptions): Promise<ApiResponse<FlagDetail>> {
    return this.post<FlagDetail>(`/${id}/activate`, undefined, options);
  }

  async deactivate(id: string, options?: RequestOptions): Promise<ApiResponse<FlagDetail>> {
    return this.post<FlagDetail>(`/${id}/deactivate`, undefined, options);
  }

  async listRules(id: string, options?: RequestOptions): Promise<ApiResponse<TargetingRule[]>> {
    return this._get<TargetingRule[]>(`/${id}/rules`, options);
  }

  async createRule(id: string, data: CreateRuleRequest, options?: RequestOptions): Promise<ApiResponse<TargetingRule>> {
    return this.post<TargetingRule>(`/${id}/rules`, data, options);
  }

  async updateRule(id: string, data: UpdateRuleRequest, options?: RequestOptions): Promise<ApiResponse<TargetingRule>> {
    return this.patch<TargetingRule>(`/rules/${id}`, data, options);
  }

  async deleteRule(id: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/rules/${id}`, options);
  }

  async listVariants(id: string, options?: RequestOptions): Promise<ApiResponse<FlagVariant[]>> {
    return this._get<FlagVariant[]>(`/${id}/variants`, options);
  }

  async createVariant(
    id: string,
    data: CreateVariantRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<FlagVariant>> {
    return this.post<FlagVariant>(`/${id}/variants`, data, options);
  }

  async updateVariant(
    id: string,
    data: UpdateVariantRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<FlagVariant>> {
    return this.patch<FlagVariant>(`/variants/${id}`, data, options);
  }

  async deleteVariant(id: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/variants/${id}`, options);
  }

  async listSegments(
    params?: { applicationId?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<FlagSegment[]>> {
    return this._get<FlagSegment[]>(this.withQuery('/segments', { application_id: params?.applicationId }), options);
  }

  async createSegment(
    data: CreateSegmentRequest,
    params?: { applicationId?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<FlagSegment>> {
    return this.post<FlagSegment>(
      this.withQuery('/segments', { application_id: params?.applicationId }),
      data,
      options
    );
  }

  async updateSegment(
    id: string,
    data: UpdateSegmentRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<FlagSegment>> {
    return this.patch<FlagSegment>(`/segments/${id}`, data, options);
  }

  async deleteSegment(id: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/segments/${id}`, options);
  }

  async listEnvironments(id: string, options?: RequestOptions): Promise<ApiResponse<FlagEnvironment[]>> {
    return this._get<FlagEnvironment[]>(`/${id}/environments`, options);
  }

  async upsertEnvironment(
    id: string,
    environment: string,
    data: UpsertEnvironmentRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<FlagEnvironment>> {
    return this.put<FlagEnvironment>(`/${id}/environments/${encodeURIComponent(environment)}`, data, options);
  }

  async listAudit(id: string, limit?: number, options?: RequestOptions): Promise<ApiResponse<FlagAuditEntry[]>> {
    return this._get<FlagAuditEntry[]>(this.withQuery(`/${id}/audit`, { limit }), options);
  }
}
