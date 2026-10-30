// Generates the favicon set from the DashDB mark (@dashdb/ui) and the color tokens.
// Run after changing the logo or brand colors: pnpm --filter @dashdb/web icons
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkSvg } from '@dashdb/ui/server';
import sharp from 'sharp';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(webRoot, 'src', 'app');
const publicDir = join(webRoot, 'public');

/** Reads primitive palette values (e.g. --indigo-600) from the token stylesheet. */
async function readTokens() {
  const require = createRequire(import.meta.url);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- resolved package file
  const css = await readFile(require.resolve('@dashdb/ui/styles.css'), 'utf8');
  const tokens = new Map();
  for (const [, name, value] of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{3,8});/gi)) {
    if (!tokens.has(name)) tokens.set(name, value);
  }
  const get = (name) => {
    const value = tokens.get(name);
    if (!value) throw new Error(`Token --${name} not found in @dashdb/ui/styles.css`);
    return value;
  };
  return get;
}

/** Packs PNGs into a .ico (PNG-compressed entries, supported by every current browser). */
function toIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

const token = await readTokens();
const colors = {
  tile: token('indigo-600'),
  outline: token('white'),
  header: token('white'),
  rows: token('indigo-300'),
  node: token('teal-300'),
};
const background = token('gray-950');

const png = (size, { flatten = false } = {}) => {
  const image = sharp(Buffer.from(renderMarkSvg(colors, size)));
  return (flatten ? image.flatten({ background: colors.tile }) : image).png().toBuffer();
};

await mkdir(publicDir, { recursive: true });
const outputs = {
  [join(appDir, 'icon.svg')]: renderMarkSvg(colors) + '\n',
  [join(appDir, 'favicon.ico')]: toIco(
    await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await png(size) }))),
  ),
  // iOS masks its own rounded corners, so the touch icon is full-bleed.
  [join(appDir, 'apple-icon.png')]: await png(180, { flatten: true }),
  [join(publicDir, 'icon-192.png')]: await png(192),
  [join(publicDir, 'icon-512.png')]: await png(512),
  [join(appDir, 'manifest.webmanifest')]:
    JSON.stringify(
      {
        name: 'DashDB',
        short_name: 'DashDB',
        description: 'Dashboards for your databases.',
        start_url: '/',
        display: 'standalone',
        theme_color: colors.tile,
        background_color: background,
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      null,
      2,
    ) + '\n',
};

for (const [path, contents] of Object.entries(outputs)) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed paths inside this app
  await writeFile(path, contents);
  console.log(`wrote ${path.slice(webRoot.length + 1)}`);
}
