import {describe, expect, it} from 'vitest';

import {isAction, locale, pagePath, PARSERS} from './validate';

describe('pagePath', () => {
  it('accepts site paths, including escapes and URL punctuation', () => {
    for (const p of ['/', '/en/savings', '/caf%C3%A9', '/a-b_c.d~e', '/products/loans;v=1', '/__v_homepage--business']) {
      expect(pagePath(p)).toBe(p);
    }
  });

  it('rejects missing, relative and oversized paths', () => {
    expect(() => pagePath(undefined)).toThrow(/required/);
    expect(() => pagePath(42)).toThrow(/text/);
    expect(() => pagePath('savings')).toThrow(/start with/);
    expect(() => pagePath(`/${'a'.repeat(2048)}`)).toThrow(/at most 2048/);
  });

  it('rejects characters a page URL cannot carry', () => {
    for (const p of ['/a b', '/a\tb', '/a\nb', '/a\u0000b', '/a\\b', '/a"b', '/<script>', '/a%zz', '/a%2']) {
      expect(() => pagePath(p)).toThrow(/characters/);
    }
  });
});

describe('locale', () => {
  it('accepts locale codes and defaults to en', () => {
    expect(locale('nl')).toBe('nl');
    expect(locale('ja-JP')).toBe('ja-JP');
    expect(locale('zh_Hant_TW')).toBe('zh_Hant_TW');
    expect(locale(undefined)).toBe('en');
    expect(locale('')).toBe('en');
  });

  it('rejects anything else', () => {
    for (const l of ['en/../x', 'e', 'english!', 'en-', 'x'.repeat(40)]) expect(() => locale(l)).toThrow(/Language/);
  });
});

describe('PARSERS', () => {
  it('keeps the checked fields only', () => {
    expect(PARSERS.performance({path: '/en/savings', locale: 'en', extra: 'x'})).toEqual({path: '/en/savings', locale: 'en'});
  });

  it('knows its actions', () => {
    expect(isAction('performance')).toBe(true);
    expect(isAction('toString')).toBe(false);
    expect(isAction('constructor')).toBe(false);
  });
});
