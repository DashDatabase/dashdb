import { createSchema } from '@dashdb/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createParseClient,
  type ParseReply,
  type ParseRequest,
  type ParseWorker,
} from './parse-client';

class FakeWorker implements ParseWorker {
  onmessage: ((event: MessageEvent<ParseReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly requests: ParseRequest[] = [];
  terminated = false;
  postMessage(request: ParseRequest) {
    this.requests.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  reply(reply: ParseReply) {
    this.onmessage?.({ data: reply } as MessageEvent<ParseReply>);
  }
}

const request = { parser: 'prisma', text: 'model A {}', baseText: null } as const;
const result = { schema: createSchema('postgres', { id: 's' }), diagnostics: [] };

describe('createParseClient', () => {
  let workers: FakeWorker[];
  const client = (timeoutMs = 2000) =>
    createParseClient({
      timeoutMs,
      createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
    });

  beforeEach(() => {
    workers = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the worker reply', async () => {
    const parse = client().parse(request);
    const worker = workers[0];
    expect(worker?.requests[0]).toMatchObject({ id: 1, ...request });
    worker?.reply({ id: 1, result, base: null });
    await expect(parse).resolves.toEqual({ kind: 'parsed', result, base: null });
  });

  it('reports worker exceptions as failures', async () => {
    const parse = client().parse(request);
    workers[0]?.reply({ id: 1, error: 'boom' });
    await expect(parse).resolves.toEqual({ kind: 'failed', message: 'boom' });
  });

  it('times out, terminates the worker and starts a fresh one next time', async () => {
    const parses = client(2000);
    const parse = parses.parse(request);
    // Loading the worker doesn't count against the parse timeout.
    vi.advanceTimersByTime(5000);
    workers[0]?.reply({ ready: true });
    vi.advanceTimersByTime(1999);
    expect(workers[0]?.terminated).toBe(false);
    vi.advanceTimersByTime(1);
    await expect(parse).resolves.toEqual({ kind: 'timeout' });
    expect(workers[0]?.terminated).toBe(true);

    const next = parses.parse(request);
    expect(workers).toHaveLength(2);
    workers[1]?.reply({ id: 2, result, base: null });
    await expect(next).resolves.toMatchObject({ kind: 'parsed' });
  });

  it('fails when the worker never finishes loading', async () => {
    const parse = client().parse(request);
    vi.advanceTimersByTime(20_000);
    await expect(parse).resolves.toEqual({
      kind: 'failed',
      message: 'The parser did not start.',
    });
    expect(workers[0]?.terminated).toBe(true);
  });

  it('times a parse from the start once the worker is warm', async () => {
    const parses = client(2000);
    parses.warm();
    workers[0]?.reply({ ready: true });
    const parse = parses.parse(request);
    expect(workers).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    await expect(parse).resolves.toEqual({ kind: 'timeout' });
  });

  it('cancels a parse superseded by a newer one and ignores its late reply', async () => {
    const parses = client();
    const first = parses.parse(request);
    const second = parses.parse({ ...request, text: 'model B {}' });
    await expect(first).resolves.toEqual({ kind: 'cancelled' });
    workers[0]?.reply({ id: 1, result, base: null });
    workers[1]?.reply({ id: 2, result, base: null });
    await expect(second).resolves.toMatchObject({ kind: 'parsed' });
  });

  it('reports a crashed worker as a failure', async () => {
    const parse = client().parse(request);
    workers[0]?.onerror?.({ message: 'out of memory' } as ErrorEvent);
    await expect(parse).resolves.toEqual({ kind: 'failed', message: 'out of memory' });
    expect(workers[0]?.terminated).toBe(true);
  });

  it('dispose cancels the pending parse', async () => {
    const parses = client();
    const parse = parses.parse(request);
    parses.dispose();
    await expect(parse).resolves.toEqual({ kind: 'cancelled' });
  });
});
