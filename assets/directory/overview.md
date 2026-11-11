# Page performance

See how the page open in the editor performs, without leaving the CMS.

- **Page performance** sidebar:
  - GA4 page views for the last 28 days against the 28 before, with a daily chart; users,
    engagement, key events and top sources one click away;
  - the Feature Experimentation experiments that run on the page, with their results.

GA4 and FX are each optional: the sidebar shows whichever you configure. Experiments are found the
way the site applies them: flags that drive CMS content (`cms_flag`) whose `cms_route` covers the
page's path, read from the datafile of the site's SDK key.
