# Page performance: CMS UI extension

An Optimizely CMS (SaaS) UI extension, built as a CMS-scoped OCP app. A sidebar shows how the page open in the editor performs:

- **GA4:** page views, users, engagement rate, engagement time per user and key events for the last 28 days against the 28 before. Also a daily views chart (with a table view) and the top sources. It is filtered on the page's path with or without the locale prefix.
- **Feature Experimentation:** every A/B or bandit rule that targets the page, with its status, traffic, variations and primary-metric results. It links to the results page and the flag.

It needs no site API. Experiments are found from FX alone: flags whose `cms_flag` default is true and whose `cms_route` covers the page's path, using the same matching as the site's middleware. Results come from `GET /v2/experiments/{layer_experiment_id}/results`. GA4 and FX are each optional; the sidebar shows whichever is configured.

## Platform constraints (CMS UI extensions beta, SDK 1.1.0)
- **The extension context is only `{key, version, locale, publicUrl}`.** The page's path comes from `publicUrl`.
- **Reading settings an install never saved throws** in the production runtime; `readSection` treats that as empty.

## Develop

```bash
yarn install
yarn validate      # lint + typecheck + unit tests + build + ocp-app-sdk validate
ocp dev            # the sidebar in a simulated CMS host, invokeFunction against the local backend
```

The live suite in `tests/live/` reads real FX flags and results (read-only):

```bash
PERF_LIVE=1 OPTIMIZELY_FX_API_TOKEN=… OPTIMIZELY_FX_PROJECT_ID=… PERF_LIVE_PATH=/en yarn vitest run tests/live
```

## Layout

| Path | What |
|---|---|
| `src/backend/functions/CmsUiExtension.ts` | The `performance` action, using the `{ok, result}` envelope |
| `src/backend/lib/performance.ts` | GA4 report and FX experiments, loaded independently |
| `src/backend/lib/fx.ts` | List flags, and pick the experiment rules covering a path |
| `src/backend/lib/fxResults.ts` | FX experiment results, primary metric |
| `src/backend/lib/ga4.ts` | GA4 Data API with a self-signed service-account JWT |
| `src/shared/path.ts` | Path from `publicUrl`, and the site's `routeMatches` |
| `src/cms-ui-extensions/performance/` | `Performance.sidebar.tsx` and the charts |

## Deploy

```bash
ocp app register --appId cms_page_performance --name "Page performance" --product HUB --personal   # once
ocp app prepare --bump-dev-version --publish
ocp directory install cms_page_performance@<version> --scope <cms-instance-uuid>
```

Later dev versions published the same way replace the running one on existing installs.
