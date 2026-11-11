import {logger} from '@zaiusinc/app-sdk';

import {normalizePath} from '../../shared/path';
import {pagePaths} from '../../shared/routes';
import type {ActionParams, PageExperiment, PerformanceResult} from '../../shared/types';
import {fetchDatafile} from './datafile';
import {
  experimentResults,
  type FoundExperiment,
  type FxConfig,
  listFlags,
  pageExperiments,
  ruleVariationKeys,
} from './fx';
import {pageReport} from './ga4';
import {ApiError} from './http';
import {plainMessage} from './messages';
import {type RawResults, summarizeResults} from './results';
import type {LoadedConfig} from './settings';

// Each results lookup is two FX calls; a page rarely has more experiments than this.
const MAX_RESULTS_LOOKUPS = 5;

type ResultsAnswer = Pick<PageExperiment, 'results' | 'resultsNote'>;

// Without the rule's variation keys, the results name variations by their FX names, so
// a winner is still named.
const byOwnName = (raw: RawResults | null) =>
  new Map(Object.values(raw?.metrics?.[0]?.results ?? {}).map((v) => [v.name ?? '', v.name ?? '']));

/** The primary metric's results. Anything FX can't answer is a note, not an error. */
export async function resultsFor(fx: FxConfig, experiment: FoundExperiment): Promise<ResultsAnswer> {
  if (!experiment.experimentId) {
    return {results: null, resultsNote: 'Results appear once the experiment has started.'};
  }
  try {
    const [raw, keyByName] = await Promise.all([
      experimentResults(fx, experiment.experimentId),
      ruleVariationKeys(fx, experiment.flagKey, experiment.ruleKey).catch(() => null),
    ]);
    const results = summarizeResults(raw, keyByName ?? byOwnName(raw));
    return results
      ? {results, resultsNote: null}
      : {results: null, resultsNote: 'FX has no results for this experiment yet.'};
  } catch (error) {
    // FX answers 400 "Invalid experiment configuration" for a rule it can't compute yet.
    if (error instanceof ApiError && error.status === 400) {
      return {results: null, resultsNote: 'FX can\'t compute results for this experiment yet. It needs a metric and some visitors.'};
    }
    logger.warn('FX results failed', experiment.flagKey, experiment.ruleKey, error);
    return {results: null, resultsNote: `Couldn't load the results. ${plainMessage(error)}`};
  }
}

async function experimentsOn(fx: FxConfig, paths: string[]): Promise<PageExperiment[]> {
  const [datafile, flags] = await Promise.all([fx.sdkKey ? fetchDatafile(fx.sdkKey) : null, listFlags(fx)]);
  return Promise.all(
    pageExperiments(datafile, flags, fx, paths).map(async (found, i): Promise<PageExperiment> => {
      const answer: ResultsAnswer =
        i < MAX_RESULTS_LOOKUPS
          ? await resultsFor(fx, found)
          : {results: null, resultsNote: 'Not loaded: this page has more experiments than the panel reads at once.'};
      const {experimentId: _experimentId, ...experiment} = found;
      return {...experiment, ...answer};
    }),
  );
}

/** The editor sees a plain sentence; the raw status and body go to the app logs. */
function failed(service: string, error: unknown): string {
  logger.warn(`${service} failed`, error instanceof ApiError ? `${error.code}: ${error.message}` : error);
  return plainMessage(error);
}

// Analytics and experiments load independently: a missing GA4 setup still shows the
// experiments, and an FX outage still shows analytics.
export async function performance(config: LoadedConfig, params: ActionParams['performance']): Promise<PerformanceResult> {
  const path = normalizePath(params.path);
  const {locale} = params;

  const ga4Promise: Promise<PerformanceResult['ga4']> = config.ga4
    ? pageReport(config.ga4, path, locale).then(
        (report) => ({ok: true as const, report}),
        (error: unknown) => ({ok: false as const, error: failed('GA4 report', error)}),
      )
    : Promise.resolve(null);

  const fx = config.fx;
  const experimentsPromise = fx
    ? experimentsOn(fx, pagePaths(path, locale)).then(
        (experiments) => ({experiments, experimentsError: null}),
        (error: unknown) => ({experiments: [] as PageExperiment[], experimentsError: failed('FX experiments', error)}),
      )
    : Promise.resolve({experiments: [] as PageExperiment[], experimentsError: null});

  const [ga4, {experiments, experimentsError}] = await Promise.all([ga4Promise, experimentsPromise]);
  return {path, ga4, experiments, experimentsError, fxConfigured: Boolean(fx)};
}
