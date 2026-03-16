import type { Condition, EvaluationContext } from './types';
import { parse as semverParse, compare as semverCompare } from 'semver';

export function allConditionsMatch(conditions: Condition[], context: EvaluationContext): boolean {
  return conditions.every((c) => conditionMatches(c, context));
}

function conditionMatches(condition: Condition, context: EvaluationContext): boolean {
  const attributeValue = getAttribute(context, condition.attribute);
  const op = condition.operator;

  if (op === 'exists') return attributeValue !== undefined && attributeValue !== null;
  if (op === 'not_exists') return attributeValue === undefined || attributeValue === null;

  if (attributeValue === undefined || attributeValue === null) return false;

  switch (op) {
    case 'eq':
      return compareValues(attributeValue, condition.value) === 0;
    case 'neq':
      return compareValues(attributeValue, condition.value) !== 0;
    case 'in':
      return candidateValues(condition).some((v) => compareValues(attributeValue, v) === 0);
    case 'not_in':
      return !candidateValues(condition).some((v) => compareValues(attributeValue, v) === 0);
    case 'contains':
      return containsValue(attributeValue, condition.value);
    case 'starts_with':
      return typeof attributeValue === 'string' && typeof condition.value === 'string'
        ? attributeValue.startsWith(condition.value)
        : false;
    case 'ends_with':
      return typeof attributeValue === 'string' && typeof condition.value === 'string'
        ? attributeValue.endsWith(condition.value)
        : false;
    case 'gt':
      return compareValues(attributeValue, condition.value) === 1;
    case 'gte': {
      const cmp = compareValues(attributeValue, condition.value);
      return cmp === 1 || cmp === 0;
    }
    case 'lt':
      return compareValues(attributeValue, condition.value) === -1;
    case 'lte': {
      const cmp = compareValues(attributeValue, condition.value);
      return cmp === -1 || cmp === 0;
    }
    case 'regex': {
      if (typeof attributeValue !== 'string' || typeof condition.value !== 'string') return false;
      try {
        return new RegExp(condition.value).test(attributeValue);
      } catch {
        return false;
      }
    }
    case 'semver_eq':
      return semverCmp(attributeValue, condition.value) === 0;
    case 'semver_neq':
      return semverCmp(attributeValue, condition.value) !== 0;
    case 'semver_gt':
      return semverCmp(attributeValue, condition.value) === 1;
    case 'semver_gte': {
      const cmp = semverCmp(attributeValue, condition.value);
      return cmp === 1 || cmp === 0;
    }
    case 'semver_lt':
      return semverCmp(attributeValue, condition.value) === -1;
    case 'semver_lte': {
      const cmp = semverCmp(attributeValue, condition.value);
      return cmp === -1 || cmp === 0;
    }
    default:
      return false;
  }
}

function getAttribute(context: EvaluationContext, key: string): unknown {
  switch (key) {
    case 'user_id':
      return context.user_id;
    case 'email':
      return context.email;
    case 'session_id':
      return context.session_id;
    case 'ip_address':
      return context.ip_address;
    case 'user_agent':
      return context.user_agent;
    case 'timestamp':
      return context.timestamp ?? new Date().toISOString();
    default:
      return context[key];
  }
}

function candidateValues(condition: Condition): unknown[] {
  if (condition.values && condition.values.length > 0) return condition.values;
  if (condition.value === undefined || condition.value === null) return [];
  if (Array.isArray(condition.value)) return condition.value;
  return [condition.value];
}

/** Compare two values. Returns -1, 0, 1, or null if incomparable. */
function compareValues(actual: unknown, expected: unknown): number | null {
  if (expected === undefined || expected === null) return null;

  // Numeric comparison
  const numA = toNumber(actual);
  const numB = toNumber(expected);
  if (numA !== null && numB !== null) {
    if (numA < numB) return -1;
    if (numA > numB) return 1;
    return 0;
  }

  // Boolean comparison
  if (typeof actual === 'boolean' && typeof expected === 'boolean') {
    if (actual === expected) return 0;
    return actual ? 1 : -1;
  }

  // String comparison
  const strA = toString(actual);
  const strB = toString(expected);
  if (strA !== null && strB !== null) {
    if (strA < strB) return -1;
    if (strA > strB) return 1;
    return 0;
  }

  return null;
}

function containsValue(actual: unknown, expected: unknown): boolean {
  if (expected === undefined || expected === null) return false;
  if (Array.isArray(actual)) {
    return actual.some((item) => compareValues(item, expected) === 0);
  }
  if (typeof actual === 'string' && typeof expected === 'string') {
    return actual.includes(expected);
  }
  return false;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return isNaN(n) ? null : n;
  }
  return null;
}

function toString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  return null;
}

function semverCmp(actual: unknown, expected: unknown): number | null {
  if (typeof actual !== 'string' || typeof expected !== 'string') return null;
  try {
    const a = semverParse(actual);
    const b = semverParse(expected);
    if (!a || !b) return null;
    return semverCompare(a, b);
  } catch {
    return null;
  }
}
