/**
 * Compliance Service Module
 *
 * GDPR/CCPA data subject requests, consent management, breach tracking,
 * data retention policies, processing activities, and audit logging.
 *
 * Routes:
 *   POST /audit-logs              → create audit log
 *   GET  /audit-logs              → query audit logs
 *
 *   Legacy GDPR (deprecated — use DSR endpoints):
 *   POST /gdpr/access-request     → request data export
 *   POST /gdpr/deletion-request   → request data deletion
 *
 *   Consent Purposes:
 *   POST /consent-purposes        → create consent purpose
 *   GET  /consent-purposes        → list consent purposes
 *
 *   Consent v2:
 *   POST /consent/v2              → record consent
 *   GET  /consent/v2/:userId      → get user consents
 *   PUT  /consent/v2/:id/withdraw → withdraw consent
 *
 *   Data Subject Requests (DSR):
 *   POST /dsr                     → create DSR
 *   GET  /dsr                     → list DSRs
 *   GET  /dsr/:id                 → get DSR
 *   PUT  /dsr/:id/status          → update DSR status
 *   POST /dsr/:id/actions         → create DSR action
 *   GET  /dsr/:id/actions         → list DSR actions
 *
 *   Breaches:
 *   POST /breaches                → report breach
 *   GET  /breaches                → list breaches
 *   GET  /breaches/:id            → get breach
 *   PUT  /breaches/:id            → update breach
 *
 *   Retention Policies:
 *   GET  /retention/policies      → list retention policies
 *   POST /retention/policies      → create retention policy
 *
 *   Processing Activities:
 *   POST /processing-activities   → create processing activity
 *   GET  /processing-activities   → list processing activities
 *   GET  /processing-activities/:id → get processing activity
 *   PUT  /processing-activities/:id → update processing activity
 */

import { ServiceModule } from '../service'
import type { ApiResponse, RequestOptions } from '../types'

// ============================================================================
// Types
// ============================================================================

export interface AuditLog {
  id: string
  action: string
  resource_type: string
  resource_id: string
  actor_id?: string
  metadata?: Record<string, unknown>
  created_at: string
}

/** @deprecated Use DataSubjectRequest instead */
export interface GdprRequest {
  id: string
  type: 'access' | 'deletion'
  user_id: string
  status: string
  created_at: string
  completed_at?: string
}

export interface ConsentPurpose {
  id: string
  name: string
  description?: string
  legal_basis: string
  category: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ConsentRecord {
  id: string
  user_id: string
  purpose_id: string
  purpose_name: string
  consent_given: boolean
  consent_method?: string
  double_opt_in_verified: boolean
  granted_at: string
  withdrawn_at?: string
}

export interface DataSubjectRequest {
  id: string
  request_type: string
  status: string
  priority: string
  reference_number: string
  requester_email: string
  requester_name?: string
  description?: string
  deadline: string
  completed_at?: string
  created_at: string
  updated_at: string
}

export interface DsrAction {
  id: string
  dsr_id: string
  service_name: string
  action_type: string
  status: string
  details?: string
  completed_at?: string
  created_at: string
}

export interface DataBreach {
  id: string
  reference_number: string
  title: string
  description?: string
  incident_type: string
  severity: string
  status: string
  discovered_at: string
  reported_to_authority: boolean
  individuals_affected?: number
  created_at: string
  updated_at: string
}

export interface RetentionPolicy {
  id: string
  data_type: string
  table_name?: string
  retention_days: number
  name?: string
  description?: string
  is_active: boolean
  last_execution_at?: string
  last_execution_result?: string
  records_deleted_last_run?: number
}

export interface ProcessingActivity {
  id: string
  name: string
  description?: string
  purpose: string
  legal_basis: string
  data_categories?: string
  data_subjects?: string
  recipients?: string
  international_transfers?: string
  retention_period?: string
  technical_measures?: string
  dpia_required: boolean
  dpia_conducted: boolean
  status: string
  created_at: string
  updated_at: string
}

// ============================================================================
// Request Types
// ============================================================================

export interface CreateConsentPurposeRequest {
  name: string
  description?: string
  legal_basis: string
  category: string
}

export interface RecordConsentRequest {
  user_id: string
  purpose_id: string
  consent_given: boolean
  consent_method?: string
}

export interface CreateDsrRequest {
  request_type: 'access' | 'deletion' | 'rectification' | 'portability' | 'restriction' | 'objection'
  requester_email: string
  requester_name?: string
  description?: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
}

export interface UpdateDsrStatusRequest {
  status: string
  reason?: string
  actor?: string
}

export interface CreateDsrActionRequest {
  service_name: string
  action_type: string
  details?: string
}

export interface ReportBreachRequest {
  title: string
  description?: string
  incident_type: string
  severity: string
  discovered_at: string
  individuals_affected?: number
}

export interface UpdateBreachRequest {
  title?: string
  description?: string
  status?: string
  severity?: string
  reported_to_authority?: boolean
  authority_reference?: string
  individuals_affected?: number
}

export interface CreateRetentionPolicyRequest {
  data_type: string
  table_name?: string
  retention_days: number
  name?: string
  description?: string
}

export interface CreateProcessingActivityRequest {
  name: string
  description?: string
  purpose: string
  legal_basis: string
  data_categories?: string
  data_subjects?: string
  recipients?: string
  international_transfers?: string
  retention_period?: string
  technical_measures?: string
  dpia_required?: boolean
}

// ============================================================================
// Compliance Service
// ============================================================================

export class ComplianceService extends ServiceModule {
  protected basePath = '/v1/compliance'

  /** Build query string from params object */
  private qs(params?: Record<string, unknown>): string {
    if (!params) return ''
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    if (entries.length === 0) return ''
    return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
  }

  // --- Audit Logs ---

  async log(data: { action: string; resource_type: string; resource_id: string; metadata?: Record<string, unknown> }, options?: RequestOptions): Promise<ApiResponse<AuditLog>> {
    return this.post<AuditLog>('/audit-logs', data, options)
  }

  async queryAuditLogs(params?: { page?: number; per_page?: number; action?: string; resource_type?: string }, requestOptions?: RequestOptions): Promise<ApiResponse<AuditLog[]>> {
    return this._get<AuditLog[]>(`/audit-logs${this.qs(params)}`, requestOptions)
  }

  // --- Legacy GDPR (deprecated) ---

  /** @deprecated Use createDataSubjectRequest({ request_type: 'access', ... }) instead */
  async requestDataExport(userId: string): Promise<ApiResponse<GdprRequest>> {
    return this.post<GdprRequest>('/gdpr/access-request', { user_id: userId })
  }

  /** @deprecated Use createDataSubjectRequest({ request_type: 'deletion', ... }) instead */
  async requestDataDeletion(userId: string): Promise<ApiResponse<GdprRequest>> {
    return this.post<GdprRequest>('/gdpr/deletion-request', { user_id: userId })
  }

  /** @deprecated Use log() instead */
  async createAuditLog(data: { action: string; resource_type: string; resource_id: string }) {
    return this.log(data)
  }

  // --- Consent Purposes ---

  async listConsentPurposes(options?: RequestOptions): Promise<ApiResponse<ConsentPurpose[]>> {
    return this._get<ConsentPurpose[]>('/consent-purposes', options)
  }

  async createConsentPurpose(data: CreateConsentPurposeRequest, options?: RequestOptions): Promise<ApiResponse<ConsentPurpose>> {
    return this.post<ConsentPurpose>('/consent-purposes', data, options)
  }

  // --- Consent v2 ---

  async recordConsent(data: RecordConsentRequest, options?: RequestOptions): Promise<ApiResponse<ConsentRecord>> {
    return this.post<ConsentRecord>('/consent/v2', data, options)
  }

  async getUserConsents(userId: string, options?: RequestOptions): Promise<ApiResponse<ConsentRecord[]>> {
    return this._get<ConsentRecord[]>(`/consent/v2/${userId}`, options)
  }

  async withdrawConsent(consentId: string, data?: { reason?: string; actor?: string }, options?: RequestOptions): Promise<ApiResponse<ConsentRecord>> {
    return this.put<ConsentRecord>(`/consent/v2/${consentId}/withdraw`, data || {}, options)
  }

  // --- Data Subject Requests ---

  async createDataSubjectRequest(data: CreateDsrRequest, options?: RequestOptions): Promise<ApiResponse<DataSubjectRequest>> {
    return this.post<DataSubjectRequest>('/dsr', data, options)
  }

  async listDataSubjectRequests(params?: { page?: number; per_page?: number; status?: string; request_type?: string }, requestOptions?: RequestOptions): Promise<ApiResponse<DataSubjectRequest[]>> {
    return this._get<DataSubjectRequest[]>(`/dsr${this.qs(params)}`, requestOptions)
  }

  async getDataSubjectRequest(id: string, options?: RequestOptions): Promise<ApiResponse<DataSubjectRequest>> {
    return this._get<DataSubjectRequest>(`/dsr/${id}`, options)
  }

  async updateDsrStatus(id: string, data: UpdateDsrStatusRequest, options?: RequestOptions): Promise<ApiResponse<DataSubjectRequest>> {
    return this.put<DataSubjectRequest>(`/dsr/${id}/status`, data, options)
  }

  async createDsrAction(dsrId: string, data: CreateDsrActionRequest, options?: RequestOptions): Promise<ApiResponse<DsrAction>> {
    return this.post<DsrAction>(`/dsr/${dsrId}/actions`, data, options)
  }

  async listDsrActions(dsrId: string, options?: RequestOptions): Promise<ApiResponse<DsrAction[]>> {
    return this._get<DsrAction[]>(`/dsr/${dsrId}/actions`, options)
  }

  // --- Data Breaches ---

  async reportBreach(data: ReportBreachRequest, options?: RequestOptions): Promise<ApiResponse<DataBreach>> {
    return this.post<DataBreach>('/breaches', data, options)
  }

  async listBreaches(params?: { page?: number; per_page?: number; status?: string }, requestOptions?: RequestOptions): Promise<ApiResponse<DataBreach[]>> {
    return this._get<DataBreach[]>(`/breaches${this.qs(params)}`, requestOptions)
  }

  async getBreach(id: string, options?: RequestOptions): Promise<ApiResponse<DataBreach>> {
    return this._get<DataBreach>(`/breaches/${id}`, options)
  }

  async updateBreach(id: string, data: UpdateBreachRequest, options?: RequestOptions): Promise<ApiResponse<DataBreach>> {
    return this.put<DataBreach>(`/breaches/${id}`, data, options)
  }

  // --- Retention Policies ---

  async listRetentionPolicies(options?: RequestOptions): Promise<ApiResponse<RetentionPolicy[]>> {
    return this._get<RetentionPolicy[]>('/retention/policies', options)
  }

  async createRetentionPolicy(data: CreateRetentionPolicyRequest, options?: RequestOptions): Promise<ApiResponse<RetentionPolicy>> {
    return this.post<RetentionPolicy>('/retention/policies', data, options)
  }

  // --- Processing Activities ---

  async createProcessingActivity(data: CreateProcessingActivityRequest, options?: RequestOptions): Promise<ApiResponse<ProcessingActivity>> {
    return this.post<ProcessingActivity>('/processing-activities', data, options)
  }

  async listProcessingActivities(params?: { page?: number; per_page?: number }, requestOptions?: RequestOptions): Promise<ApiResponse<ProcessingActivity[]>> {
    return this._get<ProcessingActivity[]>(`/processing-activities${this.qs(params)}`, requestOptions)
  }

  async getProcessingActivity(id: string, options?: RequestOptions): Promise<ApiResponse<ProcessingActivity>> {
    return this._get<ProcessingActivity>(`/processing-activities/${id}`, options)
  }

  async updateProcessingActivity(id: string, data: Partial<CreateProcessingActivityRequest>, options?: RequestOptions): Promise<ApiResponse<ProcessingActivity>> {
    return this.put<ProcessingActivity>(`/processing-activities/${id}`, data, options)
  }
}
