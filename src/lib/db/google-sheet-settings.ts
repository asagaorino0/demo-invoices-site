import type { GoogleSheetSetting } from '../../types';
import {
  deleteGoogleSheetSettingFromFirestore,
  getGoogleSheetSettingFromFirestore,
  listGoogleSheetSettingsFromFirestore,
  upsertGoogleSheetSettingToFirestore
} from '../firestore/google-sheet-settings';
import { readLocalStore, writeLocalStore } from '../local-store';
import { getDb, type DatabaseClient } from './client';
import { getCurrentWorkspaceKey, scopeSettingKey, scopeSettingPrefix } from '../workspace';

export interface UpsertGoogleSheetSettingInput {
  settingKey: string;
  spreadsheetId: string;
  sheetName: string;
  historySheetName: string | null;
  tenantId?: string | null;
}

let ensureTablePromise: Promise<void> | null = null;

export async function getGoogleSheetSetting(settingKey: string): Promise<GoogleSheetSetting | null> {
  const scopedSettingKey = await resolveScopedGoogleSheetSettingKey(settingKey);
  try {
    const db = await getDb();
    await ensureGoogleSheetSettingsTable(db);
    const result = await db.query<GoogleSheetSetting>(
      `
        select
          customer_id as "settingKey",
          spreadsheet_id as "spreadsheetId",
          sheet_name as "sheetName",
          history_sheet_name as "historySheetName",
          tenant_id as "tenantId",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from google_sheet_settings
        where customer_id = $1
      `,
      [scopedSettingKey]
    );
    return result.rows[0] || null;
  } catch (error) {
    if (!shouldFallbackToFirestoreOrLocal(error)) throw error;
    try {
      return await getGoogleSheetSettingFromFirestore(scopedSettingKey);
    } catch (firestoreError) {
      if (!shouldUseLocalStore(firestoreError)) throw firestoreError;
    }
    const store = await readLocalStore();
    return store.googleSheetSettings.find((item) => item.settingKey === scopedSettingKey) || null;
  }
}

export async function listGoogleSheetSettings(): Promise<GoogleSheetSetting[]> {
  const workspaceKey = await getCurrentWorkspaceKey();
  try {
    const db = await getDb();
    await ensureGoogleSheetSettingsTable(db);
    const result = await db.query<GoogleSheetSetting>(
      `
        select
          customer_id as "settingKey",
          spreadsheet_id as "spreadsheetId",
          sheet_name as "sheetName",
          history_sheet_name as "historySheetName",
          tenant_id as "tenantId",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from google_sheet_settings
        where customer_id like $1
        order by updated_at desc, customer_id asc
      `,
      [`${scopeSettingPrefix(workspaceKey)}%`]
    );
    return result.rows;
  } catch (error) {
    if (!shouldFallbackToFirestoreOrLocal(error)) throw error;
    try {
      return (await listGoogleSheetSettingsFromFirestore()).filter((item) =>
        item.settingKey.startsWith(scopeSettingPrefix(workspaceKey))
      );
    } catch (firestoreError) {
      if (!shouldUseLocalStore(firestoreError)) throw firestoreError;
    }
    const store = await readLocalStore();
    return [...store.googleSheetSettings].sort(
      (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.settingKey.localeCompare(b.settingKey, 'ja')
    );
  }
}

export async function upsertGoogleSheetSetting(
  input: UpsertGoogleSheetSettingInput
): Promise<GoogleSheetSetting> {
  const scopedSettingKey = await resolveScopedGoogleSheetSettingKey(input.settingKey);
  try {
    const db = await getDb();
    await ensureGoogleSheetSettingsTable(db);
    const result = await db.query<GoogleSheetSetting>(
      `
        insert into google_sheet_settings (
          customer_id,
          spreadsheet_id,
          sheet_name,
          history_sheet_name,
          tenant_id
        ) values ($1, $2, $3, $4, $5)
        on conflict (customer_id) do update set
          spreadsheet_id = excluded.spreadsheet_id,
          sheet_name = excluded.sheet_name,
          history_sheet_name = excluded.history_sheet_name,
          tenant_id = excluded.tenant_id,
          updated_at = now()
        returning
          customer_id as "settingKey",
          spreadsheet_id as "spreadsheetId",
          sheet_name as "sheetName",
          history_sheet_name as "historySheetName",
          tenant_id as "tenantId",
          created_at as "createdAt",
          updated_at as "updatedAt"
      `,
      [scopedSettingKey, input.spreadsheetId, input.sheetName, input.historySheetName, input.tenantId || null]
    );
    return result.rows[0];
  } catch (error) {
    if (!shouldFallbackToFirestoreOrLocal(error)) throw error;
    try {
      return await upsertGoogleSheetSettingToFirestore({
        ...input,
        settingKey: scopedSettingKey
      });
    } catch (firestoreError) {
      if (!shouldUseLocalStore(firestoreError)) throw firestoreError;
    }
    const store = await readLocalStore();
    const now = new Date().toISOString();
    const existing = store.googleSheetSettings.find((item) => item.settingKey === scopedSettingKey);
    const nextSetting: GoogleSheetSetting = {
      settingKey: scopedSettingKey,
      spreadsheetId: input.spreadsheetId,
      sheetName: input.sheetName,
      historySheetName: input.historySheetName,
      tenantId: input.tenantId || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    const nextSettings = store.googleSheetSettings.filter((item) => item.settingKey !== scopedSettingKey);
    await writeLocalStore({
      ...store,
      googleSheetSettings: [...nextSettings, nextSetting].sort((a, b) => a.settingKey.localeCompare(b.settingKey, 'ja'))
    });
    return nextSetting;
  }
}

export async function deleteGoogleSheetSetting(settingKey: string): Promise<void> {
  const scopedSettingKey = await resolveScopedGoogleSheetSettingKey(settingKey);
  try {
    const db = await getDb();
    await ensureGoogleSheetSettingsTable(db);
    await db.query(
      `
        delete from google_sheet_settings
        where customer_id = $1
      `,
      [scopedSettingKey]
    );
    return;
  } catch (error) {
    if (!shouldFallbackToFirestoreOrLocal(error)) throw error;
    try {
      await deleteGoogleSheetSettingFromFirestore(scopedSettingKey);
      return;
    } catch (firestoreError) {
      if (!shouldUseLocalStore(firestoreError)) throw firestoreError;
    }
    const store = await readLocalStore();
    await writeLocalStore({
      ...store,
      googleSheetSettings: store.googleSheetSettings.filter((item) => item.settingKey !== scopedSettingKey)
    });
  }
}

async function resolveScopedGoogleSheetSettingKey(settingKey: string): Promise<string> {
  const workspaceKey = await getCurrentWorkspaceKey();
  const workspacePrefix = scopeSettingPrefix(workspaceKey);
  const normalizedSettingKey = String(settingKey || '').trim();

  if (normalizedSettingKey.startsWith(workspacePrefix)) {
    return normalizedSettingKey;
  }

  return scopeSettingKey(workspaceKey, normalizedSettingKey);
}

async function ensureGoogleSheetSettingsTable(db: DatabaseClient): Promise<void> {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      await db.query(`
        create table if not exists google_sheet_settings (
          customer_id text primary key,
          spreadsheet_id text not null,
          sheet_name text not null,
          history_sheet_name text,
          tenant_id text,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `);
      await db.query(`
        create index if not exists idx_google_sheet_settings_updated_at
        on google_sheet_settings(updated_at desc)
      `);
    })().catch((error) => {
      ensureTablePromise = null;
      throw error;
    });
  }

  await ensureTablePromise;
}

function shouldUseLocalStore(error: unknown): boolean {
  const message = String(error || '');
  return (
    message.includes('Firestore config is not available') ||
    message.includes('PostgreSQL client is not ready') ||
    message.includes('DATABASE_URL is not configured') ||
    message.includes('read-only file system') ||
    message.includes('EROFS') ||
    message.includes('ENOTFOUND') ||
    message.includes('ECONNREFUSED') ||
    message.includes('getaddrinfo')
  );
}

function shouldFallbackToFirestoreOrLocal(error: unknown): boolean {
  return shouldUseLocalStore(error);
}
