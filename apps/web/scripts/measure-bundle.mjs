// Measures the JavaScript the editor downloads on first load, gzipped, against a production
// build. Run `pnpm build` first; this starts `next start` itself on a spare port.
//
//   pnpm --filter @dashdb/web bundle:measure            # print the report
//   pnpm --filter @dashdb/web bundle:measure --json     # machine-readable
//   pnpm --filter @dashdb/web bundle:measure --budget   # exit 1 over the 400 KB budget
//
// "First load" is a fresh navigation (cache disabled) straight to an editor URL, until the
// network is idle. Monaco loads only when the Code tab opens, and Web Workers (ELK layout,
// parsing, migrations) only on use, so neither is part of it; any chunk that does contain
// Monaco is reported separately and excluded from the budget.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const PORT = Number(process.env.MEASURE_PORT ?? 3107);
const BASE = `http://localhost:${String(PORT)}`;
const BUDGET_KB = 400;

// Recognizable strings per package, to label chunks in the report (best effort).
const MARKERS = {
  'react-dom': /__reactFiber|react-dom/,
  '@xyflow/react': /react-flow__/,
  dexie: /Dexie/,
  zod: /ZodError/,
  jszip: /JSZip/,
  pako: /pako|inflate/i,
  '@radix-ui': /data-radix|radix-/,
  'monaco-editor': /MonacoEnvironment/,
  elkjs: /org\.eclipse\.elk/,
  '@dashdb/core': /expand-contract|validateSchema|IR_VERSION/,
  'node-sql-parser': /node-sql-parser|sqlparser/i,
  prettier: /prettier/,
};
const args = new Set(process.argv.slice(2));

const log = (message) => {
  process.stderr.write(`[measure] ${message}
`);
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

async function measure() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const setup = await context.newPage();
  await setup.goto(`${BASE}/app`);
  await setup.getByRole('button', { name: 'New project' }).first().click();
  await setup.getByRole('dialog', { name: 'New project' }).getByLabel('Name').fill('Bundle');
  await setup.getByRole('button', { name: 'Create project' }).click();
  await setup.waitForURL(/\/app\/p\/[\w-]+$/);
  const editorUrl = setup.url();
  await setup.close();

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const scripts = [];
  page.on('response', async (response) => {
    if (response.request().resourceType() !== 'script' || !response.ok()) return;
    try {
      const body = await response.body();
      const text = body.toString('utf8');
      scripts.push({
        url: new URL(response.url()).pathname,
        raw: body.length,
        gzip: gzipSync(body).length,
        monaco: /monaco-editor|MonacoEnvironment/.test(text),
        hints: Object.entries(MARKERS)
          .filter(([, re]) => re.test(text))
          .map(([name]) => name),
      });
    } catch {
      // Navigation raced the body read; the chunk is re-requested and counted then.
    }
  });
  log(`loading ${editorUrl}`);
  await page.goto(editorUrl);
  await page.getByTestId('editor').waitFor();
  // Settle: wait until no new script has arrived for two seconds.
  let seen = -1;
  while (seen !== scripts.length) {
    seen = scripts.length;
    await page.waitForTimeout(2000);
  }
  await browser.close();
  return scripts;
}

log('starting next start');
const server = await startServer();
log('server ready');
let scripts;
try {
  scripts = await measure();
} finally {
  // Kill the whole tree: next start forks a worker that outlives a plain kill on Windows.
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F']);
  else server.kill();
}

const counted = scripts.filter((s) => !s.monaco);
const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;
const total = counted.reduce((sum, s) => sum + s.gzip, 0);
const report = {
  totalGzipKB: kb(total),
  totalRawKB: kb(counted.reduce((sum, s) => sum + s.raw, 0)),
  budgetKB: BUDGET_KB,
  chunks: scripts
    .sort((a, b) => b.gzip - a.gzip)
    .map((s) => ({
      url: s.url,
      gzipKB: kb(s.gzip),
      rawKB: kb(s.raw),
      monaco: s.monaco,
      hints: s.hints,
    })),
};

if (args.has('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Editor first load: ${String(report.totalGzipKB)} KB gzipped JS`);
  console.log(
    `(${String(report.totalRawKB)} KB raw, ${String(counted.length)} chunks, budget ${String(BUDGET_KB)} KB, Monaco excluded)\n`,
  );
  for (const c of report.chunks.slice(0, 15))
    console.log(
      `${String(c.gzipKB).padStart(8)} KB  ${c.url}${c.monaco ? '  (Monaco, excluded)' : ''}` +
        (c.hints.length ? `  [${c.hints.join(', ')}]` : ''),
    );
}
if (args.has('--budget') && report.totalGzipKB > BUDGET_KB) {
  console.error(`\nOver budget: ${String(report.totalGzipKB)} KB > ${String(BUDGET_KB)} KB`);
  process.exit(1);
}
