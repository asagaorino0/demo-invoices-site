import * as db from '../db/projects';
import type { Project, ServiceLine } from '../../types';
import { DEFAULT_GOOGLE_SHEET_SETTING_KEY } from '../../types';
import { getGoogleSheetSetting } from './google-sheet-settings';
import { readSourceSheetViewData } from '../source-sheet-view';
import { syncProjectToGoogleSheet } from '../google-sheets';
import { getCurrentTenantScopeKey } from '../tenant';
import { scopeEntityId } from '../workspace';
import { getMonthKey, stableId } from '../csv/shared';

export * from '../db/projects';

async function sheetTarget() {
  return getGoogleSheetSetting(DEFAULT_GOOGLE_SHEET_SETTING_KEY);
}

export async function listProjectSummaries() {
  return await sheetTarget() ? (await readSourceSheetViewData()).summaries : db.listProjectSummaries();
}

export async function getProjectDetail(projectId: string): Promise<db.ProjectDetailBundle> {
  if (!await sheetTarget()) return db.getProjectDetail(projectId);
  return (await readSourceSheetViewData()).detailsByProjectId.get(projectId) || {
    project: null, serviceLines: [], invoiceSelections: []
  };
}

type SheetBundle = db.ProjectDetailBundle & { project: Project };

async function saveBundle(bundle: SheetBundle, previous?: SheetBundle) {
  const target = await sheetTarget();
  if (!target) throw new Error('source スプレッドシート設定が未登録です。');
  await syncProjectToGoogleSheet({ ...bundle, target, previous });
}

async function mutateProject<T>(projectId: string, mutate: (bundle: SheetBundle) => T): Promise<T> {
  const bundle = await getProjectDetail(projectId);
  if (!bundle.project) throw new Error(`Project not found: ${projectId}`);
  const previous = structuredClone({ ...bundle, project: bundle.project });
  const ready = { ...bundle, project: { ...bundle.project, status: 'draft' as const, updatedAt: new Date().toISOString() } };
  const result = mutate(ready);
  await saveBundle(ready, previous);
  return result;
}

export async function updateProjectHeader(input: db.UpdateProjectHeaderInput) {
  if (!await sheetTarget()) return db.updateProjectHeader(input);
  return mutateProject(input.projectId, (bundle) => {
    const { projectId: _, ...fields } = input;
    bundle.project = { ...bundle.project, ...fields };
    return bundle.project;
  });
}

export async function replaceProjectSelections(projectId: string, selectedLineIds: string[], orderedLineIds?: string[]) {
  if (!await sheetTarget()) return db.replaceProjectSelections(projectId, selectedLineIds, orderedLineIds);
  return mutateProject(projectId, (bundle) => {
    const lines = new Map(bundle.serviceLines.map((line) => [line.id, line]));
    const ids = [...new Set([...(orderedLineIds || []), ...lines.keys()])].filter((id) => lines.has(id));
    const now = Date.now();
    bundle.invoiceSelections = ids.map((lineId, index) => ({
      projectId, lineId,
      selectedForInvoice: selectedLineIds.includes(lineId) && lines.get(lineId)!.collectionStatus === 'uncollected',
      selectionBatchKey: getMonthKey(lines.get(lineId)!.serviceDate),
      updatedAt: new Date(now + index).toISOString()
    }));
    return { projectId, selectedCount: bundle.invoiceSelections.filter((selection) => selection.selectedForInvoice).length };
  });
}

export async function updateServiceLine(input: db.UpdateServiceLineInput): Promise<ServiceLine | null> {
  if (!await sheetTarget()) return db.updateServiceLine(input);
  return mutateProject(input.projectId, (bundle) => {
    const line = bundle.serviceLines.find((item) => item.id === input.lineId ||
      (input.reservationId && item.reservationId === input.reservationId));
    if (!line) throw new Error(`Service line not found: ${input.lineId}`);
    const { lineId: _, reservationId: __, ...fields } = input;
    const collectedAt = input.collectionStatus === 'collected' ? input.collectedAt || new Date().toISOString().slice(0, 10) : null;
    Object.assign(line, fields, {
      collectedAt,
      receiptIssuedAt: input.collectionStatus === 'collected' ? input.receiptIssuedAt || collectedAt : null,
      sortKey: Number((input.serviceDate || '').replace(/-/g, '')),
      updatedAt: new Date().toISOString()
    });
    if (line.collectionStatus === 'collected') {
      bundle.invoiceSelections = bundle.invoiceSelections.map((selection) => selection.lineId === line.id
        ? { ...selection, selectedForInvoice: false } : selection);
    }
    return line;
  });
}

export async function createServiceLine(input: db.CreateServiceLineInput): Promise<ServiceLine> {
  if (!await sheetTarget()) return db.createServiceLine(input);
  const scope = await getCurrentTenantScopeKey();
  return mutateProject(input.projectId, (bundle) => {
    const reservationId = input.reservationId || `manual-${crypto.randomUUID()}`;
    if (bundle.serviceLines.some((line) => line.reservationId === reservationId)) throw new Error('同じ予約 ID の明細が既にあります。');
    const now = new Date().toISOString();
    const collectedAt = input.collectionStatus === 'collected' ? now.slice(0, 10) : null;
    const line: ServiceLine = {
      ...input, reservationId,
      id: scopeEntityId(scope, stableId('line', bundle.project.customerId, reservationId)),
      extraCharges: [], invoiceCode: '', collectedAt, receiptIssuedAt: collectedAt,
      sortKey: Number((input.serviceDate || '').replace(/-/g, '')),
      createdAt: now, updatedAt: now
    };
    bundle.serviceLines.push(line);
    bundle.invoiceSelections.push({ projectId: input.projectId, lineId: line.id,
      selectedForInvoice: input.collectionStatus === 'uncollected', selectionBatchKey: getMonthKey(input.serviceDate), updatedAt: now });
    return line;
  });
}

export async function duplicateServiceLine(input: db.DuplicateServiceLineInput) {
  if (!await sheetTarget()) return db.duplicateServiceLine(input);
  const bundle = await getProjectDetail(input.projectId);
  const line = bundle.serviceLines.find((item) => item.id === input.lineId);
  if (!line) return null;
  return createServiceLine({ ...line, projectId: input.projectId,
    reservationId: `${line.reservationId}-copy-${crypto.randomUUID()}`, serviceName: `${line.serviceName}（複製）` });
}

export async function deleteServiceLine(projectId: string, lineId: string) {
  if (!await sheetTarget()) return db.deleteServiceLine(projectId, lineId);
  await mutateProject(projectId, (bundle) => {
    if (!bundle.serviceLines.some((line) => line.id === lineId)) throw new Error(`Service line not found: ${lineId}`);
    bundle.serviceLines = bundle.serviceLines.filter((line) => line.id !== lineId);
    bundle.invoiceSelections = bundle.invoiceSelections.filter((selection) => selection.lineId !== lineId);
  });
}

export async function getProjectExportBundle(projectId: string): Promise<db.ProjectExportBundle | null> {
  const bundle = await getProjectDetail(projectId);
  return bundle.project ? { ...bundle, project: bundle.project } : null;
}

export async function markProjectAsExported(projectId: string) {
  if (!await sheetTarget()) return db.markProjectAsExported(projectId);
  await mutateProject(projectId, (bundle) => { bundle.project.status = 'exported'; });
}

export async function createExportJob(input: Parameters<typeof db.createExportJob>[0]) {
  if (!await sheetTarget()) return db.createExportJob(input);
  await markProjectAsExported(input.projectId);
}

// This operation only clears the legacy cache when switching source spreadsheets.
// It must never delete rows in the user's source spreadsheet.
export async function clearWorkspaceProjectData() {
  if (!await sheetTarget() && process.env.DATABASE_URL) return db.clearWorkspaceProjectData();
}

export async function persistImportedBundle(input: db.PersistImportInput): Promise<db.PersistImportResult> {
  if (!await sheetTarget()) return db.persistImportedBundle(input);
  for (const project of input.projects) {
    await saveBundle({ project,
      serviceLines: input.serviceLines.filter((line) => line.projectId === project.id),
      invoiceSelections: input.invoiceSelections.filter((selection) => selection.projectId === project.id) });
  }
  return { importId: input.importId, projectCount: input.projects.length,
    lineCount: input.serviceLines.length, selectionCount: input.invoiceSelections.length };
}
