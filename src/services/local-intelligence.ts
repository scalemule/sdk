/** BaseNews delivery through the existing News service and ScaleMule identity.
 * Records are evidence-backed projections; a release is not an article.
 * Honor refresh_after and removals. Never use this API as a source-text archive.
 */
import { ServiceModule } from '../service';
import type { ApiResponse, RequestOptions } from '../types';

export type IntelligenceKind = 'event' | 'development' | 'community_story' | 'opportunity' | 'public_notice';
export type IntelligenceStatus =
  'proposed' | 'approved' | 'scheduled' | 'ongoing' | 'completed' | 'canceled' | 'postponed' | 'disputed';
export type IntelligenceVerification =
  'unverified' | 'community_submitted' | 'supported' | 'officially_confirmed' | 'independently_verified' | 'disputed';
export type IntelligenceSection = 'important' | 'around_you' | 'people' | 'discover' | 'participate';
export type CommunityValueOutcome = 'understand' | 'discover' | 'decide' | 'participate' | 'not_relevant';
export interface IntelligenceEvent {
  starts_at: string;
  ends_at: string;
  time_zone: string;
  place_entity_id: string | null;
  organizer_entity_id: string | null;
  series_entity_id: string | null;
  cost: string | null;
  accessibility: string | null;
}
export interface IntelligenceAction {
  label: string;
  url: string;
  deadline: string | null;
}
export interface IntelligenceSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
  published_at: string | null;
  retrieved_at: string | null;
  kind: string;
  distance: string;
  interested_party: boolean | null;
}
export interface IntelligenceClaim {
  id: string;
  text: string;
  verification: 'UNVERIFIED' | 'SUPPORTED' | 'VERIFIED' | 'DISPUTED';
  attribution: string | null;
  evidence: {
    source_id: string;
    role: 'DIRECT' | 'CORROBORATING' | 'CONTEXT' | 'CONTRADICTING' | 'ATTRIBUTED_CLAIM';
  }[];
}
export interface LocalIntelligenceRecord {
  contract_version: 'basenews/1';
  id: string;
  revision: number;
  title: string;
  why_it_matters: string;
  kind: IntelligenceKind;
  status: IntelligenceStatus;
  section: IntelligenceSection;
  civic_importance: boolean;
  geography_ids: string[];
  related_entity_ids: string[];
  issue_entity_ids: string[];
  topics: string[];
  event: IntelligenceEvent | null;
  actions: IntelligenceAction[];
  claims: IntelligenceClaim[];
  sources: IntelligenceSource[];
  verification: IntelligenceVerification;
  last_verified_at: string | null;
  observed_at: string;
  effective_at: string | null;
  review_due_at: string;
  published_at: string;
  original_reporting_url: string | null;
  original_byline: string;
  originating_publication_id: string;
  license: string;
  supersedes_revision: number | null;
  canonical_references: {
    reporting_package_id: string;
    reporting_revision: number;
    event_id: string | null;
    event_version: number | null;
  };
  /** Refresh or remove the record after this time. Access may have been revoked. */
  refresh_after: string;
  relevance_reasons?: string[];
}
export interface LocalIntelligencePreferences {
  personalized: boolean;
  geography_ids: string[];
  topic_codes: string[];
  entity_ids: string[];
  issue_ids: string[];
  record_ids: string[];
}
export interface IntelligenceRecordPage {
  contract_version: 'basenews/1';
  items: LocalIntelligenceRecord[];
  next_cursor: string | null;
  /** Keep the FIRST page's checkpoint while bootstrapping the inventory. */
  changes_cursor: string;
  /** Initialize IntelligenceCache.sequence from the FIRST page's value. */
  changes_sequence: string;
}
export interface IntelligenceChangePage {
  contract_version: 'basenews/1';
  scope: { application_id: string; publication_id: string };
  items: {
    sequence: string;
    id: string;
    changed_at: string;
    removed: boolean;
    record: LocalIntelligenceRecord | null;
  }[];
  next_cursor: string;
  has_more: boolean;
  lease_seconds: number;
}
export interface LocalBriefing {
  contract_version: 'basenews/1';
  policy_version: string;
  as_of: string;
  geography_id: string;
  personalized: boolean;
  items: LocalIntelligenceRecord[];
  more_available: boolean;
  lease_seconds: number;
}
export interface IntelligenceRelease {
  package_id: string;
  package_revision: number;
  expected_revision: number;
  title: string;
  why_it_matters: string;
  kind: IntelligenceKind;
  status: IntelligenceStatus;
  section: IntelligenceSection;
  civic_importance: boolean;
  claim_ids: string[];
  geography_ids: string[];
  related_entity_ids: string[];
  issue_entity_ids: string[];
  topics: string[];
  event: IntelligenceEvent | null;
  actions: IntelligenceAction[];
  verification: IntelligenceVerification;
  last_verified_at: string | null;
  observed_at: string;
  effective_at: string | null;
  review_due_at: string;
  original_reporting_url: string | null;
  redistribution_permitted: boolean;
  privacy_and_consent_reviewed: boolean;
  license: string;
  reason: string;
  destinations: { application_id: string; publication_id: string; expires_at: string }[];
  sensitivity_review: { policy_version: string; rule_ids: string[]; reason: string } | null;
}
export interface IntelligenceReleaseReceipt {
  id: string;
  revision: number;
  contract_version: 'basenews/1';
}

/** API keys remain server-side in publication apps. Personal preference writes
 * use the reader's authenticated session; agents cannot impersonate a reader.
 * Methods retain the SDK's {data,error} contract and RequestOptions propagation.
 */
export class LocalIntelligenceService extends ServiceModule {
  protected basePath = '/v1/news';
  private scope(publication: string) {
    return `/intelligence/publications/${encodeURIComponent(publication)}`;
  }

  records(
    publication: string,
    params: { cursor?: string; limit?: number; geography?: string; kind?: IntelligenceKind } = {},
    options?: RequestOptions
  ): Promise<ApiResponse<IntelligenceRecordPage>> {
    return this._get(this.withQuery(`${this.scope(publication)}/records`, params), options);
  }
  get(publication: string, record: string, options?: RequestOptions): Promise<ApiResponse<LocalIntelligenceRecord>> {
    return this._get(`${this.scope(publication)}/records/${encodeURIComponent(record)}`, options);
  }
  changes(
    publication: string,
    params: { cursor?: string; limit?: number } = {},
    options?: RequestOptions
  ): Promise<ApiResponse<IntelligenceChangePage>> {
    return this._get(this.withQuery(`${this.scope(publication)}/changes`, params), options);
  }
  briefing(
    publication: string,
    params: { geography: string; limit?: number; personalized?: boolean },
    options?: RequestOptions
  ): Promise<ApiResponse<LocalBriefing>> {
    return this._get(this.withQuery(`${this.scope(publication)}/briefing`, params), options);
  }
  /** Agent-safe explicit preferences: evaluated for this request and never saved. */
  briefingForPreferences(
    publication: string,
    input: { geography: string; preferences: LocalIntelligencePreferences; limit?: number },
    options?: RequestOptions
  ): Promise<ApiResponse<LocalBriefing>> {
    return this.post(`${this.scope(publication)}/briefing`, input, options);
  }
  preferences(
    publication: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ revision: number; preferences: LocalIntelligencePreferences }>> {
    return this._get(`${this.scope(publication)}/preferences`, options);
  }
  savePreferences(
    publication: string,
    expectedRevision: number,
    preferences: LocalIntelligencePreferences,
    options?: RequestOptions
  ): Promise<ApiResponse<{ revision: number; preferences: LocalIntelligencePreferences }>> {
    return this.put(
      `${this.scope(publication)}/preferences`,
      { expected_revision: expectedRevision, preferences },
      options
    );
  }
  deletePreferences(publication: string, options?: RequestOptions): Promise<ApiResponse<void>> {
    return this.del(`${this.scope(publication)}/preferences`, options);
  }
  feedback(
    publication: string,
    record: string,
    recordRevision: number,
    outcome: CommunityValueOutcome,
    options?: RequestOptions
  ): Promise<ApiResponse<{ recorded: boolean }>> {
    return this.post(
      `${this.scope(publication)}/records/${encodeURIComponent(record)}/feedback`,
      { record_revision: recordRevision, outcome },
      options
    );
  }
  deleteFeedback(publication: string, record: string, options?: RequestOptions): Promise<ApiResponse<void>> {
    return this.del(`${this.scope(publication)}/records/${encodeURIComponent(record)}/feedback`, options);
  }
  /** Requires a human editor with publication publish authority. */
  release(
    publication: string,
    input: IntelligenceRelease,
    idempotencyKey: string,
    options?: RequestOptions
  ): Promise<ApiResponse<IntelligenceReleaseReceipt>> {
    return this.post(`/publications/${encodeURIComponent(publication)}/intelligence`, input, {
      ...options,
      headers: { ...options?.headers, 'idempotency-key': idempotencyKey }
    });
  }
  withdraw(
    publication: string,
    record: string,
    expectedRevision: number,
    reason: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ id: string; revision: number; removed: true }>> {
    return this.post(
      `/publications/${encodeURIComponent(publication)}/intelligence/${encodeURIComponent(record)}/withdraw`,
      { expected_revision: expectedRevision, reason },
      options
    );
  }
}

/** Apply a change batch only to a cache already scoped by application AND
 * publication. Lease expiry is mandatory even when no change notification arrives.
 * No persistence, tracking or cross-publication identity joins are performed.
 */
export interface IntelligenceCache {
  scope: { application_id: string; publication_id: string };
  sequence: string;
  records: ReadonlyMap<string, LocalIntelligenceRecord>;
}
export function applyIntelligenceChanges(
  current: IntelligenceCache,
  changes: IntelligenceChangePage,
  now = Date.now()
): IntelligenceCache {
  if (
    changes.contract_version !== 'basenews/1' ||
    changes.scope.application_id !== current.scope.application_id ||
    changes.scope.publication_id !== current.scope.publication_id
  )
    throw new Error('Intelligence change scope mismatch');
  const sequenceValue = (value: string) => {
    if (!/^(0|[1-9][0-9]{0,19})$/.test(value)) throw new Error('Invalid intelligence sequence');
    return BigInt(value);
  };
  let sequence = sequenceValue(current.sequence);
  let previous = -1n;
  const next = new Map(current.records);
  for (const item of changes.items) {
    const received = sequenceValue(item.sequence);
    if (received <= previous) throw new Error('Unordered intelligence change batch');
    previous = received;
    if (received <= sequence) continue; // Idempotent replay cannot erase a newer release.
    if (received !== sequence + 1n) throw new Error('Intelligence change gap; resume the previous cursor');
    sequence = received;
    if (item.removed || !item.record) next.delete(item.id);
    else if (item.record.id !== item.id) throw new Error('Intelligence change identity mismatch');
    else if (!next.has(item.id) || next.get(item.id)!.revision <= item.record.revision) next.set(item.id, item.record);
  }
  for (const [id, record] of next) {
    const expiry = Date.parse(record.refresh_after);
    if (record.contract_version !== 'basenews/1' || !Number.isFinite(expiry) || expiry <= now) next.delete(id);
  }
  return { scope: current.scope, sequence: sequence.toString(), records: next };
}
