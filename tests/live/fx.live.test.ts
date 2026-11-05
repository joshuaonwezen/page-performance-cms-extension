// Read-only: lists the project's flags and fetches results for the experiments on a path.
//   PERF_LIVE=1 OPTIMIZELY_FX_API_TOKEN=… OPTIMIZELY_FX_PROJECT_ID=… PERF_LIVE_PATH=/en yarn vitest run tests/live
import {describe, expect, it} from 'vitest';

import {performance} from '../../src/backend/lib/performance';

const live = process.env.PERF_LIVE === '1';

describe.runIf(live)('page performance (live, read-only)', () => {
  it('finds the experiments on the path and reads their results from FX', async () => {
    const fx = {
      token: process.env.OPTIMIZELY_FX_API_TOKEN ?? '',
      projectId: process.env.OPTIMIZELY_FX_PROJECT_ID ?? '',
      environmentKey: 'production',
    };
    const result = await performance({ga4: null, fx}, process.env.PERF_LIVE_PATH ?? '/', 'en');
    console.log(
      JSON.stringify(
        result.experiments.map((e) => ({
          rule: `${e.flagKey}/${e.ruleKey}`,
          status: e.status,
          live: e.live,
          results: e.results ? e.results.variations.map((v) => `${v.name}:${v.samples}`) : e.resultsError,
        })),
      ),
    );
    expect(result.experimentsError).toBeNull();
    expect(result.ga4.ok).toBe(false);
  });
});
