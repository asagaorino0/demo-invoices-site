import Link from 'next/link';
import { ImportPanel } from '../projects/import-panel';
import { getGoogleSheetSetting } from '../../lib/store/google-sheet-settings';
import { DEFAULT_GOOGLE_SHEET_SETTING_KEY } from '../../types';
import type { KonoyubiIssuerSeed } from '../../lib/konoyubi/build-source-sheet-auth-url';
import { getGoogleSpreadsheetTitle } from '../../lib/google-sheets';
import { resolveTenantIdFromGoogleSheetTarget } from '../../lib/tenant';

export const dynamic = 'force-dynamic';

type SourceSheetMode = 'existing' | 'create';
const ISSUER_QUERY_KEYS = [
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
  'bankNote',
  'bankName',
  'bankNumber'
] as const;

function normalizeMode(input: string | undefined): SourceSheetMode | null {
  if (input === 'existing' || input === 'create') {
    return input;
  }
  return null;
}

function normalizeExternalHref(input: string | undefined): string | null {
  const trimmed = String(input || '').trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

export default async function SourceSheetPage({
  searchParams
}: {
  searchParams?: Promise<{
    mode?: string;
    returnTo?: string;
    shopId?: string;
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
    bankName?: string;
    bankNumber?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedShopId = String(resolvedSearchParams?.shopId || '').trim();
  const issuerValues = readIssuerValues(resolvedSearchParams);
  const returnTo = normalizeExternalHref(resolvedSearchParams?.returnTo);
  const isKonoyubiFlow = Boolean(returnTo || issuerValues);
  const hasScopedShopId = Boolean(requestedShopId);
  const settingKey = hasScopedShopId || !isKonoyubiFlow ? DEFAULT_GOOGLE_SHEET_SETTING_KEY : null;
  const initialSetting = settingKey ? await getGoogleSheetSetting(settingKey).catch(() => null) : null;
  const hydratedInitialSetting = initialSetting?.tenantId
    ? initialSetting
    : initialSetting
      ? {
        ...initialSetting,
        tenantId:
          (await resolveTenantIdFromGoogleSheetTarget({
            spreadsheetId: initialSetting.spreadsheetId,
            sheetName: initialSetting.sheetName,
            historySheetName: initialSetting.historySheetName
          }).catch(() => null)) || null
      }
      : null;
  const initialSpreadsheetTitle = hydratedInitialSetting
    ? await getGoogleSpreadsheetTitle({
      spreadsheetId: hydratedInitialSetting.spreadsheetId,
      sheetName: hydratedInitialSetting.sheetName,
      historySheetName: hydratedInitialSetting.historySheetName
    }).catch(() => '')
    : '';
  const initialMode = normalizeMode(resolvedSearchParams?.mode);
  const oauthReturnPath = buildOauthReturnPath({ returnTo, initialMode, issuerValues });

  return (
    <main className="page-shell">
      <section style={{ marginBottom: 18 }}>
        <p className="eyebrow" style={{ marginBottom: 8 }}>
          KONOYUBI CONNECT
        </p>
        <h3 className="page-title-static" style={{ margin: 0, fontSize: 18, lineHeight: 1.4, color: "#5f143b" }}>
          Source スプレッドシート設定

        </h3>
        <p style={{ margin: '12px 0 0' }}>
          `konoyubi` からこのページを開けば、source スプレッドシート新規作成をこのアプリで行えます。
        </p>
        <p style={{ margin: '6px 0 0' }}>
          `konoyubi`のショップ情報も、スプレッドシートの `発行者` シートに作成します。
        </p>
      </section>

      <section className="dialog-card" style={{ margin: '0 auto' }}>
        <div className="dialog-header">
          <div>
            <p className="eyebrow" style={{ marginBottom: 6 }}>
              GOOGLE SHEETS
            </p>
            <h2 className="dialog-title">Source スプレッドシート</h2>
          </div>
        </div>

        <ImportPanel
          initialSetting={hydratedInitialSetting}
          settingKey={settingKey}
          initialSpreadsheetTitle={initialSpreadsheetTitle}
          withinDialog
          initialMode={initialMode}
          oauthReturnPath={oauthReturnPath}
          issuerValues={issuerValues}
          requireScopedSetting={isKonoyubiFlow}
        />

        {isKonoyubiFlow && !requestedShopId ? (
          <div className="note" style={{ marginTop: 16, background: '#fff0e4', color: '#8a4216' }}>
            `konoyubi` から `shopId` が渡されていないため、既存の共有スプレッドシート設定は読み込んでいません。
            他ユーザーの設定へ誤接続しないよう、この状態では保存も無効化しています。
          </div>
        ) : null}
      </section>

      {/* <section style={{ marginTop: 18 }}> */}
      <section className="grid">
        <div className="hero-actions" style={{ marginTop: 0 }}>
          <Link className="button-link primary" href="/projects">
            請求書画面を開く
          </Link>
          {returnTo ? (
            <a className="button-link secondary" href={returnTo}>
              konoyubi に戻る
            </a>
          ) : null}
        </div>
      </section>

      {/* <section className="card" style={{ marginTop: 18 }}>
        <p className="eyebrow" style={{ marginBottom: 8 }}>
          ISSUER SHEET
        </p>
        <h2 style={{ marginTop: 0 }}>konoyubi 側へ渡す発行者シートの列定義</h2>
        <p style={{ marginTop: 0 }}>
          `konoyubi` 側では、`発行者` シートに次のヘッダを持つ 1 行を用意してください。
          これがこのアプリの請求書プレビューに反映されます。
        </p>
        <div className="note" style={{ marginTop: 12 }}>
          <code>
            issuerName, issuerPostalCode, issuerAddress, issuerContact, issuerEmail, issuerInvoiceNumber,
            issuerRepresentativeName, issuerRepresentativeTitle, issuerStampUrl, bankNote
          </code>
        </div>
        <p className="source-meta" style={{ marginTop: 12 }}>
          `bankNote` を直接入れない場合でも、`bankName` と `bankNumber` があれば `振込先：銀行名 口座番号` を自動で組み立てます。
        </p>
        <p className="source-meta" style={{ marginTop: 8 }}>
          詳細仕様は repo 内の `docs/issuer-sheet-spec.md` にまとめています。`konoyubi` 側の実装時はこの列名をそのまま使うのが安全です。
        </p>
      </section> */}
    </main>
  );
}

function readIssuerValues(
  searchParams:
    | {
      [key: string]: string | undefined;
    }
    | undefined
): KonoyubiIssuerSeed | null {
  const issuerValues = ISSUER_QUERY_KEYS.reduce<Record<string, string>>((accumulator, key) => {
    const value = String(searchParams?.[key] || '').trim();
    if (value) {
      accumulator[key] = value;
    }
    return accumulator;
  }, {});

  return Object.keys(issuerValues).length > 0 ? (issuerValues as KonoyubiIssuerSeed) : null;
}

function buildOauthReturnPath(input: {
  returnTo: string | null;
  initialMode: SourceSheetMode | null;
  issuerValues: KonoyubiIssuerSeed | null;
}): string {
  const params = new URLSearchParams();
  if (input.returnTo) {
    params.set('returnTo', input.returnTo);
  }
  if (input.initialMode) {
    params.set('mode', input.initialMode);
  }

  for (const key of ISSUER_QUERY_KEYS) {
    const value = String(input.issuerValues?.[key] || '').trim();
    if (!value) {
      continue;
    }
    params.set(key, value);
  }

  const query = params.toString();
  return query ? `/source-sheet?${query}` : '/source-sheet';
}
