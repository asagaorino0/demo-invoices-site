import type { IssuerSetting } from '../../types';
import { readLocalStore, writeLocalStore } from '../local-store';
import { getDb, type DatabaseClient } from './client';
import { getCurrentWorkspaceKey, scopeSettingKey } from '../workspace';

export interface UpsertIssuerSettingInput {
  settingKey: string;
  issuerName: string;
  issuerPostalCode: string;
  issuerAddress: string;
  issuerContact: string;
  issuerEmail: string;
  issuerInvoiceNumber: string;
  issuerRepresentativeName: string;
  issuerRepresentativeTitle: string;
  issuerStampUrl: string;
  bankNote: string;
}

let ensureTablePromise: Promise<void> | null = null;

export async function getIssuerSetting(settingKey: string): Promise<IssuerSetting | null> {
  const scopedSettingKey = scopeSettingKey(await getCurrentWorkspaceKey(), settingKey);
  try {
    const db = await getDb();
    await ensureIssuerSettingsTable(db);
    const result = await db.query<IssuerSetting>(
      `
        select
          setting_key as "settingKey",
          issuer_name as "issuerName",
          issuer_postal_code as "issuerPostalCode",
          issuer_address as "issuerAddress",
          issuer_contact as "issuerContact",
          issuer_email as "issuerEmail",
          issuer_invoice_number as "issuerInvoiceNumber",
          issuer_representative_name as "issuerRepresentativeName",
          issuer_representative_title as "issuerRepresentativeTitle",
          issuer_stamp_url as "issuerStampUrl",
          bank_note as "bankNote",
          created_at as "createdAt",
          updated_at as "updatedAt"
        from issuer_settings
        where setting_key = $1
      `,
      [scopedSettingKey]
    );
    return result.rows[0] || null;
  } catch (error) {
    if (!shouldUseLocalStore(error)) {
      throw error;
    }

    const store = await readLocalStore();
    return store.issuerSettings.find((item) => item.settingKey === scopedSettingKey) || null;
  }
}

export async function upsertIssuerSetting(input: UpsertIssuerSettingInput): Promise<IssuerSetting> {
  const scopedSettingKey = scopeSettingKey(await getCurrentWorkspaceKey(), input.settingKey);
  try {
    const db = await getDb();
    await ensureIssuerSettingsTable(db);
    const result = await db.query<IssuerSetting>(
      `
        insert into issuer_settings (
          setting_key,
          issuer_name,
          issuer_postal_code,
          issuer_address,
          issuer_contact,
          issuer_email,
          issuer_invoice_number,
          issuer_representative_name,
          issuer_representative_title,
          issuer_stamp_url,
          bank_note
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        on conflict (setting_key) do update set
          issuer_name = excluded.issuer_name,
          issuer_postal_code = excluded.issuer_postal_code,
          issuer_address = excluded.issuer_address,
          issuer_contact = excluded.issuer_contact,
          issuer_email = excluded.issuer_email,
          issuer_invoice_number = excluded.issuer_invoice_number,
          issuer_representative_name = excluded.issuer_representative_name,
          issuer_representative_title = excluded.issuer_representative_title,
          issuer_stamp_url = excluded.issuer_stamp_url,
          bank_note = excluded.bank_note,
          updated_at = now()
        returning
          setting_key as "settingKey",
          issuer_name as "issuerName",
          issuer_postal_code as "issuerPostalCode",
          issuer_address as "issuerAddress",
          issuer_contact as "issuerContact",
          issuer_email as "issuerEmail",
          issuer_invoice_number as "issuerInvoiceNumber",
          issuer_representative_name as "issuerRepresentativeName",
          issuer_representative_title as "issuerRepresentativeTitle",
          issuer_stamp_url as "issuerStampUrl",
          bank_note as "bankNote",
          created_at as "createdAt",
          updated_at as "updatedAt"
      `,
      [
        scopedSettingKey,
        input.issuerName,
        input.issuerPostalCode,
        input.issuerAddress,
        input.issuerContact,
        input.issuerEmail,
        input.issuerInvoiceNumber,
        input.issuerRepresentativeName,
        input.issuerRepresentativeTitle,
        input.issuerStampUrl,
        input.bankNote
      ]
    );
    return result.rows[0];
  } catch (error) {
    if (!shouldUseLocalStore(error)) {
      throw error;
    }

    const store = await readLocalStore();
    const now = new Date().toISOString();
    const existing = store.issuerSettings.find((item) => item.settingKey === scopedSettingKey);
    const nextSetting: IssuerSetting = {
      ...input,
      settingKey: scopedSettingKey,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    const nextSettings = store.issuerSettings.filter((item) => item.settingKey !== scopedSettingKey);
    await writeLocalStore({
      ...store,
      issuerSettings: [...nextSettings, nextSetting].sort((a, b) => a.settingKey.localeCompare(b.settingKey, 'ja'))
    });
    return nextSetting;
  }
}

async function ensureIssuerSettingsTable(db: DatabaseClient): Promise<void> {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      await db.query(`
        create table if not exists issuer_settings (
          setting_key text primary key,
          issuer_name text not null default '',
          issuer_postal_code text not null default '',
          issuer_address text not null default '',
          issuer_contact text not null default '',
          issuer_email text not null default '',
          issuer_invoice_number text not null default '',
          issuer_representative_name text not null default '',
          issuer_representative_title text not null default '',
          issuer_stamp_url text not null default '',
          bank_note text not null default '',
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `);
      await db.query(`
        create index if not exists idx_issuer_settings_updated_at
        on issuer_settings(updated_at desc)
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
    message.includes('read-only file system') ||
    message.includes('EROFS') ||
    message.includes('ENOTFOUND') ||
    message.includes('ECONNREFUSED') ||
    message.includes('getaddrinfo')
  );
}
