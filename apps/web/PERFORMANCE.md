# Performance and accessibility

Budgets for the editor, how they are measured, and the numbers as of P18 (2026-10-31).

## Budget: editor JavaScript on first load

**Under 400 KB gzipped, excluding Monaco.** "First load" is a fresh navigation (cache
disabled) straight to an editor URL, counting every script until the network goes quiet.

| Build                                  | First-load JS (gzip) | Chunks |
| -------------------------------------- | -------------------- | ------ |
| Before P18                             | 3,952.8 KB           | 13     |
| After splitting `@dashdb/core`         | 433.4 KB             | 13     |
| **P18** (plus lazy dialogs and panels) | **397.8 KB**         | 15     |

Measure it yourself (production build; the script starts `next start` on port 3107):

```sh
pnpm --filter @dashdb/web build
pnpm --filter @dashdb/web bundle:measure            # report, largest chunks first
pnpm --filter @dashdb/web bundle:measure --budget   # exits 1 over 400 KB
pnpm --filter @dashdb/web bundle:measure --json
```

### What the first load contains

Attributed with production source maps (`SOURCE_MAPS=1 pnpm build`), gzip shares:

| Package / code                      | KB    | Notes                                          |
| ----------------------------------- | ----- | ---------------------------------------------- |
| `next` (React DOM, router, runtime) | 136.4 | Framework floor                                |
| `zod`                               | 31.1  | Validates the IR and records read from storage |
| `dexie`                             | 30.7  | IndexedDB, where projects live                 |
| `@xyflow/react` + `@xyflow/system`  | 37.5  | The canvas (with d3 helpers, ~13 KB more)      |
| `react-resizable-panels`            | 11.9  | Editor layout                                  |
| Editor canvas + components + store  | 25.1  | `apps/web/src/editor`                          |
| `@dashdb/ui` + Radix primitives     | ~35   | One bundled module (see below)                 |
| `sonner`, `tailwind-merge`, `immer` | 22.6  | Toasts, class merging, undo patches            |
| `@dashdb/core/lite`                 | 6.5   | Schema IR, edits, validation                   |

Headroom is small (about 2 KB). Anything new on the editor's initial screen should be lazy
unless it is needed to draw it.

### What loads later

| Chunk (gzip)                       | KB        | Loads when                                       |
| ---------------------------------- | --------- | ------------------------------------------------ |
| Parsers (`node-sql-parser`, DBML…) | 3,184     | Import, templates, the Code panel's parse worker |
| Monaco                             | 573 + 104 | The Code tab opens                               |
| ELK (auto-layout, in a Web Worker) | 433       | Arrange                                          |
| Prettier (Drizzle output)          | 299       | Drizzle export or migration                      |
| JSZip                              | 56        | Downloading a migration bundle                   |

The parser chunk is large because `node-sql-parser`'s default entry carries every SQL dialect.
Importing its per-dialect builds would shrink it a lot; that is a follow-up, as it only costs
time when importing.

### How it is kept small

- **`@dashdb/core` has separate entries.** `@dashdb/core/lite` holds the IR (its only
  dependencies are `zod` and `nanoid`; `src/lite.test.ts` enforces that).
  `@dashdb/core/parsers` and `@dashdb/core/serializers` load with `import()` from
  `src/editor/formats.ts` and `src/editor/templates.ts`. The root `@dashdb/core` still exports
  everything, for Web Workers, the API and tests.
- **Closed things are lazy.** Import, export, image export, command palette, shortcuts, the Code
  and Migration tabs, and the read-only view load on first use
  (`src/editor/components/lazy.tsx`).
- **Heavy work runs in Web Workers**: ELK layout, Code panel parsing, migration generation.

`@dashdb/ui` stays one bundled module. Building it one file per component was tried and made
the first load _larger_ (437–445 KB, 22–24 chunks): the editor uses nearly every component on
its first screen, so splitting only added per-chunk overhead.

### Finding what grew

```sh
pnpm --filter @dashdb/web exec next analyze          # interactive treemap (Turbopack)
pnpm --filter @dashdb/web exec next analyze --output # written to .next/diagnostics/analyze
SOURCE_MAPS=1 pnpm --filter @dashdb/web build        # source maps for byte attribution
```

## Accessibility: Lighthouse 95+

| Page                                 | Accessibility | Best practices |
| ------------------------------------ | ------------- | -------------- |
| `/app` (projects, returning visitor) | **100**       | 100            |
| Editor (`/app/p/<id>`)               | **100**       | 100            |

```sh
pnpm --filter @dashdb/web build
pnpm --filter @dashdb/web lighthouse   # exits 1 below 95
```

A brand-new visitor's `/app` opens the SaaS starter in the editor straight away, so the editor
row covers it too. Lighthouse runs a subset of automated checks; the Playwright suites also run
axe (WCAG 2.2 AA) on every main screen, the tour and the dialogs.

What P18 added for keyboard and screen-reader users:

- Every action has a shortcut, shown in tooltips (`aria-keyshortcuts` too) and in the `?`
  cheat sheet, which is generated from the action registry.
- Arrow keys, Home and End move between the sidebar's tables, enums and relationships.
- A polite live region announces edits, undo and redo ("Undid add column") and tour progress.
- Canvas controls are labelled, and scrollable regions are focusable.
