import {describe, expect, it} from 'vitest';

import {normalizePath, pathFromPublicUrl} from './path';

describe('pathFromPublicUrl', () => {
  it('keeps only the path, without a trailing slash', () => {
    expect(pathFromPublicUrl('https://app-x.cms.optimizely.com/en/about/')).toBe('/en/about');
    expect(pathFromPublicUrl('https://site.example/')).toBe('/');
    expect(pathFromPublicUrl('/savings?x=1')).toBe('/savings');
  });

  it('is null without a URL', () => {
    expect(pathFromPublicUrl(undefined)).toBeNull();
    expect(pathFromPublicUrl('')).toBeNull();
  });

  it('collapses slashes', () => {
    expect(normalizePath('//a//b/')).toBe('/a/b');
  });
});
