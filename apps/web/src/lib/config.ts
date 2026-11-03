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

const DEFAULT_SITE_URL = 'https://dashdb.dev';

/** Canonical origin of the public site (no trailing slash), used for canonical and OG URLs. */
export function getSiteUrl(value: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string {
  return (value?.trim() || DEFAULT_SITE_URL).replace(/\/+$/, '');
}
