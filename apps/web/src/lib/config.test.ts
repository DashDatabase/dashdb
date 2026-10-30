import { describe, expect, it } from 'vitest';
import { getApiUrl, getGithubUrl } from './config';

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
    expect(getGithubUrl(' ')).toBe('https://github.com/dashdb/dashdb');
    expect(getGithubUrl('https://github.com/acme/dashdb')).toBe('https://github.com/acme/dashdb');
  });
});
