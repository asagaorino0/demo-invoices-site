import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { InvoiceSelection, Project, ProjectSummary, ServiceLine } from '../types';
import { getMonthKey } from './csv/shared';

export interface LocalStoreData {
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
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      serviceLines: Array.isArray(parsed.serviceLines) ? parsed.serviceLines : [],
      invoiceSelections: Array.isArray(parsed.invoiceSelections) ? parsed.invoiceSelections : []
    };
  } catch {
    return {
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
        uncollectedCount: lines.filter((line) => line.collectionStatus === 'uncollected').length,
        collectedCount: lines.filter((line) => line.collectionStatus === 'collected').length,
        selectedCount: lines.filter((line) => selectedIds.has(line.id)).length,
        status: project.status,
        lastImportedAt: project.updatedAt || null
      };
    })
    .sort((a, b) => a.customerName.localeCompare(b.customerName, 'ja'));
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
