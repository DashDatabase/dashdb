# Roadmap

This file mirrors the public [DashDB roadmap project](https://github.com/orgs/DashDatabase/projects/1)
on GitHub, which is the source of truth: each item there links to its issue, where design
discussion happens. Upvote an issue with 👍 to tell us what matters to you.

<!-- TODO(maintainer): create the GitHub Project, fix the link above, and keep this file in sync
     when items move between columns. -->

Items are grouped by status, not dates. "Later" means wanted but not yet scheduled.

## ✅ Shipped

- Schema IR with validation, type mapping and edit operations
- Parsers: Postgres and MySQL DDL (including `pg_dump` / `mysqldump` output), Prisma, DBML,
  single-query introspection JSON
- Serializers: Postgres, MySQL, Prisma, Drizzle, DBML, Mermaid
- Schema diff with rename detection and dependency-aware operation ordering
- Migration generators: up/down SQL, Prisma migration folders, Drizzle migrations with journal
- Migration safety analyzer (12 rules) and expand/contract planner
- Local-first editor: canvas with auto-layout, two-way Code tab, undo, baselines, migration
  panel with visual diff and safety review
- Browser-side converter tools (`/tools`), schema templates gallery, docs, blog and safety guides

## 🚧 Now

- Open-source launch: license, contributor docs, issue forms, DCO check
- Demo GIF and launch materials
- Official Docker image (`ghcr.io/dashdatabase/dashdb`)

## 🔜 Next

- More safety rules, especially for MySQL online DDL
- More parser coverage: partitioned tables, generated columns, views, check constraints edge cases
- Drizzle schema import
- CLI: diff two schema files and print the migration and findings in CI

## 🌱 Later

- **Pro**: encrypted cloud sync, read-only share links, version history
- **Team**: shared projects, comments on changes, review before merge
- Real-time collaboration
- SQLite migrations (table-rebuild strategy)
- More ORMs (TypeORM, Sequelize, SQLAlchemy)

Paid features will live in `/ee` under the [DashDB Commercial License](../ee/LICENSE). What runs
in your browser today stays free and AGPL-3.0.

## Suggest something

Open a [feature request](https://github.com/DashDatabase/dashdb/issues/new?template=feature_request.yml).
Items marked [`help wanted`](https://github.com/DashDatabase/dashdb/labels/help%20wanted) are
open for contributors.
