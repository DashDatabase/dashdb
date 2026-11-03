# @dashdb/shared

Types and zod schemas shared by the web app and the other packages, such as `DbDialect`.
It has no runtime dependencies other than `zod`, so it is safe to import from the browser or Node.

```ts
import { dbDialectSchema, type DbDialect } from '@dashdb/shared';
```

Scripts: `build` (tsup), `dev` (tsup watch), `test`, `lint`, `typecheck`.
