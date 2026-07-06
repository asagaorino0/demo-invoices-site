export const DEFAULT_GOOGLE_SHEET_SETTING_KEY = 'default-source-sheet';

export interface GoogleSheetSetting {
  settingKey: string;
  spreadsheetId: string;
  sheetName: string;
  historySheetName: string | null;
  tenantId: string | null;
  createdAt: string;
  updatedAt: string;
}
