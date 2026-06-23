import type { InvoiceCsvRow, Project } from '../../types';

export const PROJECT_PLACEHOLDER_MEMO = '__project_placeholder__';

export function buildProjectPlaceholderReservationId(project: Project): string {
  return `__project_placeholder__:${project.customerId || project.id}`;
}

export function buildProjectPlaceholderRow(project: Project): InvoiceCsvRow {
  return {
    userId: project.customerId,
    userName: project.customerName,
    subject: project.subject,
    defaultInvoiceDateMode: project.defaultInvoiceDateMode,
    invoiceRecipient: project.invoiceRecipient,
    facilityName: project.facilityName,
    companyName: project.companyName,
    reservationId: buildProjectPlaceholderReservationId(project),
    date: '',
    service: '案件作成',
    staff: '',
    price: '0',
    baseQuantity: '0',
    baseUnit: '',
    taxIncluded: 'TRUE',
    extraCharges: '[]',
    outsourceUnitPrice: '0',
    outsourceUnitQuantity: '0',
    outsourceUnit: '',
    outsourceUnitExtraCharges: '[]',
    invoiceCode: '',
    invoiceDate: project.issueDate || '',
    isCollected: 'FALSE',
    isCollectedDate: '',
    receiptIssueDate: '',
    remarks: project.defaultRemarks || '',
    memo: PROJECT_PLACEHOLDER_MEMO,
    visible: 'FALSE'
  };
}

export function isProjectPlaceholderRow(
  row: Partial<Record<keyof InvoiceCsvRow, unknown>>
): boolean {
  return String(row.memo || '').trim() === PROJECT_PLACEHOLDER_MEMO;
}
