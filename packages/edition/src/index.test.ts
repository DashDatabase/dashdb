import { describe, expect, it } from 'vitest';
import { getEdition, isCloudEdition } from './index';

describe('getEdition', () => {
  it('is cloud unless OSS mode is asked for', () => {
    expect(getEdition('')).toBe('cloud');
    expect(getEdition('enterprise')).toBe('cloud');
    expect(getEdition(' OSS ')).toBe('oss');
    expect(isCloudEdition('oss')).toBe(false);
    expect(isCloudEdition('cloud')).toBe(true);
  });
});
