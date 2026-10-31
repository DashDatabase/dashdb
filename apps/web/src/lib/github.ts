import 'server-only';
import { githubRepoSlug } from './config';

/** Star counts refresh at most hourly (ISR); pages using them set the same `revalidate`. */
export const STARS_REVALIDATE_SECONDS = 3600;

/**
 * The repository's stargazer count from the GitHub REST API, or null when it can't be read
 * (no repository configured, rate-limited, offline build). The page then shows the button
 * without a count rather than failing the build.
 */
export async function getStarCount(
  slug: string | null = githubRepoSlug(),
  fetcher: typeof fetch = fetch,
): Promise<number | null> {
  if (!slug) return null;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'dashdb-site',
  };
  // Optional: raises the unauthenticated limit (60 requests/hour per IP) for CI builds.
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const response = await fetcher(`https://api.github.com/repos/${slug}`, {
      headers,
      next: { revalidate: STARS_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const stars =
      typeof body === 'object' && body !== null && 'stargazers_count' in body
        ? body.stargazers_count
        : null;
    return typeof stars === 'number' && Number.isSafeInteger(stars) && stars >= 0 ? stars : null;
  } catch {
    return null;
  }
}

/** "1.2k"-style count for the star button. */
export function formatStars(count: number): string {
  if (count < 1000) return String(count);
  const thousands = count / 1000;
  return `${thousands >= 10 ? Math.round(thousands).toString() : thousands.toFixed(1).replace(/\.0$/, '')}k`;
}
