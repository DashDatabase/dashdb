// Records the home page demo video (public/media/demo.webm, ~20 s) and its poster by driving the
// real editor in Playwright's Chromium. Re-run it whenever the editor's look changes.
//
//   pnpm --filter @dashdb/web dev                     # or `build && start`, in another terminal
//   pnpm --filter @dashdb/web demo:record             # DEMO_BASE_URL defaults to localhost:3000
//
// The recording is trimmed to start once the editor is on screen, then re-encoded as VP9 with the
// ffmpeg that Playwright installs (`playwright install chromium` fetches it).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const BASE = (process.env.DEMO_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const SIZE = { width: 1280, height: 800 };
const TARGET_SECONDS = 20;
const outDir = fileURLToPath(new URL('../public/media/', import.meta.url));
const rawDir = join(tmpdir(), `dashdb-demo-${String(Date.now())}`);

const log = (message) => {
  process.stderr.write(`[demo] ${message}\n`);
};

/* eslint-disable security/detect-non-literal-fs-filename -- Playwright's own install folders */
function findFfmpeg() {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    process.platform === 'win32' && process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'ms-playwright')
      : null,
    join(
      homedir(),
      process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright',
    ),
  ].filter(Boolean);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root).filter((d) => d.startsWith('ffmpeg'))) {
      for (const exe of ['ffmpeg-win64.exe', 'ffmpeg-linux', 'ffmpeg-mac']) {
        const path = join(root, dir, exe);
        if (existsSync(path)) return path;
      }
    }
  }
  return 'ffmpeg';
}
/* eslint-enable security/detect-non-literal-fs-filename */

const pause = (page, ms) => page.waitForTimeout(ms);

/** Types like a person, so the viewer can follow. */
async function type(locator, text) {
  await locator.pressSequentially(text, { delay: 70 });
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: SIZE,
  deviceScaleFactor: 1,
  colorScheme: 'light',
  recordVideo: { dir: rawDir, size: SIZE },
});
// A returning visitor: no onboarding tour over the demo.
await context.addInitScript(() => {
  localStorage.setItem(
    'dashdb-onboarding',
    JSON.stringify({ status: 'dismissed', step: 0, projectId: null }),
  );
});
const page = await context.newPage();
const started = Date.now();

const canvas = page.getByTestId('canvas');
const tableNode = (name) => canvas.locator(`[data-testid="table-node"][data-table="${name}"]`);
const panel = page.getByTestId('migration-panel');

log(`recording against ${BASE}`);
await page.goto(`${BASE}/app`);
await page.getByRole('button', { name: 'From template' }).click();
await page.getByRole('menuitem', { name: /Blog/ }).click();
await page.getByTestId('editor').waitFor();
await tableNode('users').waitFor();
// Let the arrange animation finish, then zoom in a step so the tables are legible.
await pause(page, 1200);
await page.getByRole('button', { name: 'Zoom In' }).click();
await pause(page, 600);
// The video starts here.
const trimStart = (Date.now() - started) / 1000;

// 1. Baseline: "this is what production looks like".
await page.getByRole('tab', { name: 'Migration' }).click();
await pause(page, 600);
await page.getByTestId('baselines').getByRole('button', { name: 'Save baseline' }).click();
await pause(page, 1200);

// 2. Edit on the canvas: a new column on users.
await page.getByRole('button', { name: 'Actions for table users' }).click();
await pause(page, 500);
await page.getByRole('menuitem', { name: 'Add column' }).click();
const columnName = canvas.getByLabel('Column name');
await columnName.fill('');
await type(columnName, 'plan');
await columnName.press('Enter');
await pause(page, 800);

// A rename: safe for the database, but it breaks running app code, which the review flags.
await canvas.locator('[data-testid="column-row"][data-column="display_name"]').dblclick();
const renamed = canvas.getByLabel('Column name');
await renamed.fill('');
await type(renamed, 'full_name');
await renamed.press('Enter');
await pause(page, 800);

// 3. A new table, drawn from the keyboard.
await canvas.click({ position: { x: 40, y: 40 } });
await page.keyboard.press('t');
await tableNode('new_table').waitFor();
await tableNode('new_table').getByRole('heading', { name: 'new_table' }).dblclick();
const tableName = canvas.getByLabel('Table name');
await tableName.fill('');
await type(tableName, 'subscriptions');
await tableName.press('Enter');
await pause(page, 800);

// 4. Generate the migration and let the result (SQL + safety review) sit on screen.
await page.getByRole('tab', { name: 'Migration' }).click();
await pause(page, 500);
await type(panel.getByLabel('Name'), 'add plans');
await pause(page, 400);
await panel.getByRole('button', { name: /Generate migration/ }).click();
await panel.getByTestId('migration-result').waitFor();
// Bring the safety finding into view next to the SQL.
await panel.getByTestId('finding').first().scrollIntoViewIfNeeded();
await pause(page, 1500);

// eslint-disable-next-line security/detect-non-literal-fs-filename -- public/media in this package
mkdirSync(outDir, { recursive: true });
const posterPng = await page.screenshot();
const elapsed = (Date.now() - started) / 1000 - trimStart;
log(`scripted part: ${elapsed.toFixed(1)} s of ${String(TARGET_SECONDS)}`);
if (elapsed > TARGET_SECONDS) log('warning: longer than the target; the end will be cut');
// Hold the final frame so the clip reaches its target length.
await pause(page, Math.max(0, (TARGET_SECONDS - elapsed) * 1000));

await context.close();
const raw = await page.video()?.path();
await browser.close();
if (!raw) throw new Error('No video was recorded');

await sharp(posterPng).webp({ quality: 80 }).toFile(join(outDir, 'demo-poster.webp'));

const ffmpeg = findFfmpeg();
log(`encoding with ${ffmpeg}`);
const result = spawnSync(
  ffmpeg,
  [
    '-y',
    '-ss',
    trimStart.toFixed(2),
    '-i',
    raw,
    '-t',
    String(TARGET_SECONDS),
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '0',
    '-crf',
    '42',
    '-row-mt',
    '1',
    '-deadline',
    'good',
    '-cpu-used',
    '2',
    join(outDir, 'demo.webm'),
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);
rmSync(rawDir, { recursive: true, force: true });
if (result.status !== 0) throw new Error(`ffmpeg exited with ${String(result.status)}`);
log(`wrote ${join(outDir, 'demo.webm')} and demo-poster.webp`);
