// Shared ESLint flat configs for TypeScript packages and Node apps.
// Each workspace passes its own directory so type-aware rules find the right tsconfig.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import importPlugin from 'eslint-plugin-import';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export const ignores = globalIgnores([
  '**/dist/**',
  '**/.next/**',
  // fumadocs-mdx output
  '**/.source/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/next-env.d.ts',
  '**/playwright-report/**',
  '**/test-results/**',
]);

/** Plain JS (config files) is outside every tsconfig, so skip type-aware rules there. */
export const jsFiles = ['**/*.{js,mjs,cjs}'];

/** Rules shared by every preset, including next (which registers its own plugins). */
export const sharedRules = {
  '@typescript-eslint/consistent-type-imports': 'error',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
  // Fires on nearly every indexed access; noUncheckedIndexedAccess already covers the real risk.
  'security/detect-object-injection': 'off',
  // Cycles within our own code only; walking into dependencies is slow and can overflow the stack.
  'import/no-cycle': ['error', { ignoreExternal: true }],
};

/** @param {string} tsconfigRootDir */
export function base(tsconfigRootDir) {
  return defineConfig([
    ignores,
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    security.configs.recommended,
    importPlugin.flatConfigs.recommended,
    importPlugin.flatConfigs.typescript,
    {
      languageOptions: {
        globals: { ...globals.node },
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      settings: {
        'import/resolver': { typescript: { alwaysTryTypes: true }, node: true },
        // Never parse dependency sources for export analysis (some, like @dbml/core, overflow the parser).
        'import/ignore': ['node_modules'],
      },
      rules: {
        ...sharedRules,
        // TypeScript already resolves imports; these duplicate tsc and are slow.
        'import/no-unresolved': 'off',
        'import/named': 'off',
        'import/namespace': 'off',
        'import/default': 'off',
        'import/no-named-as-default-member': 'off',
      },
    },
    { files: jsFiles, extends: [tseslint.configs.disableTypeChecked] },
  ]);
}
