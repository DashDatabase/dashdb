// Main-thread side of migration generation: the latest request wins.
import type { MigrationRequest, MigrationResponse } from './compute';

/** A generous ceiling: a 300-table schema takes well under a second. */
export const GENERATE_TIMEOUT_MS = 30_000;

type Reply = { readonly id: number; readonly response: MigrationResponse };

/** The subset of `Worker` the client needs, so tests can supply a fake. */
export interface MigrationWorker {
  onmessage: ((event: MessageEvent<Reply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (message: { id: number; request: MigrationRequest }) => void;
  terminate: () => void;
}

export interface MigrationClient {
  /** Resolves with the response, or null when a newer request superseded this one. */
  generate: (request: MigrationRequest) => Promise<MigrationResponse | null>;
  dispose: () => void;
}

const defaultWorker = (): MigrationWorker =>
  new Worker(new URL('./migration.worker.ts', import.meta.url), { type: 'module' });

export function createMigrationClient(
  options: { createWorker?: () => MigrationWorker; timeoutMs?: number } = {},
): MigrationClient {
  const createWorker = options.createWorker ?? defaultWorker;
  const timeoutMs = options.timeoutMs ?? GENERATE_TIMEOUT_MS;
  let worker: MigrationWorker | null = null;
  let latest = 0;
  const waiting = new Map<number, (response: MigrationResponse | null) => void>();

  const finish = (id: number, response: MigrationResponse | null) => {
    const resolve = waiting.get(id);
    waiting.delete(id);
    resolve?.(id === latest ? response : null);
  };

  const fail = (message: string) => {
    worker?.terminate();
    worker = null;
    for (const id of [...waiting.keys()]) finish(id, { ok: false, message });
  };

  const getWorker = (): MigrationWorker => {
    if (worker) return worker;
    const created = createWorker();
    created.onmessage = (event) => {
      finish(event.data.id, event.data.response);
    };
    created.onerror = (event) => {
      fail(event.message || 'Migration generation stopped unexpectedly.');
    };
    worker = created;
    return created;
  };

  return {
    generate: (request) => {
      const id = ++latest;
      // Older requests still run to completion in the worker, but resolve as superseded.
      for (const older of [...waiting.keys()]) finish(older, null);
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (waiting.has(id)) fail('Generating the migration took too long.');
        }, timeoutMs);
        waiting.set(id, (response) => {
          clearTimeout(timer);
          resolve(response);
        });
        getWorker().postMessage({ id, request });
      });
    },
    dispose: () => {
      for (const id of [...waiting.keys()]) finish(id, null);
      worker?.terminate();
      worker = null;
    },
  };
}
