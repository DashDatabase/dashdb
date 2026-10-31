import { describe, expect, it, vi } from 'vitest';
import { formatStars, getStarCount } from './github';

const reply = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(body), { status })));

describe('getStarCount', () => {
  it('reads stargazers_count from the repository API, revalidating hourly', async () => {
    const fetcher = reply({ stargazers_count: 1234 });
    expect(await getStarCount('DashDatabase/dashdb', fetcher)).toBe(1234);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe('https://api.github.com/repos/DashDatabase/dashdb');
    expect(init).toMatchObject({ next: { revalidate: 3600 } });
  });

  it('returns null instead of failing the build', async () => {
    expect(await getStarCount(null, reply({}))).toBeNull();
    expect(await getStarCount('a/b', reply({ message: 'Not Found' }, 404))).toBeNull();
    expect(await getStarCount('a/b', reply({ stargazers_count: '9' }))).toBeNull();
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')));
    expect(await getStarCount('a/b', offline)).toBeNull();
  });
});

describe('formatStars', () => {
  it('abbreviates thousands', () => {
    expect([0, 999, 1000, 1250, 12_400].map(formatStars)).toEqual([
      '0',
      '999',
      '1k',
      '1.3k',
      '12k',
    ]);
  });
});
