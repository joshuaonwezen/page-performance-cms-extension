import {describe, expect, it} from 'vitest';

import {ActionError} from './errors';
import {ApiError} from './http';
import {plainMessage} from './messages';

describe('plainMessage', () => {
  it('turns upstream errors into sentences without the status or body', () => {
    const error = new ApiError(403, 'ga4_unauthorized', 'GA4 report: HTTP 403 {"error":{"status":"PERMISSION_DENIED"}}');
    expect(plainMessage(error)).toBe(
      'Google Analytics refused the service account. Ask a CMS admin to check the GA4 settings of this app.',
    );
    for (const code of ['fx_unauthorized', 'fx_not_found', 'fx_rejected', 'fx_rate_limited', 'fx_unavailable', 'ga4_unavailable']) {
      expect(plainMessage(new ApiError(500, code, 'List flags: HTTP 500 {}'))).not.toMatch(/HTTP|\{/);
    }
  });

  it('keeps a request error\'s own message and covers anything else', () => {
    expect(plainMessage(new ActionError('invalid_input', 'Page URL: required.'))).toBe('Page URL: required.');
    expect(plainMessage(new Error('socket hang up'))).toBe('Something went wrong. Try again in a moment.');
    expect(plainMessage(new ApiError(418, 'teapot', 'x'))).toBe('Something went wrong. Try again in a moment.');
  });
});
