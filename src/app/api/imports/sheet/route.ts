import { getSourceSheetSyncErrorStatus, syncProjectsFromSourceSheet } from '../../../../lib/source-sheet-sync';

export async function POST(): Promise<Response> {
  try {
    const persisted = await syncProjectsFromSourceSheet();

    return Response.json({
      ...persisted
    });
  } catch (error) {
    const status = getSourceSheetSyncErrorStatus(error);
    return Response.json(
      {
        error: 'failed_to_import_google_sheet',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status }
    );
  }
}
