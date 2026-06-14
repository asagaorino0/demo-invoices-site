'use client';

import type { CSSProperties } from 'react';
import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { InvoiceSelection, Project, ServiceLine } from '../../../types';
import { InvoicePreview } from '../../../components/invoice/invoice-preview';
import type { SiteConfig } from '../../../types';
import { getInvoiceLines, getReceiptLines } from '../../../lib/invoice/preview';
import { getMonthKey } from '../../../lib/csv/shared';

interface ProjectEditorProps {
  config: SiteConfig;
  project: Project;
  serviceLines: ServiceLine[];
  invoiceSelections: InvoiceSelection[];
}

export function ProjectEditor({
  config,
  project,
  serviceLines,
  invoiceSelections
}: ProjectEditorProps) {
  const router = useRouter();
  const invoicePrintRef = useRef<HTMLDivElement | null>(null);
  const receiptPrintRef = useRef<HTMLDivElement | null>(null);
  const [pending, startTransition] = useTransition();
  const [sheetSyncPending, setSheetSyncPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'uncollected' | 'invoice' | 'collected' | 'receipt'>(
    'uncollected'
  );
  const [form, setForm] = useState({
    customerName: project.customerName,
    invoiceRecipient: project.invoiceRecipient,
    facilityName: project.facilityName,
    companyName: project.companyName,
    issueDate: project.issueDate || '',
    defaultRemarks: project.defaultRemarks,
    status: project.status
  });
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>(
    invoiceSelections.filter((item) => item.selectedForInvoice).map((item) => item.lineId)
  );
  const [selectedReceiptLineIds, setSelectedReceiptLineIds] = useState<string[]>(() => {
    const collectedIds = serviceLines
      .filter((line) => line.collectionStatus === 'collected')
      .map((line) => line.id);
    return collectedIds.length === 1 ? collectedIds : [];
  });
  const [editingLineId, setEditingLineId] = useState<string>(serviceLines[0]?.id || '');
  const editingLine = useMemo(
    () => serviceLines.find((line) => line.id === editingLineId) || serviceLines[0] || null,
    [editingLineId, serviceLines]
  );
  const [lineForm, setLineForm] = useState(() =>
    editingLine
      ? {
          serviceDate: editingLine.serviceDate || '',
          serviceName: editingLine.serviceName,
          staffName: editingLine.staffName,
          price: String(editingLine.price),
          quantity: String(editingLine.quantity),
          unit: editingLine.unit,
          taxIncluded: editingLine.taxIncluded,
          remarks: editingLine.remarks,
          memo: editingLine.memo,
          visible: editingLine.visible,
          collectionStatus: editingLine.collectionStatus,
          collectedAt: editingLine.collectedAt || '',
          receiptIssuedAt: editingLine.receiptIssuedAt || ''
        }
      : null
  );

  const uncollectedLines = useMemo(
    () => serviceLines.filter((line) => line.collectionStatus === 'uncollected'),
    [serviceLines]
  );
  const collectedLines = useMemo(
    () => serviceLines.filter((line) => line.collectionStatus === 'collected'),
    [serviceLines]
  );
  const invoiceLines = useMemo(
    () => getInvoiceLines(serviceLines, selectedLineIds),
    [serviceLines, selectedLineIds]
  );
  const receiptLines = useMemo(
    () => getReceiptLines(serviceLines).filter((line) => selectedReceiptLineIds.includes(line.id)),
    [serviceLines, selectedReceiptLineIds]
  );
  const monthGroups = useMemo(() => {
    const map = new Map<string, ServiceLine[]>();
    uncollectedLines.forEach((line) => {
      const key = getMonthKey(line.serviceDate);
      if (!key) return;
      const current = map.get(key) || [];
      current.push(line);
      map.set(key, current);
    });
    return limitMonthGroups(Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0], 'ja')));
  }, [uncollectedLines]);
  const collectedMonthGroups = useMemo(() => {
    const map = new Map<string, ServiceLine[]>();
    collectedLines.forEach((line) => {
      const key = getMonthKey(line.serviceDate);
      if (!key) return;
      const current = map.get(key) || [];
      current.push(line);
      map.set(key, current);
    });
    return limitMonthGroups(Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0], 'ja')));
  }, [collectedLines]);

  function syncLineForm(lineId: string) {
    const line = serviceLines.find((item) => item.id === lineId);
    setEditingLineId(lineId);
    setLineForm(
      line
        ? {
            serviceDate: line.serviceDate || '',
            serviceName: line.serviceName,
            staffName: line.staffName,
            price: String(line.price),
            quantity: String(line.quantity),
            unit: line.unit,
            taxIncluded: line.taxIncluded,
            remarks: line.remarks,
            memo: line.memo,
            visible: line.visible,
            collectionStatus: line.collectionStatus,
            collectedAt: line.collectedAt || '',
            receiptIssuedAt: line.receiptIssuedAt || ''
          }
        : null
    );
  }

  async function saveHeader() {
    setMessage('');
    setError('');

    const response = await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form)
    });

    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(data.message || '案件ヘッダを保存できませんでした。');
      return;
    }

    setMessage('案件ヘッダを保存しました。');
    startTransition(() => router.refresh());
  }

  async function saveSelections() {
    setMessage('');
    setError('');

    const response = await fetch(`/api/projects/${project.id}/selections`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedLineIds })
    });

    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(data.message || '請求対象の保存に失敗しました。');
      return;
    }

    setMessage('請求対象の選択を保存しました。');
    startTransition(() => router.refresh());
  }

  async function saveLine() {
    if (!editingLine || !lineForm) return;
    setMessage('');
    setError('');

    if (!lineForm.serviceName.trim()) {
      setError('サービス名を入力してください。');
      return;
    }
    if (Number(lineForm.price || 0) < 0) {
      setError('単価は 0 以上で入力してください。');
      return;
    }
    if (Number(lineForm.quantity || 0) <= 0) {
      setError('数量は 0 より大きい値を入力してください。');
      return;
    }
    if (!lineForm.unit.trim()) {
      setError('単位を入力してください。');
      return;
    }

    const response = await fetch(`/api/projects/${project.id}/lines/${editingLine.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        serviceDate: lineForm.serviceDate || null,
        serviceName: lineForm.serviceName,
        staffName: lineForm.staffName,
        price: Number(lineForm.price || 0),
        quantity: Number(lineForm.quantity || 1),
        unit: lineForm.unit,
        taxIncluded: lineForm.taxIncluded,
        remarks: lineForm.remarks,
        memo: lineForm.memo,
        visible: lineForm.visible,
        collectionStatus: lineForm.collectionStatus,
        collectedAt: lineForm.collectionStatus === 'collected' ? lineForm.collectedAt || null : null,
        receiptIssuedAt:
          lineForm.collectionStatus === 'collected' ? lineForm.receiptIssuedAt || null : null
      })
    });

    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(data.message || '明細を保存できませんでした。');
      return;
    }

    setMessage('明細を保存しました。');
    startTransition(() => router.refresh());
  }

  async function duplicateCurrentLine() {
    if (!editingLine) return;
    setMessage('');
    setError('');

    const response = await fetch(`/api/projects/${project.id}/lines/${editingLine.id}`, {
      method: 'POST'
    });
    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(data.message || '明細を複製できませんでした。');
      return;
    }
    setMessage('明細を複製しました。');
    startTransition(() => router.refresh());
  }

  async function deleteCurrentLine() {
    if (!editingLine) return;
    setMessage('');
    setError('');

    const ok = window.confirm('この明細を削除しますか？');
    if (!ok) return;

    const response = await fetch(`/api/projects/${project.id}/lines/${editingLine.id}`, {
      method: 'DELETE'
    });
    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(data.message || '明細を削除できませんでした。');
      return;
    }
    setMessage('明細を削除しました。');
    startTransition(() => router.refresh());
  }

  async function toggleCollected(line: ServiceLine) {
    setMessage('');
    setError('');
    const nextStatus = line.collectionStatus === 'collected' ? 'uncollected' : 'collected';

    const response = await fetch(`/api/projects/${project.id}/lines/${line.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        serviceDate: line.serviceDate,
        serviceName: line.serviceName,
        staffName: line.staffName,
        price: line.price,
        quantity: line.quantity,
        unit: line.unit,
        taxIncluded: line.taxIncluded,
        remarks: line.remarks,
        memo: line.memo,
        visible: line.visible,
        collectionStatus: nextStatus,
        collectedAt: nextStatus === 'collected' ? line.collectedAt : null,
        receiptIssuedAt: nextStatus === 'collected' ? line.receiptIssuedAt : null
      })
    });

    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(data.message || '回収状態を更新できませんでした。');
      return;
    }

    setMessage(nextStatus === 'collected' ? '回収済に更新しました。' : '未回収へ戻しました。');
    startTransition(() => router.refresh());
  }

  function downloadProjectCsv() {
    window.location.href = `/api/projects/${project.id}/export`;
    setMessage('CSV 書き出しを開始しました。');
    setError('');
  }

  async function syncProjectToSheet() {
    setMessage('');
    setError('');
    setSheetSyncPending(true);

    try {
      const response = await fetch(`/api/projects/${project.id}/sync-sheet`, {
        method: 'POST'
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(data.message || 'Google Sheets へ保存できませんでした。');
        return;
      }

      setMessage(data.message || 'Google Sheets に保存しました。');
      startTransition(() => router.refresh());
    } finally {
      setSheetSyncPending(false);
    }
  }

  function toggleLine(lineId: string) {
    setSelectedLineIds((current) =>
      current.includes(lineId) ? current.filter((id) => id !== lineId) : [...current, lineId]
    );
  }

  function toggleMonthSelection(monthKey: string) {
    const monthLineIds = uncollectedLines
      .filter((line) => getMonthKey(line.serviceDate) === monthKey)
      .map((line) => line.id);

    setSelectedLineIds((current) => {
      const allSelected = monthLineIds.every((id) => current.includes(id));
      if (allSelected) {
        return current.filter((id) => !monthLineIds.includes(id));
      }
      return [...new Set([...current, ...monthLineIds])];
    });
  }

  function toggleReceiptLine(lineId: string) {
    setSelectedReceiptLineIds((current) =>
      current.includes(lineId) ? current.filter((id) => id !== lineId) : [...current, lineId]
    );
  }

  function toggleCollectedMonthSelection(monthKey: string) {
    const monthLineIds = collectedLines
      .filter((line) => getMonthKey(line.serviceDate) === monthKey)
      .map((line) => line.id);

    setSelectedReceiptLineIds((current) => {
      const allSelected = monthLineIds.every((id) => current.includes(id));
      if (allSelected) {
        return current.filter((id) => !monthLineIds.includes(id));
      }
      return [...new Set([...current, ...monthLineIds])];
    });
  }

  async function createNewLine() {
    setMessage('');
    setError('');
    const today = new Date().toISOString().slice(0, 10);
    const response = await fetch(`/api/projects/${project.id}/lines`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        serviceDate: today,
        serviceName: '新規サービス',
        staffName: '',
        price: 0,
        quantity: 1,
        unit: '回',
        taxIncluded: true,
        remarks: '',
        memo: '',
        visible: true,
        collectionStatus: 'uncollected'
      })
    });
    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(data.message || '明細を追加できませんでした。');
      return;
    }
    setMessage('明細を追加しました。');
    startTransition(() => router.refresh());
  }

  function openPrintWindow(kind: 'invoice' | 'receipt') {
    const target = kind === 'invoice' ? invoicePrintRef.current : receiptPrintRef.current;
    if (!target) {
      setError('印刷対象を表示できませんでした。');
      return;
    }

    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=900');
    if (!printWindow) {
      setError('印刷ウィンドウを開けませんでした。');
      return;
    }

    const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((element) => element.outerHTML)
      .join('\n');
    const title = kind === 'invoice' ? '請求書' : '領収書';

    printWindow.document.open();
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="ja">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${title}</title>
          ${styleTags}
          <style>
            body { margin: 0; padding: 24px; background: #fff; }
            .print-shell { width: fit-content; margin: 0 auto; }
          </style>
        </head>
        <body>
          <div class="print-shell">${target.innerHTML}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      printWindow.print();
    };
  }

  return (
    <>
      <section className="workbench-stage">
        <article className="card workbench-tab-card">
          <div className="workbench-tabbar">
            <button
              className={`workbench-tab${activeTab === 'uncollected' ? ' active' : ''}`}
              type="button"
              onClick={() => setActiveTab('uncollected')}
            >
              未回収
            </button>
            <button
              className={`workbench-tab${activeTab === 'invoice' ? ' active' : ''}`}
              type="button"
              onClick={() => setActiveTab('invoice')}
            >
              請求書
            </button>
            <button
              className={`workbench-tab${activeTab === 'collected' ? ' active' : ''}`}
              type="button"
              onClick={() => setActiveTab('collected')}
            >
              回収済
            </button>
            <button
              className={`workbench-tab${activeTab === 'receipt' ? ' active' : ''}`}
              type="button"
              onClick={() => setActiveTab('receipt')}
            >
              領収書
            </button>
          </div>
        </article>

        <article className="card workbench-list-card">
          {activeTab === 'uncollected' ? (
            <>
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  marginBottom: 18
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 600 }}>選択した項目 {selectedLineIds.length}件</div>
                {monthGroups.map(([monthKey, lines]) => {
                  const allSelected = lines.every((line) => selectedLineIds.includes(line.id));
                  return (
                    <button
                      key={monthKey}
                      className={`month-chip${allSelected ? ' active' : ''}`}
                      type="button"
                      onClick={() => toggleMonthSelection(monthKey)}
                    >
                      {monthKey}
                    </button>
                  );
                })}
                <button className="month-chip action" type="button" onClick={() => setSelectedLineIds(uncollectedLines.map((line) => line.id))}>
                  全て選択
                </button>
                <button className="month-chip action" type="button" onClick={() => setSelectedLineIds([])}>
                  選択解除
                </button>
              </div>

              <div style={{ display: 'grid', gap: 14 }}>
                {uncollectedLines.length === 0 ? (
                  <p>未回収明細はありません。</p>
                ) : (
                  uncollectedLines.map((line) => (
                    <label key={line.id} className="service-line-card">
                      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                        <input
                          type="checkbox"
                          checked={selectedLineIds.includes(line.id)}
                          onChange={() => toggleLine(line.id)}
                          style={{ marginTop: 8 }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-strong)' }}>
                            {line.serviceName}
                          </div>
                          <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 14 }}>
                            {line.serviceDate || '日付未設定'}
                          </div>
                          <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 14 }}>
                            数量: {line.quantity}
                            {line.unit} / {line.taxIncluded ? '内税' : '外税'}
                          </div>
                          <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 14 }}>
                            担当: {line.staffName || '担当未設定'}
                          </div>
                          {line.memo ? (
                            <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 14 }}>
                              メモ: {line.memo}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="service-line-side">
                        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-strong)' }}>
                          ¥{line.price.toLocaleString('ja-JP')}
                        </div>
                        <button
                          className="service-line-action"
                          type="button"
                          onClick={() => void toggleCollected(line)}
                        >
                          回収済にする
                        </button>
                      </div>
                    </label>
                  ))
                )}
              </div>

              <div className="hero-actions" style={{ marginTop: 18 }}>
                <button className="button-link primary" type="button" onClick={() => void saveSelections()} disabled={pending}>
                  選択を保存
                </button>
              </div>
            </>
          ) : null}

          {activeTab === 'invoice' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0 }}>請求書プレビュー</h2>
                <button className="button-link secondary" type="button" onClick={() => openPrintWindow('invoice')}>
                  印刷 / PDF
                </button>
              </div>
              {invoiceLines.length === 0 ? (
                <p>請求対象の未回収明細を選ぶと、ここに請求書が表示されます。</p>
              ) : (
                <div ref={invoicePrintRef}>
                  <InvoicePreview config={config} project={project} lines={invoiceLines} kind="invoice" />
                </div>
              )}
            </>
          ) : null}

          {activeTab === 'collected' ? (
            <>
              <h2>回収済一覧</h2>
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  marginBottom: 18
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 600 }}>選択した項目 {selectedReceiptLineIds.length}件</div>
                {collectedMonthGroups.map(([monthKey, lines]) => {
                  const allSelected = lines.every((line) => selectedReceiptLineIds.includes(line.id));
                  return (
                    <button
                      key={monthKey}
                      className={`month-chip${allSelected ? ' active' : ''}`}
                      type="button"
                      onClick={() => toggleCollectedMonthSelection(monthKey)}
                    >
                      {monthKey}
                    </button>
                  );
                })}
                <button
                  className="month-chip action"
                  type="button"
                  onClick={() => setSelectedReceiptLineIds(collectedLines.map((line) => line.id))}
                >
                  全て選択
                </button>
                <button className="month-chip action" type="button" onClick={() => setSelectedReceiptLineIds([])}>
                  選択解除
                </button>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {collectedLines.map((line) => (
                  <label key={line.id} className="service-line-card">
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      <input
                        type="checkbox"
                        checked={selectedReceiptLineIds.includes(line.id)}
                        onChange={() => toggleReceiptLine(line.id)}
                        style={{ marginTop: 8 }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent-strong)' }}>
                          {line.serviceName}
                        </div>
                        <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 14 }}>
                          {line.serviceDate || '日付未設定'}
                        </div>
                        <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 14 }}>
                          数量: {line.quantity}
                          {line.unit} / {line.taxIncluded ? '内税' : '外税'}
                        </div>
                        <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 14 }}>
                          担当: {line.staffName || '担当未設定'}
                        </div>
                        {line.memo ? (
                          <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 14 }}>
                            メモ: {line.memo}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="service-line-side">
                      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-strong)' }}>
                        ¥{line.price.toLocaleString('ja-JP')}
                      </div>
                      <button
                        className="button-link secondary"
                        type="button"
                        onClick={() => void toggleCollected(line)}
                      >
                        未回収へ戻す
                      </button>
                    </div>
                  </label>
                ))}
                {collectedLines.length === 0 ? (
                  <p style={{ margin: 0 }}>回収済みの明細はまだありません。</p>
                ) : null}
              </div>
            </>
          ) : null}

          {activeTab === 'receipt' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0 }}>領収書プレビュー</h2>
                <button className="button-link secondary" type="button" onClick={() => openPrintWindow('receipt')}>
                  印刷 / PDF
                </button>
              </div>
              {collectedLines.length === 0 ? (
                <p>回収済みの明細がありません。</p>
              ) : receiptLines.length === 0 ? (
                <p>領収書に含める回収済明細を選ぶと、ここに領収書が表示されます。</p>
              ) : (
                <div ref={receiptPrintRef}>
                  <InvoicePreview config={config} project={project} lines={receiptLines} kind="receipt" />
                </div>
              )}
            </>
          ) : null}
        </article>
      </section>

      <section className="workbench-detail-grid">
        <article className="card">
          <h2>案件情報</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            <label>
              <div>利用者名</div>
              <input
                value={form.customerName}
                onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))}
                style={inputStyle}
              />
            </label>
            <label>
              <div>請求先</div>
              <input
                value={form.invoiceRecipient}
                onChange={(event) =>
                  setForm((current) => ({ ...current, invoiceRecipient: event.target.value }))
                }
                style={inputStyle}
              />
            </label>
            <label>
              <div>施設名</div>
              <input
                value={form.facilityName}
                onChange={(event) => setForm((current) => ({ ...current, facilityName: event.target.value }))}
                style={inputStyle}
              />
            </label>
            <label>
              <div>会社名</div>
              <input
                value={form.companyName}
                onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
                style={inputStyle}
              />
            </label>
            <label>
              <div>請求日</div>
              <input
                type="date"
                value={form.issueDate}
                onChange={(event) => setForm((current) => ({ ...current, issueDate: event.target.value }))}
                style={inputStyle}
              />
            </label>
            <label>
              <div>ステータス</div>
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as Project['status']
                  }))
                }
                style={inputStyle}
              >
                <option value="draft">draft</option>
                <option value="ready_for_export">ready_for_export</option>
                <option value="exported">exported</option>
              </select>
            </label>
            <label>
              <div>備考</div>
              <textarea
                value={form.defaultRemarks}
                onChange={(event) =>
                  setForm((current) => ({ ...current, defaultRemarks: event.target.value }))
                }
                style={{ ...inputStyle, minHeight: 96, resize: 'vertical' }}
              />
            </label>
          </div>
          <div className="hero-actions" style={{ marginTop: 18 }}>
            <button className="button-link primary" type="button" onClick={() => void saveHeader()} disabled={pending}>
              ヘッダを保存
            </button>
            <button
              className="button-link primary"
              type="button"
              onClick={() => void syncProjectToSheet()}
              disabled={sheetSyncPending}
            >
              {sheetSyncPending ? 'スプシへ保存中...' : 'スプシへ保存'}
            </button>
            <button className="button-link secondary" type="button" onClick={downloadProjectCsv}>
              CSVを書き出す
            </button>
          </div>
        </article>

        <article className="card">
          <h2>件数</h2>
          <p>総明細数: {serviceLines.length}件</p>
          <p>未回収: {uncollectedLines.length}件</p>
          <p>請求対象選択: {selectedLineIds.length}件</p>
          <p>回収済: {serviceLines.filter((line) => line.collectionStatus === 'collected').length}件</p>
        </article>
      </section>

      <section className="workbench-detail-grid">
        <article className="card">
          <h2>明細編集</h2>
          {serviceLines.length === 0 || !lineForm ? (
            <>
              <p>編集できる明細がありません。</p>
              <div className="hero-actions" style={{ marginTop: 18 }}>
                <button className="button-link primary" type="button" onClick={() => void createNewLine()}>
                  明細を追加
                </button>
              </div>
            </>
          ) : (
            <>
              <label>
                <div>対象明細</div>
                <select
                  value={editingLineId}
                  onChange={(event) => syncLineForm(event.target.value)}
                  style={inputStyle}
                >
                  {serviceLines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.serviceDate || '日付未設定'} / {line.serviceName} / {line.reservationId}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                <label>
                  <div>サービス日</div>
                  <input
                    type="date"
                    value={lineForm.serviceDate}
                    onChange={(event) => setLineForm((current) => current && ({ ...current, serviceDate: event.target.value }))}
                    style={inputStyle}
                  />
                </label>
                <label>
                  <div>サービス名</div>
                  <input
                    value={lineForm.serviceName}
                    onChange={(event) => setLineForm((current) => current && ({ ...current, serviceName: event.target.value }))}
                    style={inputStyle}
                  />
                </label>
                <label>
                  <div>担当</div>
                  <input
                    value={lineForm.staffName}
                    onChange={(event) => setLineForm((current) => current && ({ ...current, staffName: event.target.value }))}
                    style={inputStyle}
                  />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <label>
                    <div>単価</div>
                    <input
                      type="number"
                      value={lineForm.price}
                      onChange={(event) => setLineForm((current) => current && ({ ...current, price: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label>
                    <div>数量</div>
                    <input
                      type="number"
                      step="0.01"
                      value={lineForm.quantity}
                      onChange={(event) => setLineForm((current) => current && ({ ...current, quantity: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label>
                    <div>単位</div>
                    <input
                      value={lineForm.unit}
                      onChange={(event) => setLineForm((current) => current && ({ ...current, unit: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                </div>
                <label>
                  <div>備考</div>
                  <input
                    value={lineForm.remarks}
                    onChange={(event) => setLineForm((current) => current && ({ ...current, remarks: event.target.value }))}
                    style={inputStyle}
                  />
                </label>
                <label>
                  <div>メモ</div>
                  <textarea
                    value={lineForm.memo}
                    onChange={(event) => setLineForm((current) => current && ({ ...current, memo: event.target.value }))}
                    style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                  />
                </label>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={lineForm.taxIncluded}
                    onChange={(event) => setLineForm((current) => current && ({ ...current, taxIncluded: event.target.checked }))}
                  />
                  <span>内税</span>
                </label>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={lineForm.visible}
                    onChange={(event) => setLineForm((current) => current && ({ ...current, visible: event.target.checked }))}
                  />
                  <span>表示する</span>
                </label>
                <label>
                  <div>回収状態</div>
                  <select
                    value={lineForm.collectionStatus}
                    onChange={(event) =>
                      setLineForm(
                        (current) =>
                          current && ({
                            ...current,
                            collectionStatus: event.target.value as ServiceLine['collectionStatus']
                          })
                      )
                    }
                    style={inputStyle}
                  >
                    <option value="uncollected">uncollected</option>
                    <option value="collected">collected</option>
                  </select>
                </label>
              </div>
              <div className="hero-actions" style={{ marginTop: 18 }}>
                <button className="button-link secondary" type="button" onClick={() => void createNewLine()}>
                  明細を追加
                </button>
                <button className="button-link secondary" type="button" onClick={() => void duplicateCurrentLine()}>
                  明細を複製
                </button>
                <button className="button-link secondary" type="button" onClick={() => void deleteCurrentLine()}>
                  明細を削除
                </button>
                <button className="button-link primary" type="button" onClick={() => void saveLine()} disabled={pending}>
                  明細を保存
                </button>
              </div>
            </>
          )}
        </article>
      </section>

      {message ? <div className="note">{message}</div> : null}
      {error ? <div className="note" style={{ background: '#f7dfd7', color: '#7a2f1b' }}>{error}</div> : null}
    </>
  );
}

function limitMonthGroups(groups: Array<[string, ServiceLine[]]>) {
  return groups.slice(0, 2);
}

const inputStyle: CSSProperties = {
  width: '100%',
  marginTop: 6,
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid var(--line)',
  background: 'white',
  font: 'inherit'
};
