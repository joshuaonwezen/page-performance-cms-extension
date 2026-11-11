import {
  AuthorizationGrantResult,
  CanUninstallResult,
  Lifecycle as AppLifecycle,
  LifecycleResult,
  LifecycleSettingsResult,
  logger,
  storage,
  SubmittedFormData,
  Request as AppRequest,
} from '@zaiusinc/app-sdk';

import {fetchDatafile, isSdkKey} from '../lib/datafile';
import {listEnvironments} from '../lib/fx';
import {checkAccess, parseServiceAccount} from '../lib/ga4';
import {ApiError} from '../lib/http';
import {FxSettings, Ga4Settings, readSection, toGa4Config} from '../lib/settings';

function text(formData: SubmittedFormData, key: string): string {
  const value = formData[key];
  return typeof value === 'string' ? value.trim() : '';
}

export class Lifecycle extends AppLifecycle {
  public async onInstall(): Promise<LifecycleResult> {
    return {success: true};
  }

  public async onUpgrade(_fromVersion: string): Promise<LifecycleResult> {
    return {success: true};
  }

  public async onFinalizeUpgrade(_fromVersion: string): Promise<LifecycleResult> {
    return {success: true};
  }

  public async onAfterUpgrade(): Promise<LifecycleResult> {
    return {success: true};
  }

  public async canUninstall(): Promise<CanUninstallResult> {
    return {uninstallable: true};
  }

  public async onUninstall(): Promise<LifecycleResult> {
    return {success: true};
  }

  public async onSettingsForm(
    section: string,
    action: string,
    formData: SubmittedFormData,
  ): Promise<LifecycleSettingsResult> {
    const result = new LifecycleSettingsResult();
    try {
      if (section === 'ga4' && action === 'saveGa4') return await this.saveGa4(formData, result);
      if (section === 'fx' && action === 'saveFx') return await this.saveFx(formData, result);
    } catch (error) {
      logger.error('Settings save failed', error);
      return result.addToast('danger', 'Could not save settings. Try again.');
    }
    logger.warn('Unsupported section-action combination:', section, action);
    return result;
  }

  private async saveGa4(formData: SubmittedFormData, result: LifecycleSettingsResult) {
    const previous = await readSection<Ga4Settings>('ga4');
    const next: Ga4Settings = {
      propertyId: text(formData, 'propertyId'),
      // A secret field comes back blank when the editor didn't retype it - keep the stored one.
      serviceAccountJson: text(formData, 'serviceAccountJson') || previous.serviceAccountJson || '',
    };
    if (!/^\d+$/.test(next.propertyId ?? '')) {
      return result.addError('propertyId', 'The numeric property ID, not the G- measurement ID.');
    }
    const serviceAccount = parseServiceAccount(next.serviceAccountJson);
    if (!serviceAccount) {
      return result.addError('serviceAccountJson', 'Paste the whole JSON key file (it has client_email and private_key).');
    }

    try {
      await checkAccess(toGa4Config(next)!);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        return result
          .addError('serviceAccountJson', `Add ${serviceAccount.client_email} as a Viewer on property ${next.propertyId}.`)
          .addToast('danger', 'The service account cannot read this property.');
      }
      if (error instanceof ApiError && error.status === 400) {
        return result.addError('serviceAccountJson', error.message).addToast('danger', 'Google rejected the key.');
      }
      throw error;
    }

    await storage.settings.put('ga4', {...next});
    return result.addToast('success', 'GA4 settings saved.');
  }

  private async saveFx(formData: SubmittedFormData, result: LifecycleSettingsResult) {
    const previous = await readSection<FxSettings>('fx');
    const apiToken = text(formData, 'apiToken') || previous.apiToken || '';
    const sdkKey = text(formData, 'sdkKey');
    if (!apiToken) return result.addError('apiToken', 'Required.');
    if (!isSdkKey(sdkKey)) return result.addError('sdkKey', 'Paste the SDK key your site uses.');

    // The SDK key decides which project and environment the site reads, so take both
    // from its datafile rather than asking for them.
    let projectId: string;
    let environmentKey: string;
    try {
      const datafile = await fetchDatafile(sdkKey, {fresh: true});
      projectId = String(datafile.projectId);
      environmentKey = datafile.environmentKey;
    } catch (error) {
      if (error instanceof ApiError && error.status < 500) {
        return result.addError('sdkKey', 'No datafile for this SDK key. Check it in FX → Settings → Environments.');
      }
      throw error;
    }

    const next: FxSettings = {apiToken, sdkKey, projectId, environmentKey};
    try {
      const environments = await listEnvironments({token: apiToken, projectId});
      if (!environments.includes(environmentKey)) {
        return result.addError('apiToken', `This token can't see environment "${environmentKey}" of project ${projectId}.`);
      }
    } catch (error) {
      if (error instanceof ApiError && (error.code === 'fx_unauthorized' || error.code === 'fx_not_found')) {
        return result
          .addError('apiToken', `FX rejected this token for project ${projectId}.`)
          .addToast('danger', 'FX rejected the token for the SDK key\'s project.');
      }
      throw error;
    }

    await storage.settings.put('fx', {...next});
    return result.addToast('success', `Saved. Showing experiments from project ${projectId}, environment ${environmentKey}.`);
  }

  public async onAuthorizationRequest(
    _section: string,
    _formData: SubmittedFormData,
  ): Promise<LifecycleSettingsResult> {
    return new LifecycleSettingsResult().addToast('danger', 'OAuth is not supported.');
  }

  public async onAuthorizationGrant(_request: AppRequest): Promise<AuthorizationGrantResult> {
    return new AuthorizationGrantResult('').addToast('danger', 'OAuth is not supported.');
  }
}
