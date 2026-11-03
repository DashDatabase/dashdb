# @dashdb/edition

The boundary between DashDB Community (this repository) and the paid editions, which are
developed separately under a commercial license. See
[docs/architecture/editions.md](../../docs/architecture/editions.md) for how the pieces fit.

- `EditionModule` is the contract an edition implements:
  - `providers`: sync, auth, AI, entitlements, telemetry
  - `editor`: slots for the top bar, right panel, status bar, command palette, canvas overlays and project menu
  - `routes`: login, signup, verify, reset, settings, share, invite, billing
- `EDITION_API_VERSION`: bump it on any breaking change. `assertEditionModule()` rejects a module built for another version.
- DashDB Community's providers:
  - `createLocalOnlySyncProvider`: browser storage only.
  - `noAuthProvider`.
  - `createByokAIProvider`: unavailable until a key can be set; no network calls.
  - `allLocalEntitlements`: everything unlocked; Community never shows a paywall.
  - `createOptInTelemetry`: off unless opted in; sends only sanitized, catalogued events.
  - `createOssProviders` composes them.
- `TelemetryEvents`: the typed product events (`project_created`, `schema_imported`,
  `migration_generated`, `migration_downloaded`, `baseline_saved`). Their properties are fixed
  choices and counts only, never schema content or names. `sanitizeTelemetryEvent` enforces this.
- `getEdition()` / `isCloudEdition()`: the marketing build flag from `NEXT_PUBLIC_DASHDB_EDITION` (`oss` for self-hosted builds, `cloud` otherwise). Fixed at build time and separate from the edition module.

Paid features plug in only through this package. Never add server, billing, auth, collaboration
or enterprise code to this repository. ESLint rejects imports of `@dashdb-cloud/*` and of paths
outside the repository.

```ts
import { assertEditionModule, EDITION_API_VERSION, type EditionModule } from '@dashdb/edition';
```

`react` and `@dashdb/core` are used for types only, so there are no runtime dependencies.

Scripts: `build` (tsup), `dev` (tsup watch), `test` (100% coverage enforced), `lint`, `typecheck`.
