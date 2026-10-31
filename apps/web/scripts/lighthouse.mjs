// Lighthouse accessibility (and best-practice) scores for /app against a production build.
// Run `pnpm build` first; this starts `next start` itself on a spare port.
//
//   pnpm --filter @dashdb/web lighthouse            # print scores, exit 1 below 95
//   pnpm --filter @dashdb/web lighthouse --json     # machine-readable
//
// Two pages are audited in one Chrome (Playwright's Chromium) so storage carries over:
//   1. /app, the projects page of a returning visitor (with one project);
//   2. the editor, opened from /app.
// A brand-new visitor's /app immediately opens the SaaS starter, i.e. page 2.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';

const PORT = Number(process.env.LIGHTHOUSE_PORT ?? 3108);
const DEBUG_PORT = 9333;
const BASE = `http://localhost:${String(PORT)}`;
const MIN_SCORE = 95;
const args = new Set(process.argv.slice(2));

const log = (message) => {
  process.stderr.write(`[lighthouse] ${message}\n`);
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

async function audit(url) {
  const result = await lighthouse(url, {
    port: DEBUG_PORT,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['accessibility', 'best-practices'],
    // Keep this browser's storage: the editor page needs the project saved in IndexedDB.
    disableStorageReset: true,
    formFactor: 'desktop',
    screenEmulation: {
      mobile: false,
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      disabled: false,
    },
  });
  if (!result) throw new Error(`Lighthouse returned nothing for ${url}`);
  const { categories, audits } = result.lhr;
  const failing = Object.values(audits)
    .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode === 'binary')
    .map((a) => a.id);
  return {
    url: new URL(url).pathname,
    accessibility: Math.round((categories.accessibility?.score ?? 0) * 100),
    bestPractices: Math.round((categories['best-practices']?.score ?? 0) * 100),
    failing,
  };
}

const server = await startServer();
const browser = await chromium.launch({ args: [`--remote-debugging-port=${String(DEBUG_PORT)}`] });
const results = [];
try {
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();
  await page.goto(`${BASE}/app`);
  // A returning visitor: tour seen, one project.
  await page.evaluate(() => {
    localStorage.setItem(
      'dashdb-onboarding',
      JSON.stringify({ status: 'dismissed', step: 0, projectId: null }),
    );
  });
  await page.goto(`${BASE}/app`);
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByLabel('Name').fill('Audit');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/app\/p\/[\w-]+$/);
  const editorUrl = page.url();

  log('auditing /app');
  results.push(await audit(`${BASE}/app`));
  log('auditing the editor');
  results.push(await audit(editorUrl));
} finally {
  await browser.close();
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F']);
  else server.kill();
}

if (args.has('--json')) console.log(JSON.stringify(results, null, 2));
else {
  for (const r of results) {
    console.log(
      `${r.url.padEnd(28)} accessibility ${String(r.accessibility)}  best practices ${String(r.bestPractices)}` +
        (r.failing.length ? `\n${' '.repeat(30)}failing: ${r.failing.join(', ')}` : ''),
    );
  }
}
const low = results.filter((r) => r.accessibility < MIN_SCORE);
if (low.length) {
  console.error(`\nAccessibility below ${String(MIN_SCORE)}: ${low.map((r) => r.url).join(', ')}`);
  process.exit(1);
}
