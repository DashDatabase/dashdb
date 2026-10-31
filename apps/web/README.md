# @dashdb/web

Next.js (App Router, `src/` dir) with Tailwind CSS v4. It runs on **:3000**.

- `src/app/(marketing)/`: the public site (home, features, pricing, changelog, legal). Statically
  generated; the home page revalidates hourly for the GitHub star count.
- `src/app/app/`: the editor (local-first, not indexed). Its layout loads the UI providers and
  React Flow styles, so marketing pages stay free of editor code.
- `src/lib/site.ts`: the public page registry. It feeds `lib/seo.ts` (metadata), the sitemap,
  OG images (`app/og/[slug]`), breadcrumbs and the footer. Add a page there first.
- `src/lib/waitlist/`: the waitlist form's server action, validation, rate limits and stores.
- `src/content/`: MDX content (the changelog).
- `content/templates/`: the template gallery: one `.dashdb.json` per template (see its README
  for the format and how to contribute). `src/templates/` loads and validates them.
- `src/tools/registry.ts`: the converter tools at `/tools/<slug>`.
- `e2e/`: Playwright specs.

| Script                 | What it does                                                        |
| ---------------------- | ------------------------------------------------------------------- |
| `dev`                  | `next dev --port 3000`                                              |
| `build`                | `next build`                                                        |
| `test`                 | vitest unit tests (`src/**/*.test.ts`)                              |
| `e2e`                  | Playwright. Run `pnpm exec playwright install chromium` once first. |
| `typecheck`            | `next typegen && tsc --noEmit`                                      |
| `bundle:measure`       | Editor first-load JS against its 400 KB budget (after `build`)      |
| `bundle:marketing`     | Fails if editor code reaches a marketing page (after `build`)       |
| `lighthouse`           | Editor accessibility, 95+ (after `build`)                           |
| `lighthouse:marketing` | `/` and `/pricing` on mobile, 95+ in all four categories            |
| `templates:check`      | Validates every gallery template (the CI gate for contributions)    |
| `template:from-sql`    | Builds a template file from DDL and a metadata file                 |
| `demo:record`          | Re-records `public/media/demo.webm` and its poster from the editor  |

Env: copy `.env.example` to `.env.local`. All variables are optional.

| Variable                                | Used for                                                         |
| --------------------------------------- | ---------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                  | Canonical and OG URLs (default `https://dashdb.dev`)             |
| `NEXT_PUBLIC_GITHUB_URL`                | Star button and links (default `github.com/DashDatabase/dashdb`) |
| `GITHUB_TOKEN`                          | Raises the GitHub API limit when reading the star count at build |
| `DATABASE_URL`                          | Stores waitlist signups in Postgres (`waitlist_signups`)         |
| `RESEND_API_KEY` + `RESEND_AUDIENCE_ID` | Also adds signups to a Resend audience                           |

With neither `DATABASE_URL` nor Resend configured, the waitlist accepts signups in development
(and drops them) and reports an error in production.
