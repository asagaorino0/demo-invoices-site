import { importInvoiceCsvRows, parseInvoiceCsvText } from '../../../../lib/csv/import';
import { getGoogleSheetsErrorStatus, readGoogleSheetCsvText } from '../../../../lib/google-sheets';
import { normalizeCompanyName } from '../../../../lib/project-fields';
import { getGoogleSheetSetting } from '../../../../lib/store/google-sheet-settings';
import { persistImportedBundle } from '../../../../lib/store/projects';
import { DEFAULT_GOOGLE_SHEET_SETTING_KEY } from '../../../../types';

export async function POST(request: Request): Promise<Response> {
  try {
    const settingKey = DEFAULT_GOOGLE_SHEET_SETTING_KEY;
    const setting = await getGoogleSheetSetting(settingKey);
    if (!setting) {
      return Response.json(
        {
          error: 'google_sheet_setting_not_found',
          message: 'source スプレッドシート設定が未登録です。先にスプレッドシート設定を保存してください。'
        },
        { status: 404 }
      );
    }

    const sheetResult = await readGoogleSheetCsvText({
      spreadsheetId: setting.spreadsheetId,
      sheetName: setting.sheetName,
      historySheetName: setting.historySheetName
    });
    const rows = parseInvoiceCsvText(sheetResult.csvText);
    const normalizedRows = rows.map((row) => ({
      ...row,
      companyName: normalizeCompanyName({
        companyName: row.companyName,
        invoiceRecipient: row.invoiceRecipient,
        fallbackCompanyName: ''
      })
    }));
    const bundle = importInvoiceCsvRows(normalizedRows);
    const warnings = bundle.warnings;
    const importId = crypto.randomUUID();
    const replaceCompanyNames = Array.from(
      new Set(
        rows.map((row) => String(row.companyName || '').trim()).filter(Boolean)
      )
    );

    const persisted = await persistImportedBundle({
      importId,
      replaceCompanyNames,
      sourceName: `google-sheet:${sheetResult.spreadsheetId}:${sheetResult.sheetName}`,
      sourceType: 'csv',
      rowCount: normalizedRows.length,
      warnings,
      projects: bundle.projects,
      serviceLines: bundle.serviceLines,
      invoiceSelections: bundle.invoiceSelections
    });

    return Response.json({
      ...persisted,
      warnings,
      sheetName: sheetResult.sheetName,
      spreadsheetId: sheetResult.spreadsheetId
    });
  } catch (error) {
    const status = getGoogleSheetsErrorStatus(error) || 500;
    return Response.json(
      {
        error: 'failed_to_import_google_sheet',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status }
    );
  }
}
