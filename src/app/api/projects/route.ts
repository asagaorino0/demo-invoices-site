import { createProject, listProjectSummaries } from '../../../lib/store/projects';
import { validateProjectInput } from '../../../lib/validation';

export async function GET(): Promise<Response> {
  try {
    const projects = await listProjectSummaries();

    return Response.json({
      projects,
      count: projects.length
    });
  } catch (error) {
    return Response.json(
      {
        error: 'failed_to_list_projects',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      customerId?: string;
      customerName?: string;
      invoiceRecipient?: string;
      facilityName?: string;
      companyName?: string;
      issueDate?: string | null;
      defaultRemarks?: string;
    };

    const input = {
      customerId: String(body.customerId || '').trim(),
      customerName: String(body.customerName || '').trim(),
      invoiceRecipient: String(body.invoiceRecipient || '').trim(),
      facilityName: String(body.facilityName || '').trim(),
      companyName: String(body.companyName || '').trim(),
      issueDate: body.issueDate || null,
      defaultRemarks: String(body.defaultRemarks || '').trim()
    };
    const validation = validateProjectInput(input);
    if (!validation.ok) {
      return Response.json(
        { error: 'invalid_project_input', message: validation.message },
        { status: 400 }
      );
    }

    const project = await createProject(input);

    return Response.json({ project }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: 'failed_to_create_project',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
