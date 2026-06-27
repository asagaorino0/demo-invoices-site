'use client';

import { CSSProperties, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DEFAULT_GOOGLE_SHEET_SETTING_KEY, type GoogleSheetSetting } from '../../types';
import type { KonoyubiIssuerSeed } from '../../lib/konoyubi/build-source-sheet-auth-url';

type SourceSheetMode = 'existing' | 'create';

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
  initialSpreadsheetTitle,
  withinDialog = false,
  initialMode,
  oauthReturnPath,
  issuerValues
}: {
  initialSetting: GoogleSheetSetting | null;
  initialSpreadsheetTitle?: string | null;
  withinDialog?: boolean;
  initialMode?: SourceSheetMode | null;
  oauthReturnPath?: string;
  issuerValues?: KonoyubiIssuerSeed | null;
}) {
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
    destinationFolderUrlOrId: '',
    newFolderName: '',
    sheetName: initialSetting?.sheetName || 'invoices',
    historySheetName: initialSetting?.historySheetName || 'history'
  });
  const [mode, setMode] = useState<SourceSheetMode | null>(
    initialMode === undefined ? (withinDialog ? null : 'existing') : initialMode
  );
  const hasSourceSpreadsheet = Boolean(setting);
  const hasSpreadsheetTitle = form.spreadsheetTitle.trim().length > 0;
  const settingKey = DEFAULT_GOOGLE_SHEET_SETTING_KEY;

  async function saveSetting() {
    setMessage('');
    setError('');
    setSettingMessage('');
    setSettingError('');

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

    if (!form.spreadsheetTitle.trim()) {
      setSettingError('新規作成するスプレッドシート名を入力してください。');
      return;
    }

    if (!form.sheetName.trim()) {
      setSettingError('シート名を入力してください。');
      return;
    }

    if (form.destinationFolderUrlOrId.trim() && form.newFolderName.trim()) {
      setSettingError('保存先フォルダは「既存フォルダ URL」か「新規フォルダ名」のどちらか一方だけ入力してください。');
      return;
    }

    const params = new URLSearchParams({
      spreadsheetTitle: form.spreadsheetTitle,
      destinationFolderUrlOrId: form.destinationFolderUrlOrId,
      newFolderName: form.newFolderName,
      sheetName: form.sheetName,
      historySheetName: form.historySheetName
    });
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
          {withinDialog ? (
            <div className="hero-actions" style={{ marginTop: 16 }}>
              <button className="button-link secondary" type="button" onClick={() => setMode(null)}>
                戻る
              </button>
            </div>
          ) : null}

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
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#666' }}>保存先の既存フォルダ URL</label>
                  <input
                    placeholder="https://drive.google.com/drive/folders/..."
                    value={form.destinationFolderUrlOrId}
                    onChange={(e) => setForm((current) => ({ ...current, destinationFolderUrlOrId: e.target.value }))}
                    disabled={savePending}
                    style={inputStyle}
                  />
                  <p className="source-meta" style={{ margin: 0 }}>
                    既存フォルダに入れたい場合は、そのフォルダの URL を貼り付けてください。
                  </p>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#666' }}>または新規フォルダ名</label>
                  <input
                    placeholder="例: 2026年請求書"
                    value={form.newFolderName}
                    onChange={(e) => setForm((current) => ({ ...current, newFolderName: e.target.value }))}
                    disabled={savePending}
                    style={inputStyle}
                  />
                  <p className="source-meta" style={{ margin: 0 }}>
                    新しいフォルダを作って保存したいときだけ入力してください。両方入力した場合は使えません。
                  </p>
                </div>
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
            <input
              placeholder="シート名"
              value={form.sheetName}
              onChange={(e) => setForm((current) => ({ ...current, sheetName: e.target.value }))}
              disabled={savePending}
              style={inputStyle}
            />
            <input
              placeholder="履歴シート名（任意）"
              value={form.historySheetName}
              onChange={(e) => setForm((current) => ({ ...current, historySheetName: e.target.value }))}
              disabled={savePending}
              style={inputStyle}
            />
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
        新規作成では Google 認証画面へ移動し、あなたの Drive に source / history / 発行者 シートを作成したあとサービスアカウントへ編集権限を付与します。
      </div>
      {setting ? (
        <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
          <div className="source-meta">
            現在のスプレッドシート:
            {' '}
            <strong style={{ color: 'var(--accent-strong)' }}>{initialSpreadsheetTitle || '名称未取得'}</strong>
          </div>
          {/* <div className="source-meta">
            参照しているシート:
            {' '}
            <strong style={{ color: 'var(--accent-strong)' }}>{setting.sheetName}</strong>
          </div> */}
          {/* <div className="source-meta">
            スプレッドシート ID:
            {' '}
            <code>{setting.spreadsheetId}</code>
          </div> */}
        </div>
      ) : (
        <div className="source-meta" style={{ marginTop: 12 }}>
          取込元の source スプレッドシートは未設定です。先に連携するスプレッドシートを選んでください。
        </div>
      )}
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
