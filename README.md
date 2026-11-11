# Page performance: CMS UI extension

An Optimizely CMS (SaaS) UI extension, built as a CMS-scoped OCP app. A sidebar shows how the page open in the editor performs.

## The panel

The first line says what is covered, e.g. `Last 28 days · /savings and /en/savings`. Then, up front:

- **Page views** for the last 28 days against the 28 before, with a daily chart.
- **Experiments on this page:** each FX A/B or bandit rule that applies here, by name, with a running/paused badge, the primary metric's results table (visitors, rate, lift, significance, and the winner if there is one), and **Full results in FX** / **Open in FX** buttons.

Under **More detail**: users, engagement rate, engagement time per user, key events, top sources, views per Web Experimentation variation, and the daily views as a table. Refresh sits at the top. The note that GA4 can't split FX variations (they share the page's URL) only shows when the page has experiments.

GA4 and FX are each optional. The panel shows whichever is configured, and says nothing about the other.

## What it matches

Both halves use the same two forms of the page's path: with and without the open locale's prefix (`/savings` and `/en/savings`). The extension has no CMS API client, so it can't read the page's primary language; it treats the open language as primary (see `pagePaths` in `src/shared/routes.ts`). The trade-off: on a translation, an experiment routed to the bare slug of the default-language page with the same slug shows too.

- **GA4** filters `pagePath` on those two forms, plus any `__v_` variation segments the site appends.
- **FX** follows the site's middleware. With the site's SDK key (the normal setup), running rules come from the site's datafile: an enabled rule whose served variations have the boolean `cms_flag` variable on and a `cms_route` covering one of the two paths. The datafile carries each variation's effective values, so a flag that turns `cms_flag` on per variation (the demo's `savings_offer`) is found. Rules the datafile doesn't serve (paused, draft) come from the Flags API list, by variable defaults. The Flags API also supplies names, traffic, and the ids and links for results.
- **Results** come from `GET /v2/experiments/{layer_experiment_id}/results`, with the rule's variation keys from its ruleset.
- **Legacy installs** saved before the SDK key setting have a project ID and environment but no SDK key. They keep working on the Flags API list alone (variable defaults only, so per-variation flags are missed) until the settings are saved again.

## Platform constraints (CMS UI extensions beta, SDK 1.1.0)
- **The extension context is only `{key, version, locale, publicUrl}`.** The page's path comes from `publicUrl`.
- **Reading settings an install never saved throws** in the production runtime; `readSection` treats that as empty.
- **The GA4 token endpoint is fixed** to `https://oauth2.googleapis.com/token`; a key file's `token_uri` is ignored, since the app posts a signed assertion there.

## Develop

```bash
yarn install
yarn validate      # lint + typecheck + unit tests + build + ocp-app-sdk validate
ocp dev            # the sidebar in a simulated CMS host, invokeFunction against the local backend
```

The live suite in `tests/live/` reads real FX flags and results (read-only):

```bash
PERF_LIVE=1 OPTIMIZELY_FX_API_TOKEN=… OPTIMIZELY_FX_PROJECT_ID=… OPTIMIZELY_FX_SDK_KEY=… PERF_LIVE_PATH=/en yarn vitest run tests/live
```

## Layout

| Path | What |
|---|---|
| `src/backend/functions/CmsUiExtension.ts` | The `performance` action, using the `{ok, result}` envelope |
| `src/backend/lib/validate.ts` | Checks the action's path and locale before any handler runs |
| `src/backend/lib/performance.ts` | GA4 report and FX experiments, loaded independently |
| `src/backend/lib/fx.ts` | Flags API calls, and which experiment rules apply on the page |
| `src/backend/lib/datafile.ts` | The site's datafile and its live CMS rules (shared with the FX extension) |
| `src/backend/lib/results.ts` | FX results summary: primary metric, leader (shared with the FX extension) |
| `src/backend/lib/ga4.ts` | GA4 Data API with a self-signed service-account JWT |
| `src/backend/lib/messages.ts` | Upstream errors as plain sentences for editors |
| `src/shared/routes.ts` | The site's route matching, and the paths checked for a page |
| `src/cms-ui-extensions/performance/` | `Performance.sidebar.tsx` and the charts |
| `src/cms-ui-extensions/common/` | Frame, OpenLink, ResultsTable, StatusBadge, useContent (shared with the other extensions) |

## Deploy

```bash
ocp app register --appId cms_page_performance --name "Page performance" --product HUB --personal   # once
ocp app prepare --bump-dev-version --publish
ocp directory install cms_page_performance@<version> --scope <cms-instance-uuid>
```

Later dev versions published the same way replace the running one on existing installs.
