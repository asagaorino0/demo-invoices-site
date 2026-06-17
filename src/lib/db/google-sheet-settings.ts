import type { GoogleSheetSetting } from '../../types';
import { readLocalStore, writeLocalStore } from '../local-store';
import { getDb, type DatabaseClient } from './client';

export interface UpsertGoogleSheetSettingInput {
  shopKey: string;
  spreadsheetId: string;
  sheetName: string;
  historySheetName: string | null;
}

let ensureTablePromise: Promise<void> | null = null;

export async function getGoogleSheetSetting(shopKey: string): Promise<GoogleSheetSetting | null> {
  try {
    const db = await getDb();
    await ensureGoogleSheetSettingsTable(db);
    const result = await db.query<GoogleSheetSetting>(
      `
        select
          customer_id as "shopKey",
          spreadsheet_id as "spreadsheetId",
          sheet_name as "sheetName",
          history_sheet_name as "historySheetName",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from google_sheet_settings
        where customer_id = $1
      `,
      [shopKey]
    );
    return result.rows[0] || null;
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    return store.googleSheetSettings.find((item) => item.shopKey === shopKey) || null;
  }
}

export async function listGoogleSheetSettings(): Promise<GoogleSheetSetting[]> {
  try {
    const db = await getDb();
    await ensureGoogleSheetSettingsTable(db);
    const result = await db.query<GoogleSheetSetting>(
      `
        select
          customer_id as "shopKey",
          spreadsheet_id as "spreadsheetId",
          sheet_name as "sheetName",
          history_sheet_name as "historySheetName",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from google_sheet_settings
        order by updated_at desc, customer_id asc
      `
    );
    return result.rows;
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    return [...store.googleSheetSettings].sort(
      (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.shopKey.localeCompare(b.shopKey, 'ja')
    );
  }
}

export async function upsertGoogleSheetSetting(
  input: UpsertGoogleSheetSettingInput
): Promise<GoogleSheetSetting> {
  try {
    const db = await getDb();
    await ensureGoogleSheetSettingsTable(db);
    const result = await db.query<GoogleSheetSetting>(
      `
        insert into google_sheet_settings (
          customer_id,
          spreadsheet_id,
          sheet_name,
          history_sheet_name
        ) values ($1, $2, $3, $4)
        on conflict (customer_id) do update set
          spreadsheet_id = excluded.spreadsheet_id,
          sheet_name = excluded.sheet_name,
          history_sheet_name = excluded.history_sheet_name,
          updated_at = now()
        returning
          customer_id as "shopKey",
          spreadsheet_id as "spreadsheetId",
          sheet_name as "sheetName",
          history_sheet_name as "historySheetName",
          created_at as "createdAt",
          updated_at as "updatedAt"
      `,
      [input.shopKey, input.spreadsheetId, input.sheetName, input.historySheetName]
    );
    return result.rows[0];
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    const now = new Date().toISOString();
    const existing = store.googleSheetSettings.find((item) => item.shopKey === input.shopKey);
    const nextSetting: GoogleSheetSetting = {
      shopKey: input.shopKey,
      spreadsheetId: input.spreadsheetId,
      sheetName: input.sheetName,
      historySheetName: input.historySheetName,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    const nextSettings = store.googleSheetSettings.filter((item) => item.shopKey !== input.shopKey);
    await writeLocalStore({
      ...store,
      googleSheetSettings: [...nextSettings, nextSetting].sort((a, b) => a.shopKey.localeCompare(b.shopKey, 'ja'))
    });
    return nextSetting;
  }
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
    message.includes('PostgreSQL client is not ready') ||
    message.includes('DATABASE_URL is not configured') ||
    message.includes('ENOTFOUND') ||
    message.includes('ECONNREFUSED') ||
    message.includes('getaddrinfo')
  );
}
