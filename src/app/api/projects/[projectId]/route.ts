import { getProjectDetail, updateProjectHeader } from '../../../../lib/store/projects';
import { normalizeCompanyName } from '../../../../lib/project-fields';
import type { Project } from '../../../../types';

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> }
): Promise<Response> {
  try {
    const { projectId } = await context.params;
    const bundle = await getProjectDetail(projectId);

    if (!bundle.project) {
      return Response.json(
        {
          error: 'project_not_found',
          message: `Project not found: ${projectId}`
        },
        { status: 404 }
      );
    }

    return Response.json(bundle);
  } catch (error) {
    return Response.json(
      {
        error: 'failed_to_get_project',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
): Promise<Response> {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      customerName?: string;
      defaultInvoiceDateMode?: Project['defaultInvoiceDateMode'];
      invoiceRecipient?: string;
      facilityName?: string;
      companyName?: string;
      issueDate?: string | null;
      defaultRemarks?: string;
      status?: 'draft' | 'ready_for_export' | 'exported';
    };

    const project = await updateProjectHeader({
      projectId,
      customerName: String(body.customerName || '').trim(),
      defaultInvoiceDateMode: body.defaultInvoiceDateMode || 'monthEnd',
      invoiceRecipient: String(body.invoiceRecipient || '').trim(),
      facilityName: String(body.facilityName || '').trim(),
      companyName: normalizeCompanyName({
        companyName: String(body.companyName || '').trim(),
        invoiceRecipient: String(body.invoiceRecipient || '').trim()
      }),
      issueDate: body.issueDate || null,
      defaultRemarks: String(body.defaultRemarks || '').trim(),
      status: body.status || 'draft'
    });

    if (!project) {
      return Response.json(
        { error: 'project_not_found', message: `Project not found: ${projectId}` },
        { status: 404 }
      );
    }

    return Response.json({ project });
  } catch (error) {
    return Response.json(
      {
        error: 'failed_to_update_project',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
