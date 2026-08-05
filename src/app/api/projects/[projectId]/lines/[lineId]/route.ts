import {
  deleteServiceLine,
  duplicateServiceLine,
  updateServiceLine,
  upsertProjectDetailSnapshot
} from '../../../../../../lib/store/projects';
import { readSourceSheetViewData } from '../../../../../../lib/source-sheet-view';
import { validateServiceLineInput } from '../../../../../../lib/validation';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string; lineId: string }> }
): Promise<Response> {
  try {
    const { projectId, lineId } = await context.params;
    const body = (await request.json()) as {
      reservationId?: string;
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
      collectedAt?: string | null;
      receiptIssuedAt?: string | null;
    };

    const input = {
      projectId,
      lineId,
      reservationId: body.reservationId ? String(body.reservationId).trim() : undefined,
      serviceDate: body.serviceDate || null,
      serviceName: String(body.serviceName || '').trim(),
      staffName: String(body.staffName || '').trim(),
      price: Number(body.price || 0),
      quantity: Number(body.quantity || 1),
      unit: String(body.unit || '回').trim(),
      taxIncluded: Boolean(body.taxIncluded),
      remarks: String(body.remarks || '').trim(),
      memo: String(body.memo || '').trim(),
      visible: body.visible ?? true,
      collectionStatus: body.collectionStatus || 'uncollected',
      collectedAt: body.collectedAt || null,
      receiptIssuedAt: body.receiptIssuedAt || null
    };
    const validation = validateServiceLineInput(input);
    if (!validation.ok) {
      return Response.json(
        { error: 'invalid_service_line_input', message: validation.message },
        { status: 400 }
      );
    }

    let line = await updateServiceLine(input);

    if (!line) {
      const sourceView = await readSourceSheetViewData().catch(() => null);
      const sourceBundle = sourceView?.detailsByProjectId.get(projectId) || null;

      if (sourceBundle?.project) {
        await upsertProjectDetailSnapshot({
          project: sourceBundle.project,
          serviceLines: sourceBundle.serviceLines,
          invoiceSelections: sourceBundle.invoiceSelections
        }).catch(() => undefined);
        line = await updateServiceLine(input);
      }
    }

    if (!line) {
      return Response.json(
        { error: 'line_not_found', message: `Service line not found: ${lineId}` },
        { status: 404 }
      );
    }

    return Response.json({ line });
  } catch (error) {
    return Response.json(
      {
        error: 'failed_to_update_line',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string; lineId: string }> }
): Promise<Response> {
  try {
    const { projectId, lineId } = await context.params;
    const line = await duplicateServiceLine({ projectId, lineId });

    if (!line) {
      return Response.json(
        { error: 'line_not_found', message: `Service line not found: ${lineId}` },
        { status: 404 }
      );
    }

    return Response.json({ line }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: 'failed_to_duplicate_line',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string; lineId: string }> }
): Promise<Response> {
  try {
    const { projectId, lineId } = await context.params;
    await deleteServiceLine(projectId, lineId);
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json(
      {
        error: 'failed_to_delete_line',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
