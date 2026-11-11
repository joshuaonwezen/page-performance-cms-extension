# Page performance

See how the page open in the editor performs, without leaving the CMS: its Google Analytics 4 (GA4) page views and the Feature Experimentation (FX) experiments that run on it, with their results.

Documentation: [walkthrough](https://opti.joshuaonwezen.dev/demo/cms-ui-extensions#page-performance).

## What editors get

A **Page performance** sidebar. Its first line says what is covered, e.g. `Last 28 days · /offers and /en/offers`. Then, up front:

- **Page views** for the last 28 days against the 28 days before, with a daily chart.
- **Experiments on this page:** each FX A/B or bandit rule that applies to the page, by name, with a running or paused badge, the primary metric's results (visitors, rate, lift, significance, and the winner if there is one), and **Full results in FX** / **Open in FX** buttons.

Under **More detail**: users, engagement rate, engagement time per user, key events, top sources, views per Web Experimentation variation, and the daily views as a table. **Refresh** sits at the top. When the page has experiments, a note explains that GA4 can't split their variations, since they share the page's URL.

GA4 and FX are each optional: the sidebar shows whichever is configured and says nothing about the other. Blocks, images and folders have no URL on the site, so the panel has nothing to show for them.

## Setup

1. Install the app on the CMS instance (see [Deploy](#deploy)). Each CMS instance gets its own install.
2. Fill in either settings section, or both.
3. Open a page and the **Page performance** tab on the editor's right-hand rail.

| Setting | Required | Where to find it | Used for |
|---|---|---|---|
| GA4 property ID | For GA4 | GA4: Admin > Property details. The numeric ID, not the `G-` measurement ID. | Which property the page views come from. |
| GA4 service account key (JSON) | For GA4 | Google Cloud: a service account key with the Analytics Data API enabled. Add the service account's email as a Viewer on the property. | Reading the GA4 report. |
| FX personal access token | For FX | FX: Profile > API Access > Generate new token. Read access is enough. | Listing the project's flags and reading experiment results. |
| FX site SDK key | For FX | FX: Settings > Environments | The key your site decides with. The project and environment are read from its datafile, so the panel shows the experiments visitors actually get. |

Using the extension on another CMS instance: [reuse](https://opti.joshuaonwezen.dev/demo/cms-ui-extensions#reuse). Something not working: [troubleshooting](https://opti.joshuaonwezen.dev/demo/cms-ui-extensions#troubleshooting).

## What your site needs

Both halves look for the page under two forms of its path: with and without the open language's prefix (`/offers` and `/en/offers`). The path comes from the page's public URL in the CMS.

- **GA4:** the site sends GA4 page views (the standard `page_view` event) for its pages, so GA4 records their path in the `pagePath` dimension. The panel counts a view when its path is one of the two forms, with or without a trailing slash. Views on a URL with variation segments appended (`/offers/__v_<flag>--<variation>`, or `/offers/__v_wx--<name>` for Web Experimentation) count toward the page too, and **More detail** splits them by variation.
- **FX:** an experiment counts as running on the page when the site would apply it there, following the [Feature Experimentation extension's convention](https://opti.joshuaonwezen.dev/demo/cms-ui-extensions#fx-experiments): its boolean `cms_flag` variable is `true` and its `cms_route` variable covers one of the page's two paths. Running rules are read from the datafile of the saved SDK key, which carries each variation's effective values, so a flag that turns `cms_flag` on in some variations only is found too. Paused and draft rules come from the Flags API, by the variables' default values. How a site applies these flags: [the site side](https://opti.joshuaonwezen.dev/demo/feature-experimentation). A site that uses other variable names changes `DEFAULT_PROFILE` in `src/shared/profile.ts` and redeploys the app.

## Limits

These come from the CMS UI extensions platform (beta, SDK 1.1.0) and from GA4:

- **The extension context is only `{key, version, locale, publicUrl}`.** The page's path comes from `publicUrl`.
- **The app has no CMS API client**, so it can't read a page's primary language. It treats the open language as primary. On a translation, an experiment routed to the bare path of a default-language page with the same slug shows too.
- **GA4 can't tell FX variations apart** when they share the page's URL. The experiment results come from FX instead.
- **The window is fixed** at the last 28 days against the 28 before.
- **Reading settings an install never saved throws** in the production runtime; the app treats that as empty.

## Security

- The app only reads: GA4 reports, the FX datafile, flags and results. Nothing is written to GA4, FX or the CMS.
- The action's path and locale are checked in `src/backend/lib/validate.ts` before any handler runs.
- The GA4 token endpoint is fixed to `https://oauth2.googleapis.com/token`. A key file's `token_uri` is ignored, so a pasted key can't send the signed assertion anywhere else.
- Upstream errors reach editors as plain sentences (`src/backend/lib/messages.ts`); the raw status and body stay in the app's logs.
- Secrets (the service account key and the FX token) are stored in the app's secret settings fields and never sent to the browser.

## Develop

```bash
yarn install
yarn validate      # lint + typecheck + unit tests + build + ocp-app-sdk validate
ocp dev            # the sidebar in a simulated CMS host, calling the local backend
```

The live suite in `tests/live/` reads real FX flags and results (read-only):

```bash
PERF_LIVE=1 OPTIMIZELY_FX_API_TOKEN=<fx-token> OPTIMIZELY_FX_PROJECT_ID=<project-id> OPTIMIZELY_FX_SDK_KEY=<sdk-key> \
PERF_LIVE_PATH=<page-path> yarn vitest run tests/live
```

## Deploy

With the OCP CLI (run it as `npx -p @optimizely/ocp-cli-v2 ocp ...` if it isn't installed):

```bash
npx -p @optimizely/ocp-cli-v2 ocp app register      # once
ocp app prepare --bump-dev-version --publish
ocp directory install cms_page_performance@<version> --scope <cms-instance-uuid>
```

Publishing a new dev version moves existing installs onto it.

## Layout

| Path | What |
|---|---|
| `src/backend/functions/CmsUiExtension.ts` | The `performance` action, using the `{ok, result}` envelope |
| `src/backend/lib/validate.ts` | Checks the action's path and locale before any handler runs |
| `src/backend/lib/performance.ts` | GA4 report and FX experiments, loaded independently |
| `src/backend/lib/fx.ts` | Flags API calls, and which experiment rules apply on the page |
| `src/backend/lib/datafile.ts` | The site's datafile and its live CMS rules (same logic as the Feature Experimentation extension) |
| `src/backend/lib/results.ts` | FX results summary: primary metric, leader (same logic as the Feature Experimentation extension) |
| `src/backend/lib/ga4.ts` | GA4 Data API with a self-signed service-account JWT |
| `src/backend/lib/messages.ts` | Upstream errors as plain sentences for editors |
| `src/shared/routes.ts` | Route matching, and the paths checked for a page |
| `src/shared/profile.ts` | The FX site convention (`DEFAULT_PROFILE`) |
| `src/cms-ui-extensions/performance/` | `Performance.sidebar.tsx` and the charts |
| `src/cms-ui-extensions/common/` | Frame, OpenLink, ResultsTable, StatusBadge, useContent |
