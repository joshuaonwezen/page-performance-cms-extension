import {describe, expect, it} from 'vitest';

import {pagePaths, routeCovers, visitorPaths} from './routes';

// routeCovers and visitorPaths cases from the Feature Experimentation extension's tests.

describe('routeCovers', () => {
  it('mirrors the site\'s routeMatches()', () => {
    expect(routeCovers('', '/anything')).toBe(true);
    expect(routeCovers('/*', '/a/b')).toBe(true);
    expect(routeCovers('/products/*', '/products')).toBe(true);
    expect(routeCovers('/products/*', '/products/loans/x')).toBe(true);
    expect(routeCovers('/products/*', '/productsx')).toBe(false);
    expect(routeCovers('/savings/', '/savings')).toBe(true);
    expect(routeCovers('/, /en', '/en/')).toBe(true);
    // Case-sensitive, like the site.
    expect(routeCovers('/Savings', '/savings')).toBe(false);
  });

  it('matches exact entries only on that path', () => {
    expect(routeCovers('/, /en', '/en/personal-banking')).toBe(false);
    expect(routeCovers('/, /en', '/')).toBe(true);
  });
});

describe('visitorPaths', () => {
  it('gives the primary language both URL forms', () => {
    // cms_personal_banking was created as /en/personal-banking, which English visitors never request.
    expect(visitorPaths('https://site.example/en/personal-banking/', 'en', 'en')).toEqual([
      '/personal-banking',
      '/en/personal-banking',
    ]);
    expect(visitorPaths('https://site.example/personal-banking', 'en', 'en')).toEqual([
      '/personal-banking',
      '/en/personal-banking',
    ]);
    expect(visitorPaths('https://site.example/', 'en', 'en')).toEqual(['/', '/en']);
  });

  it('follows the page, not a site setting, for the primary language', () => {
    // A site whose pages are created in Dutch first.
    expect(visitorPaths('https://site.example/nl/sparen', 'nl', 'nl')).toEqual(['/sparen', '/nl/sparen']);
  });

  it('keeps translations as the CMS reports them', () => {
    // A bare /about here would also be the English page.
    expect(visitorPaths('https://site.example/nl/about/', 'nl', 'en')).toEqual(['/nl/about']);
  });
});

describe('pagePaths', () => {
  it('checks the open path with and without the open locale\'s prefix', () => {
    expect(pagePaths('/en/savings', 'en')).toEqual(['/savings', '/en/savings']);
    expect(pagePaths('/savings', 'en')).toEqual(['/savings', '/en/savings']);
    expect(pagePaths('/', 'en')).toEqual(['/', '/en']);
    expect(pagePaths('/nl/about', 'nl')).toEqual(['/about', '/nl/about']);
  });
});
