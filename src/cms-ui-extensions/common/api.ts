import type {ExtensionContext} from '@optimizely/cms-extensibility-sdk';
import {CMS_EXTENSION_FUNCTION_ID} from '@shared/constants';
import type {ActionName, ActionParams, ActionResults, Envelope} from '@shared/types';

export class CallError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = 'CallError';
    this.code = code;
  }
}

// Shown when the backend sends a code without a message. Plain sentences: editors read them.
const FALLBACK_MESSAGES: Record<string, string> = {
  not_configured: 'The app is missing settings.',
  fx_unauthorized: 'Feature Experimentation refused the access token. Ask a CMS admin to check this app\'s settings.',
  fx_rate_limited: 'Feature Experimentation is busy. Try again in a minute.',
  ga4_unauthorized: 'Google Analytics refused the service account. Ask a CMS admin to check this app\'s settings.',
  internal_error: 'Something went wrong in the extension. Try again in a moment.',
  backend_unreachable: 'The extension didn\'t answer. Try again; if it keeps happening, ask a CMS admin to check the app.',
  request_failed: 'The extension sent an answer it couldn\'t read. Try again in a moment.',
};

const GENERIC_MESSAGE = 'Something went wrong. Try again in a moment.';

/** Calls one backend action; resolves with its result or throws CallError. */
export async function call<A extends ActionName>(
  context: ExtensionContext,
  action: A,
  params: ActionParams[A],
): Promise<ActionResults[A]> {
  // The CMS rejects with an empty "[ExtensionService] Failed to invoke function:" when the
  // backend throws instead of answering.
  const response = await context.extension.invokeFunction(CMS_EXTENSION_FUNCTION_ID, {action, params}).catch(() => {
    throw new CallError('backend_unreachable', FALLBACK_MESSAGES.backend_unreachable);
  });
  const envelope = response.data as Envelope<ActionResults[A]> | undefined;
  if (envelope && typeof envelope === 'object' && 'ok' in envelope) {
    if (envelope.ok) return envelope.result;
    throw new CallError(envelope.error, envelope.message || FALLBACK_MESSAGES[envelope.error] || GENERIC_MESSAGE);
  }
  throw new CallError('request_failed', FALLBACK_MESSAGES.request_failed);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed.';
}

// Errors only a CMS admin can fix (app settings): no Retry, a warning rather than an error.
const ADMIN_FIXES = new Set(['not_configured']);

export function needsAdmin(error: unknown): boolean {
  return error instanceof CallError && ADMIN_FIXES.has(error.code);
}

export function isNotConfigured(error: unknown): boolean {
  return error instanceof CallError && error.code === 'not_configured';
}
