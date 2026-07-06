import type { ExtraCharge, InvoiceCsvRow } from '../../types';

const HEADER_ALIASES: Record<string, keyof InvoiceCsvRow> = {
  userid: 'userId',
  username: 'userName',
  subject: 'subject',
  defaultinvoicedatemode: 'defaultInvoiceDateMode',
  invoicerecipient: 'invoiceRecipient',
  facilityname: 'facilityName',
  companyname: 'companyName',
  issuerboxoffsetx: 'issuerBoxOffsetX',
  issuerboxoffsety: 'issuerBoxOffsetY',
  issuerboxwidth: 'issuerBoxWidth',
  stampoffsetx: 'stampOffsetX',
  stampoffsety: 'stampOffsetY',
  notesboxheight: 'notesBoxHeight',
  reservationid: 'reservationId',
  date: 'date',
  service: 'service',
  staff: 'staff',
  price: 'price',
  basequantity: 'baseQuantity',
  baseunit: 'baseUnit',
  taxincluded: 'taxIncluded',
  extracharges: 'extraCharges',
  outsourceunitprice: 'outsourceUnitPrice',
  outsourceunitquantity: 'outsourceUnitQuantity',
  outsourceunit: 'outsourceUnit',
  outsourceunitextracharges: 'outsourceUnitExtraCharges',
  invoicecode: 'invoiceCode',
  invoicedate: 'invoiceDate',
  iscollected: 'isCollected',
  iscollecteddate: 'isCollectedDate',
  receiptissuedate: 'receiptIssueDate',
  remarks: 'remarks',
  memo: 'memo',
  visible: 'visible',
  件名: 'subject',
  請求日タイプ: 'defaultInvoiceDateMode',
  送り主欄x: 'issuerBoxOffsetX',
  送り主欄y: 'issuerBoxOffsetY',
  送り主欄幅: 'issuerBoxWidth',
  角印x: 'stampOffsetX',
  角印y: 'stampOffsetY',
  備考欄高さ: 'notesBoxHeight',
  表示: 'visible'
};

export function normalizeHeader(value: string): string {
  const normalized = String(value || '').trim().toLowerCase();
  return HEADER_ALIASES[normalized] || normalized;
}

export function parseBoolean(value: unknown, fallback = false): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return fallback;
}

export function parseNumber(value: unknown, fallback = 0): number {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    return value as T;
  }

  const text = String(value ?? '').trim();
  if (!text) return fallback;

  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function normalizeExtraCharges(value: unknown): ExtraCharge[] {
  const parsed = parseJsonValue<unknown[]>(value, []);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => {
      const charge = (item ?? {}) as Record<string, unknown>;
      return {
        label: String(charge.label || charge.name || '').trim(),
        amount: parseNumber(charge.amount || charge.price, 0),
        quantity: parseNumber(charge.quantity, 1),
        unit: String(charge.unit || '').trim()
      };
    })
    .filter((item) => item.label || item.amount);
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function getMonthKey(dateText: string | null): string {
  if (!dateText) return '';
  const match = String(dateText).match(/^(\d{4})-(\d{2})/);
  if (!match) return '';
  return `${match[1]}-${match[2]}`;
}

export function slugPart(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function stableId(prefix: string, ...parts: Array<string | null | undefined>): string {
  const normalized = parts
    .map((part) => slugPart(String(part || '')))
    .filter(Boolean);

  if (normalized.length === 0) {
    return prefix;
  }

  return `${prefix}_${normalized.join('_')}`;
}

export function escapeCsvCell(value: unknown): string {
  const text = String(value ?? '');
  if (text.includes('"') || text.includes(',') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
