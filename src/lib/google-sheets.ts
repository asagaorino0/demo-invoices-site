import { createSign } from 'node:crypto';
import { exportInvoiceCsvRows } from './csv/export';
import { normalizeHeader } from './csv/shared';
import type { Project, ServiceLine } from '../types';
import { INVOICE_CSV_HEADERS, type InvoiceCsvRow } from '../types/csv';

const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

interface GoogleSheetsConfig {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
  sheetName: string;
}

interface GoogleTokenResponse {
  access_token: string;
}

export interface SyncProjectToGoogleSheetInput {
  project: Project;
  serviceLines: ServiceLine[];
}

export interface SyncProjectToGoogleSheetResult {
  spreadsheetId: string;
  sheetName: string;
  rowCount: number;
}

export async function syncProjectToGoogleSheet(
  input: SyncProjectToGoogleSheetInput
): Promise<SyncProjectToGoogleSheetResult> {
  const config = getGoogleSheetsConfig();
  const accessToken = await fetchGoogleAccessToken(config);
  const range = `${toSheetRangePrefix(config.sheetName)}!A:ZZ`;
  const existingValues = await fetchSheetValues({
    accessToken,
    spreadsheetId: config.spreadsheetId,
    range
  });

  const headerLabels = buildHeaderLabels(existingValues[0] || []);
  const headerKeys = headerLabels.map((value) => normalizeHeader(value));
  const userIdIndex = headerKeys.indexOf('userId');

  if (userIdIndex < 0) {
    throw new Error('Google Sheets のヘッダに userId 列がありません。テンプレート列を確認してください。');
  }

  const existingDataRows = existingValues
    .slice(1)
    .filter((row) => String(row[userIdIndex] || '').trim() !== input.project.customerId);
  const exportedRows = exportInvoiceCsvRows({
    projects: [input.project],
    serviceLines: input.serviceLines
  });
  const nextValues = [
    headerLabels,
    ...existingDataRows,
    ...exportedRows.map((row) => mapCsvRowToSheetRow(row, headerKeys))
  ];

  await clearSheetValues({
    accessToken,
    spreadsheetId: config.spreadsheetId,
    range
  });
  await updateSheetValues({
    accessToken,
    spreadsheetId: config.spreadsheetId,
    range: `${toSheetRangePrefix(config.sheetName)}!A1`,
    values: nextValues
  });

  return {
    spreadsheetId: config.spreadsheetId,
    sheetName: config.sheetName,
    rowCount: exportedRows.length
  };
}

function getGoogleSheetsConfig(): GoogleSheetsConfig {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '';
  const sheetName = process.env.GOOGLE_SHEETS_SHEET_NAME || '';

  if (!clientEmail || !privateKey || !spreadsheetId || !sheetName) {
    throw new Error(
      'Google Sheets 連携の設定が不足しています。.env.local に GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY / GOOGLE_SHEETS_SPREADSHEET_ID / GOOGLE_SHEETS_SHEET_NAME を設定してください。'
    );
  }

  return {
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n'),
    spreadsheetId,
    sheetName
  };
}

async function fetchGoogleAccessToken(config: GoogleSheetsConfig): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 3600;
  const unsignedJwt = [
    toBase64Url(
      JSON.stringify({
        alg: 'RS256',
        typ: 'JWT'
      })
    ),
    toBase64Url(
      JSON.stringify({
        iss: config.clientEmail,
        scope: GOOGLE_SHEETS_SCOPE,
        aud: GOOGLE_OAUTH_TOKEN_URL,
        exp: expiresAt,
        iat: issuedAt
      })
    )
  ].join('.');

  const signer = createSign('RSA-SHA256');
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer.sign(config.privateKey);
  const assertion = `${unsignedJwt}.${toBase64Url(signature)}`;

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google OAuth トークンの取得に失敗しました: ${text}`);
  }

  const data = (await response.json()) as GoogleTokenResponse;
  if (!data.access_token) {
    throw new Error('Google OAuth トークンの応答に access_token がありませんでした。');
  }

  return data.access_token;
}

async function fetchSheetValues(input: {
  accessToken: string;
  spreadsheetId: string;
  range: string;
}): Promise<string[][]> {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}`
  );

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${input.accessToken}`
    },
    cache: 'no-store'
  });

  if (response.status === 404) {
    throw new Error('Google Sheets の対象シートが見つかりません。スプレッドシートIDとシート名を確認してください。');
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets の読込に失敗しました: ${text}`);
  }

  const data = (await response.json()) as { values?: string[][] };
  return Array.isArray(data.values) ? data.values : [];
}

async function clearSheetValues(input: {
  accessToken: string;
  spreadsheetId: string;
  range: string;
}): Promise<void> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}:clear`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        'content-type': 'application/json'
      },
      body: '{}'
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets のクリアに失敗しました: ${text}`);
  }
}

async function updateSheetValues(input: {
  accessToken: string;
  spreadsheetId: string;
  range: string;
  values: string[][];
}): Promise<void> {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}`
  );
  url.searchParams.set('valueInputOption', 'RAW');

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      majorDimension: 'ROWS',
      values: input.values
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets の更新に失敗しました: ${text}`);
  }
}

function buildHeaderLabels(values: string[]): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    return [...INVOICE_CSV_HEADERS];
  }

  const headerLabels = values.map((value) => String(value || '').trim());
  const headerKeys = headerLabels.map((value) => normalizeHeader(value));
  const missingHeaders = INVOICE_CSV_HEADERS.filter((header) => !headerKeys.includes(header));

  if (missingHeaders.length > 0) {
    throw new Error(
      `Google Sheets のヘッダがテンプレートと一致しません。不足列: ${missingHeaders.join(', ')}`
    );
  }

  return headerLabels;
}

function mapCsvRowToSheetRow(row: InvoiceCsvRow, headerKeys: string[]): string[] {
  return headerKeys.map((headerKey) => {
    if (!headerKey) return '';
    return String(row[headerKey as keyof InvoiceCsvRow] ?? '');
  });
}

function toSheetRangePrefix(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function toBase64Url(input: string | Buffer): string {
  const base64 = Buffer.from(input).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
