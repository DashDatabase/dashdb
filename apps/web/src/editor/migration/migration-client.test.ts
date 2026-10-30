import { createSchema } from '@dashdb/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MigrationRequest, MigrationResponse } from './compute';
import { createMigrationClient, type MigrationWorker } from './migration-client';

class FakeWorker implements MigrationWorker {
  onmessage: MigrationWorker['onmessage'] = null;
  onerror: MigrationWorker['onerror'] = null;
  readonly ids: number[] = [];
  terminated = false;
  postMessage(message: { id: number; request: MigrationRequest }) {
    this.ids.push(message.id);
  }
  terminate() {
    this.terminated = true;
  }
  reply(id: number, response: MigrationResponse) {
    this.onmessage?.({ data: { id, response } } as MessageEvent<{
      id: number;
      response: MigrationResponse;
    }>);
  }
}

const schema = createSchema('postgres');
const request: MigrationRequest = {
  before: schema,
  after: schema,
  target: 'sql',
  name: 'x',
  confirmedRenames: [],
  now: 0,
};
const failure: MigrationResponse = { ok: false, message: 'nope' };

describe('createMigrationClient', () => {
  let workers: FakeWorker[];
  const client = () =>
    createMigrationClient({
      timeoutMs: 1000,
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

  it('resolves the latest request and supersedes older ones', async () => {
    const c = client();
    const first = c.generate(request);
    const second = c.generate(request);
    await expect(first).resolves.toBeNull();
    workers[0]?.reply(1, failure);
    workers[0]?.reply(2, failure);
    await expect(second).resolves.toEqual(failure);
    expect(workers).toHaveLength(1);
  });

  it('fails on a crashed worker and starts a new one next time', async () => {
    const c = client();
    const pending = c.generate(request);
    workers[0]?.onerror?.({ message: '' } as ErrorEvent);
    await expect(pending).resolves.toEqual({
      ok: false,
      message: 'Migration generation stopped unexpectedly.',
    });
    expect(workers[0]?.terminated).toBe(true);
    void c.generate(request);
    expect(workers).toHaveLength(2);
  });

  it('times out', async () => {
    const pending = client().generate(request);
    vi.advanceTimersByTime(1000);
    await expect(pending).resolves.toEqual({
      ok: false,
      message: 'Generating the migration took too long.',
    });
  });

  it('dispose resolves pending requests as superseded', async () => {
    const c = client();
    const pending = c.generate(request);
    c.dispose();
    await expect(pending).resolves.toBeNull();
    expect(workers[0]?.terminated).toBe(true);
  });
});
