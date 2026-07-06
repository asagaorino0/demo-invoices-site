import { DEFAULT_GOOGLE_SHEET_SETTING_KEY } from '../types';
import { normalizeWorkspaceKey } from './workspace';

export function buildGoogleSheetSettingKey(shopId?: string | null): string {
  const normalizedShopId = normalizeWorkspaceKey(String(shopId || '').trim());
  return normalizedShopId ? `${DEFAULT_GOOGLE_SHEET_SETTING_KEY}:${normalizedShopId}` : DEFAULT_GOOGLE_SHEET_SETTING_KEY;
}
