import * as App from '@zaiusinc/app-sdk';
import {logger} from '@zaiusinc/app-sdk';

import type {Envelope} from '../../shared/types';
import {ActionError} from '../lib/errors';
import {ApiError} from '../lib/http';
import {plainMessage} from '../lib/messages';
import {performance} from '../lib/performance';
import {loadConfig} from '../lib/settings';
import {isAction, PARSERS} from '../lib/validate';

interface RequestBody {
  action?: unknown;
  params?: unknown;
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
    if (!isAction(action)) return new App.Response(400, fail('unknown_action', action.slice(0, 64)));

    // Everything inside the try: a throw that escapes perform() reaches the editor as an
    // empty "[ExtensionService] Failed to invoke function:".
    try {
      const raw = body.params && typeof body.params === 'object' && !Array.isArray(body.params) ? body.params : {};
      const params = PARSERS[action](raw as Record<string, unknown>);

      const config = await loadConfig();
      if (!config.ga4 && !config.fx) {
        return new App.Response(
          412,
          fail('not_configured', 'The app has no Google Analytics 4 or Feature Experimentation settings yet.'),
        );
      }
      return new App.Response(200, ok(await performance(config, params)));
    } catch (error) {
      if (error instanceof ActionError) return new App.Response(400, fail(error.code, error.message));
      if (error instanceof ApiError) {
        logger.warn('Upstream API error', action, error.code, error.message);
        return new App.Response(502, fail(error.code, plainMessage(error)));
      }
      logger.error('CmsUiExtension failure', action, error);
      return new App.Response(500, fail('internal_error'));
    }
  }
}
