# @dashdb/core

## 0.1.0

### Minor Changes

- 6490c34: Edition extension points: `@dashdb/edition` defines `EditionModule` (sync, auth, AI, entitlements and telemetry providers, editor slots and account routes), and the app loads the active edition through the `@dashdb/active-edition` alias (`DASHDB_EDITION_MODULE`). DashDB Community's edition keeps projects in the browser, unlocks everything and adds nothing to the editor. Core adds zod schemas for safety findings (`findingSchema`, `safetyReportSchema`). The pricing page lists Free, Pro, Team and Enterprise; expand/contract plans and the desktop app are free.

### Patch Changes

- @dashdb/shared@0.1.0
