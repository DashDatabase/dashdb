import { describe, expect, it } from 'vitest';
import { isTelemetryEvent, sanitizeTelemetryEvent, TELEMETRY_EVENTS } from './telemetry';

describe('telemetry events', () => {
  it('lists the catalogue', () => {
    expect(TELEMETRY_EVENTS).toEqual([
      'project_created',
      'schema_imported',
      'migration_generated',
      'migration_downloaded',
      'baseline_saved',
    ]);
    expect(isTelemetryEvent('migration_generated')).toBe(true);
    expect(isTelemetryEvent('toString')).toBe(false);
  });

  it('keeps allowed choices and counts', () => {
    expect(
      sanitizeTelemetryEvent('project_created', { source: 'template', dialect: 'mysql' }),
    ).toEqual({ source: 'template', dialect: 'mysql' });
    expect(
      sanitizeTelemetryEvent('migration_generated', {
        target: 'drizzle',
        risk: 'safe',
        ops_count: 0,
      }),
    ).toEqual({ target: 'drizzle', risk: 'safe', ops_count: 0 });
    expect(
      sanitizeTelemetryEvent('migration_downloaded', { target: 'sql', bundle: 'zip' }),
    ).toEqual({
      target: 'sql',
      bundle: 'zip',
    });
    expect(sanitizeTelemetryEvent('baseline_saved', { reason: 'applied' })).toEqual({
      reason: 'applied',
    });
  });

  it('drops properties outside the catalogue: no schema content or names', () => {
    expect(
      sanitizeTelemetryEvent('schema_imported', {
        format: 'postgres',
        sql: 'CREATE TABLE customers (email text);',
        fileName: 'acme-prod.sql',
      }),
    ).toEqual({ format: 'postgres' });
  });

  it.each<[string, unknown]>([
    ['an unknown event', ['page_viewed', {}]],
    ['missing props', ['baseline_saved', null]],
    ['a missing property', ['project_created', { source: 'blank' }]],
    [
      'a value outside the choices',
      ['project_created', { source: 'Acme schema', dialect: 'mysql' }],
    ],
    ['a non-string choice', ['schema_imported', { format: 1 }]],
    ['a negative count', ['migration_generated', { target: 'sql', risk: 'safe', ops_count: -1 }]],
    [
      'a fractional count',
      ['migration_generated', { target: 'sql', risk: 'safe', ops_count: 1.5 }],
    ],
    ['a string count', ['migration_generated', { target: 'sql', risk: 'safe', ops_count: '3' }]],
  ])('rejects %s', (_name, args) => {
    const [name, props] = args as [string, unknown];
    expect(sanitizeTelemetryEvent(name, props)).toBeNull();
  });
});
