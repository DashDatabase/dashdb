# @dashdb/core

Framework-agnostic domain logic for DashDB. It depends only on `@dashdb/shared`: no HTTP, no React, no DB driver.

Current exports:

- `parseConnectionUrl(url)` → `{ dialect, host, port, database }` (credentials stripped).

Scripts: `build` (tsup), `dev` (tsup watch), `test`, `lint`, `typecheck`.
