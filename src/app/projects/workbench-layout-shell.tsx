'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

const WorkbenchSidebarContext = createContext<{
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
} | null>(null);

export function WorkbenchLayoutShell({
  sidebar,
  children
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const value = useMemo(() => ({ sidebarCollapsed, setSidebarCollapsed }), [sidebarCollapsed]);

  return (
    <WorkbenchSidebarContext.Provider value={value}>
      <section className={`workbench-layout${sidebarCollapsed ? ' collapsed' : ''}`}>
        {sidebarCollapsed ? (
          <button
            type="button"
            className="sidebar-toggle collapsed"
            aria-label="利用者サイドバーを再表示"
            aria-expanded="false"
            onClick={() => setSidebarCollapsed(false)}
          >
            <span className="sidebar-toggle-icon" aria-hidden="true">
              ›
            </span>
            <span className="sidebar-toggle-label">利用者を表示</span>
          </button>
        ) : null}
        <aside className="workbench-sidebar">{sidebar}</aside>
        <section className="workbench-main">{children}</section>
      </section>
    </WorkbenchSidebarContext.Provider>
  );
}

export function useWorkbenchSidebar() {
  const context = useContext(WorkbenchSidebarContext);

  if (!context) {
    throw new Error('useWorkbenchSidebar must be used within WorkbenchLayoutShell.');
  }

  return context;
}
