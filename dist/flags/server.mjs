// src/flags/hasher.ts
import { createHash } from "crypto";
function hashToBucket(flagKey, identifier, salt) {
  const hash = createHash("sha256").update(`${salt}.${flagKey}.${identifier}`).digest();
  return hash.readUInt32BE(0) % 1e4;
}

// src/flags/conditions.ts
import { parse as semverParse, compare as semverCompare } from "semver";
function allConditionsMatch(conditions, context) {
  return conditions.every((c) => conditionMatches(c, context));
}
function conditionMatches(condition, context) {
  const attributeValue = getAttribute(context, condition.attribute);
  const op = condition.operator;
  if (op === "exists") return attributeValue !== void 0 && attributeValue !== null;
  if (op === "not_exists") return attributeValue === void 0 || attributeValue === null;
  if (attributeValue === void 0 || attributeValue === null) return false;
  switch (op) {
    case "eq":
      return compareValues(attributeValue, condition.value) === 0;
    case "neq":
      return compareValues(attributeValue, condition.value) !== 0;
    case "in":
      return candidateValues(condition).some((v) => compareValues(attributeValue, v) === 0);
    case "not_in":
      return !candidateValues(condition).some((v) => compareValues(attributeValue, v) === 0);
    case "contains":
      return containsValue(attributeValue, condition.value);
    case "starts_with":
      return typeof attributeValue === "string" && typeof condition.value === "string" ? attributeValue.startsWith(condition.value) : false;
    case "ends_with":
      return typeof attributeValue === "string" && typeof condition.value === "string" ? attributeValue.endsWith(condition.value) : false;
    case "gt":
      return compareValues(attributeValue, condition.value) === 1;
    case "gte": {
      const cmp = compareValues(attributeValue, condition.value);
      return cmp === 1 || cmp === 0;
    }
    case "lt":
      return compareValues(attributeValue, condition.value) === -1;
    case "lte": {
      const cmp = compareValues(attributeValue, condition.value);
      return cmp === -1 || cmp === 0;
    }
    case "regex": {
      if (typeof attributeValue !== "string" || typeof condition.value !== "string") return false;
      try {
        return new RegExp(condition.value).test(attributeValue);
      } catch {
        return false;
      }
    }
    case "semver_eq":
      return semverCmp(attributeValue, condition.value) === 0;
    case "semver_neq":
      return semverCmp(attributeValue, condition.value) !== 0;
    case "semver_gt":
      return semverCmp(attributeValue, condition.value) === 1;
    case "semver_gte": {
      const cmp = semverCmp(attributeValue, condition.value);
      return cmp === 1 || cmp === 0;
    }
    case "semver_lt":
      return semverCmp(attributeValue, condition.value) === -1;
    case "semver_lte": {
      const cmp = semverCmp(attributeValue, condition.value);
      return cmp === -1 || cmp === 0;
    }
    default:
      return false;
  }
}
function getAttribute(context, key) {
  switch (key) {
    case "user_id":
      return context.user_id;
    case "email":
      return context.email;
    case "session_id":
      return context.session_id;
    case "ip_address":
      return context.ip_address;
    case "user_agent":
      return context.user_agent;
    case "timestamp":
      return context.timestamp ?? (/* @__PURE__ */ new Date()).toISOString();
    default:
      return context[key];
  }
}
function candidateValues(condition) {
  if (condition.values && condition.values.length > 0) return condition.values;
  if (condition.value === void 0 || condition.value === null) return [];
  if (Array.isArray(condition.value)) return condition.value;
  return [condition.value];
}
function compareValues(actual, expected) {
  if (expected === void 0 || expected === null) return null;
  const numA = toNumber(actual);
  const numB = toNumber(expected);
  if (numA !== null && numB !== null) {
    if (numA < numB) return -1;
    if (numA > numB) return 1;
    return 0;
  }
  if (typeof actual === "boolean" && typeof expected === "boolean") {
    if (actual === expected) return 0;
    return actual ? 1 : -1;
  }
  const strA = toString(actual);
  const strB = toString(expected);
  if (strA !== null && strB !== null) {
    if (strA < strB) return -1;
    if (strA > strB) return 1;
    return 0;
  }
  return null;
}
function containsValue(actual, expected) {
  if (expected === void 0 || expected === null) return false;
  if (Array.isArray(actual)) {
    return actual.some((item) => compareValues(item, expected) === 0);
  }
  if (typeof actual === "string" && typeof expected === "string") {
    return actual.includes(expected);
  }
  return false;
}
function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return isNaN(n) ? null : n;
  }
  return null;
}
function toString(value) {
  if (typeof value === "string") return value;
  return null;
}
function semverCmp(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return null;
  try {
    const a = semverParse(actual);
    const b = semverParse(expected);
    if (!a || !b) return null;
    return semverCompare(a, b);
  } catch {
    return null;
  }
}

// src/flags/evaluator.ts
function evaluateFlag(flag, config, context, segmentIndex) {
  const effectiveDefault = flag.environment_default_value ?? flag.default_value;
  if (flag.status !== "active") {
    return result(flag, config.environment, effectiveDefault, "disabled");
  }
  if (!flag.environment_enabled) {
    return result(flag, config.environment, effectiveDefault, "disabled");
  }
  const bucketIdentifier = getBucketIdentifier(context);
  for (const rule of flag.rules) {
    if (!rule.enabled) continue;
    if (rule.segment_ids.length > 0) {
      const segmentMatched = rule.segment_ids.some((segId) => {
        const segment = segmentIndex ? segmentIndex.get(segId) : config.segments.find((s) => s.id === segId);
        if (!segment) return false;
        return userMatchesSegment(segment, context);
      });
      if (!segmentMatched) continue;
    }
    if (!allConditionsMatch(rule.conditions, context)) continue;
    if (rule.rollout_percentage !== null && rule.rollout_percentage !== void 0) {
      const bucket = hashToBucket(flag.flag_key, bucketIdentifier, config.rollout_salt);
      if (bucket >= rule.rollout_percentage) continue;
      return {
        flag_id: flag.flag_id,
        flag_key: flag.flag_key,
        environment: config.environment,
        value: rule.serve_value,
        reason: "rule_match",
        matched_rule_id: rule.id,
        variant_key: null,
        bucket
      };
    }
    return {
      flag_id: flag.flag_id,
      flag_key: flag.flag_key,
      environment: config.environment,
      value: rule.serve_value,
      reason: "rule_match",
      matched_rule_id: rule.id,
      variant_key: null,
      bucket: null
    };
  }
  if (flag.variants.length > 0) {
    const totalWeight = flag.variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight > 0) {
      const bucket = hashToBucket(flag.flag_key, bucketIdentifier, config.rollout_salt);
      const scaled = Math.floor(bucket * totalWeight / 1e4);
      let cursor = 0;
      for (const variant of flag.variants) {
        cursor += variant.weight;
        if (scaled < cursor) {
          return {
            flag_id: flag.flag_id,
            flag_key: flag.flag_key,
            environment: config.environment,
            value: variant.value,
            reason: "variant",
            matched_rule_id: null,
            variant_key: variant.variant_key,
            bucket
          };
        }
      }
    }
  }
  return result(flag, config.environment, effectiveDefault, "default");
}
function getBucketIdentifier(context) {
  return context.user_id ?? context.session_id ?? context.email ?? context.ip_address ?? "anonymous";
}
function userMatchesSegment(segment, context) {
  const identifiers = [context.user_id, context.email, context.session_id].filter(
    (v) => v !== void 0 && v !== null
  );
  if (identifiers.some((id) => segment.excluded_users.includes(id))) {
    return false;
  }
  if (identifiers.some((id) => segment.included_users.includes(id))) {
    return true;
  }
  return allConditionsMatch(segment.conditions, context);
}
function result(flag, environment, value, reason) {
  return {
    flag_id: flag.flag_id,
    flag_key: flag.flag_key,
    environment,
    value,
    reason,
    matched_rule_id: null,
    variant_key: null,
    bucket: null
  };
}

// src/flags/client.ts
var FlagClient = class {
  constructor(options) {
    this.config = null;
    this.flagIndex = /* @__PURE__ */ new Map();
    this.segmentIndex = /* @__PURE__ */ new Map();
    this.lastETag = "";
    this.streamState = "idle";
    this.pollTimer = null;
    this.reconnectTimer = null;
    this.telemetryTimer = null;
    this.abortController = null;
    this.initPromise = null;
    this.telemetryCounters = /* @__PURE__ */ new Map();
    this.isShuttingDown = false;
    this.streamConnectInFlight = false;
    this.apiKey = options.apiKey;
    this.environment = options.environment;
    this.gatewayUrl = options.gatewayUrl;
  }
  async init() {
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
  async doInit() {
    const resp = await fetch(`${this.gatewayUrl}/v1/flags/config?environment=${encodeURIComponent(this.environment)}`, {
      headers: { "x-api-key": this.apiKey }
    });
    if (resp.status === 403) throw new Error("Secret API key required for /config");
    if (!resp.ok) throw new Error(`Config fetch failed: ${resp.status}`);
    const json = await resp.json();
    this.config = json.data;
    this.buildIndexes();
    this.lastETag = resp.headers.get("etag") || "";
    this.connectStream();
    this.startTelemetryFlush();
  }
  buildIndexes() {
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
  evaluate(flagKey, context) {
    if (!this.config) throw new Error("FlagClient not initialized \u2014 call init() first");
    const flagConfig = this.flagIndex.get(flagKey);
    if (!flagConfig) {
      return {
        flag_id: "",
        flag_key: flagKey,
        environment: this.environment,
        value: null,
        reason: "not_found",
        matched_rule_id: null,
        variant_key: null,
        bucket: null
      };
    }
    const result2 = evaluateFlag(flagConfig, this.config, context, this.segmentIndex);
    this.recordTelemetry(result2);
    return result2;
  }
  evaluateBatch(flagKeys, context) {
    if (!this.config) throw new Error("FlagClient not initialized \u2014 call init() first");
    const results = {};
    for (const key of flagKeys) {
      const flagConfig = this.flagIndex.get(key);
      if (flagConfig) {
        const result2 = evaluateFlag(flagConfig, this.config, context, this.segmentIndex);
        this.recordTelemetry(result2);
        results[key] = result2;
      }
    }
    return results;
  }
  async shutdown() {
    this.isShuttingDown = true;
    this.streamState = "idle";
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
  async connectStream() {
    if (this.isShuttingDown || this.streamState === "streaming" || this.streamConnectInFlight) return;
    this.streamConnectInFlight = true;
    this.abortController?.abort();
    const abortController = new AbortController();
    this.abortController = abortController;
    const shouldResumePolling = this.streamState !== "polling";
    let startPolling = shouldResumePolling;
    try {
      const resp = await fetch(
        `${this.gatewayUrl}/v1/flags/stream?environment=${encodeURIComponent(this.environment)}`,
        {
          headers: {
            "x-api-key": this.apiKey,
            "Last-Event-ID": String(this.config?.version ?? 0)
          },
          signal: abortController.signal
        }
      );
      if (resp.ok && resp.body) {
        this.streamState = "streaming";
        this.stopPolling();
        startPolling = false;
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            this.handleSseFrame(frame);
          }
        }
        if (this.streamState === "streaming") {
          this.streamState = "idle";
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
  handleSseFrame(frame) {
    let eventType = "";
    let data = "";
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) eventType = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (eventType === "config" && data) {
      try {
        const parsed = JSON.parse(data);
        const newConfig = parsed.data;
        if (newConfig && newConfig.version !== void 0) {
          this.config = newConfig;
          this.buildIndexes();
        }
      } catch {
      }
    }
  }
  // ======== Polling Fallback ========
  startPolling() {
    if (this.streamState === "polling") return;
    this.streamState = "polling";
    this.pollTimer = setInterval(() => void this.pollConfig(), 6e4);
    this.reconnectTimer = setInterval(() => void this.connectStream(), 3e5);
  }
  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
  async pollConfig() {
    try {
      const headers = { "x-api-key": this.apiKey };
      if (this.lastETag) headers["if-none-match"] = this.lastETag;
      const resp = await fetch(
        `${this.gatewayUrl}/v1/flags/config?environment=${encodeURIComponent(this.environment)}`,
        { headers }
      );
      if (resp.status === 304) return;
      if (!resp.ok) return;
      const json = await resp.json();
      this.config = json.data;
      this.buildIndexes();
      this.lastETag = resp.headers.get("etag") || "";
    } catch {
    }
  }
  // ======== Telemetry ========
  recordTelemetry(evaluation) {
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
  startTelemetryFlush() {
    this.telemetryTimer = setInterval(() => void this.flushTelemetry(), 6e4);
  }
  async flushTelemetry() {
    if (this.telemetryCounters.size === 0) return;
    const evaluations = Array.from(this.telemetryCounters.values());
    this.telemetryCounters.clear();
    try {
      await fetch(`${this.gatewayUrl}/v1/flags/telemetry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey
        },
        body: JSON.stringify({
          environment: this.environment,
          evaluations
        })
      });
    } catch {
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
};
export {
  FlagClient,
  allConditionsMatch,
  evaluateFlag,
  hashToBucket
};
