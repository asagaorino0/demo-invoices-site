import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GoogleSheetSetting, InvoiceSelection, IssuerSetting, Project, ProjectSummary, ServiceLine } from '../types';
import { getMonthKey } from './csv/shared';
import { normalizeCompanyName } from './project-fields';

export interface LocalStoreData {
  googleSheetSettings: GoogleSheetSetting[];
  issuerSettings: IssuerSetting[];
  projects: Project[];
  serviceLines: ServiceLine[];
  invoiceSelections: InvoiceSelection[];
}

const STORE_FILE = path.join(process.cwd(), '.demo-invoices-local-store.json');

export async function readLocalStore(): Promise<LocalStoreData> {
  try {
    const raw = await readFile(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalStoreData>;
    return {
      googleSheetSettings: Array.isArray(parsed.googleSheetSettings)
        ? parsed.googleSheetSettings.map(normalizeGoogleSheetSetting)
        : [],
      issuerSettings: Array.isArray(parsed.issuerSettings) ? parsed.issuerSettings.map(normalizeIssuerSetting) : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects.map(normalizeProject) : [],
      serviceLines: Array.isArray(parsed.serviceLines) ? parsed.serviceLines : [],
      invoiceSelections: Array.isArray(parsed.invoiceSelections) ? parsed.invoiceSelections : []
    };
  } catch {
    return {
      googleSheetSettings: [],
      issuerSettings: [],
      projects: [],
      serviceLines: [],
      invoiceSelections: []
    };
  }
}

export async function writeLocalStore(data: LocalStoreData): Promise<void> {
  await writeFile(STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export function buildProjectSummaries(data: LocalStoreData): ProjectSummary[] {
  return data.projects
    .map((project) => {
      const lines = data.serviceLines.filter((line) => line.projectId === project.id);
      const selections = data.invoiceSelections.filter((selection) => selection.projectId === project.id);
      const selectedIds = new Set(
        selections.filter((selection) => selection.selectedForInvoice).map((selection) => selection.lineId)
      );

      return {
        id: project.id,
        customerId: project.customerId,
        customerName: project.customerName,
        invoiceRecipient: project.invoiceRecipient,
        companyName: project.companyName,
        uncollectedCount: lines.filter((line) => line.collectionStatus === 'uncollected').length,
        collectedCount: lines.filter((line) => line.collectionStatus === 'collected').length,
        selectedCount: lines.filter((line) => selectedIds.has(line.id)).length,
        status: project.status,
        lastImportedAt: project.updatedAt || null
      };
    })
    .sort((a, b) => a.customerName.localeCompare(b.customerName, 'ja'));
}

function normalizeGoogleSheetSetting(value: unknown): GoogleSheetSetting {
  const entry = value as Partial<GoogleSheetSetting> & { customerId?: string };
  const legacyEntry = value as Record<string, unknown>;
  const legacySettingKey = legacyEntry['shop' + 'Key'];
  return {
    settingKey: String(entry.settingKey || legacySettingKey || entry.customerId || '').trim(),
    spreadsheetId: String(entry.spreadsheetId || '').trim(),
    sheetName: String(entry.sheetName || '').trim(),
    historySheetName: entry.historySheetName ? String(entry.historySheetName) : null,
    createdAt: String(entry.createdAt || ''),
    updatedAt: String(entry.updatedAt || '')
  };
}

function normalizeIssuerSetting(value: unknown): IssuerSetting {
  const entry = value as Partial<IssuerSetting>;
  return {
    settingKey: String(entry.settingKey || '').trim(),
    issuerName: String(entry.issuerName || '').trim(),
    issuerPostalCode: String(entry.issuerPostalCode || '').trim(),
    issuerAddress: String(entry.issuerAddress || '').trim(),
    issuerContact: String(entry.issuerContact || '').trim(),
    issuerEmail: String(entry.issuerEmail || '').trim(),
    issuerInvoiceNumber: String(entry.issuerInvoiceNumber || '').trim(),
    issuerRepresentativeName: String(entry.issuerRepresentativeName || '').trim(),
    issuerRepresentativeTitle: String(entry.issuerRepresentativeTitle || '').trim(),
    issuerStampUrl: String(entry.issuerStampUrl || '').trim(),
    bankNote: String(entry.bankNote || '').trim(),
    createdAt: String(entry.createdAt || ''),
    updatedAt: String(entry.updatedAt || '')
  };
}

function normalizeProject(value: unknown): Project {
  const entry = value as Partial<Project>;
  return {
    id: String(entry.id || ''),
    importId: entry.importId ? String(entry.importId) : null,
    customerId: String(entry.customerId || ''),
    customerName: String(entry.customerName || ''),
    defaultInvoiceDateMode:
      entry.defaultInvoiceDateMode === 'visit' ||
      entry.defaultInvoiceDateMode === 'monthEnd' ||
      entry.defaultInvoiceDateMode === 'custom'
        ? entry.defaultInvoiceDateMode
        : 'monthEnd',
    invoiceRecipient: String(entry.invoiceRecipient || ''),
    subject: String(entry.subject || ''),
    facilityName: String(entry.facilityName || ''),
    companyName: normalizeCompanyName({
      companyName: entry.companyName,
      invoiceRecipient: entry.invoiceRecipient
    }),
    issueDate: entry.issueDate ? String(entry.issueDate) : null,
    defaultRemarks: String(entry.defaultRemarks || ''),
    issuerBoxOffsetX: Number.isFinite(entry.issuerBoxOffsetX) ? Number(entry.issuerBoxOffsetX) : 0,
    issuerBoxOffsetY: Number.isFinite(entry.issuerBoxOffsetY) ? Number(entry.issuerBoxOffsetY) : 0,
    issuerBoxWidth: Number.isFinite(entry.issuerBoxWidth) ? Number(entry.issuerBoxWidth) : 0,
    stampOffsetX: Number.isFinite(entry.stampOffsetX) ? Number(entry.stampOffsetX) : 0,
    stampOffsetY: Number.isFinite(entry.stampOffsetY) ? Number(entry.stampOffsetY) : 0,
    status:
      entry.status === 'ready_for_export' || entry.status === 'exported' ? entry.status : 'draft',
    createdAt: String(entry.createdAt || ''),
    updatedAt: String(entry.updatedAt || '')
  };
}

export function upsertById<T extends { id: string }>(items: T[], nextItem: T): T[] {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index === -1) {
    return [...items, nextItem];
  }

  const copy = [...items];
  copy[index] = nextItem;
  return copy;
}

export function upsertSelection(
  items: InvoiceSelection[],
  nextItem: InvoiceSelection
): InvoiceSelection[] {
  const index = items.findIndex(
    (item) => item.projectId === nextItem.projectId && item.lineId === nextItem.lineId
  );
  if (index === -1) {
    return [...items, nextItem];
  }

  const copy = [...items];
  copy[index] = nextItem;
  return copy;
}

export function buildSelection(projectId: string, lineId: string, selectedForInvoice: boolean, updatedAt: string) {
  return {
    projectId,
    lineId,
    selectedForInvoice,
    selectionBatchKey: '',
    updatedAt
  };
}

export function normalizeSelectionBatchKey(serviceDate: string | null): string {
  return getMonthKey(serviceDate);
}
