import {describe, expect, it} from 'vitest';

import {DEFAULT_PROFILE} from '../../shared/profile';
import {type Datafile, isRuleLive, isSdkKey, liveCmsRules} from './datafile';

const variables = [
  {id: 'm', key: 'cms_flag', type: 'boolean', defaultValue: 'false'},
  {id: 'r', key: 'cms_route', type: 'string', defaultValue: ''},
];
const overrides = (route: string) => [
  {id: 'm', value: 'true'},
  {id: 'r', value: route},
];

const datafile = (status: string): Datafile => ({
  projectId: '23385830076',
  environmentKey: 'production',
  featureFlags: [{key: 'savings_offer', experimentIds: ['e1'], rolloutId: 'r1', variables}],
  experiments: [
    {
      id: 'e1',
      key: 'savings_offer_experiment',
      status,
      variations: [
        {id: '1', key: 'off', featureEnabled: false},
        {id: '2', key: 'control', featureEnabled: true, variables: overrides('/savings-offer')},
        {id: '3', key: 'rate_led', featureEnabled: true, variables: overrides('/savings-offer')},
        // Feature on, but the marker stays at its default (false): not CMS content.
        {id: '4', key: 'banner_only', featureEnabled: true},
      ],
    },
  ],
  rollouts: [{id: 'r1', experiments: []}],
});

describe('liveCmsRules', () => {
  it('reads per-variation overrides of the marker and the route', () => {
    expect(liveCmsRules(datafile('Running'), DEFAULT_PROFILE)).toEqual([
      {
        flagKey: 'savings_offer',
        ruleKey: 'savings_offer_experiment',
        kind: 'experiment',
        route: '/savings-offer',
        variations: ['control', 'rate_led'],
      },
    ]);
  });

  it('skips rules the site does not run', () => {
    expect(liveCmsRules(datafile('Paused'), DEFAULT_PROFILE)).toEqual([]);
    expect(isRuleLive(datafile('Paused'), 'savings_offer', 'savings_offer_experiment')).toBe(false);
    expect(isRuleLive(datafile('Running'), 'savings_offer', 'savings_offer_experiment')).toBe(true);
  });
});

describe('isSdkKey', () => {
  it('accepts SDK keys and nothing that could leave the datafile URL', () => {
    expect(isSdkKey('JxVsSD9pdNfPYxHtHBeyT')).toBe(true);
    expect(isSdkKey('../secret')).toBe(false);
    expect(isSdkKey('short')).toBe(false);
  });
});
