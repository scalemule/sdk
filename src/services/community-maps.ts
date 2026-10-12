import { ServiceModule } from '../service';
import type { ScaleMuleClient } from '../client';
import type { ApiResponse, RequestOptions } from '../types';

export type CommunityMapPosition = [longitude: number, latitude: number];
export type CommunityMapGeometry =
  | { type: 'Point'; coordinates: CommunityMapPosition }
  | { type: 'LineString'; coordinates: CommunityMapPosition[] }
  | { type: 'Polygon'; coordinates: CommunityMapPosition[][] };
export type CommunityMapPrecision =
  'CITY' | 'NEIGHBORHOOD' | 'STREET' | 'INTERSECTION' | 'GENERALIZED' | 'EXACT_PUBLIC';
export interface CommunityMapSource {
  title: string;
  url: string | null;
  attribution: string;
}
export interface CommunityMapArea {
  id: string;
  slug: string;
  name: string;
  kind: string;
  country_code: string | null;
  geometry: CommunityMapGeometry | null;
}
export interface CommunityMapReactionDefinition {
  key: string;
  label: string;
  icon: string;
}
export interface CommunityMapCollectionConfig {
  title: string;
  description: string;
  kind: string;
  timezone: string;
  starts_at: string | null;
  ends_at: string | null;
  submissions_open: boolean;
  categories: { key: string; label: string }[];
  reactions: CommunityMapReactionDefinition[];
  presentation: { accent?: string | null; season?: string | null; map_style_url?: string | null };
}
export interface CommunityMapSubmissionPolicy {
  version: string;
  text: string;
  guidelines: string;
}
export interface CommunityMapConsent extends CommunityMapSubmissionPolicy {
  accepted: true;
  accepted_at: string;
}
export interface CommunityMapCollection {
  submission_policy?: CommunityMapSubmissionPolicy;
  id: string;
  slug: string;
  revision: number;
  config: CommunityMapCollectionConfig;
  areas: CommunityMapArea[];
}
/** Explicit public projection; submitted addresses, contacts and notes are absent. */
export interface CommunityMapPublicContent {
  title: string;
  description: string;
  location_label: string;
  precision: CommunityMapPrecision;
  residential: boolean;
  geometry: CommunityMapGeometry;
  external_url: string | null;
  hours: string | null;
  admission: string | null;
  accessibility: string | null;
  family_friendly: boolean | null;
  sources: CommunityMapSource[];
  related_story_urls: string[];
  metadata: Record<string, string | number | boolean | null>;
}
export interface CommunityMapMedia {
  content_type?: string;
  id: string;
  caption: string;
  attribution: string;
}
export interface CommunityMapFeature {
  id: string;
  slug: string;
  area_id: string;
  category: string;
  revision: number;
  featured: boolean;
  verified: boolean;
  content: CommunityMapPublicContent;
  starts_at: string | null;
  ends_at: string | null;
  media: CommunityMapMedia[];
  reactions: Record<string, number>;
}
export interface CommunityMapPage<T> {
  items: T[];
  next_cursor: string | null;
}
export interface CommunityMapFeatureQuery {
  after?: string;
  limit?: number;
  area_id?: string;
  category?: string;
  geometry_type?: CommunityMapGeometry['type'];
  featured?: boolean;
  verified?: boolean;
  active_at?: string;
  bbox?: string;
}
export interface CommunityMapProposal {
  title: string;
  description: string;
  location_text: string;
  exact_geometry?: CommunityMapGeometry | null;
  contact_email?: string | null;
  contact_name?: string | null;
  contributor_claim: 'resident' | 'owner' | 'visitor' | 'organizer' | 'other';
  category: string;
  hours?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  correction_for?: string | null;
}
export interface CommunityMapSubmissionInput {
  consent: { version: string; accepted: boolean };
  area_id: string;
  idempotency_key: string;
  proposal: CommunityMapProposal;
}
export type CommunityMapReportReason =
  | 'no-longer-exists'
  | 'incorrect-location'
  | 'incorrect-information'
  | 'inappropriate-media'
  | 'duplicate'
  | 'safety'
  | 'privacy-removal'
  | 'other';
export interface CommunityMapReportInput {
  reason: CommunityMapReportReason;
  details: string;
  contact_email?: string | null;
  idempotency_key: string;
}
export interface CommunityMapReceipt {
  id: string;
  received: boolean;
}
export type CommunityMapFeatureStatus = 'DRAFT' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED' | 'REMOVED';
export type CommunityMapSubmissionStatus =
  'SUBMITTED' | 'REVIEWING' | 'NEEDS_INFO' | 'APPROVED' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED' | 'REMOVED';
export interface CommunityMapRevision {
  id: string;
  revision: number;
  status: string;
}
export interface CommunityMapFeatureDraft {
  expected_revision?: number;
  area_id: string;
  slug: string;
  category: string;
  featured: boolean;
  verified: boolean;
  content: CommunityMapPublicContent;
  starts_at: string | null;
  ends_at: string | null;
}
export interface CommunityMapEditorialFeature extends Omit<CommunityMapFeature, 'media' | 'reactions'> {
  status: CommunityMapFeatureStatus;
  merged_into: string | null;
}
/** Returned only by editorial endpoints after server-side authorization. */
export interface CommunityMapPrivateSubmission {
  consent?: CommunityMapConsent | null;
  id: string;
  area_id: string;
  feature_id: string | null;
  status: CommunityMapSubmissionStatus;
  revision: number;
  proposal: CommunityMapProposal;
  created_at: string;
  notes: { actor_id: string; note: string; created_at: string }[];
}
export interface CommunityMapEditorialCollection {
  id: string;
  publication_id: string | null;
  slug: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  revision: number;
  config: CommunityMapCollectionConfig;
  area_ids?: string[];
  areas?: CommunityMapArea[];
}
export interface CommunityMapView {
  id: string;
  collection_id: string;
  publication_id: string | null;
  slug: string;
  enabled: boolean;
  revision: number;
  allow_submissions: boolean;
}
export interface CommunityMapPrivateReport {
  id: string;
  feature_id: string;
  reason: CommunityMapReportReason;
  priority: number;
  status: string;
  revision: number;
  report: CommunityMapReportInput & { resolution_note?: string };
  created_at: string;
}
export interface CommunityMapEditorialMedia extends CommunityMapMedia {
  consent?: CommunityMapConsent | null;
  submission_id: string | null;
  feature_id: string | null;
  status: string;
  revision: number;
}
export interface CommunityMapQueueQuery {
  after?: string;
  limit?: number;
  status?: string;
}

const segment = (value: string) => encodeURIComponent(value);

/** Reusable collection APIs; use your application's normal SDK credential/context. */
export class CommunityMapsService extends ServiceModule {
  protected basePath = '/v1/knowledge/community-maps';
  readonly editorial: CommunityMapsEditorialService;
  readonly geography: CommunityMapsGeographyService;
  constructor(client: ScaleMuleClient) {
    super(client);
    this.editorial = new CommunityMapsEditorialService(client);
    this.geography = new CommunityMapsGeographyService(client);
  }
  listCollections(
    query: CommunityMapQueueQuery = {},
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapPage<CommunityMapCollection>>> {
    return this._get(this.withQuery('/collections', { ...query }), options);
  }
  getCollection(slug: string, options?: RequestOptions): Promise<ApiResponse<CommunityMapCollection>> {
    return this._get('/collections/' + segment(slug), options);
  }
  listFeatures(
    slug: string,
    query: CommunityMapFeatureQuery = {},
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapPage<CommunityMapFeature>>> {
    return this._get(this.withQuery('/collections/' + segment(slug) + '/features', { ...query }), options);
  }
  getFeature(slug: string, id: string, options?: RequestOptions): Promise<ApiResponse<CommunityMapFeature>> {
    return this._get('/collections/' + segment(slug) + '/features/' + segment(id), options);
  }
  createSubmission(
    slug: string,
    data: CommunityMapSubmissionInput,
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapReceipt>> {
    return this.post('/collections/' + segment(slug) + '/submissions', data, options);
  }
  uploadMedia(
    slug: string,
    submission: string,
    file: File | Blob,
    fields: { caption: string; attribution: string; rights_confirmed: boolean; consent_version: string },
    options?: RequestOptions
  ): Promise<ApiResponse<{ id: string; status: string }>> {
    return this._upload(
      '/collections/' + segment(slug) + '/submissions/' + segment(submission) + '/media',
      file,
      {
        caption: fields.caption,
        attribution: fields.attribution,
        rights_confirmed: String(fields.rights_confirmed),
        consent_version: fields.consent_version
      },
      options
    );
  }
  /** @deprecated Use uploadMedia for photos, video and audio. Explicit publication permission is required. */
  uploadPhoto(
    slug: string,
    submission: string,
    file: File | Blob,
    fields: { caption: string; attribution: string; rights_confirmed: boolean; consent_version?: string },
    options?: RequestOptions
  ): Promise<ApiResponse<{ id: string; status: string }>> {
    return this.uploadMedia(
      slug,
      submission,
      file,
      { ...fields, consent_version: fields.consent_version || '' },
      options
    );
  }
  react(
    slug: string,
    feature: string,
    reaction: string,
    active = true,
    options?: RequestOptions
  ): Promise<ApiResponse<{ reaction: string; active: boolean; count: number }>> {
    return this.post(
      '/collections/' + segment(slug) + '/features/' + segment(feature) + '/reactions',
      { reaction, active },
      options
    );
  }
  report(
    slug: string,
    feature: string,
    data: CommunityMapReportInput,
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapReceipt>> {
    return this.post('/collections/' + segment(slug) + '/features/' + segment(feature) + '/reports', data, options);
  }
  /** Proxy this path through your server; never append a secret API key to an image URL. */
  mediaPath(slug: string, media: string): string {
    return this.basePath + '/collections/' + segment(slug) + '/media/' + segment(media);
  }
}

/** Editorial identity is required. Selecting a scope never grants permission. */
export class CommunityMapsEditorialService extends ServiceModule {
  protected basePath = '/v1/knowledge/community-maps/manage';
  constructor(
    client: ScaleMuleClient,
    private readonly applicationId?: string
  ) {
    super(client);
  }
  forApplication(id: string): CommunityMapsEditorialService {
    return new CommunityMapsEditorialService(this.client, id);
  }
  private path(path: string, query: Record<string, unknown> = {}): string {
    return this.withQuery(path, { ...query, ...(this.applicationId ? { application_id: this.applicationId } : {}) });
  }
  listCollections(
    query: CommunityMapQueueQuery = {},
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapPage<CommunityMapEditorialCollection>>> {
    return this._get(this.path('/collections', { ...query }), options);
  }
  getCollection(id: string, options?: RequestOptions): Promise<ApiResponse<CommunityMapEditorialCollection>> {
    return this._get(this.path('/collections/' + segment(id)), options);
  }
  createCollection(
    data: { slug: string; publication_id?: string | null; config: CommunityMapCollectionConfig; area_ids: string[] },
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapRevision>> {
    return this.post(this.path('/collections'), data, options);
  }
  updateCollection(
    id: string,
    data: {
      expected_revision: number;
      config: CommunityMapCollectionConfig;
      status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    },
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapRevision>> {
    return this.put(this.path('/collections/' + segment(id)), data, options);
  }
  listFeatures(
    collection: string,
    query: CommunityMapQueueQuery = {},
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapPage<CommunityMapEditorialFeature>>> {
    return this._get(this.path('/collections/' + segment(collection) + '/features', { ...query }), options);
  }
  getFeature(
    collection: string,
    id: string,
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapEditorialFeature>> {
    return this._get(this.path('/collections/' + segment(collection) + '/features/' + segment(id)), options);
  }
  createFeature(
    collection: string,
    data: CommunityMapFeatureDraft,
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapRevision>> {
    return this.post(this.path('/collections/' + segment(collection) + '/features'), data, options);
  }
  updateFeature(
    collection: string,
    id: string,
    data: CommunityMapFeatureDraft & { expected_revision: number },
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapRevision>> {
    return this.put(this.path('/collections/' + segment(collection) + '/features/' + segment(id)), data, options);
  }
  featureCommand(
    collection: string,
    id: string,
    data: {
      expected_revision: number;
      action: 'approve' | 'publish' | 'unpublish' | 'archive' | 'remove' | 'merge';
      public_location_reviewed?: boolean;
      merge_into?: string;
    },
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapRevision>> {
    return this.post(
      this.path('/collections/' + segment(collection) + '/features/' + segment(id) + '/commands'),
      data,
      options
    );
  }
  listSubmissions(
    collection: string,
    query: CommunityMapQueueQuery = {},
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapPage<CommunityMapPrivateSubmission>>> {
    return this._get(this.path('/collections/' + segment(collection) + '/submissions', { ...query }), options);
  }
  reviewSubmission(
    collection: string,
    id: string,
    data: {
      expected_revision: number;
      status: Exclude<CommunityMapSubmissionStatus, 'PUBLISHED'>;
      feature_id?: string;
      note?: string;
    },
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapRevision>> {
    return this.post(
      this.path('/collections/' + segment(collection) + '/submissions/' + segment(id) + '/commands'),
      data,
      options
    );
  }
  duplicates(
    collection: string,
    submission: string,
    options?: RequestOptions
  ): Promise<
    ApiResponse<{
      items: { id: string; content: CommunityMapPublicContent; reasons: string[] }[];
      automatic_merge: false;
    }>
  > {
    return this._get(
      this.path('/collections/' + segment(collection) + '/submissions/' + segment(submission) + '/duplicates'),
      options
    );
  }
  listReports(
    collection: string,
    query: CommunityMapQueueQuery = {},
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapPage<CommunityMapPrivateReport>>> {
    return this._get(this.path('/collections/' + segment(collection) + '/reports', { ...query }), options);
  }
  reviewReport(
    collection: string,
    id: string,
    data: { expected_revision: number; status: 'REVIEWING' | 'RESOLVED' | 'REJECTED'; note: string },
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapRevision>> {
    return this.post(
      this.path('/collections/' + segment(collection) + '/reports/' + segment(id) + '/commands'),
      data,
      options
    );
  }
  listMedia(
    collection: string,
    query: CommunityMapQueueQuery = {},
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapPage<CommunityMapEditorialMedia>>> {
    return this._get(this.path('/collections/' + segment(collection) + '/media', { ...query }), options);
  }
  reviewMedia(
    collection: string,
    id: string,
    data: {
      expected_revision: number;
      status: 'APPROVED' | 'PUBLISHED' | 'REJECTED' | 'REMOVED';
      guidelines_reviewed?: boolean;
      feature_id?: string | null;
      caption: string;
      attribution: string;
    },
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapRevision>> {
    return this.put(this.path('/collections/' + segment(collection) + '/media/' + segment(id)), data, options);
  }
  inviteView(
    collection: string,
    data: {
      recipient_application_id: string;
      publication_id?: string | null;
      slug: string;
      allow_submissions: boolean;
    },
    options?: RequestOptions
  ): Promise<ApiResponse<{ id: string; enabled: boolean; revision: number }>> {
    return this.post(this.path('/collections/' + segment(collection) + '/views'), data, options);
  }
  listViews(
    query: CommunityMapQueueQuery = {},
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapPage<CommunityMapView>>> {
    return this._get(this.path('/views', { ...query }), options);
  }
  acceptView(
    id: string,
    data: { expected_revision: number; enabled: boolean },
    options?: RequestOptions
  ): Promise<ApiResponse<{ id: string; revision: number; enabled: boolean }>> {
    return this.put(this.path('/views/' + segment(id)), data, options);
  }
  revokeView(collection: string, view: string, options?: RequestOptions): Promise<ApiResponse<{ revoked: boolean }>> {
    return this.del(this.path('/collections/' + segment(collection) + '/views/' + segment(view)), options);
  }
  getCoverage(
    publication: string,
    options?: RequestOptions
  ): Promise<ApiResponse<{ publication_id: string; area_ids: string[]; revision: number }>> {
    return this._get(this.path('/coverage/' + segment(publication)), options);
  }
  setCoverage(
    publication: string,
    areaIds: string[],
    expectedRevision: number,
    options?: RequestOptions
  ): Promise<ApiResponse<{ publication_id: string; area_ids: string[] }>> {
    return this.put(
      this.path('/coverage/' + segment(publication)),
      { area_ids: areaIds, expected_revision: expectedRevision },
      options
    );
  }
}

export interface CommunityMapCanonicalArea extends CommunityMapArea {
  source_key: string;
  provenance: CommunityMapSource;
  revision: number;
}
/** Platform administrators maintain shared canonical references. Public areas are in getCollection(). */
export class CommunityMapsGeographyService extends ServiceModule {
  protected basePath = '/v1/knowledge/community-maps/admin/geography';
  list(
    query: { q?: string; after?: string; limit?: number } = {},
    options?: RequestOptions
  ): Promise<ApiResponse<CommunityMapPage<CommunityMapCanonicalArea>>> {
    return this._get(this.withQuery('', { ...query }), options);
  }
  save(
    data: Omit<CommunityMapCanonicalArea, 'id' | 'revision'> & {
      expected_revision?: number;
      relationships?: { related_area_id: string; relationship: 'WITHIN' | 'REGION_MEMBER' | 'AFFILIATED' }[];
    },
    options?: RequestOptions
  ): Promise<ApiResponse<{ id: string; revision: number }>> {
    return this.post('', data, options);
  }
  referencePlaces(
    query: { q: string; region: string },
    options?: RequestOptions
  ): Promise<
    ApiResponse<{
      items: {
        country: string;
        geoid: string;
        region: string;
        name: string;
        lsad: string;
        latitude: number;
        longitude: number;
      }[];
    }>
  > {
    return this._get(this.withQuery('/reference-places', query), options);
  }
}
