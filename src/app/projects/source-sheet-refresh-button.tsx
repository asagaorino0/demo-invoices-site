'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function SourceSheetRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function hasUnsavedUiState(): boolean {
    if (document.body?.dataset.selectionDirty === 'true') {
      return true;
    }

    if (document.body?.dataset.projectDirty === 'true') {
      return true;
    }

    if (document.body?.dataset.printDialogOpen === 'true') {
      return true;
    }

    return Boolean(document.querySelector('[aria-modal="true"], [role="dialog"]'));
  }

  function handleRefresh() {
    if (hasUnsavedUiState()) {
      const shouldContinue = window.confirm(
        '未保存の変更や開いているダイアログがあります。スプレッドシートを再読込すると、画面上の編集中の状態が戻ることがあります。続けますか？'
      );
      if (!shouldContinue) {
        return;
      }
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      className={`button-link ${pending ? 'done' : 'secondary'}`}
      onClick={handleRefresh}
      disabled={pending}
    >
      {pending ? 'スプレッドシートを更新中...' : 'スプレッドシートを再読込'}
    </button>
  );
}
