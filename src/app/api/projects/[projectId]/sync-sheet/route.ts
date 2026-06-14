import { getProjectExportBundle, markProjectAsExported } from '../../../../../lib/store/projects';
import { syncProjectToGoogleSheet } from '../../../../../lib/google-sheets';

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

    const result = await syncProjectToGoogleSheet({
      project: bundle.project,
      serviceLines: bundle.serviceLines
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
    return Response.json(
      {
        error: 'failed_to_sync_google_sheet',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
