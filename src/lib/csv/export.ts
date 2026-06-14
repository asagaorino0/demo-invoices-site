import type { InvoiceCsvRow, Project, ServiceLine } from '../../types';
import { escapeCsvCell } from './shared';

export interface InvoiceExportInput {
  projects: Project[];
  serviceLines: ServiceLine[];
}

export function exportInvoiceCsvRows(input: InvoiceExportInput): InvoiceCsvRow[] {
  const projectMap = new Map(input.projects.map((project) => [project.id, project]));

  return [...input.serviceLines]
    .sort(compareServiceLines)
    .map((line) => {
      const project = projectMap.get(line.projectId);
      if (!project) {
        throw new Error(`project not found for service line: ${line.id}`);
      }

      return {
        userId: project.customerId,
        userName: project.customerName,
        invoiceRecipient: project.invoiceRecipient,
        facilityName: project.facilityName,
        companyName: project.companyName,
        reservationId: line.reservationId,
        date: line.serviceDate || '',
        service: line.serviceName,
        staff: line.staffName,
        price: stringifyNumber(line.price),
        baseQuantity: stringifyNumber(line.quantity),
        baseUnit: line.unit,
        taxIncluded: stringifyBoolean(line.taxIncluded),
        extraCharges: JSON.stringify(line.extraCharges || []),
        outsourceUnitPrice: '0',
        outsourceUnitQuantity: '0',
        outsourceUnit: '',
        outsourceUnitExtraCharges: '[]',
        invoiceCode: line.invoiceCode,
        invoiceDate: project.issueDate || '',
        isCollected: stringifyBoolean(line.collectionStatus === 'collected'),
        isCollectedDate: line.collectedAt || '',
        receiptIssueDate: line.receiptIssuedAt || '',
        remarks: line.remarks || project.defaultRemarks || '',
        memo: line.memo,
        visible: stringifyBoolean(line.visible)
      };
    });
}

export function exportInvoiceCsvText(input: InvoiceExportInput): string {
  const rows = exportInvoiceCsvRows(input);
  const headers = [
    'userId',
    'userName',
    'invoiceRecipient',
    'facilityName',
    'companyName',
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
  ] as const;

  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(','))
  ];

  return `${lines.join('\n')}\n`;
}

function stringifyNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(value);
}

function stringifyBoolean(value: boolean): string {
  return value ? 'TRUE' : 'FALSE';
}

function compareServiceLines(a: ServiceLine, b: ServiceLine): number {
  const aSort = a.sortKey || 0;
  const bSort = b.sortKey || 0;
  if (aSort !== bSort) return bSort - aSort;
  return a.reservationId.localeCompare(b.reservationId, 'ja');
}
