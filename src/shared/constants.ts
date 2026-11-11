export const CMS_EXTENSION_FUNCTION_ID = 'cms_extension';

// The site convention (marker and route variable names) lives in DEFAULT_PROFILE
// (./profile), shared with the Feature Experimentation extension.

export const FX_APP_BASE = 'https://app.optimizely.com/v2';

/** The panel only opens links into the FX app; anything else from an API answer is dropped. */
export function isFxAppUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && url.startsWith('https://app.optimizely.com/');
}
