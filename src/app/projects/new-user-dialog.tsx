'use client';

import { useEffect, useState } from 'react';
import { CreateProjectPanel } from './create-project-panel';

export function NewUserDialog() {
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
      <button type="button" className="button-link primary" style={{ width: '100%' }} onClick={() => setOpen(true)}>
        利用者を追加
      </button>

      {open ? (
        <div className="dialog-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="dialog-card"
            role="dialog"
            aria-modal="true"
            aria-label="NEW USER"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <div>
                <p className="eyebrow" style={{ marginBottom: 6 }}>
                  NEW USER
                </p>
                <h2 className="dialog-title">新規利用者追加</h2>
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

            <CreateProjectPanel withinDialog onCreated={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
