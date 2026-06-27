import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OAUTH_STATE_COOKIE = 'google_oauth_source_sheet_state';
const OAUTH_PAYLOAD_COOKIE = 'google_oauth_source_sheet_payload';

function parseIssuerValues(searchParams: URLSearchParams) {
  return {
    issuerName: String(searchParams.get('issuerName') || '').trim(),
    issuerPostalCode: String(searchParams.get('issuerPostalCode') || '').trim(),
    issuerAddress: String(searchParams.get('issuerAddress') || '').trim(),
    issuerContact: String(searchParams.get('issuerContact') || '').trim(),
    issuerEmail: String(searchParams.get('issuerEmail') || '').trim(),
    issuerInvoiceNumber: String(searchParams.get('issuerInvoiceNumber') || '').trim(),
    issuerRepresentativeName: String(searchParams.get('issuerRepresentativeName') || '').trim(),
    issuerRepresentativeTitle: String(searchParams.get('issuerRepresentativeTitle') || '').trim(),
    issuerStampUrl: String(searchParams.get('issuerStampUrl') || '').trim(),
    bankNote: String(searchParams.get('bankNote') || '').trim(),
    bankName: String(searchParams.get('bankName') || '').trim(),
    bankNumber: String(searchParams.get('bankNumber') || '').trim()
  };
}

function must(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`ENV ${name} missing`);
  }
  return value;
}

function redirectToProjects(request: NextRequest, status: 'success' | 'error', message: string) {
  return redirectToPath(request, '/projects', status, message);
}

function redirectToPath(
  request: NextRequest,
  returnPath: string,
  status: 'success' | 'error',
  message: string
) {
  const url = new URL(normalizeReturnPath(returnPath), request.url);
  url.searchParams.set('googleSheetStatus', status);
  url.searchParams.set('googleSheetMessage', message);
  return NextResponse.redirect(url);
}

function normalizeReturnPath(input: string): string {
  const trimmed = String(input || '').trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return '/projects';
  }
  return trimmed;
}

export async function GET(request: NextRequest) {
  try {
    const spreadsheetTitle = String(request.nextUrl.searchParams.get('spreadsheetTitle') || '').trim();
    const destinationFolderUrlOrId = String(request.nextUrl.searchParams.get('destinationFolderUrlOrId') || '').trim();
    const newFolderName = String(request.nextUrl.searchParams.get('newFolderName') || '').trim();
    const sheetName = String(request.nextUrl.searchParams.get('sheetName') || '').trim();
    const historySheetName = String(request.nextUrl.searchParams.get('historySheetName') || '').trim() || 'history';
    const returnPath = normalizeReturnPath(String(request.nextUrl.searchParams.get('returnPath') || '').trim());
    const issuerValues = parseIssuerValues(request.nextUrl.searchParams);

    if (!spreadsheetTitle) {
      return redirectToProjects(request, 'error', '新規作成するスプレッドシート名を入力してください。');
    }

    if (!sheetName) {
      return redirectToProjects(request, 'error', 'シート名を入力してください。');
    }

    if (destinationFolderUrlOrId && newFolderName) {
      return redirectToProjects(request, 'error', '保存先フォルダは既存 URL か新規フォルダ名のどちらか一方だけ指定してください。');
    }

    const clientId = must(process.env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID');
    const redirectUri = must(process.env.GOOGLE_REDIRECT_URI, 'GOOGLE_REDIRECT_URI');
    const state = randomUUID();
    const cookieStore = await cookies();

    console.log('[google/auth] start', {
      clientIdPreview: `${clientId.slice(0, 12)}...`,
      redirectUri,
      origin: request.nextUrl.origin,
      spreadsheetTitle,
      destinationFolderUrlOrId,
      newFolderName,
      sheetName,
      historySheetName,
      returnPath,
      issuerValues
    });

    cookieStore.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 10
    });
    cookieStore.set(
      OAUTH_PAYLOAD_COOKIE,
      JSON.stringify({
        spreadsheetTitle,
        destinationFolderUrlOrId,
        newFolderName,
        sheetName,
        historySheetName,
        returnPath,
        issuerValues
      }),
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 10
      }
    );

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('include_granted_scopes', 'true');
    authUrl.searchParams.set(
      'scope',
      ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'].join(' ')
    );
    authUrl.searchParams.set('state', state);

    console.log('[google/auth] redirect', {
      redirectUri,
      authUrl: authUrl.toString()
    });

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('[google/auth] failed', error);
    return redirectToProjects(
      request,
      'error',
      error instanceof Error ? error.message : 'Google OAuth の開始に失敗しました。'
    );
  }
}
