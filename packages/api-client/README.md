# @dashdb/api-client

Typed client for `@dashdb/api`, built on Hono's RPC client (`hc`). Route and response types are
inferred from the API's exported `AppType`, so the client stays in sync with the server automatically.

```ts
import { createApiClient, getHealth } from '@dashdb/api-client';

const api = createApiClient(process.env.NEXT_PUBLIC_API_URL!);
await getHealth(api); // { ok: true }
```

`@dashdb/api` is only a devDependency here, used for types; no server code ends up in the client bundle.
