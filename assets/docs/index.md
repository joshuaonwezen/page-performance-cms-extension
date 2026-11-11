# Page performance

## Setup
Fill in either section, or both.

1. **Google Analytics 4**: the numeric property ID and a service account key (JSON). Add the
   service account's email as a Viewer on the property.
2. **Feature Experimentation**: a personal access token (read access is enough) and the SDK key
   your site uses. The project and environment are read from the SDK key, so the panel shows the
   experiments your visitors actually get. Installs saved before this setting keep working until
   the settings are saved again.

## Using it
Open a page and open the **Page performance** tab on the right-hand rail. The first line says what
it covers, e.g. "Last 28 days · /savings and /en/savings": the page's path with and without the
language prefix.

Up front are the page views (with the change against the 28 days before) and every FX experiment
that runs on the page, with its status and results, and links to the full results and the flag in
FX. **More detail** has users, engagement, key events, top sources, Web Experimentation variations
and the daily views as a table.

An experiment counts as running on the page when the site would apply it there: its flag turns the
`cms_flag` variable on and its `cms_route` covers the page. For running experiments this is read
from the site's datafile, so a flag that turns `cms_flag` on in some variations only is found too.
