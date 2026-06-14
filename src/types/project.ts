export type ProjectStatus = 'draft' | 'ready_for_export' | 'exported';

export interface Project {
  id: string;
  importId: string | null;
  customerId: string;
  customerName: string;
  invoiceRecipient: string;
  facilityName: string;
  companyName: string;
  issueDate: string | null;
  defaultRemarks: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary {
  id: string;
  customerId: string;
  customerName: string;
  invoiceRecipient: string;
  uncollectedCount: number;
  collectedCount: number;
  selectedCount: number;
  status: ProjectStatus;
  lastImportedAt: string | null;
}
