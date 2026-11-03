---
'@dashdb/edition': minor
'@dashdb/web': minor
---

Typed telemetry events: `TelemetryEvents` in `@dashdb/edition` catalogues `project_created`, `schema_imported`, `migration_generated` (target, risk, ops_count), `migration_downloaded` and `baseline_saved`. Their properties are fixed choices and counts only, never schema content or names, and `sanitizeTelemetryEvent` enforces that. The editor records these events through the active edition. DashDB Community stays off unless the user opts in, and has no destination.
