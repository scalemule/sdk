/**
 * Local flag evaluation engine — 1:1 port of Rust evaluator.rs
 * Produces identical results to the server-side evaluation.
 */

import { hashToBucket } from './hasher';
import { allConditionsMatch } from './conditions';
import type { FlagConfigWire, FlagWire, SegmentWire, EvaluationContext, FlagEvaluation } from './types';

export function evaluateFlag(
  flag: FlagWire,
  config: FlagConfigWire,
  context: EvaluationContext,
  segmentIndex?: Map<string, SegmentWire>
): FlagEvaluation {
  const effectiveDefault = flag.environment_default_value ?? flag.default_value;

  // Check flag status
  if (flag.status !== 'active') {
    return result(flag, config.environment, effectiveDefault, 'disabled');
  }

  // Check environment enabled
  if (!flag.environment_enabled) {
    return result(flag, config.environment, effectiveDefault, 'disabled');
  }

  const bucketIdentifier = getBucketIdentifier(context);

  // Iterate enabled rules by priority (already sorted from server)
  for (const rule of flag.rules) {
    if (!rule.enabled) continue;

    // Check segment membership (if any segment_ids)
    if (rule.segment_ids.length > 0) {
      const segmentMatched = rule.segment_ids.some((segId) => {
        const segment = segmentIndex ? segmentIndex.get(segId) : config.segments.find((s) => s.id === segId);
        if (!segment) return false;
        return userMatchesSegment(segment, context);
      });
      if (!segmentMatched) continue;
    }

    // Check conditions (AND logic)
    if (!allConditionsMatch(rule.conditions, context)) continue;

    // Check rollout percentage
    if (rule.rollout_percentage !== null && rule.rollout_percentage !== undefined) {
      const bucket = hashToBucket(flag.flag_key, bucketIdentifier, config.rollout_salt);
      if (bucket >= rule.rollout_percentage) continue;

      return {
        flag_id: flag.flag_id,
        flag_key: flag.flag_key,
        environment: config.environment,
        value: rule.serve_value,
        reason: 'rule_match',
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
      reason: 'rule_match',
      matched_rule_id: rule.id,
      variant_key: null,
      bucket: null
    };
  }

  // Variant selection (weighted bucketing)
  if (flag.variants.length > 0) {
    const totalWeight = flag.variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight > 0) {
      const bucket = hashToBucket(flag.flag_key, bucketIdentifier, config.rollout_salt);
      const scaled = Math.floor((bucket * totalWeight) / 10_000);
      let cursor = 0;

      for (const variant of flag.variants) {
        cursor += variant.weight;
        if (scaled < cursor) {
          return {
            flag_id: flag.flag_id,
            flag_key: flag.flag_key,
            environment: config.environment,
            value: variant.value,
            reason: 'variant',
            matched_rule_id: null,
            variant_key: variant.variant_key,
            bucket
          };
        }
      }
    }
  }

  // Default
  return result(flag, config.environment, effectiveDefault, 'default');
}

function getBucketIdentifier(context: EvaluationContext): string {
  return context.user_id ?? context.session_id ?? context.email ?? context.ip_address ?? 'anonymous';
}

function userMatchesSegment(segment: SegmentWire, context: EvaluationContext): boolean {
  const identifiers: string[] = [context.user_id, context.email, context.session_id].filter(
    (v): v is string => v !== undefined && v !== null
  );

  // Exclusion check first
  if (identifiers.some((id) => segment.excluded_users.includes(id))) {
    return false;
  }

  // Inclusion check
  if (identifiers.some((id) => segment.included_users.includes(id))) {
    return true;
  }

  // Fall back to conditions
  return allConditionsMatch(segment.conditions, context);
}

function result(flag: FlagWire, environment: string, value: unknown, reason: string): FlagEvaluation {
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
