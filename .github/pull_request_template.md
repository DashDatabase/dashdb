## What does this change?

<!-- One or two sentences. Link the issue it closes: "Closes #123". -->

## How was it tested?

<!-- Tests added, commands run, screenshots for UI changes. -->

## Checklist

- [ ] Commits follow [Conventional Commits](https://www.conventionalcommits.org)
- [ ] I've signed the [CLA](https://github.com/DashDatabase/dashdb/blob/main/CLA.md) (the bot will ask on your first pull request)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass
- [ ] New behaviour has tests
- [ ] Parser or SQL generation changes: `pnpm test:db` passes, and snapshot / golden diffs are reviewed
- [ ] New safety rule: tests, guide (`rule-guides.ts`) and example (`examples.ts`) added
- [ ] Editor or site changes: `pnpm e2e` passes, no new axe violations, screenshots attached
- [ ] Docs updated (`apps/web/content/docs`, package READMEs) if behaviour changed
- [ ] No server, billing, auth, collaboration or enterprise code (those live in the private cloud repository; see `CLAUDE.md`)
