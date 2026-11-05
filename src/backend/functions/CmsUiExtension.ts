import * as App from '@zaiusinc/app-sdk';
import {logger} from '@zaiusinc/app-sdk';

import type {Envelope} from '../../shared/types';
import {ApiError} from '../lib/http';
import {ActionError, performance} from '../lib/performance';
import {loadConfig} from '../lib/settings';

interface RequestBody {
  action?: unknown;
  params?: {path?: unknown; locale?: unknown};
}

function ok<T>(result: T): Envelope<T> {
  return {ok: true, result};
}

function fail(error: string, message?: string): Envelope<never> {
  return message ? {ok: false, error, message} : {ok: false, error};
}

export class CmsUiExtension extends App.Function {
  public async perform(): Promise<App.Response> {
    const body = (this.request.bodyJSON ?? {}) as RequestBody;
    const action = typeof body.action === 'string' ? body.action : '';
    if (action !== 'performance') return new App.Response(400, fail('unknown_action', action));

    // Everything inside the try: a throw that escapes perform() reaches the editor as an
    // empty "[ExtensionService] Failed to invoke function:".
    try {
      const config = await loadConfig();
      if (!config.ga4 && !config.fx) {
        return new App.Response(
          412,
          fail('not_configured', 'Add a GA4 property and service account, an FX token and project, or both, in the app settings.'),
        );
      }
      return new App.Response(200, ok(await performance(config, body.params?.path, body.params?.locale)));
    } catch (error) {
      if (error instanceof ActionError) return new App.Response(400, fail(error.code, error.message));
      if (error instanceof ApiError) {
        logger.warn('Upstream API error', action, error.code, error.message);
        return new App.Response(502, fail(error.code, error.message));
      }
      logger.error('CmsUiExtension failure', action, error);
      return new App.Response(500, fail('internal_error'));
    }
  }
}
