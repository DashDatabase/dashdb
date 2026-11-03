import { describe, expect, it, vi } from 'vitest';
import { clientKey, createRateLimiter } from './rate-limit';
import { resendStore, saveSignup, storesFromEnv, type SubscriberStore } from './store';
import { parseSignup } from './validate';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe('parseSignup', () => {
  it('normalizes the address and keeps known source paths only', () => {
    expect(parseSignup(form({ email: '  Ada@Example.COM ', source: '/pricing' }))).toEqual({
      kind: 'ok',
      email: 'ada@example.com',
      source: '/pricing',
    });
    expect(parseSignup(form({ email: 'a@b.co', source: '<script>' }))).toMatchObject({
      source: 'unknown',
    });
  });

  it('rejects invalid, missing, oversized and non-string emails', () => {
    expect(parseSignup(form({ email: 'nope' }))).toMatchObject({ kind: 'invalid' });
    expect(parseSignup(form({}))).toMatchObject({ kind: 'invalid' });
    expect(parseSignup(form({ email: `${'a'.repeat(250)}@b.co` }))).toMatchObject({
      kind: 'invalid',
    });
    const withFile = new FormData();
    withFile.set('email', new Blob(['a@b.co']), 'email.txt');
    expect(parseSignup(withFile)).toMatchObject({ kind: 'invalid' });
  });

  it('spots bots through the honeypot', () => {
    expect(parseSignup(form({ email: 'a@b.co', website: 'http://spam' }))).toEqual({ kind: 'bot' });
    expect(parseSignup(form({ email: 'a@b.co', website: '' }))).toMatchObject({ kind: 'ok' });
  });
});

describe('createRateLimiter', () => {
  it('allows `limit` hits per window, per key', () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => now });
    expect([limiter.take('a'), limiter.take('a'), limiter.take('a')]).toEqual([true, true, false]);
    expect(limiter.take('b')).toBe(true);
    now = 1001;
    expect(limiter.take('a')).toBe(true);
  });

  it('bounds memory by dropping the least recently used key', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2, now: () => 0 });
    limiter.take('a');
    limiter.take('b');
    limiter.take('c'); // evicts "a"
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('c')).toBe(false);
  });
});

describe('clientKey', () => {
  const headers = (init: Record<string, string>) => new Headers(init);

  it('trusts the entry the nearest proxy appended, not client-supplied ones', () => {
    expect(clientKey(headers({ 'x-forwarded-for': 'spoofed, 203.0.113.9' }))).toBe('203.0.113.9');
    expect(clientKey(headers({ 'x-real-ip': '198.51.100.1' }))).toBe('198.51.100.1');
    expect(clientKey(headers({}))).toBe('unknown');
    expect(clientKey(headers({ 'x-forwarded-for': 'x'.repeat(500) }))).toHaveLength(64);
  });
});

describe('stores', () => {
  it('are configured only from the environment variables that are set', () => {
    expect(storesFromEnv({})).toEqual([]);
    expect(storesFromEnv({ RESEND_API_KEY: 'k' })).toEqual([]);
    const audience = '78261eea-8f8b-4381-83c6-79fa7120f1cf';
    expect(
      storesFromEnv({ RESEND_API_KEY: 'k', RESEND_AUDIENCE_ID: audience }).map((s) => s.name),
    ).toEqual(['resend']);
    expect(() =>
      storesFromEnv({ RESEND_API_KEY: 'k', RESEND_AUDIENCE_ID: '../../emails' }),
    ).toThrow(/UUID/);
  });

  it('posts contacts to the Resend audience', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}', { status: 201 })));
    const audience = '78261eea-8f8b-4381-83c6-79fa7120f1cf';
    await resendStore('key', audience, fetcher).add('a@b.co', '/');
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(`https://api.resend.com/audiences/${audience}/contacts`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ email: 'a@b.co', unsubscribed: false });
  });

  it('saves when at least one store succeeds, without logging the address', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ok: SubscriberStore = { name: 'ok', add: () => Promise.resolve() };
    const broken: SubscriberStore = {
      name: 'broken',
      add: () => Promise.reject(new Error('down')),
    };
    expect(await saveSignup([], 'a@b.co', '/')).toBe('unconfigured');
    expect(await saveSignup([broken, ok], 'secret@b.co', '/')).toBe('saved');
    expect(await saveSignup([broken], 'secret@b.co', '/')).toBe('failed');
    expect(JSON.stringify(error.mock.calls)).not.toContain('secret@b.co');
    error.mockRestore();
  });
});
