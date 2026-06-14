import type { InvoiceSelection, Project, ProjectSummary, ServiceLine } from '../../types';
import {
  buildProjectSummaries,
  normalizeSelectionBatchKey,
  readLocalStore,
  upsertById,
  upsertSelection,
  writeLocalStore
} from '../local-store';
import { getDb, withTransaction } from './client';
import {
  deleteServiceLineSql,
  insertExportJobSql,
  insertImportSql,
  insertProjectSql,
  insertServiceLineSql,
  markProjectExportedSql,
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
  invoiceRecipient: string;
  facilityName: string;
  companyName: string;
  issueDate: string | null;
  defaultRemarks: string;
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
}

export interface CreateProjectInput {
  customerId: string;
  customerName: string;
  invoiceRecipient: string;
  facilityName: string;
  companyName: string;
  issueDate: string | null;
  defaultRemarks: string;
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
      invoiceSelections: store.invoiceSelections.filter((selection) => selection.projectId === projectId)
    };
  }
}

export async function persistImportedBundle(input: PersistImportInput): Promise<PersistImportResult> {
  const importedCustomerIds = Array.from(new Set(input.projects.map((project) => project.customerId))).filter(
    Boolean
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

      if (importedCustomerIds.length > 0) {
        await deleteProjectsByCustomerIds(db, importedCustomerIds);
      }

      for (const project of input.projects) {
        await db.query(upsertProjectSql, [
          project.id,
          input.importId,
          project.customerId,
          project.customerName,
          project.invoiceRecipient,
          project.facilityName,
          project.companyName,
          project.issueDate || '',
          project.defaultRemarks,
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

      for (const selection of input.invoiceSelections) {
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
        selectionCount: input.invoiceSelections.length
      };
    });
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    const projectIdsToReplace = new Set(
      store.projects
        .filter((project) => importedCustomerIds.includes(project.customerId))
        .map((project) => project.id)
    );
    let projects = store.projects.filter((project) => !importedCustomerIds.includes(project.customerId));
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
    for (const selection of input.invoiceSelections) {
      invoiceSelections = upsertSelection(invoiceSelections, selection);
    }

    await writeLocalStore({ projects, serviceLines, invoiceSelections });

    return {
      importId: input.importId,
      projectCount: input.projects.length,
      lineCount: input.serviceLines.length,
      selectionCount: input.invoiceSelections.length
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

export async function updateProjectHeader(input: UpdateProjectHeaderInput): Promise<Project | null> {
  const now = new Date().toISOString();

  try {
    const db = await getDb();
    const result = await db.query<Project>(updateProjectHeaderSql, [
      input.projectId,
      input.customerName,
      input.invoiceRecipient,
      input.facilityName,
      input.companyName,
      input.issueDate || '',
      input.defaultRemarks,
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
      invoiceRecipient: input.invoiceRecipient,
      facilityName: input.facilityName,
      companyName: input.companyName,
      issueDate: input.issueDate,
      defaultRemarks: input.defaultRemarks,
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
  selectedLineIds: string[]
): Promise<{ projectId: string; selectedCount: number }> {
  const now = new Date().toISOString();

  try {
    return await withTransaction(async (db) => {
      await db.query(resetProjectSelectionsSql, [projectId, now]);

      for (const lineId of selectedLineIds) {
        await db.query(upsertInvoiceSelectionSql, [projectId, lineId, true, '', now]);
      }

      return {
        projectId,
        selectedCount: selectedLineIds.length
      };
    });
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    const lines = store.serviceLines.filter((line) => line.projectId === projectId);
    let invoiceSelections = store.invoiceSelections.filter((selection) => selection.projectId !== projectId);

    for (const line of lines) {
      invoiceSelections = upsertSelection(invoiceSelections, {
        projectId,
        lineId: line.id,
        selectedForInvoice: selectedLineIds.includes(line.id),
        selectionBatchKey: normalizeSelectionBatchKey(line.serviceDate) || '',
        updatedAt: now
      });
    }

    await writeLocalStore({
      ...store,
      invoiceSelections
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
      serviceLines: upsertById(store.serviceLines, nextLine)
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
    serviceLines: detail.serviceLines
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
    const db = await getDb();
    const result = await db.query<Project>(insertProjectSql, [
      id,
      input.customerId,
      input.customerName,
      input.invoiceRecipient,
      input.facilityName,
      input.companyName,
      input.issueDate || '',
      input.defaultRemarks,
      'draft',
      now,
      now
    ]);

    return result.rows[0];
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const project: Project = {
      id,
      importId: null,
      customerId: input.customerId,
      customerName: input.customerName,
      invoiceRecipient: input.invoiceRecipient,
      facilityName: input.facilityName,
      companyName: input.companyName,
      issueDate: input.issueDate,
      defaultRemarks: input.defaultRemarks,
      status: 'draft',
      createdAt: now,
      updatedAt: now
    };
    const store = await readLocalStore();
    await writeLocalStore({
      ...store,
      projects: upsertById(store.projects, project)
    });
    return project;
  }
}

export async function createServiceLine(input: CreateServiceLineInput): Promise<ServiceLine> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const reservationId = input.reservationId || `manual-${now.replace(/\D/g, '').slice(0, 14)}`;
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
  try {
    const db = await getDb();
    await db.query(deleteServiceLineSql, [lineId, projectId]);
  } catch (error) {
    if (!shouldUseLocalStore(error)) throw error;
    const store = await readLocalStore();
    await writeLocalStore({
      projects: store.projects,
      serviceLines: store.serviceLines.filter(
        (line) => !(line.id === lineId && line.projectId === projectId)
      ),
      invoiceSelections: store.invoiceSelections.filter(
        (selection) => !(selection.projectId === projectId && selection.lineId === lineId)
      )
    });
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
