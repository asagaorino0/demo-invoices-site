'use client';

import { useEffect, useState, type SVGProps } from 'react';
import type { GoogleSheetSetting } from '../../types';
import { ImportPanel } from './import-panel';

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
  initialSetting
}: {
  initialSetting: GoogleSheetSetting | null;
}) {
  const [open, setOpen] = useState(false);

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
            aria-label="GOOGLE SHEETS"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <div>
                <p className="eyebrow" style={{ marginBottom: 6 }}>
                  GOOGLE SHEETS
                </p>
                <h2 className="dialog-title">Source スプレッドシート</h2>
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

            <ImportPanel initialSetting={initialSetting} withinDialog />
          </div>
        </div>
      ) : null}
    </>
  );
}
