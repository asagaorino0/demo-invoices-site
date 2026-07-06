import type {
  InvoiceCsvRow,
  InvoiceImportBundle,
  InvoiceImportWarning,
  InvoiceSelection,
  Project,
  ServiceLine
} from '../../types';
import {
  getMonthKey,
  isoNow,
  normalizeExtraCharges,
  normalizeHeader,
  parseBoolean,
  parseNumber,
  stableId
} from './shared';
import { isProjectPlaceholderRow } from './project-placeholder';
import { normalizeCompanyName } from '../project-fields';

type RawRow = Partial<Record<keyof InvoiceCsvRow, unknown>>;

interface NormalizedRow {
  rowNumber: number;
  customerId: string;
  customerName: string;
  subject: string;
  defaultInvoiceDateMode: Project['defaultInvoiceDateMode'];
  invoiceRecipient: string;
  facilityName: string;
  companyName: string;
  issuerBoxOffsetX: number;
  issuerBoxOffsetY: number;
  issuerBoxWidth: number;
  stampOffsetX: number;
  stampOffsetY: number;
  notesBoxHeight: number;
  reservationId: string;
  serviceDate: string | null;
  serviceName: string;
  staffName: string;
  price: number;
  quantity: number;
  unit: string;
  taxIncluded: boolean;
  extraCharges: ServiceLine['extraCharges'];
  invoiceCode: string;
  issueDate: string | null;
  isCollected: boolean;
  isCollectedDate: string | null;
  receiptIssueDate: string | null;
  remarks: string;
  memo: string;
  visible: boolean;
}

export function parseInvoiceCsvText(text: string): InvoiceCsvRow[] {
  const rows = parseCsv(text).filter((row) => row.some((cell) => String(cell || '').trim() !== ''));
  if (rows.length === 0) return [];

  const headers = rows[0].map((value) => normalizeHeader(String(value || '')));

  return rows.slice(1).map((row) => {
    const record: Partial<InvoiceCsvRow> = {};
    headers.forEach((header, index) => {
      record[header as keyof InvoiceCsvRow] = String(row[index] ?? '').trim();
    });
    return record as InvoiceCsvRow;
  });
}

export function importInvoiceCsvRows(rows: RawRow[]): InvoiceImportBundle {
  const warnings: InvoiceImportWarning[] = [];
  const normalizedRows: NormalizedRow[] = [];
  const now = isoNow();
  const projectMap = new Map<string, Project>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (isProjectPlaceholderRow(row)) {
      const customerId = readString(row.userId);
      if (!customerId) {
        warnings.push({
          code: 'row_skipped_missing_key',
          message: 'userId が空のため案件プレースホルダー行をスキップしました。',
          rowNumber
        });
        return;
      }

      const placeholderRow = {
        customerId,
        customerName: readString(row.userName),
        subject: readString(row.subject),
        defaultInvoiceDateMode: readInvoiceDateMode(row.defaultInvoiceDateMode),
        invoiceRecipient: readString(row.invoiceRecipient),
        facilityName: readString(row.facilityName),
        companyName: normalizeCompanyName({
          companyName: readString(row.companyName),
          invoiceRecipient: readString(row.invoiceRecipient)
        }),
        issueDate: readDate(row.invoiceDate),
        remarks: readString(row.remarks),
        issuerBoxOffsetX: parseNumber(row.issuerBoxOffsetX, 0),
        issuerBoxOffsetY: parseNumber(row.issuerBoxOffsetY, 0),
        issuerBoxWidth: parseNumber(row.issuerBoxWidth, 0),
        stampOffsetX: parseNumber(row.stampOffsetX, 0),
        stampOffsetY: parseNumber(row.stampOffsetY, 0),
        notesBoxHeight: parseNumber(row.notesBoxHeight, 0)
      };
      const projectId = stableId('project', placeholderRow.customerId);
      const existing = projectMap.get(projectId);

      if (!existing) {
        projectMap.set(projectId, {
          id: projectId,
          importId: null,
          customerId: placeholderRow.customerId,
          customerName:
            placeholderRow.customerName || placeholderRow.invoiceRecipient || placeholderRow.customerId,
          subject: placeholderRow.subject,
          defaultInvoiceDateMode: placeholderRow.defaultInvoiceDateMode,
          invoiceRecipient:
            placeholderRow.invoiceRecipient || placeholderRow.customerName || placeholderRow.customerId,
          facilityName: placeholderRow.facilityName,
          companyName: placeholderRow.companyName,
          issueDate: placeholderRow.issueDate,
          defaultRemarks: placeholderRow.remarks,
          issuerBoxOffsetX: placeholderRow.issuerBoxOffsetX,
          issuerBoxOffsetY: placeholderRow.issuerBoxOffsetY,
          issuerBoxWidth: placeholderRow.issuerBoxWidth,
          stampOffsetX: placeholderRow.stampOffsetX,
          stampOffsetY: placeholderRow.stampOffsetY,
          notesBoxHeight: placeholderRow.notesBoxHeight,
          status: 'draft',
          createdAt: now,
          updatedAt: now
        });
      } else {
        if (!existing.customerName && placeholderRow.customerName) {
          existing.customerName = placeholderRow.customerName;
        }
        if (!existing.invoiceRecipient && placeholderRow.invoiceRecipient) {
          existing.invoiceRecipient = placeholderRow.invoiceRecipient;
        }
        if (!existing.facilityName && placeholderRow.facilityName) {
          existing.facilityName = placeholderRow.facilityName;
        }
        if (!existing.companyName && placeholderRow.companyName) {
          existing.companyName = placeholderRow.companyName;
        }
        if (!existing.subject && placeholderRow.subject) {
          existing.subject = placeholderRow.subject;
        }
        if (!existing.defaultRemarks && placeholderRow.remarks) {
          existing.defaultRemarks = placeholderRow.remarks;
        }
        if (!existing.issueDate && placeholderRow.issueDate) {
          existing.issueDate = placeholderRow.issueDate;
        }
        existing.updatedAt = now;
      }
      return;
    }
    const customerId = readString(row.userId);
    const reservationId = readString(row.reservationId);
    const visible = parseBoolean(row.visible, true);

    if (!customerId || !reservationId) {
      warnings.push({
        code: 'row_skipped_missing_key',
        message: 'userId または reservationId が空のため行をスキップしました。',
        rowNumber
      });
      return;
    }

    if (!visible) {
      warnings.push({
        code: 'row_imported_hidden',
        message: 'visible=FALSE の行を非表示明細として取り込みました。',
        rowNumber
      });
    }

    normalizedRows.push({
      rowNumber,
      customerId,
      customerName: readString(row.userName),
      subject: readString(row.subject),
      defaultInvoiceDateMode: readInvoiceDateMode(row.defaultInvoiceDateMode),
      invoiceRecipient: readString(row.invoiceRecipient),
      facilityName: readString(row.facilityName),
      companyName: normalizeCompanyName({
        companyName: readString(row.companyName),
        invoiceRecipient: readString(row.invoiceRecipient)
      }),
      issuerBoxOffsetX: parseNumber(row.issuerBoxOffsetX, 0),
      issuerBoxOffsetY: parseNumber(row.issuerBoxOffsetY, 0),
      issuerBoxWidth: parseNumber(row.issuerBoxWidth, 0),
      stampOffsetX: parseNumber(row.stampOffsetX, 0),
      stampOffsetY: parseNumber(row.stampOffsetY, 0),
      notesBoxHeight: parseNumber(row.notesBoxHeight, 0),
      reservationId,
      serviceDate: readDate(row.date),
      serviceName: readString(row.service),
      staffName: readString(row.staff),
      price: parseNumber(row.price, 0),
      quantity: parseNumber(row.baseQuantity, 1),
      unit: readString(row.baseUnit) || '回',
      taxIncluded: parseBoolean(row.taxIncluded, true),
      extraCharges: normalizeExtraCharges(row.extraCharges),
      invoiceCode: readString(row.invoiceCode),
      issueDate: readDate(row.invoiceDate),
      isCollected: parseBoolean(row.isCollected, false),
      isCollectedDate: readDate(row.isCollectedDate),
      receiptIssueDate: readDate(row.receiptIssueDate),
      remarks: readString(row.remarks),
      memo: readString(row.memo),
      visible
    });
  });

  const serviceLines: ServiceLine[] = [];

  normalizedRows.forEach((row) => {
    const projectId = buildProjectId(row);
    const lineId = stableId('line', row.customerId, row.reservationId);

    if (!projectMap.has(projectId)) {
      projectMap.set(projectId, {
        id: projectId,
        importId: null,
        customerId: row.customerId,
        customerName: row.customerName || row.invoiceRecipient || row.customerId,
        subject: row.subject,
        defaultInvoiceDateMode: row.defaultInvoiceDateMode,
        invoiceRecipient: row.invoiceRecipient || row.customerName || row.customerId,
        facilityName: row.facilityName,
        companyName: row.companyName,
        issueDate: row.issueDate,
        defaultRemarks: row.remarks,
        issuerBoxOffsetX: row.issuerBoxOffsetX,
        issuerBoxOffsetY: row.issuerBoxOffsetY,
        issuerBoxWidth: row.issuerBoxWidth,
        stampOffsetX: row.stampOffsetX,
        stampOffsetY: row.stampOffsetY,
        notesBoxHeight: row.notesBoxHeight,
        status: 'draft',
        createdAt: now,
        updatedAt: now
      });
    } else {
      const project = projectMap.get(projectId)!;
      if (!project.defaultRemarks && row.remarks) {
        project.defaultRemarks = row.remarks;
      }
      if (!project.subject && row.subject) {
        project.subject = row.subject;
      }
      if (!project.defaultInvoiceDateMode && row.defaultInvoiceDateMode) {
        project.defaultInvoiceDateMode = row.defaultInvoiceDateMode;
      }
      if (!project.issueDate && row.issueDate) {
        project.issueDate = row.issueDate;
      }
      if (project.issuerBoxOffsetX === 0 && row.issuerBoxOffsetX !== 0) {
        project.issuerBoxOffsetX = row.issuerBoxOffsetX;
      }
      if (project.issuerBoxOffsetY === 0 && row.issuerBoxOffsetY !== 0) {
        project.issuerBoxOffsetY = row.issuerBoxOffsetY;
      }
      if (project.issuerBoxWidth === 0 && row.issuerBoxWidth !== 0) {
        project.issuerBoxWidth = row.issuerBoxWidth;
      }
      if (project.stampOffsetX === 0 && row.stampOffsetX !== 0) {
        project.stampOffsetX = row.stampOffsetX;
      }
      if (project.stampOffsetY === 0 && row.stampOffsetY !== 0) {
        project.stampOffsetY = row.stampOffsetY;
      }
      if ((project.notesBoxHeight || 0) === 0 && row.notesBoxHeight !== 0) {
        project.notesBoxHeight = row.notesBoxHeight;
      }
      project.updatedAt = now;
    }

    serviceLines.push({
      id: lineId,
      projectId,
      reservationId: row.reservationId,
      serviceDate: row.serviceDate,
      serviceName: row.serviceName,
      staffName: row.staffName,
      price: row.price,
      quantity: row.quantity,
      unit: row.unit,
      taxIncluded: row.taxIncluded,
      extraCharges: row.extraCharges,
      remarks: row.remarks,
      memo: row.memo,
      visible: row.visible,
      collectionStatus: row.isCollected ? 'collected' : 'uncollected',
      collectedAt: row.isCollectedDate,
      receiptIssuedAt: row.receiptIssueDate,
      invoiceCode: row.invoiceCode,
      sortKey: buildSortKey(row.serviceDate),
      createdAt: now,
      updatedAt: now
    });
  });

  serviceLines.sort(compareServiceLines);

  const invoiceSelections = buildSelections(Array.from(projectMap.values()), serviceLines, now);

  return {
    projects: Array.from(projectMap.values()).sort(compareProjects),
    serviceLines,
    invoiceSelections,
    warnings
  };
}

function buildSelections(projects: Project[], serviceLines: ServiceLine[], now: string): InvoiceSelection[] {
  const linesByProject = new Map<string, ServiceLine[]>();

  serviceLines.forEach((line) => {
    const current = linesByProject.get(line.projectId) || [];
    current.push(line);
    linesByProject.set(line.projectId, current);
  });

  return projects.flatMap((project) => {
    const lines = linesByProject.get(project.id) || [];
    const uncollected = lines.filter((line) => line.collectionStatus === 'uncollected');
    const autoSelectSingle = uncollected.length === 1;

    return lines.map((line) => ({
      projectId: project.id,
      lineId: line.id,
      selectedForInvoice: autoSelectSingle && line.collectionStatus === 'uncollected',
      selectionBatchKey: getMonthKey(line.serviceDate),
      updatedAt: now
    }));
  });
}

function buildProjectId(row: NormalizedRow): string {
  return stableId('project', row.customerId);
}

function buildSortKey(serviceDate: string | null): number {
  if (!serviceDate) return 0;
  return Number(serviceDate.replace(/-/g, ''));
}

function compareProjects(a: Project, b: Project): number {
  return a.customerName.localeCompare(b.customerName, 'ja');
}

function compareServiceLines(a: ServiceLine, b: ServiceLine): number {
  const dateDiff = (b.sortKey || 0) - (a.sortKey || 0);
  if (dateDiff !== 0) return dateDiff;
  return a.reservationId.localeCompare(b.reservationId, 'ja');
}

function readString(value: unknown): string {
  return String(value ?? '').trim();
}

function readDate(value: unknown): string | null {
  const text = readString(value);
  return text || null;
}

function readInvoiceDateMode(value: unknown): Project['defaultInvoiceDateMode'] {
  const text = readString(value);
  if (text === 'visit' || text === 'monthEnd' || text === 'custom') {
    return text;
  }
  return 'monthEnd';
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}
