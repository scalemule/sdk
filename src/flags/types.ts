/** Wire format types matching the Rust FlagConfigWire from /v1/flags/config */

export interface FlagConfigWire {
  version: number;
  rollout_salt: string;
  environment: string;
  segments: SegmentWire[];
  flags: FlagWire[];
}

export interface SegmentWire {
  id: string;
  segment_key: string;
  conditions: Condition[];
  included_users: string[];
  excluded_users: string[];
}

export interface FlagWire {
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

export interface RuleWire {
  id: string;
  priority: number;
  conditions: Condition[];
  segment_ids: string[];
  serve_value: unknown;
  rollout_percentage: number | null;
  enabled: boolean;
}

export interface VariantWire {
  variant_key: string;
  value: unknown;
  weight: number;
}

export interface Condition {
  attribute: string;
  operator: string;
  value?: unknown;
  values?: unknown[];
}

export interface EvaluationContext {
  user_id?: string;
  email?: string;
  session_id?: string;
  ip_address?: string;
  user_agent?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface FlagEvaluation {
  flag_id: string;
  flag_key: string;
  environment: string;
  value: unknown;
  reason: string;
  matched_rule_id: string | null;
  variant_key: string | null;
  bucket: number | null;
}
