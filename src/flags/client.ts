/**
 * FlagClient — server-side flag evaluation with local caching + SSE push updates.
 * Long-lived Node.js processes only (not browser, not edge).
 */

import { evaluateFlag } from './evaluator';
import type { FlagConfigWire, FlagWire, SegmentWire, EvaluationContext, FlagEvaluation } from './types';

export interface FlagClientOptions {
  apiKey: string;
  environment: string;
  gatewayUrl: string;
}

type StreamState = 'idle' | 'streaming' | 'polling';

interface TelemetryCounter {
  flag_key: string;
  flag_id: string;
  reason: string;
  count: number;
  true_count: number;
  false_count: number;
}

export class FlagClient {
  private apiKey: string;
  private environment: string;
  private gatewayUrl: string;
  private config: FlagConfigWire | null = null;
  private flagIndex: Map<string, FlagWire> = new Map();
  private segmentIndex: Map<string, SegmentWire> = new Map();
  private lastETag: string = '';
  private streamState: StreamState = 'idle';
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private telemetryTimer: ReturnType<typeof setInterval> | null = null;
  private abortController: AbortController | null = null;
  private initPromise: Promise<void> | null = null;
  private telemetryCounters: Map<string, TelemetryCounter> = new Map();
  private isShuttingDown = false;
  private streamConnectInFlight = false;

  constructor(options: FlagClientOptions) {
    this.apiKey = options.apiKey;
    this.environment = options.environment;
    this.gatewayUrl = options.gatewayUrl;
  }

  async init(): Promise<void> {
    this.isShuttingDown = false;
    if (this.config) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async doInit(): Promise<void> {
    // Single attempt — fail fast, let caller (bootstrap-flags) fall back to legacy API.
    // Recovery happens via the 60s polling fallback after construction.
    const resp = await fetch(`${this.gatewayUrl}/v1/flags/config?environment=${encodeURIComponent(this.environment)}`, {
      headers: { 'x-api-key': this.apiKey }
    });
    if (resp.status === 403) throw new Error('Secret API key required for /config');
    if (!resp.ok) throw new Error(`Config fetch failed: ${resp.status}`);
    const json = await resp.json();
    this.config = json.data as FlagConfigWire;
    this.buildIndexes();
    this.lastETag = resp.headers.get('etag') || '';
    this.connectStream(); // fire-and-forget
    this.startTelemetryFlush();
  }

  private buildIndexes(): void {
    this.flagIndex.clear();
    this.segmentIndex.clear();
    if (!this.config) return;
    for (const flag of this.config.flags) {
      this.flagIndex.set(flag.flag_key, flag);
    }
    for (const segment of this.config.segments) {
      this.segmentIndex.set(segment.id, segment);
    }
  }

  evaluate(flagKey: string, context: EvaluationContext): FlagEvaluation {
    if (!this.config) throw new Error('FlagClient not initialized — call init() first');
    const flagConfig = this.flagIndex.get(flagKey);
    if (!flagConfig) {
      return {
        flag_id: '',
        flag_key: flagKey,
        environment: this.environment,
        value: null,
        reason: 'not_found',
        matched_rule_id: null,
        variant_key: null,
        bucket: null
      };
    }
    const result = evaluateFlag(flagConfig, this.config, context, this.segmentIndex);
    this.recordTelemetry(result);
    return result;
  }

  evaluateBatch(flagKeys: string[], context: EvaluationContext): Record<string, FlagEvaluation> {
    if (!this.config) throw new Error('FlagClient not initialized — call init() first');
    const results: Record<string, FlagEvaluation> = {};
    for (const key of flagKeys) {
      const flagConfig = this.flagIndex.get(key);
      if (flagConfig) {
        const result = evaluateFlag(flagConfig, this.config, context, this.segmentIndex);
        this.recordTelemetry(result);
        results[key] = result;
      }
    }
    return results;
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.streamState = 'idle';
    this.abortController?.abort();
    this.abortController = null;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.telemetryTimer) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
    await this.flushTelemetry();
  }

  // ======== SSE Streaming ========

  private async connectStream(): Promise<void> {
    if (this.isShuttingDown || this.streamState === 'streaming' || this.streamConnectInFlight) return;
    this.streamConnectInFlight = true;
    this.abortController?.abort();
    const abortController = new AbortController();
    this.abortController = abortController;
    const shouldResumePolling = this.streamState !== 'polling';
    let startPolling = shouldResumePolling;

    try {
      const resp = await fetch(
        `${this.gatewayUrl}/v1/flags/stream?environment=${encodeURIComponent(this.environment)}`,
        {
          headers: {
            'x-api-key': this.apiKey,
            'Last-Event-ID': String(this.config?.version ?? 0)
          },
          signal: abortController.signal
        }
      );

      if (resp.ok && resp.body) {
        this.streamState = 'streaming';
        this.stopPolling();
        startPolling = false;
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Parse SSE frames: split on double newlines
          let idx: number;
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            this.handleSseFrame(frame);
          }
        }

        if (this.streamState === 'streaming') {
          this.streamState = 'idle';
          startPolling = true;
        }
      }
    } catch {
      startPolling = !abortController.signal.aborted && shouldResumePolling;
    } finally {
      this.streamConnectInFlight = false;
    }

    if (!this.isShuttingDown && startPolling) {
      this.startPolling();
    }
  }

  private handleSseFrame(frame: string): void {
    let eventType = '';
    let data = '';

    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) eventType = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
      // Ignore comments (lines starting with ':')
    }

    if (eventType === 'config' && data) {
      try {
        const parsed = JSON.parse(data);
        const newConfig = parsed.data as FlagConfigWire;
        if (newConfig && newConfig.version !== undefined) {
          this.config = newConfig;
          this.buildIndexes();
        }
      } catch {
        // Ignore malformed events
      }
    }
  }

  // ======== Polling Fallback ========

  private startPolling(): void {
    if (this.streamState === 'polling') return;
    this.streamState = 'polling';

    this.pollTimer = setInterval(() => void this.pollConfig(), 60_000);

    // Try SSE reconnect every 5 minutes
    this.reconnectTimer = setInterval(() => void this.connectStream(), 300_000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async pollConfig(): Promise<void> {
    try {
      const headers: Record<string, string> = { 'x-api-key': this.apiKey };
      if (this.lastETag) headers['if-none-match'] = this.lastETag;

      const resp = await fetch(
        `${this.gatewayUrl}/v1/flags/config?environment=${encodeURIComponent(this.environment)}`,
        { headers }
      );

      if (resp.status === 304) return; // No change
      if (!resp.ok) return; // Retry next interval

      const json = await resp.json();
      this.config = json.data as FlagConfigWire;
      this.buildIndexes();
      this.lastETag = resp.headers.get('etag') || '';
    } catch {
      // Retry next interval
    }
  }

  // ======== Telemetry ========

  private recordTelemetry(evaluation: FlagEvaluation): void {
    const key = `${evaluation.flag_key}:${evaluation.reason}:${String(evaluation.value)}`;
    const existing = this.telemetryCounters.get(key);
    if (existing) {
      existing.count++;
      if (evaluation.value === true) existing.true_count++;
      else if (evaluation.value === false) existing.false_count++;
    } else {
      this.telemetryCounters.set(key, {
        flag_key: evaluation.flag_key,
        flag_id: evaluation.flag_id,
        reason: evaluation.reason,
        count: 1,
        true_count: evaluation.value === true ? 1 : 0,
        false_count: evaluation.value === false ? 1 : 0
      });
    }
  }

  private startTelemetryFlush(): void {
    this.telemetryTimer = setInterval(() => void this.flushTelemetry(), 60_000);
  }

  private async flushTelemetry(): Promise<void> {
    if (this.telemetryCounters.size === 0) return;

    const evaluations = Array.from(this.telemetryCounters.values());
    this.telemetryCounters.clear();

    try {
      await fetch(`${this.gatewayUrl}/v1/flags/telemetry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey
        },
        body: JSON.stringify({
          environment: this.environment,
          evaluations
        })
      });
    } catch {
      // Re-add counters on failure (best-effort)
      for (const counter of evaluations) {
        const key = `${counter.flag_key}:${counter.reason}:${counter.count}`;
        const existing = this.telemetryCounters.get(key);
        if (existing) {
          existing.count += counter.count;
          existing.true_count += counter.true_count;
          existing.false_count += counter.false_count;
        } else {
          this.telemetryCounters.set(key, counter);
        }
      }
    }
  }
}
