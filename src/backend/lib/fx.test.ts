import {describe, expect, it} from 'vitest';

import {pagePaths} from '../../shared/routes';
import type {Datafile} from './datafile';
import {FxFlagListItem, pageExperiments, RuleDetail} from './fx';

const FX = {token: 't', projectId: '23385830076', environmentKey: 'production', sdkKey: 'SdkKey12345'};
const RESULTS_URL = 'https://app.optimizely.com/v2/projects/23385830076/results/9300002474516/experiments/9300003222778';

type Vars = Record<string, {type: string; default_value: string}>;
const marker = (on: boolean) => ({type: 'boolean', default_value: String(on)});
const route = (value: string) => ({type: 'string', default_value: value});

// Shapes from GET /flags/v1/projects/{p}/flags (project 23385830076, 2026-11-05).
function flag(key: string, vars: Vars, envEnabled: boolean, rules: RuleDetail[]): FxFlagListItem {
  return {key, name: key, variable_definitions: vars, environments: {production: {enabled: envEnabled, rules_detail: rules}}};
}

const HOMEPAGE = flag('homepage', {cms_flag: marker(true), cms_route: route('/, /en')}, true, [
  {
    key: 'business_vs_personal_experiment',
    name: 'business vs personal experiment',
    type: 'a/b',
    enabled: false,
    status: 'paused',
    traffic_allocation: 10000,
    variation_names: ['business', 'personal', 'Off'],
    primary_metric: 'Add to Cart Clicked',
    layer_experiment_id: 9300003222778,
    fetch_results_ui_url: RESULTS_URL,
  },
  {key: 'business', type: 'targeted_delivery', enabled: true, status: 'running'},
]);

// The demo's savings_offer: defaults false/'', each served variation turns the marker on
// and points the route at /savings-offer.
const SAVINGS_OFFER = flag('savings_offer', {cms_flag: marker(false), cms_route: route('')}, true, [
  {
    key: 'savings_offer_experiment',
    name: 'Savings offer test',
    type: 'a/b',
    enabled: true,
    status: 'running',
    traffic_allocation: 5000,
    primary_metric: 'mb_cta_click',
    layer_experiment_id: 9300003300001,
    fetch_results_ui_url: 'https://evil.example/results',
  },
]);

const PERSONAL_BANKING = flag(
  'cms_personal_banking',
  {cms_flag: marker(true), cms_route: route('/en/personal-banking')},
  true,
  [{key: 'cms_personal_banking_experiment', type: 'a/b', enabled: true, status: 'running'}],
);

const vars = (flagMarker: string, flagRoute: string, markerType = 'boolean') => [
  {id: `${flagMarker}m`, key: 'cms_flag', type: markerType, defaultValue: flagMarker},
  {id: `${flagMarker}r`, key: 'cms_route', type: 'string', defaultValue: flagRoute},
];

// Trimmed from the datafile of the site's SDK key: only running rules are in it.
const DATAFILE: Datafile = {
  projectId: '23385830076',
  environmentKey: 'production',
  featureFlags: [
    {
      key: 'savings_offer',
      experimentIds: ['e1'],
      rolloutId: 'r1',
      variables: [
        {id: 'm1', key: 'cms_flag', type: 'boolean', defaultValue: 'false'},
        {id: 'r1', key: 'cms_route', type: 'string', defaultValue: ''},
      ],
    },
    {key: 'homepage', experimentIds: [], rolloutId: 'r2', variables: vars('true', '/, /en')},
    {key: 'cms_personal_banking', experimentIds: ['e3'], rolloutId: 'r3', variables: vars('true', '/en/personal-banking')},
  ],
  experiments: [
    {
      id: 'e1',
      key: 'savings_offer_experiment',
      status: 'Running',
      variations: [
        {id: 'x0', key: 'off', featureEnabled: false},
        {id: 'x1', key: 'control', featureEnabled: true, variables: [{id: 'm1', value: 'true'}, {id: 'r1', value: '/savings-offer'}]},
        {id: 'x2', key: 'rate_led', featureEnabled: true, variables: [{id: 'm1', value: 'true'}, {id: 'r1', value: '/savings-offer'}]},
      ],
    },
    {
      id: 'e3',
      key: 'cms_personal_banking_experiment',
      status: 'Running',
      variations: [{id: 'p1', key: 'business', featureEnabled: true}],
    },
  ],
  rollouts: [
    {id: 'r1', experiments: []},
    // A delivery (the homepage personas) is not an experiment.
    {id: 'r2', experiments: [{id: 'd1', key: 'business', status: 'Running', variations: [{id: 'y1', key: 'business', featureEnabled: true}]}]},
    {id: 'r3', experiments: []},
  ],
};

const FLAGS = [HOMEPAGE, SAVINGS_OFFER, PERSONAL_BANKING];
const on = (path: string, datafile: Datafile | null = DATAFILE, flags = FLAGS) =>
  pageExperiments(datafile, flags, FX, pagePaths(path, 'en'));

describe('pageExperiments with the site datafile', () => {
  it('finds a flag that turns the marker on per variation', () => {
    const found = on('/savings-offer');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      flagKey: 'savings_offer',
      ruleKey: 'savings_offer_experiment',
      ruleName: 'Savings offer test',
      status: 'running',
      live: true,
      trafficPercent: 50,
      primaryMetric: 'mb_cta_click',
      experimentId: '9300003300001',
      flagUrl: 'https://app.optimizely.com/v2/projects/23385830076/flags/manage/savings_offer/rules/production',
    });
  });

  it('only keeps results links into the FX app', () => {
    expect(on('/savings-offer')[0].resultsUrl).toBeNull();
    expect(on('/')[0].resultsUrl).toBe(RESULTS_URL);
  });

  it('matches the page with and without the locale prefix', () => {
    expect(on('/en/savings-offer').map((e) => e.flagKey)).toEqual(['savings_offer']);
    // Routed to /en/personal-banking, the page reported bare: still found.
    expect(on('/personal-banking').map((e) => e.ruleKey)).toEqual(['cms_personal_banking_experiment']);
    expect(on('/en/personal-banking').map((e) => e.ruleKey)).toEqual(['cms_personal_banking_experiment']);
    expect(on('/savings')).toEqual([]);
  });

  it('adds paused rules from the Flags API, after the running ones, and skips deliveries', () => {
    const found = on('/en');
    expect(found.map((e) => [e.ruleKey, e.status, e.live])).toEqual([['business_vs_personal_experiment', 'paused', false]]);
    expect(found[0]).toMatchObject({experimentId: '9300003222778', trafficPercent: 100});
  });

  it('shows a rule FX calls running but the site does not serve as not live', () => {
    const flagOff = flag('cms_off', {cms_flag: marker(true), cms_route: route('/savings')}, false, [
      {key: 'cms_off_experiment', type: 'a/b', enabled: true, status: 'running'},
    ]);
    expect(on('/savings', DATAFILE, [flagOff]).map((e) => [e.status, e.live])).toEqual([['running', false]]);
  });

  it('leaves a served rule to the datafile, even when its route default would cover the page', () => {
    // Default cms_route '' covers every page, but the served variations point at /savings-offer.
    const everywhere = {
      ...SAVINGS_OFFER,
      variable_definitions: {cms_flag: marker(true), cms_route: route('')},
    };
    expect(on('/mortgages', DATAFILE, [everywhere])).toEqual([]);
  });

  it('ignores a string-typed marker, like the site does', () => {
    const stringMarker: Datafile = {
      ...DATAFILE,
      featureFlags: [{key: 'savings_offer', experimentIds: ['e1'], rolloutId: 'r1', variables: vars('true', '', 'string')}],
    };
    expect(on('/savings-offer', stringMarker, [])).toEqual([]);
  });
});

describe('pageExperiments without an SDK key (Flags API only)', () => {
  it('keeps experiment rules on CMS flags whose route default covers the page', () => {
    const found = on('/en', null);
    expect(found.map((e) => e.ruleKey)).toEqual(['business_vs_personal_experiment']);
    expect(found[0]).toMatchObject({type: 'a/b', status: 'paused', live: false, trafficPercent: 100});
  });

  it('misses a marker switched on per variation: the list only has defaults', () => {
    expect(on('/savings-offer', null)).toEqual([]);
  });

  it('needs a boolean marker, not the string "true"', () => {
    const stringMarker = flag('cms_string', {cms_flag: {type: 'string', default_value: 'true'}, cms_route: route('')}, true, [
      {key: 'r', type: 'a/b', enabled: true, status: 'running'},
    ]);
    expect(on('/anything', null, [stringMarker])).toEqual([]);
  });

  it('skips other routes and other environments, and lists running rules first', () => {
    expect(on('/en/personal-banking-2', null)).toEqual([]);
    expect(pageExperiments(null, FLAGS, {...FX, environmentKey: 'development'}, ['/en'])).toEqual([]);
    const envOff = flag('cms_off', {cms_flag: marker(true), cms_route: route('')}, false, [
      {key: 'r', type: 'a/b', enabled: true, status: 'running'},
    ]);
    expect(on('/en', null, [HOMEPAGE, envOff, PERSONAL_BANKING]).map((e) => [e.flagKey, e.live])).toEqual([
      ['homepage', false],
      ['cms_off', false],
    ]);
    expect(on('/personal-banking', null).map((e) => [e.flagKey, e.live])).toEqual([['cms_personal_banking', true]]);
  });
});
