// How the site's middleware reads a flag's route variable, copied from the Feature
// Experimentation extension (src/shared/experiment.ts) so both extensions match pages
// the same way.

/** One route entry, the way the site's routeMatches() reads it. */
type RouteEntry = {kind: 'all'} | {kind: 'exact'; path: string} | {kind: 'prefix'; path: string};

const stripSlash = (p: string) => p.replace(/\/+$/, '') || '/';

function routeEntries(route: string): RouteEntry[] {
  // An absent or empty route matches every path.
  if (!route.trim()) return [{kind: 'all'}];
  return route
    .split(',')
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((entry): RouteEntry => {
      if (entry === '/*') return {kind: 'all'};
      if (entry.endsWith('/*')) return {kind: 'prefix', path: stripSlash(entry.slice(0, -2))};
      return {kind: 'exact', path: stripSlash(entry)};
    });
}

function underPrefix(path: string, prefix: string): boolean {
  return prefix === '/' || path === prefix || path.startsWith(`${prefix}/`);
}

/** Whether the site applies a flag with this route on `path` (the raw request path). */
export function routeCovers(route: string, path: string): boolean {
  const target = stripSlash(path);
  return routeEntries(route).some((e) =>
    e.kind === 'all' ? true : e.kind === 'prefix' ? underPrefix(target, e.path) : e.path === target,
  );
}

/**
 * The paths visitors request this page on. The CMS's public URL is a starting point
 * only: sites differ on whether default-language URLs carry the locale prefix, and the
 * site's router compares the raw request path, so a route built from the wrong form
 * never applies. The page's primary language gets both forms (a form the site doesn't
 * use costs nothing); other languages keep the form the CMS reports, so a translation's
 * test never lands on a default-language page with the same slug.
 */
export function visitorPaths(publicUrl: string | undefined, locale: string, primaryLocale: string): string[] {
  if (!publicUrl) return [];
  let pathname: string;
  try {
    pathname = new URL(publicUrl, 'https://placeholder.invalid').pathname;
  } catch {
    return [];
  }
  const path = stripSlash(pathname);
  if (locale.toLowerCase() !== primaryLocale.toLowerCase()) return [path];

  const segments = path.split('/').filter(Boolean);
  const prefixed = segments[0]?.toLowerCase() === locale.toLowerCase();
  const bare = prefixed ? `/${segments.slice(1).join('/')}` : path;
  const withPrefix = `/${prefixed ? segments[0] : locale.toLowerCase()}${bare === '/' ? '' : bare}`;
  return [bare, withPrefix];
}

/**
 * The paths this extension checks for the open page: its path with and without the
 * open locale's prefix. The extension has no CMS API client, so it can't read the page's
 * primary language; it treats the open language as primary, the same two forms its GA4
 * filter counts. The cost: on a translation, an experiment routed to the bare slug of a
 * default-language page with the same slug shows here too.
 */
export function pagePaths(path: string, locale: string): string[] {
  return visitorPaths(path, locale, locale);
}
