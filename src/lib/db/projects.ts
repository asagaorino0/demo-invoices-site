import type { InvoiceSelection, Project, ProjectSummary, ServiceLine } from '../../types';
import {
  buildProjectSummaries,
  normalizeSelectionBatchKey,
  readLocalStore,
  upsertById,
  upsertSelection,
  writeLocalStore
} from '../local-store';
import { stableId } from '../csv/shared';
import { getDb, withTransaction } from './client';
import {
  deleteServiceLineSql,
  insertExportJobSql,
  insertImportSql,
  insertProjectSql,
  insertServiceLineSql,
  markProjectExportedSql,
  markProjectDraftSql,
  projectDetailSql,
  projectSelectionsSql,
  projectServiceLinesSql,
  projectSummarySql,
  resetProjectSelectionsSql,
  updateProjectHeaderSql,
  updateServiceLineSql,
  upsertInvoiceSelectionSql,
  upsertProjectSql,
  upsertServiceLineSql
} from './sql';

export interface ProjectDetailBundle {
  project: Project | null;
  serviceLines: ServiceLine[];
  invoiceSelections: InvoiceSelection[];
}

export interface PersistImportInput {
  importId: string;
  replaceCompanyNames?: string[];
  sourceName: string;
  sourceType: 'csv' | 'xlsx' | 'json' | 'manual';
  rowCount: number;
  warnings: unknown[];
  projects: Project[];
  serviceLines: ServiceLine[];
  invoiceSelections: InvoiceSelection[];
}

export interface PersistImportResult {
  importId: string;
  projectCount: number;
  lineCount: number;
  selectionCount: number;
}

export interface UpdateProjectHeaderInput {
  projectId: string;
  customerName: string;
  subject: string;
  defaultInvoiceDateMode: Project['defaultInvoiceDateMode'];
  invoiceRecipient: string;
  facilityName: string;
  companyName: string;
  issueDate: string | null;
  defaultRemarks: string;
  issuerBoxOffsetX: number;
  issuerBoxOffsetY: number;
  issuerBoxWidth: number;
  stampOffsetX: number;
  stampOffsetY: number;
  status: Project['status'];
}

export interface UpdateServiceLineInput {
  projectId: string;
  lineId: string;
  serviceDate: string | null;
  serviceName: string;
  staffName: string;
  price: number;
  quantity: number;
  unit: string;
  taxIncluded: boolean;
  remarks: string;
  memo: string;
  visible: boolean;
  collectionStatus: ServiceLine['collectionStatus'];
  collectedAt: string | null;
  receiptIssuedAt: string | null;
}

export interface ProjectExportBundle {
  project: Project;
  serviceLines: ServiceLine[];
  invoiceSelections: InvoiceSelection[];
}

export interface CreateProjectInput {
  customerId?: string;
  customerName: string;
  subject: string;
  defaultInvoiceDateMode: Project['defaultInvoiceDateMode'];
  invoiceRecipient: string;
  facilityName: string;
  companyName: string;
  issueDate: string | null;
  defaultRemarks: string;
  issuerBoxOffsetX: number;
  issuerBoxOffsetY: number;
  issuerBoxWidth: number;
  stampOffsetX: number;
  stampOffsetY: number;
}

interface ProjectIdentityRow {
  customerId: string;
  companyName: string;
  facilityName: string;
}

export interface CreateServiceLineInput {
  projectId: string;
  reservationId?: string;
  serviceDate: string | null;
  serviceName: string;
  staffName: string;
  price: number;
  quantity: number;
  unit: string;
  taxIncluded: boolean;
  remarks: string;
  memo: string;
  visible: boolean;
  collectionStatus: ServiceLine['collectionStatus'];
}

export interface DuplicateServiceLineInput {
  projectId: string;
  lineId: string;
}

export async function listProjectSummaries(): Promise<ProjectSummary[]> {
  try {
    const db = await getDb();
    const result = await db.query<ProjectSummary>(projectSummarySql);
    return result.rows;
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    return buildProjectSummaries(store);
  }
}

export async function getProjectDetail(projectId: string): Promise<ProjectDetailBundle> {
  try {
    const db = await getDb();
    const [projectResult, serviceLineResult, selectionResult] = await Promise.all([
      db.query<Project>(projectDetailSql, [projectId]),
      db.query<ServiceLine>(projectServiceLinesSql, [projectId]),
      db.query<InvoiceSelection>(projectSelectionsSql, [projectId])
    ]);

    return {
      project: projectResult.rows[0] || null,
      serviceLines: serviceLineResult.rows,
      invoiceSelections: selectionResult.rows
    };
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    return {
      project: store.projects.find((project) => project.id === projectId) || null,
      serviceLines: store.serviceLines
        .filter((line) => line.projectId === projectId)
        .sort((a, b) => (b.sortKey || 0) - (a.sortKey || 0)),
      invoiceSelections: store.invoiceSelections
        .filter((selection) => selection.projectId === projectId)
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.lineId.localeCompare(b.lineId, 'ja'))
    };
  }
}

export async function persistImportedBundle(input: PersistImportInput): Promise<PersistImportResult> {
  const importedCustomerIds = Array.from(new Set(input.projects.map((project) => project.customerId))).filter(
    Boolean
  );
  const replaceCompanyNames = Array.from(
    new Set((input.replaceCompanyNames || input.projects.map((project) => project.companyName)).filter(Boolean))
  );
  const preservedSelections = await loadSelectionsForCustomers(importedCustomerIds);
  const mergedInvoiceSelections = mergeImportedSelections(
    input.serviceLines,
    input.invoiceSelections,
    preservedSelections
  );

  try {
    return await withTransaction(async (db) => {
      await db.query(insertImportSql, [
        input.importId,
        input.sourceName,
        input.sourceType,
        input.rowCount,
        JSON.stringify(input.warnings)
      ]);

      if (replaceCompanyNames.length > 0) {
        await deleteProjectsByCompanyNames(db, replaceCompanyNames);
      } else if (importedCustomerIds.length > 0) {
        await deleteProjectsByCustomerIds(db, importedCustomerIds);
      }

      for (const project of input.projects) {
        await db.query(upsertProjectSql, [
          project.id,
          input.importId,
          project.customerId,
          project.customerName,
      project.subject,
      project.defaultInvoiceDateMode,
      project.invoiceRecipient,
      project.facilityName,
      project.companyName,
      project.issueDate || '',
      project.defaultRemarks,
      project.issuerBoxOffsetX,
      project.issuerBoxOffsetY,
      project.issuerBoxWidth,
      project.stampOffsetX,
      project.stampOffsetY,
      project.status,
      project.createdAt,
      project.updatedAt
        ]);
      }

      for (const line of input.serviceLines) {
        await db.query(upsertServiceLineSql, [
          line.id,
          line.projectId,
          line.reservationId,
          line.serviceDate || '',
          line.serviceName,
          line.staffName,
          line.price,
          line.quantity,
          line.unit,
          line.taxIncluded,
          JSON.stringify(line.extraCharges || []),
          line.remarks,
          line.memo,
          line.visible,
          line.collectionStatus,
          line.collectedAt || '',
          line.receiptIssuedAt || '',
          line.invoiceCode,
          line.sortKey,
          line.createdAt,
          line.updatedAt
        ]);
      }

      for (const selection of mergedInvoiceSelections) {
        await db.query(upsertInvoiceSelectionSql, [
          selection.projectId,
          selection.lineId,
          selection.selectedForInvoice,
          selection.selectionBatchKey,
          selection.updatedAt
        ]);
      }

      return {
        importId: input.importId,
        projectCount: input.projects.length,
        lineCount: input.serviceLines.length,
        selectionCount: mergedInvoiceSelections.length
      };
    });
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    const projectIdsToReplace = new Set(
      store.projects
        .filter(
          (project) =>
            replaceCompanyNames.includes(project.companyName) || importedCustomerIds.includes(project.customerId)
        )
        .map((project) => project.id)
    );
    let projects = store.projects.filter(
      (project) =>
        !replaceCompanyNames.includes(project.companyName) && !importedCustomerIds.includes(project.customerId)
    );
    let serviceLines = store.serviceLines.filter((line) => !projectIdsToReplace.has(line.projectId));
    let invoiceSelections = store.invoiceSelections.filter(
      (selection) => !projectIdsToReplace.has(selection.projectId)
    );

    for (const project of input.projects) {
      projects = upsertById(projects, project);
    }
    for (const line of input.serviceLines) {
      serviceLines = upsertById(serviceLines, line);
    }
    for (const selection of mergedInvoiceSelections) {
      invoiceSelections = upsertSelection(invoiceSelections, selection);
    }

    await writeLocalStore({
      ...store,
      projects,
      serviceLines,
      invoiceSelections
    });

    return {
      importId: input.importId,
      projectCount: input.projects.length,
      lineCount: input.serviceLines.length,
      selectionCount: mergedInvoiceSelections.length
    };
  }
}

async function deleteProjectsByCustomerIds(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  customerIds: string[]
) {
  await db.query(
    `
      delete from invoice_selections
      where project_id in (
        select id
        from projects
        where customer_id = any($1::text[])
      )
    `,
    [customerIds]
  );

  await db.query(
    `
      delete from service_lines
      where project_id in (
        select id
        from projects
        where customer_id = any($1::text[])
      )
    `,
    [customerIds]
  );

  await db.query(
    `
      delete from projects
      where customer_id = any($1::text[])
    `,
    [customerIds]
  );
}

async function deleteProjectsByCompanyNames(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  companyNames: string[]
) {
  await db.query(
    `
      delete from invoice_selections
      where project_id in (
        select id
        from projects
        where company_name = any($1::text[])
      )
    `,
    [companyNames]
  );

  await db.query(
    `
      delete from service_lines
      where project_id in (
        select id
        from projects
        where company_name = any($1::text[])
      )
    `,
    [companyNames]
  );

  await db.query(
    `
      delete from projects
      where company_name = any($1::text[])
    `,
    [companyNames]
  );
}

export async function updateProjectHeader(input: UpdateProjectHeaderInput): Promise<Project | null> {
  const now = new Date().toISOString();

  try {
    const db = await getDb();
    const result = await db.query<Project>(updateProjectHeaderSql, [
      input.projectId,
      input.customerName,
      input.subject,
      input.defaultInvoiceDateMode,
      input.invoiceRecipient,
      input.facilityName,
      input.companyName,
      input.issueDate || '',
      input.defaultRemarks,
      input.issuerBoxOffsetX,
      input.issuerBoxOffsetY,
      input.issuerBoxWidth,
      input.stampOffsetX,
      input.stampOffsetY,
      input.status,
      now
    ]);

    return result.rows[0] || null;
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    const project = store.projects.find((item) => item.id === input.projectId);
    if (!project) return null;

    const nextProject: Project = {
      ...project,
      customerName: input.customerName,
      subject: input.subject,
      defaultInvoiceDateMode: input.defaultInvoiceDateMode,
      invoiceRecipient: input.invoiceRecipient,
      facilityName: input.facilityName,
      companyName: input.companyName,
      issueDate: input.issueDate,
      defaultRemarks: input.defaultRemarks,
      issuerBoxOffsetX: input.issuerBoxOffsetX,
      issuerBoxOffsetY: input.issuerBoxOffsetY,
      issuerBoxWidth: input.issuerBoxWidth,
      stampOffsetX: input.stampOffsetX,
      stampOffsetY: input.stampOffsetY,
      status: input.status,
      updatedAt: now
    };

    await writeLocalStore({
      ...store,
      projects: upsertById(store.projects, nextProject)
    });

    return nextProject;
  }
}

export async function replaceProjectSelections(
  projectId: string,
  selectedLineIds: string[],
  orderedLineIds?: string[]
): Promise<{ projectId: string; selectedCount: number }> {
  const now = Date.now();

  try {
    return await withTransaction(async (db) => {
      const lineResult = await db.query<ServiceLine>(projectServiceLinesSql, [projectId]);
      const allLineIds = lineResult.rows.map((line) => line.id);
      const selectedSet = new Set(selectedLineIds);
      const orderedIds = buildOrderedLineIds(allLineIds, orderedLineIds);

      await db.query(resetProjectSelectionsSql, [projectId, new Date(now).toISOString()]);

      for (const [index, lineId] of orderedIds.entries()) {
        const orderedTimestamp = new Date(now + index).toISOString();
        const line = lineResult.rows.find((item) => item.id === lineId);
        await db.query(upsertInvoiceSelectionSql, [
          projectId,
          lineId,
          selectedSet.has(lineId),
          normalizeSelectionBatchKey(line?.serviceDate || null) || '',
          orderedTimestamp
        ]);
      }

      await db.query(markProjectDraftSql, [projectId, new Date(now).toISOString()]);

      return {
        projectId,
        selectedCount: selectedLineIds.length
      };
    });
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    const lines = store.serviceLines.filter((line) => line.projectId === projectId);
    const orderedIds = buildOrderedLineIds(
      lines.map((line) => line.id),
      orderedLineIds
    );
    let invoiceSelections = store.invoiceSelections.filter((selection) => selection.projectId !== projectId);

    for (const [index, lineId] of orderedIds.entries()) {
      const line = lines.find((item) => item.id === lineId);
      if (!line) continue;
      invoiceSelections = upsertSelection(invoiceSelections, {
        projectId,
        lineId: line.id,
        selectedForInvoice: selectedLineIds.includes(line.id),
        selectionBatchKey: normalizeSelectionBatchKey(line.serviceDate) || '',
        updatedAt: new Date(now + index).toISOString()
      });
    }

    await writeLocalStore({
      ...store,
      invoiceSelections,
      projects: markProjectDraftInStore(store.projects, projectId, new Date(now).toISOString())
    });

    return { projectId, selectedCount: selectedLineIds.length };
  }
}

export async function updateServiceLine(input: UpdateServiceLineInput): Promise<ServiceLine | null> {
  const now = new Date().toISOString();
  const collectedAt =
    input.collectionStatus === 'collected'
      ? input.collectedAt || new Date().toISOString().slice(0, 10)
      : null;
  const receiptIssuedAt =
    input.collectionStatus === 'collected'
      ? input.receiptIssuedAt || collectedAt
      : null;
  const sortKey = input.serviceDate ? Number(input.serviceDate.replace(/-/g, '')) : 0;

  try {
    const db = await getDb();
    const result = await db.query<ServiceLine>(updateServiceLineSql, [
      input.lineId,
      input.projectId,
      input.serviceDate || '',
      input.serviceName,
      input.staffName,
      input.price,
      input.quantity,
      input.unit,
      input.taxIncluded,
      input.remarks,
      input.memo,
      input.visible,
      input.collectionStatus,
      collectedAt || '',
      receiptIssuedAt || '',
      sortKey,
      now
    ]);

    if (result.rows[0]) {
      await db.query(markProjectDraftSql, [input.projectId, now]);
    }

    return result.rows[0] || null;
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    const line = store.serviceLines.find(
      (item) => item.id === input.lineId && item.projectId === input.projectId
    );
    if (!line) return null;

    const nextLine: ServiceLine = {
      ...line,
      serviceDate: input.serviceDate,
      serviceName: input.serviceName,
      staffName: input.staffName,
      price: input.price,
      quantity: input.quantity,
      unit: input.unit,
      taxIncluded: input.taxIncluded,
      remarks: input.remarks,
      memo: input.memo,
      visible: input.visible,
      collectionStatus: input.collectionStatus,
      collectedAt,
      receiptIssuedAt,
      sortKey,
      updatedAt: now
    };

    await writeLocalStore({
      ...store,
      serviceLines: upsertById(store.serviceLines, nextLine),
      projects: markProjectDraftInStore(store.projects, input.projectId, now)
    });

    return nextLine;
  }
}

export async function getProjectExportBundle(projectId: string): Promise<ProjectExportBundle | null> {
  const detail = await getProjectDetail(projectId);
  if (!detail.project) {
    return null;
  }

  return {
    project: detail.project,
    serviceLines: detail.serviceLines,
    invoiceSelections: detail.invoiceSelections
  };
}

export async function createExportJob(input: {
  projectId: string;
  fileName: string;
  exportedRowCount: number;
  exportType?: 'csv_project' | 'csv_all_projects';
}): Promise<void> {
  try {
    const db = await getDb();
    await db.query(insertExportJobSql, [
      crypto.randomUUID(),
      input.projectId,
      input.exportType || 'csv_project',
      input.exportedRowCount,
      input.fileName,
      new Date().toISOString()
    ]);
    await db.query(markProjectExportedSql, [input.projectId, new Date().toISOString()]);
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    const project = store.projects.find((item) => item.id === input.projectId);
    if (!project) return;

    await writeLocalStore({
      ...store,
      projects: upsertById(store.projects, {
        ...project,
        status: 'exported',
        updatedAt: new Date().toISOString()
      })
    });
  }
}

export async function markProjectAsExported(projectId: string): Promise<void> {
  const now = new Date().toISOString();

  try {
    const db = await getDb();
    await db.query(markProjectExportedSql, [projectId, now]);
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    const project = store.projects.find((item) => item.id === projectId);
    if (!project) return;

    await writeLocalStore({
      ...store,
      projects: upsertById(store.projects, {
        ...project,
        status: 'exported',
        updatedAt: now
      })
    });
  }
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  try {
    return await withTransaction(async (db) => {
      const customerId =
        input.customerId ||
        generateCustomerId(
          (
            await db.query<ProjectIdentityRow>(
              `
                select
                  customer_id as "customerId",
                  company_name as "companyName",
                  facility_name as "facilityName"
                from projects
              `
            )
          ).rows,
          input.companyName,
          input.facilityName
        );
      const result = await db.query<Project>(insertProjectSql, [
        id,
        customerId,
        input.customerName,
        input.subject,
        input.defaultInvoiceDateMode,
        input.invoiceRecipient,
        input.facilityName,
        input.companyName,
        input.issueDate || '',
        input.defaultRemarks,
        input.issuerBoxOffsetX,
        input.issuerBoxOffsetY,
        input.issuerBoxWidth,
        input.stampOffsetX,
        input.stampOffsetY,
        'draft',
        now,
        now
      ]);

      return result.rows[0];
    });
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    const customerId = input.customerId || generateCustomerId(store.projects, input.companyName, input.facilityName);
    const project: Project = {
      id,
      importId: null,
      customerId,
      customerName: input.customerName,
      subject: input.subject,
      defaultInvoiceDateMode: input.defaultInvoiceDateMode,
      invoiceRecipient: input.invoiceRecipient,
      facilityName: input.facilityName,
      companyName: input.companyName,
      issueDate: input.issueDate,
      defaultRemarks: input.defaultRemarks,
      issuerBoxOffsetX: input.issuerBoxOffsetX,
      issuerBoxOffsetY: input.issuerBoxOffsetY,
      issuerBoxWidth: input.issuerBoxWidth,
      stampOffsetX: input.stampOffsetX,
      stampOffsetY: input.stampOffsetY,
      status: 'draft',
      createdAt: now,
      updatedAt: now
    };
    await writeLocalStore({
      ...store,
      projects: upsertById(store.projects, project)
    });
    return project;
  }
}

function generateCustomerId(
  projects: Array<Pick<ProjectIdentityRow, 'customerId' | 'companyName' | 'facilityName'>>,
  companyName: string,
  facilityName: string
): string {
  const normalizedCompanyName = companyName.trim();
  const normalizedFacilityName = facilityName.trim();

  if (!normalizedCompanyName) {
    throw new Error('会社名を入力してください。');
  }

  const normalizedProjects = projects.map((project) => ({
    customerId: String(project.customerId || '').trim(),
    companyName: String(project.companyName || '').trim(),
    facilityName: String(project.facilityName || '').trim()
  }));

  const parsedProjects = normalizedProjects
    .map((project) => {
      const match = project.customerId.match(/^(\d{2})(\d{2})(\d{3})$/);
      if (!match) return null;

      return {
        companyName: project.companyName,
        facilityName: project.facilityName,
        companyCode: Number(match[1]),
        facilityCode: Number(match[2]),
        userCode: Number(match[3])
      };
    })
    .filter((project): project is NonNullable<typeof project> => Boolean(project));

  const companyNames = Array.from(
    new Set(normalizedProjects.map((project) => project.companyName).filter(Boolean))
  );
  const sameCompanyProjects = parsedProjects.filter((project) => project.companyName === normalizedCompanyName);
  const usedCompanyCodes = new Set(parsedProjects.map((project) => project.companyCode));
  const companyCode =
    sameCompanyProjects[0]?.companyCode ??
    resolveOrdinalCode(companyNames, normalizedCompanyName, usedCompanyCodes, '会社コード');

  const facilityNamesForCompany = Array.from(
    new Set(
      normalizedProjects
        .filter((project) => project.companyName === normalizedCompanyName)
        .map((project) => project.facilityName)
        .filter(Boolean)
    )
  );
  const facilityCode =
    normalizedFacilityName === ''
      ? 0
      : sameCompanyProjects.find((project) => project.facilityName === normalizedFacilityName)?.facilityCode ??
        resolveOrdinalCode(
          facilityNamesForCompany,
          normalizedFacilityName,
          new Set(sameCompanyProjects.map((project) => project.facilityCode).filter((code) => code > 0)),
          '施設コード'
        );

  const sameGroupProjects = normalizedProjects.filter(
    (project) => project.companyName === normalizedCompanyName && project.facilityName === normalizedFacilityName
  );
  const sameGroupParsedProjects = parsedProjects.filter(
    (project) => project.companyName === normalizedCompanyName && project.facilityName === normalizedFacilityName
  );
  const userCode = nextAvailableCode(
    new Set(sameGroupParsedProjects.map((project) => project.userCode)),
    sameGroupProjects.length + 1,
    999,
    '利用者コード'
  );

  return `${padCode(companyCode, 2)}${padCode(facilityCode, 2)}${padCode(userCode, 3)}`;
}

function nextAvailableCode(usedCodes: Set<number>, start: number, max: number, label: string): number {
  for (let code = Math.max(1, start); code <= max; code += 1) {
    if (!usedCodes.has(code)) {
      return code;
    }
  }

  throw new Error(`${label}の採番上限に達しました。`);
}

function resolveOrdinalCode(
  existingNames: string[],
  targetName: string,
  usedCodes: Set<number>,
  label: string
): number {
  const ordinal = existingNames.indexOf(targetName) + 1;
  if (ordinal > 0) {
    if (ordinal > 99) {
      throw new Error(`${label}の採番上限に達しました。`);
    }
    return ordinal;
  }

  return nextAvailableCode(usedCodes, existingNames.length + 1, 99, label);
}

function padCode(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

export async function createServiceLine(input: CreateServiceLineInput): Promise<ServiceLine> {
  const now = new Date().toISOString();
  const reservationId = input.reservationId || `manual-${now.replace(/\D/g, '').slice(0, 14)}`;
  const project = await getProjectDetail(input.projectId);
  const customerId = project.project?.customerId || input.projectId;
  const id = stableId('line', customerId, reservationId);
  const sortKey = input.serviceDate ? Number(input.serviceDate.replace(/-/g, '')) : 0;
  const collectedAt =
    input.collectionStatus === 'collected' ? new Date().toISOString().slice(0, 10) : '';
  const receiptIssuedAt = input.collectionStatus === 'collected' ? collectedAt : '';

  try {
    const db = await getDb();
    const result = await db.query<ServiceLine>(insertServiceLineSql, [
      id,
      input.projectId,
      reservationId,
      input.serviceDate || '',
      input.serviceName,
      input.staffName,
      input.price,
      input.quantity,
      input.unit,
      input.taxIncluded,
      input.remarks,
      input.memo,
      input.visible,
      input.collectionStatus,
      collectedAt,
      receiptIssuedAt,
      '',
      sortKey,
      now,
      now
    ]);

    if (result.rows[0]) {
      await db.query(markProjectDraftSql, [input.projectId, now]);
    }

    return result.rows[0];
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const line: ServiceLine = {
      id,
      projectId: input.projectId,
      reservationId,
      serviceDate: input.serviceDate,
      serviceName: input.serviceName,
      staffName: input.staffName,
      price: input.price,
      quantity: input.quantity,
      unit: input.unit,
      taxIncluded: input.taxIncluded,
      extraCharges: [],
      remarks: input.remarks,
      memo: input.memo,
      visible: input.visible,
      collectionStatus: input.collectionStatus,
      collectedAt: collectedAt || null,
      receiptIssuedAt: receiptIssuedAt || null,
      invoiceCode: '',
      sortKey,
      createdAt: now,
      updatedAt: now
    };
    const store = await readLocalStore();
    await writeLocalStore({
      ...store,
      projects: markProjectDraftInStore(store.projects, input.projectId, now),
      serviceLines: upsertById(store.serviceLines, line),
      invoiceSelections: upsertSelection(store.invoiceSelections, {
        projectId: input.projectId,
        lineId: line.id,
        selectedForInvoice: false,
        selectionBatchKey: normalizeSelectionBatchKey(line.serviceDate) || '',
        updatedAt: now
      })
    });
    return line;
  }
}

export async function loadServiceLineIdentitiesForCustomers(
  customerIds: string[]
): Promise<Array<{ customerId: string; lineId: string; reservationId: string }>> {
  if (customerIds.length === 0) return [];

  try {
    const db = await getDb();
    const result = await db.query<{ customerId: string; lineId: string; reservationId: string }>(
      `
        select
          p.customer_id as "customerId",
          sl.id as "lineId",
          sl.reservation_id as "reservationId"
        from service_lines sl
        inner join projects p on p.id = sl.project_id
        where p.customer_id = any($1::text[])
      `,
      [customerIds]
    );
    return result.rows;
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    const projectById = new Map(store.projects.map((project) => [project.id, project]));
    return store.serviceLines
      .map((line) => {
        const project = projectById.get(line.projectId);
        if (!project || !customerIds.includes(project.customerId)) {
          return null;
        }
        return {
          customerId: project.customerId,
          lineId: line.id,
          reservationId: line.reservationId
        };
      })
      .filter((row): row is { customerId: string; lineId: string; reservationId: string } => Boolean(row));
  }
}

export async function duplicateServiceLine(input: DuplicateServiceLineInput): Promise<ServiceLine | null> {
  const detail = await getProjectDetail(input.projectId);
  const source = detail.serviceLines.find((line) => line.id === input.lineId);
  if (!source) {
    return null;
  }

  return createServiceLine({
    projectId: input.projectId,
    reservationId: `${source.reservationId}-copy-${Date.now()}`,
    serviceDate: source.serviceDate,
    serviceName: `${source.serviceName}（複製）`,
    staffName: source.staffName,
    price: source.price,
    quantity: source.quantity,
    unit: source.unit,
    taxIncluded: source.taxIncluded,
    remarks: source.remarks,
    memo: source.memo,
    visible: source.visible,
    collectionStatus: source.collectionStatus
  });
}

export async function deleteServiceLine(projectId: string, lineId: string): Promise<void> {
  const now = new Date().toISOString();

  try {
    const db = await getDb();
    await db.query(deleteServiceLineSql, [lineId, projectId]);
    await db.query(markProjectDraftSql, [projectId, now]);
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    await writeLocalStore({
      ...store,
      projects: markProjectDraftInStore(store.projects, projectId, now),
      serviceLines: store.serviceLines.filter(
        (line) => !(line.id === lineId && line.projectId === projectId)
      ),
      invoiceSelections: store.invoiceSelections.filter(
        (selection) => !(selection.projectId === projectId && selection.lineId === lineId)
      )
    });
  }
}

export async function clearWorkspaceProjectData(): Promise<void> {
  try {
    await withTransaction(async (db) => {
      await db.query('delete from invoice_selections');
      await db.query('delete from service_lines');
      await db.query('delete from projects');
      await db.query('delete from imports');
    });
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    await writeLocalStore({
      ...store,
      projects: [],
      serviceLines: [],
      invoiceSelections: []
    });
  }
}

export async function upsertProjectSnapshot(project: Project): Promise<Project> {
  try {
    const db = await getDb();
    await db.query(upsertProjectSql, [
      project.id,
      project.importId,
      project.customerId,
      project.customerName,
      project.subject,
      project.defaultInvoiceDateMode,
      project.invoiceRecipient,
      project.facilityName,
      project.companyName,
      project.issueDate || '',
      project.defaultRemarks,
      project.issuerBoxOffsetX,
      project.issuerBoxOffsetY,
      project.issuerBoxWidth,
      project.stampOffsetX,
      project.stampOffsetY,
      project.status,
      project.createdAt,
      project.updatedAt
    ]);
    return project;
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    await writeLocalStore({
      ...store,
      projects: upsertById(store.projects, project)
    });
    return project;
  }
}

function shouldUseLocalStore(error: unknown): boolean {
  const message = String(error || '');
  return (
    message.includes('PostgreSQL client is not ready') ||
    message.includes('DATABASE_URL is not configured') ||
    message.includes('ENOTFOUND') ||
    message.includes('ECONNREFUSED') ||
    message.includes('getaddrinfo')
  );
}

export async function loadSelectionsForCustomers(customerIds: string[]): Promise<InvoiceSelection[]> {
  if (customerIds.length === 0) return [];

  try {
    const db = await getDb();
    const result = await db.query<InvoiceSelection>(
      `
        select
          sel.project_id as "projectId",
          sel.line_id as "lineId",
          sel.selected_for_invoice as "selectedForInvoice",
          sel.selection_batch_key as "selectionBatchKey",
          sel.updated_at as "updatedAt"
        from invoice_selections sel
        inner join projects p on p.id = sel.project_id
        where p.customer_id = any($1::text[])
      `,
      [customerIds]
    );
    return result.rows;
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    const projectIds = new Set(
      store.projects
        .filter((project) => customerIds.includes(project.customerId))
        .map((project) => project.id)
    );
    return store.invoiceSelections.filter((selection) => projectIds.has(selection.projectId));
  }
}

function mergeImportedSelections(
  serviceLines: ServiceLine[],
  importedSelections: InvoiceSelection[],
  preservedSelections: InvoiceSelection[]
): InvoiceSelection[] {
  const linesById = new Map(serviceLines.map((line) => [line.id, line]));
  const preservedByLineId = new Map(preservedSelections.map((selection) => [selection.lineId, selection]));

  return importedSelections.map((selection) => {
    const preserved = preservedByLineId.get(selection.lineId);
    const line = linesById.get(selection.lineId);

    if (!preserved || !line) {
      return selection;
    }

    return {
      ...selection,
      selectedForInvoice:
        line.collectionStatus === 'uncollected' ? preserved.selectedForInvoice : false,
      selectionBatchKey:
        normalizeSelectionBatchKey(line.serviceDate) ||
        preserved.selectionBatchKey ||
        selection.selectionBatchKey,
      updatedAt: preserved.updatedAt
    };
  });
}

function markProjectDraftInStore(projects: Project[], projectId: string, updatedAt: string): Project[] {
  const project = projects.find((item) => item.id === projectId);
  if (!project) return projects;

  return upsertById(projects, {
    ...project,
    status: 'draft',
    updatedAt
  });
}

function buildOrderedLineIds(allLineIds: string[], preferredOrderIds?: string[]): string[] {
  const seen = new Set<string>();
  const orderedIds: string[] = [];

  for (const lineId of preferredOrderIds || []) {
    if (!lineId || seen.has(lineId) || !allLineIds.includes(lineId)) continue;
    seen.add(lineId);
    orderedIds.push(lineId);
  }

  for (const lineId of allLineIds) {
    if (seen.has(lineId)) continue;
    seen.add(lineId);
    orderedIds.push(lineId);
  }

  return orderedIds;
}
