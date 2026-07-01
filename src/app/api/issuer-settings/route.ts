import { DEFAULT_GOOGLE_SHEET_SETTING_KEY, DEFAULT_ISSUER_SETTING_KEY } from '../../../types';
import { getGoogleSheetsErrorStatus, syncIssuerToGoogleSheet } from '../../../lib/google-sheets';
import { getGoogleSheetSetting } from '../../../lib/store/google-sheet-settings';
import { getIssuerSetting, upsertIssuerSetting } from '../../../lib/store/issuer-settings';

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const settingKey = String(searchParams.get('settingKey') || '').trim() || DEFAULT_ISSUER_SETTING_KEY;
    const setting = await getIssuerSetting(settingKey);
    return Response.json({ setting });
  } catch (error) {
    return Response.json(
      {
        error: 'failed_to_get_issuer_setting',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      settingKey?: string;
      issuerName?: string;
      issuerPostalCode?: string;
      issuerAddress?: string;
      issuerContact?: string;
      issuerEmail?: string;
      issuerInvoiceNumber?: string;
      issuerRepresentativeName?: string;
      issuerRepresentativeTitle?: string;
      issuerStampUrl?: string;
      bankNote?: string;
    };

    const settingKey = String(body.settingKey || '').trim() || DEFAULT_ISSUER_SETTING_KEY;
    const setting = await upsertIssuerSetting({
      settingKey,
      issuerName: String(body.issuerName || '').trim(),
      issuerPostalCode: String(body.issuerPostalCode || '').trim(),
      issuerAddress: String(body.issuerAddress || '').trim(),
      issuerContact: String(body.issuerContact || '').trim(),
      issuerEmail: String(body.issuerEmail || '').trim(),
      issuerInvoiceNumber: String(body.issuerInvoiceNumber || '').trim(),
      issuerRepresentativeName: String(body.issuerRepresentativeName || '').trim(),
      issuerRepresentativeTitle: String(body.issuerRepresentativeTitle || '').trim(),
      issuerStampUrl: String(body.issuerStampUrl || '').trim(),
      bankNote: String(body.bankNote || '').trim()
    });

    const googleSheetSetting = await getGoogleSheetSetting(DEFAULT_GOOGLE_SHEET_SETTING_KEY);

    if (googleSheetSetting) {
      try {
        await syncIssuerToGoogleSheet({
          target: {
            spreadsheetId: googleSheetSetting.spreadsheetId,
            sheetName: googleSheetSetting.sheetName,
            historySheetName: googleSheetSetting.historySheetName
          },
          issuerSheetName: '発行者',
          issuerValues: setting
        });
      } catch (error) {
        const status = getGoogleSheetsErrorStatus(error) || 500;
        return Response.json(
          {
            error: 'failed_to_save_issuer_setting_to_google_sheet',
            message: error instanceof Error ? error.message : 'Unknown error',
            setting
          },
          { status }
        );
      }
    }

    return Response.json({
      ok: true,
      setting,
      message: googleSheetSetting
        ? '発行人情報を保存し、スプレッドシートへ反映しました。'
        : '発行人情報を保存しました。'
    });
  } catch (error) {
    return Response.json(
      {
        error: 'failed_to_save_issuer_setting',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
