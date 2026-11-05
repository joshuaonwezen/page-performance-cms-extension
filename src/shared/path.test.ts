import {describe, expect, it} from 'vitest';

import {normalizePath, pathFromPublicUrl, routeMatches} from './path';

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

describe('routeMatches', () => {
  it('matches like the site middleware', () => {
    expect(routeMatches('/en', '/, /en')).toBe(true);
    expect(routeMatches('/', '/, /en')).toBe(true);
    expect(routeMatches('/en/personal-banking', '/, /en')).toBe(false);
    expect(routeMatches('/products/loans', '/products/*')).toBe(true);
    expect(routeMatches('/products', '/products/*')).toBe(true);
    expect(routeMatches('/productsx', '/products/*')).toBe(false);
    expect(routeMatches('/anything', '/*')).toBe(true);
  });

  it('treats an empty or missing route as every path', () => {
    expect(routeMatches('/savings', '')).toBe(true);
    expect(routeMatches('/savings', undefined)).toBe(true);
  });
});
