import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  createGoogleSheetTargetWithUserAccessToken,
  exchangeGoogleOAuthCode,
  grantSpreadsheetAccessToServiceAccount,
  verifyGoogleSheetTarget
} from '../../../../lib/google-sheets';
import { upsertGoogleSheetSetting } from '../../../../lib/store/google-sheet-settings';
import { DEFAULT_GOOGLE_SHEET_SETTING_KEY } from '../../../../types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OAUTH_STATE_COOKIE = 'google_oauth_source_sheet_state';
const OAUTH_PAYLOAD_COOKIE = 'google_oauth_source_sheet_payload';

function redirectToProjects(request: NextRequest, status: 'success' | 'error', message: string) {
  const url = new URL('/projects', request.url);
  url.searchParams.set('googleSheetStatus', status);
  url.searchParams.set('googleSheetMessage', message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();

  try {
    const code = String(request.nextUrl.searchParams.get('code') || '').trim();
    const state = String(request.nextUrl.searchParams.get('state') || '').trim();
    const cookieState = cookieStore.get(OAUTH_STATE_COOKIE)?.value || '';
    const payloadCookie = cookieStore.get(OAUTH_PAYLOAD_COOKIE)?.value || '';

    cookieStore.delete(OAUTH_STATE_COOKIE);
    cookieStore.delete(OAUTH_PAYLOAD_COOKIE);

    if (!code || !state || !cookieState || state !== cookieState) {
      return redirectToProjects(request, 'error', 'Google 認証の状態確認に失敗しました。もう一度お試しください。');
    }

    const payload = JSON.parse(payloadCookie) as {
      spreadsheetTitle?: string;
      destinationFolderUrlOrId?: string;
      newFolderName?: string;
      sheetName?: string;
      historySheetName?: string;
    };
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || '';
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';

    console.log('[google/callback] received', {
      requestUrl: request.url,
      redirectUri,
      hasCode: Boolean(code),
      hasState: Boolean(state),
      cookieStateMatched: Boolean(code && state && cookieState && state === cookieState),
      payload
    });

    if (!redirectUri) {
      return redirectToProjects(request, 'error', 'GOOGLE_REDIRECT_URI が未設定です。');
    }

    if (!serviceAccountEmail) {
      return redirectToProjects(request, 'error', 'GOOGLE_SERVICE_ACCOUNT_EMAIL が未設定です。');
    }

    const tokens = await exchangeGoogleOAuthCode({ code, redirectUri });
    const created = await createGoogleSheetTargetWithUserAccessToken({
      accessToken: tokens.accessToken,
      title: String(payload.spreadsheetTitle || ''),
      destinationFolderId: extractDriveFolderId(String(payload.destinationFolderUrlOrId || '')),
      newFolderName: String(payload.newFolderName || ''),
      sheetName: String(payload.sheetName || ''),
      historySheetName: String(payload.historySheetName || '')
    });

    await grantSpreadsheetAccessToServiceAccount({
      accessToken: tokens.accessToken,
      spreadsheetId: created.spreadsheetId,
      serviceAccountEmail
    });

    await verifyGoogleSheetTarget({
      spreadsheetId: created.spreadsheetId,
      sheetName: created.sheetName,
      historySheetName: created.historySheetName
    });

    await upsertGoogleSheetSetting({
      settingKey: DEFAULT_GOOGLE_SHEET_SETTING_KEY,
      spreadsheetId: created.spreadsheetId,
      sheetName: created.sheetName,
      historySheetName: created.historySheetName
    });

    console.log('[google/callback] success', {
      redirectUri,
      spreadsheetId: created.spreadsheetId,
      spreadsheetUrl: created.spreadsheetUrl
    });

    return redirectToProjects(request, 'success', '新規スプレッドシートを作成して設定しました。');
  } catch (error) {
    console.error('[google/callback] failed', error);
    return redirectToProjects(
      request,
      'error',
      error instanceof Error ? error.message : 'Google スプレッドシートの作成に失敗しました。'
    );
  }
}

function extractDriveFolderId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch?.[1]) return folderMatch[1];
  return trimmed;
}
