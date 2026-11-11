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

  it('reads the project and environment saved from the SDK key\'s datafile', async () => {
    await storage.settings.put('fx', {apiToken: 't', sdkKey: 'SdkKey12345', projectId: '1234567890', environmentKey: 'development'});
    expect((await loadConfig()).fx).toEqual({
      token: 't',
      projectId: '1234567890',
      environmentKey: 'development',
      sdkKey: 'SdkKey12345',
    });
  });

  it('keeps installs saved before the SDK key working, defaulting the environment', () => {
    expect(toFxConfig({apiToken: 't', projectId: '1234567890'})).toEqual({
      token: 't',
      projectId: '1234567890',
      environmentKey: 'production',
      sdkKey: '',
    });
    expect(toFxConfig({apiToken: 't', projectId: 'abc'})).toBeNull();
    expect(toFxConfig({projectId: '1'})).toBeNull();
  });
});
