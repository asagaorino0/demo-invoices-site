# konoyubi 実装例

このファイルは、`konoyubi` 側にそのまま持っていくための最小実装例です。

## 1. URL helper を置く

`konoyubi` 側に次のようなファイルを作ります。

例: `src/lib/build-source-sheet-auth-url.ts`

```ts
export interface KonoyubiIssuerSeed {
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
  bankName?: string;
  bankNumber?: string;
}

export interface BuildSourceSheetAuthUrlInput {
  appOrigin: string;
  spreadsheetTitle: string;
  sheetName?: string;
  historySheetName?: string;
  returnPath?: string;
  issuer?: KonoyubiIssuerSeed;
}

export function buildSourceSheetAuthUrl(input: BuildSourceSheetAuthUrlInput): string {
  const appOrigin = String(input.appOrigin || '').trim().replace(/\/+$/, '');
  if (!appOrigin) throw new Error('appOrigin is required');

  const spreadsheetTitle = String(input.spreadsheetTitle || '').trim();
  if (!spreadsheetTitle) throw new Error('spreadsheetTitle is required');

  const url = new URL('/api/google/auth', appOrigin);
  url.searchParams.set('spreadsheetTitle', spreadsheetTitle);
  url.searchParams.set('sheetName', String(input.sheetName || 'invoices').trim() || 'invoices');
  url.searchParams.set('historySheetName', String(input.historySheetName || 'history').trim() || 'history');
  url.searchParams.set('returnPath', String(input.returnPath || '/source-sheet').trim() || '/source-sheet');

  const issuer = input.issuer || {};
  appendIfPresent(url, 'issuerName', issuer.issuerName);
  appendIfPresent(url, 'issuerPostalCode', issuer.issuerPostalCode);
  appendIfPresent(url, 'issuerAddress', issuer.issuerAddress);
  appendIfPresent(url, 'issuerContact', issuer.issuerContact);
  appendIfPresent(url, 'issuerEmail', issuer.issuerEmail);
  appendIfPresent(url, 'issuerInvoiceNumber', issuer.issuerInvoiceNumber);
  appendIfPresent(url, 'issuerRepresentativeName', issuer.issuerRepresentativeName);
  appendIfPresent(url, 'issuerRepresentativeTitle', issuer.issuerRepresentativeTitle);
  appendIfPresent(url, 'issuerStampUrl', issuer.issuerStampUrl);
  appendIfPresent(url, 'bankNote', issuer.bankNote);
  appendIfPresent(url, 'bankName', issuer.bankName);
  appendIfPresent(url, 'bankNumber', issuer.bankNumber);

  return url.toString();
}

function appendIfPresent(url: URL, key: string, value?: string) {
  const normalized = String(value || '').trim();
  if (!normalized) return;
  url.searchParams.set(key, normalized);
}
```

## 2. konoyubi の会社情報を発行者データへ変換する

`konoyubi` の実データ構造に合わせて、1 か所で詰め替えるのがおすすめです。

```ts
import type { KonoyubiIssuerSeed } from '@/lib/build-source-sheet-auth-url';

type CompanyLike = {
  name?: string | null;
  postalCode?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  invoiceNumber?: string | null;
  representativeName?: string | null;
  representativeTitle?: string | null;
  stampUrl?: string | null;
  bankName?: string | null;
  bankNumber?: string | null;
};

export function mapCompanyToIssuerSeed(company: CompanyLike): KonoyubiIssuerSeed {
  return {
    issuerName: company.name || '',
    issuerPostalCode: company.postalCode || '',
    issuerAddress: company.address || '',
    issuerContact: company.phone || '',
    issuerEmail: company.email || '',
    issuerInvoiceNumber: company.invoiceNumber || '',
    issuerRepresentativeName: company.representativeName || '',
    issuerRepresentativeTitle: company.representativeTitle || '',
    issuerStampUrl: company.stampUrl || '',
    bankName: company.bankName || '',
    bankNumber: company.bankNumber || ''
  };
}
```

## 3. ダッシュボードのボタンで使う

まずは作成を始めず、`Source スプレッドシート` ダイアログへ遷移させるのが現在の推奨です。

```ts
import { buildSourceSheetSetupUrl } from '@/lib/build-source-sheet-setup-url';
import { mapCompanyToIssuerSeed } from '@/lib/map-company-to-issuer-seed';

const url = buildSourceSheetSetupUrl({
  appOrigin: 'http://localhost:3000',
  returnTo: 'http://localhost:3001/dashboard',
  issuer: mapCompanyToIssuerSeed(company)
});

window.location.href = url;
```

この場合は `/source-sheet` が開くだけで、まだスプレッドシートは作られません。
ユーザーがダイアログで `新規スプレッドシートを作成` を押したときだけ、Google 認証と作成が走ります。

```tsx
'use client';

import { buildSourceSheetSetupUrl } from '@/lib/build-source-sheet-setup-url';
import { mapCompanyToIssuerSeed } from '@/lib/map-company-to-issuer-seed';

type Props = {
  company: {
    name?: string | null;
    postalCode?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    invoiceNumber?: string | null;
    representativeName?: string | null;
    representativeTitle?: string | null;
    stampUrl?: string | null;
    bankName?: string | null;
    bankNumber?: string | null;
  };
};

export function CreateInvoiceSheetButton({ company }: Props) {
  function handleClick() {
    const url = buildSourceSheetSetupUrl({
      appOrigin: 'http://localhost:3000',
      returnTo: 'http://localhost:3001/dashboard',
      mode: 'create',
      issuer: mapCompanyToIssuerSeed(company)
    });

    window.location.href = url;
  }

  return (
    <button type="button" onClick={handleClick}>
      請求書用スプレッドシートを作成
    </button>
  );
}
```

## 4. 実際に差し替える箇所

- `appOrigin`
  このアプリの本番 URL に差し替える
- `company`
  `konoyubi` の実際の会社情報 / 店舗情報に差し替える
- `spreadsheetTitle`
  会社名や年月を入れるなど、運用しやすい命名にする

## 5. 実装時のおすすめ

- URL 組み立ては helper に閉じる
- `company -> issuer` の変換は別関数に分ける
- ボタン側では `buildSourceSheetAuthUrl(...)` と `window.location.href = url` だけにする
