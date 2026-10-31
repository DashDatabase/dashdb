// Lighthouse scores against a production build. Run `pnpm build` first; this starts
// `next start` itself on a spare port.
//
//   pnpm --filter @dashdb/web lighthouse              # editor: accessibility, best practices
//   pnpm --filter @dashdb/web lighthouse:marketing    # / and /pricing: all four categories, mobile
//   ... --json                                        # machine-readable (either mode)
//
// Editor mode gates accessibility (P18), marketing mode every category (P19); both exit 1 below 95.
//
// Editor mode audits two pages in one Chrome (Playwright's Chromium) so storage carries over:
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
const marketing = args.has('--marketing');

const log = (message) => {
  process.stderr.write(`[lighthouse] ${message}\n`);
};

const EDITOR_FLAGS = {
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
};

// Lighthouse's defaults are its mobile profile: Moto G Power viewport, 4x CPU slowdown, slow 4G.
const MARKETING_FLAGS = {
  onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
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

const score = (category) => (category ? Math.round(category.score * 100) : undefined);

async function audit(url, flags) {
  const result = await lighthouse(url, {
    port: DEBUG_PORT,
    output: 'json',
    logLevel: 'error',
    ...flags,
  });
  if (!result) throw new Error(`Lighthouse returned nothing for ${url}`);
  const { categories, audits } = result.lhr;
  const failing = Object.values(audits)
    .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode === 'binary')
    .map((a) => a.id);
  return {
    url: new URL(url).pathname,
    performance: score(categories.performance),
    accessibility: score(categories.accessibility),
    bestPractices: score(categories['best-practices']),
    seo: score(categories.seo),
    metrics: categories.performance
      ? {
          fcpMs: Math.round(audits['first-contentful-paint']?.numericValue ?? 0),
          lcpMs: Math.round(audits['largest-contentful-paint']?.numericValue ?? 0),
          tbtMs: Math.round(audits['total-blocking-time']?.numericValue ?? 0),
          cls: Math.round((audits['cumulative-layout-shift']?.numericValue ?? 0) * 1000) / 1000,
        }
      : undefined,
    failing,
  };
}

async function auditEditor(context) {
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
  const results = [await audit(`${BASE}/app`, EDITOR_FLAGS)];
  log('auditing the editor');
  results.push(await audit(editorUrl, EDITOR_FLAGS));
  return results;
}

async function auditMarketing() {
  const results = [];
  for (const path of ['/', '/pricing']) {
    log(`auditing ${path} (mobile)`);
    results.push(await audit(`${BASE}${path}`, MARKETING_FLAGS));
  }
  return results;
}

const server = await startServer();
const browser = await chromium.launch({ args: [`--remote-debugging-port=${String(DEBUG_PORT)}`] });
let results = [];
try {
  const context = browser.contexts()[0] ?? (await browser.newContext());
  results = marketing ? await auditMarketing() : await auditEditor(context);
} finally {
  await browser.close();
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F']);
  else server.kill();
}

if (args.has('--json')) console.log(JSON.stringify(results, null, 2));
else {
  const indent = ' '.repeat(30);
  for (const r of results) {
    const scores = [
      r.performance !== undefined && `performance ${String(r.performance)}`,
      `accessibility ${String(r.accessibility)}`,
      `best practices ${String(r.bestPractices)}`,
      r.seo !== undefined && `SEO ${String(r.seo)}`,
    ].filter(Boolean);
    const metrics = r.metrics
      ? `\n${indent}FCP ${String(r.metrics.fcpMs)} ms · LCP ${String(r.metrics.lcpMs)} ms · TBT ${String(r.metrics.tbtMs)} ms · CLS ${String(r.metrics.cls)}`
      : '';
    const failing = r.failing.length ? `\n${indent}failing: ${r.failing.join(', ')}` : '';
    console.log(`${r.url.padEnd(28)} ${scores.join('  ')}${metrics}${failing}`);
  }
}
const gated = (r) =>
  marketing ? [r.performance, r.accessibility, r.bestPractices, r.seo] : [r.accessibility];
const low = results.filter((r) => gated(r).some((s) => (s ?? 0) < MIN_SCORE));
if (low.length) {
  console.error(`\nScores below ${String(MIN_SCORE)}: ${low.map((r) => r.url).join(', ')}`);
  process.exit(1);
}
