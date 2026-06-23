import {
  createGoogleSheetTarget,
  getGoogleSheetsErrorStatus,
  verifyGoogleSheetTarget
} from '../../../lib/google-sheets';
import { getGoogleSheetSetting, upsertGoogleSheetSetting } from '../../../lib/store/google-sheet-settings';
import { DEFAULT_GOOGLE_SHEET_SETTING_KEY } from '../../../types';

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const settingKey = String(searchParams.get('settingKey') || '').trim() || DEFAULT_GOOGLE_SHEET_SETTING_KEY;
    const setting = await getGoogleSheetSetting(settingKey);
    return Response.json({ setting });
  } catch (error) {
    const status = getGoogleSheetsErrorStatus(error) || 500;
    return Response.json(
      {
        error: 'failed_to_get_google_sheet_setting',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      settingKey?: string;
      createNew?: boolean;
      spreadsheetTitle?: string;
      spreadsheetUrlOrId?: string;
      sheetName?: string;
      historySheetName?: string | null;
    };

    const settingKey = String(body.settingKey || '').trim() || DEFAULT_GOOGLE_SHEET_SETTING_KEY;
    const createNew = Boolean(body.createNew);
    const spreadsheetTitle = String(body.spreadsheetTitle || '').trim();
    const requestedSpreadsheetId = extractSpreadsheetId(String(body.spreadsheetUrlOrId || '').trim());
    const sheetName = String(body.sheetName || '').trim();
    const historySheetName = String(body.historySheetName || '').trim() || null;

    if (!sheetName) {
      return Response.json(
        { error: 'sheet_name_required', message: 'シート名を入力してください。' },
        { status: 400 }
      );
    }

    if (!createNew && !requestedSpreadsheetId) {
      return Response.json(
        { error: 'spreadsheet_id_required', message: 'スプレッドシートURLまたはIDを入力してください。' },
        { status: 400 }
      );
    }

    if (createNew && !spreadsheetTitle) {
      return Response.json(
        { error: 'spreadsheet_title_required', message: '新規作成するスプレッドシート名を入力してください。' },
        { status: 400 }
      );
    }

    const created = createNew
      ? await createGoogleSheetTarget({
        title: spreadsheetTitle,
        sheetName,
        historySheetName
      })
      : null;
    const spreadsheetId = created?.spreadsheetId || requestedSpreadsheetId;

    const verified = await verifyGoogleSheetTarget({
      spreadsheetId,
      sheetName,
      historySheetName
    });
    const setting = await upsertGoogleSheetSetting({
      settingKey,
      spreadsheetId,
      sheetName,
      historySheetName
    });

    return Response.json({
      ok: true,
      setting,
      verified,
      created,
      message: createNew
        ? 'スプレッドシートを新規作成して設定しました。サービスアカウントでアクセス確認済みです。'
        : 'スプレッドシート設定を保存しました。サービスアカウントでアクセス確認済みです。'
    });
  } catch (error) {
    const status = getGoogleSheetsErrorStatus(error) || 500;
    return Response.json(
      {
        error: 'failed_to_save_google_sheet_setting',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status }
    );
  }
}

function extractSpreadsheetId(input: string): string {
  if (!input) return '';
  const matched = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (matched?.[1]) return matched[1];
  return input;
}
