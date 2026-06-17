# PostgreSQL 補助メモ

## 採用方針

このファイルは、初期に PostgreSQL 併用案を検討したときの補助メモです。
現在の主方針は `Google Sheets を正本にする` 方向で、PostgreSQL は任意の中間保存先です。

理由:

- 今回のデータは `Project -> ServiceLine -> InvoiceSelection` の関係が明確
- CSV import / export と相性がよい
- 将来 API を増やしても設計が崩れにくい

## 追加したもの

- env ひな形: [.env.example](/Users/eriko/dev/prj/demo-invoices/.env.example:1)
- PostgreSQL schema: [db/schema.sql](/Users/eriko/dev/prj/demo-invoices/db/schema.sql:1)
- 型定義: [src/types/index.ts](/Users/eriko/dev/prj/demo-invoices/src/types/index.ts:1)
- CSV importer: [src/lib/csv/import.ts](/Users/eriko/dev/prj/demo-invoices/src/lib/csv/import.ts:1)
- CSV exporter: [src/lib/csv/export.ts](/Users/eriko/dev/prj/demo-invoices/src/lib/csv/export.ts:1)
- Store client: [src/lib/store/client.ts](/Users/eriko/dev/prj/demo-invoices/src/lib/store/client.ts:1)
- Store layer: [src/lib/store/projects.ts](/Users/eriko/dev/prj/demo-invoices/src/lib/store/projects.ts:1)
- API routes: [src/app/api/projects/route.ts](/Users/eriko/dev/prj/demo-invoices/src/app/api/projects/route.ts:1)
- Next.js scaffold: [package.json](/Users/eriko/dev/prj/demo-invoices/package.json:1), [src/app/page.tsx](/Users/eriko/dev/prj/demo-invoices/src/app/page.tsx:1)

## env 設計

PostgreSQL を併用するなら `DATABASE_URL` を正として使う。

例:

```env
DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:5432/konoyubi_invoices?sslmode=require
POSTGRES_DB_NAME=konoyubi_invoices
POSTGRES_SSL_MODE=require
```

補足:

- 接続先は Azure 固定ではありません
- DB 名は `konoyubi-invoices` ではなく `konoyubi_invoices` を推奨
- ハイフン付き DB 名は SQL やツール側で毎回クォートが絡みやすい

## schema の考え方

### `imports`

CSV / Excel の取込単位を残す。

### `projects`

1案件まるごとのヘッダ情報。

### `service_lines`

明細本体。現行 `invoices.html` の 1 行相当。

### `invoice_selections`

未回収のうち、今回の請求書に何を載せるかの選択状態。

### `export_jobs`

いつ何を CSV 出力したかの最小ログ。

## 次にやる順番

1. 任意の PostgreSQL サーバを用意する
2. `konoyubi_invoices` DB を作る
3. `db/schema.sql` を流す
4. CSV importer を `src/lib/csv/import.ts` に作る
5. exporter を `src/lib/csv/export.ts` に作る
6. `GET /api/projects` と `GET /api/projects/:projectId` を作る

いまは 4 から 6 まで雛形が入っています。

## 実装メモ

- `src/lib/store/client.ts` は現状 `pg` ベースの実装へ委譲しています
- `npm install`, `npm run typecheck`, `npm run build` は実施済み
- static demo はいったん project root に残し、workbench は `src/app` 側へ育てる

## 注意

このメモは PostgreSQL を使う場合の補助資料です。現在の本命運用は Google Sheets 直接保存です。
