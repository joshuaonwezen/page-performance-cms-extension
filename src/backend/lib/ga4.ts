import {createSign} from 'node:crypto';

import type {Ga4Report, Ga4Totals} from '../../shared/types';
import {requestJson} from './http';

// GA4 Data API for the Performance sidebar. Authenticates as a service account with a
// self-signed JWT (RS256 via node:crypto), so the app needs no Google SDK dependency.

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface Ga4Config {
  propertyId: string;
  serviceAccount: ServiceAccount;
}

const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta';
const TOKEN_LIFETIME_S = 3600;
const RENEW_MARGIN_S = 300;

export function parseServiceAccount(json: string | undefined): ServiceAccount | null {
  if (!json?.trim()) return null;
  try {
    const parsed = JSON.parse(json) as Partial<ServiceAccount>;
    if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') return null;
    if (!parsed.private_key.includes('PRIVATE KEY')) return null;
    return {client_email: parsed.client_email, private_key: parsed.private_key, token_uri: parsed.token_uri};
  } catch {
    return null;
  }
}

const base64url = (input: string | Buffer) => Buffer.from(input).toString('base64url');

export function signJwt(sa: ServiceAccount, nowS: number): string {
  const header = base64url(JSON.stringify({alg: 'RS256', typ: 'JWT'}));
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: sa.token_uri || DEFAULT_TOKEN_URI,
      iat: nowS,
      exp: nowS + TOKEN_LIFETIME_S,
    }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key);
  return `${header}.${claims}.${base64url(signature)}`;
}

// A function instance may serve several invocations; reuse its token until near expiry.
const tokens = new Map<string, {token: string; expiresAt: number}>();

export async function accessToken(sa: ServiceAccount): Promise<string> {
  const nowS = Math.floor(Date.now() / 1000);
  const cached = tokens.get(sa.client_email);
  if (cached && cached.expiresAt - RENEW_MARGIN_S > nowS) return cached.token;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: signJwt(sa, nowS),
  });
  const result = await requestJson<{access_token: string; expires_in?: number}>(
    'ga4',
    'Google token',
    sa.token_uri || DEFAULT_TOKEN_URI,
    {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: body.toString()},
  );
  const token = result?.access_token ?? '';
  tokens.set(sa.client_email, {token, expiresAt: nowS + (result?.expires_in ?? TOKEN_LIFETIME_S)});
  return token;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A GA4 FULL_REGEXP for every pagePath that is this page: with or without the locale
 * prefix (instances index pages bare or under /en/, and the fake-data property uses
 * /en/...), and with any `__v_` variation segments the Web Experimentation soft-nav adds.
 */
export function pagePathRegex(path: string, locale: string): string {
  const withoutLocale = path.replace(new RegExp(`^/${escapeRegex(locale)}(?=/|$)`, 'i'), '') || '/';
  const base = withoutLocale === '/' ? '' : escapeRegex(withoutLocale.replace(/\/+$/, ''));
  const prefix = locale ? `(/${escapeRegex(locale.toLowerCase())})?` : '';
  return `^${prefix}${base}(/__v_[^/]+)*/?$`;
}

/** "base" for a path with no variation segment, else the WX variation name. */
export function variantOf(pagePath: string): string {
  const match = /\/__v_wx--([^/]+)/.exec(pagePath);
  if (match) return match[1];
  const fx = /\/__v_([^/]+)--([^/]+)/.exec(pagePath);
  return fx ? fx[2] : 'base';
}

interface ReportRow {
  dimensionValues?: Array<{value?: string}>;
  metricValues?: Array<{value?: string}>;
}

interface RunReportResponse {
  rows?: ReportRow[];
}

const TOTAL_METRICS = ['screenPageViews', 'activeUsers', 'engagementRate', 'userEngagementDuration', 'keyEvents'];
const CURRENT = {startDate: '27daysAgo', endDate: 'today', name: 'current'};
const PREVIOUS = {startDate: '55daysAgo', endDate: '28daysAgo', name: 'previous'};

const num = (v: string | undefined) => (v === undefined || v === '' ? 0 : Number(v) || 0);

function totalsFrom(row: ReportRow | undefined): Ga4Totals {
  const m = (row?.metricValues ?? []).map((v) => num(v.value));
  const users = m[1] ?? 0;
  return {
    views: m[0] ?? 0,
    users,
    engagementRate: m[2] ?? 0,
    engagementSeconds: users > 0 ? (m[3] ?? 0) / users : 0,
    keyEvents: m[4] ?? 0,
  };
}

/** YYYYMMDD -> YYYY-MM-DD, for every day in the range (GA4 omits days with no rows). */
function fillDays(rows: ReportRow[], days: number, today = new Date()): Array<{date: string; views: number}> {
  const byDate = new Map(rows.map((r) => [r.dimensionValues?.[0]?.value ?? '', num(r.metricValues?.[0]?.value)]));
  const out: Array<{date: string; views: number}> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    out.push({date: key, views: byDate.get(key.replace(/-/g, '')) ?? 0});
  }
  return out;
}

export function buildReport(
  propertyId: string,
  pathFilter: string,
  reports: RunReportResponse[],
  today = new Date(),
): Ga4Report {
  const [totals, daily, sources, paths] = reports;
  // Two date ranges add a dateRange dimension holding the range's name.
  const rangeRow = (name: string) => totals?.rows?.find((r) => r.dimensionValues?.some((d) => d.value === name));

  const variants = new Map<string, {views: number; users: number}>();
  for (const row of paths?.rows ?? []) {
    const variant = variantOf(row.dimensionValues?.[0]?.value ?? '');
    const entry = variants.get(variant) ?? {views: 0, users: 0};
    entry.views += num(row.metricValues?.[0]?.value);
    entry.users += num(row.metricValues?.[1]?.value);
    variants.set(variant, entry);
  }

  return {
    propertyId,
    pathFilter,
    totals: totalsFrom(rangeRow(CURRENT.name)),
    previous: totalsFrom(rangeRow(PREVIOUS.name)),
    daily: fillDays(daily?.rows ?? [], 28, today),
    sources: (sources?.rows ?? []).map((r) => ({
      name: r.dimensionValues?.[0]?.value || '(not set)',
      views: num(r.metricValues?.[0]?.value),
    })),
    variants: [...variants.entries()]
      .map(([variant, v]) => ({variant, ...v}))
      .sort((a, b) => b.views - a.views),
  };
}

export async function pageReport(config: Ga4Config, path: string, locale: string): Promise<Ga4Report> {
  const pathFilter = pagePathRegex(path, locale);
  const dimensionFilter = {
    filter: {fieldName: 'pagePath', stringFilter: {matchType: 'FULL_REGEXP', value: pathFilter}},
  };
  const requests = [
    {dateRanges: [CURRENT, PREVIOUS], metrics: TOTAL_METRICS.map((name) => ({name})), dimensionFilter},
    {
      dateRanges: [CURRENT],
      dimensions: [{name: 'date'}],
      metrics: [{name: 'screenPageViews'}],
      dimensionFilter,
      orderBys: [{dimension: {dimensionName: 'date'}}],
    },
    {
      dateRanges: [CURRENT],
      dimensions: [{name: 'sessionSourceMedium'}],
      metrics: [{name: 'screenPageViews'}],
      dimensionFilter,
      orderBys: [{metric: {metricName: 'screenPageViews'}, desc: true}],
      limit: 5,
    },
    {
      dateRanges: [CURRENT],
      dimensions: [{name: 'pagePath'}],
      metrics: [{name: 'screenPageViews'}, {name: 'activeUsers'}],
      dimensionFilter,
      limit: 50,
    },
  ];

  const token = await accessToken(config.serviceAccount);
  const result = await requestJson<{reports?: RunReportResponse[]}>(
    'ga4',
    'GA4 report',
    `${DATA_API}/properties/${config.propertyId}:batchRunReports`,
    {
      method: 'POST',
      headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({requests}),
    },
  );
  return buildReport(config.propertyId, pathFilter, result?.reports ?? []);
}

/** A one-row report, to prove the property and the service account's access in settings. */
export async function checkAccess(config: Ga4Config): Promise<void> {
  const token = await accessToken(config.serviceAccount);
  await requestJson('ga4', 'GA4 access check', `${DATA_API}/properties/${config.propertyId}:runReport`, {
    method: 'POST',
    headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({dateRanges: [{startDate: '7daysAgo', endDate: 'today'}], metrics: [{name: 'activeUsers'}], limit: 1}),
  });
}
