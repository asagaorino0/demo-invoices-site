import { access, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { GoogleSheetSetting, InvoiceSelection, IssuerSetting, Project, ProjectSummary, ServiceLine } from '../types';
import { getMonthKey } from './csv/shared';
import { normalizeCompanyName } from './project-fields';
import { getCurrentWorkspaceKey } from './workspace';

export interface LocalStoreData {
  googleSheetSettings: GoogleSheetSetting[];
  issuerSettings: IssuerSetting[];
  projects: Project[];
  serviceLines: ServiceLine[];
  invoiceSelections: InvoiceSelection[];
}

const STORE_FILE_NAME = '.demo-invoices-local-store.json';
let storeFilePathPromise: Promise<string> | null = null;

export async function readLocalStore(): Promise<LocalStoreData> {
  try {
    const raw = await readFile(await getStoreFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalStoreData> & {
      workspaces?: Record<string, Partial<LocalStoreData>>;
    };
    const workspaceKey = await getCurrentWorkspaceKey();
    const workspaceStore =
      parsed.workspaces && typeof parsed.workspaces === 'object'
        ? parsed.workspaces[workspaceKey] || {}
        : parsed;
    return {
      googleSheetSettings: Array.isArray(workspaceStore.googleSheetSettings)
        ? workspaceStore.googleSheetSettings.map(normalizeGoogleSheetSetting)
        : [],
      issuerSettings: Array.isArray(workspaceStore.issuerSettings)
        ? workspaceStore.issuerSettings.map(normalizeIssuerSetting)
        : [],
      projects: Array.isArray(workspaceStore.projects) ? workspaceStore.projects.map(normalizeProject) : [],
      serviceLines: Array.isArray(workspaceStore.serviceLines) ? workspaceStore.serviceLines : [],
      invoiceSelections: Array.isArray(workspaceStore.invoiceSelections) ? workspaceStore.invoiceSelections : []
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
  const workspaceKey = await getCurrentWorkspaceKey();
  const storeFilePath = await getStoreFilePath();
  let parsed: { workspaces?: Record<string, LocalStoreData> } = {};

  try {
    parsed = JSON.parse(await readFile(storeFilePath, 'utf8')) as { workspaces?: Record<string, LocalStoreData> };
  } catch {
    parsed = {};
  }

  const nextPayload = {
    workspaces: {
      ...(parsed.workspaces || {}),
      [workspaceKey]: data
    }
  };

  await writeFile(storeFilePath, JSON.stringify(nextPayload, null, 2), 'utf8');
}

async function getStoreFilePath(): Promise<string> {
  if (!storeFilePathPromise) {
    storeFilePathPromise = resolveStoreFilePath().catch((error) => {
      storeFilePathPromise = null;
      throw error;
    });
  }

  return storeFilePathPromise;
}

async function resolveStoreFilePath(): Promise<string> {
  const envPath = String(process.env.DEMO_INVOICES_LOCAL_STORE_FILE || '').trim();
  if (envPath) {
    return envPath;
  }

  const candidates = [
    path.join(process.cwd(), STORE_FILE_NAME),
    path.join(os.tmpdir(), STORE_FILE_NAME)
  ];

  for (const candidate of candidates) {
    if (await canWriteStoreFile(candidate)) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1];
}

async function canWriteStoreFile(filePath: string): Promise<boolean> {
  try {
    await access(path.dirname(filePath), fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
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
    tenantId: entry.tenantId ? String(entry.tenantId).trim() : null,
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
    notesBoxHeight: Number.isFinite(entry.notesBoxHeight) ? Number(entry.notesBoxHeight) : 0,
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
