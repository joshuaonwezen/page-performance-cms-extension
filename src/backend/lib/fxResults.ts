import type {ExperimentResults, VariationResult} from '../../shared/types';
import {requestJson} from './http';

// FX experiment results for the Performance sidebar. The id is the rule's datafile
// experiment id; `GET /v2/experiments/{id}/results` serves FX rules as well as Web
// experiments (verified 2026-10-15). It can answer 400 "Invalid experiment
// configuration" for a rule FX cannot compute results for - the caller shows that as a
// note rather than an error.

interface RawVariation {
  name?: string;
  samples?: number;
  rate?: number;
  is_baseline?: boolean;
  lift?: {value?: number; is_significant?: boolean};
}

interface RawResults {
  last_calculated_time?: string;
  metrics?: Array<{name?: string; results?: Record<string, RawVariation>}>;
}

/** The primary (first) metric, baseline first. */
export function summarizeResults(raw: RawResults | null): ExperimentResults | null {
  const metric = raw?.metrics?.[0];
  if (!metric?.results) return null;
  const variations: VariationResult[] = Object.values(metric.results)
    .map((v) => ({
      name: v.name ?? '',
      isBaseline: v.is_baseline === true,
      samples: v.samples ?? 0,
      rate: typeof v.rate === 'number' ? v.rate : null,
      lift: typeof v.lift?.value === 'number' ? v.lift.value : null,
      significant: v.lift?.is_significant === true,
    }))
    .sort((a, b) => Number(b.isBaseline) - Number(a.isBaseline));
  return {metric: metric.name ?? 'Primary metric', lastCalculated: raw?.last_calculated_time ?? null, variations};
}

export async function experimentResults(token: string, experimentId: string): Promise<ExperimentResults | null> {
  const raw = await requestJson<RawResults>(
    'fx',
    'FX results',
    `https://api.optimizely.com/v2/experiments/${encodeURIComponent(experimentId)}/results`,
    {headers: {Authorization: `Bearer ${token}`}},
  );
  return summarizeResults(raw);
}
