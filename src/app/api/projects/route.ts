import { createProject, listProjectSummaries, markProjectAsExported } from '../../../lib/store/projects';
import { normalizeCompanyName } from '../../../lib/project-fields';
import { validateProjectInput } from '../../../lib/validation';
import { getGoogleSheetSetting } from '../../../lib/store/google-sheet-settings';
import { getGoogleSheetsErrorStatus, syncProjectToGoogleSheet } from '../../../lib/google-sheets';
import { DEFAULT_GOOGLE_SHEET_SETTING_KEY, type Project } from '../../../types';

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
      subject?: string;
      defaultInvoiceDateMode?: Project['defaultInvoiceDateMode'];
      invoiceRecipient?: string;
      facilityName?: string;
      companyName?: string;
      issueDate?: string | null;
      defaultRemarks?: string;
    };

    const input = {
      customerId: String(body.customerId || '').trim(),
      customerName: String(body.customerName || '').trim(),
      subject: String(body.subject || '').trim(),
      defaultInvoiceDateMode: body.defaultInvoiceDateMode || 'monthEnd',
      invoiceRecipient: String(body.invoiceRecipient || '').trim(),
      facilityName: String(body.facilityName || '').trim(),
      companyName: normalizeCompanyName({
        companyName: String(body.companyName || '').trim(),
        invoiceRecipient: String(body.invoiceRecipient || '').trim()
      }),
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
    let message = '新規利用者を登録しました。';
    let sheetSync: {
      ok: boolean;
      spreadsheetId?: string;
      sheetName?: string;
      rowCount?: number;
      message?: string;
    } | null = null;

    const setting = await getGoogleSheetSetting(DEFAULT_GOOGLE_SHEET_SETTING_KEY).catch(() => null);

    if (setting) {
      try {
        const result = await syncProjectToGoogleSheet({
          project,
          serviceLines: [],
          invoiceSelections: [],
          target: {
            spreadsheetId: setting.spreadsheetId,
            sheetName: setting.sheetName,
            historySheetName: setting.historySheetName
          }
        });
        await markProjectAsExported(project.id);
        sheetSync = {
          ok: true,
          spreadsheetId: result.spreadsheetId,
          sheetName: result.sheetName,
          rowCount: result.rowCount,
          message: `${result.rowCount} 行を Google Sheets に保存しました。`
        };
        message = '新規利用者を登録し、Google Sheets に保存しました。';
      } catch (error) {
        const status = getGoogleSheetsErrorStatus(error);
        sheetSync = {
          ok: false,
          message: error instanceof Error ? error.message : 'Google Sheets への保存に失敗しました。'
        };
        if (status) {
          message = '新規利用者は登録しましたが、Google Sheets への保存はできませんでした。';
        }
      }
    }

    return Response.json({ project, message, sheetSync }, { status: 201 });
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
