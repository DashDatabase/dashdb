const DEFAULT_API_URL = 'http://localhost:8787';

/** Base URL of `@dashdb/api`, without a trailing slash. */
export function getApiUrl(value: string | undefined = process.env.NEXT_PUBLIC_API_URL): string {
  return (value?.trim() || DEFAULT_API_URL).replace(/\/+$/, '');
}
