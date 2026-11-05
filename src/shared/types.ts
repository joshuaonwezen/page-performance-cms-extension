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

export interface VariationResult {
  name: string;
  isBaseline: boolean;
  samples: number;
  rate: number | null;
  /** Relative lift vs baseline, e.g. 0.057 = +5.7%. */
  lift: number | null;
  significant: boolean;
}

export interface ExperimentResults {
  metric: string;
  lastCalculated: string | null;
  variations: VariationResult[];
}

/** An FX experiment rule on a CMS-driving flag whose cms_route covers the page. */
export interface PageExperiment {
  flagKey: string;
  flagName: string;
  ruleKey: string;
  ruleName: string;
  /** a/b, multi_armed_bandit, ... */
  type: string;
  /** The FX rule status: running, paused, draft, ... */
  status: string;
  /** The rule is enabled and the flag is on in this environment. */
  live: boolean;
  /** The flag's cms_route; '' covers every route. */
  route: string;
  trafficPercent: number;
  variations: string[];
  primaryMetric: string | null;
  resultsUrl: string | null;
  flagUrl: string;
  /** Null with resultsError set when FX has none (yet). */
  results: ExperimentResults | null;
  resultsError: string | null;
}

export interface PerformanceResult {
  path: string;
  ga4: {ok: true; report: Ga4Report} | {ok: false; error: string};
  experiments: PageExperiment[];
  /** Set when FX couldn't be read; null when FX isn't configured either. */
  experimentsError: string | null;
  fxConfigured: boolean;
  environmentKey: string | null;
}

export type ActionParams = {
  performance: {path: string; locale: string};
};

export type ActionResults = {
  performance: PerformanceResult;
};

export type ActionName = keyof ActionParams;
