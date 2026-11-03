# Git history secret scan

A full-history scan run before the repository went public, and repeated when cloud-only code
moved to the private repository. History was not rewritten.

|                 |                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Date            | 2026-11-03                                                                                                              |
| Tool            | gitleaks 8.30.1 (default rules)                                                                                         |
| Command         | `gitleaks detect --log-opts=--all --redact --report-format json`                                                        |
| Scope           | Every ref after `git fetch --all`: `main`, feature branches, Dependabot branches and `changeset-release/main` (31 refs) |
| Commits scanned | 46 (about 3.6 MB)                                                                                                       |
| Findings        | **0**                                                                                                                   |

## Findings

None. No commit on any ref contains a secret that matches the gitleaks rules.

The only environment files in the history are two `.env.example` templates, the web app's and
the API server's (which moved to the private repository, see
[moved-to-cloud.md](../moved-to-cloud.md)). They hold placeholders and local Docker defaults
(`dashdb:dashdb@localhost`), not credentials.

## Keys to rotate

None.

## Keeping it that way

- Every commit runs gitleaks on its staged changes (pre-commit hook), and CI runs it on every
  push and pull request (`Secret scan (gitleaks)` in `.github/workflows/security.yml`).
- If either ever reports a real secret: rotate the key first, then decide whether to rewrite
  history. A pushed secret must be treated as leaked even after it is removed.
