// Shared ESLint flat config for Next.js apps (wraps eslint-config-next).
import { defineConfig } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { ignores } from './base.js';

export default defineConfig([ignores, ...nextVitals, ...nextTs]);
