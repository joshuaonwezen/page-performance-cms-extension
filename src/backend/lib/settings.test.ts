import {logger, resetLocalSettingsStore, storage} from '@zaiusinc/app-sdk';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {loadConfig, toFxConfig} from './settings';

describe('settings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetLocalSettingsStore();
  });

  it('treats an unreadable store as empty', async () => {
    // What the production store throws on an install that has never saved its settings.
    vi.spyOn(storage.settings, 'get').mockRejectedValue(new Error('Failed to get value at app-data/1/settings'));
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    expect(await loadConfig()).toEqual({ga4: null, fx: null});
  });

  it('needs a token and a numeric project for FX, defaulting the environment', () => {
    expect(toFxConfig({apiToken: 't', projectId: '23385830076'})).toEqual({
      token: 't',
      projectId: '23385830076',
      environmentKey: 'production',
    });
    expect(toFxConfig({apiToken: 't', projectId: 'abc'})).toBeNull();
    expect(toFxConfig({projectId: '1'})).toBeNull();
  });
});
