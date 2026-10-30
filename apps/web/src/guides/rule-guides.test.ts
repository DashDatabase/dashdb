import { rules } from '@dashdb/core';
import { describe, expect, it } from 'vitest';
import { RULE_GUIDES, isGuideDialect } from './rule-guides';

describe('rule guides', () => {
  it('has a guide for every safety rule, and no stale ones', () => {
    expect(Object.keys(RULE_GUIDES).sort()).toEqual(rules.map((r) => r.id).sort());
  });

  it('recognises guide dialects', () => {
    expect(isGuideDialect('postgres')).toBe(true);
    expect(isGuideDialect('sqlite')).toBe(false);
  });
});
