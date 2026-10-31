/*
 * `@dashdb/core/lite`: the Schema IR and its edits, with no parser, formatter or migration
 * code. Browser apps import this up front and load the rest when needed: `@dashdb/core/parsers`
 * and `@dashdb/core/serializers` with `import()`, and the root entry `@dashdb/core` (which still
 * exports everything) from Web Workers and lazily loaded UI.
 */
export * from './ir';
export * from './parsers/types';
// Types only: free at runtime, so code that only describes diffs, migrations, safety reports
// or introspection can stay on this entry.
export type * from './diff/types';
export type * from './migrations/types';
export type * from './safety/types';
export type * from './serializers/types';
export type { IntrospectionDialect, QueryRunner, Row } from './introspection';
export type { IntrospectionResult } from './parsers/introspection';
