# @dashdb/api

HTTP API built with Hono on Node (`@hono/node-server`). It listens on `PORT` (default **8787**).

- `src/app.ts`: route definitions. Exports `app` and `AppType` (consumed by `@dashdb/api-client`).
- `src/index.ts`: the server entry.

| Script  | What it does                               |
| ------- | ------------------------------------------ |
| `dev`   | `tsx watch src/index.ts`                   |
| `build` | `tsup` → `dist/`                           |
| `start` | `node dist/index.js`                       |
| `test`  | vitest, using `app.request()` (no network) |

```sh
curl http://localhost:8787/health   # {"ok":true}
```
