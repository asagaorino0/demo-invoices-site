import Link from 'next/link';
import { listProjectSummaries, getProjectDetail } from '../../lib/store/projects';
import type { ProjectSummary } from '../../types';
import { ImportPanel } from './import-panel';
import { CreateProjectPanel } from './create-project-panel';
import { ProjectEditor } from './[projectId]/project-editor';
import { loadSiteConfig } from '../../lib/site-config';

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
  const customerGroups = buildCustomerGroups(projects);
  const selectedProjectId =
    resolvedSearchParams?.projectId || customerGroups[0]?.project.id || projects[0]?.id || '';
  const config = selectedProjectId ? await loadSiteConfig() : null;
  const selectedBundle = selectedProjectId
    ? await getProjectDetail(selectedProjectId).catch(() => ({
        project: null,
        serviceLines: [],
        invoiceSelections: []
      }))
    : null;

  const selectedCustomerGroup =
    customerGroups.find((group) => group.project.id === selectedProjectId) || null;
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

          <ImportPanel />
          <CreateProjectPanel />

          <section className="card">
            <p className="eyebrow" style={{ marginBottom: 14 }}>
              利用者
            </p>

            {customerGroups.length === 0 ? (
              <p style={{ margin: 0 }}>
                まだ案件がありません。まずは CSV を取り込むか、下のフォームから新規案件を作成してください。
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
                          <div style={{ fontSize: 18, fontWeight: 800 }}>{group.customerName}</div>
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
                config={config}
                project={selectedBundle.project}
                serviceLines={selectedBundle.serviceLines}
                invoiceSelections={selectedBundle.invoiceSelections}
              />
            </>
          ) : (
            <section className="card">
              <h2 style={{ marginBottom: 10 }}>まずは左から始めてください</h2>
              <p>
                CSV を取り込むか、新規案件を作成すると、ここに請求書作成の編集画面が表示されます。
              </p>
              <p style={{ marginBottom: 0 }}>
                操作の流れ: `CSV 取込` → `利用者を選ぶ` → `請求対象を選ぶ` → `プレビュー確認`
                → `CSV 書き出し`
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
      <div style={{ fontSize: 22, fontWeight: 800, color: '#6d1344' }}>{value}</div>
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
  const label =
    status === 'draft'
      ? '編集中'
      : status === 'ready_for_export'
        ? '書き出し前'
        : '書き出し済み';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '7px 10px',
        borderRadius: 999,
        background: 'rgba(109, 19, 68, 0.09)',
        color: '#6d1344',
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: 'nowrap'
      }}
    >
      {label}
    </span>
  );
}
