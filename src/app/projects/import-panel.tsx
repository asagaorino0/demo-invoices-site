'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DEFAULT_GOOGLE_SHEET_SETTING_KEY, type GoogleSheetSetting } from '../../types';

type SourceSheetMode = 'existing' | 'create';

interface ImportResult {
  importId: string;
  projectCount: number;
  lineCount: number;
  selectionCount: number;
  warnings: Array<{ code: string; message: string; rowNumber?: number }>;
}

interface ImportErrorResult {
  message?: string;
}

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

export function ImportPanel({
  initialSetting,
  withinDialog = false
}: {
  initialSetting: GoogleSheetSetting | null;
  withinDialog?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sheetPending, startSheetTransition] = useTransition();
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
    sheetName: initialSetting?.sheetName || 'invoices',
    historySheetName: initialSetting?.historySheetName || 'history'
  });
  const [mode, setMode] = useState<SourceSheetMode | null>(withinDialog ? null : 'existing');
  const hasSourceSpreadsheet = Boolean(setting);
  const settingKey = DEFAULT_GOOGLE_SHEET_SETTING_KEY;

  async function importFromGoogleSheet() {
    setMessage('');
    setError('');

    const response = await fetch('/api/imports/sheet', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ settingKey })
    });

    const data = (await response.json()) as ImportResult | ImportErrorResult;

    if (!response.ok) {
      const errorData = data as ImportErrorResult;
      setError(errorData.message || 'Google スプレッドシートの取込に失敗しました。');
      return;
    }

    setMessage('スプレッドシート取込完了！');

    startSheetTransition(() => {
      router.refresh();
    });
  }

  async function saveSetting() {
    setMessage('');
    setError('');
    setSettingMessage('');
    setSettingError('');

    if (!form.spreadsheetUrlOrId.trim()) {
      setSettingError('既存のスプレッドシート URL または ID を入力してください。');
      return;
    }

    if (!form.sheetName.trim()) {
      setSettingError('シート名を入力してください。');
      return;
    }

    const response = await fetch('/api/google-sheet-settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        settingKey,
        spreadsheetTitle: form.spreadsheetTitle,
        spreadsheetUrlOrId: form.spreadsheetUrlOrId,
        sheetName: form.sheetName,
        historySheetName: form.historySheetName
      })
    });

    const data = (await response.json()) as SaveSettingResult;

    if (!response.ok || !data.setting) {
      setSettingError(data.message || `スプレッドシート設定を保存できませんでした。(${response.status})`);
      return;
    }

    setSetting(data.setting);
    setForm((current) => ({
      ...current,
      spreadsheetTitle: '',
      spreadsheetUrlOrId: data.created?.spreadsheetUrl || data.setting?.spreadsheetId || current.spreadsheetUrlOrId
    }));
    setSettingMessage('スプレッドシート設定を保存しました。取り込みを開始します...');
    await importFromGoogleSheet();
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

    const params = new URLSearchParams({
      spreadsheetTitle: form.spreadsheetTitle,
      sheetName: form.sheetName,
      historySheetName: form.historySheetName
    });
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
            <span className="dialog-choice-copy">Google 認証後に Drive 上へ新しいスプレッドシートを作成します。</span>
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
              <input
                placeholder="新規作成するスプレッドシート名"
                value={form.spreadsheetTitle}
                onChange={(e) => setForm((current) => ({ ...current, spreadsheetTitle: e.target.value }))}
                disabled={savePending}
              />
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#666' }}>Google スプレッドシートの URL</label>
                <input
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={form.spreadsheetUrlOrId}
                  onChange={(e) => setForm((current) => ({ ...current, spreadsheetUrlOrId: e.target.value }))}
                  disabled={savePending}
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
            />
            <input
              placeholder="履歴シート名（任意）"
              value={form.historySheetName}
              onChange={(e) => setForm((current) => ({ ...current, historySheetName: e.target.value }))}
              disabled={savePending}
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
                className="button-link secondary"
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

      <div className="source-meta" style={{ marginTop: 12 }}>
        {setting
          ? `現在の保存先: ${setting.sheetName} / ${setting.spreadsheetId}`
          : '取込元の source スプレッドシートは未設定です。今表示中の案件は過去に保存済みのデータです。'}
      </div>
      <div className="source-meta" style={{ marginTop: 8 }}>
        新規作成では Google 認証画面へ移動し、あなたの Drive に作成したあとサービスアカウントへ編集権限を付与します。
      </div>

      {/* <div style={{ display: 'grid', gap: 12, marginTop: 16, marginBottom: 18 }}>
        <button
          className={`button-link ${hasSourceSpreadsheet && !message ? 'primary' : 'secondary'}`}
          type="button"
          onClick={() => void importFromGoogleSheet()}
          disabled={sheetPending || !setting}
          style={{ width: '100%' }}
        >
          {sheetPending ? 'スプレッドシート取込中...' : 'スプレッドシートから取り込む'}
        </button>
      </div> */}

      {message ? <div className="note">{message}</div> : null}
      {error ? (
        <div className="note" style={{ background: '#f7dfd7', color: '#7a2f1b' }}>
          {error}
        </div>
      ) : null}
    </article>
  );
}
