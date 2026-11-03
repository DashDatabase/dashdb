<p align="center">
  <a href="https://dashdb.dev">
    <img src="docs/assets/logo.svg" alt="DashDB" width="72" height="72">
  </a>
</p>

<h1 align="center">DashDB</h1>

<p align="center">
  <strong>Design your database visually. Ship the migration.</strong><br>
  A local-first schema editor for Postgres and MySQL that writes safe, reviewable migrations for SQL, Prisma and Drizzle.
</p>

<p align="center">
  <a href="https://github.com/DashDatabase/dashdb/actions/workflows/ci.yml"><img src="https://github.com/DashDatabase/dashdb/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License: AGPL-3.0"></a>
  <!-- TODO: replace with the real Discord invite and server id -->
  <a href="https://discord.gg/TODO"><img src="https://img.shields.io/badge/chat-Discord-5865F2?logo=discord&logoColor=white" alt="Discord"></a>
  <a href="https://github.com/DashDatabase/dashdb/stargazers"><img src="https://img.shields.io/github/stars/DashDatabase/dashdb?style=flat" alt="GitHub stars"></a>
</p>

<p align="center">
  <a href="https://dashdb.dev/app"><strong>Try it now →</strong></a>
  &nbsp;·&nbsp;
  <a href="https://dashdb.dev/docs">Docs</a>
  &nbsp;·&nbsp;
  <a href="docs/ROADMAP.md">Roadmap</a>
  &nbsp;·&nbsp;
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <!-- TODO: record the demo GIF and save it at docs/assets/demo.gif -->
  <img src="docs/assets/demo.gif" alt="Designing a schema on the DashDB canvas and generating its migration" width="800">
</p>

## Features

- **Visual canvas**: tables, columns, keys and relations on a diagram, with a Code tab that stays in sync.
- **Import what you already have**: Postgres or MySQL DDL (including `pg_dump` / `mysqldump` output), Prisma schemas, DBML, or a JSON snapshot introspected from a live database.
- **Export anywhere**: Postgres DDL, MySQL DDL, Prisma, Drizzle, DBML and Mermaid ERDs.
- **Migrations from a diff**: compare against a saved baseline and get up and down SQL, a Prisma migration folder or a Drizzle migration with its journal.
- **Safety checks before you ship**: rules flag table rewrites, long locks, blocking index builds, data loss and renames that break running code, each with a safer step-by-step alternative.
- **Local-first and private**: the editor runs entirely in your browser. No signup, and your schema never leaves your machine.
- **Templates and converters**: a gallery of real-world schemas, plus browser-side tools such as SQL → Prisma and Postgres → MySQL.

## Quick start

### Hosted

Open **[dashdb.dev/app](https://dashdb.dev/app)**. Nothing to install, no account; projects are stored in your browser.

### Docker

Run your own instance on [localhost:8080](http://localhost:8080) with one command:

```sh
git clone https://github.com/DashDatabase/dashdb.git && cd dashdb
docker compose -f docker-compose.selfhost.yml up
```

Or run the published image directly:

```sh
docker run -p 8080:8080 ghcr.io/dashdatabase/dashdb:latest
```

The image is the self-hosted (OSS) edition: the editor, docs and tools, without the hosted
waitlist and pricing. It needs no database, since projects live in each user's browser. Images
are multi-arch (amd64, arm64), signed with cosign and ship an SBOM. See
[Self-hosting](https://dashdb.dev/docs/self-hosting) for configuration and verification.

### One-click deploy

<!-- TODO: publish a Railway template from this repo and replace the URL with its template code -->

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https://github.com/DashDatabase/dashdb)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/DashDatabase/dashdb)

Railway builds the [Dockerfile](apps/web/Dockerfile) ([`railway.json`](railway.json)); Render
runs the published image ([`render.yaml`](render.yaml)).

### Local development

You need Node.js 22, pnpm 9 and Git. Docker is only needed for the database integration tests.

```sh
git clone https://github.com/DashDatabase/dashdb.git
cd dashdb
nvm use && pnpm install
cp apps/api/.env.example apps/api/.env && cp apps/web/.env.example apps/web/.env.local
pnpm dev                 # web on http://localhost:3000, api on :8787
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository layout, tests and conventions.

## Supported databases and ORMs

| Target                    | Import | Export | Migrations                              | Safety rules |
| ------------------------- | :----: | :----: | --------------------------------------- | :----------: |
| PostgreSQL                |   ✅   |   ✅   | ✅ up/down SQL, transactional           |      ✅      |
| MySQL 8                   |   ✅   |   ✅   | ✅ up/down SQL                          |      ✅      |
| Prisma                    |   ✅   |   ✅   | ✅ `prisma/migrations` folder           | via dialect  |
| Drizzle                   |   —    |   ✅   | ✅ SQL files + `meta/_journal.json`     | via dialect  |
| DBML                      |   ✅   |   ✅   | —                                       |      —       |
| Mermaid ERD               |   —    |   ✅   | —                                       |      —       |
| Live introspection (JSON) |   ✅   |   —    | —                                       |      —       |
| SQLite                    |   —    |   —    | Not planned yet (limited `ALTER TABLE`) |      —       |

## Roadmap

What we are working on, and what comes next, is in [docs/ROADMAP.md](docs/ROADMAP.md), which
mirrors the public [GitHub Project](https://github.com/orgs/DashDatabase/projects/1).

## Contributing

Bug reports with a schema sample, new safety rules, parser fixes and schema templates are all
welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and look for
[`good first issue`](https://github.com/DashDatabase/dashdb/labels/good%20first%20issue).
Everyone taking part follows our [Code of Conduct](CODE_OF_CONDUCT.md). To report a security
problem, follow [SECURITY.md](SECURITY.md) instead of opening an issue.

## Star history

<a href="https://star-history.com/#DashDatabase/dashdb&Date">
  <img src="https://api.star-history.com/svg?repos=DashDatabase/dashdb&type=Date" alt="Star history chart" width="600">
</a>

## License

DashDB is open source under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0),
with one exception: the `/ee` directory, reserved for future commercial features, is under the
[DashDB Commercial License](ee/LICENSE).

In plain language:

- **You can** use DashDB for free, for anything, including at work and for commercial projects.
  Read the code, change it, self-host it for your team, and share it.
- **If you modify DashDB and let other people use it over a network** (for example, you run a
  changed version as a hosted service), you must offer those users the source code of your
  changed version, under the AGPL too.
- **The schemas and migrations you create are yours.** The AGPL covers DashDB's code, not what
  you design with it.
- **Code in `/ee`** is source available: you can read it and try it, but running it in
  production needs a commercial license. There is no code in `/ee` yet.
- **Need different terms?** If the AGPL doesn't work for your company, a commercial license is
  available. Contact licensing@dashdb.dev.

This summary is not legal advice; the [LICENSE](LICENSE) file is what counts.
