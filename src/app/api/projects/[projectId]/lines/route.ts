import { createServiceLine } from '../../../../../lib/store/projects';
import { validateServiceLineInput } from '../../../../../lib/validation';

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
): Promise<Response> {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      serviceDate?: string | null;
      serviceName?: string;
      staffName?: string;
      price?: number;
      quantity?: number;
      unit?: string;
      taxIncluded?: boolean;
      remarks?: string;
      memo?: string;
      visible?: boolean;
      collectionStatus?: 'uncollected' | 'collected';
    };

    const input = {
      projectId,
      serviceDate: body.serviceDate || null,
      serviceName: String(body.serviceName || '').trim(),
      staffName: String(body.staffName || '').trim(),
      price: Number(body.price || 0),
      quantity: Number(body.quantity || 1),
      unit: String(body.unit || '回').trim(),
      taxIncluded: body.taxIncluded ?? true,
      remarks: String(body.remarks || '').trim(),
      memo: String(body.memo || '').trim(),
      visible: body.visible ?? true,
      collectionStatus: body.collectionStatus || 'uncollected'
    };
    const validation = validateServiceLineInput(input);
    if (!validation.ok) {
      return Response.json(
        { error: 'invalid_service_line_input', message: validation.message },
        { status: 400 }
      );
    }

    const line = await createServiceLine(input);

    return Response.json({ line }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: 'failed_to_create_line',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
