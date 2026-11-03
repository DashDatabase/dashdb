// Reports imports that reach outside this repository, such as `../../../dashdb-cloud/src/x`.
// DashDB Community is consumed by the private cloud repository as a git submodule, so a relative
// path can quietly escape into code that isn't here. Paid features plug in through
// packages/edition instead. Bare package imports (`react`, `@dashdb/core`) are not checked here;
// `no-restricted-imports` in base.js rejects `@dashdb-cloud/*`.
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root: four levels up from packages/config/eslint/rules. */
export const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
// eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed path in this repo
if (!existsSync(resolve(repoRoot, 'pnpm-workspace.yaml'))) {
  throw new Error(`no-outside-repo-imports: ${repoRoot} is not the repository root`);
}

/** Whether `specifier`, imported from `filename`, resolves to a path outside `root`. */
export function escapesRoot(specifier, filename, root = repoRoot) {
  const isPath =
    specifier.startsWith('.') || isAbsolute(specifier) || /^[A-Za-z]:[\\/]/.test(specifier);
  if (!isPath) return false;
  // On another drive (Windows) relative() returns an absolute path.
  const target = relative(root, resolve(dirname(filename), specifier));
  return target === '..' || target.startsWith(`..${sep}`) || isAbsolute(target);
}

/** @type {import('eslint').Rule.RuleModule} */
export const noOutsideRepoImports = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow imports that resolve to a path outside this repository' },
    schema: [],
    messages: {
      outside:
        "'{{specifier}}' resolves outside this repository. Paid features plug in through packages/edition, never by importing the cloud repository.",
    },
  },
  create(context) {
    const check = (node) => {
      if (node?.type !== 'Literal' || typeof node.value !== 'string') return;
      if (escapesRoot(node.value, context.filename)) {
        context.report({ node, messageId: 'outside', data: { specifier: node.value } });
      }
    };
    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require')
          check(node.arguments[0]);
      },
    };
  },
};

/** The `dashdb` plugin: rules specific to this repository. */
export const dashdbPlugin = {
  meta: { name: 'dashdb' },
  rules: { 'no-outside-repo-imports': noOutsideRepoImports },
};
