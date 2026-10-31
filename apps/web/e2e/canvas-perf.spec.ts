// Canvas performance check. Opt-in (PERF=1) because timings depend on the machine; it needs the
// dev server, which exposes a hook on `window` to load the stress fixture and drive the viewport.
//   PERF=1 pnpm --filter @dashdb/web e2e canvas-perf
import { expect, test, type Page } from '@playwright/test';

test.skip(!process.env.PERF, 'Set PERF=1 to run the canvas performance check.');
test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}
interface CanvasHook {
  setViewport: (viewport: Viewport, options?: { duration?: number }) => Promise<boolean>;
  getViewport: () => Viewport;
  fitView: (options?: { duration?: number }) => Promise<boolean>;
  loadStress: (count: number) => Promise<void>;
}
interface FrameStats {
  fps: number;
  p95: number;
  longFrames: number;
}

type Scenario = 'pan' | 'zoom' | 'panAll';

/** Runs a viewport scenario in the page while recording animation frames. */
async function measure(page: Page, scenario: Scenario): Promise<FrameStats> {
  return page.evaluate(async (which) => {
    const hook = (window as unknown as { __dashdbCanvas: CanvasHook }).__dashdbCanvas;
    const frames: number[] = [];
    let recording = true;
    const tick = (now: number) => {
      frames.push(now);
      if (recording) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    if (which === 'pan') {
      // A long pan at the working zoom: nodes mount and unmount as they enter and leave view.
      await hook.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 0 });
      await hook.setViewport({ x: -6000, y: -3000, zoom: 1 }, { duration: 3000 });
    } else if (which === 'zoom') {
      await hook.setViewport({ x: -2000, y: -1000, zoom: 1.2 }, { duration: 0 });
      await hook.fitView({ duration: 2000 });
    } else {
      // Worst case: every table on screen at once.
      await hook.fitView({ duration: 0 });
      const v = hook.getViewport();
      await hook.setViewport({ x: v.x + 400, y: v.y + 200, zoom: v.zoom }, { duration: 2000 });
    }
    recording = false;
    const gaps = frames
      .slice(1)
      .map((t, i) => t - (frames[i] ?? t))
      .sort((a, b) => a - b);
    const duration = (frames.at(-1) ?? 0) - (frames[0] ?? 0);
    return {
      fps: Math.round(((frames.length - 1) / duration) * 10_000) / 10,
      p95: Math.round((gaps[Math.floor(gaps.length * 0.95)] ?? 0) * 10) / 10,
      longFrames: gaps.filter((g) => g > 50).length,
    };
  }, scenario);
}

for (const count of [300, 500]) {
  test(`${String(count)} tables`, async ({ page }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'New project' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New project' });
    await dialog.getByLabel('Name').fill(`Perf ${String(count)}`);
    await dialog.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByTestId('editor')).toBeVisible();

    await page.evaluate(
      (n) => (window as unknown as { __dashdbCanvas: CanvasHook }).__dashdbCanvas.loadStress(n),
      count,
    );
    await expect(page.getByTestId('table-count')).toHaveText(`${String(count)} tables`);
    const arrange = page.getByRole('button', { name: 'Arrange' });
    await expect(arrange).toBeDisabled();
    const started = Date.now();
    await expect(arrange).toBeEnabled({ timeout: 60_000 });
    const arrangeMs = Date.now() - started;
    await page.waitForTimeout(500);

    const results = {
      'pan @ zoom 1': await measure(page, 'pan'),
      'zoom out to fit': await measure(page, 'zoom'),
      'pan, all visible': await measure(page, 'panAll'),
    };
    console.log(
      `\n${String(count)} tables · arrange (ELK worker + animation) ${String(arrangeMs)} ms`,
    );
    console.table(results);
    test.info().annotations.push({
      type: 'perf',
      description: JSON.stringify({ count, arrangeMs, results }),
    });
    // Guard against gross regressions only; the documented numbers are the real check.
    expect(results['pan @ zoom 1'].fps).toBeGreaterThan(20);
  });
}
