# @dashdb/config

Shared tooling config for the monorepo.

- `tsconfig/*.json`: TypeScript bases (`base`, `library`, `react-library`, `nextjs`), all strict.
- `eslint/base`, `eslint/react`, `eslint/next`: ESLint 9 flat config factories (`base`, `reactConfig`, `next`).
  typescript-eslint `strictTypeChecked`, `eslint-plugin-security` and `import/no-cycle` everywhere; React and
  hooks rules in `react` and `next`. Call one with the workspace directory so type-aware rules find its tsconfig.

Design tokens (colors, radius, fonts) live in `@dashdb/ui/styles.css`, not here.

```jsonc
// tsconfig.json
{ "extends": "@dashdb/config/tsconfig/library.json" }
```

```js
// eslint.config.js
import { base } from '@dashdb/config/eslint/base';

export default base(import.meta.dirname);
```
