'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

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

export function ImportPanel() {
  const fileInputId = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');

  async function handleSubmit(formData: FormData) {
    setMessage('');
    setError('');

    const response = await fetch('/api/imports', {
      method: 'POST',
      body: formData
    });

    const data = (await response.json()) as ImportResult | ImportErrorResult;

    if (!response.ok) {
      const errorData = data as ImportErrorResult;
      setError(errorData.message || 'CSV の取込に失敗しました。');
      return;
    }

    const result = data as ImportResult;
    setMessage(
      `取込完了: 案件 ${result.projectCount} 件 / 明細 ${result.lineCount} 件 / 請求対象 ${result.selectionCount} 件`
    );

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <article className="card">
      <p className="eyebrow" style={{ marginBottom: 10 }}>
        LOCAL FILE
      </p>
      <h2>CSV / Excel ファイル</h2>
      <p>既存テンプレート互換の CSV / Excel を取り込んで、案件一覧に反映します。</p>

      <form
        action={(formData) => {
          void handleSubmit(formData);
        }}
        style={{ display: 'grid', gap: 12, marginTop: 16 }}
      >
        <label className="source-button" htmlFor={fileInputId}>
          CSV / Excel ファイルを選択
        </label>
        <input
          id={fileInputId}
          className="visually-hidden-file-input"
          name="file"
          type="file"
          accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,application/vnd.ms-excel"
          required
          onChange={(event) => {
            const file = event.target.files?.[0];
            setSelectedFileName(file?.name || '');
          }}
        />
        <div className="source-meta">
          {selectedFileName ? `選択中: ${selectedFileName}` : 'ファイル未選択'}
        </div>
        <input name="sourceName" type="text" placeholder="取込名（任意）" />
        <button className="button-link primary" type="submit" disabled={pending}>
          {pending ? '取込中...' : '取り込む'}
        </button>
      </form>

      {message ? <div className="note">{message}</div> : null}
      {error ? (
        <div className="note" style={{ background: '#f7dfd7', color: '#7a2f1b' }}>
          {error}
        </div>
      ) : null}
    </article>
  );
}
