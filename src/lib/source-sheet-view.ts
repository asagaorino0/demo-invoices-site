import type { InvoiceSelection, ProjectSummary, ServiceLine } from '../types';
import {
  loadSelectionsForCustomers,
  loadServiceLineIdentitiesForCustomers,
  type ProjectDetailBundle
} from './db/projects';
import { parseInvoiceCsvText, importInvoiceCsvRows } from './csv/import';
import { readGoogleSheetCsvText } from './google-sheets';
import { normalizeCompanyName } from './project-fields';
import { getGoogleSheetSetting } from './store/google-sheet-settings';
import { DEFAULT_GOOGLE_SHEET_SETTING_KEY } from '../types';
import { getCurrentTenantScopeKey } from './tenant';

export interface SourceSheetViewData {
  summaries: ProjectSummary[];
  detailsByProjectId: Map<string, ProjectDetailBundle>;
}

export async function readSourceSheetViewData(): Promise<SourceSheetViewData> {
  const scopeKey = await getCurrentTenantScopeKey();
  const setting = await getGoogleSheetSetting(DEFAULT_GOOGLE_SHEET_SETTING_KEY);
  if (!setting) {
    throw new Error('source スプレッドシート設定が未登録です。');
  }

  const sheetResult = await readGoogleSheetCsvText({
    spreadsheetId: setting.spreadsheetId,
    sheetName: setting.sheetName,
    historySheetName: setting.historySheetName
  });
  const rows = parseInvoiceCsvText(sheetResult.csvText);
  const normalizedRows = rows.map((row) => ({
    ...row,
    companyName: normalizeCompanyName({
      companyName: row.companyName,
      invoiceRecipient: row.invoiceRecipient,
      fallbackCompanyName: ''
    })
  }));
  const bundle = importInvoiceCsvRows(normalizedRows, { scopeKey });
  const customerIdByProjectId = new Map(bundle.projects.map((project) => [project.id, project.customerId]));
  const serviceLineIdentities = await loadServiceLineIdentitiesForCustomers(
    bundle.projects.map((project) => project.customerId)
  );
  const dbLineIdByCustomerAndReservation = new Map(
    serviceLineIdentities.map((row) => [`${row.customerId}::${row.reservationId}`, row.lineId])
  );
  const remappedServiceLines = bundle.serviceLines.map((line) => {
    const customerId = customerIdByProjectId.get(line.projectId) || '';
    const dbLineId = dbLineIdByCustomerAndReservation.get(`${customerId}::${line.reservationId}`);
    return dbLineId ? { ...line, id: dbLineId } : line;
  });
  const preservedSelections = await loadSelectionsForCustomers(bundle.projects.map((project) => project.customerId));
  const remappedSelections = bundle.invoiceSelections.map((selection) => {
    const sourceLine = bundle.serviceLines.find((line) => line.id === selection.lineId);
    if (!sourceLine) {
      return selection;
    }
    const customerId = customerIdByProjectId.get(sourceLine.projectId) || '';
    const dbLineId = dbLineIdByCustomerAndReservation.get(`${customerId}::${sourceLine.reservationId}`);
    return dbLineId ? { ...selection, lineId: dbLineId } : selection;
  });
  const mergedSelections = mergeSelections(remappedSelections, preservedSelections, remappedServiceLines);

  const detailsByProjectId = new Map<string, ProjectDetailBundle>();
  for (const project of bundle.projects) {
    const serviceLines = remappedServiceLines
      .filter((line) => line.projectId === project.id)
      .sort((a, b) => (b.sortKey || 0) - (a.sortKey || 0));
    const invoiceSelections = mergedSelections
      .filter((selection) => selection.projectId === project.id)
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.lineId.localeCompare(b.lineId, 'ja'));

    detailsByProjectId.set(project.id, {
      project,
      serviceLines,
      invoiceSelections
    });
  }

  return {
    summaries: buildProjectSummariesFromBundle(bundle.projects, remappedServiceLines, mergedSelections),
    detailsByProjectId
  };
}

function buildProjectSummariesFromBundle(
  projects: ProjectDetailBundle['project'][],
  serviceLines: ServiceLine[],
  invoiceSelections: InvoiceSelection[]
): ProjectSummary[] {
  return projects
    .filter((project): project is NonNullable<typeof project> => Boolean(project))
    .map((project) => {
      const lines = serviceLines.filter((line) => line.projectId === project.id);
      const selections = invoiceSelections.filter((selection) => selection.projectId === project.id);
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

function mergeSelections(
  importedSelections: InvoiceSelection[],
  preservedSelections: InvoiceSelection[],
  serviceLines: ServiceLine[]
): InvoiceSelection[] {
  const preservedByLineId = new Map(preservedSelections.map((selection) => [selection.lineId, selection]));
  const lineById = new Map(serviceLines.map((line) => [line.id, line]));

  return importedSelections.map((selection) => {
    const preserved = preservedByLineId.get(selection.lineId);
    const line = lineById.get(selection.lineId);

    if (!preserved || !line) {
      return selection;
    }

    return {
      ...selection,
      projectId: selection.projectId,
      lineId: selection.lineId,
      selectedForInvoice: line.collectionStatus === 'uncollected' ? preserved.selectedForInvoice : false,
      selectionBatchKey: preserved.selectionBatchKey || selection.selectionBatchKey,
      updatedAt: preserved.updatedAt || selection.updatedAt
    };
  });
}
