import type { Project, ServiceLine, SiteConfig } from '../../types';
import {
  buildDocumentRows,
  calcTotals,
  formatDocumentNumberForDisplay,
  formatDate,
  formatPlainCurrency,
  getDocumentNumber,
  getInvoiceIssueDate,
  getReceiptIssueDate
} from '../../lib/invoice/preview';

interface InvoicePreviewProps {
  config: SiteConfig;
  project: Project;
  lines: ServiceLine[];
  kind: 'invoice' | 'receipt';
}

export function InvoicePreview({ config, project, lines, kind }: InvoicePreviewProps) {
  const totals = calcTotals(lines, config);
  const rows = buildDocumentRows(lines);
  const isReceipt = kind === 'receipt';
  const title = isReceipt ? '領収書' : '請求書';
  const topLabel = isReceipt ? '領収書番号' : '請求書番号';
  const topNumber = formatDocumentNumberForDisplay(getDocumentNumber(project, lines, kind));
  const issueDate = isReceipt ? getReceiptIssueDate(project, lines) : getInvoiceIssueDate(project, lines);
  const message = isReceipt ? '下記のとおり領収いたしました。' : '下記のとおりご請求申し上げます。';
  const amountLabel = isReceipt ? '受領金額' : 'ご請求金額';
  const remarksText = [
    project.defaultRemarks,
    ...lines.map((line) => line.remarks)
  ]
    .map((text) => String(text || '').trim())
    .filter(Boolean)
    .filter((text, index, array) => array.indexOf(text) === index)
    .join('\n');

  return (
    <div className="invoice-doc-wrap">
      <article className="invoice-doc">
        <div className="invoice-doc-meta">
          <div>
            <div>発行日：{formatDate(issueDate)}</div>
            <div>
              {topLabel}：{topNumber}
            </div>
          </div>
        </div>

        <div className="invoice-doc-title">{title}</div>

        <div className="invoice-doc-header">
          <div>
            <div className="invoice-doc-recipient">{project.invoiceRecipient}</div>
            <div className="invoice-doc-copy">件名：介護美容施術料</div>
            <div className="invoice-doc-copy">{message}</div>
            <div className="invoice-doc-amount">
              <span>{amountLabel}</span>
              <strong>￥{formatPlainCurrency(totals.total)} -</strong>
            </div>
          </div>

          <div className="invoice-doc-company">
            <h3>{config.issuerName}</h3>
            <p>〒{config.issuerPostalCode || ''}</p>
            <p>{config.issuerAddress || ''}</p>
            <p>TEL：{config.issuerContact || ''}</p>
            <p>{config.issuerEmail || ''}</p>
            <p>登録番号：{config.issuerInvoiceNumber || ''}</p>
          </div>
        </div>

        <div className="invoice-chip-row">
          <span className="invoice-chip">{isReceipt ? '回収済' : '未回収'}</span>
          <span className="invoice-chip">{lines.length} 明細</span>
          <span className="invoice-chip">税率 {Math.round((config.defaultTaxRate || 0.1) * 100)}%</span>
        </div>

        <table className="invoice-table">
          <thead>
            <tr>
              <th style={{ width: '60%' }}>品番・品名</th>
              <th style={{ width: '10%' }}>数量</th>
              <th style={{ width: '15%' }}>単価</th>
              <th style={{ width: '15%' }}>金額</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td>{row.qty}</td>
                <td className="num">{row.unitPrice === '' ? '' : formatPlainCurrency(row.unitPrice)}</td>
                <td className="num">{row.total === '' ? '' : formatPlainCurrency(row.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>小計</td>
              <td className="num">{formatPlainCurrency(totals.subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={3}>消費税(10%)</td>
              <td className="num">{formatPlainCurrency(totals.tax)}</td>
            </tr>
            <tr>
              <td colSpan={3}>
                <strong>合計</strong>
              </td>
              <td className="num">
                <strong>{formatPlainCurrency(totals.total)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>

        {remarksText ? (
          <div className="invoice-notes">
            <div className="invoice-notes-label">備考</div>
            <div className="invoice-notes-box">{remarksText}</div>
          </div>
        ) : null}

        <div className="invoice-footer">
          いつも有難うございます。<br />
          {config.bankNote || ''}
        </div>
      </article>
    </div>
  );
}
