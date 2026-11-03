# @dashdb/edition

## 0.1.0

### Minor Changes

- 6490c34: Edition extension points: `@dashdb/edition` defines `EditionModule` (sync, auth, AI, entitlements and telemetry providers, editor slots and account routes), and the app loads the active edition through the `@dashdb/active-edition` alias (`DASHDB_EDITION_MODULE`). DashDB Community's edition keeps projects in the browser, unlocks everything and adds nothing to the editor. Core adds zod schemas for safety findings (`findingSchema`, `safetyReportSchema`). The pricing page lists Free, Pro, Team and Enterprise; expand/contract plans and the desktop app are free.
- 6044fc5: Typed telemetry events: `TelemetryEvents` in `@dashdb/edition` catalogues `project_created`, `schema_imported`, `migration_generated` (target, risk, ops_count), `migration_downloaded` and `baseline_saved`. Their properties are fixed choices and counts only, never schema content or names, and `sanitizeTelemetryEvent` enforces that. The editor records these events through the active edition. DashDB Community stays off unless the user opts in, and has no destination.

### Patch Changes

- Updated dependencies [6490c34]
  - @dashdb/core@0.1.0
