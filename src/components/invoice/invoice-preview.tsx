'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { useRef, useState } from 'react';
import type { Project, ServiceLine, SiteConfig } from '../../types';
import {
  buildDocumentRows,
  calcTotals,
  formatDocumentNumberForDisplay,
  formatDate,
  formatPlainCurrency,
  getDocumentNumber,
  getInvoiceIssueDate,
  getProjectSubject,
  getReceiptIssueDate
} from '../../lib/invoice/preview';

interface InvoicePreviewProps {
  config: SiteConfig;
  project: Project;
  lines: ServiceLine[];
  kind: 'invoice' | 'receipt';
  stampRenderKey?: number;
  allowIssuerReposition?: boolean;
  onIssuerPositionChange?: (position: { x: number; y: number }) => void;
  allowIssuerResize?: boolean;
  onIssuerWidthChange?: (width: number) => void;
  allowStampReposition?: boolean;
  onStampPositionChange?: (position: { x: number; y: number }) => void;
}

const ISSUER_OFFSET_X_RANGE = { min: -220, max: 220 };
const ISSUER_OFFSET_Y_RANGE = { min: -80, max: 220 };
const ISSUER_WIDTH_RANGE = { min: 140, max: 720 };
const STAMP_OFFSET_X_RANGE = { min: -220, max: 120 };
const STAMP_OFFSET_Y_RANGE = { min: -40, max: 180 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function InvoicePreview({
  config,
  project,
  lines,
  kind,
  stampRenderKey = 0,
  allowIssuerReposition = false,
  onIssuerPositionChange,
  allowIssuerResize = false,
  onIssuerWidthChange,
  allowStampReposition = false,
  onStampPositionChange
}: InvoicePreviewProps) {
  const totals = calcTotals(lines, config);
  const rows = buildDocumentRows(lines);
  const isReceipt = kind === 'receipt';
  const title = isReceipt ? '領収書' : '請求書';
  const topLabel = isReceipt ? '領収書番号' : '請求書番号';
  const topNumber = formatDocumentNumberForDisplay(getDocumentNumber(project, lines, kind));
  const issueDate = isReceipt ? getReceiptIssueDate(project, lines) : getInvoiceIssueDate(project, lines);
  const message = isReceipt ? '下記のとおり領収いたしました。' : '下記のとおりご請求申し上げます。';
  const amountLabel = isReceipt ? '受領金額' : 'ご請求金額';
  const issuerPosition = {
    x: Math.round(project.issuerBoxOffsetX || 0),
    y: Math.round(project.issuerBoxOffsetY || 0)
  };
  const stampPosition = {
    x: Math.round(project.stampOffsetX || 0),
    y: Math.round(project.stampOffsetY || 0)
  };
  const issuerBoxWidth = Math.round(project.issuerBoxWidth || 0);
  const dragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const issuerResizeStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startWidth: number;
  } | null>(null);
  const stampDragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const [isDraggingIssuer, setIsDraggingIssuer] = useState(false);
  const [isResizingIssuerWidth, setIsResizingIssuerWidth] = useState(false);
  const [isDraggingStamp, setIsDraggingStamp] = useState(false);
  const remarksText = [
    project.defaultRemarks,
    ...lines.map((line) => line.remarks)
  ]
    .map((text) => String(text || '').trim())
    .filter(Boolean)
    .filter((text, index, array) => array.indexOf(text) === index)
    .join('\n');
  const issuerName = String(config.issuerName || '').trim();
  const issuerPostalCode = String(config.issuerPostalCode || '').trim();
  const issuerAddress = String(config.issuerAddress || '').trim();
  const issuerContact = String(config.issuerContact || '').trim();
  const issuerEmail = String(config.issuerEmail || '').trim();
  const issuerInvoiceNumber = String(config.issuerInvoiceNumber || '').trim();
  const issuerRepresentativeName = String(config.issuerRepresentativeName || '').trim();
  const issuerRepresentativeTitle = String(config.issuerRepresentativeTitle || '').trim();
  const issuerStampUrl = String(config.issuerStampUrl || '').trim();

  function handleIssuerPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!allowIssuerReposition || !onIssuerPositionChange || event.button !== 0) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: issuerPosition.x,
      startOffsetY: issuerPosition.y
    };
    setIsDraggingIssuer(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handleIssuerPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!allowIssuerReposition || !onIssuerPositionChange) {
      return;
    }

    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const nextX = clamp(
      dragState.startOffsetX + (event.clientX - dragState.startClientX),
      ISSUER_OFFSET_X_RANGE.min,
      ISSUER_OFFSET_X_RANGE.max
    );
    const nextY = clamp(
      dragState.startOffsetY + (event.clientY - dragState.startClientY),
      ISSUER_OFFSET_Y_RANGE.min,
      ISSUER_OFFSET_Y_RANGE.max
    );
    onIssuerPositionChange({
      x: Math.round(nextX),
      y: Math.round(nextY)
    });
  }

  function finishIssuerDrag(event?: ReactPointerEvent<HTMLDivElement>) {
    if (event && dragStateRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    setIsDraggingIssuer(false);
  }

  function handleIssuerResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!allowIssuerResize || !onIssuerWidthChange || event.button !== 0) {
      return;
    }

    issuerResizeStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startWidth: clamp(
        event.currentTarget.parentElement?.getBoundingClientRect().width || issuerBoxWidth || ISSUER_WIDTH_RANGE.min,
        ISSUER_WIDTH_RANGE.min,
        ISSUER_WIDTH_RANGE.max
      )
    };
    setIsResizingIssuerWidth(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function handleIssuerResizePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!allowIssuerResize || !onIssuerWidthChange) {
      return;
    }

    const resizeState = issuerResizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return;
    }

    const nextWidth = clamp(
      resizeState.startWidth + (event.clientX - resizeState.startClientX),
      ISSUER_WIDTH_RANGE.min,
      ISSUER_WIDTH_RANGE.max
    );
    onIssuerWidthChange(Math.round(nextWidth));
    event.preventDefault();
    event.stopPropagation();
  }

  function finishIssuerResize(event?: ReactPointerEvent<HTMLDivElement>) {
    if (event && issuerResizeStateRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      event.stopPropagation();
    }
    issuerResizeStateRef.current = null;
    setIsResizingIssuerWidth(false);
  }

  function handleStampPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!allowStampReposition || !onStampPositionChange || event.button !== 0) {
      return;
    }

    stampDragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: stampPosition.x,
      startOffsetY: stampPosition.y
    };
    setIsDraggingStamp(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function handleStampPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!allowStampReposition || !onStampPositionChange) {
      return;
    }

    const dragState = stampDragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const nextX = clamp(
      dragState.startOffsetX + (event.clientX - dragState.startClientX),
      STAMP_OFFSET_X_RANGE.min,
      STAMP_OFFSET_X_RANGE.max
    );
    const nextY = clamp(
      dragState.startOffsetY + (event.clientY - dragState.startClientY),
      STAMP_OFFSET_Y_RANGE.min,
      STAMP_OFFSET_Y_RANGE.max
    );
    onStampPositionChange({
      x: Math.round(nextX),
      y: Math.round(nextY)
    });
    event.stopPropagation();
  }

  function finishStampDrag(event?: ReactPointerEvent<HTMLDivElement>) {
    if (event && stampDragStateRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      event.stopPropagation();
    }
    stampDragStateRef.current = null;
    setIsDraggingStamp(false);
  }

  return (
    <div className="invoice-doc-wrap">
      <article className="invoice-doc">
        <div className="invoice-doc-meta">
          <div>
            <div>発行日：{formatDate(issueDate)}</div>
            <div>
              {topLabel}：{topNumber}
            </div>
          </div>
        </div>

        <div className="invoice-doc-title">{title}</div>

        <div className="invoice-doc-header mb-32">
          <div>
            <div className="invoice-doc-recipient">{project.invoiceRecipient}</div>
            <div className="invoice-doc-copy">件名：{getProjectSubject(project)}</div>
            <div className="invoice-doc-copy">{message}</div>
            <div className="invoice-doc-amount">
              <span>{amountLabel}</span>
              <strong>￥{formatPlainCurrency(totals.total)} -</strong>
            </div>
          </div>

          <div
            className={`invoice-doc-company${issuerStampUrl ? ' has-stamp' : ''}${allowIssuerReposition ? ' draggable' : ''}${allowIssuerResize ? ' resizable' : ''}${isDraggingIssuer ? ' dragging' : ''}${isResizingIssuerWidth ? ' resizing' : ''}`}
            style={{
              width: issuerBoxWidth > 0 ? `${issuerBoxWidth}px` : undefined,
              transform: `translate(${issuerPosition.x}px, ${issuerPosition.y}px)`
            }}
            onPointerDown={handleIssuerPointerDown}
            onPointerMove={handleIssuerPointerMove}
            onPointerUp={finishIssuerDrag}
            onPointerCancel={finishIssuerDrag}
          >
            <div className="invoice-doc-company-main mt-12">
              {issuerName ? <h3>{issuerName}</h3> : null}
              {issuerRepresentativeName || issuerRepresentativeTitle ? (
                <div className="invoice-doc-company-representative">
                  {issuerRepresentativeTitle ? <span>{issuerRepresentativeTitle}</span> : null}
                  {issuerRepresentativeName ? <span>{issuerRepresentativeName}</span> : null}
                </div>
              ) : null}
              {issuerPostalCode ? <p className="invoice-doc-company-postal">〒{issuerPostalCode}</p> : null}
              {issuerAddress ? <p className="invoice-doc-company-address">{issuerAddress}</p> : null}
              {issuerContact ? <p className="invoice-doc-company-contact">TEL：{issuerContact}</p> : null}
              {issuerEmail ? <p className="invoice-doc-company-email">{issuerEmail}</p> : null}
              {issuerInvoiceNumber ? <p className="invoice-doc-company-number">登録番号：{issuerInvoiceNumber}</p> : null}
            </div>
            {issuerStampUrl ? (
              <div
                className={`invoice-doc-company-stamp${allowStampReposition ? ' draggable' : ''}${isDraggingStamp ? ' dragging' : ''}`}
                aria-hidden="true"
                style={{
                  transform: `translate(${stampPosition.x}px, ${stampPosition.y}px)`
                }}
                onPointerDown={handleStampPointerDown}
                onPointerMove={handleStampPointerMove}
                onPointerUp={finishStampDrag}
                onPointerCancel={finishStampDrag}
              >
                <img key={`stamp-${stampRenderKey}`} src={issuerStampUrl} alt="" />
              </div>
            ) : null}
            {allowIssuerResize ? (
              <div
                className={`invoice-doc-company-resize-handle${isResizingIssuerWidth ? ' active' : ''}`}
                role="presentation"
                aria-hidden="true"
                onPointerDown={handleIssuerResizePointerDown}
                onPointerMove={handleIssuerResizePointerMove}
                onPointerUp={finishIssuerResize}
                onPointerCancel={finishIssuerResize}
              />
            ) : null}
          </div>
        </div>

        <div className="invoice-chip-row">
          {/* <span className="invoice-chip">{isReceipt ? '回収済' : '未回収'}</span> */}
          {/* <span className="invoice-chip">{lines.length} 明細</span> */}
          {/* <span className="invoice-chip">税率 {Math.round((config.defaultTaxRate || 0.1) * 100)}%</span> */}
        </div>

        <table className="invoice-table">
          <thead>
            <tr>
              <th style={{ width: '60%' }}>品番・品名</th>
              <th style={{ width: '10%' }}>数量</th>
              <th style={{ width: '15%' }}>単価</th>
              <th style={{ width: '15%' }}>金額</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td>{row.qty}</td>
                <td className="num">{row.unitPrice === '' ? '' : formatPlainCurrency(row.unitPrice)}</td>
                <td className="num">{row.total === '' ? '' : formatPlainCurrency(row.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="invoice-table invoice-totals-table">
          <tbody>
            <tr>
              <td colSpan={3}>小計</td>
              <td className="num">{formatPlainCurrency(totals.subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={3}>消費税(10%)</td>
              <td className="num">{formatPlainCurrency(totals.tax)}</td>
            </tr>
            <tr>
              <td colSpan={3}>
                <strong>合計</strong>
              </td>
              <td className="num">
                <strong>{formatPlainCurrency(totals.total)}</strong>
              </td>
            </tr>
          </tbody>
        </table>

        {remarksText ? (
          <div className="invoice-notes">
            <div className="invoice-notes-label">備考</div>
            <div className="invoice-notes-box">{remarksText}</div>
          </div>
        ) : null}

        <div className="invoice-footer">
          いつも有難うございます。<br />
          {config.bankNote || ''}
        </div>
      </article>
    </div>
  );
}
