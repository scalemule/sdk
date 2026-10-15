/**
 * Experiments (A/B tests) on top of scalemule-flags variants.
 *
 * Convention shared by every ScaleMule client and the analytics service:
 * - An experiment is a flag with two or more weighted variants. Evaluating it with a stable
 *   identifier (`session_id` or `user_id`) yields the visitor's `variant_key`.
 * - Every analytics event sent while a visitor is in an experiment carries
 *   `properties.experiments = { "<flag_key>": "<variant_key>" }`.
 * - `experiment_exposed` is tracked once per visitor and flag when the variant is first shown.
 * - The analytics service reports per-variant results from those properties
 *   (`GET /v1/analytics/admin/experiments/{flag_key}`), so any tracked event can be the goal.
 */

export const EXPERIMENTS_PROPERTY = 'experiments';
export const EXPERIMENT_EXPOSED_EVENT = 'experiment_exposed';
export const MAX_EXPERIMENTS_PER_EVENT = 10;

const KEY_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const VARIANT_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,63}$/;

/** Active assignments for one visitor: flag key → variant key. */
export type ExperimentAssignments = Record<string, string>;

export interface ExperimentAssignment<T = unknown> {
  flag_key: string;
  /** The variant the visitor is in, or null when the flag is off, missing or has no variants. */
  variant: string | null;
  /** The raw flag evaluation this assignment came from, when one was made. */
  evaluation?: ExperimentEvaluationLike<T> | null;
}

/** The subset of a flag evaluation the experiment helpers read. */
export interface ExperimentEvaluationLike<T = unknown> {
  flag_key?: string;
  value?: T;
  reason?: string;
  variant_key?: string | null;
}

export function isExperimentKey(value: unknown): value is string {
  return typeof value === 'string' && KEY_PATTERN.test(value);
}

export function isVariantKey(value: unknown): value is string {
  return typeof value === 'string' && VARIANT_PATTERN.test(value);
}

/**
 * The variant a flag evaluation puts the visitor in.
 * Weighted variants report `variant_key`; a rule or default that serves a string value counts as
 * that variant (so a rule can pin everyone to "modern" and the report still groups them).
 */
export function experimentVariant(evaluation: ExperimentEvaluationLike | null | undefined): string | null {
  if (!evaluation) return null;
  if (isVariantKey(evaluation.variant_key)) return evaluation.variant_key;
  if (isVariantKey(evaluation.value)) return evaluation.value;
  return null;
}

/** Keeps only well-formed `{ flag_key: variant_key }` pairs, at most MAX_EXPERIMENTS_PER_EVENT. */
export function normalizeExperiments(input: unknown): ExperimentAssignments {
  const result: ExperimentAssignments = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
  let count = 0;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (count >= MAX_EXPERIMENTS_PER_EVENT) break;
    if (isExperimentKey(key) && isVariantKey(value)) {
      result[key] = value;
      count++;
    }
  }
  return result;
}

/** Merges the visitor's assignments into event properties under `experiments`. Empty assignments add nothing. */
export function withExperiments(
  properties: Record<string, unknown> | undefined,
  experiments: ExperimentAssignments | undefined
): Record<string, unknown> | undefined {
  const normalized = normalizeExperiments({
    ...normalizeExperiments(properties?.[EXPERIMENTS_PROPERTY]),
    ...(experiments ?? {})
  });
  if (Object.keys(normalized).length === 0) return properties;
  return { ...(properties ?? {}), [EXPERIMENTS_PROPERTY]: normalized };
}

/** The `experiment_exposed` event for one assignment. */
export function exposureEvent(
  flagKey: string,
  variant: string
): { event_name: string; event_category: string; properties: Record<string, unknown> } {
  if (!isExperimentKey(flagKey)) throw new Error(`Invalid experiment flag key: ${flagKey}`);
  if (!isVariantKey(variant)) throw new Error(`Invalid experiment variant: ${variant}`);
  return {
    event_name: EXPERIMENT_EXPOSED_EVENT,
    event_category: 'system',
    properties: { flag_key: flagKey, variant, [EXPERIMENTS_PROPERTY]: { [flagKey]: variant } }
  };
}

/** Key under which a client remembers that an exposure was already sent this session. */
export function exposureStorageKey(flagKey: string): string {
  return `sm_experiment_exposed:${flagKey}`;
}
