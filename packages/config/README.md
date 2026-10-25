# @dashdb/config

Shared tooling config for the monorepo.

- `tsconfig/*.json`: TypeScript bases (`base`, `library`, `react-library`, `nextjs`), all strict.
- `eslint/base`, `eslint/next`: ESLint 9 flat configs. Re-export one from a workspace's `eslint.config.js`.
- `tailwind/preset.css`: Tailwind v4 theme tokens. Import it after `tailwindcss` in an app stylesheet.
- `.` (`src/index.ts`): the same tokens as TS constants (`brandColors`) for use in JS.

```jsonc
// tsconfig.json
{ "extends": "@dashdb/config/tsconfig/library.json" }
```

```js
// eslint.config.js
export { default } from '@dashdb/config/eslint/base';
```
