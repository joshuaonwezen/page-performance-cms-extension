// The site path for the item open in the editor. ContentState.publicUrl is absolute
// (the CMS application host); the sidebar only needs its path.

/** "/" for the homepage, otherwise no trailing slash. Null when there is no URL (a block). */
export function pathFromPublicUrl(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null;
  let pathname: string;
  try {
    pathname = new URL(publicUrl, 'https://placeholder.invalid').pathname;
  } catch {
    return null;
  }
  return normalizePath(pathname);
}

export function normalizePath(path: string): string {
  const clean = `/${path.split(/[?#]/)[0]}`.replace(/\/{2,}/g, '/');
  return clean.length > 1 ? clean.replace(/\/+$/, '') : '/';
}

/**
 * Whether a flag's cms_route covers `path`, by the rules of routeMatches() in the
 * site's middleware: comma-separated entries, "/*" for everything, "/x/*" for a prefix
 * (including "/x" itself), otherwise exact. An empty route covers every path.
 */
export function routeMatches(path: string, cmsRoute: string | null | undefined): boolean {
  if (!cmsRoute || !cmsRoute.trim()) return true;
  const clean = path.replace(/\/$/, '') || '/';
  return cmsRoute.split(',').some((raw) => {
    const entry = raw.trim();
    if (!entry) return false;
    if (entry === '/*') return true;
    if (entry.endsWith('/*')) {
      const prefix = entry.slice(0, -2).replace(/\/$/, '') || '/';
      return clean === prefix || clean.startsWith(`${prefix}/`);
    }
    return clean === (entry.replace(/\/$/, '') || '/');
  });
}
