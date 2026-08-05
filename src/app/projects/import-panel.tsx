'use client';

import { CSSProperties, useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DEFAULT_GOOGLE_SHEET_SETTING_KEY, type GoogleSheetSetting } from '../../types';
import type { KonoyubiIssuerSeed } from '../../lib/konoyubi/build-source-sheet-auth-url';

type SourceSheetMode = 'existing' | 'create';
const ENABLE_NEW_FOLDER_NAME_FIELD = false;

interface SaveSettingResult {
  message?: string;
  setting?: GoogleSheetSetting;
  created?: {
    spreadsheetId: string;
    spreadsheetUrl: string;
    sheetName: string;
    historySheetName: string;
  };
}

interface ExistingSettingPayload {
  spreadsheetUrlOrId: string;
  sheetName: string;
  historySheetName: string;
}

export function ImportPanel({
  initialSetting,
  settingKey = DEFAULT_GOOGLE_SHEET_SETTING_KEY,
  initialSpreadsheetTitle,
  withinDialog = false,
  initialMode,
  oauthReturnPath,
  issuerValues,
  requireScopedSetting = false
}: {
  initialSetting: GoogleSheetSetting | null;
  settingKey?: string | null;
  initialSpreadsheetTitle?: string | null;
  withinDialog?: boolean;
  initialMode?: SourceSheetMode | null;
  oauthReturnPath?: string;
  issuerValues?: KonoyubiIssuerSeed | null;
  requireScopedSetting?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [savePending, startSaveTransition] = useTransition();
  const initialGoogleSheetStatus = searchParams.get('googleSheetStatus');
  const initialGoogleSheetMessage = searchParams.get('googleSheetMessage') || '';
  const [message, setMessage] = useState(initialGoogleSheetStatus === 'success' ? initialGoogleSheetMessage : '');
  const [error, setError] = useState(initialGoogleSheetStatus === 'error' ? initialGoogleSheetMessage : '');
  const [settingMessage, setSettingMessage] = useState(
    initialGoogleSheetStatus === 'success' ? initialGoogleSheetMessage : ''
  );
  const [settingError, setSettingError] = useState(
    initialGoogleSheetStatus === 'error' ? initialGoogleSheetMessage : ''
  );
  const [setting, setSetting] = useState<GoogleSheetSetting | null>(initialSetting);
  const [form, setForm] = useState({
    spreadsheetTitle: '',
    spreadsheetUrlOrId: initialSetting?.spreadsheetId || '',
    newFolderName: '',
    sheetName: initialSetting?.sheetName || 'invoices',
    historySheetName: initialSetting?.historySheetName || 'history'
  });
  const [mode, setMode] = useState<SourceSheetMode | null>(
    initialMode === undefined ? (withinDialog ? null : 'existing') : initialMode
  );
  const hasSourceSpreadsheet = Boolean(setting);
  const hasSpreadsheetTitle = form.spreadsheetTitle.trim().length > 0;
  const spreadsheetHref = setting?.spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(setting.spreadsheetId)}/edit`
    : null;
  const shouldShowCurrentSpreadsheet = Boolean(
    setting && spreadsheetHref && initialSpreadsheetTitle && initialSpreadsheetTitle !== '名称未取得'
  );
  const canPersistSetting = Boolean(settingKey);

  useEffect(() => {
    if (pathname !== '/source-sheet') {
      return;
    }

    if (initialGoogleSheetStatus !== 'success' || !setting) {
      return;
    }

    router.replace('/projects');
  }, [initialGoogleSheetStatus, pathname, router, setting]);

  useEffect(() => {
    setSetting(initialSetting);
    setForm((current) => ({
      ...current,
      spreadsheetUrlOrId: initialSetting?.spreadsheetId || '',
      sheetName: initialSetting?.sheetName || 'invoices',
      historySheetName: initialSetting?.historySheetName || 'history'
    }));
  }, [initialSetting]);

  async function saveSetting() {
    setMessage('');
    setError('');
    setSettingMessage('');
    setSettingError('');

    if (!canPersistSetting) {
      setSettingError('shopId が未指定のため保存できません。konoyubi から shopId を付けて開き直してください。');
      return;
    }

    const payload = getExistingSettingPayload();
    if (!payload) {
      return;
    }

    const response = await persistExistingSetting(payload);
    if (!response) {
      return;
    }

    setSettingMessage('スプレッドシート設定を保存しました。表示は source スプレッドシートを直接参照します。');
    startSaveTransition(() => {
      router.refresh();
    });
  }

  function getExistingSettingPayload(override?: Partial<ExistingSettingPayload>): ExistingSettingPayload | null {
    const spreadsheetUrlOrId = String(override?.spreadsheetUrlOrId ?? form.spreadsheetUrlOrId).trim();
    const sheetName = String(override?.sheetName ?? form.sheetName).trim();
    const historySheetName = String(override?.historySheetName ?? form.historySheetName).trim() || 'history';

    if (!spreadsheetUrlOrId) {
      setSettingError('既存のスプレッドシート URL または ID を入力してください。');
      return null;
    }

    if (!sheetName) {
      setSettingError('シート名を入力してください。');
      return null;
    }

    return {
      spreadsheetUrlOrId,
      sheetName,
      historySheetName
    };
  }

  async function persistExistingSetting(payload: ExistingSettingPayload): Promise<GoogleSheetSetting | null> {
    const { spreadsheetUrlOrId, sheetName, historySheetName } = payload;

    const response = await fetch('/api/google-sheet-settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        settingKey,
        spreadsheetTitle: form.spreadsheetTitle,
        spreadsheetUrlOrId,
        sheetName,
        historySheetName
      })
    });

    const data = (await response.json()) as SaveSettingResult;

    if (!response.ok || !data.setting) {
      setSettingError(data.message || `スプレッドシート設定を保存できませんでした。(${response.status})`);
      return null;
    }

    setSetting(data.setting);
    setForm((current) => ({
      ...current,
      spreadsheetTitle: '',
      spreadsheetUrlOrId: data.created?.spreadsheetUrl || data.setting?.spreadsheetId || spreadsheetUrlOrId,
      sheetName,
      historySheetName
    }));
    return data.setting;
  }

  function startGoogleOauthCreate() {
    setSettingMessage('');
    setSettingError('');

    if (!canPersistSetting) {
      setSettingError('shopId が未指定のため新規作成できません。konoyubi から shopId を付けて開き直してください。');
      return;
    }

    if (!form.spreadsheetTitle.trim()) {
      setSettingError('新規作成するスプレッドシート名を入力してください。');
      return;
    }

    if (!form.sheetName.trim()) {
      setSettingError('シート名を入力してください。');
      return;
    }

    const params = new URLSearchParams({
      settingKey: settingKey || DEFAULT_GOOGLE_SHEET_SETTING_KEY,
      spreadsheetTitle: form.spreadsheetTitle,
      // newFolderName: form.newFolderName,
      sheetName: form.sheetName,
      historySheetName: form.historySheetName
    });
    if (ENABLE_NEW_FOLDER_NAME_FIELD && form.newFolderName.trim()) {
      params.set('newFolderName', form.newFolderName);
    }
    appendIssuerValues(params, issuerValues);
    if (oauthReturnPath) {
      params.set('returnPath', oauthReturnPath);
    }
    window.location.href = `/api/google/auth?${params.toString()}`;
  }

  return (
    <article className={withinDialog ? undefined : 'card'}>
      {withinDialog ? null : (
        <>
          <p className="eyebrow" style={{ marginBottom: 10 }}>
            GOOGLE SHEETS
          </p>
          <h2>Source スプレッドシート</h2>
        </>
      )}
      <p>この画面で利用する共通の source スプレッドシートを設定します。</p>

      {requireScopedSetting && !canPersistSetting ? (
        <div className="note" style={{ marginTop: 12, background: '#fff0e4', color: '#8a4216' }}>
          shopId が渡っていないため、この画面では既存設定の読込と保存を停止しています。
        </div>
      ) : null}

      {shouldShowCurrentSpreadsheet && !(withinDialog && mode === 'existing') ? (
        <div className="note" style={{ marginTop: 16, marginBottom: 0 }}>
          現在のスプレッドシート:
          {' '}
          {spreadsheetHref ? (
            <a
              href={spreadsheetHref}
              target="_blank"
              rel="noreferrer"
              style={{
                color: 'var(--accent-strong)',
                fontWeight: 700,
                textDecoration: 'underline',
                textUnderlineOffset: '0.12em'
              }}
            >
              {initialSpreadsheetTitle || '名称未取得'}
            </a>
          ) : (
            <strong style={{ color: 'var(--accent-strong)' }}>{initialSpreadsheetTitle || '名称未取得'}</strong>
          )}
        </div>
      ) : null}

      {setting && !setting.tenantId ? (
        <div className="note" style={{ marginTop: 12, background: '#fff0e4', color: '#8a4216' }}>
          発行者シートの `shopId` が未設定、またはまだ再保存されていません。tenant 分離を有効にするには `発行者` シートの
          1 行目に `shopId` 列、2 行目以降の同じ列に実際の shopId 値を入れてから、もう一度保存してください。
        </div>
      ) : null}

      {withinDialog && !mode ? (
        <div className="dialog-choice-grid">
          <button type="button" className="dialog-choice-button" onClick={() => setMode('existing')}>
            <span className="dialog-choice-title">既存のスプレッドシートを選択</span>
            <span className="dialog-choice-copy">Google スプレッドシートの URL を貼り付けて接続します。</span>
          </button>
          <button type="button" className="dialog-choice-button" onClick={() => setMode('create')}>
            <span className="dialog-choice-title">新規スプレッドシートを作成</span>
            <span className="dialog-choice-copy">
              Google 認証後に Drive 上へ新しいスプレッドシートを作成し、発行者シートも用意します。
            </span>
          </button>
        </div>
      ) : null}

      {mode ? (
        <>
          {/* {withinDialog ? (
            <div className="hero-actions" style={{ marginTop: 16 }}>
              <button className="button-link secondary" type="button" onClick={() => setMode(null)}>
                戻る
              </button>
            </div>
          ) : null} */}

          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            {mode === 'create' ? (
              <>
                <input
                  placeholder="新規作成するスプレッドシート名"
                  value={form.spreadsheetTitle}
                  onChange={(e) => setForm((current) => ({ ...current, spreadsheetTitle: e.target.value }))}
                  disabled={savePending}
                  style={inputStyle}
                />
                {ENABLE_NEW_FOLDER_NAME_FIELD ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#666' }}>保存先の新規フォルダ名</label>
                    <input
                      placeholder="例: 2026年請求書"
                      value={form.newFolderName}
                      onChange={(e) => setForm((current) => ({ ...current, newFolderName: e.target.value }))}
                      disabled={savePending}
                      style={inputStyle}
                    />
                    <p className="source-meta" style={{ margin: 0 }}>
                      いまは非表示にしていますが、必要になればこの入力欄を再度有効にできます。
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#666' }}>Google スプレッドシートの URL</label>
                <input
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={form.spreadsheetUrlOrId}
                  onChange={(e) => setForm((current) => ({ ...current, spreadsheetUrlOrId: e.target.value }))}
                  disabled={savePending}
                  style={inputStyle}
                />
                <p className="source-meta" style={{ margin: 0 }}>
                  通常は URL をそのまま貼り付ければ大丈夫です。必要な場合だけ、URL の `/d/` と `/edit` の間にある文字列も使えます。
                </p>
              </div>
            )}
            {/* <input
              placeholder="シート名"
              value={form.sheetName}
              onChange={(e) => setForm((current) => ({ ...current, sheetName: e.target.value }))}
              disabled={savePending}
              style={inputStyle}
            /> */}
            {/* <input
              placeholder="履歴シート名（任意）"
              value={form.historySheetName}
              onChange={(e) => setForm((current) => ({ ...current, historySheetName: e.target.value }))}
              disabled={savePending}
              style={inputStyle}
            /> */}
          </div>

          <div className="hero-actions" style={{ marginTop: 16 }}>
            {mode === 'existing' ? (
              <button
                className={`button-link ${hasSourceSpreadsheet ? 'secondary' : 'primary'}`}
                type="button"
                onClick={() => void saveSetting()}
                disabled={savePending}
                style={{ width: '100%' }}
              >
                {savePending ? 'スプレッドシートの設定中...' : 'スプレッドシートの設定'}
              </button>
            ) : (
              <button
                className={`button-link ${hasSpreadsheetTitle ? 'primary' : 'secondary'}`}
                type="button"
                onClick={startGoogleOauthCreate}
                disabled={savePending}
                style={{ width: '100%' }}
              >
                Google で認証して新規スプレッドシートを作成
              </button>
            )}
          </div>
        </>
      ) : null}

      {settingMessage ? <div className="note">{settingMessage}</div> : null}
      {settingError ? (
        <div className="note" style={{ background: '#f7dfd7', color: '#7a2f1b' }}>
          {settingError}
        </div>
      ) : null}

      <div className="source-meta" style={{ marginTop: 8 }}>
        新規作成では Google 認証画面へ移動し、あなたの Drive のマイドライブ直下に source / history / 発行者 シートを作成したあとサービスアカウントへ編集権限を付与します。
      </div>
      {!setting ? (
        <div className="source-meta" style={{ marginTop: 12 }}>
          取込元の source スプレッドシートは未設定です。先に連携するスプレッドシートを選んでください。
        </div>
      ) : null}
      {hasIssuerValues(issuerValues) ? (
        <div className="source-meta" style={{ marginTop: 8 }}>
          `konoyubi` から受け取った発行者データは、新規作成を選んだときに発行者シートへ反映されます。
        </div>
      ) : null}

      {message ? <div className="note">{message}</div> : null}
      {error ? (
        <div className="note" style={{ background: '#f7dfd7', color: '#7a2f1b' }}>
          {error}
        </div>
      ) : null}
    </article>
  );
}

function appendIssuerValues(params: URLSearchParams, issuerValues?: KonoyubiIssuerSeed | null) {
  if (!issuerValues) {
    return;
  }

  const entries: Array<[string, string | undefined]> = [
    ['shopId', issuerValues.shopId],
    ['issuerName', issuerValues.issuerName],
    ['issuerPostalCode', issuerValues.issuerPostalCode],
    ['issuerAddress', issuerValues.issuerAddress],
    ['issuerContact', issuerValues.issuerContact],
    ['issuerEmail', issuerValues.issuerEmail],
    ['issuerInvoiceNumber', issuerValues.issuerInvoiceNumber],
    ['issuerRepresentativeName', issuerValues.issuerRepresentativeName],
    ['issuerRepresentativeTitle', issuerValues.issuerRepresentativeTitle],
    ['issuerStampUrl', issuerValues.issuerStampUrl],
    ['bankNote', issuerValues.bankNote],
    ['bankName', issuerValues.bankName],
    ['bankNumber', issuerValues.bankNumber]
  ];

  for (const [key, value] of entries) {
    const normalized = String(value || '').trim();
    if (!normalized) {
      continue;
    }
    params.set(key, normalized);
  }
}

function hasIssuerValues(issuerValues?: KonoyubiIssuerSeed | null): boolean {
  if (!issuerValues) {
    return false;
  }

  return Object.values(issuerValues).some((value) => String(value || '').trim().length > 0);
}
const inputStyle: CSSProperties = {
  width: '100%',
  marginBottom: 6,
  padding: '6px 12px',
  borderRadius: 12,
  border: '1px solid var(--line)',
  background: 'white',
  font: 'inherit'
};
