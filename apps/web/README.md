# @dashdb/web

Next.js (App Router, `src/` dir) with Tailwind CSS v4. It runs on **:3000**.

- `src/app/`: routes and layouts. `globals.css` imports the `@dashdb/config` Tailwind preset.
- `src/lib/`: app-local helpers. Import them with `@/lib/...`.
- `e2e/`: Playwright specs.

| Script      | What it does                                                        |
| ----------- | ------------------------------------------------------------------- |
| `dev`       | `next dev --port 3000`                                              |
| `build`     | `next build`                                                        |
| `test`      | vitest unit tests (`src/**/*.test.ts`)                              |
| `e2e`       | Playwright. Run `pnpm exec playwright install chromium` once first. |
| `typecheck` | `next typegen && tsc --noEmit`                                      |

Env: copy `.env.example` to `.env.local`.
