import { replaceProjectSelections } from '../../../../../lib/store/projects';

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
): Promise<Response> {
  try {
    const { projectId } = await context.params;
    const body = (await request.json()) as { selectedLineIds?: string[] };
    const selectedLineIds = Array.isArray(body.selectedLineIds)
      ? body.selectedLineIds.filter(Boolean)
      : [];

    const result = await replaceProjectSelections(projectId, selectedLineIds);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error: 'failed_to_update_selections',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
