# Page performance

See the open page's Google Analytics 4 (GA4) traffic and the Feature Experimentation (FX) experiments that run on it,
without leaving the editor. Walkthrough: [Page performance extension](https://opti.joshuaonwezen.dev/demo/cms-ui-extensions#page-performance).

## Setup

Install the app on the CMS instance, then fill in either settings section, or both.

1. **Google Analytics 4**: the numeric property ID (GA4: Admin > Property details) and a service account key (JSON)
   from Google Cloud, with the Analytics Data API enabled. Add the service account's email as a Viewer on the
   property.
2. **Feature Experimentation**: a personal access token (FX: Profile > API Access; read access is enough) and the
   SDK key your site decides with (FX: Settings > Environments). The project and environment are read from the SDK
   key, so the panel shows the experiments your visitors actually get.

## Using it

Open a page and the **Page performance** tab on the right-hand rail. The first line says what it covers, e.g.
"Last 28 days · /offers and /en/offers": the page's path with and without the language prefix.

Up front are the page views (with the change against the 28 days before) and every FX experiment that runs on the
page, with its status and results, and links to the full results and the flag in FX. **More detail** has users,
engagement, key events, top sources, views per variation and the daily views as a table.

## What your site needs

- **GA4**: the site sends GA4 page views for its pages, so GA4 records each page's path (`pagePath`). The panel
  matches the page's path with and without the language prefix.
- **FX**: an experiment counts as running on the page when the site would apply it there: its boolean `cms_flag`
  variable is `true` and its `cms_route` variable covers the page. This is the convention of the
  [Feature Experimentation extension](https://opti.joshuaonwezen.dev/demo/cms-ui-extensions#fx-experiments); how a
  site follows it: [the site side](https://opti.joshuaonwezen.dev/demo/feature-experimentation).

## Help

- Using the app on another CMS instance: [reuse](https://opti.joshuaonwezen.dev/demo/cms-ui-extensions#reuse).
- Something not working: [troubleshooting](https://opti.joshuaonwezen.dev/demo/cms-ui-extensions#troubleshooting).
