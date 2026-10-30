// Main-thread side of auto-layout: talks to the worker and animates nodes into place.
import type { LayoutPositions, LayoutRequest } from './elk';

type Reply = { id: number; positions: LayoutPositions } | { id: number; error: string };

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<
  number,
  { resolve: (p: LayoutPositions) => void; reject: (e: Error) => void }
>();

function getWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
  created.onmessage = (event: MessageEvent<Reply>) => {
    const reply = event.data;
    const waiter = pending.get(reply.id);
    if (!waiter) return;
    pending.delete(reply.id);
    if ('error' in reply) waiter.reject(new Error(reply.error));
    else waiter.resolve(reply.positions);
  };
  created.onerror = (event) => {
    for (const waiter of pending.values())
      waiter.reject(new Error(event.message || 'Layout worker failed'));
    pending.clear();
    created.terminate();
    worker = null;
  };
  worker = created;
  return created;
}

/** Runs ELK in a Web Worker. Resolves with snapped top-left positions per node. */
export function layoutInWorker(request: LayoutRequest): Promise<LayoutPositions> {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, request });
  });
}

export const ARRANGE_DURATION_MS = 400;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Tweens positions from `from` to `to`, calling `onFrame` each animation frame. Resolves when
 * done; `duration` 0 (e.g. reduced motion) jumps straight to the end.
 */
export function animatePositions(
  from: LayoutPositions,
  to: LayoutPositions,
  duration: number,
  onFrame: (positions: LayoutPositions) => void,
): Promise<void> {
  const ids = Object.keys(to);
  return new Promise((resolve) => {
    if (duration <= 0) {
      onFrame(to);
      resolve();
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const k = easeInOut(t);
      const frame: LayoutPositions = {};
      for (const id of ids) {
        const end = to[id];
        if (!end) continue;
        const begin = from[id] ?? end;
        frame[id] = { x: begin.x + (end.x - begin.x) * k, y: begin.y + (end.y - begin.y) * k };
      }
      onFrame(frame);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}
