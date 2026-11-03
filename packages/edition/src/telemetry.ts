// The product telemetry events, and the only properties they may carry. Every property is a
// fixed choice or a count: never schema content, table or column names, project names, file
// names or free text. `sanitizeTelemetryEvent` enforces that at runtime, whatever the caller
// passes.
import type { IrDialect, RiskLevel } from '@dashdb/core';

// A record, so this fails to compile when core adds a dialect.
const DIALECT_KEYS: Record<IrDialect, true> = { postgres: true, mysql: true, sqlite: true };
const DIALECTS = Object.keys(DIALECT_KEYS);

/** How a project came to exist. */
export const PROJECT_SOURCES = [
  'blank',
  'template',
  'file',
  'tool',
  'starter',
  'duplicate',
] as const;
/** What a schema was imported from. `database` is introspection; `project` a .dashdb.json file. */
export const IMPORT_FORMATS = [
  'postgres',
  'mysql',
  'prisma',
  'dbml',
  'database',
  'project',
] as const;
export const MIGRATION_TARGETS = ['sql', 'prisma', 'drizzle'] as const;
export const RISK_LEVELS = ['safe', 'caution', 'dangerous'] as const satisfies readonly RiskLevel[];

export interface TelemetryEvents {
  readonly project_created: {
    readonly source: (typeof PROJECT_SOURCES)[number];
    readonly dialect: IrDialect;
  };
  readonly schema_imported: { readonly format: (typeof IMPORT_FORMATS)[number] };
  readonly migration_generated: {
    readonly target: (typeof MIGRATION_TARGETS)[number];
    readonly risk: RiskLevel;
    readonly ops_count: number;
  };
  readonly migration_downloaded: {
    readonly target: (typeof MIGRATION_TARGETS)[number];
    /** One file, or the zip of every file. */
    readonly bundle: 'file' | 'zip';
  };
  readonly baseline_saved: {
    /** Saved by hand, or by marking a migration as applied. */
    readonly reason: 'manual' | 'applied';
  };
}

export type TelemetryEventName = keyof TelemetryEvents;

/** A property is one of a fixed set of strings, or a non-negative whole number. */
type PropRule = readonly string[] | 'count';

const EVENT_RULES: {
  readonly [E in TelemetryEventName]: Record<keyof TelemetryEvents[E], PropRule>;
} = {
  project_created: { source: PROJECT_SOURCES, dialect: DIALECTS },
  schema_imported: { format: IMPORT_FORMATS },
  migration_generated: { target: MIGRATION_TARGETS, risk: RISK_LEVELS, ops_count: 'count' },
  migration_downloaded: { target: MIGRATION_TARGETS, bundle: ['file', 'zip'] },
  baseline_saved: { reason: ['manual', 'applied'] },
};

export const TELEMETRY_EVENTS = Object.keys(EVENT_RULES) as readonly TelemetryEventName[];

export function isTelemetryEvent(name: string): name is TelemetryEventName {
  return Object.hasOwn(EVENT_RULES, name);
}

/**
 * The event's allowed properties, or null if the event is unknown or a property is missing or
 * not allowed. Extra properties are dropped, so nothing outside the catalogue is ever sent.
 */
export function sanitizeTelemetryEvent(
  name: string,
  props: unknown,
): Readonly<Record<string, string | number>> | null {
  if (!isTelemetryEvent(name) || typeof props !== 'object' || props === null) return null;
  const rules: Record<string, PropRule> = EVENT_RULES[name];
  const input = props as Record<string, unknown>;
  const clean: Record<string, string | number> = {};
  for (const [key, rule] of Object.entries(rules)) {
    const value = input[key];
    if (rule === 'count') {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null;
      clean[key] = value;
    } else {
      if (typeof value !== 'string' || !rule.includes(value)) return null;
      clean[key] = value;
    }
  }
  return clean;
}
