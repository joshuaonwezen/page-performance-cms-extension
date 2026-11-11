import {FX_APP_BASE, isFxAppUrl} from '../../shared/constants';
import {DEFAULT_PROFILE, type SiteProfile} from '../../shared/profile';
import {routeCovers} from '../../shared/routes';
import type {PageExperiment} from '../../shared/types';
import {type Datafile, isRuleLive, liveCmsRules} from './datafile';
import {requestJson} from './http';
import type {RawResults} from './results';

const FLAGS_API = 'https://api.optimizely.com/flags/v1';
const V2_API = 'https://api.optimizely.com/v2';
// Basis points per percent.
const BP_PER_PERCENT = 100;

export interface FxConfig {
  token: string;
  projectId: string;
  environmentKey: string;
  /** The site's SDK key; its datafile is what visitors are decided from. '' on installs saved before it existed. */
  sdkKey: string;
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
  variable_definitions?: Record<string, {type?: string; default_value?: string}>;
  environments?: Record<string, {enabled?: boolean; rules_detail?: RuleDetail[]}>;
}

interface Page<T> {
  items?: T[];
  total_pages?: number;
}

interface Ruleset {
  rules?: Record<string, {variations?: Record<string, {key: string; name?: string}>}>;
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
export async function listEnvironments(cfg: Pick<FxConfig, 'token' | 'projectId'>): Promise<string[]> {
  const page = await requestJson<Page<{key: string}>>(
    'fx',
    'List environments',
    `${FLAGS_API}/projects/${cfg.projectId}/environments`,
    {headers: headers(cfg)},
  );
  return (page?.items ?? []).map((e) => e.key);
}

/** Variation name to key for one rule, so results (which carry names) map back to keys. */
export async function ruleVariationKeys(cfg: FxConfig, flagKey: string, ruleKey: string): Promise<Map<string, string>> {
  const ruleset = await requestJson<Ruleset>(
    'fx',
    'Get ruleset',
    `${FLAGS_API}/projects/${cfg.projectId}/flags/${encodeURIComponent(flagKey)}/environments/${encodeURIComponent(cfg.environmentKey)}/ruleset`,
    {headers: headers(cfg)},
  );
  const variations = Object.values(ruleset?.rules?.[ruleKey]?.variations ?? {});
  return new Map(variations.map((v) => [v.name || v.key, v.key]));
}

/**
 * GET /v2/experiments/{id}/results, where the id is the rule's layer_experiment_id. It
 * serves FX rules as well as Web experiments (verified 2026-10-15).
 */
export async function experimentResults(cfg: Pick<FxConfig, 'token'>, experimentId: string): Promise<RawResults | null> {
  return requestJson<RawResults>(
    'fx',
    'FX results',
    `${V2_API}/experiments/${encodeURIComponent(experimentId)}/results`,
    {headers: headers(cfg)},
  );
}

export function flagUrl(cfg: FxConfig, flagKey: string): string {
  return `${FX_APP_BASE}/projects/${cfg.projectId}/flags/manage/${encodeURIComponent(flagKey)}/rules/${cfg.environmentKey}`;
}

// Rule types that split visitors to measure something; deliveries and rollouts only serve.
const EXPERIMENT_RULE_TYPES = new Set(['a/b', 'multi_armed_bandit', 'contextual_multi_armed_bandit']);

export type FoundExperiment = Omit<PageExperiment, 'results' | 'resultsNote'> & {
  experimentId: string | null;
};

const coversAny = (route: string, paths: string[]) => paths.some((p) => routeCovers(route, p));

function toExperiment(
  cfg: FxConfig,
  flagKey: string,
  ruleKey: string,
  flag: FxFlagListItem | undefined,
  rule: RuleDetail | undefined,
  state: {live: boolean; status: string},
): FoundExperiment {
  return {
    flagKey,
    flagName: flag?.name || flagKey,
    ruleKey,
    ruleName: rule?.name || ruleKey,
    type: rule?.type ?? 'a/b',
    status: state.status,
    live: state.live,
    trafficPercent: typeof rule?.traffic_allocation === 'number' ? rule.traffic_allocation / BP_PER_PERCENT : null,
    primaryMetric: rule?.primary_metric ?? null,
    resultsUrl: isFxAppUrl(rule?.fetch_results_ui_url) ? rule.fetch_results_ui_url : null,
    flagUrl: flagUrl(cfg, flagKey),
    experimentId: rule?.layer_experiment_id ? String(rule.layer_experiment_id) : null,
  };
}

/**
 * Experiment rules on `paths` as far as the Flags API list shows them: flags whose
 * boolean marker defaults to true and whose route default covers a path. The list only
 * carries variable defaults, so a flag that switches the marker on per variation is
 * missed here; the datafile has no such gap, but it only holds running rules.
 */
function fromFlagList(flags: FxFlagListItem[], cfg: FxConfig, paths: string[], profile: SiteProfile): FoundExperiment[] {
  return flags.flatMap((flag) => {
    const env = flag.environments?.[cfg.environmentKey];
    const marker = flag.variable_definitions?.[profile.markerVariable];
    const route = flag.variable_definitions?.[profile.routeVariable]?.default_value ?? '';
    // The site reads the marker as a boolean; a string "true" never matches.
    if (flag.archived || !env || marker?.type !== 'boolean') return [];
    if (String(marker.default_value).toLowerCase() !== 'true' || !coversAny(route, paths)) return [];
    return (env.rules_detail ?? [])
      .filter((rule) => EXPERIMENT_RULE_TYPES.has(rule.type) && rule.status !== 'archived')
      .map((rule) =>
        toExperiment(cfg, flag.key, rule.key, flag, rule, {
          live: Boolean(rule.enabled && env.enabled),
          status: rule.status ?? (rule.enabled ? 'running' : 'draft'),
        }),
      );
  });
}

/**
 * The experiment rules the site applies on any of `paths`, running ones first.
 *
 * With the site's datafile, running rules come from it: it holds each variation's
 * effective variable values, so a flag that turns the marker on per variation (rather
 * than by default) is found, and only what visitors get counts. Rules the datafile
 * doesn't serve (paused, draft, not started) come from the Flags API list. Without a
 * datafile (installs saved before the SDK key setting), the list is all there is.
 */
export function pageExperiments(
  datafile: Datafile | null,
  flags: FxFlagListItem[],
  cfg: FxConfig,
  paths: string[],
  profile: SiteProfile = DEFAULT_PROFILE,
): FoundExperiment[] {
  let found: FoundExperiment[];
  if (!datafile) {
    found = fromFlagList(flags, cfg, paths, profile);
  } else {
    const byKey = new Map(flags.map((f) => [f.key, f]));
    const live = liveCmsRules(datafile, profile)
      .filter((r) => r.kind === 'experiment' && coversAny(r.route, paths))
      .map((r) => {
        const flag = byKey.get(r.flagKey);
        const rule = flag?.environments?.[cfg.environmentKey]?.rules_detail?.find((d) => d.key === r.ruleKey);
        return toExperiment(cfg, r.flagKey, r.ruleKey, flag, rule, {live: true, status: 'running'});
      });
    // A rule the datafile serves is settled by the datafile, whichever page its overrides point at.
    const idle = fromFlagList(flags, cfg, paths, profile)
      .filter((e) => !isRuleLive(datafile, e.flagKey, e.ruleKey))
      .map((e) => ({...e, live: false}));
    found = [...live, ...idle];
  }
  return found.sort((a, b) => Number(b.live) - Number(a.live));
}
