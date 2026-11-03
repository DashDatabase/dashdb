import { createSchema } from '@dashdb/core/lite';
import { describe, expect, it, vi } from 'vitest';
import type { EditionProject } from '../providers';
import {
  allLocalEntitlements,
  createByokAIProvider,
  createLocalOnlySyncProvider,
  createOptInTelemetry,
  createOssProviders,
  noAuthProvider,
} from './providers';

const project: EditionProject = {
  id: 'p1',
  name: 'Shop',
  schema: createSchema('postgres', { id: 's1' }),
  revision: 3,
  createdAt: 1,
  updatedAt: 2,
};

describe('createLocalOnlySyncProvider', () => {
  it('saves and loads through the local store', async () => {
    const store = {
      save: vi.fn(() => Promise.resolve(4)),
      load: vi.fn(() => Promise.resolve(project)),
    };
    const sync = createLocalOnlySyncProvider(store);
    expect(sync.status()).toEqual({ state: 'local' });
    await expect(sync.push(project)).resolves.toBe(4);
    expect(store.save).toHaveBeenCalledWith(project);
    await expect(sync.pull('p1')).resolves.toBe(project);
    expect(store.load).toHaveBeenCalledWith('p1');
  });

  it('never reports remote changes', () => {
    const sync = createLocalOnlySyncProvider({
      save: () => Promise.resolve(0),
      load: () => Promise.resolve(null),
    });
    const listener = vi.fn();
    const unsubscribe = sync.onRemoteChange(listener);
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('noAuthProvider', () => {
  it('has no session and never changes', async () => {
    await expect(noAuthProvider.getSession()).resolves.toBeNull();
    const listener = vi.fn();
    noAuthProvider.onChange(listener)();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('createByokAIProvider', () => {
  it('is unavailable and answers not-configured without fetching', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const ai = createByokAIProvider();
    expect(ai.available()).toBe(false);
    await expect(ai.review(project.schema)).resolves.toMatchObject({
      ok: false,
      reason: 'not-configured',
    });
    await expect(ai.generate('a blog')).resolves.toMatchObject({
      ok: false,
      reason: 'not-configured',
    });
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});

describe('allLocalEntitlements', () => {
  it('grants every feature with no limits', () => {
    expect(allLocalEntitlements.has('cloud-sync')).toBe(true);
    expect(allLocalEntitlements.has('sso')).toBe(true);
    expect(allLocalEntitlements.limits()).toEqual({
      projects: Infinity,
      baselinesPerProject: Infinity,
      collaborators: Infinity,
    });
  });
});

describe('createOptInTelemetry', () => {
  const setup = (stored: boolean | null, withSend = true) => {
    let value = stored;
    const send = vi.fn();
    const telemetry = createOptInTelemetry({
      read: () => value,
      write: (optIn) => {
        value = optIn;
      },
      ...(withSend ? { send } : {}),
    });
    return { telemetry, send };
  };

  it('is off and sends nothing until the user opts in', () => {
    const { telemetry, send } = setup(null);
    expect(telemetry.isEnabled()).toBe(false);
    telemetry.track('baseline_saved', { reason: 'manual' });
    expect(send).not.toHaveBeenCalled();

    telemetry.setOptIn(true);
    expect(telemetry.isEnabled()).toBe(true);
    telemetry.track('baseline_saved', { reason: 'manual' });
    telemetry.track('migration_generated', { target: 'sql', risk: 'caution', ops_count: 3 });
    expect(send.mock.calls).toEqual([
      ['baseline_saved', { reason: 'manual' }],
      ['migration_generated', { target: 'sql', risk: 'caution', ops_count: 3 }],
    ]);

    telemetry.setOptIn(false);
    telemetry.track('baseline_saved', { reason: 'manual' });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('sends only catalogued properties, and drops invalid events', () => {
    const { telemetry, send } = setup(true);
    const leaky = { format: 'prisma', schema: 'model User { email String }', name: 'Acme' };
    telemetry.track('schema_imported', leaky as never);
    telemetry.track('schema_imported', { format: 'oracle' } as never);
    expect(send.mock.calls).toEqual([['schema_imported', { format: 'prisma' }]]);
  });

  it('drops events when opted in without a destination', () => {
    const { telemetry } = setup(true, false);
    expect(telemetry.isEnabled()).toBe(true);
    expect(() => {
      telemetry.track('baseline_saved', { reason: 'manual' });
    }).not.toThrow();
  });
});

describe('createOssProviders', () => {
  it('composes the Community providers', () => {
    const providers = createOssProviders({
      store: { save: () => Promise.resolve(0), load: () => Promise.resolve(null) },
      telemetry: { read: () => null, write: () => undefined },
    });
    expect(providers.sync.status()).toEqual({ state: 'local' });
    expect(providers.auth).toBe(noAuthProvider);
    expect(providers.ai.available()).toBe(false);
    expect(providers.entitlements).toBe(allLocalEntitlements);
    expect(providers.telemetry.isEnabled()).toBe(false);
  });
});
