const DEFAULT_API_URL = 'http://localhost:8787';

/** Base URL of `@dashdb/api`, without a trailing slash. */
export function getApiUrl(value: string | undefined = process.env.NEXT_PUBLIC_API_URL): string {
  return (value?.trim() || DEFAULT_API_URL).replace(/\/+$/, '');
}

const DEFAULT_GITHUB_URL = 'https://github.com/DashDatabase/dashdb';

/** Public source repository, linked from the editor's and the marketing site's star buttons. */
export function getGithubUrl(
  value: string | undefined = process.env.NEXT_PUBLIC_GITHUB_URL,
): string {
  return value?.trim() || DEFAULT_GITHUB_URL;
}

/** `owner/repo` for a github.com repository URL, or null for anything else. */
export function githubRepoSlug(url: string = getGithubUrl()): string | null {
  const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url.trim());
  return match ? `${match[1] ?? ''}/${match[2] ?? ''}` : null;
}

/**
 * `cloud` is dashdb.dev: waitlist, pricing and "coming with DashDB Cloud" hints. `oss` is a
 * self-hosted build (the Docker image sets it): those are hidden and the waitlist action refuses
 * signups. A NEXT_PUBLIC_ variable, so it is fixed when the app is built.
 */
export type Edition = 'cloud' | 'oss';

export function getEdition(
  value: string | undefined = process.env.NEXT_PUBLIC_DASHDB_EDITION,
): Edition {
  return value?.trim().toLowerCase() === 'oss' ? 'oss' : 'cloud';
}

export function isCloudEdition(value?: string): boolean {
  return getEdition(value) === 'cloud';
}

const DEFAULT_SITE_URL = 'https://dashdb.dev';

/** Canonical origin of the public site (no trailing slash), used for canonical and OG URLs. */
export function getSiteUrl(value: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string {
  return (value?.trim() || DEFAULT_SITE_URL).replace(/\/+$/, '');
}
