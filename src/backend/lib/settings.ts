import {logger, storage, ValueHash} from '@zaiusinc/app-sdk';

import type {FxConfig} from './fx';
import type {Ga4Config} from './ga4';
import {parseServiceAccount} from './ga4';

// Section keys match forms/settings.yml.
// Type aliases, not interfaces: the settings store requires an index-signature-compatible shape.
export type Ga4Settings = {
  propertyId?: string;
  serviceAccountJson?: string;
};

export type FxSettings = {
  apiToken?: string;
  projectId?: string;
  environmentKey?: string;
};

export const DEFAULT_ENVIRONMENT = 'production';

export interface LoadedConfig {
  ga4: Ga4Config | null;
  fx: FxConfig | null;
}

/**
 * One settings section, or {} when the store can't be read. On a CMS-scoped install that has
 * never saved its settings, the production store throws "Failed to get value at
 * app-data/<install>/settings" instead of returning {}.
 */
export async function readSection<T extends ValueHash>(section: string): Promise<T> {
  try {
    return await storage.settings.get<T>(section);
  } catch (error) {
    logger.warn('Could not read settings section', section, error);
    return {} as T;
  }
}

export function toGa4Config(s: Ga4Settings): Ga4Config | null {
  const propertyId = s.propertyId?.trim() ?? '';
  const serviceAccount = parseServiceAccount(s.serviceAccountJson);
  return /^\d+$/.test(propertyId) && serviceAccount ? {propertyId, serviceAccount} : null;
}

export function toFxConfig(s: FxSettings): FxConfig | null {
  const token = s.apiToken?.trim() ?? '';
  const projectId = s.projectId?.trim() ?? '';
  if (!token || !/^\d+$/.test(projectId)) return null;
  return {token, projectId, environmentKey: s.environmentKey?.trim() || DEFAULT_ENVIRONMENT};
}

/** Each section is optional on its own: the sidebar shows what it has. */
export async function loadConfig(): Promise<LoadedConfig> {
  const [ga4, fx] = await Promise.all([readSection<Ga4Settings>('ga4'), readSection<FxSettings>('fx')]);
  return {ga4: toGa4Config(ga4), fx: toFxConfig(fx)};
}
