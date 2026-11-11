import type {ActionName, ActionParams} from '../../shared/types';
import {ActionError} from './errors';

// The path ends up in a GA4 report filter and in route matching, and both values come
// from the editor's browser, so each is checked against an allow-list here, before any
// handler runs.

const MAX_PATH = 2048;
// Letters, digits, the URL path punctuation (RFC 3986 unreserved and sub-delims, ':' and
// '@') and %XX escapes. No whitespace, control characters, backslashes, quotes or
// angle brackets. The CMS percent-encodes anything else in a page URL.
const PATH = /^\/(?:[A-Za-z0-9\-._~!$&'()*+,;=:@/]|%[0-9A-Fa-f]{2})*$/;
const LOCALE = /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/;
const DEFAULT_LOCALE = 'en';

function invalid(field: string, why: string): never {
  throw new ActionError('invalid_input', `${field}: ${why}`);
}

function str(raw: unknown, field: string, {optional = false, max}: {optional?: boolean; max: number}): string {
  if (raw === undefined || raw === null || raw === '') {
    if (optional) return '';
    invalid(field, 'required.');
  }
  if (typeof raw !== 'string') invalid(field, 'expected text.');
  if (raw.length > max) invalid(field, `at most ${max} characters.`);
  return raw;
}

/** The page's path on the site, e.g. /en/savings. */
export function pagePath(raw: unknown): string {
  const path = str(raw, 'Page URL', {max: MAX_PATH});
  if (!path.startsWith('/')) invalid('Page URL', 'must start with "/".');
  if (!PATH.test(path)) invalid('Page URL', 'contains characters a page URL can\'t have.');
  return path;
}

/** The open locale, 'en' when the editor sent none. */
export function locale(raw: unknown): string {
  const value = str(raw, 'Language', {optional: true, max: 35});
  if (value && !LOCALE.test(value)) invalid('Language', 'not a language code.');
  return value || DEFAULT_LOCALE;
}

type Parsers = {[A in ActionName]: (raw: Record<string, unknown>) => ActionParams[A]};

/** One parser per action: unknown fields are dropped, every kept field is checked. */
export const PARSERS: Parsers = {
  performance: (p) => ({path: pagePath(p.path), locale: locale(p.locale)}),
};

export function isAction(action: string): action is ActionName {
  return Object.prototype.hasOwnProperty.call(PARSERS, action);
}
