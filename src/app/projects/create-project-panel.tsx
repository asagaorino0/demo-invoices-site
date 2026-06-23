'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Project } from '../../types';

export function CreateProjectPanel() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<{
    customerId: string;
    customerName: string;
    subject: string;
    defaultInvoiceDateMode: Project['defaultInvoiceDateMode'];
    invoiceRecipient: string;
    facilityName: string;
    companyName: string;
    defaultRemarks: string;
  }>({
    customerId: '',
    customerName: '',
    subject: '',
    defaultInvoiceDateMode: 'monthEnd',
    invoiceRecipient: '',
    facilityName: '',
    companyName: '',
    defaultRemarks: ''
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function create() {
    setMessage('');
    setError('');

    if (!form.customerId.trim()) {
      setError('顧客IDを入力してください。');
      return;
    }
    if (!form.customerName.trim()) {
      setError('利用者名を入力してください。');
      return;
    }
    if (!form.invoiceRecipient.trim()) {
      setError('請求先を入力してください。');
      return;
    }

    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form)
    });
    const data = (await response.json()) as { message?: string; project?: { id: string } };
    if (!response.ok || !data.project) {
      setError(data.message || '新規利用者を登録できませんでした。');
      return;
    }

    setMessage(data.message || '新規利用者を登録しました。');
    startTransition(() => {
      router.push(`/projects?projectId=${data.project!.id}`);
      router.refresh();
    });
  }

  return (
    <article className="card">
      <p className="eyebrow" style={{ marginBottom: 10 }}>
        NEW USER
      </p>
      <h2>新規利用者追加</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        <input placeholder="顧客ID" value={form.customerId} onChange={(e) => setForm((c) => ({ ...c, customerId: e.target.value }))} />
        <input placeholder="利用者名" value={form.customerName} onChange={(e) => setForm((c) => ({ ...c, customerName: e.target.value }))} />
        <input placeholder="件名" value={form.subject} onChange={(e) => setForm((c) => ({ ...c, subject: e.target.value }))} />
        <select
          value={form.defaultInvoiceDateMode}
          onChange={(e) =>
            setForm((c) => ({
              ...c,
              defaultInvoiceDateMode: e.target.value as 'visit' | 'monthEnd' | 'custom'
            }))
          }
        >
          <option value="visit">請求日タイプ: 訪問日</option>
          <option value="monthEnd">請求日タイプ: 月末</option>
          <option value="custom">請求日タイプ: 日付指定</option>
        </select>
        <input placeholder="請求先" value={form.invoiceRecipient} onChange={(e) => setForm((c) => ({ ...c, invoiceRecipient: e.target.value }))} />
        <input placeholder="施設名" value={form.facilityName} onChange={(e) => setForm((c) => ({ ...c, facilityName: e.target.value }))} />
        <input placeholder="会社名" value={form.companyName} onChange={(e) => setForm((c) => ({ ...c, companyName: e.target.value }))} />
        <textarea placeholder="備考" value={form.defaultRemarks} onChange={(e) => setForm((c) => ({ ...c, defaultRemarks: e.target.value }))} />
      </div>
      <div className="hero-actions" style={{ marginTop: 16 }}>
        <button className="button-link primary" type="button" onClick={() => void create()} disabled={pending}>
          新規利用者を登録
        </button>
      </div>
      {message ? <div className="note">{message}</div> : null}
      {error ? <div className="note" style={{ background: '#f7dfd7', color: '#7a2f1b' }}>{error}</div> : null}
    </article>
  );
}
