import { createSign } from 'node:crypto';
import type { GoogleSheetSetting } from '../../types';

export interface UpsertGoogleSheetSettingInput {
  settingKey: string;
  spreadsheetId: string;
  sheetName: string;
  historySheetName: string | null;
}

interface FirestoreDocument {
  name?: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

interface FirestoreValue {
  stringValue?: string;
  nullValue?: string;
  timestampValue?: string;
}

const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export async function getGoogleSheetSettingFromFirestore(settingKey: string): Promise<GoogleSheetSetting | null> {
  const config = getFirestoreConfig();
  if (!config) {
    throw new Error('Firestore config is not available.');
  }

  const accessToken = await fetchGoogleAccessToken(config.clientEmail, config.privateKey, FIRESTORE_SCOPE);
  const response = await fetch(buildDocumentUrl(config.projectId, settingKey), {
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore からスプレッドシート設定を取得できませんでした: ${text}`);
  }

  const document = (await response.json()) as FirestoreDocument;
  return parseGoogleSheetSetting(document, settingKey);
}

export async function listGoogleSheetSettingsFromFirestore(): Promise<GoogleSheetSetting[]> {
  const config = getFirestoreConfig();
  if (!config) {
    throw new Error('Firestore config is not available.');
  }

  const accessToken = await fetchGoogleAccessToken(config.clientEmail, config.privateKey, FIRESTORE_SCOPE);
  const response = await fetch(buildCollectionUrl(config.projectId), {
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    cache: 'no-store'
  });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore からスプレッドシート設定一覧を取得できませんでした: ${text}`);
  }

  const payload = (await response.json()) as { documents?: FirestoreDocument[] };
  return (payload.documents || [])
    .map((document) => {
      const settingKey = String(document.name || '').split('/').pop() || '';
      return parseGoogleSheetSetting(document, settingKey);
    })
    .filter((value): value is GoogleSheetSetting => Boolean(value))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.settingKey.localeCompare(b.settingKey, 'ja'));
}

export async function upsertGoogleSheetSettingToFirestore(
  input: UpsertGoogleSheetSettingInput
): Promise<GoogleSheetSetting> {
  const config = getFirestoreConfig();
  if (!config) {
    throw new Error('Firestore config is not available.');
  }

  const current = await getGoogleSheetSettingFromFirestore(input.settingKey).catch(() => null);
  const now = new Date().toISOString();
  const nextSetting: GoogleSheetSetting = {
    settingKey: input.settingKey,
    spreadsheetId: input.spreadsheetId,
    sheetName: input.sheetName,
    historySheetName: input.historySheetName,
    createdAt: current?.createdAt || now,
    updatedAt: now
  };

  const accessToken = await fetchGoogleAccessToken(config.clientEmail, config.privateKey, FIRESTORE_SCOPE);
  const response = await fetch(buildDocumentUrl(config.projectId, input.settingKey), {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      fields: {
        settingKey: { stringValue: nextSetting.settingKey },
        spreadsheetId: { stringValue: nextSetting.spreadsheetId },
        sheetName: { stringValue: nextSetting.sheetName },
        historySheetName: nextSetting.historySheetName
          ? { stringValue: nextSetting.historySheetName }
          : { nullValue: 'NULL_VALUE' },
        createdAt: { stringValue: nextSetting.createdAt },
        updatedAt: { stringValue: nextSetting.updatedAt }
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore にスプレッドシート設定を保存できませんでした: ${text}`);
  }

  return nextSetting;
}

function parseGoogleSheetSetting(document: FirestoreDocument, fallbackSettingKey: string): GoogleSheetSetting | null {
  const fields = document.fields || {};
  const settingKey = readString(fields.settingKey) || fallbackSettingKey;
  const spreadsheetId = readString(fields.spreadsheetId);
  const sheetName = readString(fields.sheetName);

  if (!settingKey || !spreadsheetId || !sheetName) {
    return null;
  }

  return {
    settingKey,
    spreadsheetId,
    sheetName,
    historySheetName: readNullableString(fields.historySheetName),
    createdAt: readString(fields.createdAt) || document.createTime || '',
    updatedAt: readString(fields.updatedAt) || document.updateTime || ''
  };
}

function readString(value: FirestoreValue | undefined): string {
  return String(value?.stringValue || '').trim();
}

function readNullableString(value: FirestoreValue | undefined): string | null {
  if (!value) {
    return null;
  }
  if (value.nullValue) {
    return null;
  }
  const normalized = readString(value);
  return normalized || null;
}

function buildCollectionUrl(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/google_sheet_settings`;
}

function buildDocumentUrl(projectId: string, settingKey: string): string {
  return `${buildCollectionUrl(projectId)}/${encodeURIComponent(settingKey)}`;
}

function getFirestoreConfig():
  | {
      projectId: string;
      clientEmail: string;
      privateKey: string;
    }
  | null {
  const clientEmail = String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  const privateKey = String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').trim().replace(/\\n/g, '\n');
  const projectId =
    String(process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '').trim() ||
    extractProjectIdFromServiceAccountEmail(clientEmail);

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return { projectId, clientEmail, privateKey };
}

function extractProjectIdFromServiceAccountEmail(clientEmail: string): string {
  const matched = clientEmail.match(/@([^.]+)\.iam\.gserviceaccount\.com$/);
  return matched?.[1] || '';
}

async function fetchGoogleAccessToken(clientEmail: string, privateKey: string, scope: string): Promise<string> {
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
        iss: clientEmail,
        scope,
        aud: GOOGLE_OAUTH_TOKEN_URL,
        exp: expiresAt,
        iat: issuedAt
      })
    )
  ].join('.');

  const signer = createSign('RSA-SHA256');
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer.sign(privateKey);
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
    throw new Error(`Firestore 用 Google OAuth トークンの取得に失敗しました: ${text}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error('Firestore 用 Google OAuth トークンの応答に access_token がありませんでした。');
  }

  return data.access_token;
}

function toBase64Url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
