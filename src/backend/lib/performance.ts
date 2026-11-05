import {normalizePath} from '../../shared/path';
import type {ExperimentResults, PageExperiment, PerformanceResult} from '../../shared/types';
import {FxConfig, listFlags, pageExperiments} from './fx';
import {experimentResults} from './fxResults';
import {pageReport} from './ga4';
import {ApiError} from './http';
import type {LoadedConfig} from './settings';

/** A request the UI can fix (bad input, wrong state) - answered as HTTP 400. */
export class ActionError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = 'ActionError';
    this.code = code;
  }
}

// Each results lookup is one FX call; a page rarely has more experiments than this.
const MAX_RESULTS_LOOKUPS = 5;

function message(error: unknown): string {
  return error instanceof ApiError || error instanceof ActionError ? error.message : 'Request failed.';
}

async function resultsFor(
  fx: FxConfig,
  experimentId: string | null,
): Promise<{results: ExperimentResults | null; resultsError: string | null}> {
  if (!experimentId) return {results: null, resultsError: 'No results yet: FX creates them the first time the rule starts.'};
  try {
    const results = await experimentResults(fx.token, experimentId);
    return results ? {results, resultsError: null} : {results: null, resultsError: 'FX has no results for this rule yet.'};
  } catch (error) {
    // FX answers 400 "Invalid experiment configuration" for rules it can't compute.
    return {results: null, resultsError: `FX couldn't compute results (${message(error)}).`};
  }
}

async function experimentsOn(fx: FxConfig, path: string): Promise<PageExperiment[]> {
  const found = pageExperiments(await listFlags(fx), fx, path);
  return Promise.all(
    found.map(async ({experimentId, ...experiment}, i): Promise<PageExperiment> => {
      const results =
        i < MAX_RESULTS_LOOKUPS
          ? await resultsFor(fx, experimentId)
          : {results: null, resultsError: 'Not loaded: too many experiments on this page.'};
      return {...experiment, ...results};
    }),
  );
}

// Analytics and experiments load independently: a missing GA4 setup still shows the
// experiments, and an FX outage still shows analytics.
export async function performance(config: LoadedConfig, rawPath: unknown, rawLocale: unknown): Promise<PerformanceResult> {
  if (typeof rawPath !== 'string' || !rawPath.startsWith('/')) {
    throw new ActionError('missing_path', 'Open a page: this item has no URL on the site.');
  }
  const path = normalizePath(rawPath);
  const locale = typeof rawLocale === 'string' && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(rawLocale) ? rawLocale : 'en';

  const ga4Promise: Promise<PerformanceResult['ga4']> = config.ga4
    ? pageReport(config.ga4, path, locale).then(
        (report) => ({ok: true as const, report}),
        (error: unknown) => ({ok: false as const, error: message(error)}),
      )
    : Promise.resolve({ok: false as const, error: 'Add a GA4 property and service account in the app settings to see traffic.'});

  const fx = config.fx;
  const experimentsPromise = fx
    ? experimentsOn(fx, path).then(
        (experiments) => ({experiments, experimentsError: null}),
        (error: unknown) => ({experiments: [] as PageExperiment[], experimentsError: message(error)}),
      )
    : Promise.resolve({experiments: [] as PageExperiment[], experimentsError: null});

  const [ga4, {experiments, experimentsError}] = await Promise.all([ga4Promise, experimentsPromise]);
  return {path, ga4, experiments, experimentsError, fxConfigured: Boolean(fx), environmentKey: fx?.environmentKey ?? null};
}
