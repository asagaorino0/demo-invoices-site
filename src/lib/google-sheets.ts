import { createSign } from 'node:crypto';
import { exportInvoiceCsvRows } from './csv/export';
import { normalizeHeader } from './csv/shared';
import type { InvoiceSelection, Project, ServiceLine } from '../types';
import { INVOICE_CSV_HEADERS, type InvoiceCsvRow } from '../types/csv';

const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

class GoogleSheetsRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GoogleSheetsRequestError';
    this.status = status;
  }
}

interface GoogleSheetsConfig {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
  sheetName: string;
  historySheetName: string;
}

export interface GoogleSheetTarget {
  spreadsheetId: string;
  sheetName: string;
  historySheetName?: string | null;
}

interface GoogleTokenResponse {
  access_token: string;
}

export interface SyncProjectToGoogleSheetInput {
  project: Project;
  serviceLines: ServiceLine[];
  invoiceSelections: InvoiceSelection[];
  target: GoogleSheetTarget;
}

export interface SyncProjectToGoogleSheetResult {
  spreadsheetId: string;
  sheetName: string;
  rowCount: number;
}

export interface SyncIssuerToGoogleSheetInput {
  target: GoogleSheetTarget;
  issuerSheetName?: string | null;
  issuerValues?: IssuerSheetSeed | null;
}

export interface SyncIssuerToGoogleSheetResult {
  spreadsheetId: string;
  issuerSheetName: string;
  rowCount: number;
}

export interface ReadGoogleSheetResult {
  spreadsheetId: string;
  sheetName: string;
  values: string[][];
}

export interface CreateGoogleSheetTargetInput {
  title: string;
  sheetName: string;
  historySheetName?: string | null;
  issuerSheetName?: string | null;
  issuerValues?: IssuerSheetSeed | null;
}

export interface CreateGoogleSheetTargetResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetName: string;
  historySheetName: string;
  issuerSheetName: string;
}

export interface IssuerSheetSeed {
  shopId?: string | null;
  issuerName?: string | null;
  issuerPostalCode?: string | null;
  issuerAddress?: string | null;
  issuerContact?: string | null;
  issuerEmail?: string | null;
  issuerInvoiceNumber?: string | null;
  issuerRepresentativeName?: string | null;
  issuerRepresentativeTitle?: string | null;
  issuerStampUrl?: string | null;
  bankNote?: string | null;
  bankName?: string | null;
  bankNumber?: string | null;
}

export interface GoogleUserOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
}

interface GoogleSheetHistoryRecord {
  savedAt: string;
  action: string;
  projectId: string;
  customerId: string;
  customerName: string;
  reservationId: string;
  detailLabel: string;
  changedFields: string;
  changeSummary: string;
  rowCount: string;
}

const HISTORY_HEADERS = [
  'savedAt',
  'action',
  'projectId',
  'customerId',
  'customerName',
  'reservationId',
  'detailLabel',
  'changedFields',
  'changeSummary',
  'rowCount'
] as const;

const ISSUER_HEADERS = [
  'shopId',
  'issuerName',
  'issuerPostalCode',
  'issuerAddress',
  'issuerContact',
  'issuerEmail',
  'issuerInvoiceNumber',
  'issuerRepresentativeName',
  'issuerRepresentativeTitle',
  'issuerStampUrl',
  'bankNote'
] as const;

const HISTORY_FIELD_LABELS: Partial<Record<keyof InvoiceCsvRow | 'reservationId', string>> = {
  userId: '顧客ID',
  userName: '利用者名',
  subject: '件名',
  defaultInvoiceDateMode: '請求日タイプ',
  invoiceRecipient: '請求先',
  facilityName: '施設名',
  companyName: '会社名',
  issuerBoxOffsetX: '送り主欄X',
  issuerBoxOffsetY: '送り主欄Y',
  issuerBoxWidth: '送り主欄幅',
  stampOffsetX: '角印X',
  stampOffsetY: '角印Y',
  notesBoxHeight: '備考欄高さ',
  reservationId: '明細',
  date: 'サービス日',
  service: 'サービス名',
  staff: '担当',
  price: '単価',
  baseQuantity: '数量',
  baseUnit: '単位',
  taxIncluded: '税区分',
  extraCharges: '追加料金',
  outsourceUnitPrice: '外注単価',
  outsourceUnitQuantity: '外注数量',
  outsourceUnit: '外注単位',
  outsourceUnitExtraCharges: '外注追加料金',
  invoiceCode: '請求書番号',
  invoiceDate: '請求日',
  isCollected: '回収状態',
  isCollectedDate: '回収日',
  receiptIssueDate: '領収書発行日',
  remarks: '備考',
  memo: 'メモ',
  visible: '表示'
};

export async function syncProjectToGoogleSheet(
  input: SyncProjectToGoogleSheetInput
): Promise<SyncProjectToGoogleSheetResult> {
  const config = getGoogleSheetsConfig(input.target);
  const accessToken = await fetchGoogleAccessToken(config);
  const range = `${toSheetRangePrefix(config.sheetName)}!A:ZZ`;
  const existingValues = await readGoogleSheetValuesInternal(config, accessToken);

  const headerLabels = buildHeaderLabels(existingValues[0] || []);
  const headerKeys = headerLabels.map((value) => normalizeHeader(value));
  const userIdIndex = headerKeys.indexOf('userId');

  if (userIdIndex < 0) {
    throw new Error('Google Sheets のヘッダに userId 列がありません。テンプレート列を確認してください。');
  }

  const currentCustomerRows = existingValues
    .slice(1)
    .filter((row) => String(row[userIdIndex] || '').trim() === input.project.customerId);
  const existingDataRows = existingValues
    .slice(1)
    .filter((row) => String(row[userIdIndex] || '').trim() !== input.project.customerId);
  const selectedReservationIds = new Set(
    input.invoiceSelections
      .filter((selection) => selection.selectedForInvoice)
      .map((selection) => input.serviceLines.find((line) => line.id === selection.lineId)?.reservationId || '')
      .filter(Boolean)
  );
  const currentCustomerRowMap = buildReservationRowMap(headerKeys, currentCustomerRows);
  const exportedRows = exportInvoiceCsvRows({
    projects: [input.project],
    serviceLines: input.serviceLines,
    invoiceSelections: input.invoiceSelections
  }).map((row) => {
    if (selectedReservationIds.has(row.reservationId)) {
      return row;
    }

    const existingRow = currentCustomerRowMap.get(row.reservationId);
    return {
      ...row,
      subject: existingRow?.subject || row.subject
    };
  });
  const historyRecords = buildHistoryRecords({
    config,
    project: input.project,
    headerKeys,
    previousRows: currentCustomerRows,
    nextRows: exportedRows.map((row) => mapCsvRowToSheetRow(row, headerKeys))
  });
  const nextValues = [
    headerLabels,
    ...existingDataRows,
    ...exportedRows.map((row) => mapCsvRowToSheetRow(row, headerKeys))
  ];

  await clearSheetValues({
    accessToken,
    spreadsheetId: config.spreadsheetId,
    range,
    clientEmail: config.clientEmail
  });
  await updateSheetValues({
    accessToken,
    spreadsheetId: config.spreadsheetId,
    range: `${toSheetRangePrefix(config.sheetName)}!A1`,
    values: nextValues,
    clientEmail: config.clientEmail
  });
  await appendHistoryRecords({
    accessToken,
    config,
    records: historyRecords
  });

  return {
    spreadsheetId: config.spreadsheetId,
    sheetName: config.sheetName,
    rowCount: exportedRows.length
  };
}

export async function readGoogleSheetValues(target: GoogleSheetTarget): Promise<ReadGoogleSheetResult> {
  const config = getGoogleSheetsConfig(target);
  const accessToken = await fetchGoogleAccessToken(config);
  const values = await readGoogleSheetValuesInternal(config, accessToken);

  return {
    spreadsheetId: config.spreadsheetId,
    sheetName: config.sheetName,
    values
  };
}

export async function readGoogleSheetCsvText(target: GoogleSheetTarget): Promise<{
  spreadsheetId: string;
  sheetName: string;
  csvText: string;
}> {
  const result = await readGoogleSheetValues(target);
  const csvText = `${result.values.map((row) => row.map(escapeCsvCell).join(',')).join('\n')}\n`;

  return {
    spreadsheetId: result.spreadsheetId,
    sheetName: result.sheetName,
    csvText
  };
}

export async function verifyGoogleSheetTarget(target: GoogleSheetTarget): Promise<{
  spreadsheetId: string;
  sheetName: string;
  historySheetName: string;
  sheetExists: boolean;
  headerRowCount: number;
}> {
  const config = getGoogleSheetsConfig(target);
  const accessToken = await fetchGoogleAccessToken(config);
  const metadata = await fetchSpreadsheetMetadata({
    accessToken,
    spreadsheetId: config.spreadsheetId,
    clientEmail: config.clientEmail
  });
  const sheetExists = metadata.sheets.some((sheet) => sheet.properties?.title === config.sheetName);

  if (!sheetExists) {
    throw new Error(`指定したシート "${config.sheetName}" が見つかりません。`);
  }

  const values = await readGoogleSheetValuesInternal(config, accessToken);
  buildHeaderLabels(values[0] || []);

  return {
    spreadsheetId: config.spreadsheetId,
    sheetName: config.sheetName,
    historySheetName: config.historySheetName,
    sheetExists,
    headerRowCount: values[0]?.length || 0
  };
}

export async function getGoogleSpreadsheetTitle(target: GoogleSheetTarget): Promise<string> {
  const config = getGoogleSheetsConfig(target);
  const accessToken = await fetchGoogleAccessToken(config);
  const metadata = await fetchSpreadsheetMetadata({
    accessToken,
    spreadsheetId: config.spreadsheetId,
    clientEmail: config.clientEmail
  });

  return String(metadata.properties?.title || '').trim();
}

export async function syncIssuerToGoogleSheet(
  input: SyncIssuerToGoogleSheetInput
): Promise<SyncIssuerToGoogleSheetResult> {
  const config = getGoogleSheetsConfig(input.target);
  const accessToken = await fetchGoogleAccessToken(config);
  const issuerSheetName = String(input.issuerSheetName || '').trim() || '発行者';
  const issuerValues = normalizeIssuerSheetSeed(input.issuerValues);

  await ensureSheetExists(accessToken, config.spreadsheetId, issuerSheetName, config.clientEmail);
  await updateSheetValues({
    accessToken,
    spreadsheetId: config.spreadsheetId,
    range: `${toSheetRangePrefix(issuerSheetName)}!A1`,
    clientEmail: config.clientEmail,
    values: [Array.from(ISSUER_HEADERS), buildIssuerSheetRow(issuerValues)]
  });

  return {
    spreadsheetId: config.spreadsheetId,
    issuerSheetName,
    rowCount: 1
  };
}

export async function createGoogleSheetTarget(
  input: CreateGoogleSheetTargetInput
): Promise<CreateGoogleSheetTargetResult> {
  const sheetName = String(input.sheetName || '').trim();
  const historySheetName = String(input.historySheetName || '').trim() || 'history';
  const issuerSheetName = String(input.issuerSheetName || '').trim() || '発行者';
  const issuerValues = normalizeIssuerSheetSeed(input.issuerValues);
  const title = String(input.title || '').trim();

  if (!title) {
    throw new Error('新規作成するスプレッドシート名を入力してください。');
  }
  if (!sheetName) {
    throw new Error('シート名を入力してください。');
  }

  const config = getGoogleSheetsConfig({
    spreadsheetId: '__new__',
    sheetName,
    historySheetName
  });
  const accessToken = await fetchGoogleAccessToken(config);
  const created = await createSpreadsheet({
    accessToken,
    title,
    sheetName,
    historySheetName,
    issuerSheetName,
    clientEmail: config.clientEmail
  });

  await updateSheetValues({
    accessToken,
    spreadsheetId: created.spreadsheetId,
    range: `${toSheetRangePrefix(sheetName)}!A1`,
    values: [Array.from(INVOICE_CSV_HEADERS)],
    clientEmail: config.clientEmail
  });

  await updateSheetValues({
    accessToken,
    spreadsheetId: created.spreadsheetId,
    range: `${toSheetRangePrefix(historySheetName)}!A1`,
    values: [Array.from(HISTORY_HEADERS)],
    clientEmail: config.clientEmail
  });

  await updateSheetValues({
    accessToken,
    spreadsheetId: created.spreadsheetId,
    range: `${toSheetRangePrefix(issuerSheetName)}!A1`,
    values: [Array.from(ISSUER_HEADERS), buildIssuerSheetRow(issuerValues)],
    clientEmail: config.clientEmail
  });

  return {
    spreadsheetId: created.spreadsheetId,
    spreadsheetUrl: created.spreadsheetUrl,
    sheetName,
    historySheetName,
    issuerSheetName
  };
}

export async function exchangeGoogleOAuthCode(input: {
  code: string;
  redirectUri: string;
}): Promise<GoogleUserOAuthTokens> {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth の設定が不足しています。.env.local に GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET を設定してください。');
  }

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      code: input.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code'
    })
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Google OAuth トークンの交換に失敗しました: ${text}`);
  }

  const data = JSON.parse(text) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) {
    throw new Error('Google OAuth の応答に access_token がありませんでした。');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiryDate: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined
  };
}

export async function createGoogleSheetTargetWithUserAccessToken(input: {
  accessToken: string;
  title: string;
  newFolderName?: string | null;
  sheetName: string;
  historySheetName?: string | null;
  issuerSheetName?: string | null;
  issuerValues?: IssuerSheetSeed | null;
}): Promise<CreateGoogleSheetTargetResult> {
  const sheetName = String(input.sheetName || '').trim();
  const historySheetName = String(input.historySheetName || '').trim() || 'history';
  const issuerSheetName = String(input.issuerSheetName || '').trim() || '発行者';
  const issuerValues = normalizeIssuerSheetSeed(input.issuerValues);
  const issuerRow = buildIssuerSheetRow(issuerValues);
  const title = String(input.title || '').trim();
  const newFolderName = String(input.newFolderName || '').trim();

  if (!title) {
    throw new Error('新規作成するスプレッドシート名を入力してください。');
  }
  if (!sheetName) {
    throw new Error('シート名を入力してください。');
  }
  console.log('[google-sheets] createGoogleSheetTargetWithUserAccessToken', {
    title,
    sheetName,
    historySheetName,
    issuerSheetName,
    issuerValues,
    issuerRow
  });

  const parentFolderId = newFolderName
    ? await createDriveFolder({
        accessToken: input.accessToken,
        folderName: newFolderName
      })
    : '';

  const created = await createSpreadsheet({
    accessToken: input.accessToken,
    title,
    sheetName,
    historySheetName,
    issuerSheetName
  });

  if (parentFolderId) {
    await moveDriveFileToFolder({
      accessToken: input.accessToken,
      fileId: created.spreadsheetId,
      folderId: parentFolderId
    });
  }

  await updateSheetValues({
    accessToken: input.accessToken,
    spreadsheetId: created.spreadsheetId,
    range: `${toSheetRangePrefix(sheetName)}!A1`,
    values: [Array.from(INVOICE_CSV_HEADERS)]
  });

  await updateSheetValues({
    accessToken: input.accessToken,
    spreadsheetId: created.spreadsheetId,
    range: `${toSheetRangePrefix(historySheetName)}!A1`,
    values: [Array.from(HISTORY_HEADERS)]
  });

  await updateSheetValues({
    accessToken: input.accessToken,
    spreadsheetId: created.spreadsheetId,
    range: `${toSheetRangePrefix(issuerSheetName)}!A1`,
    values: [Array.from(ISSUER_HEADERS), issuerRow]
  });

  return {
    spreadsheetId: created.spreadsheetId,
    spreadsheetUrl: created.spreadsheetUrl,
    sheetName,
    historySheetName,
    issuerSheetName
  };
}

function normalizeIssuerSheetSeed(input?: IssuerSheetSeed | null): IssuerSheetSeed {
  return {
    shopId: String(input?.shopId || '').trim(),
    issuerName: String(input?.issuerName || '').trim(),
    issuerPostalCode: String(input?.issuerPostalCode || '').trim(),
    issuerAddress: String(input?.issuerAddress || '').trim(),
    issuerContact: String(input?.issuerContact || '').trim(),
    issuerEmail: String(input?.issuerEmail || '').trim(),
    issuerInvoiceNumber: String(input?.issuerInvoiceNumber || '').trim(),
    issuerRepresentativeName: String(input?.issuerRepresentativeName || '').trim(),
    issuerRepresentativeTitle: String(input?.issuerRepresentativeTitle || '').trim(),
    issuerStampUrl: String(input?.issuerStampUrl || '').trim(),
    bankNote: String(input?.bankNote || '').trim(),
    bankName: String(input?.bankName || '').trim(),
    bankNumber: String(input?.bankNumber || '').trim()
  };
}

function buildIssuerSheetRow(values: IssuerSheetSeed): string[] {
  const bankNote = values.bankNote || buildIssuerBankNote(values.bankName, values.bankNumber);
  return [
    values.shopId || '',
    values.issuerName || '',
    values.issuerPostalCode || '',
    values.issuerAddress || '',
    values.issuerContact || '',
    values.issuerEmail || '',
    values.issuerInvoiceNumber || '',
    values.issuerRepresentativeName || '',
    values.issuerRepresentativeTitle || '',
    values.issuerStampUrl || '',
    bankNote
  ];
}

function buildIssuerBankNote(bankName?: string | null, bankNumber?: string | null): string {
  const parts = [String(bankName || '').trim(), String(bankNumber || '').trim()].filter(Boolean);
  return parts.length > 0 ? `振込先：${parts.join(' ')}` : '';
}

async function ensureDriveFolderAccessible(input: {
  accessToken: string;
  folderId: string;
}): Promise<string> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.folderId)}?fields=id,name,mimeType&supportsAllDrives=true`,
    {
      headers: {
        authorization: `Bearer ${input.accessToken}`
      }
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`指定した保存先フォルダを確認できませんでした: ${text}`);
  }

  const data = (await response.json()) as {
    id?: string;
    mimeType?: string;
  };

  if (data.mimeType !== 'application/vnd.google-apps.folder' || !data.id) {
    throw new Error('指定した URL は Google Drive フォルダではありません。');
  }

  return data.id;
}

async function createDriveFolder(input: {
  accessToken: string;
  folderName: string;
}): Promise<string> {
  const response = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      name: input.folderName,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`保存先フォルダを新規作成できませんでした: ${text}`);
  }

  const data = (await response.json()) as { id?: string };

  if (!data.id) {
    throw new Error('保存先フォルダの作成結果にフォルダ ID が含まれていませんでした。');
  }

  return data.id;
}

async function moveDriveFileToFolder(input: {
  accessToken: string;
  fileId: string;
  folderId: string;
}): Promise<void> {
  const metadataResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.fileId)}?fields=parents&supportsAllDrives=true`,
    {
      headers: {
        authorization: `Bearer ${input.accessToken}`
      }
    }
  );

  if (!metadataResponse.ok) {
    const text = await metadataResponse.text();
    throw new Error(`作成したスプレッドシートの保存先を確認できませんでした: ${text}`);
  }

  const metadata = (await metadataResponse.json()) as { parents?: string[] };
  const removeParents = Array.isArray(metadata.parents) ? metadata.parents.join(',') : '';
  const updateUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.fileId)}`);
  updateUrl.searchParams.set('supportsAllDrives', 'true');
  updateUrl.searchParams.set('addParents', input.folderId);
  if (removeParents) {
    updateUrl.searchParams.set('removeParents', removeParents);
  }

  const updateResponse = await fetch(updateUrl.toString(), {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${input.accessToken}`
    }
  });

  if (!updateResponse.ok) {
    const text = await updateResponse.text();
    throw new Error(`スプレッドシートを指定フォルダへ移動できませんでした: ${text}`);
  }
}

export async function grantSpreadsheetAccessToServiceAccount(input: {
  accessToken: string;
  spreadsheetId: string;
  serviceAccountEmail: string;
}): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.spreadsheetId)}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        role: 'writer',
        type: 'user',
        emailAddress: input.serviceAccountEmail
      })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`作成したスプレッドシートをサービスアカウントへ共有できませんでした: ${text}`);
  }
}

export function getGoogleSheetsErrorStatus(error: unknown): number | null {
  if (error instanceof GoogleSheetsRequestError) {
    return error.status;
  }

  return null;
}

function getGoogleSheetsConfig(target: GoogleSheetTarget): GoogleSheetsConfig {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';
  const spreadsheetId = String(target.spreadsheetId || '').trim();
  const sheetName = String(target.sheetName || '').trim();
  const historySheetName = String(target.historySheetName || '').trim() || 'history';

  if (!clientEmail || !privateKey || !spreadsheetId || !sheetName) {
    throw new Error(
      'Google Sheets 連携の設定が不足しています。.env.local に GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY を設定し、対象ユーザーのスプレッドシート設定を保存してください。'
    );
  }

  return {
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n'),
    spreadsheetId,
    sheetName,
    historySheetName
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
  clientEmail?: string;
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
    throw buildGoogleSheetsApiError('Google Sheets の読込に失敗しました。', response.status, text, input.clientEmail);
  }

  const data = (await response.json()) as { values?: string[][] };
  return Array.isArray(data.values) ? data.values : [];
}

async function fetchSpreadsheetMetadata(input: {
  accessToken: string;
  spreadsheetId: string;
  clientEmail?: string;
}): Promise<{ properties?: { title?: string }; sheets: Array<{ properties?: { title?: string } }> }> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}?fields=properties.title,sheets.properties.title`,
    {
      headers: {
        authorization: `Bearer ${input.accessToken}`
      },
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw buildGoogleSheetsApiError(
      'Google Sheets のメタデータ取得に失敗しました。',
      response.status,
      text,
      input.clientEmail
    );
  }

  return (await response.json()) as { properties?: { title?: string }; sheets: Array<{ properties?: { title?: string } }> };
}

async function createSpreadsheet(input: {
  accessToken: string;
  title: string;
  sheetName: string;
  historySheetName: string;
  issuerSheetName?: string;
  clientEmail?: string;
}): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const sheetTitles = [input.sheetName, input.historySheetName, input.issuerSheetName || '']
    .map((title) => String(title || '').trim())
    .filter(Boolean)
    .filter((title, index, values) => values.indexOf(title) === index);
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        title: input.title
      },
      sheets: sheetTitles.map((title) => ({
        properties: {
          title
        }
      }))
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw buildGoogleSheetsApiError(
      'Google Sheets の新規作成に失敗しました。',
      response.status,
      text,
      input.clientEmail
    );
  }

  const data = (await response.json()) as {
    spreadsheetId?: string;
    spreadsheetUrl?: string;
  };

  if (!data.spreadsheetId || !data.spreadsheetUrl) {
    throw new Error('Google Sheets の新規作成結果に必要な情報が含まれていませんでした。');
  }

  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl
  };
}

async function readGoogleSheetValuesInternal(
  config: GoogleSheetsConfig,
  accessToken: string
): Promise<string[][]> {
  const range = `${toSheetRangePrefix(config.sheetName)}!A:ZZ`;
  return fetchSheetValues({
    accessToken,
    spreadsheetId: config.spreadsheetId,
    range,
    clientEmail: config.clientEmail
  });
}

async function clearSheetValues(input: {
  accessToken: string;
  spreadsheetId: string;
  range: string;
  clientEmail?: string;
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
    throw buildGoogleSheetsApiError('Google Sheets のクリアに失敗しました。', response.status, text, input.clientEmail);
  }
}

async function updateSheetValues(input: {
  accessToken: string;
  spreadsheetId: string;
  range: string;
  values: string[][];
  clientEmail?: string;
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
    throw buildGoogleSheetsApiError('Google Sheets の更新に失敗しました。', response.status, text, input.clientEmail);
  }
}

async function appendSheetValues(input: {
  accessToken: string;
  spreadsheetId: string;
  range: string;
  values: string[][];
  clientEmail?: string;
}): Promise<void> {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}/values/${encodeURIComponent(input.range)}:append`
  );
  url.searchParams.set('valueInputOption', 'RAW');
  url.searchParams.set('insertDataOption', 'INSERT_ROWS');

  const response = await fetch(url, {
    method: 'POST',
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
    throw buildGoogleSheetsApiError('Google Sheets の追記に失敗しました。', response.status, text, input.clientEmail);
  }
}

async function batchUpdateSpreadsheet(input: {
  accessToken: string;
  spreadsheetId: string;
  requests: unknown[];
  clientEmail?: string;
}): Promise<void> {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        requests: input.requests
      })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw buildGoogleSheetsApiError(
      'Google Sheets のシート更新に失敗しました。',
      response.status,
      text,
      input.clientEmail
    );
  }
}

function buildHeaderLabels(values: string[]): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    return [...INVOICE_CSV_HEADERS];
  }

  const headerLabels = values.map((value) => String(value || '').trim());
  const headerKeys = headerLabels.map((value) => normalizeHeader(value));
  const missingHeaders = INVOICE_CSV_HEADERS.filter((header) => !headerKeys.includes(header));
  const optionalHeaders = new Set<keyof InvoiceCsvRow>([
    'subject',
    'issuerBoxOffsetX',
    'issuerBoxOffsetY',
    'issuerBoxWidth',
    'stampOffsetX',
    'stampOffsetY',
    'notesBoxHeight'
  ]);
  const requiredMissingHeaders = missingHeaders.filter((header) => !optionalHeaders.has(header));

  if (requiredMissingHeaders.length > 0) {
    throw new Error(
      `Google Sheets のヘッダがテンプレートと一致しません。不足列: ${requiredMissingHeaders.join(', ')}`
    );
  }

  const appendedHeaderLabels = [...headerLabels];
  for (const header of missingHeaders) {
    appendedHeaderLabels.push(header);
  }

  return appendedHeaderLabels;
}

function mapCsvRowToSheetRow(row: InvoiceCsvRow, headerKeys: string[]): string[] {
  return headerKeys.map((headerKey) => {
    if (!headerKey) return '';
    return String(row[headerKey as keyof InvoiceCsvRow] ?? '');
  });
}

async function appendHistoryRecords(input: {
  accessToken: string;
  config: GoogleSheetsConfig;
  records: GoogleSheetHistoryRecord[];
}): Promise<void> {
  if (input.records.length === 0) return;

  await ensureSheetExists(
    input.accessToken,
    input.config.spreadsheetId,
    input.config.historySheetName,
    input.config.clientEmail
  );
  const range = `${toSheetRangePrefix(input.config.historySheetName)}!A:J`;
  const existingValues = await fetchSheetValues({
    accessToken: input.accessToken,
    spreadsheetId: input.config.spreadsheetId,
    range,
    clientEmail: input.config.clientEmail
  });

  const headerRow = Array.from(HISTORY_HEADERS);
  const shouldRewriteHeader =
    existingValues.length === 0 ||
    headerRow.some((header, index) => String(existingValues[0]?.[index] || '') !== header);

  if (shouldRewriteHeader) {
    await updateSheetValues({
      accessToken: input.accessToken,
      spreadsheetId: input.config.spreadsheetId,
      range: `${toSheetRangePrefix(input.config.historySheetName)}!A1`,
      clientEmail: input.config.clientEmail,
      values: [
        headerRow,
        ...input.records.map((record) => mapHistoryRecordToRow(record)),
        ...existingValues.slice(1)
      ]
    });
    return;
  }

  await appendSheetValues({
    accessToken: input.accessToken,
    spreadsheetId: input.config.spreadsheetId,
    range,
    values: input.records.map((record) => mapHistoryRecordToRow(record)),
    clientEmail: input.config.clientEmail
  });
}

async function ensureSheetExists(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  clientEmail?: string
): Promise<void> {
  const metadata = await fetchSpreadsheetMetadata({ accessToken, spreadsheetId, clientEmail });
  const exists = metadata.sheets.some((sheet) => sheet.properties?.title === sheetName);

  if (exists) return;

  await batchUpdateSpreadsheet({
    accessToken,
    spreadsheetId,
    clientEmail,
    requests: [
      {
        addSheet: {
          properties: {
            title: sheetName
          }
        }
      }
    ]
  });
}

function buildGoogleSheetsApiError(
  prefix: string,
  fallbackStatus: number,
  rawText: string,
  clientEmail?: string
): Error {
  const parsed = parseGoogleApiError(rawText);
  const status = parsed.code ?? fallbackStatus;

  if (status === 403) {
    const accountHint = clientEmail
      ? `サービスアカウント ${clientEmail} を対象スプレッドシートへ「編集者」として共有してください。`
      : '対象スプレッドシートをサービスアカウントへ「編集者」として共有してください。';
    return new GoogleSheetsRequestError(
      `${prefix} Google Sheets へのアクセス権がありません。${accountHint}${parsed.message ? ` Google API: ${parsed.message}` : ''}`,
      status
    );
  }

  if (status === 404) {
    return new GoogleSheetsRequestError(
      `${prefix} スプレッドシートまたはシートが見つかりません。URL / ID とシート名を確認してください。`,
      status
    );
  }

  return new GoogleSheetsRequestError(
    `${prefix}${parsed.message ? ` ${parsed.message}` : ` ${rawText}`}`,
    status
  );
}

function parseGoogleApiError(rawText: string): { code?: number; message?: string } {
  try {
    const parsed = JSON.parse(rawText) as {
      error?: {
        code?: number;
        message?: string;
      };
    };

    return {
      code: parsed.error?.code,
      message: parsed.error?.message
    };
  } catch {
    return {
      message: rawText
    };
  }
}

function buildHistoryRecords(input: {
  config: GoogleSheetsConfig;
  project: Project;
  headerKeys: string[];
  previousRows: string[][];
  nextRows: string[][];
}): GoogleSheetHistoryRecord[] {
  const diff = diffSheetRows(input.headerKeys, input.previousRows, input.nextRows);
  const savedAt = formatHistoryTimestamp(new Date());

  if (diff.records.length === 0) {
    return [
      {
        savedAt,
        action: '同期',
        projectId: input.project.id,
        customerId: input.project.customerId,
        customerName: input.project.customerName,
        reservationId: '',
        detailLabel: '変更なし',
        changedFields: '',
        changeSummary: '変更なし',
        rowCount: String(input.nextRows.length)
      }
    ];
  }

  return diff.records.map((record) => ({
    savedAt,
    action: record.action,
    projectId: input.project.id,
    customerId: input.project.customerId,
    customerName: input.project.customerName,
    reservationId: record.reservationId,
    detailLabel: record.detailLabel,
    changedFields: record.changedFields.map(formatHistoryFieldLabel).join(', '),
    changeSummary: record.changeSummary.join(' | '),
    rowCount: String(input.nextRows.length)
  }));
}

function diffSheetRows(
  headerKeys: string[],
  previousRows: string[][],
  nextRows: string[][]
): {
  records: Array<{
    action: string;
    reservationId: string;
    detailLabel: string;
    changedFields: string[];
    changeSummary: string[];
  }>;
} {
  const previousMap = buildReservationRowMap(headerKeys, previousRows);
  const nextMap = buildReservationRowMap(headerKeys, nextRows);
  const reservationIds = Array.from(new Set([...previousMap.keys(), ...nextMap.keys()])).sort((a, b) =>
    a.localeCompare(b, 'ja')
  );
  const records: Array<{
    action: string;
    reservationId: string;
    detailLabel: string;
    changedFields: string[];
    changeSummary: string[];
  }> = [];

  for (const reservationId of reservationIds) {
    const previous = previousMap.get(reservationId);
    const next = nextMap.get(reservationId);

    if (!previous && next) {
      records.push({
        action: '新規作成',
        reservationId,
        detailLabel: describeHistoryRow(next, reservationId),
        changedFields: ['reservationId'],
        changeSummary: [`明細追加: ${describeHistoryRow(next, reservationId)}`]
      });
      continue;
    }

    if (previous && !next) {
      records.push({
        action: '削除',
        reservationId,
        detailLabel: describeHistoryRow(previous, reservationId),
        changedFields: ['reservationId'],
        changeSummary: [`明細削除: ${describeHistoryRow(previous, reservationId)}`]
      });
      continue;
    }

    if (!previous || !next) continue;

    const changedFields = new Set<string>();
    const changeSummary: string[] = [];
    for (const headerKey of headerKeys) {
      if (!headerKey) continue;
      const before = previous[headerKey] || '';
      const after = next[headerKey] || '';
      if (before === after) continue;

      changedFields.add(headerKey);
      if (changeSummary.length < 20) {
        changeSummary.push(
          `${describeHistoryRow(next, reservationId)} / ${formatHistoryFieldLabel(headerKey)}: ${formatHistoryValue(
            headerKey,
            before
          )} -> ${formatHistoryValue(headerKey, after)}`
        );
      }
    }

    if (changedFields.size > 0) {
      records.push({
        action: '更新',
        reservationId,
        detailLabel: describeHistoryRow(next, reservationId),
        changedFields: Array.from(changedFields),
        changeSummary
      });
    }
  }

  return {
    records
  };
}

function buildReservationRowMap(headerKeys: string[], rows: string[][]): Map<string, Record<string, string>> {
  const reservationIdIndex = headerKeys.indexOf('reservationId');
  const map = new Map<string, Record<string, string>>();

  for (const row of rows) {
    const reservationId = String(row[reservationIdIndex] || '').trim();
    if (!reservationId) continue;

    const record: Record<string, string> = {};
    headerKeys.forEach((headerKey, index) => {
      if (!headerKey) return;
      record[headerKey] = String(row[index] || '');
    });
    map.set(reservationId, record);
  }

  return map;
}

function mapHistoryRecordToRow(record: GoogleSheetHistoryRecord): string[] {
  return [
    record.savedAt,
    record.action,
    record.projectId,
    record.customerId,
    record.customerName,
    record.reservationId,
    record.detailLabel,
    record.changedFields,
    record.changeSummary,
    record.rowCount
  ];
}

function toSheetRangePrefix(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function toBase64Url(input: string | Buffer): string {
  const base64 = Buffer.from(input).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function escapeCsvCell(value: string): string {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function truncateForHistory(value: string): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= 40) return text;
  return `${text.slice(0, 37)}...`;
}

function formatHistoryTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

function formatHistoryFieldLabel(headerKey: string): string {
  return HISTORY_FIELD_LABELS[headerKey as keyof typeof HISTORY_FIELD_LABELS] || headerKey;
}

function formatHistoryValue(headerKey: string, value: string): string {
  const text = String(value || '').trim();

  if (headerKey === 'taxIncluded') {
    if (text === 'TRUE') return '内税';
    if (text === 'FALSE') return '外税';
  }

  if (headerKey === 'visible') {
    if (text === 'TRUE') return '表示';
    if (text === 'FALSE') return '非表示';
  }

  if (headerKey === 'isCollected') {
    if (text === 'TRUE') return '回収済';
    if (text === 'FALSE') return '未回収';
  }

  return truncateForHistory(text || '(空)');
}

function describeHistoryRow(row: Record<string, string>, fallbackReservationId: string): string {
  const serviceDate = row.date || '日付未設定';
  const serviceName = row.service || 'サービス名未設定';
  const reservationId = row.reservationId || fallbackReservationId;
  return `${serviceDate} / ${serviceName} / ${reservationId}`;
}
