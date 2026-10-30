# @dashdb/ui

The DashDB design system: color tokens, shadcn/ui components, theme handling and the logo.

```tsx
import { Button, ThemeToggle, toast } from '@dashdb/ui';

<Button variant="outline" onClick={() => toast.success('Saved')}>
  Save
</Button>;
```

## Entry points

- `@dashdb/ui`: components, `Logo`/`LogoMark`, `ThemeToggle`, `useTheme`, `cn`, `toast`. Bundled
  under one `'use client'` directive.
- `@dashdb/ui/server`: server-safe values: `themeScript` (inline it in `<head>` to apply the saved
  theme before first paint) and `renderMarkSvg` (used by `apps/web` to generate favicons).
- `@dashdb/ui/styles.css`: tokens and Tailwind theme. Import it after `tailwindcss`, and add
  `@source` for this package's `src` so Tailwind sees the component class names (see
  `apps/web/src/app/globals.css`).

## Tokens

All colors live in `src/styles/globals.css` and nowhere else; `src/tokens.test.ts` fails on color
literals or Tailwind palette classes in `packages/ui/src` or `apps/web/src`. Semantic tokens:
`background`, `surface`, `surface-raised`, `border`, `input`, `ring`, `text`, `text-muted`,
`highlight` (hover/selected rows), `overlay`, and `primary` (indigo), `accent` (teal), `success`,
`warning`, `danger`, each with `-foreground` (text on a fill) and `-text` (colored text on a
background). shadcn names (`foreground`, `muted`, `card`, `popover`, `secondary`, `destructive`) are
aliased onto these.

Light is the default; `.dark` switches a subtree to dark and `.light` switches it back, so themes
can nest (the `/design` page renders both side by side).

## Theme

The preference (`light` | `dark` | `system`) is stored in `localStorage` under `dashdb-theme`. With
nothing stored, routes under `/app` default to dark and everything else follows the OS.

## Adding shadcn components

`components.json` is configured for this package: `pnpm dlx shadcn@latest add <name>` from
`packages/ui`, then export the component from `src/index.ts`. shadcn uses `accent` for hover
highlights, which here is the teal brand color, so rename `bg-accent`/`accent-foreground` in
generated code to `bg-highlight`/`highlight-foreground`, and replace any `text-white`/`bg-black`
with tokens.
