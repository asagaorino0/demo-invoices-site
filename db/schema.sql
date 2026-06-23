create table if not exists imports (
  id uuid primary key,
  source_name text not null,
  source_type text not null check (source_type in ('csv', 'xlsx', 'json', 'manual')),
  row_count integer not null default 0,
  warning_json jsonb not null default '[]'::jsonb,
  imported_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key,
  import_id uuid references imports(id) on delete set null,
  customer_id text not null,
  customer_name text not null,
  subject text not null default '',
  default_invoice_date_mode text not null default 'monthEnd'
    check (default_invoice_date_mode in ('visit', 'monthEnd', 'custom')),
  invoice_recipient text not null,
  facility_name text not null default '',
  company_name text not null default '',
  issue_date date,
  default_remarks text not null default '',
  status text not null default 'draft' check (status in ('draft', 'ready_for_export', 'exported')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_customer_id on projects(customer_id);
create index if not exists idx_projects_status on projects(status);

create table if not exists service_lines (
  id uuid primary key,
  project_id uuid not null references projects(id) on delete cascade,
  reservation_id text not null,
  service_date date,
  service_name text not null,
  staff_name text not null default '',
  price integer not null default 0,
  quantity numeric(12, 2) not null default 1,
  unit text not null default '回',
  tax_included boolean not null default true,
  extra_charges_json jsonb not null default '[]'::jsonb,
  remarks text not null default '',
  memo text not null default '',
  visible boolean not null default true,
  collection_status text not null default 'uncollected' check (collection_status in ('uncollected', 'collected')),
  collected_at date,
  receipt_issued_at date,
  invoice_code text not null default '',
  sort_key integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, reservation_id)
);

create index if not exists idx_service_lines_project_id on service_lines(project_id);
create index if not exists idx_service_lines_service_date on service_lines(service_date desc);
create index if not exists idx_service_lines_collection_status on service_lines(collection_status);
create index if not exists idx_service_lines_visible on service_lines(visible);

create table if not exists invoice_selections (
  project_id uuid not null references projects(id) on delete cascade,
  line_id uuid not null references service_lines(id) on delete cascade,
  selected_for_invoice boolean not null default false,
  selection_batch_key text not null default '',
  updated_at timestamptz not null default now(),
  primary key (project_id, line_id)
);

create index if not exists idx_invoice_selections_project_id on invoice_selections(project_id);
create index if not exists idx_invoice_selections_batch_key on invoice_selections(selection_batch_key);

create table if not exists google_sheet_settings (
  customer_id text primary key,
  spreadsheet_id text not null,
  sheet_name text not null,
  history_sheet_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_google_sheet_settings_updated_at
  on google_sheet_settings(updated_at desc);

create table if not exists export_jobs (
  id uuid primary key,
  project_id uuid references projects(id) on delete set null,
  export_type text not null check (export_type in ('csv_project', 'csv_all_projects')),
  exported_row_count integer not null default 0,
  file_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_export_jobs_project_id on export_jobs(project_id);
create index if not exists idx_export_jobs_created_at on export_jobs(created_at desc);
