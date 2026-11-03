# Editions

DashDB Community (this repository, AGPL-3.0) and the paid cloud edition (the private
`dashdatabase/dashdb-cloud` repository) are the same app built with a different **edition
module**. The edition module is the only thing that differs between them. This repository
defines its shape and ships the Community implementation, and it never imports the cloud one.

## The seam

```
DASHDB_EDITION_MODULE ──► next.config.ts ──► alias '@dashdb/active-edition'
 (default: ./src/edition/oss.ts)                     │
                                                      ▼
                              apps/web/src/edition/active.ts
                              (assertEditionModule, exports `edition`)
                                                      │
       ┌──────────────┬───────────────┬───────────────┼────────────────┬──────────────┐
       ▼              ▼               ▼               ▼                ▼              ▼
   providers      top bar,        right panel     command palette   canvas      app/(edition)/*
  (sync, auth,    status bar      tabs            (Edition group)   overlays    route shells
   ai, ...)       items                                                         (/login, /billing…)
```

- **`packages/edition`** holds the contract: `EditionModule`, the provider interfaces, the editor
  slot types, `EDITION_API_VERSION` and `assertEditionModule`. It also holds the Community
  providers. It has no runtime dependencies (`react` and `@dashdb/core` are type-only) and 100%
  test coverage.
- **`apps/web/src/edition/oss.ts`** is DashDB Community's module. It uses the Community providers
  and wires them to the browser's project storage (Dexie). Its slots are empty and it has no
  routes.
- **`apps/web/src/edition/active.ts`** imports `@dashdb/active-edition`, checks it once with
  `assertEditionModule`, and exports `edition`. App code imports `edition` from there, never from
  the alias directly.
- **`next.config.ts`** points the alias at `DASHDB_EDITION_MODULE`, with `turbopack.resolveAlias`
  for Turbopack and `resolve.alias` for webpack. `tsconfig.json` maps the alias to `oss.ts`, so
  typechecking always runs against the Community module.

## The contract

```ts
interface EditionModule {
  id: 'oss' | string;
  apiVersion: number; // EDITION_API_VERSION
  providers: { sync; auth; ai; entitlements; telemetry };
  editor: {
    topBarItems;
    rightPanelTabs;
    statusBarItems;
    commands;
    canvasOverlays;
    projectMenuItems;
  };
  routes: Partial<
    Record<
      'login' | 'signup' | 'verify' | 'reset' | 'settings' | 'share' | 'invite' | 'billing',
      ComponentType<RouteProps>
    >
  >;
}
```

**Versioning.** `EDITION_API_VERSION` is bumped on any breaking change to these types. At
startup, the app refuses a module built for another version, so a cloud build that falls behind
fails loudly instead of misbehaving. Adding an optional member is not breaking.

**Providers.**

- `SyncProvider` (`status`, `push`, `pull`, `onRemoteChange`): the editor saves through `push`
  and loads through `pull`. It validates everything it pulls, and applies remote changes with
  `applyRemoteChange`.
- `AuthProvider`: the session.
- `AIProvider` (`review(ir)`, `generate(prompt)`): returns `@dashdb/core` types. Providers check
  model output with core's `findingSchema` and `schemaSchema`.
- `EntitlementsProvider` (`has`, `limits`).
- `TelemetryProvider`: off unless the user opts in.

**Editor slots.** Every slot component receives `{ editor: EditorApi }`:

- `projectId()`
- `applyRemoteChange(patches)`
- `listLocalProjects()`
- `exportProject(id)`, which returns `.dashdb.json` text for an upload-to-cloud flow

Canvas overlays also receive the viewport (`x`, `y`, `zoom`), for presence cursors.

Edition commands appear in the palette's `Edition` group. A shortcut that collides with a
built-in one is dropped. Right-panel tabs use the id `edition:<id>` and aren't saved with the
project, so a project opened in a build without that tab still loads.

**Remote changes.** `applyRemoteChange` applies immer-style patches to the open document without
recording an undo step, and the result still autosaves. Patches that don't apply, or that leave
an invalid document, are rejected. If a later undo or redo step no longer applies because of a
remote change, the history is dropped instead of corrupting the document.

**Routes.** `app/(edition)/` has a shell for each route name: `/login`, `/signup`, `/verify`,
`/reset`, `/settings/[[...slug]]`, `/share/[token]`, `/invite/[token]` and `/billing`. Each
renders `edition.routes[name]` with resolved `params` and `searchParams`, or calls `notFound()`.
All of them are `noindex, nofollow`.

## What DashDB Community provides

| Provider       | Behaviour                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sync`         | `createLocalOnlySyncProvider`: saves and loads in this browser (Dexie). Status is always `local`; there are never remote changes.                 |
| `auth`         | `noAuthProvider`: nobody is signed in.                                                                                                            |
| `ai`           | `createByokAIProvider`: bring-your-own-key. Until a key can be set it reports unavailable and makes no network calls.                             |
| `entitlements` | `allLocalEntitlements`: every feature, no limits. **Community builds never show a paywall**; UI gates features only through `entitlements.has()`. |
| `telemetry`    | `createOptInTelemetry`: off unless opted in (stored in `localStorage`), and no destination is configured.                                         |

The editor slots are empty and there are no routes, so the Community editor renders exactly as
it did before the seam existed.

`NEXT_PUBLIC_DASHDB_EDITION` (`cloud`/`oss`) is a separate flag. It only controls the marketing
pages on dashdb.dev (pricing, the waitlist).

## Plugging in another edition

The cloud repository consumes this one as a submodule and builds `apps/web` with its own
module:

```sh
DASHDB_EDITION_MODULE=../../../cloud/src/edition.tsx \
DASHDB_EDITION_TRANSPILE=@dashdb-cloud/sync,@dashdb-cloud/ui \
pnpm --filter @dashdb/web build
```

- `DASHDB_EDITION_MODULE` is relative to `apps/web`, or absolute. Its default export is an
  `EditionModule`.
- When the module is outside this repository, `turbopack.root` and `outputFileTracingRoot` widen
  to the common parent directory, so Turbopack can resolve it and standalone output includes it.
- `DASHDB_EDITION_TRANSPILE` adds packages, comma-separated, to `transpilePackages`.
- The module may import this repository's packages (`@dashdb/edition`, `@dashdb/ui`,
  `@dashdb/core`) and app code through `@/`. This repository never imports it back.

`apps/web/test/fixtures/test-edition.tsx` is a small working example. Playwright's
`edition-fixture` project runs the app with it on port 3001 (`NEXT_DIST_DIR=.next-fixture`) and
checks that its top-bar item and login page appear.

## The import boundary

ESLint (`packages/config/eslint/base.js`) enforces two rules:

- `no-restricted-imports` rejects `@dashdb-cloud/*`.
- `dashdb/no-outside-repo-imports` rejects relative paths that leave the repository.

The alias is a bare specifier resolved at build time, so neither rule applies to it. A paid
feature that needs something new from the editor gets a new, generic slot or provider method
here. The feature itself is never added to this repository.
