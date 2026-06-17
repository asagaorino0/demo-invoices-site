import Link from 'next/link';
import { listProjectSummaries, getProjectDetail } from '../../lib/store/projects';
import { getProjectStatusLabel, type ProjectSummary } from '../../types';
import { ImportPanel } from './import-panel';
import { CreateProjectPanel } from './create-project-panel';
import { ProjectEditor } from './[projectId]/project-editor';
import { loadSiteConfig } from '../../lib/site-config';
import { getGoogleSheetSetting, listGoogleSheetSettings } from '../../lib/store/google-sheet-settings';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage({
  searchParams
}: {
  searchParams?: Promise<{ projectId?: string }>;
}) {
  let projects: ProjectSummary[] = [];
  let loadError = '';

  try {
    projects = await listProjectSummaries();
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
  const selectedContextCompanyName =
    selectedContextGroup?.companyName || selectedContextBundle?.project?.companyName || '';
  const googleSheetSettings = await listGoogleSheetSettings().catch(() => []);
  const selectedGoogleSheetSetting = selectedContextCompanyName
    ? await getGoogleSheetSetting(selectedContextCompanyName).catch(() => null)
    : null;
  const hasSourceSpreadsheetSetting = Boolean(selectedGoogleSheetSetting);
  const visibleProjects = hasSourceSpreadsheetSetting
    ? filterProjectsByConfiguredShops(projects, googleSheetSettings)
    : [];
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
  const activeProjectId = hasSourceSpreadsheetSetting ? selectedProjectId : manualProjectCanOpen ? selectedContextProjectId : '';
  const config = activeProjectId ? await loadSiteConfig() : null;
  const selectedBundle = hasSourceSpreadsheetSetting
    ? activeProjectId
      ? await getProjectDetail(activeProjectId).catch(() => ({
        project: null,
        serviceLines: [],
        invoiceSelections: []
      }))
      : null
    : manualProjectCanOpen
      ? selectedContextBundle
      : null;

  const selectedCustomerGroup = hasSourceSpreadsheetSetting
    ? customerGroups.find((group) => group.project.id === activeProjectId) || null
    : manualProjectCanOpen
      ? selectedContextGroup
      : null;
  const totalUncollected = customerGroups.reduce((sum, group) => sum + group.uncollectedCount, 0);
  const totalCollected = customerGroups.reduce((sum, group) => sum + group.collectedCount, 0);
  const totalSelected = customerGroups.reduce((sum, group) => sum + group.selectedCount, 0);

  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">INVOICE WORKBENCH</p>
        <h1 className="page-title-static">請求書デモ</h1>
        <p>
          利用者ごとの未回収確認、請求対象の選択、明細編集、プレビュー、CSV 書き出しを一つの流れで扱います。
        </p>
        <div className="hero-actions">
          <a className="button-link secondary" href="/invoices.html">
            見本画面を開く
          </a>
        </div>
      </section>

      {loadError ? (
        <div className="note" style={{ marginTop: 24, background: '#f7dfd7', color: '#7a2f1b' }}>
          DB から案件一覧を取得できませんでした。<br />
          <code>{loadError}</code>
        </div>
      ) : null}

      <section className="workbench-layout">
        <aside className="workbench-sidebar">
          <ImportPanel
            key={`${selectedContextGroup?.customerId || 'no-customer'}:${selectedContextGroup?.companyName || ''}`}
            companyName={selectedContextCompanyName}
            initialSetting={selectedGoogleSheetSetting}
          />
          {hasSourceSpreadsheetSetting ? (
            <section className="card">
              <p className="eyebrow" style={{ marginBottom: 14 }}>
                件数
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 12
                }}
              >
                <StatCard label="利用者" value={String(customerGroups.length)} />
                <StatCard label="未回収件数" value={String(totalUncollected)} />
                <StatCard label="回収済件数" value={String(totalCollected)} />
                <StatCard label="請求対象" value={String(totalSelected)} />
              </div>
            </section>
          ) : null}
          <CreateProjectPanel />

          {hasSourceSpreadsheetSetting ? (
            <section className="card">
              <p className="eyebrow" style={{ marginBottom: 14 }}>
                利用者
              </p>

              {customerGroups.length === 0 ? (
                <p style={{ margin: 0 }}>
                  まだ利用者がありません。まずは CSV を取り込むか、下のフォームから新規利用者を登録してください。
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
        </aside>

        <section className="workbench-main">
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
                      {selectedBundle.project.customerName} 様
                    </h2>
                    <p style={{ margin: '10px 0 0' }}>
                      {selectedBundle.project.invoiceRecipient}
                      {selectedBundle.project.facilityName
                        ? ` / ${selectedBundle.project.facilityName}`
                        : ''}
                    </p>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gap: 10,
                      minWidth: 220
                    }}
                  >
                    <InlineStat label="未回収" value={`${selectedCustomerGroup.uncollectedCount}件`} />
                    <InlineStat label="請求対象" value={`${selectedCustomerGroup.selectedCount}件`} />
                    <InlineStat label="回収済" value={`${selectedCustomerGroup.collectedCount}件`} />
                  </div>
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
          ) : (
            <section className="card">
              <h2 style={{ marginBottom: 10 }}>次は取り込みです</h2>
              <p style={{ marginBottom: 0 }}>
                スプレッドシート設定は保存されています。まだ取り込み前なので案件は表示していません。左の
                `スプレッドシートから取り込む` を実行してください。
              </p>
            </section>
          )}
        </section>
      </section>
    </main>
  );
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

function filterProjectsByConfiguredShops(projects: ProjectSummary[], settings: { shopKey: string; updatedAt: string }[]) {
  if (settings.length === 0) {
    return [];
  }

  const settingsByShopKey = new Map(settings.map((setting) => [setting.shopKey, setting.updatedAt]));
  return projects.filter((project) => {
    const settingUpdatedAt = settingsByShopKey.get(project.companyName);
    if (!settingUpdatedAt) return false;
    return (project.lastImportedAt || '') >= settingUpdatedAt;
  });
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 18,
        border: '1px solid #ecd9e3',
        background: 'rgba(255, 255, 255, 0.84)'
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 400, color: '#6d1344' }}>{value}</div>
    </div>
  );
}

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 16,
        border: '1px solid #ecd9e3',
        background: 'rgba(255,255,255,0.72)'
      }}
    >
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <strong style={{ color: '#6d1344' }}>{value}</strong>
    </div>
  );
}

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
