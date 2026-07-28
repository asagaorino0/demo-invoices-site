'use client';

import { useEffect, useState, useTransition, type CSSProperties, type FormEvent } from 'react';
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
type InvoiceMethod = 'unset' | 'email' | 'google' | 'line' | 'hand' | 'mail' | 'other';

const invoiceMethodOptions: Array<{
  value: InvoiceMethod;
  label: string;
}> = [
  { value: 'unset', label: '未設定' },
  { value: 'email', label: 'メール' },
  { value: 'google', label: 'Google' },
  { value: 'line', label: 'LINE' },
  { value: 'hand', label: '手渡し' },
  { value: 'mail', label: '郵送' },
  { value: 'other', label: 'その他' }
];

interface CreateProjectForm {
  customerName: string;
  subject: string;
  defaultInvoiceDateMode: Project['defaultInvoiceDateMode'];
  invoiceRecipient: string;
  invoiceMethod: InvoiceMethod;
  invoiceEmail: string;
  facilityName: string;
  companyName: string;
  defaultRemarks: string;
}

function makeEmptyForm(): CreateProjectForm {
  return {
    customerName: '',
    subject: '',
    defaultInvoiceDateMode: 'monthEnd',
    invoiceRecipient: '',
    invoiceMethod: 'unset',
    invoiceEmail: '',
    facilityName: '',
    companyName: '',
    defaultRemarks: ''
  };
}

export function CreateProjectPanel({
  withinDialog = false,
  onCreated,
  onCancel
}: {
  withinDialog?: boolean;
  onCreated?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<CreateProjectForm>(() => makeEmptyForm());
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

  function handleClearAll() {
    setForm(makeEmptyForm());
    setInvoiceRecipientMode('customer');
    setMessage('');
    setError('');
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    if (form.invoiceMethod === 'email' && !form.invoiceEmail.trim()) {
      setError('メールアドレスを入力してください。');
      return;
    }

    setIsSubmitting(true);

    try {
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
      handleClearAll();
      onCreated?.();
      startTransition(() => {
        router.push(`/projects?projectId=${data.project!.id}`);
        router.refresh();
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '新規利用者を登録できませんでした。');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <article className={withinDialog ? undefined : 'card'}>
      {withinDialog ? null : (
        <>
          <p className="eyebrow" style={{ marginBottom: 10 }}>
            NEW USER
          </p>
          <h2>新規利用者登録</h2>
        </>
      )}

      <form onSubmit={create} style={{ display: 'grid', gap: 18 }}>
        <div style={sectionStyle}>
          <div style={sectionHeadingRowStyle}>
            <h3 style={sectionTitleStyle}>基本情報</h3>
          </div>
          <div style={twoColumnGridStyle}>
            <div style={fieldStyle}>
              <label htmlFor="customerName" style={labelStyle}>
                利用者名<span style={requiredStyle}>*</span>
              </label>
              <input
                id="customerName"
                value={form.customerName}
                onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))}
                style={inputStyle}
                required
              />
            </div>
            <div style={fieldStyle}>
              <label htmlFor="subject" style={labelStyle}>件名</label>
              <input
                id="subject"
                placeholder="空欄可（デフォルト: 介護美容施術料）"
                value={form.subject}
                onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>契約先情報</h3>
          <div style={twoColumnGridStyle}>
            <div style={fieldStyle}>
              <label htmlFor="companyName" style={labelStyle}>
                会社名<span style={requiredStyle}>*</span>
              </label>
              <input
                id="companyName"
                value={form.companyName}
                onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
                style={inputStyle}
                required
              />
            </div>
            <div style={fieldStyle}>
              <label htmlFor="facilityName" style={labelStyle}>施設名</label>
              <input
                id="facilityName"
                placeholder="空欄可"
                value={form.facilityName}
                onChange={(event) => setForm((current) => ({ ...current, facilityName: event.target.value }))}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>請求設定</h3>
          <div style={fieldStyle}>
            <label style={labelStyle}>請求日タイプ</label>
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
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>請求先宛先</label>
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
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>請求方法</label>
            <div className="choice-chip-row" role="group" aria-label="請求方法">
              {invoiceMethodOptions.map((option) => {
                const active = form.invoiceMethod === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`choice-chip ${active ? 'active' : ''}`}
                    aria-pressed={active}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        invoiceMethod: option.value,
                        invoiceEmail: option.value === 'email' ? current.invoiceEmail : ''
                      }))
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {invoiceRecipientMode === 'custom' ? (
            <div style={fieldStyle}>
              <label htmlFor="invoiceRecipient" style={labelStyle}>
                請求先<span style={requiredStyle}>*</span>
              </label>
              <input
                id="invoiceRecipient"
                placeholder="例：株式会社○○ 御中"
                value={form.invoiceRecipient}
                onChange={(event) => setForm((current) => ({ ...current, invoiceRecipient: event.target.value }))}
                style={inputStyle}
              />
            </div>
          ) : null}

          {form.invoiceMethod === 'email' ? (
            <div style={fieldStyle}>
              <label htmlFor="invoiceEmail" style={labelStyle}>
                メールアドレス<span style={requiredStyle}>*</span>
              </label>
              <input
                id="invoiceEmail"
                type="email"
                placeholder="example@example.com"
                value={form.invoiceEmail}
                onChange={(event) => setForm((current) => ({ ...current, invoiceEmail: event.target.value }))}
                style={inputStyle}
                required
              />
            </div>
          ) : null}
        </div>

        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>備考</h3>
          <div style={fieldStyle}>
            <label htmlFor="defaultRemarks" style={labelStyle}>送付方法の備考（メモ）</label>
            <textarea
              id="defaultRemarks"
              rows={3}
              placeholder="例：PDFで送付希望 / 宛先は総務部 / 月末締め翌月払い"
              value={form.defaultRemarks}
              onChange={(event) => setForm((current) => ({ ...current, defaultRemarks: event.target.value }))}
              style={textareaStyle}
            />
          </div>
        </div>

        <div style={footerStyle}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="button-link secondary" type="button" onClick={handleClearAll} disabled={isSubmitting || pending}>
              クリア
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {withinDialog && onCancel ? (
              <button className="button-link secondary" type="button" onClick={onCancel} disabled={isSubmitting || pending}>
                キャンセル
              </button>
            ) : null}
            <button className="button-link primary" type="submit" disabled={isSubmitting || pending}>
              {isSubmitting ? '登録中...' : '登録'}
            </button>
          </div>
        </div>
      </form>

      {message ? <div className="note">{message}</div> : null}
      {error ? <div className="note" style={{ background: '#f7dfd7', color: '#7a2f1b' }}>{error}</div> : null}
    </article>
  );
}

function buildInvoiceRecipient(
  form: Pick<CreateProjectForm, 'customerName' | 'companyName' | 'facilityName' | 'invoiceRecipient'>,
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

function buildInvoiceRecipientOptions(
  form: Pick<CreateProjectForm, 'customerName' | 'companyName' | 'facilityName'>
): Array<{
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

const sectionStyle: CSSProperties = {
  display: 'grid',
  gap: 14,
  padding: 16,
  borderRadius: 18,
  background: 'rgba(255,255,255,0.64)',
  border: '1px solid var(--line)'
};

const sectionHeadingRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--ink)'
};

const twoColumnGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 14
};

const fieldStyle: CSSProperties = {
  display: 'grid',
  gap: 8
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  color: '#5d5d66'
};

const requiredStyle: CSSProperties = {
  marginLeft: 4,
  color: '#c84b56'
};

const inputStyle: CSSProperties = {
  width: '100%',
  minWidth: 0,
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid var(--line)',
  background: 'white',
  font: 'inherit'
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: 'vertical'
};

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap'
};
