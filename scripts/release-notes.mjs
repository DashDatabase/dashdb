// Prints the GitHub release notes for one version: the `## <version>` section of every
// workspace package's CHANGELOG.md (written by `changeset version`), under the package name.
// Used by .github/workflows/release.yml:  node scripts/release-notes.mjs 1.2.0 > notes.md
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
// eslint-disable-next-line security/detect-unsafe-regex -- linear: no nested quantifiers
if (!version || !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version)) {
  console.error('usage: node scripts/release-notes.mjs <version>');
  process.exit(2);
}

/** The lines under `## <version>` up to the next `## ` heading, or null. */
function section(changelog) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

const dirs = ['apps', 'packages'].flatMap((group) =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed repository folders
  readdirSync(join(root, group)).map((name) => join(root, group, name)),
);
const parts = [];
for (const dir of dirs) {
  const changelog = join(dir, 'CHANGELOG.md');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths from the listing above
  if (!existsSync(changelog)) continue;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths from the listing above
  const body = section(readFileSync(changelog, 'utf8'));
  // Fixed versioning bumps every package; skip those whose only entry is a dependency bump.
  const own = (body ?? '')
    .split('\n')
    .filter((line) => line.trim() && !/^(###|- Updated dependencies|\s+- @dashdb\/)/.test(line));
  if (own.length === 0) continue;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths from the listing above
  const { name } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  parts.push({ name, body: (body ?? '').replace(/^### /gm, '#### ') });
}
// The web app first: it is what the image and the release are about.
parts.sort((a, b) => Number(b.name === '@dashdb/web') - Number(a.name === '@dashdb/web'));

const image = `ghcr.io/dashdatabase/dashdb:${version}`;
// Keyless signatures name the workflow file that signed: image.yml, called by release.yml on main.
const signer = 'https://github.com/DashDatabase/dashdb/.github/workflows/image.yml@refs/heads/main';
process.stdout.write(
  [
    ...parts.map((p) => `### ${p.name}\n\n${p.body}`),
    `### Docker image\n\n\`\`\`sh\ndocker pull ${image}\ncosign verify ${image} \\\n  --certificate-identity ${signer} \\\n  --certificate-oidc-issuer https://token.actions.githubusercontent.com\n\`\`\``,
  ].join('\n\n') + '\n',
);
