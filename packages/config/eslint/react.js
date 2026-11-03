// Shared ESLint flat config for React libraries: base + react + hooks rules.
import { fixupConfigRules } from '@eslint/compat';
import { defineConfig } from 'eslint/config';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { base } from './base.js';

/** @param {string} tsconfigRootDir */
export function reactConfig(tsconfigRootDir) {
  return defineConfig([
    base(tsconfigRootDir),
    // eslint-plugin-react 7.37 still calls context methods ESLint 10 removed (getFilename, …);
    // the compat layer restores them. Drop it once the plugin supports ESLint 10.
    ...fixupConfigRules([react.configs.flat.recommended, react.configs.flat['jsx-runtime']]),
    reactHooks.configs.flat['recommended-latest'],
    {
      languageOptions: { globals: { ...globals.browser } },
      settings: { react: { version: 'detect' } },
    },
  ]);
}
