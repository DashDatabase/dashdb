import { describe, expect, it } from 'vitest';
import { getPlan, PLANS } from './plans';

describe('plans', () => {
  it('lists Free, Pro, Team and Enterprise in order, with only Free available', () => {
    expect(PLANS.map((p) => p.id)).toEqual(['free', 'pro', 'team', 'enterprise']);
    expect(PLANS.filter((p) => p.available).map((p) => p.id)).toEqual(['free']);
  });

  it('keeps expand/contract migrations and the desktop app in Free', () => {
    const free = getPlan('free').features.join('\n');
    expect(free).toMatch(/expand\/contract/i);
    expect(free).toMatch(/desktop app/i);
  });

  it('builds each paid plan on the one before it', () => {
    expect(getPlan('pro').features[0]).toBe('Everything in Free');
    expect(getPlan('team').features[0]).toBe('Everything in Pro');
    expect(getPlan('enterprise').features[0]).toBe('Everything in Team');
  });

  it('throws for an unknown plan', () => {
    expect(() => getPlan('gold' as never)).toThrow('Unknown plan gold');
  });
});
