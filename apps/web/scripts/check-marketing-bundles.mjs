// Checks that marketing pages ship no editor code, and reports their JavaScript weight.
// Run `pnpm build` first; this starts `next start` itself on a spare port.
//
//   pnpm --filter @dashdb/web bundle:marketing          # exits 1 if editor code is found
//
// Every script a page loads is fetched and searched for markers that only editor code contains
// (its dependencies' identifying strings and the editor's own storage keys). The projects page,
// /app, is measured too as a control: the markers must be found there, or the check proves nothing.
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const PORT = Number(process.env.MARKETING_CHECK_PORT ?? 3109);
const BASE = `http://localhost:${String(PORT)}`;

const PAGES = [
  '/',
  '/features/migrations',
  '/features/diagram',
  '/pricing',
  // The hub only; tool pages load Monaco and the converter by design.
  '/tools',
  // Template pages load the editor only when 'Use this template' is clicked.
  '/templates',
  '/templates/crm',
  '/templates/contribute',
  '/open-source',
  '/changelog',
  '/blog',
  '/blog/create-index-concurrently',
  '/guides/postgres/drop-column',
  '/about',
  '/privacy',
  '/terms',
  '/security',
  '/does-not-exist',
];

/** Strings that appear only in editor code or its dependencies. */
const MARKERS = {
  'editor store / onboarding': 'dashdb-onboarding',
  dexie: 'DexieError',
  immer: '[Immer]',
  zustand: 'zustand',
  '@xyflow/react': 'react-flow__',
  monaco: 'monaco-editor',
  elkjs: 'org.eclipse.elk',
  '@dashdb/ui (Radix)': 'data-radix-',
  sonner: 'data-sonner-toaster',
  '@dashdb/core parsers': 'node-sql-parser',
};

function startServer() {
  const next = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
  const server = spawn(process.execPath, [next, 'start', '--port', String(PORT)], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('next start did not become ready')), 60_000);
    server.stdout.on('data', (chunk) => {
      if (/ready|started server|Local:/i.test(String(chunk))) {
        clearTimeout(timer);
        resolve(server);
      }
    });
    server.on('exit', (code) => reject(new Error(`next start exited with ${String(code)}`)));
  });
}

async function scriptsOf(browser, path) {
  const page = await browser.newPage();
  const urls = new Set();
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script') urls.add(response.url());
  });
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  // Let late chunks (client components, prefetches) arrive.
  await page.waitForTimeout(1500);
  await page.close();
  const bodies = await Promise.all(
    [...urls].map(async (url) => {
      const response = await fetch(url);
      return { url, text: await response.text() };
    }),
  );
  return bodies;
}

function analyse(path, scripts) {
  const found = Object.entries(MARKERS)
    .filter(([, marker]) => scripts.some((s) => s.text.includes(marker)))
    .map(([name]) => name);
  const gzipKb = scripts.reduce((sum, s) => sum + gzipSync(s.text).length, 0) / 1024;
  return { path, scripts: scripts.length, gzipKb: Math.round(gzipKb * 10) / 10, found };
}

const server = await startServer();
const browser = await chromium.launch();
const results = [];
let control;
try {
  for (const path of PAGES) results.push(analyse(path, await scriptsOf(browser, path)));
  control = analyse('/app (control)', await scriptsOf(browser, '/app'));
} finally {
  await browser.close();
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F']);
  else server.kill();
}

for (const r of [...results, control]) {
  console.log(
    `${r.path.padEnd(24)} ${String(r.scripts).padStart(2)} scripts ${r.gzipKb.toFixed(1).padStart(7)} KB gzip` +
      (r.found.length ? `  editor code: ${r.found.join(', ')}` : '  no editor code'),
  );
}

const leaking = results.filter((r) => r.found.length > 0);
if (control.found.length < 3) {
  console.error('\nThe /app control page matched too few markers; the markers are stale.');
  process.exit(1);
}
if (leaking.length) {
  console.error(`\nEditor code in marketing bundles: ${leaking.map((r) => r.path).join(', ')}`);
  process.exit(1);
}
console.log(`\nNo editor code on ${String(results.length)} marketing pages.`);
