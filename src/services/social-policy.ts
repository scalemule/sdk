/**
 * Social Policy Service Module
 *
 * Thin SDK wrapper for scalemule-social-policy. The SDK exposes decisions,
 * settings, relationships, contact requests, blocks, mutes, reports, and
 * policy packs; policy rules remain server-owned.
 */

import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

export type SocialPolicyIdentityType = 'person' | 'business' | 'workspace' | 'customer' | string;

export interface SocialPolicyIdentity {
  identity_id: string;
  identity_type: SocialPolicyIdentityType;
  user_id?: string | null;
  account_id?: string | null;
}

export interface SocialPolicyContext {
  context_type?: string | null;
  context_id?: string | null;
  workspace_id?: string | null;
  conversation_id?: string | null;
  customer_space_id?: string | null;
  content_id?: string | null;
}

export type SocialPolicyAction =
  | 'message_direct'
  | 'message_request'
  | 'connect_request'
  | 'business_inquiry'
  | 'view_profile'
  | 'search_discover'
  | 'space_invite'
  | 'follow'
  | 'block'
  | 'report'
  | 'mute'
  | string;

export type SocialPolicyDecision =
  | 'allow'
  | 'allow_with_warning'
  | 'route_to_requests'
  | 'route_to_business_inbox'
  | 'request_required'
  | 'deny_blocked'
  | 'throttle'
  | 'deny_policy'
  | string;

export interface SocialPolicyDecisionRequest {
  app_key?: string | null;
  account_id?: string | null;
  policy_pack?: string | null;
  actor: SocialPolicyIdentity;
  target: SocialPolicyIdentity;
  action: SocialPolicyAction;
  context?: SocialPolicyContext;
  metadata?: Record<string, unknown> | null;
}

export interface SocialPolicyBatchDecisionTarget {
  identity_id: string;
  identity_type: SocialPolicyIdentityType;
  context?: SocialPolicyContext;
}

export interface SocialPolicyBatchDecisionRequest {
  app_key?: string | null;
  account_id?: string | null;
  policy_pack?: string | null;
  actor: SocialPolicyIdentity;
  actions: SocialPolicyAction[];
  targets: SocialPolicyBatchDecisionTarget[];
  metadata?: Record<string, unknown> | null;
}

export interface SocialPolicyDecisionLimits {
  remaining_today: number;
  reset_at: string;
}

export interface SocialPolicyDecisionResponse {
  decision: SocialPolicyDecision;
  effective_decision: SocialPolicyDecision;
  allowed: boolean;
  effective_allowed: boolean;
  reason: string;
  policy_pack: string;
  policy_version: string;
  rollout_mode: 'shadow' | 'report_only' | 'enforce' | string;
  would_have_denied: boolean;
  route?: string | null;
  ui_message?: string | null;
  limits?: SocialPolicyDecisionLimits | null;
  requirements: string[];
  audit_id: string;
}

export interface SocialPolicyBatchDecisionItem {
  action: SocialPolicyAction;
  target_identity_id: string;
  decision: SocialPolicyDecisionResponse;
}

export interface SocialPolicyBatchDecisionResponse {
  decisions: SocialPolicyBatchDecisionItem[];
}

export interface SocialPolicySettings {
  identity_id: string;
  policy_pack: string;
  profile_visibility: string;
  search_visibility: string;
  direct_message_policy: string;
  contact_request_policy: string;
  follow_policy: string;
  business_contact_policy: string;
  presence_visibility: string;
}

export interface SocialPolicyUpdateSettingsRequest {
  account_id?: string | null;
  policy_pack?: string | null;
  profile_visibility?: string | null;
  search_visibility?: string | null;
  direct_message_policy?: string | null;
  contact_request_policy?: string | null;
  follow_policy?: string | null;
  business_contact_policy?: string | null;
  presence_visibility?: string | null;
  relationship_visibility?: string | null;
  mention_policy?: string | null;
  comment_policy?: string | null;
  invite_policy?: string | null;
}

export interface SocialPolicyRelationshipRequest {
  account_id?: string | null;
  actor_identity_id: string;
  target_identity_id: string;
  relationship_type: string;
  direction?: string | null;
  status?: string | null;
  source_context_type?: string | null;
  source_context_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface SocialPolicyRelationship {
  id: string;
  actor_identity_id: string;
  target_identity_id: string;
  relationship_type: string;
  status: string;
}

export interface SocialPolicyRelationshipQuery {
  account_id?: string | null;
  identity_id?: string | null;
  relationship_type?: string | null;
}

export interface SocialPolicyContactRequestRequest {
  account_id?: string | null;
  actor_identity_id: string;
  target_identity_id: string;
  request_type: string;
  intro_message?: string | null;
  context_type?: string | null;
  context_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface SocialPolicyContactRequest {
  id: string;
  status: string;
}

export interface SocialPolicyContactRequestQuery {
  account_id?: string | null;
  identity_id: string;
  status?: string | null;
}

export interface SocialPolicyContactRequestListItem {
  id: string;
  actor_identity_id: string;
  target_identity_id: string;
  request_type: string;
  intro_message?: string | null;
  context_type?: string | null;
  context_id?: string | null;
  status: string;
  created_at: string;
}

export interface SocialPolicyBlockRequest {
  account_id?: string | null;
  blocker_identity_id: string;
  blocked_identity_id: string;
  scope?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface SocialPolicyUnblockRequest {
  account_id?: string | null;
  blocker_identity_id: string;
  blocked_identity_id: string;
  scope?: string | null;
}

export interface SocialPolicyMuteRequest {
  account_id?: string | null;
  actor_identity_id: string;
  target_identity_id: string;
  context_type?: string | null;
  context_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface SocialPolicyReportRequest {
  account_id?: string | null;
  reporter_identity_id: string;
  reported_identity_id: string;
  context_type?: string | null;
  context_id?: string | null;
  reason: string;
  details?: string | null;
}

export interface SocialPolicyPolicyPack {
  id: string;
  version: string;
  rollout_mode: string;
}

export class SocialPolicyService extends ServiceModule {
  protected basePath = '/v1/social-policy';

  decide(
    request: SocialPolicyDecisionRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<SocialPolicyDecisionResponse>> {
    return this.post<SocialPolicyDecisionResponse>('/decision', withDefaultContext(request), options);
  }

  batchDecide(
    request: SocialPolicyBatchDecisionRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<SocialPolicyBatchDecisionResponse>> {
    return this.post<SocialPolicyBatchDecisionResponse>('/decisions/batch', request, options);
  }

  decideAction(
    action: SocialPolicyAction,
    actor: SocialPolicyIdentity,
    target: SocialPolicyIdentity,
    options?: {
      appKey?: string | null;
      accountId?: string | null;
      policyPack?: string | null;
      context?: SocialPolicyContext;
      metadata?: Record<string, unknown> | null;
      requestOptions?: RequestOptions;
    }
  ): Promise<ApiResponse<SocialPolicyDecisionResponse>> {
    return this.decide(
      {
        app_key: options?.appKey,
        account_id: options?.accountId,
        policy_pack: options?.policyPack,
        actor,
        target,
        action,
        context: options?.context,
        metadata: options?.metadata
      },
      options?.requestOptions
    );
  }

  decideFollow(
    actor: SocialPolicyIdentity,
    target: SocialPolicyIdentity,
    options?: Parameters<SocialPolicyService['decideAction']>[3]
  ): Promise<ApiResponse<SocialPolicyDecisionResponse>> {
    return this.decideAction('follow', actor, target, options);
  }

  decideDirectMessage(
    actor: SocialPolicyIdentity,
    target: SocialPolicyIdentity,
    options?: Parameters<SocialPolicyService['decideAction']>[3]
  ): Promise<ApiResponse<SocialPolicyDecisionResponse>> {
    return this.decideAction('message_direct', actor, target, options);
  }

  decideContactRequest(
    actor: SocialPolicyIdentity,
    target: SocialPolicyIdentity,
    options?: Parameters<SocialPolicyService['decideAction']>[3]
  ): Promise<ApiResponse<SocialPolicyDecisionResponse>> {
    return this.decideAction('connect_request', actor, target, options);
  }

  getSettings(identityId: string, options?: RequestOptions): Promise<ApiResponse<SocialPolicySettings>> {
    return this._get<SocialPolicySettings>(`/settings/${identityId}`, options);
  }

  updateSettings(
    identityId: string,
    request: SocialPolicyUpdateSettingsRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<SocialPolicySettings>> {
    return this.patch<SocialPolicySettings>(`/settings/${identityId}`, request, options);
  }

  createRelationship(
    request: SocialPolicyRelationshipRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<SocialPolicyRelationship>> {
    return this.post<SocialPolicyRelationship>('/relationships', request, options);
  }

  listRelationships(
    params?: SocialPolicyRelationshipQuery,
    options?: RequestOptions
  ): Promise<ApiResponse<SocialPolicyRelationship[]>> {
    return this._get<SocialPolicyRelationship[]>(this.withQuery('/relationships', toQueryParams(params)), options);
  }

  deleteRelationship(relationshipId: string, options?: RequestOptions): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.del<{ deleted: boolean }>(`/relationships/${relationshipId}`, options);
  }

  createContactRequest(
    request: SocialPolicyContactRequestRequest,
    options?: RequestOptions
  ): Promise<ApiResponse<SocialPolicyContactRequest>> {
    return this.post<SocialPolicyContactRequest>('/contact-requests', request, options);
  }

  listContactRequestInbox(
    params: SocialPolicyContactRequestQuery,
    options?: RequestOptions
  ): Promise<ApiResponse<SocialPolicyContactRequestListItem[]>> {
    return this._get<SocialPolicyContactRequestListItem[]>(
      this.withQuery('/contact-requests/inbox', toQueryParams(params)),
      options
    );
  }

  listContactRequestSent(
    params: SocialPolicyContactRequestQuery,
    options?: RequestOptions
  ): Promise<ApiResponse<SocialPolicyContactRequestListItem[]>> {
    return this._get<SocialPolicyContactRequestListItem[]>(
      this.withQuery('/contact-requests/sent', toQueryParams(params)),
      options
    );
  }

  acceptContactRequest(requestId: string, options?: RequestOptions): Promise<ApiResponse<SocialPolicyContactRequest>> {
    return this.post<SocialPolicyContactRequest>(`/contact-requests/${requestId}/accept`, undefined, options);
  }

  ignoreContactRequest(requestId: string, options?: RequestOptions): Promise<ApiResponse<SocialPolicyContactRequest>> {
    return this.post<SocialPolicyContactRequest>(`/contact-requests/${requestId}/ignore`, undefined, options);
  }

  declineContactRequest(requestId: string, options?: RequestOptions): Promise<ApiResponse<SocialPolicyContactRequest>> {
    return this.post<SocialPolicyContactRequest>(`/contact-requests/${requestId}/decline`, undefined, options);
  }

  reportContactRequest(requestId: string, options?: RequestOptions): Promise<ApiResponse<SocialPolicyContactRequest>> {
    return this.post<SocialPolicyContactRequest>(`/contact-requests/${requestId}/report`, undefined, options);
  }

  block(request: SocialPolicyBlockRequest, options?: RequestOptions): Promise<ApiResponse<{ blocked: boolean }>> {
    return this.post<{ blocked: boolean }>('/block', request, options);
  }

  unblock(request: SocialPolicyUnblockRequest, options?: RequestOptions): Promise<ApiResponse<{ unblocked: boolean }>> {
    return this.post<{ unblocked: boolean }>('/unblock', request, options);
  }

  mute(request: SocialPolicyMuteRequest, options?: RequestOptions): Promise<ApiResponse<{ muted: boolean }>> {
    return this.post<{ muted: boolean }>('/mute', request, options);
  }

  unmute(request: SocialPolicyMuteRequest, options?: RequestOptions): Promise<ApiResponse<{ unmuted: boolean }>> {
    return this.post<{ unmuted: boolean }>('/unmute', request, options);
  }

  report(request: SocialPolicyReportRequest, options?: RequestOptions): Promise<ApiResponse<{ reported: boolean }>> {
    return this.post<{ reported: boolean }>('/report', request, options);
  }

  listPolicyPacks(options?: RequestOptions): Promise<ApiResponse<SocialPolicyPolicyPack[]>> {
    return this._get<SocialPolicyPolicyPack[]>('/policy-packs', options);
  }
}

function withDefaultContext(request: SocialPolicyDecisionRequest): SocialPolicyDecisionRequest {
  return {
    ...request,
    context: request.context ?? {}
  };
}

function toQueryParams(params?: object): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const query: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    query[key] = value;
  }
  return query;
}
