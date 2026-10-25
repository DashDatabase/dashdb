import { describe, expect, it } from 'vitest';
import { getApiUrl } from './config';

describe('getApiUrl', () => {
  it('falls back to the local API', () => {
    expect(getApiUrl('')).toBe('http://localhost:8787');
  });

  it('strips trailing slashes', () => {
    expect(getApiUrl('https://api.example.com//')).toBe('https://api.example.com');
  });
});
