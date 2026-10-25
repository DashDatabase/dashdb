# @dashdb/ui

Shared React components styled with Tailwind classes from the `@dashdb/config` preset (`brand-*`).

```tsx
import { Button } from '@dashdb/ui';

<Button variant="secondary">Cancel</Button>;
```

The package ships compiled JS (`dist/`) with no CSS. The consuming app's Tailwind build must scan
this package's source for class names. `apps/web` does this with
`@source "../../../../packages/ui/src";` in `globals.css`.

`react` is a peer dependency.
