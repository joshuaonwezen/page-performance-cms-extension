import {CMS_FLAG_VARIABLE, CMS_ROUTE_VARIABLE, FX_APP_BASE} from '../../shared/constants';
import {routeMatches} from '../../shared/path';
import type {PageExperiment} from '../../shared/types';
import {requestJson} from './http';

const FLAGS_API = 'https://api.optimizely.com/flags/v1';
// Basis points per percent.
const BP_PER_PERCENT = 100;

export interface FxConfig {
  token: string;
  projectId: string;
  environmentKey: string;
}

export interface RuleDetail {
  key: string;
  name?: string;
  type: string;
  enabled?: boolean;
  status?: string;
  traffic_allocation?: number;
  variation_names?: string[];
  primary_metric?: string | null;
  /** The datafile experiment id; set once FX has launched the rule. */
  layer_experiment_id?: number | null;
  fetch_results_ui_url?: string | null;
}

/** A flag as the list endpoint returns it: variables plus a rule summary per environment. */
export interface FxFlagListItem {
  key: string;
  name: string;
  archived?: boolean;
  variable_definitions?: Record<string, {default_value?: string}>;
  environments?: Record<string, {enabled?: boolean; rules_detail?: RuleDetail[]}>;
}

interface Page<T> {
  items?: T[];
  total_pages?: number;
}

function headers(cfg: Pick<FxConfig, 'token'>) {
  return {Authorization: `Bearer ${cfg.token}`};
}

/** Every active flag in the project, one request per 100 flags. */
export async function listFlags(cfg: FxConfig): Promise<FxFlagListItem[]> {
  const flags: FxFlagListItem[] = [];
  // The Flags API pages with page_window; it rejects `page` with a 400.
  for (let page = 1; page <= 10; page++) {
    const batch = await requestJson<Page<FxFlagListItem>>(
      'fx',
      'List flags',
      `${FLAGS_API}/projects/${cfg.projectId}/flags?per_page=100&page_window=${page}&archived=false`,
      {headers: headers(cfg)},
    );
    flags.push(...(batch?.items ?? []).filter((f) => !f.archived));
    if (!batch?.total_pages || page >= batch.total_pages) break;
  }
  return flags;
}

/** The project's environment keys; used to validate settings. */
export async function listEnvironments(cfg: Omit<FxConfig, 'environmentKey'>): Promise<string[]> {
  const page = await requestJson<Page<{key: string}>>(
    'fx',
    'List environments',
    `${FLAGS_API}/projects/${cfg.projectId}/environments`,
    {headers: headers(cfg)},
  );
  return (page?.items ?? []).map((e) => e.key);
}

export function flagUrl(cfg: FxConfig, flagKey: string): string {
  return `${FX_APP_BASE}/projects/${cfg.projectId}/flags/manage/${flagKey}/rules/${cfg.environmentKey}`;
}

// Rule types that split visitors to measure something; deliveries and rollouts only serve.
const EXPERIMENT_RULE_TYPES = new Set(['a/b', 'multi_armed_bandit', 'contextual_multi_armed_bandit']);

export type ExperimentWithoutResults = Omit<PageExperiment, 'results' | 'resultsError'> & {
  experimentId: string | null;
};

/**
 * The experiment rules the site would apply on `path`: rules of an experiment type, in
 * `cfg`'s environment, on flags whose cms_flag default is true and whose cms_route
 * covers the path. Running ones first.
 */
export function pageExperiments(flags: FxFlagListItem[], cfg: FxConfig, path: string): ExperimentWithoutResults[] {
  const found = flags.flatMap((flag) => {
    const env = flag.environments?.[cfg.environmentKey];
    const cmsFlag = flag.variable_definitions?.[CMS_FLAG_VARIABLE]?.default_value;
    const route = flag.variable_definitions?.[CMS_ROUTE_VARIABLE]?.default_value ?? '';
    if (flag.archived || !env || String(cmsFlag).toLowerCase() !== 'true' || !routeMatches(path, route)) return [];
    return (env.rules_detail ?? [])
      .filter((rule) => EXPERIMENT_RULE_TYPES.has(rule.type) && rule.status !== 'archived')
      .map(
        (rule): ExperimentWithoutResults => ({
          flagKey: flag.key,
          flagName: flag.name,
          ruleKey: rule.key,
          ruleName: rule.name || rule.key,
          type: rule.type,
          status: rule.status ?? (rule.enabled ? 'running' : 'draft'),
          live: Boolean(rule.enabled && env.enabled),
          route,
          trafficPercent: (rule.traffic_allocation ?? 0) / BP_PER_PERCENT,
          variations: rule.variation_names ?? [],
          primaryMetric: rule.primary_metric ?? null,
          resultsUrl: rule.fetch_results_ui_url ?? null,
          flagUrl: flagUrl(cfg, flag.key),
          experimentId: rule.layer_experiment_id ? String(rule.layer_experiment_id) : null,
        }),
      );
  });
  return found.sort((a, b) => Number(b.live) - Number(a.live));
}
