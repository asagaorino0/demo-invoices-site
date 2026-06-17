import { importInvoiceCsvRows, parseInvoiceCsvText } from '../../../../lib/csv/import';
import { getGoogleSheetsErrorStatus, readGoogleSheetCsvText } from '../../../../lib/google-sheets';
import { normalizeCompanyName } from '../../../../lib/project-fields';
import { getGoogleSheetSetting } from '../../../../lib/store/google-sheet-settings';
import { persistImportedBundle } from '../../../../lib/store/projects';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as { customerId?: string; shopKey?: string };
    const shopKey = String(body.shopKey || '').trim();

    if (!shopKey) {
      return Response.json(
        { error: 'shop_key_required', message: '取り込み対象のショップを指定してください。' },
        { status: 400 }
      );
    }

    const setting = await getGoogleSheetSetting(shopKey);
    if (!setting) {
      return Response.json(
        {
          error: 'google_sheet_setting_not_found',
          message: 'このショップの source スプレッドシート設定が未登録です。先に設定を保存してください。'
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
        fallbackCompanyName: shopKey
      })
    }));
    const bundle = importInvoiceCsvRows(normalizedRows);
    const warnings = bundle.warnings;
    const importId = crypto.randomUUID();
    const replaceCompanyNames = Array.from(
      new Set(
        [shopKey, ...rows.map((row) => String(row.companyName || '').trim())].filter(Boolean)
      )
    );

    const persisted = await persistImportedBundle({
      importId,
      replaceCompanyNames,
      sourceName: `google-sheet:${shopKey}:${sheetResult.sheetName}`,
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
      shopKey,
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
