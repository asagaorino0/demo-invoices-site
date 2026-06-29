'use client';

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const LIVE_REFRESH_INTERVAL_MS = 15000;

export function SourceSheetLiveRefresh({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let disposed = false;

    function isUserInteracting(): boolean {
      if (document.body?.dataset.printDialogOpen === 'true') {
        return true;
      }

      if (document.body?.dataset.selectionDirty === 'true') {
        return true;
      }

      if (document.querySelector('[aria-modal="true"], [role="dialog"]')) {
        return true;
      }

      const activeElement = document.activeElement as HTMLElement | null;
      if (!activeElement) {
        return false;
      }

      const tagName = activeElement.tagName.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        return true;
      }

      if (activeElement.isContentEditable) {
        return true;
      }

      return Boolean(activeElement.closest('form'));
    }

    function refresh() {
      if (disposed || document.visibilityState !== 'visible' || isUserInteracting()) {
        return;
      }

      startTransition(() => {
        router.refresh();
      });
    }

    const intervalId = window.setInterval(() => {
      refresh();
    }, LIVE_REFRESH_INTERVAL_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    }

    function handleWindowFocus() {
      refresh();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [enabled, router, startTransition]);

  return null;
}
