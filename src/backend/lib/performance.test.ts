import {logger} from '@zaiusinc/app-sdk';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {FoundExperiment} from './fx';
import {performance, resultsFor} from './performance';

const FX = {token: 't', projectId: '23385830076', environmentKey: 'production', sdkKey: ''};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});

/** Answers each FX URL from `routes` by the first substring it contains. */
function serve(routes: Array<[string, () => Response]>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    const hit = routes.find(([part]) => url.includes(part));
    return hit ? hit[1]() : json({message: 'not found'}, 404);
  });
}

const EXPERIMENT: FoundExperiment = {
  flagKey: 'hero_dual_cta',
  flagName: 'Hero dual CTA',
  ruleKey: 'hero_dual_cta_experiment',
  ruleName: 'Hero dual CTA test',
  type: 'a/b',
  status: 'running',
  live: true,
  trafficPercent: 100,
  primaryMetric: null,
  resultsUrl: null,
  flagUrl: 'https://app.optimizely.com/v2/projects/23385830076/flags/manage/hero_dual_cta/rules/production',
  experimentId: '9300003237402',
};

// Trimmed from GET /v2/experiments/9300003237402/results (hero_dual_cta, 2026-10-15): no
// reach block, and the baseline carries no lift.
const HERO_RESULTS = {
  last_calculated_time: '2026-10-15T18:20:02.752000Z',
  metrics: [
    {
      name: 'Mosey Bank - Hero CTA Click',
      results: {
        '1774514': {name: 'Dual CTA', samples: 5000, rate: 0.2004, is_baseline: false, lift: {value: 0.057, is_significant: false}},
        '1774513': {name: 'Single CTA (control)', samples: 5000, rate: 0.1896, is_baseline: true},
      },
    },
    {name: 'Secondary', results: {}},
  ],
};

const RULESET = {
  rules: {
    hero_dual_cta_experiment: {
      variations: {
        control: {key: 'control', name: 'Single CTA (control)'},
        dual_cta: {key: 'dual_cta', name: 'Dual CTA'},
      },
    },
  },
};

beforeEach(() => {
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resultsFor', () => {
  it('summarizes the primary metric with variation keys from the rule', async () => {
    serve([
      ['/results', () => json(HERO_RESULTS)],
      ['/ruleset', () => json(RULESET)],
    ]);
    const {results, resultsNote} = await resultsFor(FX, EXPERIMENT);
    expect(resultsNote).toBeNull();
    expect(results?.metric).toBe('Mosey Bank - Hero CTA Click');
    // No reach block: visitors is the sum of the samples.
    expect(results?.visitors).toBe(10000);
    expect(results?.variations.map((v) => [v.key, v.isBaseline])).toEqual([
      ['control', true],
      ['dual_cta', false],
    ]);
    expect(results?.variations[1]).toMatchObject({lift: 0.057, rate: 0.2004, samples: 5000, significant: false});
  });

  it('still names a winner when the rule\'s variations can\'t be read', async () => {
    const [primary] = HERO_RESULTS.metrics;
    const winning = {
      metrics: [{...primary, results: {...primary.results, '1774514': {name: 'Dual CTA', samples: 5000, lift: {value: 0.2, is_significant: true}}}}],
    };
    serve([
      ['/results', () => json(winning)],
      ['/ruleset', () => json({}, 500)],
    ]);
    const {results} = await resultsFor(FX, EXPERIMENT);
    expect(results?.leader).toBe('Dual CTA');
  });

  it('turns a rule FX can\'t compute, or one that never started, into a note', async () => {
    serve([['/results', () => json({message: 'Invalid experiment configuration'}, 400)]]);
    expect((await resultsFor(FX, EXPERIMENT)).resultsNote).toMatch(/can't compute results/);
    expect((await resultsFor(FX, {...EXPERIMENT, experimentId: null})).resultsNote).toMatch(/once the experiment has started/);
  });

  it('never shows the raw FX answer', async () => {
    serve([['/results', () => json({message: 'token expired'}, 401)]]);
    const {resultsNote} = await resultsFor(FX, EXPERIMENT);
    expect(resultsNote).toMatch(/refused the access token/);
    expect(resultsNote).not.toMatch(/HTTP|401|expired/);
  });
});

describe('performance', () => {
  it('leaves GA4 out entirely when only FX is set up', async () => {
    serve([['/flags?', () => json({items: [], total_pages: 1})]]);
    const result = await performance({ga4: null, fx: FX}, {path: '/en/savings/', locale: 'en'});
    expect(result).toEqual({path: '/en/savings', ga4: null, experiments: [], experimentsError: null, fxConfigured: true});
  });

  it('reports an FX outage as a plain sentence', async () => {
    serve([['/flags?', () => json({error: 'boom'}, 503)]]);
    const result = await performance({ga4: null, fx: FX}, {path: '/', locale: 'en'});
    expect(result.experimentsError).toBe('Feature Experimentation didn\'t answer. Try again in a moment.');
  });
});
