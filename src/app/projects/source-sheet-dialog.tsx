'use client';

import { useEffect, useState, useTransition, type SVGProps } from 'react';
import { useRouter } from 'next/navigation';
import type { GoogleSheetSetting, IssuerSetting, SiteConfig } from '../../types';
import { ImportPanel } from './import-panel';
import { IssuerSettingsPanel } from './issuer-settings-panel';

function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
      style={{ height: 36, width: 36, ...props.style }}
    >
      <path d="M7 8.5h10" />
      <path d="M7 12h10" />
      <path d="M7 15.5h10" />
    </svg>
  );
}

export function SourceSheetDialog({
  initialSetting,
  initialSpreadsheetTitle,
  initialIssuerSetting,
  initialIssuerValues,
  shouldOpenIssuerDialog
}: {
  initialSetting: GoogleSheetSetting | null;
  initialSpreadsheetTitle?: string | null;
  initialIssuerSetting: IssuerSetting | null;
  initialIssuerValues: Pick<
    SiteConfig,
    | 'issuerName'
    | 'issuerPostalCode'
    | 'issuerAddress'
    | 'issuerContact'
    | 'issuerEmail'
    | 'issuerInvoiceNumber'
    | 'issuerRepresentativeName'
    | 'issuerRepresentativeTitle'
    | 'issuerStampUrl'
    | 'bankNote'
  > | null;
  shouldOpenIssuerDialog?: boolean;
}) {
  const router = useRouter();
  const [refreshPending, startRefreshTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'source-sheet' | 'issuer'>('menu');
  const [setting, setSetting] = useState<GoogleSheetSetting | null>(initialSetting);
  const [spreadsheetTitle, setSpreadsheetTitle] = useState<string | null>(initialSpreadsheetTitle || null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const spreadsheetHref = setting?.spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(setting.spreadsheetId)}/edit`
    : null;
  const spreadsheetLabel = spreadsheetTitle || '現在のスプレッドシートを開く';
  const shouldShowCurrentSpreadsheet = Boolean(spreadsheetHref && spreadsheetTitle && spreadsheetTitle !== '名称未取得');
  const visibleSpreadsheetHref = shouldShowCurrentSpreadsheet ? spreadsheetHref : null;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setView('menu');
      setMessage('');
      setError('');
    }
  }, [open]);

  useEffect(() => {
    if (!shouldOpenIssuerDialog) {
      return;
    }

    setOpen(true);
    setView('issuer');
  }, [shouldOpenIssuerDialog]);

  useEffect(() => {
    setSetting(initialSetting);
  }, [initialSetting]);

  useEffect(() => {
    setSpreadsheetTitle(initialSpreadsheetTitle || null);
  }, [initialSpreadsheetTitle]);

  async function clearSetting() {
    if (!setting) {
      return;
    }

    const ok = window.confirm('現在のスプレッドシート設定を解除しますか？');
    if (!ok) {
      return;
    }

    setMessage('');
    setError('');

    const response = await fetch('/api/google-sheet-settings', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ settingKey: setting.settingKey })
    });
    const data = (await response.json().catch(() => ({}))) as { message?: string };

    if (!response.ok) {
      setError(data.message || `スプレッドシート設定を解除できませんでした。(${response.status})`);
      return;
    }

    setSetting(null);
    setSpreadsheetTitle(null);
    setMessage(data.message || 'スプレッドシート設定を解除しました。');
    startRefreshTransition(() => {
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="hero-settings-button"
        aria-label="Google Sheets の設定を開く"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MenuIcon className="h-4 w-4" />
      </button>

      {open ? (
        <div className="dialog-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="dialog-card"
            role="dialog"
            aria-modal="true"
            aria-label="設定メニュー"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <div>
                <p className="eyebrow" style={{ marginBottom: 6 }}>
                  SETTINGS
                </p>
                <h2 className="dialog-title">
                  {view === 'menu'
                    ? '設定メニュー'
                    : view === 'source-sheet'
                      ? 'Source スプレッドシート'
                      : '発行人情報'}
                </h2>
              </div>
              <button
                type="button"
                className="dialog-close-button"
                aria-label="ダイアログを閉じる"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>

            {view === 'menu' ? (
              <>
                <div className="dialog-choice-grid">
                  <button type="button" className="dialog-choice-button" onClick={() => setView('source-sheet')}>
                    <span className="dialog-choice-title">Source スプレッドシート</span>
                    <span className="dialog-choice-copy">連携先のスプレッドシートを設定します。</span>
                  </button>
                  <button type="button" className="dialog-choice-button" onClick={() => setView('issuer')}>
                    <span className="dialog-choice-title">発行人情報</span>
                    <span className="dialog-choice-copy">発行者シートがないときの入力値を保存します。</span>
                  </button>
                </div>

                {shouldShowCurrentSpreadsheet ? (
                  <div
                    className="note"
                    style={{
                      marginTop: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      現在のスプレッドシート:
                      {' '}
                      <a
                        href={visibleSpreadsheetHref || undefined}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: 'var(--accent-strong)',
                          fontWeight: 700,
                          textDecoration: 'underline',
                          textUnderlineOffset: '0.12em'
                        }}
                      >
                        {spreadsheetLabel}
                      </a>
                    </div>
                    <button
                      type="button"
                      className="button-link secondary"
                      onClick={() => void clearSetting()}
                      disabled={refreshPending}
                      style={{ flexShrink: 0, padding: '8px 18px', minWidth: 'auto' }}
                    >
                      解除
                    </button>
                  </div>
                ) : null}
                {message ? <div className="note" style={{ marginTop: 12 }}>{message}</div> : null}
                {error ? (
                  <div className="note" style={{ marginTop: 12, background: '#f7dfd7', color: '#7a2f1b' }}>
                    {error}
                  </div>
                ) : null}
              </>
            ) : null}

            {view === 'source-sheet' ? (
              <>
                <div className="hero-actions" style={{ marginTop: 16 }}>
                  <button className="button-link secondary" type="button" onClick={() => setView('menu')}>
                    戻る
                  </button>
                </div>
                <ImportPanel
                  initialSetting={setting}
                  initialSpreadsheetTitle={spreadsheetTitle || undefined}
                  withinDialog
                  initialMode={null}
                />
              </>
            ) : null}

            {view === 'issuer' ? (
              <>
                <div className="hero-actions" style={{ marginTop: 16 }}>
                  {/* <button className="button-link secondary" type="button" onClick={() => setView('menu')}>
                    戻る
                  </button> */}
                </div>
                <IssuerSettingsPanel
                  initialSetting={initialIssuerSetting}
                  initialValues={initialIssuerValues}
                  withinDialog
                  onSaved={() => setOpen(false)}
                />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
