// Shared ESLint flat config for Next.js apps (wraps eslint-config-next).
// eslint-config-next already registers react, react-hooks, import and @typescript-eslint,
// so only rules (not plugins) are layered on top of it here.
import { defineConfig } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import security from 'eslint-plugin-security';
import tseslint from 'typescript-eslint';
import { ignores, jsFiles, sharedRules } from './base.js';

/** Drop `plugins` from configs whose plugins eslint-config-next has already registered. */
const rulesOnly = (configs) => [configs].flat().map(({ plugins: _plugins, ...config }) => config);

/** @param {string} tsconfigRootDir */
export function next(tsconfigRootDir) {
  return defineConfig([
    ignores,
    ...nextVitals,
    ...nextTs,
    ...rulesOnly(tseslint.configs.strictTypeChecked),
    security.configs.recommended,
    {
      languageOptions: { parserOptions: { projectService: true, tsconfigRootDir } },
      // Lets @next/next rules find the app when ESLint runs from the repo root (lint-staged).
      settings: { next: { rootDir: tsconfigRootDir } },
      rules: sharedRules,
    },
    { files: jsFiles, extends: rulesOnly(tseslint.configs.disableTypeChecked) },
  ]);
}
