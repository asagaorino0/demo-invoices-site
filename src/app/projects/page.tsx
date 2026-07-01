import Link from 'next/link';
import { listProjectSummaries, getProjectDetail, upsertProjectSnapshot } from '../../lib/store/projects';
import { DEFAULT_GOOGLE_SHEET_SETTING_KEY, getProjectStatusLabel, type ProjectSummary } from '../../types';
import { ProjectEditor } from './[projectId]/project-editor';
import { loadBaseSiteConfig, loadIssuerSheetOverrides, loadSiteConfig } from '../../lib/site-config';
import { getGoogleSheetSetting } from '../../lib/store/google-sheet-settings';
import { getIssuerSetting } from '../../lib/store/issuer-settings';
import { SourceSheetDialog } from './source-sheet-dialog';
import { SourceSheetLiveRefresh } from './source-sheet-live-refresh';
import { NewUserDialog } from './new-user-dialog';
import { UserInfoDialogTrigger } from './user-info-dialog-trigger';
import { WorkbenchLayoutShell } from './workbench-layout-shell';
import { getGoogleSpreadsheetTitle } from '../../lib/google-sheets';
import { readSourceSheetViewData } from '../../lib/source-sheet-view';
import { DEFAULT_ISSUER_SETTING_KEY } from '../../types';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage({
  searchParams
}: {
  searchParams?: Promise<{ projectId?: string }>;
}) {
  let projects: ProjectSummary[] = [];
  let loadError = '';
  let sourceDetailsByProjectId = new Map<
    string,
    Awaited<ReturnType<typeof getProjectDetail>>
  >();
  const selectedGoogleSheetSetting = await getGoogleSheetSetting(DEFAULT_GOOGLE_SHEET_SETTING_KEY).catch(() => null);

  try {
    if (selectedGoogleSheetSetting) {
      const sourceView = await readSourceSheetViewData();
      projects = sourceView.summaries;
      sourceDetailsByProjectId = sourceView.detailsByProjectId;
    } else {
      projects = await listProjectSummaries();
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unknown error';
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const allCustomerGroups = buildCustomerGroups(projects);
  const selectedContextProjectId =
    resolvedSearchParams?.projectId || allCustomerGroups[0]?.project.id || projects[0]?.id || '';
  const selectedContextGroup =
    allCustomerGroups.find((group) => group.project.id === selectedContextProjectId) || null;
  const selectedContextBundle = selectedContextProjectId
    ? await getProjectDetail(selectedContextProjectId).catch(() => ({
      project: null,
      serviceLines: [],
      invoiceSelections: []
    }))
    : null;
  const selectedGoogleSpreadsheetTitle = selectedGoogleSheetSetting
    ? await getGoogleSpreadsheetTitle({
      spreadsheetId: selectedGoogleSheetSetting.spreadsheetId,
      sheetName: selectedGoogleSheetSetting.sheetName,
      historySheetName: selectedGoogleSheetSetting.historySheetName
    }).catch(() => '')
    : '';
  const initialIssuerSetting = await getIssuerSetting(DEFAULT_ISSUER_SETTING_KEY).catch(() => null);
  const baseSiteConfig = await loadBaseSiteConfig().catch(() => null);
  const issuerSheetValues = selectedGoogleSheetSetting && baseSiteConfig
    ? await loadIssuerSheetOverrides(baseSiteConfig.issuerSheetName).catch(() => null)
    : null;
  const initialIssuerValues = issuerSheetValues ? normalizeIssuerValues(issuerSheetValues) : null;
  const dialogIssuerSetting = selectedGoogleSheetSetting ? null : initialIssuerSetting;
  const shouldOpenIssuerDialog = Boolean(selectedGoogleSheetSetting) && !hasIssuerValues(issuerSheetValues);
  const hasSourceSpreadsheetSetting = Boolean(selectedGoogleSheetSetting);
  const visibleProjects = hasSourceSpreadsheetSetting ? projects : [];
  const customerGroups = buildCustomerGroups(visibleProjects);
  const requestedProjectId = resolvedSearchParams?.projectId || '';
  const visibleProjectIds = new Set(customerGroups.map((group) => group.project.id));
  const selectedProjectId =
    hasSourceSpreadsheetSetting
      ? visibleProjectIds.has(requestedProjectId)
        ? requestedProjectId
        : customerGroups[0]?.project.id || visibleProjects[0]?.id || ''
      : '';
  const manualProjectCanOpen = Boolean(!hasSourceSpreadsheetSetting && selectedContextBundle?.project);
  const activeProjectId = hasSourceSpreadsheetSetting
    ? selectedProjectId
    : manualProjectCanOpen
      ? selectedContextProjectId
      : '';
  const config = activeProjectId ? await loadSiteConfig() : null;
  const selectedBundle = hasSourceSpreadsheetSetting
    ? activeProjectId
      ? sourceDetailsByProjectId.get(activeProjectId) || {
        project: null,
        serviceLines: [],
        invoiceSelections: []
      }
      : null
    : manualProjectCanOpen
      ? selectedContextBundle
      : null;

  if (hasSourceSpreadsheetSetting && selectedBundle?.project) {
    await upsertProjectSnapshot(selectedBundle.project).catch(() => undefined);
  }

  const selectedCustomerGroup = hasSourceSpreadsheetSetting
    ? customerGroups.find((group) => group.project.id === activeProjectId) || null
    : manualProjectCanOpen
      ? selectedContextGroup
      : null;
  // const totalUncollected = customerGroups.reduce((sum, group) => sum + group.uncollectedCount, 0);
  // const totalCollected = customerGroups.reduce((sum, group) => sum + group.collectedCount, 0);
  // const totalSelected = customerGroups.reduce((sum, group) => sum + group.selectedCount, 0);

  return (
    <main className="page-shell">
      <SourceSheetLiveRefresh enabled={Boolean(selectedGoogleSheetSetting)} />
      <section
        // className="hero"
        style={{
          // position: "relative",
          padding: "0px 24px"
        }}
      >
        <SourceSheetDialog
          initialSetting={selectedGoogleSheetSetting}
          initialSpreadsheetTitle={selectedGoogleSpreadsheetTitle}
          initialIssuerSetting={dialogIssuerSetting}
          initialIssuerValues={initialIssuerValues}
          shouldOpenIssuerDialog={shouldOpenIssuerDialog}
        />
        {/* <p className="eyebrow">INVOICE WORKBENCH</p> */}
        {/* <h1 className="page-title-static">スプシで請求書</h1> */}
        <h3 className="page-title-static" style={{ margin: 0, fontSize: 18, lineHeight: 1.4, color: "#5f143b" }}>
          スプシで請求書
        </h3>
        {/* <p>
          利用者ごとの未回収確認、請求対象の選択、明細編集、プレビュー、CSV 書き出しを一つの流れで扱います。
        </p> */}
        {/* <div className="hero-actions">
          <a className="button-link secondary" href="/invoices.html">
            見本画面を開く
          </a>
        </div> */}
      </section>

      {loadError ? (
        <div className="note" style={{ marginTop: 24, background: '#f7dfd7', color: '#7a2f1b' }}>
          DB から案件一覧を取得できませんでした。<br />
          <code>{loadError}</code>
        </div>
      ) : null}

      <WorkbenchLayoutShell
        sidebar={
          <>
            <NewUserDialog />

            {hasSourceSpreadsheetSetting ? (
              <section className="card">
                <p className="eyebrow" style={{ marginBottom: 14 }}>
                  利用者
                </p>

                {customerGroups.length === 0 ? (
                  <p style={{ margin: 0 }}>
                    まだ利用者がありません。
                  </p>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {customerGroups.map((group) => {
                      const active = group.project.id === selectedProjectId;
                      return (
                        <Link
                          key={group.customerId}
                          href={`/projects?projectId=${group.project.id}`}
                          style={{
                            display: 'block',
                            padding: 16,
                            borderRadius: 22,
                            textDecoration: 'none',
                            border: active
                              ? '2px solid rgba(109, 19, 68, 0.6)'
                              : '1px solid var(--line)',
                            background: active ? 'rgba(247, 236, 242, 0.95)' : 'rgba(255,255,255,0.7)',
                            boxShadow: active ? '0 10px 24px rgba(109, 19, 68, 0.08)' : 'none'
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 12,
                              alignItems: 'flex-start'
                            }}
                          >
                            <div>
                              <div style={{ fontSize: 16, fontWeight: 700 }}>{group.customerName}</div>
                              <div style={{ color: 'var(--muted)', marginTop: 6 }}>
                                {group.invoiceRecipient}
                              </div>
                            </div>
                            <StatusPill status={group.project.status} />
                          </div>
                          <div style={{ color: 'var(--muted)', marginTop: 10 }}>
                            未回収 {group.uncollectedCount}件 / 請求対象 {group.selectedCount}件
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}
          </>
        }
      >
        {selectedBundle?.project && config && selectedCustomerGroup ? (
          <>
            <section className="card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 18,
                  flexWrap: 'wrap',
                  alignItems: 'center'
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 'clamp(1.5rem, 2.6vw, 2.2rem)',
                      color: '#6d1344',
                      fontFamily: '"Hiragino Mincho ProN", "Yu Mincho", "MS PMincho", serif',
                      fontWeight: 700
                    }}
                  >
                    {selectedBundle.project.customerName}
                  </h2>
                  <p style={{ margin: '10px 0 0' }}>
                    {selectedBundle.project.invoiceRecipient}
                    {selectedBundle.project.facilityName
                      ? ` / ${selectedBundle.project.facilityName}`
                      : ''}
                  </p>
                </div>
                <UserInfoDialogTrigger />

                {/* <div
                  style={{
                    display: 'grid',
                    gap: 10,
                    minWidth: 220
                  }}
                >
                  <InlineStat label="未回収" value={`${selectedCustomerGroup.uncollectedCount}件`} />
                  <InlineStat label="請求対象" value={`${selectedCustomerGroup.selectedCount}件`} />
                  <InlineStat label="回収済" value={`${selectedCustomerGroup.collectedCount}件`} />
                </div> */}
              </div>
            </section>

            <ProjectEditor
              key={selectedBundle.project.id}
              config={config}
              project={selectedBundle.project}
              serviceLines={selectedBundle.serviceLines}
              invoiceSelections={selectedBundle.invoiceSelections}
            />
          </>
        ) : !hasSourceSpreadsheetSetting ? (
          <section className="card">
            <h2 style={{ marginBottom: 10 }}>先にスプレッドシート設定をしてください</h2>
            <p style={{ marginBottom: 0 }}>
              スプレッドシートが未設定の間は、案件一覧や利用者一覧は表示しません。上のカードで設定してから取り込みを進めてください。
            </p>
          </section>
        ) : customerGroups.length === 0 ? (
          <section className="card">
            <h2 style={{ marginBottom: 10 }}>次は利用者を追加です</h2>
            <p style={{ marginBottom: 0 }}>
              新規にスプレッドシートがGoogleドライブに作成されました。まずは左の
              `利用者を追加` から最初の利用者を登録してください。
            </p>
          </section>
        ) : (
          <section className="card">
            <h2 style={{ marginBottom: 10 }}>次は取り込みです</h2>
            <p style={{ marginBottom: 0 }}>
              スプレッドシート設定は保存されています。まだ取り込み前なので案件は表示していません。左の
              `スプレッドシートから取り込む` を実行してください。
            </p>
          </section>
        )}
      </WorkbenchLayoutShell>
    </main>
  );
}

function hasIssuerValues(
  values:
    | {
      issuerName?: string;
      issuerPostalCode?: string;
      issuerAddress?: string;
      issuerContact?: string;
      issuerEmail?: string;
      issuerInvoiceNumber?: string;
      issuerRepresentativeName?: string;
      issuerRepresentativeTitle?: string;
      issuerStampUrl?: string;
      bankNote?: string;
    }
    | null
    | undefined
): boolean {
  if (!values) {
    return false;
  }

  return [
    values.issuerName,
    values.issuerPostalCode,
    values.issuerAddress,
    values.issuerContact,
    values.issuerEmail,
    values.issuerInvoiceNumber,
    values.issuerRepresentativeName,
    values.issuerRepresentativeTitle,
    values.issuerStampUrl,
    values.bankNote
  ].some((value) => String(value || '').trim().length > 0);
}

function normalizeIssuerValues(values: {
  issuerName?: string;
  issuerPostalCode?: string;
  issuerAddress?: string;
  issuerContact?: string;
  issuerEmail?: string;
  issuerInvoiceNumber?: string;
  issuerRepresentativeName?: string;
  issuerRepresentativeTitle?: string;
  issuerStampUrl?: string;
  bankNote?: string;
}) {
  return {
    issuerName: String(values.issuerName || '').trim(),
    issuerPostalCode: String(values.issuerPostalCode || '').trim(),
    issuerAddress: String(values.issuerAddress || '').trim(),
    issuerContact: String(values.issuerContact || '').trim(),
    issuerEmail: String(values.issuerEmail || '').trim(),
    issuerInvoiceNumber: String(values.issuerInvoiceNumber || '').trim(),
    issuerRepresentativeName: String(values.issuerRepresentativeName || '').trim(),
    issuerRepresentativeTitle: String(values.issuerRepresentativeTitle || '').trim(),
    issuerStampUrl: String(values.issuerStampUrl || '').trim(),
    bankNote: String(values.bankNote || '').trim()
  };
}

function buildCustomerGroups(projects: ProjectSummary[]) {
  const groups = new Map<
    string,
    {
      customerId: string;
      customerName: string;
      invoiceRecipient: string;
      companyName: string;
      uncollectedCount: number;
      collectedCount: number;
      selectedCount: number;
      project: ProjectSummary;
    }
  >();

  for (const project of projects) {
    const current = groups.get(project.customerId);
    if (!current) {
      groups.set(project.customerId, {
        customerId: project.customerId,
        customerName: project.customerName,
        invoiceRecipient: project.invoiceRecipient,
        companyName: project.companyName,
        uncollectedCount: project.uncollectedCount,
        collectedCount: project.collectedCount,
        selectedCount: project.selectedCount,
        project
      });
      continue;
    }

    current.uncollectedCount += project.uncollectedCount;
    current.collectedCount += project.collectedCount;
    current.selectedCount += project.selectedCount;
    if ((project.lastImportedAt || '') > (current.project.lastImportedAt || '')) {
      current.project = project;
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.customerName.localeCompare(b.customerName, 'ja'));
}

// function StatCard({ label, value }: { label: string; value: string }) {
//   return (
//     <div
//       style={{
//         padding: 16,
//         borderRadius: 18,
//         border: '1px solid #ecd9e3',
//         background: 'rgba(255, 255, 255, 0.84)'
//       }}
//     >
//       <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{label}</div>
//       <div style={{ fontSize: 22, fontWeight: 400, color: '#6d1344' }}>{value}</div>
//     </div>
//   );
// }

// function InlineStat({ label, value }: { label: string; value: string }) {
//   return (
//     <div
//       style={{
//         display: 'flex',
//         justifyContent: 'space-between',
//         gap: 12,
//         padding: '12px 14px',
//         borderRadius: 16,
//         border: '1px solid #ecd9e3',
//         background: 'rgba(255,255,255,0.72)'
//       }}
//     >
//       <span style={{ color: 'var(--muted)' }}>{label}</span>
//       <strong style={{ color: '#6d1344' }}>{value}</strong>
//     </div>
//   );
// }

function StatusPill({ status }: { status: ProjectSummary['status'] }) {
  const label = getProjectStatusLabel(status);

  return (
    status === 'draft'
      ? null
      :
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '7px 10px',
          borderRadius: 999,
          background: 'rgba(109, 19, 68, 0.09)',
          color: '#6d1344',
          fontSize: 12,
          fontWeight: 700,
          whiteSpace: 'nowrap'
        }}
      >
        {label}
      </span>
  );
}
