import {ActionError} from './errors';
import {ApiError} from './http';

// Editors read these in the sidebar, so an upstream failure becomes a plain sentence;
// the raw status and body go to the app logs instead.

const MESSAGES: Record<string, string> = {
  ga4_unauthorized: 'Google Analytics refused the service account. Ask a CMS admin to check the GA4 settings of this app.',
  ga4_not_found: 'Google Analytics can\'t find the property in this app\'s settings. Ask a CMS admin to check it.',
  ga4_rejected: 'Google Analytics turned the request down. Ask a CMS admin to check the GA4 settings of this app.',
  ga4_conflict: 'Google Analytics turned the request down. Try again in a moment.',
  ga4_rate_limited: 'Google Analytics is busy. Try again in a minute.',
  ga4_unavailable: 'Google Analytics didn\'t answer. Try again in a moment.',
  fx_unauthorized:
    'Feature Experimentation refused the access token. Ask a CMS admin to check the Feature Experimentation settings of this app.',
  fx_not_found:
    'Feature Experimentation can\'t find the project in this app\'s settings. Ask a CMS admin to check them.',
  fx_rejected:
    'Feature Experimentation turned the request down. Ask a CMS admin to check the Feature Experimentation settings of this app.',
  fx_conflict: 'Feature Experimentation turned the request down. Try again in a moment.',
  fx_rate_limited: 'Feature Experimentation is busy. Try again in a minute.',
  fx_unavailable: 'Feature Experimentation didn\'t answer. Try again in a moment.',
};

const FALLBACK = 'Something went wrong. Try again in a moment.';

/** A sentence an editor can act on; never the upstream HTTP status or response body. */
export function plainMessage(error: unknown): string {
  if (error instanceof ActionError) return error.message;
  if (error instanceof ApiError) return MESSAGES[error.code] ?? FALLBACK;
  return FALLBACK;
}
