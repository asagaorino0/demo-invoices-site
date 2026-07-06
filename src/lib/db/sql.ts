export const projectSummarySql = `
  select
    p.id,
    p.customer_id as "customerId",
    p.customer_name as "customerName",
    p.subject,
    p.default_invoice_date_mode as "defaultInvoiceDateMode",
    p.invoice_recipient as "invoiceRecipient",
    p.company_name as "companyName",
    p.status,
    i.imported_at as "lastImportedAt",
    count(*) filter (where sl.collection_status = 'uncollected')::int as "uncollectedCount",
    count(*) filter (where sl.collection_status = 'collected')::int as "collectedCount",
    count(*) filter (
      where sl.collection_status = 'uncollected'
      and coalesce(sel.selected_for_invoice, false) = true
    )::int as "selectedCount"
  from projects p
  left join imports i on i.id = p.import_id
  left join service_lines sl on sl.project_id = p.id and sl.workspace_key = p.workspace_key
  left join invoice_selections sel
    on sel.project_id = p.id
    and sel.line_id = sl.id
    and sel.workspace_key = p.workspace_key
  where p.workspace_key = $1
  group by p.id, i.imported_at
  order by p.customer_name asc, p.created_at asc
`;

export const projectDetailSql = `
  select
    p.id,
    p.import_id as "importId",
    p.customer_id as "customerId",
    p.customer_name as "customerName",
    p.subject,
    p.default_invoice_date_mode as "defaultInvoiceDateMode",
    p.invoice_recipient as "invoiceRecipient",
    p.facility_name as "facilityName",
    p.company_name as "companyName",
    to_char(p.issue_date, 'YYYY-MM-DD') as "issueDate",
    p.default_remarks as "defaultRemarks",
    p.issuer_box_offset_x as "issuerBoxOffsetX",
    p.issuer_box_offset_y as "issuerBoxOffsetY",
    p.issuer_box_width as "issuerBoxWidth",
    p.stamp_offset_x as "stampOffsetX",
    p.stamp_offset_y as "stampOffsetY",
    p.notes_box_height as "notesBoxHeight",
    p.status,
    p.created_at as "createdAt",
    p.updated_at as "updatedAt"
  from projects p
  where p.workspace_key = $1
    and p.id = $2
`;

export const projectServiceLinesSql = `
  select
    sl.id,
    sl.project_id as "projectId",
    sl.reservation_id as "reservationId",
    to_char(sl.service_date, 'YYYY-MM-DD') as "serviceDate",
    sl.service_name as "serviceName",
    sl.staff_name as "staffName",
    sl.price,
    sl.quantity::float as "quantity",
    sl.unit,
    sl.tax_included as "taxIncluded",
    sl.extra_charges_json as "extraCharges",
    sl.remarks,
    sl.memo,
    sl.visible,
    sl.collection_status as "collectionStatus",
    to_char(sl.collected_at, 'YYYY-MM-DD') as "collectedAt",
    to_char(sl.receipt_issued_at, 'YYYY-MM-DD') as "receiptIssuedAt",
    sl.invoice_code as "invoiceCode",
    sl.sort_key as "sortKey",
    sl.created_at as "createdAt",
    sl.updated_at as "updatedAt"
  from service_lines sl
  where sl.workspace_key = $1
    and sl.project_id = $2
  order by sl.sort_key desc, sl.reservation_id asc
`;

export const projectSelectionsSql = `
  select
    project_id as "projectId",
    line_id as "lineId",
    selected_for_invoice as "selectedForInvoice",
    selection_batch_key as "selectionBatchKey",
    updated_at as "updatedAt"
  from invoice_selections
  where workspace_key = $1
    and project_id = $2
  order by updated_at asc, line_id asc
`;

export const insertImportSql = `
  insert into imports (
    id,
    workspace_key,
    source_name,
    source_type,
    row_count,
    warning_json
  ) values ($1, $2, $3, $4, $5, $6::jsonb)
`;

export const upsertProjectSql = `
  insert into projects (
    id,
    workspace_key,
    import_id,
    customer_id,
    customer_name,
    subject,
    default_invoice_date_mode,
    invoice_recipient,
    facility_name,
    company_name,
    issue_date,
    default_remarks,
    issuer_box_offset_x,
    issuer_box_offset_y,
    issuer_box_width,
    stamp_offset_x,
    stamp_offset_y,
    notes_box_height,
    status,
    created_at,
    updated_at
  ) values (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, nullif($11, '')::date, $12, $13, $14, $15, $16, $17, $18, $19, $20::timestamptz, $21::timestamptz
  )
  on conflict (id) do update set
    workspace_key = excluded.workspace_key,
    import_id = excluded.import_id,
    customer_id = excluded.customer_id,
    customer_name = excluded.customer_name,
    subject = excluded.subject,
    default_invoice_date_mode = excluded.default_invoice_date_mode,
    invoice_recipient = excluded.invoice_recipient,
    facility_name = excluded.facility_name,
    company_name = excluded.company_name,
    issue_date = excluded.issue_date,
    default_remarks = excluded.default_remarks,
    issuer_box_offset_x = excluded.issuer_box_offset_x,
    issuer_box_offset_y = excluded.issuer_box_offset_y,
    issuer_box_width = excluded.issuer_box_width,
    stamp_offset_x = excluded.stamp_offset_x,
    stamp_offset_y = excluded.stamp_offset_y,
    notes_box_height = excluded.notes_box_height,
    status = excluded.status,
    updated_at = excluded.updated_at
`;

export const upsertServiceLineSql = `
  insert into service_lines (
    id,
    workspace_key,
    project_id,
    reservation_id,
    service_date,
    service_name,
    staff_name,
    price,
    quantity,
    unit,
    tax_included,
    extra_charges_json,
    remarks,
    memo,
    visible,
    collection_status,
    collected_at,
    receipt_issued_at,
    invoice_code,
    sort_key,
    created_at,
    updated_at
  ) values (
    $1, $2, $3, $4, nullif($5, '')::date, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15,
    $16, nullif($17, '')::date, nullif($18, '')::date, $19, $20, $21::timestamptz, $22::timestamptz
  )
  on conflict (id) do update set
    workspace_key = excluded.workspace_key,
    project_id = excluded.project_id,
    reservation_id = excluded.reservation_id,
    service_date = excluded.service_date,
    service_name = excluded.service_name,
    staff_name = excluded.staff_name,
    price = excluded.price,
    quantity = excluded.quantity,
    unit = excluded.unit,
    tax_included = excluded.tax_included,
    extra_charges_json = excluded.extra_charges_json,
    remarks = excluded.remarks,
    memo = excluded.memo,
    visible = excluded.visible,
    collection_status = excluded.collection_status,
    collected_at = excluded.collected_at,
    receipt_issued_at = excluded.receipt_issued_at,
    invoice_code = excluded.invoice_code,
    sort_key = excluded.sort_key,
    updated_at = excluded.updated_at
`;

export const upsertInvoiceSelectionSql = `
  insert into invoice_selections (
    workspace_key,
    project_id,
    line_id,
    selected_for_invoice,
    selection_batch_key,
    updated_at
  ) values ($1, $2, $3, $4, $5, $6::timestamptz)
  on conflict (project_id, line_id) do update set
    workspace_key = excluded.workspace_key,
    selected_for_invoice = excluded.selected_for_invoice,
    selection_batch_key = excluded.selection_batch_key,
    updated_at = excluded.updated_at
`;

export const updateProjectHeaderSql = `
  update projects
  set
    customer_name = $3,
    subject = $4,
    default_invoice_date_mode = $5,
    invoice_recipient = $6,
    facility_name = $7,
    company_name = $8,
    issue_date = nullif($9, '')::date,
    default_remarks = $10,
    issuer_box_offset_x = $11,
    issuer_box_offset_y = $12,
    issuer_box_width = $13,
    stamp_offset_x = $14,
    stamp_offset_y = $15,
    notes_box_height = $16,
    status = $17,
    updated_at = $18::timestamptz
  where workspace_key = $1
    and id = $2
  returning
    id,
    import_id as "importId",
    customer_id as "customerId",
    customer_name as "customerName",
    subject,
    default_invoice_date_mode as "defaultInvoiceDateMode",
    invoice_recipient as "invoiceRecipient",
    facility_name as "facilityName",
    company_name as "companyName",
    to_char(issue_date, 'YYYY-MM-DD') as "issueDate",
    default_remarks as "defaultRemarks",
    issuer_box_offset_x as "issuerBoxOffsetX",
    issuer_box_offset_y as "issuerBoxOffsetY",
    issuer_box_width as "issuerBoxWidth",
    stamp_offset_x as "stampOffsetX",
    stamp_offset_y as "stampOffsetY",
    notes_box_height as "notesBoxHeight",
    status,
    created_at as "createdAt",
    updated_at as "updatedAt"
`;

export const resetProjectSelectionsSql = `
  update invoice_selections
  set
    selected_for_invoice = false,
    updated_at = $3::timestamptz
  where workspace_key = $1
    and project_id = $2
`;

export const updateServiceLineSql = `
  update service_lines
  set
    service_date = nullif($4, '')::date,
    service_name = $5,
    staff_name = $6,
    price = $7,
    quantity = $8,
    unit = $9,
    tax_included = $10,
    remarks = $11,
    memo = $12,
    visible = $13,
    collection_status = $14,
    collected_at = nullif($15, '')::date,
    receipt_issued_at = nullif($16, '')::date,
    sort_key = $17,
    updated_at = $18::timestamptz
  where workspace_key = $1
    and id = $2
    and project_id = $3
  returning
    id,
    project_id as "projectId",
    reservation_id as "reservationId",
    to_char(service_date, 'YYYY-MM-DD') as "serviceDate",
    service_name as "serviceName",
    staff_name as "staffName",
    price,
    quantity::float as "quantity",
    unit,
    tax_included as "taxIncluded",
    extra_charges_json as "extraCharges",
    remarks,
    memo,
    visible,
    collection_status as "collectionStatus",
    to_char(collected_at, 'YYYY-MM-DD') as "collectedAt",
    to_char(receipt_issued_at, 'YYYY-MM-DD') as "receiptIssuedAt",
    invoice_code as "invoiceCode",
    sort_key as "sortKey",
    created_at as "createdAt",
    updated_at as "updatedAt"
`;

export const insertExportJobSql = `
  insert into export_jobs (
    id,
    workspace_key,
    project_id,
    export_type,
    exported_row_count,
    file_name,
    created_at
  ) values ($1, $2, $3, $4, $5, $6, $7::timestamptz)
`;

export const insertProjectSql = `
  insert into projects (
    id,
    workspace_key,
    import_id,
    customer_id,
    customer_name,
    subject,
    default_invoice_date_mode,
    invoice_recipient,
    facility_name,
    company_name,
    issue_date,
    default_remarks,
    issuer_box_offset_x,
    issuer_box_offset_y,
    issuer_box_width,
    stamp_offset_x,
    stamp_offset_y,
    notes_box_height,
    status,
    created_at,
    updated_at
  ) values (
    $1, $2, null, $3, $4, $5, $6, $7, $8, $9, nullif($10, '')::date, $11, $12, $13, $14, $15, $16, $17, $18, $19::timestamptz, $20::timestamptz
  )
  returning
    id,
    import_id as "importId",
    customer_id as "customerId",
    customer_name as "customerName",
    subject,
    default_invoice_date_mode as "defaultInvoiceDateMode",
    invoice_recipient as "invoiceRecipient",
    facility_name as "facilityName",
    company_name as "companyName",
    to_char(issue_date, 'YYYY-MM-DD') as "issueDate",
    default_remarks as "defaultRemarks",
    issuer_box_offset_x as "issuerBoxOffsetX",
    issuer_box_offset_y as "issuerBoxOffsetY",
    issuer_box_width as "issuerBoxWidth",
    stamp_offset_x as "stampOffsetX",
    stamp_offset_y as "stampOffsetY",
    notes_box_height as "notesBoxHeight",
    status,
    created_at as "createdAt",
    updated_at as "updatedAt"
`;

export const insertServiceLineSql = `
  insert into service_lines (
    id,
    workspace_key,
    project_id,
    reservation_id,
    service_date,
    service_name,
    staff_name,
    price,
    quantity,
    unit,
    tax_included,
    extra_charges_json,
    remarks,
    memo,
    visible,
    collection_status,
    collected_at,
    receipt_issued_at,
    invoice_code,
    sort_key,
    created_at,
    updated_at
  ) values (
    $1, $2, $3, $4, nullif($5, '')::date, $6, $7, $8, $9, $10, $11, '[]'::jsonb, $12, $13, $14,
    $15, nullif($16, '')::date, nullif($17, '')::date, $18, $19, $20::timestamptz, $21::timestamptz
  )
  returning
    id,
    project_id as "projectId",
    reservation_id as "reservationId",
    to_char(service_date, 'YYYY-MM-DD') as "serviceDate",
    service_name as "serviceName",
    staff_name as "staffName",
    price,
    quantity::float as "quantity",
    unit,
    tax_included as "taxIncluded",
    extra_charges_json as "extraCharges",
    remarks,
    memo,
    visible,
    collection_status as "collectionStatus",
    to_char(collected_at, 'YYYY-MM-DD') as "collectedAt",
    to_char(receipt_issued_at, 'YYYY-MM-DD') as "receiptIssuedAt",
    invoice_code as "invoiceCode",
    sort_key as "sortKey",
    created_at as "createdAt",
    updated_at as "updatedAt"
`;

export const markProjectExportedSql = `
  update projects
  set
    status = 'exported',
    updated_at = $3::timestamptz
  where workspace_key = $1
    and id = $2
`;

export const markProjectDraftSql = `
  update projects
  set
    status = 'draft',
    updated_at = $3::timestamptz
  where workspace_key = $1
    and id = $2
`;

export const deleteServiceLineSql = `
  delete from service_lines
  where workspace_key = $1
    and id = $2
    and project_id = $3
`;
