'use client';

import type { CSSProperties, PointerEvent as ReactPointerEvent, SVGProps } from 'react';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  getProjectInvoiceDateModeLabel,
  getProjectStatusLabel,
  type InvoiceSelection,
  type Project,
  type ServiceLine
} from '../../../types';
import { InvoicePreview } from '../../../components/invoice/invoice-preview';
import type { SiteConfig } from '../../../types';
import {
  getInvoiceIssueDate,
  getInvoiceLines,
  getReceiptIssueDate
} from '../../../lib/invoice/preview';
import { getMonthKey } from '../../../lib/csv/shared';
import { useWorkbenchSidebar } from '../workbench-layout-shell';

interface ProjectEditorProps {
  config: SiteConfig;
  project: Project;
  serviceLines: ServiceLine[];
  invoiceSelections: InvoiceSelection[];
}

type ReorderTab = 'uncollected' | 'collected';
type InvoiceRecipientMode = 'customer' | 'company' | 'facility' | 'custom';
const DRAFT_LINE_ID_PREFIX = '__draft_line__';

const invoiceDateModeOptions: Array<{
  value: Project['defaultInvoiceDateMode'];
  label: string;
}> = [
    { value: 'visit', label: '訪問日' },
    { value: 'monthEnd', label: '月末' },
    { value: 'custom', label: '日付指定' }
  ];

function reorderIdsByPlacement(
  ids: string[],
  fromId: string,
  toId: string,
  placement: 'before' | 'after'
): string[] {
  if (!fromId || !toId || fromId === toId) return ids;
  const next = ids.filter((id) => id !== fromId);
  const targetIndex = next.indexOf(toId);
  if (targetIndex === -1) return ids;
  const insertIndex = placement === 'before' ? targetIndex : targetIndex + 1;
  next.splice(insertIndex, 0, fromId);
  return next;
}

function appendIdsPreservingCurrentOrder(
  currentIds: string[],
  idsToAdd: string[],
  displayOrderIds: string[]
): string[] {
  const currentSet = new Set(currentIds);
  const idsToAddSet = new Set(idsToAdd);
  const appendedIds = displayOrderIds.filter((id) => idsToAddSet.has(id) && !currentSet.has(id));
  return [...currentIds, ...appendedIds];
}

function getSelectionToggleStyle(isSelected: boolean): CSSProperties {
  return {
    marginTop: 8,
    width: 24,
    height: 24,
    borderRadius: 6,
    border: `2px solid ${isSelected ? '#2f80ed' : '#8b7a86'}`,
    background: isSelected ? '#2f80ed' : '#fff',
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1,
    flex: '0 0 auto',
    padding: 0,
    cursor: 'pointer'
  };
}

function orderLinesByIds(lines: ServiceLine[], orderIds: string[]): ServiceLine[] {
  const lineMap = new Map(lines.map((line) => [line.id, line]));
  const ordered = orderIds
    .map((id) => lineMap.get(id))
    .filter((line): line is ServiceLine => Boolean(line));
  const orderedIds = new Set(ordered.map((line) => line.id));
  const remaining = lines.filter((line) => !orderedIds.has(line.id));
  return [...ordered, ...remaining];
}

function buildUncollectedDisplayOrderIds(
  serviceLines: ServiceLine[],
  invoiceSelections: InvoiceSelection[]
): string[] {
  return buildGlobalDisplayOrderIds(serviceLines, invoiceSelections).filter((lineId) =>
    serviceLines.some((line) => line.id === lineId && line.collectionStatus === 'uncollected')
  );
}

function buildCollectedDisplayOrderIds(
  serviceLines: ServiceLine[],
  invoiceSelections: InvoiceSelection[]
): string[] {
  return buildGlobalDisplayOrderIds(serviceLines, invoiceSelections).filter((lineId) =>
    serviceLines.some((line) => line.id === lineId && line.collectionStatus === 'collected')
  );
}

function buildGlobalDisplayOrderIds(
  serviceLines: ServiceLine[],
  invoiceSelections: InvoiceSelection[]
): string[] {
  const orderedSelectionIds = [...invoiceSelections]
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.lineId.localeCompare(b.lineId, 'ja'))
    .map((item) => item.lineId);
  const allLineIds = serviceLines.map((line) => line.id);

  return [
    ...orderedSelectionIds.filter((lineId) => allLineIds.includes(lineId)),
    ...allLineIds.filter((lineId) => !orderedSelectionIds.includes(lineId))
  ];
}

function buildInvoiceRecipient(
  form: {
    customerName: string;
    companyName: string;
    facilityName: string;
    invoiceRecipient: string;
  },
  mode: InvoiceRecipientMode
): string {
  if (mode === 'customer') {
    return form.customerName.trim() ? `${form.customerName.trim()} 様` : '';
  }

  if (mode === 'company') {
    return form.companyName.trim() ? `${form.companyName.trim()} 御中` : '';
  }

  if (mode === 'facility') {
    return form.facilityName.trim() ? `${form.facilityName.trim()} 御中` : '';
  }

  return form.invoiceRecipient.trim();
}

function buildInvoiceRecipientOptions(form: {
  customerName: string;
  companyName: string;
  facilityName: string;
}): Array<{
  value: InvoiceRecipientMode;
  label: string;
}> {
  const options: Array<{
    value: InvoiceRecipientMode;
    label: string;
  }> = [];

  if (form.customerName.trim()) {
    options.push({ value: 'customer', label: `${form.customerName.trim()} 様` });
  }

  if (form.companyName.trim()) {
    options.push({ value: 'company', label: `${form.companyName.trim()} 御中` });
  }

  if (form.facilityName.trim()) {
    options.push({ value: 'facility', label: `${form.facilityName.trim()} 御中` });
  }

  options.push({ value: 'custom', label: 'その他' });

  return options;
}

function isDraftLineId(lineId: string): boolean {
  return lineId.startsWith(DRAFT_LINE_ID_PREFIX);
}

function inferInvoiceRecipientMode(form: {
  customerName: string;
  companyName: string;
  facilityName: string;
  invoiceRecipient: string;
}): InvoiceRecipientMode {
  if (form.customerName.trim() && form.invoiceRecipient.trim() === `${form.customerName.trim()} 様`) {
    return 'customer';
  }

  if (form.companyName.trim() && form.invoiceRecipient.trim() === `${form.companyName.trim()} 御中`) {
    return 'company';
  }

  if (form.facilityName.trim() && form.invoiceRecipient.trim() === `${form.facilityName.trim()} 御中`) {
    return 'facility';
  }

  return 'custom';
}

function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
      style={{ height: 36, width: 36, ...props.style }}
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function ProjectEditor({
  config,
  project,
  serviceLines,
  invoiceSelections
}: ProjectEditorProps) {
  const { setSidebarCollapsed } = useWorkbenchSidebar();
  const router = useRouter();
  const invoicePrintRef = useRef<HTMLDivElement | null>(null);
  const receiptPrintRef = useRef<HTMLDivElement | null>(null);
  const reorderCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragSessionRef = useRef<{ lineId: string; tab: ReorderTab } | null>(null);
  const [pending, startTransition] = useTransition();
  const [selectionSavePending, setSelectionSavePending] = useState(false);
  const [sheetSyncPending, setSheetSyncPending] = useState(false);
  const [showSheetSyncReminder, setShowSheetSyncReminder] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [draggingSelectedLineId, setDraggingSelectedLineId] = useState('');
  const [dragOverTarget, setDragOverTarget] = useState<{
    lineId: string;
    placement: 'before' | 'after';
  } | null>(null);
  const dragOverTargetRef = useRef<{
    lineId: string;
    placement: 'before' | 'after';
  } | null>(null);
  const [dragDebug, setDragDebug] = useState({
    phase: 'idle',
    sourceLineId: '',
    targetLineId: '',
    placement: ''
  });
  const [printRenderNonce, setPrintRenderNonce] = useState(0);
  const [activeTab, setActiveTab] = useState<'uncollected' | 'invoice' | 'collected' | 'receipt'>(
    'uncollected'
  );
  const [form, setForm] = useState({
    customerName: project.customerName,
    subject: project.subject,
    defaultInvoiceDateMode: project.defaultInvoiceDateMode,
    invoiceRecipient: project.invoiceRecipient,
    facilityName: project.facilityName,
    companyName: project.companyName,
    issueDate: project.issueDate || '',
    defaultRemarks: project.defaultRemarks,
    issuerBoxWidth: project.issuerBoxWidth || 0,
    issuerBoxOffsetX: project.issuerBoxOffsetX || 0,
    issuerBoxOffsetY: project.issuerBoxOffsetY || 0,
    stampOffsetX: project.stampOffsetX || 0,
    stampOffsetY: project.stampOffsetY || 0,
    status: project.status
  });
  const [savedHeader, setSavedHeader] = useState({
    customerName: project.customerName,
    subject: project.subject,
    defaultInvoiceDateMode: project.defaultInvoiceDateMode,
    invoiceRecipient: project.invoiceRecipient,
    facilityName: project.facilityName,
    companyName: project.companyName,
    issueDate: project.issueDate || '',
    defaultRemarks: project.defaultRemarks,
    issuerBoxWidth: project.issuerBoxWidth || 0,
    issuerBoxOffsetX: project.issuerBoxOffsetX || 0,
    issuerBoxOffsetY: project.issuerBoxOffsetY || 0,
    stampOffsetX: project.stampOffsetX || 0,
    stampOffsetY: project.stampOffsetY || 0,
    status: project.status
  });
  const [sheetSyncStatus, setSheetSyncStatus] = useState(project.status);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>(
    invoiceSelections
      .filter(
        (item) =>
          item.selectedForInvoice &&
          serviceLines.some((line) => line.id === item.lineId && line.collectionStatus === 'uncollected')
      )
      .map((item) => item.lineId)
  );
  const [displayOrderIds, setDisplayOrderIds] = useState<string[]>(
    buildGlobalDisplayOrderIds(serviceLines, invoiceSelections)
  );
  const [selectedReceiptLineIds, setSelectedReceiptLineIds] = useState<string[]>(() => {
    const collectedIds = buildCollectedDisplayOrderIds(serviceLines, invoiceSelections);
    return collectedIds.length === 1 ? collectedIds : [];
  });
  const [editingLineId, setEditingLineId] = useState<string>(
    serviceLines.length === 1 ? serviceLines[0]?.id || '' : ''
  );
  const [lineEditorDialogOpen, setLineEditorDialogOpen] = useState(false);
  const [userInfoDialogOpen, setUserInfoDialogOpen] = useState(false);
  const [invoiceRecipientMode, setInvoiceRecipientMode] = useState<InvoiceRecipientMode>(() =>
    inferInvoiceRecipientMode({
      customerName: project.customerName,
      companyName: project.companyName,
      facilityName: project.facilityName,
      invoiceRecipient: project.invoiceRecipient
    })
  );
  const [editingLineOverride, setEditingLineOverride] = useState<ServiceLine | null>(null);
  const editingLine = useMemo(
    () =>
      serviceLines.find((line) => line.id === editingLineId) ||
      (editingLineOverride?.id === editingLineId ? editingLineOverride : null) ||
      (serviceLines.length === 1 ? serviceLines[0] || null : null),
    [editingLineId, editingLineOverride, serviceLines]
  );
  const [lineForm, setLineForm] = useState(() =>
    editingLine
      ? {
        serviceDate: editingLine.serviceDate || '',
        serviceName: editingLine.serviceName,
        staffName: editingLine.staffName,
        price: String(editingLine.price),
        quantity: String(editingLine.quantity),
        unit: editingLine.unit,
        taxIncluded: editingLine.taxIncluded,
        remarks: editingLine.remarks,
        memo: editingLine.memo,
        visible: editingLine.visible,
        collectionStatus: editingLine.collectionStatus,
        collectedAt: editingLine.collectedAt || '',
        receiptIssuedAt: editingLine.receiptIssuedAt || ''
      }
      : null
  );
  const invoiceRecipientOptions = buildInvoiceRecipientOptions(form);
  const isHeaderDirty =
    form.customerName !== savedHeader.customerName ||
    form.subject !== savedHeader.subject ||
    form.defaultInvoiceDateMode !== savedHeader.defaultInvoiceDateMode ||
    form.invoiceRecipient !== savedHeader.invoiceRecipient ||
    form.facilityName !== savedHeader.facilityName ||
    form.companyName !== savedHeader.companyName ||
    form.issueDate !== savedHeader.issueDate ||
    form.defaultRemarks !== savedHeader.defaultRemarks ||
    form.issuerBoxWidth !== savedHeader.issuerBoxWidth ||
    form.issuerBoxOffsetX !== savedHeader.issuerBoxOffsetX ||
    form.issuerBoxOffsetY !== savedHeader.issuerBoxOffsetY ||
    form.stampOffsetX !== savedHeader.stampOffsetX ||
    form.stampOffsetY !== savedHeader.stampOffsetY ||
    form.status !== savedHeader.status;
  const isLineDirty =
    !!editingLine &&
    !!lineForm &&
    (lineForm.serviceDate !== (editingLine.serviceDate || '') ||
      lineForm.serviceName !== editingLine.serviceName ||
      lineForm.staffName !== editingLine.staffName ||
      lineForm.price !== String(editingLine.price) ||
      lineForm.quantity !== String(editingLine.quantity) ||
      lineForm.unit !== editingLine.unit ||
      lineForm.taxIncluded !== editingLine.taxIncluded ||
      lineForm.remarks !== editingLine.remarks ||
      lineForm.memo !== editingLine.memo ||
      lineForm.visible !== editingLine.visible ||
      lineForm.collectionStatus !== editingLine.collectionStatus ||
      lineForm.collectedAt !== (editingLine.collectedAt || '') ||
      lineForm.receiptIssuedAt !== (editingLine.receiptIssuedAt || ''));
  const isPreviewApplied = !pending && !isLineDirty;

  const uncollectedLines = useMemo(
    () => serviceLines.filter((line) => line.collectionStatus === 'uncollected'),
    [serviceLines]
  );
  const collectedLines = useMemo(
    () => serviceLines.filter((line) => line.collectionStatus === 'collected'),
    [serviceLines]
  );
  const invoiceLines = useMemo(
    () => getInvoiceLines(serviceLines, selectedLineIds),
    [serviceLines, selectedLineIds]
  );
  const orderedUncollectedLines = useMemo(() => {
    return orderLinesByIds(uncollectedLines, displayOrderIds);
  }, [uncollectedLines, displayOrderIds]);
  const orderedCollectedLines = useMemo(() => {
    return orderLinesByIds(collectedLines, displayOrderIds);
  }, [collectedLines, displayOrderIds]);
  const filteredSelectedLineIds = useMemo(() => {
    const uncollectedIds = new Set(uncollectedLines.map((line) => line.id));
    return selectedLineIds.filter((id) => uncollectedIds.has(id));
  }, [selectedLineIds, uncollectedLines]);
  const filteredSelectedReceiptLineIds = useMemo(() => {
    const collectedIds = new Set(collectedLines.map((line) => line.id));
    return selectedReceiptLineIds.filter((id) => collectedIds.has(id));
  }, [selectedReceiptLineIds, collectedLines]);
  const selectedUncollectedLines = useMemo(() => {
    const selectedIds = new Set(filteredSelectedLineIds);
    return orderedUncollectedLines.filter((line) => selectedIds.has(line.id));
  }, [filteredSelectedLineIds, orderedUncollectedLines]);
  const selectedCollectedLines = useMemo(() => {
    const selectedIds = new Set(filteredSelectedReceiptLineIds);
    return orderedCollectedLines.filter((line) => selectedIds.has(line.id));
  }, [orderedCollectedLines, filteredSelectedReceiptLineIds]);
  const editableLines = useMemo(() => {
    if (activeTab === 'uncollected') {
      return filteredSelectedLineIds.length > 0 ? selectedUncollectedLines : orderedUncollectedLines;
    }
    if (activeTab === 'collected') {
      return filteredSelectedReceiptLineIds.length > 0 ? selectedCollectedLines : orderedCollectedLines;
    }
    return serviceLines;
  }, [
    activeTab,
    filteredSelectedLineIds.length,
    filteredSelectedReceiptLineIds.length,
    orderedCollectedLines,
    orderedUncollectedLines,
    selectedCollectedLines,
    selectedUncollectedLines,
    serviceLines
  ]);
  const receiptLines = useMemo(() => selectedCollectedLines, [selectedCollectedLines]);
  const receiptContextLines = useMemo(() => {
    if (receiptLines.length > 0) {
      return receiptLines;
    }
    return collectedLines;
  }, [collectedLines, receiptLines]);
  const previewProject = useMemo(
    () => ({
      ...project,
      customerName: form.customerName,
      subject: form.subject,
      defaultInvoiceDateMode: form.defaultInvoiceDateMode,
      invoiceRecipient: form.invoiceRecipient,
      facilityName: form.facilityName,
      companyName: form.companyName,
      issueDate: form.issueDate || null,
      defaultRemarks: form.defaultRemarks,
      issuerBoxWidth: form.issuerBoxWidth,
      issuerBoxOffsetX: form.issuerBoxOffsetX,
      issuerBoxOffsetY: form.issuerBoxOffsetY,
      stampOffsetX: form.stampOffsetX,
      stampOffsetY: form.stampOffsetY,
      status: form.status
    }),
    [form, project]
  );
  const selectedPreviewIssueDate = useMemo(
    () => getInvoiceIssueDate(previewProject, invoiceLines) || '',
    [invoiceLines, previewProject]
  );
  const resolvedIssueDate = useMemo(
    () => getInvoiceIssueDate(previewProject, serviceLines) || '',
    [previewProject, serviceLines]
  );
  const displayedIssueDate =
    form.defaultInvoiceDateMode === 'custom'
      ? form.issueDate
      : selectedPreviewIssueDate || resolvedIssueDate;
  const isReceiptContext = activeTab === 'collected' || activeTab === 'receipt';
  const resolvedReceiptDate = useMemo(
    () => getReceiptIssueDate(previewProject, receiptContextLines) || '',
    [previewProject, receiptContextLines]
  );
  const [receiptDate, setReceiptDate] = useState(resolvedReceiptDate);
  const [savedReceiptDate, setSavedReceiptDate] = useState(resolvedReceiptDate);
  const isReceiptDateDirty = receiptDate !== savedReceiptDate;
  const needsInitialSheetSync = sheetSyncStatus !== 'exported';
  const canSyncToSheet = isHeaderDirty || isReceiptDateDirty || needsInitialSheetSync;
  const isSheetSyncComplete = !sheetSyncPending && !canSyncToSheet;
  const sheetSyncButtonStyle =
    isSheetSyncComplete
      ? 'done'
      : isHeaderDirty || isReceiptDateDirty || showSheetSyncReminder
        ? 'primary'
        : 'secondary';
  const previewReceiptLines = useMemo(
    () =>
      receiptLines.map((line) => ({
        ...line,
        receiptIssuedAt: receiptDate || line.receiptIssuedAt || line.collectedAt
      })),
    [receiptDate, receiptLines]
  );
  const monthGroups = useMemo(() => {
    const map = new Map<string, ServiceLine[]>();
    uncollectedLines.forEach((line) => {
      const key = getMonthKey(line.serviceDate);
      if (!key) return;
      const current = map.get(key) || [];
      current.push(line);
      map.set(key, current);
    });
    return limitMonthGroups(Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0], 'ja')));
  }, [uncollectedLines]);
  const collectedMonthGroups = useMemo(() => {
    const map = new Map<string, ServiceLine[]>();
    collectedLines.forEach((line) => {
      const key = getMonthKey(line.serviceDate);
      if (!key) return;
      const current = map.get(key) || [];
      current.push(line);
      map.set(key, current);
    });
    return limitMonthGroups(Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0], 'ja')));
  }, [collectedLines]);

  useEffect(() => {
    setSidebarCollapsed(activeTab === 'invoice');
    return () => setSidebarCollapsed(false);
  }, [activeTab, setSidebarCollapsed]);

  useEffect(() => {
    dragOverTargetRef.current = dragOverTarget;
  }, [dragOverTarget]);

  useEffect(() => {
    const nextHeader = {
      customerName: project.customerName,
      subject: project.subject,
      defaultInvoiceDateMode: project.defaultInvoiceDateMode,
      invoiceRecipient: project.invoiceRecipient,
      facilityName: project.facilityName,
      companyName: project.companyName,
      issueDate: project.issueDate || '',
      defaultRemarks: project.defaultRemarks,
      issuerBoxWidth: project.issuerBoxWidth || 0,
      issuerBoxOffsetX: project.issuerBoxOffsetX || 0,
      issuerBoxOffsetY: project.issuerBoxOffsetY || 0,
      stampOffsetX: project.stampOffsetX || 0,
      stampOffsetY: project.stampOffsetY || 0,
      status: project.status
    };
    setForm(nextHeader);
    setSavedHeader(nextHeader);
    setSheetSyncStatus(project.status);
    setInvoiceRecipientMode(
      inferInvoiceRecipientMode({
        customerName: project.customerName,
        companyName: project.companyName,
        facilityName: project.facilityName,
        invoiceRecipient: project.invoiceRecipient
      })
    );
  }, [project]);

  useEffect(() => {
    if (invoiceRecipientOptions.some((option) => option.value === invoiceRecipientMode)) {
      return;
    }

    setInvoiceRecipientMode(invoiceRecipientOptions[0]?.value || 'custom');
  }, [invoiceRecipientMode, invoiceRecipientOptions]);

  useEffect(() => {
    setReceiptDate(resolvedReceiptDate);
    setSavedReceiptDate(resolvedReceiptDate);
  }, [resolvedReceiptDate]);

  useEffect(() => {
    const currentEditingLine = editingLineId
      ? serviceLines.find((line) => line.id === editingLineId) || null
      : null;

    if (editableLines.length === 0) {
      if ((editingLineOverride && lineForm) || (lineEditorDialogOpen && currentEditingLine)) {
        return;
      }
      setEditingLineId('');
      setLineForm(null);
      setLineEditorDialogOpen(false);
      setEditingLineOverride(null);
      return;
    }

    if (editingLineId && editableLines.some((line) => line.id === editingLineId)) {
      return;
    }

    if (lineEditorDialogOpen && currentEditingLine) {
      if (!lineForm) {
        syncLineForm(currentEditingLine.id);
      }
      return;
    }

    if (editingLineOverride?.id === editingLineId && lineForm) {
      return;
    }

    if (editableLines.length === 1) {
      syncLineForm(editableLines[0].id);
      return;
    }

    setEditingLineId('');
    setLineForm(null);
  }, [activeTab, editableLines, editingLineId, editingLineOverride, lineEditorDialogOpen, lineForm, serviceLines]);

  useEffect(() => {
    if (editingLineOverride && serviceLines.some((line) => line.id === editingLineOverride.id)) {
      setEditingLineOverride(null);
    }
  }, [editingLineOverride, serviceLines]);

  useEffect(() => {
    function handleOpenUserInfoDialog() {
      setUserInfoDialogOpen(true);
    }

    window.addEventListener('open-user-info-dialog', handleOpenUserInfoDialog);
    return () => window.removeEventListener('open-user-info-dialog', handleOpenUserInfoDialog);
  }, []);

  useEffect(() => {
    if (!userInfoDialogOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setUserInfoDialogOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [userInfoDialogOpen]);

  useEffect(() => {
    const serviceLineIds = new Set(serviceLines.map((line) => line.id));
    const nextSelectedLineIds = invoiceSelections
      .filter(
        (item) =>
          item.selectedForInvoice &&
          serviceLineIds.has(item.lineId) &&
          serviceLines.some((line) => line.id === item.lineId && line.collectionStatus === 'uncollected')
      )
      .map((item) => item.lineId);

    setSelectedLineIds(nextSelectedLineIds);
    setDisplayOrderIds(buildGlobalDisplayOrderIds(serviceLines, invoiceSelections));

    const collectedIds = serviceLines
      .filter((line) => line.collectionStatus === 'collected')
      .map((line) => line.id);
    setSelectedReceiptLineIds((current) => {
      const nextCollectedOrderIds = buildCollectedDisplayOrderIds(serviceLines, invoiceSelections);
      const preservedIds = nextCollectedOrderIds.filter((id) => current.includes(id));
      if (preservedIds.length > 0) {
        return preservedIds;
      }
      if (current.length === 0 && collectedIds.length === 1) {
        return collectedIds;
      }
      return [];
    });

    if (lineEditorDialogOpen && lineForm) {
      return;
    }

    const nextEditingLineId =
      editingLineId && serviceLineIds.has(editingLineId)
        ? editingLineId
        : serviceLines.length === 1
          ? serviceLines[0]?.id || ''
          : '';
    setEditingLineId(nextEditingLineId);

    const nextEditingLine =
      serviceLines.find((line) => line.id === nextEditingLineId) ||
      (serviceLines.length === 1 ? serviceLines[0] || null : null);
    setLineForm(
      nextEditingLine
        ? {
          serviceDate: nextEditingLine.serviceDate || '',
          serviceName: nextEditingLine.serviceName,
          staffName: nextEditingLine.staffName,
          price: String(nextEditingLine.price),
          quantity: String(nextEditingLine.quantity),
          unit: nextEditingLine.unit,
          taxIncluded: nextEditingLine.taxIncluded,
          remarks: nextEditingLine.remarks,
          memo: nextEditingLine.memo,
          visible: nextEditingLine.visible,
          collectionStatus: nextEditingLine.collectionStatus,
          collectedAt: nextEditingLine.collectedAt || '',
          receiptIssuedAt: nextEditingLine.receiptIssuedAt || ''
        }
        : null
    );
  }, [editingLineId, invoiceSelections, lineEditorDialogOpen, serviceLines]);

  function syncLineForm(lineId: string) {
    const line = serviceLines.find((item) => item.id === lineId);
    setEditingLineOverride(null);
    setEditingLineId(lineId);
    setLineForm(
      line
        ? {
          serviceDate: line.serviceDate || '',
          serviceName: line.serviceName,
          staffName: line.staffName,
          price: String(line.price),
          quantity: String(line.quantity),
          unit: line.unit,
          taxIncluded: line.taxIncluded,
          remarks: line.remarks,
          memo: line.memo,
          visible: line.visible,
          collectionStatus: line.collectionStatus,
          collectedAt: line.collectedAt || '',
          receiptIssuedAt: line.receiptIssuedAt || ''
        }
        : null
    );
  }

  function openLineEditorDialog(lineId: string) {
    syncLineForm(lineId);
    setLineEditorDialogOpen(true);
  }

  function formatEditingLineLabel(line: ServiceLine): string {
    return `${line.serviceDate || '日付未設定'} / ${line.serviceName}`;
  }

  function renderUserInfoFields() {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        {/* <div className="note" style={{ margin: 0 }}>
          利用者IDは登録時に自動採番されます。形式: 会社2桁 / 施設2桁 / 利用者3桁
        </div> */}
        <label style={{ fontSize: 12, color: '#666' }}>氏名</label>
        <input
          placeholder="利用者名"
          value={form.customerName}
          onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))}
          style={inputStyle}
        />
        <label style={{ fontSize: 12, color: '#666' }}>請求日タイプ</label>
        <div className="choice-chip-row" role="group" aria-label="請求日タイプ">
          {invoiceDateModeOptions.map((option) => {
            const active = form.defaultInvoiceDateMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`choice-chip ${active ? 'active' : ''}`}
                aria-pressed={active}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    defaultInvoiceDateMode: option.value
                  }))
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <label style={{ fontSize: 12, color: '#666' }}>会社名</label>
        <input
          placeholder="会社名を入力してください"
          value={form.companyName}
          onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
          style={inputStyle}
        />
        <label style={{ fontSize: 12, color: '#666' }}>施設名</label>
        <input
          placeholder="空欄可"
          value={form.facilityName}
          onChange={(event) => setForm((current) => ({ ...current, facilityName: event.target.value }))}
          style={inputStyle}
        />
        <label style={{ fontSize: 12, color: '#666' }}>請求先宛先</label>
        <div className="choice-chip-row" role="group" aria-label="請求先宛先">
          {invoiceRecipientOptions.map((option) => {
            const active = invoiceRecipientMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={`choice-chip ${active ? 'active' : ''}`}
                aria-pressed={active}
                onClick={() => {
                  setInvoiceRecipientMode(option.value);
                  if (option.value !== 'custom') {
                    setForm((current) => ({
                      ...current,
                      invoiceRecipient: buildInvoiceRecipient(current, option.value)
                    }));
                  }
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {invoiceRecipientMode === 'custom' ? (
          <input
            placeholder="請求先"
            value={form.invoiceRecipient}
            onChange={(event) =>
              setForm((current) => ({ ...current, invoiceRecipient: event.target.value }))
            }
            style={inputStyle}
          />
        ) : null}
        <label style={{ fontSize: 12, color: '#666' }}>件名・・・</label>
        <input
          placeholder="件名"
          value={form.subject}
          onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
          style={inputStyle}
        />
        <label style={{ fontSize: 12, color: '#666' }}>備考</label>
        <textarea
          placeholder="備考"
          value={form.defaultRemarks}
          onChange={(event) =>
            setForm((current) => ({ ...current, defaultRemarks: event.target.value }))
          }
        />
      </div>
    );
  }

  async function saveHeader(options?: { silent?: boolean }): Promise<boolean> {
    setMessage('');
    setError('');

    const response = await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...form,
        issueDate: form.defaultInvoiceDateMode === 'custom' ? form.issueDate || null : resolvedIssueDate || null
      })
    });

    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(data.message || '案件ヘッダを保存できませんでした。');
      return false;
    }

    if (!options?.silent) {
      setMessage('案件ヘッダを保存しました。');
    }
    setSavedHeader({
      customerName: form.customerName,
      subject: form.subject,
      defaultInvoiceDateMode: form.defaultInvoiceDateMode,
      invoiceRecipient: form.invoiceRecipient,
      facilityName: form.facilityName,
      companyName: form.companyName,
      issueDate: form.defaultInvoiceDateMode === 'custom' ? form.issueDate : resolvedIssueDate,
      defaultRemarks: form.defaultRemarks,
      issuerBoxWidth: form.issuerBoxWidth,
      issuerBoxOffsetX: form.issuerBoxOffsetX,
      issuerBoxOffsetY: form.issuerBoxOffsetY,
      stampOffsetX: form.stampOffsetX,
      stampOffsetY: form.stampOffsetY,
      status: form.status
    });
    setSheetSyncStatus(form.status);
    if (!options?.silent) {
      startTransition(() => router.refresh());
    }
    return true;
  }

  async function saveReceiptDate(options?: { silent?: boolean }): Promise<boolean> {
    if (!isReceiptContext || receiptContextLines.length === 0 || !isReceiptDateDirty) {
      return true;
    }

    if (!receiptDate) {
      setError('領収日を入力してください。');
      return false;
    }

    const responses = await Promise.all(
      receiptContextLines.map((line) =>
        fetch(`/api/projects/${project.id}/lines/${line.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            serviceDate: line.serviceDate || null,
            serviceName: line.serviceName,
            staffName: line.staffName,
            price: line.price,
            quantity: line.quantity,
            unit: line.unit,
            taxIncluded: line.taxIncluded,
            remarks: line.remarks,
            memo: line.memo,
            visible: line.visible,
            collectionStatus: line.collectionStatus,
            collectedAt: line.collectedAt || receiptDate,
            receiptIssuedAt: receiptDate
          })
        })
      )
    );

    const failed = responses.find((response) => !response.ok);
    if (failed) {
      const data = (await failed.json().catch(() => ({}))) as { message?: string };
      setError(data.message || '領収日を保存できませんでした。');
      return false;
    }

    setSavedReceiptDate(receiptDate);
    if (!options?.silent) {
      setShowSheetSyncReminder(true);
      setMessage('領収日を更新しました。');
      startTransition(() => router.refresh());
    }
    return true;
  }

  async function saveSelections(options?: {
    selectedIds?: string[];
    orderedIds?: string[];
    silent?: boolean;
    refresh?: boolean;
  }): Promise<boolean> {
    setMessage('');
    setError('');
    setSelectionSavePending(true);

    try {
      const idsToSave = (options?.selectedIds || filteredSelectedLineIds).filter((id) =>
        uncollectedLines.some((line) => line.id === id)
      );
      const orderedIdsToSave = options?.orderedIds || displayOrderIds;
      const response = await fetch(`/api/projects/${project.id}/selections`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ selectedLineIds: idsToSave, orderedLineIds: orderedIdsToSave })
      });

      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(data.message || '請求対象の保存に失敗しました。');
        return false;
      }

      if (!options?.silent) {
        setMessage('請求対象の選択を保存しました。');
      }
      if (options?.refresh !== false) {
        startTransition(() => router.refresh());
      }
      return true;
    } finally {
      setSelectionSavePending(false);
    }
  }

  async function saveLine(): Promise<boolean> {
    if (!editingLine || !lineForm) return false;
    setMessage('');
    setError('');

    if (!lineForm.serviceName.trim()) {
      setError('サービス名を入力してください。');
      return false;
    }
    if (Number(lineForm.price || 0) < 0) {
      setError('単価は 0 以上で入力してください。');
      return false;
    }
    if (Number(lineForm.quantity || 0) <= 0) {
      setError('数量は 0 より大きい値を入力してください。');
      return false;
    }
    if (!lineForm.unit.trim()) {
      setError('単位を入力してください。');
      return false;
    }

    const payload = {
      serviceDate: lineForm.serviceDate || null,
      serviceName: lineForm.serviceName,
      staffName: lineForm.staffName,
      price: Number(lineForm.price || 0),
      quantity: Number(lineForm.quantity || 1),
      unit: lineForm.unit,
      taxIncluded: lineForm.taxIncluded,
      remarks: lineForm.remarks,
      memo: lineForm.memo,
      visible: lineForm.visible,
      collectionStatus: lineForm.collectionStatus,
      collectedAt: lineForm.collectionStatus === 'collected' ? lineForm.collectedAt || null : null,
      receiptIssuedAt:
        lineForm.collectionStatus === 'collected' ? lineForm.receiptIssuedAt || null : null
    };

    const isDraftLine = isDraftLineId(editingLine.id);
    const response = await fetch(
      isDraftLine ? `/api/projects/${project.id}/lines` : `/api/projects/${project.id}/lines/${editingLine.id}`,
      {
        method: isDraftLine ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    const data = (await response.json()) as { message?: string; line?: ServiceLine };
    if (!response.ok) {
      setError(data.message || '明細を保存できませんでした。');
      return false;
    }

    if (data.line?.id) {
      setEditingLineOverride(data.line);
      setEditingLineId(data.line.id);
      setLineForm({
        serviceDate: data.line.serviceDate || '',
        serviceName: data.line.serviceName,
        staffName: data.line.staffName,
        price: String(data.line.price),
        quantity: String(data.line.quantity),
        unit: data.line.unit,
        taxIncluded: data.line.taxIncluded,
        remarks: data.line.remarks,
        memo: data.line.memo,
        visible: data.line.visible,
        collectionStatus: data.line.collectionStatus,
        collectedAt: data.line.collectedAt || '',
        receiptIssuedAt: data.line.receiptIssuedAt || ''
      });
    }
    const synced = await syncProjectToSheet({
      successMessage: 'プレビューに反映し、Google Sheets に保存しました。',
      failureMessage: 'プレビューには反映しましたが、Google Sheets への保存に失敗しました。'
    });
    if (!synced) {
      setShowSheetSyncReminder(true);
      startTransition(() => router.refresh());
      return false;
    }
    return true;
  }

  async function duplicateCurrentLine(): Promise<boolean> {
    if (!editingLine) return false;
    setMessage('');
    setError('');

    if (isDraftLineId(editingLine.id)) {
      setError('新規明細は保存してから複製してください。');
      return false;
    }

    const response = await fetch(`/api/projects/${project.id}/lines/${editingLine.id}`, {
      method: 'POST'
    });
    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(data.message || '明細を複製できませんでした。');
      return false;
    }
    const synced = await syncProjectToSheet({
      successMessage: '明細を複製し、Google Sheets に保存しました。',
      failureMessage: '明細は複製しましたが、Google Sheets への保存に失敗しました。'
    });
    if (!synced) {
      setShowSheetSyncReminder(true);
      startTransition(() => router.refresh());
      return false;
    }
    return true;
  }

  async function deleteCurrentLine() {
    if (!editingLine) return;
    setMessage('');
    setError('');

    const ok = window.confirm('この明細を削除しますか？');
    if (!ok) return;

    if (isDraftLineId(editingLine.id)) {
      setEditingLineOverride(null);
      setEditingLineId('');
      setLineForm(null);
      setLineEditorDialogOpen(false);
      setMessage('新規明細の入力を取り消しました。');
      return;
    }

    const response = await fetch(`/api/projects/${project.id}/lines/${editingLine.id}`, {
      method: 'DELETE'
    });
    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(data.message || '明細を削除できませんでした。');
      return;
    }
    const synced = await syncProjectToSheet({
      successMessage: '明細を削除し、Google Sheets に保存しました。',
      failureMessage: '明細は削除しましたが、Google Sheets への保存に失敗しました。'
    });
    if (!synced) {
      setShowSheetSyncReminder(true);
      startTransition(() => router.refresh());
    }
  }

  async function toggleCollected(line: ServiceLine) {
    setMessage('');
    setError('');
    const nextStatus = line.collectionStatus === 'collected' ? 'uncollected' : 'collected';
    const selectionSaved = await saveSelections({
      selectedIds: selectedLineIds,
      orderedIds: displayOrderIds,
      silent: true,
      refresh: false
    });
    if (!selectionSaved) {
      return;
    }

    const response = await fetch(`/api/projects/${project.id}/lines/${line.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        serviceDate: line.serviceDate,
        serviceName: line.serviceName,
        staffName: line.staffName,
        price: line.price,
        quantity: line.quantity,
        unit: line.unit,
        taxIncluded: line.taxIncluded,
        remarks: line.remarks,
        memo: line.memo,
        visible: line.visible,
        collectionStatus: nextStatus,
        collectedAt: nextStatus === 'collected' ? line.collectedAt : null,
        receiptIssuedAt: nextStatus === 'collected' ? line.receiptIssuedAt : null
      })
    });

    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(data.message || '回収状態を更新できませんでした。');
      return;
    }

    setMessage(nextStatus === 'collected' ? '回収済に更新しました。' : '未回収へ戻しました。');
    startTransition(() => router.refresh());
  }

  function downloadProjectCsv() {
    window.location.href = `/api/projects/${project.id}/export`;
    setMessage('CSV 書き出しを開始しました。');
    setError('');
  }

  async function syncProjectToSheet(options?: {
    selectedIds?: string[];
    orderedIds?: string[];
    successMessage?: string;
    failureMessage?: string;
  }): Promise<boolean> {
    setMessage('');
    setError('');
    setSheetSyncPending(true);

    try {
      const selectionSaved = await saveSelections({
        selectedIds: options?.selectedIds || selectedLineIds,
        orderedIds: options?.orderedIds || displayOrderIds,
        silent: true,
        refresh: false
      });
      if (!selectionSaved) {
        return false;
      }

      const headerSaved = await saveHeader({ silent: true });
      if (!headerSaved) {
        return false;
      }

      const receiptDateSaved = await saveReceiptDate({ silent: true });
      if (!receiptDateSaved) {
        return false;
      }

      const response = await fetch(`/api/projects/${project.id}/sync-sheet`, {
        method: 'POST'
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(options?.failureMessage || data.message || 'Google Sheets へ保存できませんでした。');
        return false;
      }

      setSavedHeader((current) => ({ ...current, status: form.status }));
      setSheetSyncStatus('exported');
      setSavedReceiptDate(receiptDate);
      setShowSheetSyncReminder(false);
      setMessage(options?.successMessage || data.message || 'Google Sheets に保存しました。');
      startTransition(() => router.refresh());
      return true;
    } finally {
      setSheetSyncPending(false);
    }
  }

  function toggleLine(lineId: string) {
    setSelectedLineIds((current) =>
      current.includes(lineId)
        ? current.filter((id) => id !== lineId)
        : appendIdsPreservingCurrentOrder(current, [lineId], displayOrderIds)
    );
  }

  async function moveSelectedLineByPlacement(
    fromId: string,
    toId: string,
    placement: 'before' | 'after'
  ) {
    const nextDisplayOrderIds = reorderIdsByPlacement(displayOrderIds, fromId, toId, placement);
    const nextSelectedLineIds = reorderIdsByPlacement(selectedLineIds, fromId, toId, placement);

    setDisplayOrderIds(nextDisplayOrderIds);
    setSelectedLineIds(nextSelectedLineIds);

    await syncProjectToSheet({
      selectedIds: nextSelectedLineIds,
      orderedIds: nextDisplayOrderIds,
      successMessage: '並び順を Google Sheets に保存しました。'
    });
  }

  function toggleMonthSelection(monthKey: string) {
    const monthLineIds = uncollectedLines
      .filter((line) => getMonthKey(line.serviceDate) === monthKey)
      .map((line) => line.id);

    setSelectedLineIds((current) => {
      const allSelected = monthLineIds.every((id) => current.includes(id));
      if (allSelected) {
        return current.filter((id) => !monthLineIds.includes(id));
      }
      return appendIdsPreservingCurrentOrder(current, monthLineIds, displayOrderIds);
    });
  }

  function toggleReceiptLine(lineId: string) {
    setSelectedReceiptLineIds((current) =>
      current.includes(lineId)
        ? current.filter((id) => id !== lineId)
        : appendIdsPreservingCurrentOrder(current, [lineId], displayOrderIds)
    );
  }

  async function moveSelectedCollectedLineByPlacement(
    fromId: string,
    toId: string,
    placement: 'before' | 'after'
  ) {
    const nextDisplayOrderIds = reorderIdsByPlacement(displayOrderIds, fromId, toId, placement);
    const nextSelectedReceiptLineIds = reorderIdsByPlacement(selectedReceiptLineIds, fromId, toId, placement);

    setDisplayOrderIds(nextDisplayOrderIds);
    setSelectedReceiptLineIds(nextSelectedReceiptLineIds);

    await syncProjectToSheet({
      selectedIds: selectedLineIds,
      orderedIds: nextDisplayOrderIds,
      successMessage: '並び順を Google Sheets に保存しました。'
    });
  }

  function toggleCollectedMonthSelection(monthKey: string) {
    const monthLineIds = collectedLines
      .filter((line) => getMonthKey(line.serviceDate) === monthKey)
      .map((line) => line.id);

    setSelectedReceiptLineIds((current) => {
      const allSelected = monthLineIds.every((id) => current.includes(id));
      if (allSelected) {
        return current.filter((id) => !monthLineIds.includes(id));
      }
      return appendIdsPreservingCurrentOrder(current, monthLineIds, displayOrderIds);
    });
  }

  function getCardRefKey(tab: ReorderTab, lineId: string) {
    return `${tab}:${lineId}`;
  }

  function findDragTarget(
    clientY: number,
    tab: ReorderTab,
    sourceLineId: string
  ): { lineId: string; placement: 'before' | 'after' } | null {
    const lines = tab === 'uncollected' ? orderedUncollectedLines : orderedCollectedLines;

    for (const line of lines) {
      if (line.id === sourceLineId) continue;
      const node = reorderCardRefs.current[getCardRefKey(tab, line.id)];
      if (!node) continue;
      const bounds = node.getBoundingClientRect();
      if (clientY < bounds.top || clientY > bounds.bottom) continue;
      return {
        lineId: line.id,
        placement: clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
      };
    }

    return null;
  }

  function beginPointerReorder(
    event: ReactPointerEvent<HTMLDivElement>,
    lineId: string,
    tab: ReorderTab,
    canDrag: boolean
  ) {
    if (!canDrag || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    dragSessionRef.current = { lineId, tab };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraggingSelectedLineId(lineId);
    setDragOverTarget(null);
    setDragDebug({
      phase: 'pointer_down',
      sourceLineId: lineId,
      targetLineId: '',
      placement: ''
    });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;
      const nextTarget = findDragTarget(moveEvent.clientY, session.tab, session.lineId);
      if (!nextTarget) {
        setDragDebug({
          phase: 'dragging',
          sourceLineId: session.lineId,
          targetLineId: '',
          placement: ''
        });
        setDragOverTarget(null);
        return;
      }

      setDragDebug({
        phase: 'drag_over',
        sourceLineId: session.lineId,
        targetLineId: nextTarget.lineId,
        placement: nextTarget.placement
      });
      setDragOverTarget(nextTarget);
    };

    const handlePointerUp = async () => {
      const session = dragSessionRef.current;
      dragSessionRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);

      if (!session) return;

      setDragDebug((current) => ({
        ...current,
        phase: 'drag_end'
      }));

      const target = dragOverTargetRef.current;
      setDraggingSelectedLineId('');
      setDragOverTarget(null);

      if (!target) return;

      if (session.tab === 'uncollected') {
        await moveSelectedLineByPlacement(session.lineId, target.lineId, target.placement);
        return;
      }

      await moveSelectedCollectedLineByPlacement(session.lineId, target.lineId, target.placement);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    window.addEventListener('pointercancel', handlePointerUp, { once: true });
  }

  async function createNewLine(options?: { openEditor?: boolean }): Promise<boolean> {
    setMessage('');
    setError('');
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const nextLine: ServiceLine = {
      id: `${DRAFT_LINE_ID_PREFIX}${now}`,
      projectId: project.id,
      reservationId: '',
      serviceDate: today,
      serviceName: '新規サービス',
      staffName: '',
      price: 0,
      quantity: 1,
      unit: '回',
      taxIncluded: true,
      extraCharges: [],
      remarks: '',
      memo: '',
      visible: true,
      collectionStatus: 'uncollected',
      collectedAt: null,
      receiptIssuedAt: null,
      invoiceCode: '',
      sortKey: Number(today.replace(/-/g, '')),
      createdAt: now,
      updatedAt: now
    };
    const nextLineId = nextLine.id;
    setEditingLineOverride(nextLine);
    setEditingLineId(nextLineId);
    setLineForm({
      serviceDate: nextLine.serviceDate || '',
      serviceName: nextLine.serviceName,
      staffName: nextLine.staffName,
      price: String(nextLine.price),
      quantity: String(nextLine.quantity),
      unit: nextLine.unit,
      taxIncluded: nextLine.taxIncluded,
      remarks: nextLine.remarks,
      memo: nextLine.memo,
      visible: nextLine.visible,
      collectionStatus: nextLine.collectionStatus,
      collectedAt: nextLine.collectedAt || '',
      receiptIssuedAt: nextLine.receiptIssuedAt || ''
    });
    if (options?.openEditor) {
      setLineEditorDialogOpen(true);
    }
    setMessage('新規明細を入力中です。保存すると source スプレッドシートへ反映されます。');
    return true;
  }

  async function openPrintWindow(kind: 'invoice' | 'receipt') {
    if (isHeaderDirty) {
      const synced = await syncProjectToSheet({
        successMessage: '印刷前の位置と件名を Google Sheets に保存しました。'
      });
      if (!synced) {
        return;
      }
    }

    const target = kind === 'invoice' ? invoicePrintRef.current : receiptPrintRef.current;
    if (!target) {
      setError('印刷対象を表示できませんでした。');
      return;
    }

    const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((element) => element.outerHTML)
      .join('\n');
    const title = kind === 'invoice' ? '請求書' : '領収書';
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    document.body.appendChild(iframe);

    const iframeWindow = iframe.contentWindow;
    if (!iframeWindow) {
      iframe.remove();
      setError('印刷ウィンドウを準備できませんでした。');
      return;
    }

    const printDocument = iframeWindow.document;

    printDocument.open();
    printDocument.write(`
      <!DOCTYPE html>
      <html lang="ja">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${title}</title>
          ${styleTags}
          <style>
            body { margin: 0; padding: 24px; background: #fff; }
            .print-shell { width: fit-content; margin: 0 auto; }
          </style>
        </head>
        <body>
          <div class="print-shell"></div>
        </body>
      </html>
    `);
    printDocument.close();

    const printShell = printDocument.querySelector('.print-shell');
    if (!printShell) {
      setError('印刷内容の組み立てに失敗しました。');
      iframe.remove();
      return;
    }

    printShell.appendChild(printDocument.importNode(target, true));
    iframeWindow.focus();
    iframeWindow.addEventListener(
      'afterprint',
      () => {
        setPrintRenderNonce((current) => current + 1);
        iframe.remove();
      },
      { once: true }
    );
    window.setTimeout(() => {
      iframeWindow.print();
    }, 250);
  }

  function renderUncollectedPanel(options?: { compact?: boolean; showDebug?: boolean }) {
    const compact = options?.compact ?? false;
    const showDebug = options?.showDebug ?? false;

    return (
      <>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'flex-start',
            marginBottom: 18
          }}
        >
          <div style={{ display: 'grid', gap: 12, flex: '1 1 auto' }}>
            <div style={{ fontSize: compact ? 16 : 18, fontWeight: 600 }}>
              選択した項目 {filteredSelectedLineIds.length}件
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {monthGroups.map(([monthKey, lines]) => {
                const allSelected = lines.every((line) => filteredSelectedLineIds.includes(line.id));
                return (
                  <button
                    key={monthKey}
                    className={`month-chip${allSelected ? ' active' : ''}`}
                    type="button"
                    onClick={() => toggleMonthSelection(monthKey)}
                  >
                    {monthKey}
                  </button>
                );
              })}
              <button
                className="month-chip action"
                type="button"
                onClick={() =>
                  setSelectedLineIds((current) =>
                    appendIdsPreservingCurrentOrder(
                      current.filter((id) => displayOrderIds.includes(id)),
                      uncollectedLines.map((line) => line.id),
                      displayOrderIds
                    )
                  )
                }
              >
                全て選択
              </button>
              <button className="month-chip action" type="button" onClick={() => setSelectedLineIds([])}>
                選択解除
              </button>
            </div>
          </div>
          <button
            className="button-link primary"
            type="button"
            onClick={() => void createNewLine({ openEditor: true })}
            aria-label="明細を追加"
            style={{ minWidth: 58, paddingInline: 0 }}
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>

        {selectedUncollectedLines.length > 1 ? (
          <>
            <div
              className="note"
              style={{
                marginBottom: 18,
                background: '#fff2f7',
                border: '1px solid #efbfd1',
                color: 'var(--accent-strong)',
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: '0.01em'
              }}
            >
              選択済みカードをドラッグして順番を並び替えできます
              {/* <div>  {selectionSavePending ? '選択を保存中...' : ''}</div> */}
            </div>

          </>
        ) : null}

        <div style={{ display: 'grid', gap: 14 }}>
          {uncollectedLines.length === 0 ? (
            <p>未回収明細はありません。</p>
          ) : (
            orderedUncollectedLines.map((line) => {
              const isSelected = filteredSelectedLineIds.includes(line.id);
              const canDrag = isSelected && selectedUncollectedLines.length > 1;

              return (
                <div
                  key={line.id}
                  ref={(node) => {
                    reorderCardRefs.current[getCardRefKey('uncollected', line.id)] = node;
                  }}
                  className={`service-line-card${canDrag ? ' draggable-selected' : ''}${draggingSelectedLineId === line.id ? ' dragging' : ''
                    }${dragOverTarget?.lineId === line.id && dragOverTarget.placement === 'before'
                      ? ' drop-before'
                      : ''
                    }${dragOverTarget?.lineId === line.id && dragOverTarget.placement === 'after'
                      ? ' drop-after'
                      : ''
                    }`}
                  onPointerDown={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest('button')) return;
                    beginPointerReorder(event, line.id, 'uncollected', canDrag);
                  }}
                >
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={isSelected ? '選択解除' : '選択'}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleLine(line.id);
                      }}
                      style={getSelectionToggleStyle(isSelected)}
                    >
                      {isSelected ? '✓' : ''}
                    </button>
                    <div style={{ minWidth: 0, display: 'block' }}>
                      {canDrag ? (
                        <div
                          data-drag-handle="true"
                          onPointerDown={(event) => beginPointerReorder(event, line.id, 'uncollected', canDrag)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            minHeight: 32,
                            paddingRight: 12,
                            marginBottom: 8,
                            color: 'var(--muted)',
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            cursor: 'grab',
                            touchAction: 'none',
                            userSelect: 'none'
                          }}
                        >
                          DRAG TO REORDER
                        </div>
                      ) : null}
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-strong)' }}>
                        {line.serviceName}
                      </div>
                      <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 14 }}>
                        {line.serviceDate || '日付未設定'}
                      </div>
                      <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 14 }}>
                        数量: {line.quantity}
                        {line.unit} / {line.taxIncluded ? '内税' : '外税'}
                      </div>
                      <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 14 }}>
                        担当: {line.staffName || '担当未設定'}
                      </div>
                      {line.memo ? (
                        <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 14 }}>
                          メモ: {line.memo}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="service-line-side">
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-strong)' }}>
                      ¥{line.price.toLocaleString('ja-JP')}
                    </div>
                    <button
                      className={`service-line-action${line.invoiceCode ? ' is-invoiced' : ''}`}
                      type="button"
                      onClick={() => void toggleCollected(line)}
                    >
                      回収済にする
                    </button>
                    <button
                      className="service-line-action"
                      type="button"
                      onClick={() => openLineEditorDialog(line.id)}
                    >
                      編集する
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {showDebug ? (
          <div className="note" style={{ marginTop: 12, fontSize: 12 }}>
            drag debug: {dragDebug.phase} / source: {dragDebug.sourceLineId || '-'} / target: {dragDebug.targetLineId || '-'}{dragDebug.placement ? ` (${dragDebug.placement})` : ''}
          </div>
        ) : null}
      </>
    );
  }

  function renderLineEditorContent(withinDialog = false) {
    if (editableLines.length === 0 && !lineForm) {
      return (
        <>
          <p>編集できる明細がありません。</p>
          <div className="hero-actions" style={{ marginTop: 18 }}>
            <button className="button-link primary" type="button" onClick={() => void createNewLine({ openEditor: true })}>
              明細を追加
            </button>
          </div>
        </>
      );
    }

    return (
      <>
        {withinDialog ? null : (
          <label>
            <div>対象明細</div>
            <select
              value={editingLineId}
              onChange={(event) => syncLineForm(event.target.value)}
              style={inputStyle}
            >
              {editableLines.length > 1 ? <option value="">選択してください</option> : null}
              {editableLines.map((line) => (
                <option key={line.id} value={line.id}>
                  {formatEditingLineLabel(line)}
                </option>
              ))}
            </select>
          </label>
        )}
        {!lineForm ? (
          <>
            <p style={{ marginTop: 12 }}>対象明細を選択してください。</p>
            <div className="hero-actions" style={{ marginTop: 18 }}>
              <button className="button-link primary" type="button" onClick={() => void createNewLine({ openEditor: true })}>
                明細を追加
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
              <label>
                <div>サービス日</div>
                <input
                  type="date"
                  value={lineForm.serviceDate}
                  onChange={(event) => setLineForm((current) => current && ({ ...current, serviceDate: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label>
                <div>サービス名</div>
                <input
                  value={lineForm.serviceName}
                  onChange={(event) => setLineForm((current) => current && ({ ...current, serviceName: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label>
                <div>担当</div>
                <input
                  value={lineForm.staffName}
                  onChange={(event) => setLineForm((current) => current && ({ ...current, staffName: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <label>
                  <div>単価</div>
                  <input
                    type="number"
                    value={lineForm.price}
                    onChange={(event) => setLineForm((current) => current && ({ ...current, price: event.target.value }))}
                    style={inputStyle}
                  />
                </label>
                <label>
                  <div>数量</div>
                  <input
                    type="number"
                    step="0.01"
                    value={lineForm.quantity}
                    onChange={(event) => setLineForm((current) => current && ({ ...current, quantity: event.target.value }))}
                    style={inputStyle}
                  />
                </label>
                <label>
                  <div>単位</div>
                  <input
                    value={lineForm.unit}
                    onChange={(event) => setLineForm((current) => current && ({ ...current, unit: event.target.value }))}
                    style={inputStyle}
                  />
                </label>
              </div>
              <label>
                <div>備考(請求書や領収書に表示されます)</div>
                <input
                  value={lineForm.remarks}
                  onChange={(event) => setLineForm((current) => current && ({ ...current, remarks: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label>
                <div>メモ</div>
                <textarea
                  value={lineForm.memo}
                  onChange={(event) => setLineForm((current) => current && ({ ...current, memo: event.target.value }))}
                  style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                />
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={lineForm.taxIncluded}
                  onChange={(event) => setLineForm((current) => current && ({ ...current, taxIncluded: event.target.checked }))}
                />
                <span>内税</span>
              </label>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={lineForm.visible}
                  onChange={(event) => setLineForm((current) => current && ({ ...current, visible: event.target.checked }))}
                />
                <span>表示する</span>
              </label>
              <label>
                <div>回収状態</div>
                <select
                  value={lineForm.collectionStatus}
                  onChange={(event) =>
                    setLineForm(
                      (current) =>
                        current && ({
                          ...current,
                          collectionStatus: event.target.value as ServiceLine['collectionStatus']
                        })
                    )
                  }
                  style={inputStyle}
                >
                  <option value="uncollected">uncollected</option>
                  <option value="collected">collected</option>
                </select>
              </label>
            </div>
            {/* {isLineDirty ? (
              <div
                className="note"
                style={{
                  marginTop: 12,
                  background: '#fff0f4',
                  color: '#a01854',
                  border: '1px solid #efbfd1',
                  fontWeight: 700
                }}
              >
                この明細には未反映の変更があります。<code>プレビューに反映</code> を実行してください。
              </div>
            ) : null} */}
            {/* {showSheetSyncReminder && !withinDialog ? (
              <div
                className="note"
                style={{
                  marginTop: 12,
                  background: '#fff4ea',
                  color: '#8b3f08',
                  border: '1px solid #f0c8a0'
                }}
              >
                <strong>⚠️まだスプレッドシートへ反映していません。</strong>
                <br />
                必ず左の <code>スプレッドシートへ保存</code> を実行してください。
              </div>
            ) : null} */}
            <div className="hero-actions" style={{ marginTop: 18 }}>
              <button
                className="button-link secondary"
                type="button"
                onClick={async () => {
                  const duplicated = await duplicateCurrentLine();
                  if (duplicated && withinDialog) {
                    setLineEditorDialogOpen(false);
                  }
                }}
              >
                明細を複製
              </button>
              <button
                className="button-link secondary"
                type="button"
                onClick={async () => {
                  await deleteCurrentLine();
                  if (withinDialog) {
                    setLineEditorDialogOpen(false);
                  }
                }}
              >
                明細を削除
              </button>
              <button
                className={`button-link ${isPreviewApplied ? 'done' : 'primary'}`}
                type="button"
                onClick={async () => {
                  const saved = await saveLine();
                  if (saved && withinDialog) {
                    setLineEditorDialogOpen(false);
                  }
                }}
                disabled={pending}
                style={
                  isLineDirty
                    ? {
                      background: 'linear-gradient(180deg, #d61f68, #a61055)'
                    }
                    : undefined
                }
              >
                保存
              </button>
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <>
      <section className="workbench-stage">
        {/* <article className="card workbench-tab-card"> */}
        <div className="workbench-tabbar">
          <button
            className={`workbench-tab${activeTab === 'uncollected' ? ' active' : ''}`}
            type="button"
            onClick={() => setActiveTab('uncollected')}
          >
            未回収
          </button>
          <button
            className={`workbench-tab${activeTab === 'invoice' ? ' active' : ''}`}
            type="button"
            onClick={() => setActiveTab('invoice')}
          >
            請求書
          </button>
          <button
            className={`workbench-tab${activeTab === 'collected' ? ' active' : ''}`}
            type="button"
            onClick={() => setActiveTab('collected')}
          >
            回収済
          </button>
          <button
            className={`workbench-tab${activeTab === 'receipt' ? ' active' : ''}`}
            type="button"
            onClick={() => setActiveTab('receipt')}
          >
            領収書
          </button>
        </div>
        {/* </article> */}

        <article className="card workbench-list-card">
          {activeTab === 'uncollected' ? (
            renderUncollectedPanel({ showDebug: true })
          ) : null}

          {activeTab === 'invoice' ? (
            <>
              <div className="invoice-preview-layout">
                <section className="invoice-preview-sidebar">
                  <h2 style={{ margin: '0 0 14px' }}>未回収</h2>
                  {renderUncollectedPanel({ compact: true })}
                </section>

                <section className="invoice-preview-main">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0 }}>請求書プレビュー</h2>
                    <button className="button-link secondary" type="button" onClick={() => openPrintWindow('invoice')}>
                      印刷 / PDF
                    </button>
                  </div>
                  {/* {invoiceLines.length > 0 ? (
                    <div className="invoice-preview-controls">
                      <label className="invoice-preview-subject-control">
                        <span className="invoice-preview-subject-label">件名</span>
                        <input
                          value={form.subject}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, subject: event.target.value }))
                          }
                          placeholder="請求書に表示する件名"
                          style={inputStyle}
                        />
                        <span className="invoice-preview-subject-help">
                          プレビュー、印刷 / PDF、スプレッドシート保存に反映されます。
                        </span>
                      </label>
                      <div className="invoice-preview-position-tools">
                        <span className="invoice-preview-subject-label">送り主欄の幅</span>
                        <div className="invoice-preview-position-actions">
                          <button
                            className="button-link secondary"
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                issuerBoxWidth: 0
                              }))
                            }
                          >
                            幅をリセット
                          </button>
                        </div>
                        <span className="invoice-preview-subject-help">
                          送り主欄の右端をドラッグすると幅を調整できます。未設定時はテキスト幅に合わせて表示されます。
                        </span>
                      </div>
                      <div className="invoice-preview-position-tools">
                        <span className="invoice-preview-subject-label">送り主欄の位置</span>
                        <div className="invoice-preview-position-actions">
                          <button
                            className="button-link secondary"
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                issuerBoxOffsetX: 0,
                                issuerBoxOffsetY: 0
                              }))
                            }
                          >
                            位置をリセット
                          </button>
                        </div>
                        <span className="invoice-preview-subject-help">
                          送り主欄をドラッグすると位置を調整できます。印刷 / PDF にも反映されます。
                        </span>
                      </div>
                      <div className="invoice-preview-position-tools">
                        <span className="invoice-preview-subject-label">角印の位置</span>
                        <div className="invoice-preview-position-actions">
                          <button
                            className="button-link secondary"
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                stampOffsetX: 0,
                                stampOffsetY: 0
                              }))
                            }
                          >
                            位置をリセット
                          </button>
                        </div>
                        <span className="invoice-preview-subject-help">
                          角印をドラッグすると位置を調整できます。印刷 / PDF 実行時にスプレッドシートへ保存されます。
                        </span>
                      </div>
                    </div>
                  ) : null} */}
                  {invoiceLines.length > 0 ? (
                    <div className="invoice-preview-controls">
                      <label className="invoice-preview-subject-control">
                        <span className="invoice-preview-subject-label">件名</span>
                        <input
                          value={form.subject}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, subject: event.target.value }))
                          }
                          placeholder="請求書に表示する件名"
                          style={inputStyle}
                        />
                        <span className="invoice-preview-subject-help">
                          プレビュー、印刷 / PDF、スプレッドシート保存に反映されます。
                        </span>
                      </label>
                    </div>
                  ) : null}
                  {invoiceLines.length === 0 ? (
                    <p>請求対象の未回収明細を選ぶと、ここに請求書が表示されます。</p>
                  ) : (
                    <div ref={invoicePrintRef}>
                      <InvoicePreview
                        config={config}
                        project={previewProject}
                        lines={invoiceLines}
                        kind="invoice"
                        stampRenderKey={printRenderNonce}
                        allowIssuerReposition
                        allowIssuerResize
                        allowStampReposition
                        onIssuerWidthChange={(width) =>
                          setForm((current) => ({
                            ...current,
                            issuerBoxWidth: width
                          }))
                        }
                        onIssuerPositionChange={(position) =>
                          setForm((current) => ({
                            ...current,
                            issuerBoxOffsetX: position.x,
                            issuerBoxOffsetY: position.y
                          }))
                        }
                        onStampPositionChange={(position) =>
                          setForm((current) => ({
                            ...current,
                            stampOffsetX: position.x,
                            stampOffsetY: position.y
                          }))
                        }
                      />
                    </div>
                  )}
                </section>
              </div>
            </>
          ) : null}

          {activeTab === 'collected' ? (
            <>
              <h2>回収済一覧</h2>
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  marginBottom: 18
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 600 }}>選択した項目 {filteredSelectedReceiptLineIds.length}件</div>
                {collectedMonthGroups.map(([monthKey, lines]) => {
                  const allSelected = lines.every((line) => filteredSelectedReceiptLineIds.includes(line.id));
                  return (
                    <button
                      key={monthKey}
                      className={`month-chip${allSelected ? ' active' : ''}`}
                      type="button"
                      onClick={() => toggleCollectedMonthSelection(monthKey)}
                    >
                      {monthKey}
                    </button>
                  );
                })}
                <button
                  className="month-chip action"
                  type="button"
                  onClick={() => setSelectedReceiptLineIds(orderedCollectedLines.map((line) => line.id))}
                >
                  全て選択
                </button>
                <button className="month-chip action" type="button" onClick={() => setSelectedReceiptLineIds([])}>
                  選択解除
                </button>
              </div>

              {selectedCollectedLines.length > 1 ? (
                <div
                  className="note"
                  style={{
                    marginBottom: 18,
                    background: '#fff2f7',
                    border: '1px solid #efbfd1',
                    color: 'var(--accent-strong)',
                    fontSize: 15,
                    fontWeight: 600,
                    letterSpacing: '0.01em'
                  }}
                >
                  選択済みカードをドラッグして順番を並び替えできます
                </div>
              ) : null}

              <div style={{ display: 'grid', gap: 10 }}>
                {orderedCollectedLines.map((line) => {
                  const isSelected = filteredSelectedReceiptLineIds.includes(line.id);
                  const canDrag = isSelected && selectedCollectedLines.length > 1;

                  return (
                    <div
                      key={line.id}
                      ref={(node) => {
                        reorderCardRefs.current[getCardRefKey('collected', line.id)] = node;
                      }}
                      className={`service-line-card${canDrag ? ' draggable-selected' : ''}${draggingSelectedLineId === line.id ? ' dragging' : ''
                        }${dragOverTarget?.lineId === line.id && dragOverTarget.placement === 'before'
                          ? ' drop-before'
                          : ''
                        }${dragOverTarget?.lineId === line.id && dragOverTarget.placement === 'after'
                          ? ' drop-after'
                          : ''
                        }`}
                      onPointerDown={(event) => {
                        const target = event.target as HTMLElement;
                        if (target.closest('button')) return;
                        beginPointerReorder(event, line.id, 'collected', canDrag);
                      }}
                    >
                      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          aria-label={isSelected ? '選択解除' : '選択'}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleReceiptLine(line.id);
                          }}
                          style={getSelectionToggleStyle(isSelected)}
                        >
                          {isSelected ? '✓' : ''}
                        </button>
                        <div style={{ minWidth: 0, display: 'block' }}>
                          {canDrag ? (
                            <div
                              data-drag-handle="true"
                              onPointerDown={(event) =>
                                beginPointerReorder(event, line.id, 'collected', canDrag)
                              }
                              onContextMenu={(event) => {
                                event.preventDefault();
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                minHeight: 32,
                                paddingRight: 12,
                                marginBottom: 8,
                                color: 'var(--muted)',
                                fontSize: 12,
                                fontWeight: 700,
                                letterSpacing: '0.04em',
                                cursor: 'grab',
                                touchAction: 'none',
                                userSelect: 'none'
                              }}
                            >
                              DRAG TO REORDER
                            </div>
                          ) : null}
                          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-strong)' }}>
                            {line.serviceName}
                          </div>
                          <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 14 }}>
                            {line.serviceDate || '日付未設定'}
                          </div>
                          <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 14 }}>
                            数量: {line.quantity}
                            {line.unit} / {line.taxIncluded ? '内税' : '外税'}
                          </div>
                          <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 14 }}>
                            担当: {line.staffName || '担当未設定'}
                          </div>
                          {line.memo ? (
                            <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 14 }}>
                              メモ: {line.memo}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="service-line-side">
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-strong)' }}>
                          ¥{line.price.toLocaleString('ja-JP')}
                        </div>
                        <button
                          className="button-link secondary"
                          type="button"
                          onClick={() => void toggleCollected(line)}
                        >
                          未回収へ戻す
                        </button>
                      </div>
                    </div>
                  );
                })}
                {collectedLines.length === 0 ? (
                  <p style={{ margin: 0 }}>回収済みの明細はまだありません。</p>
                ) : null}
              </div>
              <div className="note" style={{ marginTop: 12, fontSize: 12 }}>
                drag debug: {dragDebug.phase} / source: {dragDebug.sourceLineId || '-'} / target: {dragDebug.targetLineId || '-'}{dragDebug.placement ? ` (${dragDebug.placement})` : ''}
              </div>
            </>
          ) : null}

          {activeTab === 'receipt' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0 }}>領収書プレビュー</h2>
                <button className="button-link secondary" type="button" onClick={() => openPrintWindow('receipt')}>
                  印刷 / PDF
                </button>
              </div>
              {collectedLines.length === 0 ? (
                <p>回収済みの明細がありません。</p>
              ) : receiptLines.length === 0 ? (
                <p>領収書に含める回収済明細を選ぶと、ここに領収書が表示されます。</p>
              ) : (
                <div ref={receiptPrintRef}>
                  <InvoicePreview
                    config={config}
                    project={previewProject}
                    lines={previewReceiptLines}
                    kind="receipt"
                    stampRenderKey={printRenderNonce}
                    allowIssuerResize
                    allowStampReposition
                    onIssuerWidthChange={(width) =>
                      setForm((current) => ({
                        ...current,
                        issuerBoxWidth: width
                      }))
                    }
                    onStampPositionChange={(position) =>
                      setForm((current) => ({
                        ...current,
                        stampOffsetX: position.x,
                        stampOffsetY: position.y
                      }))
                    }
                  />
                </div>
              )}
            </>
          ) : null}
        </article>
      </section>

      {/* <section className="workbench-detail-grid">
        <article className="card">
          <h2>利用者情報</h2>
          {renderUserInfoFields()}
          <div
            className="note"
            style={{ marginTop: 18, background: '#fff8fb', color: '#7b5b6d' }}
          >
            <code>スプレッドシートへ保存</code> は利用者情報と明細編集の変更を Google スプレッドシートへ反映します。<code>CSVを書き出す</code> は現在の内容から CSV を出力します。
          </div>
          <div className="hero-actions" style={{ marginTop: 18 }}>
            <button
              className={`button-link ${sheetSyncButtonStyle}`}
              type="button"
              onClick={() => void syncProjectToSheet()}
              disabled={sheetSyncPending || !canSyncToSheet}
            >
              {sheetSyncPending ? 'スプレッドシートへ保存中...' : 'スプレッドシートへ変更を保存'}
            </button>
            <button className="button-link secondary" type="button" onClick={downloadProjectCsv}>
              CSVを書き出す
            </button>
          </div>
        </article>

        <article
          className="card"
          style={
            isLineDirty
              ? {
                borderColor: '#c73a74',
                boxShadow: '0 0 0 2px rgba(199, 58, 116, 0.12)'
              }
              : undefined
          }
        >
          <h2>案件情報</h2>
          {renderLineEditorContent()}
        </article>
      </section> */}

      {lineEditorDialogOpen ? (
        <div className="dialog-backdrop" role="presentation" onClick={() => setLineEditorDialogOpen(false)}>
          <div
            className="dialog-card dialog-card-wide"
            role="dialog"
            aria-modal="true"
            aria-label="案件情報"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <div>
                <h2 className="dialog-title">案件情報・・・</h2>
              </div>
              <button
                type="button"
                className="dialog-close-button"
                aria-label="ダイアログを閉じる"
                onClick={() => setLineEditorDialogOpen(false)}
              >
                ×
              </button>
            </div>
            {renderLineEditorContent(true)}
          </div>
        </div>
      ) : null}

      {userInfoDialogOpen ? (
        <div className="dialog-backdrop" role="presentation" onClick={() => setUserInfoDialogOpen(false)}>
          <div
            className="dialog-card"
            role="dialog"
            aria-modal="true"
            aria-label="利用者情報"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-header">
              <div>
                <p className="eyebrow" style={{ marginBottom: 6 }}>
                  USER INFO
                </p>
                <h2 className="dialog-title">利用者情報</h2>
              </div>
              <button
                type="button"
                className="dialog-close-button"
                aria-label="ダイアログを閉じる"
                onClick={() => setUserInfoDialogOpen(false)}
              >
                ×
              </button>
            </div>

            {renderUserInfoFields()}

            <div className="hero-actions" style={{ marginTop: 18 }}>
              <button
                className={`button-link ${sheetSyncButtonStyle}`}
                type="button"
                onClick={() => void syncProjectToSheet()}
                disabled={sheetSyncPending || !canSyncToSheet}
              >
                {sheetSyncPending ? '利用者情報を保存中...' : '利用者情報を保存'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {message ? <div className="note">{message}</div> : null}
      {error ? <div className="note" style={{ background: '#f7dfd7', color: '#7a2f1b' }}>{error}</div> : null}
    </>
  );
}

function limitMonthGroups(groups: Array<[string, ServiceLine[]]>) {
  return groups.slice(0, 2);
}

const inputStyle: CSSProperties = {
  width: '100%',
  marginBottom: 6,
  padding: '6px 12px',
  borderRadius: 12,
  border: '1px solid var(--line)',
  background: 'white',
  font: 'inherit'
};
