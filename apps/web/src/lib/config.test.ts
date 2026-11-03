import { describe, expect, it } from 'vitest';
import {
  getApiUrl,
  getEdition,
  getGithubUrl,
  getSiteUrl,
  githubRepoSlug,
  isCloudEdition,
} from './config';

describe('getEdition', () => {
  it('is cloud unless OSS mode is asked for', () => {
    expect(getEdition('')).toBe('cloud');
    expect(getEdition('enterprise')).toBe('cloud');
    expect(getEdition(' OSS ')).toBe('oss');
    expect(isCloudEdition('oss')).toBe(false);
    expect(isCloudEdition('cloud')).toBe(true);
  });
});

describe('getApiUrl', () => {
  it('falls back to the local API', () => {
    expect(getApiUrl('')).toBe('http://localhost:8787');
  });

  it('strips trailing slashes', () => {
    expect(getApiUrl('https://api.example.com//')).toBe('https://api.example.com');
  });
});

describe('getGithubUrl', () => {
  it('falls back to the default repository', () => {
    expect(getGithubUrl(' ')).toBe('https://github.com/DashDatabase/dashdb');
    expect(getGithubUrl('https://github.com/acme/dashdb')).toBe('https://github.com/acme/dashdb');
  });
});

describe('githubRepoSlug', () => {
  it('extracts owner/repo from github.com URLs only', () => {
    expect(githubRepoSlug('https://github.com/DashDatabase/dashdb')).toBe('DashDatabase/dashdb');
    expect(githubRepoSlug('https://github.com/acme/db.js.git/')).toBe('acme/db.js');
    expect(githubRepoSlug('https://gitlab.com/acme/dashdb')).toBeNull();
    expect(githubRepoSlug('https://github.com/acme')).toBeNull();
    expect(githubRepoSlug('https://github.com/acme/x/../../evil')).toBeNull();
  });
});

describe('getSiteUrl', () => {
  it('falls back to the production origin and strips trailing slashes', () => {
    expect(getSiteUrl(undefined)).toBe('https://dashdb.dev');
    expect(getSiteUrl('http://localhost:3000/')).toBe('http://localhost:3000');
  });
});
