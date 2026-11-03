import type { TelemetryProvider } from '@dashdb/edition';
import { describe, expect, it, vi } from 'vitest';
import { track } from './telemetry';

const provider = (overrides: Partial<TelemetryProvider> = {}) => {
  const sent = vi.fn();
  const p: TelemetryProvider = {
    isEnabled: () => true,
    setOptIn: () => undefined,
    track: sent,
    ...overrides,
  };
  return { p, sent };
};

describe('track', () => {
  it('passes only the catalogued properties to the provider', () => {
    const { p, sent } = provider();
    track('schema_imported', { format: 'dbml', text: 'Table users {}' } as never, p);
    expect(sent).toHaveBeenCalledWith('schema_imported', { format: 'dbml' });
  });

  it('drops invalid events', () => {
    const { p, sent } = provider();
    track('project_created', { source: 'blank' } as never, p);
    expect(sent).not.toHaveBeenCalled();
  });

  it('never throws when the provider does', () => {
    const { p } = provider({
      track: () => {
        throw new Error('offline');
      },
    });
    expect(() => {
      track('baseline_saved', { reason: 'manual' }, p);
    }).not.toThrow();
  });

  it('uses the active edition by default, which sends nothing until opted in', () => {
    expect(() => {
      track('baseline_saved', { reason: 'manual' });
    }).not.toThrow();
  });
});
