import {describe, expect, it} from 'vitest';

import {FxFlagListItem, pageExperiments, RuleDetail} from './fx';

const FX = {token: 't', projectId: '23385830076', environmentKey: 'production'};

// Shapes from GET /flags/v1/projects/{p}/flags (project 23385830076, 2026-11-05).
function flag(
  key: string,
  vars: {cms_flag?: string; cms_route?: string},
  envEnabled: boolean,
  rules: RuleDetail[],
): FxFlagListItem {
  return {
    key,
    name: key,
    variable_definitions: Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, {default_value: v}])),
    environments: {production: {enabled: envEnabled, rules_detail: rules}},
  };
}

const HOMEPAGE = flag('homepage', {cms_flag: 'true', cms_route: '/, /en'}, true, [
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
    fetch_results_ui_url: 'https://app.optimizely.com/v2/projects/23385830076/results/9300002474516/experiments/9300003222778',
  },
  {key: 'business', type: 'targeted_delivery', enabled: true, status: 'running'},
]);

describe('pageExperiments', () => {
  it('keeps experiment rules on CMS flags whose route covers the page', () => {
    const found = pageExperiments([HOMEPAGE], FX, '/en');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      flagKey: 'homepage',
      ruleKey: 'business_vs_personal_experiment',
      type: 'a/b',
      status: 'paused',
      live: false,
      route: '/, /en',
      trafficPercent: 100,
      variations: ['business', 'personal', 'Off'],
      experimentId: '9300003222778',
      flagUrl: 'https://app.optimizely.com/v2/projects/23385830076/flags/manage/homepage/rules/production',
    });
  });

  it('skips other routes, non-CMS flags and other environments', () => {
    expect(pageExperiments([HOMEPAGE], FX, '/en/personal-banking')).toEqual([]);
    const component = flag('savings_offer', {cms_flag: 'false', cms_route: ''}, true, [
      {key: 'savings_offer_experiment', type: 'a/b', enabled: true, status: 'running'},
    ]);
    expect(pageExperiments([component], FX, '/en')).toEqual([]);
    expect(pageExperiments([HOMEPAGE], {...FX, environmentKey: 'development'}, '/en')).toEqual([]);
  });

  it('lists running rules first and needs the flag on for live', () => {
    const running = flag('cms_savings', {cms_flag: 'true', cms_route: '/en/*'}, true, [
      {key: 'cms_savings_experiment', type: 'a/b', enabled: true, status: 'running'},
    ]);
    const envOff = flag('cms_off', {cms_flag: 'true'}, false, [{key: 'r', type: 'a/b', enabled: true, status: 'running'}]);
    const found = pageExperiments([HOMEPAGE, envOff, running], FX, '/en');
    expect(found.map((e) => [e.flagKey, e.live])).toEqual([
      ['cms_savings', true],
      ['homepage', false],
      ['cms_off', false],
    ]);
  });
});
