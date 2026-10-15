import { describe, it, expect } from 'vitest';
import {
  EXPERIMENTS_PROPERTY,
  EXPERIMENT_EXPOSED_EVENT,
  experimentVariant,
  exposureEvent,
  exposureStorageKey,
  normalizeExperiments,
  withExperiments
} from './experiments';

describe('experimentVariant', () => {
  it('prefers the weighted variant key, then a string serve value, else null', () => {
    expect(experimentVariant({ variant_key: 'modern', value: 'classic' })).toBe('modern');
    expect(experimentVariant({ variant_key: null, value: 'modern', reason: 'rule_match' })).toBe('modern');
    expect(experimentVariant({ variant_key: null, value: true })).toBeNull();
    expect(experimentVariant({ variant_key: null, value: 'Not A Slug' })).toBeNull();
    expect(experimentVariant(null)).toBeNull();
    expect(experimentVariant(undefined)).toBeNull();
  });
});

describe('normalizeExperiments', () => {
  it('keeps well-formed pairs only and caps the count', () => {
    expect(normalizeExperiments({ front_page_layout: 'modern', 'Bad Key': 'x', ok: 'Bad Value', nested: { a: 1 } })).toEqual({ front_page_layout: 'modern' });
    expect(normalizeExperiments(null)).toEqual({});
    expect(normalizeExperiments(['a'])).toEqual({});
    const many = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`exp${i}`, 'a']));
    expect(Object.keys(normalizeExperiments(many))).toHaveLength(10);
  });
  it('accepts unicode-free slugs only and never throws on odd input', () => {
    expect(normalizeExperiments({ 'ж': 'a', a: 'ж' })).toEqual({});
    expect(normalizeExperiments(42)).toEqual({});
  });
});

describe('withExperiments', () => {
  it('merges assignments into properties under the convention key', () => {
    expect(withExperiments({ depth: 50 }, { front_page_layout: 'modern' })).toEqual({ depth: 50, [EXPERIMENTS_PROPERTY]: { front_page_layout: 'modern' } });
    expect(withExperiments(undefined, { a: 'b' })).toEqual({ [EXPERIMENTS_PROPERTY]: { a: 'b' } });
  });
  it('keeps experiments already on the event and leaves properties untouched when there is nothing to add', () => {
    const props = { [EXPERIMENTS_PROPERTY]: { existing: 'x' }, depth: 1 };
    expect(withExperiments(props, { added: 'y' })).toEqual({ depth: 1, [EXPERIMENTS_PROPERTY]: { existing: 'x', added: 'y' } });
    const untouched = { depth: 1 };
    expect(withExperiments(untouched, {})).toBe(untouched);
    expect(withExperiments(undefined, undefined)).toBeUndefined();
  });
});

describe('exposureEvent', () => {
  it('describes one exposure and carries the assignment for attribution', () => {
    expect(exposureEvent('front_page_layout', 'modern')).toEqual({
      event_name: EXPERIMENT_EXPOSED_EVENT,
      event_category: 'system',
      properties: { flag_key: 'front_page_layout', variant: 'modern', [EXPERIMENTS_PROPERTY]: { front_page_layout: 'modern' } }
    });
    expect(() => exposureEvent('Bad Key', 'a')).toThrow();
    expect(() => exposureEvent('ok', 'bad variant')).toThrow();
    expect(exposureStorageKey('front_page_layout')).toBe('sm_experiment_exposed:front_page_layout');
  });
});
