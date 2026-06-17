'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { GoogleSheetSetting } from '../../types';

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

export function ImportPanel({
  companyName,
  initialSetting
}: {
  companyName: string;
  initialSetting: GoogleSheetSetting | null;
}) {
  const router = useRouter();
  const [sheetPending, startSheetTransition] = useTransition();
  const [savePending, startSaveTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [settingMessage, setSettingMessage] = useState('');
  const [settingError, setSettingError] = useState('');
  const [setting, setSetting] = useState<GoogleSheetSetting | null>(initialSetting);
  const [form, setForm] = useState({
    spreadsheetUrlOrId: initialSetting?.spreadsheetId || '',
    sheetName: initialSetting?.sheetName || 'invoices',
    historySheetName: initialSetting?.historySheetName || 'history'
  });
  const hasSourceSpreadsheet = Boolean(setting);
  const shopKey = String(companyName || '').trim();

  async function importFromGoogleSheet() {
    setMessage('');
    setError('');

    if (!shopKey) {
      setError('保存先の対象が特定できません。利用者を選び直してからお試しください。');
      return;
    }

    const response = await fetch('/api/imports/sheet', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shopKey })
    });

    const data = (await response.json()) as ImportResult | ImportErrorResult;

    if (!response.ok) {
      const errorData = data as ImportErrorResult;
      setError(errorData.message || 'Google スプレッドシートの取込に失敗しました。');
      return;
    }

    const result = data as ImportResult;
    setMessage(
      `スプレッドシート取込完了！`
    );

    startSheetTransition(() => {
      router.refresh();
    });
  }

  async function saveSetting() {
    setSettingMessage('');
    setSettingError('');

    if (!shopKey) {
      setSettingError('保存先の対象が特定できません。利用者を選び直してからお試しください。');
      return;
    }

    const response = await fetch('/api/google-sheet-settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        shopKey,
        spreadsheetUrlOrId: form.spreadsheetUrlOrId,
        sheetName: form.sheetName,
        historySheetName: form.historySheetName
      })
    });

    const data = (await response.json()) as {
      message?: string;
      setting?: GoogleSheetSetting;
    };

    if (!response.ok || !data.setting) {
      setSettingError(data.message || 'スプレッドシート設定を保存できませんでした。');
      return;
    }

    setSetting(data.setting);
    setForm((current) => ({
      ...current,
      spreadsheetUrlOrId: data.setting?.spreadsheetId || current.spreadsheetUrlOrId
    }));
    setSettingMessage(data.message || 'スプレッドシート設定を保存しました。');
    startSaveTransition(() => {
      router.refresh();
    });
  }

  return (
    <article className="card">
      <p className="eyebrow" style={{ marginBottom: 10 }}>
        GOOGLE SHEETS
      </p>
      <h2>ショップ別スプレッドシート</h2>
      <p>このショップで共通利用する source スプレッドシートを設定します。</p>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <input
          placeholder="Google スプレッドシート URL"
          value={form.spreadsheetUrlOrId}
          onChange={(e) => setForm((current) => ({ ...current, spreadsheetUrlOrId: e.target.value }))}
          disabled={savePending}
        />
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
        <button
          className={`button-link ${hasSourceSpreadsheet ? 'secondary' : 'primary'}`}
          type="button"
          onClick={() => void saveSetting()}
          disabled={savePending}
          style={{ width: '100%' }}
        >
          {savePending ? 'スプレッドシートの設定中...' : 'スプレッドシートの設定'}
        </button>
      </div>

      <div className="source-meta" style={{ marginTop: 12 }}>
        {setting
          ? `現在の保存先: ${setting.sheetName} / ${setting.spreadsheetId}`
          : '取込元の source スプレッドシートは未設定です。今表示中の案件は過去に保存済みのデータです。'}
      </div>

      <div style={{ display: 'grid', gap: 12, marginTop: 16, marginBottom: 18 }}>
        <button
          className={`button-link ${hasSourceSpreadsheet && !message ? 'primary' : 'secondary'}`}
          type="button"
          onClick={() => void importFromGoogleSheet()}
          disabled={sheetPending || !setting}
          style={{ width: '100%' }}
        >
          {sheetPending ? 'スプレッドシート取込中...' : 'スプレッドシートから取り込む'}
        </button>
      </div>

      {settingMessage ? <div className="note">{settingMessage}</div> : null}
      {settingError ? (
        <div className="note" style={{ background: '#f7dfd7', color: '#7a2f1b' }}>
          {settingError}
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
