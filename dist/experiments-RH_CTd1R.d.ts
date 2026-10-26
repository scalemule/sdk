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
declare const EXPERIMENTS_PROPERTY = "experiments";
declare const EXPERIMENT_EXPOSED_EVENT = "experiment_exposed";
declare const MAX_EXPERIMENTS_PER_EVENT = 10;
/** Active assignments for one visitor: flag key → variant key. */
type ExperimentAssignments = Record<string, string>;
interface ExperimentAssignment<T = unknown> {
    flag_key: string;
    /** The variant the visitor is in, or null when the flag is off, missing or has no variants. */
    variant: string | null;
    /** The raw flag evaluation this assignment came from, when one was made. */
    evaluation?: ExperimentEvaluationLike<T> | null;
}
/** The subset of a flag evaluation the experiment helpers read. */
interface ExperimentEvaluationLike<T = unknown> {
    flag_key?: string;
    value?: T;
    reason?: string;
    variant_key?: string | null;
}
declare function isExperimentKey(value: unknown): value is string;
declare function isVariantKey(value: unknown): value is string;
/**
 * The variant a flag evaluation puts the visitor in.
 * Weighted variants report `variant_key`; a rule or default that serves a string value counts as
 * that variant (so a rule can pin everyone to "modern" and the report still groups them).
 */
declare function experimentVariant(evaluation: ExperimentEvaluationLike | null | undefined): string | null;
/** Keeps only well-formed `{ flag_key: variant_key }` pairs, at most MAX_EXPERIMENTS_PER_EVENT. */
declare function normalizeExperiments(input: unknown): ExperimentAssignments;
/** Merges the visitor's assignments into event properties under `experiments`. Empty assignments add nothing. */
declare function withExperiments(properties: Record<string, unknown> | undefined, experiments: ExperimentAssignments | undefined): Record<string, unknown> | undefined;
/** The `experiment_exposed` event for one assignment. */
declare function exposureEvent(flagKey: string, variant: string): {
    event_name: string;
    event_category: string;
    properties: Record<string, unknown>;
};
/** Key under which a client remembers that an exposure was already sent this session. */
declare function exposureStorageKey(flagKey: string): string;

export { type ExperimentAssignment as E, MAX_EXPERIMENTS_PER_EVENT as M, EXPERIMENTS_PROPERTY as a, EXPERIMENT_EXPOSED_EVENT as b, type ExperimentAssignments as c, type ExperimentEvaluationLike as d, experimentVariant as e, exposureEvent as f, exposureStorageKey as g, isVariantKey as h, isExperimentKey as i, normalizeExperiments as n, withExperiments as w };
