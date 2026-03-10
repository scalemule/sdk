/**
 * ScaleMule SDK for TypeScript/JavaScript
 *
 * Official SDK for ScaleMule Backend-as-a-Service (v2)
 *
 * All methods return { data, error } — never throws on API errors.
 * List methods return { data[], metadata, error } with standardized pagination.
 *
 * @packageDocumentation
 */

// Re-export core types
export type {
  ApiResponse,
  ApiError,
  PaginatedResponse,
  PaginationMetadata,
  PaginationParams,
  ScaleMuleConfig,
  StorageAdapter,
  RequestOptions,
  ClientContext,
  ErrorCode
} from './types';
export { ErrorCodes } from './types';

// Client context utilities
export { extractClientContext, buildClientContextHeaders, validateIP } from './context';
export type { IncomingRequestLike } from './context';

// Re-export core client and base class
export { ScaleMuleClient } from './client';
export { ServiceModule } from './service';
export {
  PHONE_COUNTRIES,
  normalizePhoneNumber,
  normalizeAndValidatePhone,
  composePhoneNumber,
  isValidE164Phone,
  findPhoneCountryByCode,
  findPhoneCountryByDialCode,
  detectCountryFromE164,
  countryFlag
} from './utils/phone';
export type { PhoneCountry, PhoneNormalizationResult } from './utils/phone';

// Re-export core service modules
export { AuthService } from './services/auth';
export type {
  AuthUser,
  AuthSession,
  LoginDeviceInfo,
  LoginRiskInfo,
  SessionInfo,
  DeviceInfo,
  MfaStatus,
  TotpSetup,
  BackupCodes,
  LoginHistoryEntry,
  LoginActivitySummary,
  OAuthUrl,
  OAuthProvider,
  DataExport
} from './services/auth';
export type {
  UploadOptions,
  FileInfo,
  SignedUrlResponse,
  PresignedUploadResponse,
  UploadCompleteResponse,
  CompressionConfig,
  MultipartStartResponse,
  PartUrl,
  MultipartPartUrlsResponse,
  MultipartCompleteResponse
} from './services/storage';
export { StorageService } from './services/storage';
export { UploadTelemetry, generateUploadSessionId } from './services/upload-telemetry';
export type { UploadTelemetryEvent, TelemetryPayload, UploadTelemetryConfig } from './services/upload-telemetry';
export { UploadResumeStore } from './services/upload-resume';
export type { ResumeSession, CompletedPart } from './services/upload-resume';
export { resolveStrategy, detectNetworkClass, getMeasuredBandwidthMbps } from './services/upload-strategy';
export type { UploadStrategy, NetworkClass, StrategyResult } from './services/upload-strategy';
export { createUploadPlan, calculateTotalParts, getPartRange } from './services/upload-engine';
export type { UploadEngineConfig, UploadPlan } from './services/upload-engine';
export { RealtimeService } from './services/realtime';
export type {
  ConnectionStatus,
  MessageCallback,
  StatusCallback,
  PresenceCallback,
  PresenceEvent
} from './services/realtime';
export { VideoService } from './services/video';
export type { VideoUploadOptions, VideoInfo } from './services/video';

// Re-export application service modules
export { DataService } from './services/data';
export type {
  Collection,
  Document,
  QueryFilter,
  QuerySort,
  QueryOptions,
  AggregateOptions,
  AggregateResult
} from './services/data';
export { ChatService } from './services/chat';
export type { Conversation, Participant, Attachment, ChatMessage, ReadStatus, ChatReaction } from './services/chat';
export { SocialService } from './services/social';
export type { SocialPost, Comment, FollowStatus, ActivityItem, SocialUser, Like } from './services/social';
export { BillingService } from './services/billing';
export type {
  Customer,
  Subscription,
  Invoice,
  UsageSummary,
  PaymentMethod,
  ConnectedAccount,
  AccountBalance,
  Payment,
  Refund,
  Payout,
  PayoutSchedule,
  Transaction,
  TransactionSummary,
  PaymentListParams,
  TransactionListParams,
  TransactionSummaryParams,
  Product,
  Price,
  ConnectedAccountSubscription,
  Transfer,
  ConnectedSetupIntentResponse,
  PaymentStatusResponse,
  ConnectedSubscriptionListParams
} from './services/billing';
export { AnalyticsService } from './services/analytics';
export type {
  AnalyticsEvent,
  Funnel,
  FunnelConversion,
  ActiveUsers,
  EventAggregation,
  TopEvent,
  MetricDataPoint
} from './services/analytics';
export { CommunicationService } from './services/communication';
export type { MessageStatus, PushToken } from './services/communication';
export { SchedulerService } from './services/scheduler';
export type { SchedulerJob, JobExecution, JobStats } from './services/scheduler';
export { PermissionsService } from './services/permissions';
export type { Role, PermissionCheck, Policy, PermissionMatrix, IdentityType } from './services/permissions';
export { canPerform, hasMinRoleLevel } from './services/permissions';
export { TeamsService } from './services/teams';
export type { Team, TeamMember, TeamInvitation, SsoConfig } from './services/teams';

// Re-export additional service modules
export { GraphService } from './services/graph';
export type { GraphNode, GraphEdge, TraversalResult, ShortestPathResult } from './services/graph';
export { FunctionsService } from './services/functions';
export type { ServerlessFunction, FunctionExecution, FunctionMetrics } from './services/functions';
export { ListingsService } from './services/listings';
export type { Listing } from './services/listings';
export { EventsService } from './services/events';
export type { CalendarEvent, Attendee } from './services/events';
export { LeaderboardService } from './services/leaderboard';
export type { Leaderboard, LeaderboardEntry, UserRank } from './services/leaderboard';
export { WebhooksService } from './services/webhooks';
export type { Webhook } from './services/webhooks';
export { SearchService } from './services/search';
export type { SearchResult } from './services/search';
export { PhotoService, PHOTO_BREAKPOINTS } from './services/photo';
export type { PhotoInfo, TransformResult, TransformOptions } from './services/photo';
export { QueueService } from './services/queue';
export type { QueueJob, DeadLetterJob } from './services/queue';
export { CacheService } from './services/cache';
export type { CacheEntry } from './services/cache';
export { ComplianceService } from './services/compliance';
export type { AuditLog, GdprRequest } from './services/compliance';
export { OrchestratorService } from './services/orchestrator';
export type { Workflow, WorkflowExecution } from './services/orchestrator';
export { AccountsService } from './services/accounts';
export type { Client, Application } from './services/accounts';
export { IdentityService } from './services/identity';
export type { ApiKey } from './services/identity';
export { CatalogService } from './services/catalog';
export type { CatalogEntry, ServiceHealth } from './services/catalog';
export { LoggerService } from './services/logger';
export type { LogEntry, Severity, LogInput, LogRecord, LogQueryParams, LogQueryResponse } from './services/logger';
export { FlagContentService } from './services/flagcontent';
export type { ContentFlag, FlagCheck, Appeal } from './services/flagcontent';

// Re-export agent service modules
export { AgentAuthService } from './services/agent-auth';
export type {
  AuthRegisterAgentRequest,
  AuthRegisterAgentResponse,
  SecurityLayers,
  AgentToken,
  AgentSigningKey,
  AgentProfile,
  AgentSecurityPolicy
} from './services/agent-auth';
export { AgentsService } from './services/agents';
export type {
  AgentResponse,
  RegisterAgentRequest,
  RegisterAgentResponse,
  RuntimeTemplate,
  RuntimeTemplateVersion,
  Workspace
} from './services/agents';
export { AgentProjectsService } from './services/agent-projects';
export type {
  Project,
  ProjectMember,
  Task,
  ClaimResult,
  SubmitResult,
  TaskTransition,
  TaskAttempt,
  ProjectDocument,
  Pipeline,
  PipelineVersion,
  ProjectGrant,
  GrantInfo,
  RedeemResult
} from './services/agent-projects';
export { AgentToolsService } from './services/agent-tools';
export type {
  Tool,
  ToolCapability,
  ToolIntegration,
  Credential,
  CredentialScope,
  AgentToolEntitlement,
  DataSource,
  DataAccessPolicy
} from './services/agent-tools';
export { AgentModelsService } from './services/agent-models';
export type {
  ModelProvider,
  Model,
  ModelPricing,
  ModelEntitlement,
  UsageRecord,
  UsageSummary as ModelUsageSummary,
  CostReportDay
} from './services/agent-models';
export { AgentSessionsService } from './services/agent-sessions';
export type { Session, CreateSessionResponse, SessionLog, SessionArtifact } from './services/agent-sessions';

import type { ScaleMuleConfig } from './types';
import { ScaleMuleClient } from './client';

// Core service imports
import { AuthService } from './services/auth';
import { StorageService } from './services/storage';
import { RealtimeService } from './services/realtime';
import { VideoService } from './services/video';

// Application service imports
import { DataService } from './services/data';
import { ChatService } from './services/chat';
import { SocialService } from './services/social';
import { BillingService } from './services/billing';
import { AnalyticsService } from './services/analytics';
import { CommunicationService } from './services/communication';
import { SchedulerService } from './services/scheduler';
import { PermissionsService } from './services/permissions';
import { TeamsService } from './services/teams';

// Additional service imports
import { GraphService } from './services/graph';
import { FunctionsService } from './services/functions';
import { ListingsService } from './services/listings';
import { EventsService } from './services/events';
import { LeaderboardService } from './services/leaderboard';
import { WebhooksService } from './services/webhooks';
import { SearchService } from './services/search';
import { PhotoService } from './services/photo';
import { QueueService } from './services/queue';
import { CacheService } from './services/cache';
import { ComplianceService } from './services/compliance';
import { OrchestratorService } from './services/orchestrator';
import { AccountsService } from './services/accounts';
import { IdentityService } from './services/identity';
import { CatalogService } from './services/catalog';
import { LoggerService } from './services/logger';
import { FlagContentService } from './services/flagcontent';

// Agent service imports
import { AgentAuthService } from './services/agent-auth';
import { AgentsService } from './services/agents';
import { AgentProjectsService } from './services/agent-projects';
import { AgentToolsService } from './services/agent-tools';
import { AgentModelsService } from './services/agent-models';
import { AgentSessionsService } from './services/agent-sessions';

// ============================================================================
// Main ScaleMule Class
// ============================================================================

/**
 * Main entry point for the ScaleMule SDK.
 *
 * @example
 * ```typescript
 * import { ScaleMule } from '@scalemule/sdk'
 *
 * const sm = new ScaleMule({ apiKey: 'pk_live_...' })
 * await sm.initialize()
 *
 * // Auth
 * const { data, error } = await sm.auth.signInWithOtp({ email: 'user@example.com' })
 *
 * // Data
 * const { data: doc } = await sm.data.create('todos', { title: 'Ship SDK', done: false })
 * const { data: todos } = await sm.data.query('todos', {
 *   filters: [{ operator: 'eq', field: 'done', value: false }],
 * })
 *
 * // Storage
 * const { data: file } = await sm.storage.upload(blob, { onProgress: (p) => {} })
 * const { data: url } = await sm.storage.getViewUrl(file.id)
 *
 * // Realtime
 * const unsub = sm.realtime.subscribe('chat:room-1', (msg) => console.log(msg))
 *
 * // All methods return { data, error } — never throws
 * if (error) console.error(error.code, error.message)
 * ```
 */
export class ScaleMule {
  private readonly _client: ScaleMuleClient;

  // Core services
  public readonly auth: AuthService;
  public readonly storage: StorageService;
  public readonly realtime: RealtimeService;
  public readonly video: VideoService;

  // Application services
  public readonly data: DataService;
  public readonly chat: ChatService;
  public readonly social: SocialService;
  public readonly billing: BillingService;
  public readonly analytics: AnalyticsService;
  public readonly communication: CommunicationService;
  public readonly scheduler: SchedulerService;
  public readonly permissions: PermissionsService;
  public readonly teams: TeamsService;

  // Core services
  public readonly accounts: AccountsService;
  public readonly identity: IdentityService;
  public readonly catalog: CatalogService;

  // Infrastructure services
  public readonly cache: CacheService;
  public readonly queue: QueueService;
  public readonly search: SearchService;
  public readonly logger: LoggerService;
  public readonly webhooks: WebhooksService;

  // Feature services
  public readonly leaderboard: LeaderboardService;
  public readonly listings: ListingsService;
  public readonly events: EventsService;
  public readonly graph: GraphService;
  public readonly functions: FunctionsService;

  // Media services
  public readonly photo: PhotoService;

  // Content moderation
  public readonly flagContent: FlagContentService;

  // Business services
  public readonly compliance: ComplianceService;
  public readonly orchestrator: OrchestratorService;

  // Agent services
  public readonly agentAuth: AgentAuthService;
  public readonly agents: AgentsService;
  public readonly agentProjects: AgentProjectsService;
  public readonly agentTools: AgentToolsService;
  public readonly agentModels: AgentModelsService;
  public readonly agentSessions: AgentSessionsService;

  constructor(config: ScaleMuleConfig) {
    this._client = new ScaleMuleClient(config);

    // Core services
    this.auth = new AuthService(this._client);
    this.storage = new StorageService(this._client);
    this.realtime = new RealtimeService(this._client);
    this.video = new VideoService(this._client);

    // Application services
    this.data = new DataService(this._client);
    this.chat = new ChatService(this._client);
    this.social = new SocialService(this._client);
    this.billing = new BillingService(this._client);
    this.analytics = new AnalyticsService(this._client);
    this.communication = new CommunicationService(this._client);
    this.scheduler = new SchedulerService(this._client);
    this.permissions = new PermissionsService(this._client);
    this.teams = new TeamsService(this._client);

    // Other services
    this.accounts = new AccountsService(this._client);
    this.identity = new IdentityService(this._client);
    this.catalog = new CatalogService(this._client);
    this.cache = new CacheService(this._client);
    this.queue = new QueueService(this._client);
    this.search = new SearchService(this._client);
    this.logger = new LoggerService(this._client);
    this.webhooks = new WebhooksService(this._client);
    this.leaderboard = new LeaderboardService(this._client);
    this.listings = new ListingsService(this._client);
    this.events = new EventsService(this._client);
    this.graph = new GraphService(this._client);
    this.functions = new FunctionsService(this._client);
    this.photo = new PhotoService(this._client);
    this.flagContent = new FlagContentService(this._client);
    this.compliance = new ComplianceService(this._client);
    this.orchestrator = new OrchestratorService(this._client);

    // Agent services
    this.agentAuth = new AgentAuthService(this._client);
    this.agents = new AgentsService(this._client);
    this.agentProjects = new AgentProjectsService(this._client);
    this.agentTools = new AgentToolsService(this._client);
    this.agentModels = new AgentModelsService(this._client);
    this.agentSessions = new AgentSessionsService(this._client);
  }

  /**
   * Initialize the client — loads persisted session from storage.
   * Call this once after construction, before making authenticated requests.
   */
  async initialize(): Promise<void> {
    return this._client.initialize();
  }

  /**
   * Set authentication session (token + userId).
   * Persisted to storage for cross-session continuity.
   */
  async setSession(token: string, userId: string): Promise<void> {
    return this._client.setSession(token, userId);
  }

  /** Clear the current session and remove from storage. */
  async clearSession(): Promise<void> {
    return this._client.clearSession();
  }

  /** Set access token (in-memory only, not persisted). */
  setAccessToken(token: string): void {
    this._client.setAccessToken(token);
  }

  /** Clear access token. */
  clearAccessToken(): void {
    this._client.clearAccessToken();
  }

  /** Current session token, or null. */
  getSessionToken(): string | null {
    return this._client.getSessionToken();
  }

  /** Current user ID, or null. */
  getUserId(): string | null {
    return this._client.getUserId();
  }

  /** Whether a session token is set. */
  isAuthenticated(): boolean {
    return this._client.isAuthenticated();
  }

  /** The base URL being used for API requests. */
  getBaseUrl(): string {
    return this._client.getBaseUrl();
  }

  /** Access the underlying ScaleMuleClient for advanced usage. */
  getClient(): ScaleMuleClient {
    return this._client;
  }
}

export default ScaleMule;
