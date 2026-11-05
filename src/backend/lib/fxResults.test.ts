import {describe, expect, it} from 'vitest';

import {summarizeResults} from './fxResults';

describe('summarizeResults', () => {
  it('takes the primary metric, baseline first, with lift and significance', () => {
    // Trimmed from GET /v2/experiments/9300003237402/results (hero_dual_cta, 2026-10-15).
    const summary = summarizeResults({
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
    });
    expect(summary?.metric).toBe('Mosey Bank - Hero CTA Click');
    expect(summary?.variations.map((v) => v.name)).toEqual(['Single CTA (control)', 'Dual CTA']);
    expect(summary?.variations[0]).toMatchObject({isBaseline: true, lift: null, significant: false});
    expect(summary?.variations[1]).toMatchObject({lift: 0.057, rate: 0.2004, samples: 5000});
  });

  it('is null without metrics', () => {
    expect(summarizeResults({})).toBeNull();
    expect(summarizeResults(null)).toBeNull();
  });
});
