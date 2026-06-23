import { getProjectExportBundle, markProjectAsExported } from '../../../../../lib/store/projects';
import { getGoogleSheetsErrorStatus, syncProjectToGoogleSheet } from '../../../../../lib/google-sheets';
import { getGoogleSheetSetting } from '../../../../../lib/store/google-sheet-settings';
import { DEFAULT_GOOGLE_SHEET_SETTING_KEY } from '../../../../../types';

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> }
): Promise<Response> {
  try {
    const { projectId } = await context.params;
    const bundle = await getProjectExportBundle(projectId);

    if (!bundle) {
      return Response.json(
        {
          error: 'project_not_found',
          message: `Project not found: ${projectId}`
        },
        { status: 404 }
      );
    }

    const setting = await getGoogleSheetSetting(DEFAULT_GOOGLE_SHEET_SETTING_KEY);
    if (!setting) {
      return Response.json(
        {
          error: 'google_sheet_setting_not_found',
          message: 'source スプレッドシート設定が未登録です。先にスプレッドシート設定を保存してください。'
        },
        { status: 404 }
      );
    }

    const result = await syncProjectToGoogleSheet({
      project: bundle.project,
      serviceLines: bundle.serviceLines,
      invoiceSelections: bundle.invoiceSelections,
      target: {
        spreadsheetId: setting.spreadsheetId,
        sheetName: setting.sheetName,
        historySheetName: setting.historySheetName
      }
    });

    await markProjectAsExported(projectId);

    return Response.json({
      ok: true,
      message: `${result.rowCount} 行を Google Sheets に保存しました。`,
      spreadsheetId: result.spreadsheetId,
      sheetName: result.sheetName,
      rowCount: result.rowCount
    });
  } catch (error) {
    const status = getGoogleSheetsErrorStatus(error) || 500;
    return Response.json(
      {
        error: 'failed_to_sync_google_sheet',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status }
    );
  }
}
