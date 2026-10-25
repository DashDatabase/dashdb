// Root files only (commitlint config etc.); each workspace has its own eslint.config.js.
import { defineConfig, globalIgnores } from 'eslint/config';
import { base } from './packages/config/eslint/base.js';

export default defineConfig([globalIgnores(['apps/**', 'packages/**']), base(import.meta.dirname)]);
