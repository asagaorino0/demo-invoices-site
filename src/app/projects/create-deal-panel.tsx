'use client';

import { CSSProperties, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Project } from '../../types';

const invoiceDateModeOptions: Array<{
  value: Project['defaultInvoiceDateMode'];
  label: string;
}> = [
    { value: 'visit', label: '訪問日' },
    { value: 'monthEnd', label: '月末' },
    { value: 'custom', label: '日付指定' }
  ];

type InvoiceRecipientMode = 'customer' | 'company' | 'facility' | 'custom';

// export function CreateProjectPanel({
export function CreateDealPanel({
  withinDialog = false,
  onCreated
}: {
  withinDialog?: boolean;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<{
    customerName: string;
    subject: string;
    defaultInvoiceDateMode: Project['defaultInvoiceDateMode'];
    invoiceRecipient: string;
    facilityName: string;
    companyName: string;
    defaultRemarks: string;
  }>({
    customerName: '',
    subject: '',
    defaultInvoiceDateMode: 'monthEnd',
    invoiceRecipient: '',
    facilityName: '',
    companyName: '',
    defaultRemarks: ''
  });
  const [invoiceRecipientMode, setInvoiceRecipientMode] = useState<InvoiceRecipientMode>('customer');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const invoiceRecipientOptions = buildInvoiceRecipientOptions(form);

  useEffect(() => {
    if (invoiceRecipientOptions.some((option) => option.value === invoiceRecipientMode)) {
      return;
    }

    setInvoiceRecipientMode(invoiceRecipientOptions[0]?.value || 'custom');
  }, [invoiceRecipientMode, invoiceRecipientOptions]);

  async function create() {
    setMessage('');
    setError('');

    const resolvedInvoiceRecipient = buildInvoiceRecipient(form, invoiceRecipientMode);

    if (!form.customerName.trim()) {
      setError('利用者名を入力してください。');
      return;
    }
    if (!form.companyName.trim()) {
      setError('会社名を入力してください。');
      return;
    }
    if (!resolvedInvoiceRecipient) {
      setError(getInvoiceRecipientValidationMessage(invoiceRecipientMode));
      return;
    }

    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...form,
        invoiceRecipient: resolvedInvoiceRecipient
      })
    });
    const data = (await response.json()) as { message?: string; project?: { id: string } };
    if (!response.ok || !data.project) {
      setError(data.message || '新規利用者を登録できませんでした。');
      return;
    }

    setMessage(data.message || '新規利用者を登録しました。');
    onCreated?.();
    startTransition(() => {
      router.push(`/projects?projectId=${data.project!.id}`);
      router.refresh();
    });
  }

  return (
    <article className={withinDialog ? undefined : 'card'}>
      {withinDialog ? null : (
        <>
          <p className="eyebrow" style={{ marginBottom: 10 }}>
            NEW USER
          </p>
          <h2>新規利用者追加</h2>
        </>
      )}
      <div style={{ display: 'grid', gap: 12 }}>
        {/* <div className="note" style={{ margin: 0 }}>
          利用者IDは登録時に自動採番されます。形式: 会社2桁 / 施設2桁 / 利用者3桁
        </div> */}
        <input placeholder="利用者名" value={form.customerName} onChange={(e) => setForm((c) => ({ ...c, customerName: e.target.value }))}
          style={inputStyle}
        />
        <label style={{ fontSize: 12, color: '#666' }}>請求日タイプ</label>
        <div className="choice-chip-row" role="group" aria-label="請求日タイプ">
          {invoiceDateModeOptions.map((option) => {
            const active = form.defaultInvoiceDateMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`choice-chip ${active ? 'active' : ''}`}
                aria-pressed={active}
                onClick={() => setForm((current) => ({ ...current, defaultInvoiceDateMode: option.value }))}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <label style={{ fontSize: 12, color: '#666' }}>会社名</label>
        <input placeholder="会社名を入力してください" value={form.companyName} onChange={(e) => setForm((c) => ({ ...c, companyName: e.target.value }))}
          style={inputStyle}
        />
        <label style={{ fontSize: 12, color: '#666' }}>施設名</label>
        <input placeholder="空欄可" value={form.facilityName} onChange={(e) => setForm((c) => ({ ...c, facilityName: e.target.value }))}
          style={inputStyle}
        />
        <label style={{ fontSize: 12, color: '#666' }}>請求先宛先</label>
        <div className="choice-chip-row" role="group" aria-label="請求先宛先">
          {invoiceRecipientOptions.map((option) => {
            const active = invoiceRecipientMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`choice-chip ${active ? 'active' : ''}`}
                aria-pressed={active}
                onClick={() => setInvoiceRecipientMode(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {invoiceRecipientMode === 'custom' ? (
          <input
            placeholder="請求先"
            value={form.invoiceRecipient}
            onChange={(e) => setForm((c) => ({ ...c, invoiceRecipient: e.target.value }))}
            style={inputStyle}
          />
        ) : (
          // <div className="source-meta" style={{ marginTop: -2 }}>
          //   宛先プレビュー: {buildInvoiceRecipient(form, invoiceRecipientMode) || getInvoiceRecipientPlaceholder(invoiceRecipientMode)}
          // </div>
          null
        )}
        <label style={{ fontSize: 12, color: '#666' }}>件名</label>
        <input placeholder="件名" value={form.subject} onChange={(e) => setForm((c) => ({ ...c, subject: e.target.value }))}
          style={inputStyle}
        />
        <label style={{ fontSize: 12, color: '#666' }}>備考</label>
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
function buildInvoiceRecipient(
  form: {
    customerName: string;
    companyName: string;
    facilityName: string;
    invoiceRecipient: string;
  },
  mode: InvoiceRecipientMode
): string {
  if (mode === 'customer') {
    return form.customerName.trim() ? `${form.customerName.trim()} 様` : '';
  }

  if (mode === 'company') {
    return form.companyName.trim() ? `${form.companyName.trim()} 御中` : '';
  }

  if (mode === 'facility') {
    return form.facilityName.trim() ? `${form.facilityName.trim()} 御中` : '';
  }

  return form.invoiceRecipient.trim();
}

function buildInvoiceRecipientOptions(form: {
  customerName: string;
  companyName: string;
  facilityName: string;
}): Array<{
  value: InvoiceRecipientMode;
  label: string;
}> {
  const options: Array<{
    value: InvoiceRecipientMode;
    label: string;
  }> = [];

  if (form.customerName.trim()) {
    options.push({ value: 'customer', label: `${form.customerName.trim()} 様` });
  }

  if (form.companyName.trim()) {
    options.push({ value: 'company', label: `${form.companyName.trim()} 御中` });
  }

  if (form.facilityName.trim()) {
    options.push({ value: 'facility', label: `${form.facilityName.trim()} 御中` });
  }

  options.push({ value: 'custom', label: 'その他' });

  return options;
}

function getInvoiceRecipientValidationMessage(mode: InvoiceRecipientMode): string {
  if (mode === 'customer') {
    return '利用者名を入力してください。';
  }

  if (mode === 'company') {
    return '会社名を入力してください。';
  }

  if (mode === 'facility') {
    return '施設名を入力してください。';
  }

  return '請求先を入力してください。';
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
