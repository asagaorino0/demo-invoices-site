import type { Project, ServiceLine, SiteConfig } from '../../types';

export interface InvoiceTotals {
  subtotal: number;
  tax: number;
  total: number;
}

export interface InvoicePreviewRow {
  key: string;
  label: string;
  qty: string;
  unitPrice: number | '';
  total: number | '';
}

export const DEFAULT_PROJECT_SUBJECT = '介護美容施術料';

export function getProjectSubject(project: Pick<Project, 'subject'>): string {
  return String(project.subject || '').trim() || DEFAULT_PROJECT_SUBJECT;
}

export function calcHistoryAmounts(
  line: ServiceLine,
  config: Pick<SiteConfig, 'defaultTaxRate'>
): InvoiceTotals {
  const extraChargesTotal = (line.extraCharges || []).reduce((sum, charge) => {
    return sum + charge.amount * (charge.quantity || 1);
  }, 0);

  const subtotal = line.price * line.quantity + extraChargesTotal;
  if (line.taxIncluded) {
    const tax = Math.floor(subtotal - subtotal / (1 + Number(config.defaultTaxRate || 0.1)));
    return { subtotal, tax, total: subtotal };
  }

  const tax = Math.floor(subtotal * Number(config.defaultTaxRate || 0.1));
  return { subtotal, tax, total: subtotal + tax };
}

export function calcTotals(
  lines: ServiceLine[],
  config: Pick<SiteConfig, 'defaultTaxRate'>
): InvoiceTotals {
  return lines.reduce(
    (acc, line) => {
      const amounts = calcHistoryAmounts(line, config);
      acc.subtotal += amounts.subtotal;
      acc.tax += amounts.tax;
      acc.total += amounts.total;
      return acc;
    },
    { subtotal: 0, tax: 0, total: 0 }
  );
}

export function buildDocumentRows(lines: ServiceLine[]): InvoicePreviewRow[] {
  const rows = lines.flatMap((line) => {
    const baseRow: InvoicePreviewRow = {
      key: line.reservationId,
      label: `${formatShortDate(line.serviceDate)} ${line.serviceName}`.trim(),
      qty: `${line.quantity}${line.unit || ''}`,
      unitPrice: line.price,
      total: line.price * line.quantity
    };

    const extraRows: InvoicePreviewRow[] = (line.extraCharges || []).map((charge, index) => ({
      key: `${line.reservationId}-extra-${index}`,
      label: ` ${charge.label}`,
      qty: `${charge.quantity || 1}${charge.unit || ''}`,
      unitPrice: charge.amount,
      total: charge.amount * (charge.quantity || 1)
    }));

    return [baseRow, ...extraRows];
  });

  while (rows.length < 9) {
    rows.push({
      key: `blank-${rows.length}`,
      label: '',
      qty: '',
      unitPrice: '',
      total: ''
    });
  }

  return rows;
}

export function getInvoiceLines(lines: ServiceLine[], selectedLineIds: string[]): ServiceLine[] {
  const lineMap = new Map(
    lines
      .filter((line) => line.collectionStatus === 'uncollected' && line.visible)
      .map((line) => [line.id, line])
  );
  return selectedLineIds
    .map((id) => lineMap.get(id))
    .filter((line): line is ServiceLine => Boolean(line));
}

export function getReceiptLines(lines: ServiceLine[]): ServiceLine[] {
  return lines.filter((line) => line.collectionStatus === 'collected');
}

export function getDocumentNumber(
  project: Project,
  lines: ServiceLine[],
  kind: 'invoice' | 'receipt'
): string {
  const sourceReservationId =
    lines.find((line) => String(line.reservationId || '').includes('_user'))?.reservationId ||
    lines[0]?.reservationId ||
    '';
  const matchedUserId = String(sourceReservationId).match(/_user([^_]+)/)?.[1] || '';
  const baseId = matchedUserId || String(project.customerId || '').replace(/^.*?(\d+)$/, '$1') || '001';
  const baseDate =
    kind === 'receipt' ? getReceiptIssueDate(project, lines) || getInvoiceIssueDate(project, lines) : getInvoiceIssueDate(project, lines);
  const month = formatFileDate(baseDate).slice(0, 6) || '202511';

  return `${baseId}_${month}`;
}

export function formatDocumentNumberForDisplay(value: string): string {
  return String(value || '').replace(/^user/i, '');
}

export function getReceiptIssueDate(project: Project, lines: ServiceLine[]): string | null {
  return (
    lines
      .map((line) => line.receiptIssuedAt || line.collectedAt)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || getInvoiceIssueDate(project, lines)
  );
}

export function getInvoiceIssueDate(project: Project, lines: ServiceLine[]): string | null {
  if (project.defaultInvoiceDateMode === 'custom') {
    return project.issueDate;
  }

  const latestServiceDate = lines
    .map((line) => line.serviceDate)
    .filter((date): date is string => Boolean(date))
    .sort()
    .slice(-1)[0];

  if (!latestServiceDate) {
    return project.issueDate;
  }

  if (project.defaultInvoiceDateMode === 'visit') {
    return latestServiceDate;
  }

  return getMonthEnd(latestServiceDate);
}

export function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

export function formatPlainCurrency(value: number): string {
  return new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits: 0
  }).format(value);
}

export function formatDate(dateText: string | null): string {
  if (!dateText) return '-';
  const date = new Date(`${dateText}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return String(dateText);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatShortDate(dateText: string | null): string {
  if (!dateText) return '';
  const date = new Date(`${dateText}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatFileDate(dateText: string | null): string {
  return String(dateText || '').replace(/-/g, '');
}

function getMonthEnd(dateText: string): string {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return dateText;
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const year = monthEnd.getFullYear();
  const month = String(monthEnd.getMonth() + 1).padStart(2, '0');
  const day = String(monthEnd.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
