# @dashdb/edition

The boundary between DashDB Community (this repository) and the paid editions, which are
developed separately under a commercial license.

- `getEdition()` / `isCloudEdition()`: which build this is, from `NEXT_PUBLIC_DASHDB_EDITION`
  (`oss` for self-hosted builds, `cloud` otherwise). Fixed at build time.
- `EditionExtension`: the contract a paid build implements to plug in. This repository defines it
  and never imports an implementation.

Paid features plug in only through this package. Never add server, billing, auth, collaboration
or enterprise code to this repository; an ESLint rule rejects imports of `@dashdb-cloud/*` and of
paths outside the repository.

```ts
import { isCloudEdition } from '@dashdb/edition';
```

Scripts: `build` (tsup), `dev` (tsup watch), `test`, `lint`, `typecheck`.
