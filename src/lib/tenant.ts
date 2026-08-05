import { cache } from 'react';
import { DEFAULT_GOOGLE_SHEET_SETTING_KEY } from '../types';
import type { GoogleSheetTarget } from './google-sheets';
import { loadBaseSiteConfig, loadIssuerSheetOverridesFromTarget } from './site-config';
import { getGoogleSheetSetting } from './store/google-sheet-settings';
import { getCurrentWorkspaceKey, normalizeWorkspaceKey } from './workspace';

export const getCurrentTenantScopeKey = cache(async (): Promise<string> => {
  const setting = await getGoogleSheetSetting(DEFAULT_GOOGLE_SHEET_SETTING_KEY).catch(() => null);
  const tenantId = normalizeTenantId(setting?.tenantId || '');
  if (tenantId) {
    return tenantId;
  }

  if (setting?.spreadsheetId) {
    const resolvedTenantId = await resolveTenantIdFromGoogleSheetTarget({
      spreadsheetId: setting.spreadsheetId,
      sheetName: setting.sheetName,
      historySheetName: setting.historySheetName
    }).catch(() => null);
    if (resolvedTenantId) {
      return resolvedTenantId;
    }
  }

  return getCurrentWorkspaceKey();
});

export const resolveTenantIdFromGoogleSheetTarget = cache(async (
  target: GoogleSheetTarget,
  issuerSheetName?: string | null
): Promise<string | null> => {
  const config = await loadBaseSiteConfig().catch(() => null);
  const resolvedIssuerSheetName =
    String(issuerSheetName || '').trim() || String(config?.issuerSheetName || '').trim() || '発行者';
  const issuerValues = await loadIssuerSheetOverridesFromTarget(target, resolvedIssuerSheetName).catch(() => null);
  return normalizeTenantId(String(issuerValues?.shopId || '')) || null;
});

export function normalizeTenantId(value: string): string {
  return normalizeWorkspaceKey(String(value || '').trim());
}
