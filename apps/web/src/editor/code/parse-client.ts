// Main-thread side of Code panel parsing: one request at a time, each with a hard timeout.
import type { ParseResult, Schema } from '@dashdb/core/lite';
import type { ImportFormat } from '../formats';

export const PARSE_TIMEOUT_MS = 2000;
/** Loading the worker (parsers included) is not parsing; it gets its own, generous limit. */
export const STARTUP_TIMEOUT_MS = 20_000;

export interface ParseRequest {
  readonly id: number;
  readonly parser: ImportFormat;
  readonly text: string;
  /** The text as last synced with the canvas; its parse is the base of a three-way merge. */
  readonly baseText: string | null;
}

export type ParseReply =
  /** Posted once the worker script has loaded. */
  | { readonly ready: true }
  | { readonly id: number; readonly result: ParseResult; readonly base: Schema | null }
  | { readonly id: number; readonly error: string };

export type ParseOutcome =
  | { readonly kind: 'parsed'; readonly result: ParseResult; readonly base: Schema | null }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'timeout' }
  /** Superseded by a newer request before it finished. */
  | { readonly kind: 'cancelled' };

/** The subset of `Worker` the client needs, so tests can supply a fake. */
export interface ParseWorker {
  onmessage: ((event: MessageEvent<ParseReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (request: ParseRequest) => void;
  terminate: () => void;
}

export interface ParseClient {
  parse: (request: Omit<ParseRequest, 'id'>) => Promise<ParseOutcome>;
  /** Starts the worker ahead of the first parse. */
  warm: () => void;
  dispose: () => void;
}

const defaultWorker = (): ParseWorker =>
  new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });

/**
 * Starting a new parse cancels the one in flight. A parse that runs past the timeout (counted
 * from when the worker is ready) or a worker that crashes terminates the worker; the next
 * request starts a fresh one.
 */
export function createParseClient(
  options: { createWorker?: () => ParseWorker; timeoutMs?: number; startupTimeoutMs?: number } = {},
): ParseClient {
  const createWorker = options.createWorker ?? defaultWorker;
  const timeoutMs = options.timeoutMs ?? PARSE_TIMEOUT_MS;
  const startupTimeoutMs = options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS;
  let worker: ParseWorker | null = null;
  let ready = false;
  let nextId = 0;
  let pending: {
    id: number;
    /** Starts the parse timeout; called once the worker is ready. */
    start: () => void;
    finish: (outcome: ParseOutcome) => void;
  } | null = null;

  const kill = () => {
    worker?.terminate();
    worker = null;
    ready = false;
  };

  const settle = (outcome: ParseOutcome) => {
    const current = pending;
    pending = null;
    current?.finish(outcome);
  };

  const getWorker = (): ParseWorker => {
    if (worker) return worker;
    const created = createWorker();
    created.onmessage = (event) => {
      const reply = event.data;
      if ('ready' in reply) {
        ready = true;
        pending?.start();
        return;
      }
      if (pending?.id !== reply.id) return;
      settle(
        'error' in reply
          ? { kind: 'failed', message: reply.error }
          : { kind: 'parsed', result: reply.result, base: reply.base },
      );
    };
    created.onerror = (event) => {
      kill();
      settle({ kind: 'failed', message: event.message || 'The parser stopped unexpectedly.' });
    };
    worker = created;
    return created;
  };

  return {
    parse: (request) => {
      if (pending) {
        // The worker is busy with stale text; a fresh one starts faster than waiting it out.
        kill();
        settle({ kind: 'cancelled' });
      }
      const id = ++nextId;
      const target = getWorker();
      return new Promise<ParseOutcome>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const expire = (outcome: ParseOutcome) => () => {
          if (pending?.id !== id) return;
          kill();
          settle(outcome);
        };
        pending = {
          id,
          start: () => {
            clearTimeout(timer);
            timer = setTimeout(expire({ kind: 'timeout' }), timeoutMs);
          },
          finish: (outcome) => {
            clearTimeout(timer);
            resolve(outcome);
          },
        };
        if (ready) pending.start();
        else {
          timer = setTimeout(
            expire({ kind: 'failed', message: 'The parser did not start.' }),
            startupTimeoutMs,
          );
        }
        // Messages posted before the worker script loads are queued, not lost.
        target.postMessage({ id, ...request });
      });
    },
    warm: () => {
      getWorker();
    },
    dispose: () => {
      kill();
      settle({ kind: 'cancelled' });
    },
  };
}
