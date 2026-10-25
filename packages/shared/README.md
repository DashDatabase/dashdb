# @dashdb/shared

Types and zod schemas shared by web, api and the other packages: things like `HealthResponse` and `DbDialect`.
It has no runtime dependencies other than `zod`, so it is safe to import from the browser or Node.

```ts
import { healthResponseSchema, type DbDialect } from '@dashdb/shared';
```

Scripts: `build` (tsup), `dev` (tsup watch), `test`, `lint`, `typecheck`.
