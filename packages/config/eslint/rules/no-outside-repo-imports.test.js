import { join } from 'node:path';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import { escapesRoot, noOutsideRepoImports, repoRoot } from './no-outside-repo-imports.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

// A file two levels deep, like packages/core/src/index.ts.
const filename = join(repoRoot, 'packages', 'core', 'src', 'index.ts');
const outside = { messageId: 'outside' };

describe('escapesRoot', () => {
  it('only flags paths that leave the repository', () => {
    expect(escapesRoot('./ir', filename)).toBe(false);
    expect(escapesRoot('../../shared/src/index', filename)).toBe(false);
    expect(escapesRoot('../../../package.json', filename)).toBe(false);
    expect(escapesRoot('../../../../dashdb-cloud/src/x', filename)).toBe(true);
    expect(escapesRoot('react', filename)).toBe(false);
    expect(escapesRoot('@dashdb/edition', filename)).toBe(false);
    expect(escapesRoot(join(repoRoot, '..', 'elsewhere', 'x.js'), filename)).toBe(true);
  });

  it('is not fooled by a sibling folder whose name starts with ..', () => {
    expect(escapesRoot('./..hidden/x', filename)).toBe(false);
  });
});

new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } }).run(
  'no-outside-repo-imports',
  noOutsideRepoImports,
  {
    valid: [
      { filename, code: "import { x } from './ir';" },
      { filename, code: "import { y } from '../../shared/src/index';" },
      { filename, code: "import React from 'react';" },
      { filename, code: "export * from '@dashdb/edition';" },
      { filename, code: "const m = await import('./lazy');" },
    ],
    invalid: [
      { filename, code: "import { x } from '../../../../dashdb-cloud/src/x';", errors: [outside] },
      { filename, code: "export { x } from '../../../../outside/x';", errors: [outside] },
      { filename, code: "export * from '../../../../outside/x';", errors: [outside] },
      { filename, code: "const m = await import('../../../../outside/x');", errors: [outside] },
      { filename, code: "const m = require('../../../../outside/x');", errors: [outside] },
    ],
  },
);
