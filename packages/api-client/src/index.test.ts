import { describe, expect, it, vi } from 'vitest';
import { createApiClient, getHealth } from './index';

describe('getHealth', () => {
  it('calls GET /health and parses the body', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
    const client = createApiClient('http://api.test', { fetch: fetchMock });

    await expect(getHealth(client)).resolves.toEqual({ ok: true });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://api.test/health');
  });

  it('throws on a non-2xx response', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }));
    const client = createApiClient('http://api.test', { fetch: fetchMock });

    await expect(getHealth(client)).rejects.toThrow(/503/);
  });
});
