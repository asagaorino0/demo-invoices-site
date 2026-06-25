export interface InvoiceCsvRow {
  userId: string;
  userName: string;
  subject: string;
  defaultInvoiceDateMode: string;
  invoiceRecipient: string;
  facilityName: string;
  companyName: string;
  issuerBoxOffsetX: string;
  issuerBoxOffsetY: string;
  reservationId: string;
  date: string;
  service: string;
  staff: string;
  price: string;
  baseQuantity: string;
  baseUnit: string;
  taxIncluded: string;
  extraCharges: string;
  outsourceUnitPrice: string;
  outsourceUnitQuantity: string;
  outsourceUnit: string;
  outsourceUnitExtraCharges: string;
  invoiceCode: string;
  invoiceDate: string;
  isCollected: string;
  isCollectedDate: string;
  receiptIssueDate: string;
  remarks: string;
  memo: string;
  visible: string;
}

export interface InvoiceImportWarning {
  code: string;
  message: string;
  rowNumber?: number;
}

export interface InvoiceImportBundle {
  projects: import('./project').Project[];
  serviceLines: import('./service-line').ServiceLine[];
  invoiceSelections: import('./invoice-selection').InvoiceSelection[];
  warnings: InvoiceImportWarning[];
}

export const INVOICE_CSV_HEADERS: Array<keyof InvoiceCsvRow> = [
  'userId',
  'userName',
  'subject',
  'defaultInvoiceDateMode',
  'invoiceRecipient',
  'facilityName',
  'companyName',
  'issuerBoxOffsetX',
  'issuerBoxOffsetY',
  'reservationId',
  'date',
  'service',
  'staff',
  'price',
  'baseQuantity',
  'baseUnit',
  'taxIncluded',
  'extraCharges',
  'outsourceUnitPrice',
  'outsourceUnitQuantity',
  'outsourceUnit',
  'outsourceUnitExtraCharges',
  'invoiceCode',
  'invoiceDate',
  'isCollected',
  'isCollectedDate',
  'receiptIssueDate',
  'remarks',
  'memo',
  'visible'
];
