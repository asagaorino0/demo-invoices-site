import { exportInvoiceCsvText } from '../../../../../lib/csv/export';
import { createExportJob, getProjectExportBundle } from '../../../../../lib/store/projects';

export async function GET(
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

    const fileName = buildExportFileName(bundle.project);
    const csvText = exportInvoiceCsvText({
      projects: [bundle.project],
      serviceLines: bundle.serviceLines
    });

    await createExportJob({
      projectId,
      fileName,
      exportedRowCount: bundle.serviceLines.length
    });

    return new Response(csvText, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${fileName}"`,
        'cache-control': 'no-store'
      }
    });
  } catch (error) {
    return Response.json(
      {
        error: 'failed_to_export_project',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

function buildExportFileName(project: { customerId: string; customerName: string; issueDate: string | null }) {
  const name = sanitizeFilePart(project.customerName || project.customerId);
  const month = String(project.issueDate || '').replace(/-/g, '').slice(0, 6) || 'undated';
  return `invoice_project_${name}_${month}.csv`;
}

function sanitizeFilePart(value: string) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim();
}
