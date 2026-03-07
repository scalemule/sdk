import { ServiceModule } from '../service'
import type { ApiResponse, PaginatedResponse, PaginationParams, RequestOptions } from '../types'

export interface ModelProvider {
  id: string
  name: string
  description?: string
  status: string
  created_at: string
}

export interface Model {
  id: string
  provider_id: string
  name: string
  description?: string
  model_type: string
  status: string
  capabilities?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ModelPricing {
  id: string
  model_id: string
  pricing_type: string
  input_cost_per_token?: number
  output_cost_per_token?: number
  effective_from: string
  effective_to?: string
  created_at: string
}

export interface ModelEntitlement {
  id: string
  agent_id?: string
  model_id: string
  status: string
  created_at: string
}

export interface UsageRecord {
  id: string
  model_id: string
  agent_id?: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  created_at: string
}

export interface UsageSummary {
  model_id: string
  total_input_tokens: number
  total_output_tokens: number
  total_cost_usd: number
  request_count: number
}

export interface CostReportDay {
  date: string
  model_id: string
  total_cost_usd: number
  request_count: number
}

export class AgentModelsService extends ServiceModule {
  protected basePath = '/v1/agent-models'

  // Providers
  async createProvider(data: { name: string; description?: string }, options?: RequestOptions): Promise<ApiResponse<ModelProvider>> {
    return this.post<ModelProvider>('/model-providers', data, options)
  }

  async listProviders(params?: PaginationParams & { application_id?: string }, options?: RequestOptions): Promise<PaginatedResponse<ModelProvider>> {
    return this._list<ModelProvider>('/model-providers', params, options)
  }

  // Models
  async createModel(data: { provider_id: string; name: string; description?: string; model_type: string; capabilities?: Record<string, unknown> }, options?: RequestOptions): Promise<ApiResponse<Model>> {
    return this.post<Model>('/models', data, options)
  }

  async listModels(params?: PaginationParams & { application_id?: string; provider_id?: string }, options?: RequestOptions): Promise<PaginatedResponse<Model>> {
    return this._list<Model>('/models', params, options)
  }

  async getModel(id: string, options?: RequestOptions): Promise<ApiResponse<Model>> {
    return this._get<Model>(`/models/${id}`, options)
  }

  async createPricing(modelId: string, data: { pricing_type: string; input_cost_per_token?: number; output_cost_per_token?: number }, options?: RequestOptions): Promise<ApiResponse<ModelPricing>> {
    return this.post<ModelPricing>(`/models/${modelId}/pricing`, data, options)
  }

  async listPricing(modelId: string, options?: RequestOptions): Promise<ApiResponse<ModelPricing[]>> {
    return this._get<ModelPricing[]>(`/models/${modelId}/pricing`, options)
  }

  // Entitlements
  async createEntitlement(data: { agent_id?: string; model_id: string }, options?: RequestOptions): Promise<ApiResponse<ModelEntitlement>> {
    return this.post<ModelEntitlement>('/model-entitlements', data, options)
  }

  async listEntitlements(params?: PaginationParams & { application_id?: string }, options?: RequestOptions): Promise<PaginatedResponse<ModelEntitlement>> {
    return this._list<ModelEntitlement>('/model-entitlements', params, options)
  }

  async deleteEntitlement(id: string, options?: RequestOptions): Promise<ApiResponse<void>> {
    return this.del<void>(`/model-entitlements/${id}`, options)
  }

  // Usage & Reporting
  async recordUsage(data: { model_id: string; agent_id?: string; input_tokens: number; output_tokens: number; cost_usd?: number }, options?: RequestOptions): Promise<ApiResponse<UsageRecord>> {
    return this.post<UsageRecord>('/usage-records', data, options)
  }

  async listUsage(params?: PaginationParams & { application_id?: string; model_id?: string; agent_id?: string }, options?: RequestOptions): Promise<PaginatedResponse<UsageRecord>> {
    return this._list<UsageRecord>('/usage-records', params, options)
  }

  async getUsageSummary(params?: { application_id?: string }, options?: RequestOptions): Promise<ApiResponse<UsageSummary[]>> {
    return this._get<UsageSummary[]>(this.withQuery('/usage-records/summary', params), options)
  }

  async getCostReport(params?: { application_id?: string; days?: number }, options?: RequestOptions): Promise<ApiResponse<CostReportDay[]>> {
    return this._get<CostReportDay[]>(this.withQuery('/cost-report', params), options)
  }
}
