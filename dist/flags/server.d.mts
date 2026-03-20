/** Wire format types matching the Rust FlagConfigWire from /v1/flags/config */
interface FlagConfigWire {
    version: number;
    rollout_salt: string;
    environment: string;
    segments: SegmentWire[];
    flags: FlagWire[];
}
interface SegmentWire {
    id: string;
    segment_key: string;
    conditions: Condition[];
    included_users: string[];
    excluded_users: string[];
}
interface FlagWire {
    flag_key: string;
    flag_id: string;
    flag_type: string;
    status: string;
    default_value: unknown;
    environment_enabled: boolean;
    environment_default_value: unknown | null;
    rules: RuleWire[];
    variants: VariantWire[];
}
interface RuleWire {
    id: string;
    priority: number;
    conditions: Condition[];
    segment_ids: string[];
    serve_value: unknown;
    rollout_percentage: number | null;
    enabled: boolean;
}
interface VariantWire {
    variant_key: string;
    value: unknown;
    weight: number;
}
interface Condition {
    attribute: string;
    operator: string;
    value?: unknown;
    values?: unknown[];
}
interface EvaluationContext {
    user_id?: string;
    email?: string;
    session_id?: string;
    ip_address?: string;
    user_agent?: string;
    timestamp?: string;
    [key: string]: unknown;
}
interface FlagEvaluation {
    flag_id: string;
    flag_key: string;
    environment: string;
    value: unknown;
    reason: string;
    matched_rule_id: string | null;
    variant_key: string | null;
    bucket: number | null;
}

/**
 * FlagClient — server-side flag evaluation with local caching + SSE push updates.
 * Long-lived Node.js processes only (not browser, not edge).
 */

interface FlagClientOptions {
    apiKey: string;
    environment: string;
    gatewayUrl: string;
}
declare class FlagClient {
    private apiKey;
    private environment;
    private gatewayUrl;
    private config;
    private flagIndex;
    private segmentIndex;
    private lastETag;
    private streamState;
    private pollTimer;
    private reconnectTimer;
    private telemetryTimer;
    private abortController;
    private initPromise;
    private telemetryCounters;
    private isShuttingDown;
    private streamConnectInFlight;
    constructor(options: FlagClientOptions);
    init(): Promise<void>;
    private doInit;
    private buildIndexes;
    evaluate(flagKey: string, context: EvaluationContext): FlagEvaluation;
    evaluateBatch(flagKeys: string[], context: EvaluationContext): Record<string, FlagEvaluation>;
    shutdown(): Promise<void>;
    private connectStream;
    private handleSseFrame;
    private startPolling;
    private stopPolling;
    private pollConfig;
    private recordTelemetry;
    private startTelemetryFlush;
    private flushTelemetry;
}

/**
 * Local flag evaluation engine — 1:1 port of Rust evaluator.rs
 * Produces identical results to the server-side evaluation.
 */

declare function evaluateFlag(flag: FlagWire, config: FlagConfigWire, context: EvaluationContext, segmentIndex?: Map<string, SegmentWire>): FlagEvaluation;

/**
 * Hash-to-bucket matching Rust: SHA256(salt.flag_key.identifier) → first 4 bytes → u32 BE → mod 10_000
 * Synchronous node:crypto — matches Rust evaluation exactly.
 */
declare function hashToBucket(flagKey: string, identifier: string, salt: string): number;

declare function allConditionsMatch(conditions: Condition[], context: EvaluationContext): boolean;

export { type Condition, type EvaluationContext, FlagClient, type FlagClientOptions, type FlagConfigWire, type FlagEvaluation, type FlagWire, type RuleWire, type SegmentWire, type VariantWire, allConditionsMatch, evaluateFlag, hashToBucket };
