/**
 * Decisions Service Module — ScaleMule Business Logic Plane
 *
 * Deterministic, explainable business decisions evaluated on the tenant's
 * active sealed release. Evaluation returns proposed actions and a signed
 * receipt; it never dispatches side effects.
 *
 * Routes (gateway prefix /v1/decisions, evaluate role):
 *   POST   /evaluate/{key}          → evaluate one decision
 *   POST   /evaluate/batch          → up to 100 evaluations
 *   GET    /receipts/{id}           → signed receipt (audience-gated)
 *   POST   /receipts/{id}/verify    → verify with the receipt-ring public keys
 *
 * Workspace scope: pass `headers: { 'x-requested-account-id': accountId }`
 * (the gateway validates membership and forwards the effective account),
 * the same convention as other account-scoped services.
 */

import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

// ============================================================================
// Types
// ============================================================================

export type DecisionOutcome = 'value' | 'denied' | 'unavailable';
export type DecisionTraceLevel = 'none' | 'summary' | 'full';

export interface DecisionEvaluateOptions {
  /** Trace verbosity (audience `max_trace` still applies). */
  trace?: DecisionTraceLevel;
  /**
   * Idempotency key: the same key + same inputs replays the stored receipt
   * (`replayed: true`); the same key with different inputs is a 409
   * `IDEMPOTENCY_KEY_REUSED`.
   */
  idempotency_key?: string;
}

export interface DecisionReceipt {
  id: string;
  content_hash: string;
  /** Ed25519 signature, hex, over `SM-DECISION-RECEIPT-v1\0` + content_hash. */
  signature: string;
  signature_kid: string;
  issued_at: string;
  expires_at: string;
  has_snapshot: boolean;
  /** The exact signed document — pass it whole to domain services (bookings). */
  signed_document: Record<string, unknown>;
}

export interface DecisionVersions {
  release_id: string;
  release_number?: number;
  activation_version?: number;
  registry_revision: number;
  schema_revision: number;
  artifact_hash: string;
  compiler_version: string;
  evaluator_semantics_version: string;
  ir_version?: string;
}

export interface DecisionProposedAction {
  action_key: string;
  params: Record<string, unknown>;
}

export interface DecisionResult<TValue = unknown> {
  decision_key: string;
  outcome: DecisionOutcome;
  value: TValue | null;
  reason_codes: string[];
  violations: { rule_key: string; reason_codes: string[] }[];
  recommendations: { rule_key: string; reason_codes: string[] }[];
  proposed_actions: DecisionProposedAction[];
  versions: DecisionVersions;
  facts_hash: string;
  fact_sources: Record<string, string>;
  trace: Record<string, unknown> | null;
  receipt: DecisionReceipt | null;
  record_class: string;
  replayed: boolean;
  diverged: boolean;
  latency_us: number;
  resolve_us: number;
}

export interface DecisionBatchItem {
  decision_key: string;
  inputs: Record<string, unknown>;
  options?: DecisionEvaluateOptions;
}

export interface DecisionBatchResult {
  decision_key: string;
  success: boolean;
  data?: DecisionResult;
  error?: string;
}

/** `appointment.deposit` (home_services pack) result value. */
export interface AppointmentDepositValue {
  required: boolean;
  percent_bps: number;
  amount_minor: number;
}

export interface ReceiptVerification {
  receipt_id: string;
  verified: boolean;
  error: string | null;
  content_hash: string;
  signature_kid: string;
  expired: boolean;
}

// ============================================================================
// Service
// ============================================================================

export class DecisionsService extends ServiceModule {
  protected basePath = '/v1/decisions';

  /**
   * Evaluate a decision on the tenant's active release.
   *
   * @example
   * const { data } = await sm.decisions.evaluate<AppointmentDepositValue>(
   *   'appointment.deposit',
   *   { appointment: { quote_id }, customer: { ref: customerRef } },
   *   { idempotency_key: `event:${eventId}` },
   *   { headers: { 'x-requested-account-id': accountId } },
   * );
   */
  async evaluate<TValue = unknown>(
    decisionKey: string,
    inputs: Record<string, unknown>,
    options?: DecisionEvaluateOptions,
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<DecisionResult<TValue>>> {
    return this.post<DecisionResult<TValue>>(
      `/evaluate/${encodeURIComponent(decisionKey)}`,
      { inputs, options: options ?? {} },
      requestOptions
    );
  }

  /** Evaluate up to 100 decisions in one call (per-item success/error). */
  async evaluateBatch(
    items: DecisionBatchItem[],
    requestOptions?: RequestOptions
  ): Promise<ApiResponse<DecisionBatchResult[]>> {
    return this.post<DecisionBatchResult[]>('/evaluate/batch', { items }, requestOptions);
  }

  /** Fetch a stored receipt (end users only see their own). */
  async getReceipt(receiptId: string, requestOptions?: RequestOptions): Promise<ApiResponse<Record<string, unknown>>> {
    return this._get<Record<string, unknown>>(`/receipts/${encodeURIComponent(receiptId)}`, requestOptions);
  }

  /** Server-side verification of a stored receipt against the receipt ring. */
  async verifyReceipt(receiptId: string, requestOptions?: RequestOptions): Promise<ApiResponse<ReceiptVerification>> {
    return this.post<ReceiptVerification>(
      `/receipts/${encodeURIComponent(receiptId)}/verify`,
      undefined,
      requestOptions
    );
  }
}
