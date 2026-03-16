/**
 * Server-only flag evaluation module.
 * Uses node:crypto — not safe for browser/edge.
 *
 * @example
 * ```ts
 * import { FlagClient } from '@scalemule/sdk/flags/server'
 *
 * const client = new FlagClient({ apiKey, environment: 'prod', gatewayUrl })
 * await client.init()
 *
 * const result = client.evaluate('my-feature', { user_id: '123' })
 * ```
 */
export { FlagClient } from './client';
export type { FlagClientOptions } from './client';
export { evaluateFlag } from './evaluator';
export { hashToBucket } from './hasher';
export { allConditionsMatch } from './conditions';
export type {
  FlagConfigWire,
  FlagWire,
  SegmentWire,
  RuleWire,
  VariantWire,
  Condition,
  EvaluationContext,
  FlagEvaluation
} from './types';
