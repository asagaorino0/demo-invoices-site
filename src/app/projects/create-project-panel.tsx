'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function CreateProjectPanel() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    customerId: '',
    customerName: '',
    invoiceRecipient: '',
    facilityName: '',
    companyName: '',
    issueDate: '',
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
      setError(data.message || '案件を作成できませんでした。');
      return;
    }

    setMessage('案件を作成しました。');
    startTransition(() => {
      router.push(`/projects?projectId=${data.project!.id}`);
      router.refresh();
    });
  }

  return (
    <article className="card">
      <p className="eyebrow" style={{ marginBottom: 10 }}>
        NEW PROJECT
      </p>
      <h2>新規案件追加</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        <input placeholder="顧客ID" value={form.customerId} onChange={(e) => setForm((c) => ({ ...c, customerId: e.target.value }))} />
        <input placeholder="利用者名" value={form.customerName} onChange={(e) => setForm((c) => ({ ...c, customerName: e.target.value }))} />
        <input placeholder="請求先" value={form.invoiceRecipient} onChange={(e) => setForm((c) => ({ ...c, invoiceRecipient: e.target.value }))} />
        <input placeholder="施設名" value={form.facilityName} onChange={(e) => setForm((c) => ({ ...c, facilityName: e.target.value }))} />
        <input placeholder="会社名" value={form.companyName} onChange={(e) => setForm((c) => ({ ...c, companyName: e.target.value }))} />
        <input type="date" value={form.issueDate} onChange={(e) => setForm((c) => ({ ...c, issueDate: e.target.value }))} />
        <textarea placeholder="備考" value={form.defaultRemarks} onChange={(e) => setForm((c) => ({ ...c, defaultRemarks: e.target.value }))} />
      </div>
      <div className="hero-actions" style={{ marginTop: 16 }}>
        <button className="button-link primary" type="button" onClick={() => void create()} disabled={pending}>
          案件を作成
        </button>
      </div>
      {message ? <div className="note">{message}</div> : null}
      {error ? <div className="note" style={{ background: '#f7dfd7', color: '#7a2f1b' }}>{error}</div> : null}
    </article>
  );
}
