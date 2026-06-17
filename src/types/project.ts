export type ProjectStatus = 'draft' | 'ready_for_export' | 'exported';
export type ProjectInvoiceDateMode = 'visit' | 'monthEnd' | 'custom';

export function getProjectInvoiceDateModeLabel(mode: ProjectInvoiceDateMode): string {
  switch (mode) {
    case 'visit':
      return '訪問日';
    case 'monthEnd':
      return '月末';
    case 'custom':
      return '日付指定';
    default:
      return mode;
  }
}

export function getProjectStatusLabel(status: ProjectStatus): string {
  switch (status) {
    case 'draft':
      return '下書き';
    case 'ready_for_export':
      return '書き出し前';
    case 'exported':
      return '書き出し済み';
    default:
      return status;
  }
}

export interface Project {
  id: string;
  importId: string | null;
  customerId: string;
  customerName: string;
  defaultInvoiceDateMode: ProjectInvoiceDateMode;
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
  companyName: string;
  uncollectedCount: number;
  collectedCount: number;
  selectedCount: number;
  status: ProjectStatus;
  lastImportedAt: string | null;
}
