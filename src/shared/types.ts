// The contract between the sidebar and the cms_extension function. The UI sends
// {action, params}; the function answers with an Envelope.

export type Envelope<T> =
  | {ok: true; result: T}
  | {ok: false; error: string; message?: string};

export interface Ga4Totals {
  views: number;
  users: number;
  /** 0-1. */
  engagementRate: number;
  /** Average engagement time per active user, in seconds. */
  engagementSeconds: number;
  keyEvents: number;
}

export interface Ga4Report {
  propertyId: string;
  /** The GA4 pagePath regex the report filtered on. */
  pathFilter: string;
  totals: Ga4Totals;
  previous: Ga4Totals;
  /** One point per day, oldest first, YYYY-MM-DD. */
  daily: Array<{date: string; views: number}>;
  sources: Array<{name: string; views: number}>;
  /** "base" for the clean path, else the Web Experimentation variation name. */
  variants: Array<{variant: string; views: number; users: number}>;
}

// AudienceOption and RunningExperiment are the shapes datafile.ts (shared with the
// Feature Experimentation extension) returns.
export interface AudienceOption {
  id: number;
  name: string;
}

export interface VariationResult {
  /** The FX variation key, when the results name maps back to one. */
  key: string | null;
  name: string;
  isBaseline: boolean;
  samples: number;
  rate: number | null;
  /** Relative lift vs the baseline, e.g. 0.057 = +5.7%. */
  lift: number | null;
  significant: boolean;
}

/** The primary metric's results, as FX's results page computes them. */
export interface ExperimentResults {
  metric: string;
  lastCalculated: string | null;
  visitors: number;
  variations: VariationResult[];
  /** A variation that beats the original with significance, or null. */
  leader: string | null;
}

/**
 * A live rule on another CMS-driven flag. The site buckets a visitor into every such
 * flag whose route covers the page, but the page shows one variation, so a second one
 * muddies the experiment: another experiment, or a delivery (personalization) that
 * swaps the content for some visitors.
 */
export interface RunningExperiment {
  flagKey: string;
  flagName: string;
  ruleKey: string;
  ruleName: string;
  kind: 'experiment' | 'delivery';
  /** Route the rule's served variations apply on; '' covers every route. */
  route: string;
  /** CMS variation keys the rule serves. */
  variations: string[];
  flagUrl: string;
}

/** An FX experiment rule on a CMS-driving flag that applies on the page. */
export interface PageExperiment {
  flagKey: string;
  flagName: string;
  ruleKey: string;
  ruleName: string;
  /** a/b, multi_armed_bandit, ... */
  type: string;
  /** The FX rule status: running, paused, draft, ... */
  status: string;
  /** The site serves this rule to visitors right now. */
  live: boolean;
  /** Share of visitors in the experiment, 0-100; null when FX didn't say. */
  trafficPercent: number | null;
  primaryMetric: string | null;
  /** An https://app.optimizely.com/ link, or null. */
  resultsUrl: string | null;
  flagUrl: string;
  /** Null with resultsNote set when FX has none (yet). */
  results: ExperimentResults | null;
  resultsNote: string | null;
}

export interface PerformanceResult {
  path: string;
  /** Null when GA4 isn't set up. */
  ga4: {ok: true; report: Ga4Report} | {ok: false; error: string} | null;
  experiments: PageExperiment[];
  /** Set when FX couldn't be read; null when it could, or isn't set up. */
  experimentsError: string | null;
  fxConfigured: boolean;
}

export type ActionParams = {
  performance: {path: string; locale: string};
};

export type ActionResults = {
  performance: PerformanceResult;
};

export type ActionName = keyof ActionParams;
