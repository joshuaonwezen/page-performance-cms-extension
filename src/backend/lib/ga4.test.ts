import {createVerify, generateKeyPairSync} from 'node:crypto';

import {afterEach, describe, expect, it, vi} from 'vitest';

import {accessToken, buildReport, pagePathRegex, parseServiceAccount, signJwt, variantOf} from './ga4';

// GA4 FULL_REGEXP is RE2; these patterns use nothing RE2 lacks, so JS RegExp is a fair proxy.
const matches = (path: string, locale: string, pagePath: string) => new RegExp(pagePathRegex(path, locale)).test(pagePath);

describe('pagePathRegex', () => {
  it('matches a page bare, under its locale, and with variation segments', () => {
    for (const p of ['/personal', '/personal/', '/en/personal', '/personal/__v_wx--wx_treatment']) {
      expect(matches('/personal', 'en', p)).toBe(true);
    }
    expect(matches('/en/personal', 'en', '/personal')).toBe(true);
  });

  it('does not match other pages, children or other locales', () => {
    for (const p of ['/personal/savings', '/personally', '/nl/personal', '/business']) {
      expect(matches('/personal', 'en', p)).toBe(false);
    }
  });

  it('treats the homepage as exactly the root, with or without the locale', () => {
    for (const p of ['/', '/en', '/en/', '/__v_wx--wx_treatment']) expect(matches('/', 'en', p)).toBe(true);
    for (const p of ['/personal', '/nl']) expect(matches('/', 'en', p)).toBe(false);
  });

  it('escapes regex characters in the path', () => {
    expect(matches('/a.b', 'en', '/axb')).toBe(false);
  });
});

describe('variantOf', () => {
  it('names the WX variation, else base', () => {
    expect(variantOf('/savings/__v_wx--wx_treatment')).toBe('wx_treatment');
    expect(variantOf('/savings')).toBe('base');
  });
});

describe('buildReport', () => {
  it('reads both date ranges, fills empty days and groups paths by variant', () => {
    const report = buildReport(
      '123',
      '^x$',
      [
        {
          rows: [
            {dimensionValues: [{value: 'current'}], metricValues: [{value: '100'}, {value: '40'}, {value: '0.5'}, {value: '800'}, {value: '3'}]},
            {dimensionValues: [{value: 'previous'}], metricValues: [{value: '80'}, {value: '20'}, {value: '0.4'}, {value: '200'}, {value: '1'}]},
          ],
        },
        {rows: [{dimensionValues: [{value: '20261015'}], metricValues: [{value: '7'}]}]},
        {rows: [{dimensionValues: [{value: 'google / organic'}], metricValues: [{value: '60'}]}]},
        {
          rows: [
            {dimensionValues: [{value: '/savings'}], metricValues: [{value: '70'}, {value: '30'}]},
            {dimensionValues: [{value: '/en/savings'}], metricValues: [{value: '10'}, {value: '5'}]},
            {dimensionValues: [{value: '/savings/__v_wx--wx_treatment'}], metricValues: [{value: '20'}, {value: '9'}]},
          ],
        },
      ],
      new Date('2026-10-15T12:00:00Z'),
    );
    expect(report.totals).toEqual({views: 100, users: 40, engagementRate: 0.5, engagementSeconds: 20, keyEvents: 3});
    expect(report.previous.views).toBe(80);
    expect(report.daily).toHaveLength(28);
    expect(report.daily.at(-1)).toEqual({date: '2026-10-15', views: 7});
    expect(report.daily[0]).toEqual({date: '2026-09-18', views: 0});
    expect(report.sources).toEqual([{name: 'google / organic', views: 60}]);
    expect(report.variants).toEqual([
      {variant: 'base', views: 80, users: 35},
      {variant: 'wx_treatment', views: 20, users: 9},
    ]);
  });

  it('survives an empty response', () => {
    const report = buildReport('1', '^x$', []);
    expect(report.totals.views).toBe(0);
    expect(report.variants).toEqual([]);
  });
});

describe('service account JWT', () => {
  const {privateKey, publicKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
  const pem = privateKey.export({type: 'pkcs8', format: 'pem'}).toString();

  it('parses only a key file with an email and a private key', () => {
    expect(parseServiceAccount(JSON.stringify({client_email: 'a@b.iam.gserviceaccount.com', private_key: pem}))).not.toBeNull();
    expect(parseServiceAccount('{"client_email":"a"}')).toBeNull();
    expect(parseServiceAccount('not json')).toBeNull();
  });

  it('signs an RS256 assertion Google can verify', () => {
    const jwt = signJwt({client_email: 'a@b.iam.gserviceaccount.com', private_key: pem}, 1_800_000_000);
    const [header, claims, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({alg: 'RS256', typ: 'JWT'});
    const body = JSON.parse(Buffer.from(claims, 'base64url').toString());
    expect(body).toMatchObject({
      iss: 'a@b.iam.gserviceaccount.com',
      aud: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      exp: 1_800_003_600,
    });
    const ok = createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, 'base64url'));
    expect(ok).toBe(true);
  });

  it('ignores a key file\'s token_uri', () => {
    const sa = parseServiceAccount(
      JSON.stringify({client_email: 'a@b.iam.gserviceaccount.com', private_key: pem, token_uri: 'https://evil.example/token'}),
    );
    expect(sa).toEqual({client_email: 'a@b.iam.gserviceaccount.com', private_key: pem});
  });
});

describe('accessToken', () => {
  const pemFor = () =>
    generateKeyPairSync('rsa', {modulusLength: 2048}).privateKey.export({type: 'pkcs8', format: 'pem'}).toString();
  const tokenResponse = (body: object) =>
    new Response(JSON.stringify(body), {status: 200, headers: {'Content-Type': 'application/json'}});

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('always posts the assertion to Google, whatever the key file says', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(tokenResponse({access_token: 'ya29.x', expires_in: 3600}));
    const json = JSON.stringify({client_email: 'c@d.iam.gserviceaccount.com', private_key: pemFor(), token_uri: 'https://evil.example/token'});
    expect(await accessToken(parseServiceAccount(json)!)).toBe('ya29.x');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');
  });

  it('throws on an answer without a token, and does not cache it', async () => {
    const sa = {client_email: 'e@f.iam.gserviceaccount.com', private_key: pemFor()};
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(tokenResponse({}));
    await expect(accessToken(sa)).rejects.toMatchObject({code: 'ga4_unavailable'});
    fetchMock.mockResolvedValueOnce(tokenResponse({access_token: 'ya29.y'}));
    expect(await accessToken(sa)).toBe('ya29.y');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches per key, so a newly pasted key for the same account is tried', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(tokenResponse({access_token: 'old'}))
      .mockResolvedValueOnce(tokenResponse({access_token: 'new'}));
    const email = 'g@h.iam.gserviceaccount.com';
    const oldKey = {client_email: email, private_key: pemFor()};
    expect(await accessToken(oldKey)).toBe('old');
    expect(await accessToken(oldKey)).toBe('old');
    expect(await accessToken({client_email: email, private_key: pemFor()})).toBe('new');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
