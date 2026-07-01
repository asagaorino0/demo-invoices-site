'use client';

import { useEffect, useState, type SVGProps } from 'react';
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
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'source-sheet' | 'issuer'>('menu');
  const spreadsheetHref = initialSetting?.spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(initialSetting.spreadsheetId)}/edit`
    : null;
  const spreadsheetLabel = initialSpreadsheetTitle || '現在のスプレッドシートを開く';

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
    }
  }, [open]);

  useEffect(() => {
    if (!shouldOpenIssuerDialog) {
      return;
    }

    setOpen(true);
    setView('issuer');
  }, [shouldOpenIssuerDialog]);

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

                {spreadsheetHref ? (
                  <div className="note" style={{ marginTop: 16 }}>
                    現在のスプレッドシート:
                    {' '}
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
                      {spreadsheetLabel}
                    </a>
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
                  initialSetting={initialSetting}
                  initialSpreadsheetTitle={initialSpreadsheetTitle}
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
