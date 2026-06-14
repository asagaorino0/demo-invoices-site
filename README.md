# demo-invoices

静的な請求書デモと、Next.js ベースの編集ワークベンチを同じ repo に置いたサンプルです。

- `static demo`: GitHub Pages にそのまま置きやすい `invoices.html`
- `workbench`: CSV を取り込み、案件単位で編集し、CSV に戻せる Next.js アプリ
  - Google Sheets API を設定すれば、案件単位でスプレッドシートへ直接保存もできます

## いまの状態

この repo では、次の流れが一通り動く前提まで進んでいます。

1. CSV を取り込む
2. 案件一覧を見る
3. 案件ヘッダを編集する
4. 明細を追加 / 編集 / 複製 / 削除する
5. 未回収明細から請求対象を選ぶ
6. 請求書 / 領収書プレビューを見る
7. 案件単位で CSV を書き出す
8. 案件単位で Google スプレッドシートへ保存する

## 構成

- [invoices.html](/Users/eriko/dev/prj/demo-invoices/invoices.html:1)
  static 配布向けの既存デモ
- [src/app](/Users/eriko/dev/prj/demo-invoices/src/app:1)
  Next.js の編集ワークベンチ
- [src/app/api](/Users/eriko/dev/prj/demo-invoices/src/app/api:1)
  案件一覧、取込、保存、書き出し API
- [src/lib/csv](/Users/eriko/dev/prj/demo-invoices/src/lib/csv:1)
  CSV importer / exporter
- [src/lib/store](/Users/eriko/dev/prj/demo-invoices/src/lib/store:1)
  中間保存や取得更新をまとめるストア層
  Google Sheets を正本にする場合は中間保存レイヤとしてのみ使う想定です
- [db/schema.sql](/Users/eriko/dev/prj/demo-invoices/db/schema.sql:1)
  PostgreSQL schema
- [invoices-sheet-template.csv](/Users/eriko/dev/prj/demo-invoices/invoices-sheet-template.csv:1)
  入出力テンプレート

## セットアップ

### 1. 依存を入れる

```bash
npm install
```

### 2. env を設定する

[.env.example](/Users/eriko/dev/prj/demo-invoices/.env.example:1) を参考に `.env.local` を用意します。

Google Sheets を正本にする運用なら、まずは Google Sheets 用の env だけで始められます。

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_SHEETS_SHEET_NAME=invoices
```

PostgreSQL を併用する場合だけ、追加で次を設定します。

```env
DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:5432/konoyubi_invoices?sslmode=require
POSTGRES_DB_NAME=konoyubi_invoices
POSTGRES_SSL_MODE=require
```

補足:

- スプレッドシートの所有者はお客様のGoogleアカウントのままで問題ありません
- お客様には、対象シートをサービスアカウントのメールアドレスへ `編集者` として共有してもらいます
- デプロイのたびにお客様へ再承認を求める方式ではありません
- PostgreSQL を使う場合、接続先は Azure 固定ではありません
- DB 名は `konoyubi_invoices` のような `snake_case` を推奨します

### 3. DB schema を流す

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

DB を使わない運用なら、この手順はスキップできます。

### 4. 開発サーバーを起動する

```bash
npm run dev
```

## アクセス先

- `/`
  ワークベンチのホーム
- `/projects`
  案件一覧
- `/projects/[projectId]`
  案件詳細と編集画面
- `/api/projects`
  案件一覧 API
- `/api/imports`
  CSV 取込 API

この実行環境では `3000` が埋まっていることがあり、その場合は `3001` や `3002` に自動でずれます。

## static demo の使い方

`invoices.html` は今も残しています。

用途:

- 公開デモとしてそのまま配る
- 既存仕様の参照実装として見る
- GitHub Pages に載せる

使い方:

1. [invoices-site-config.json](/Users/eriko/dev/prj/demo-invoices/invoices-site-config.json:1) を開く
2. `invoiceSheetCsvUrl` に Google スプレッドシート公開 CSV URL を設定する
3. ローカル CSV を使う場合は `localInvoiceCsvUrl` を設定する
4. `invoices.html` を `http://` 経由で開く

読み込み優先順:

1. `invoiceSheetCsvUrl`
2. `localInvoiceCsvUrl`
3. `fallbackInvoicesUrl`

## workbench でできること

### 案件一覧

- CSV 取込
- 新規案件追加
- 案件の件数サマリ確認

### 案件詳細

- 案件ヘッダ編集
- 明細追加
- 明細編集
- 明細複製
- 明細削除
- 回収済 / 未回収 切替
- 月タグ単位の請求対象選択
- 請求書 / 領収書プレビュー
- Google スプレッドシートへ直接保存
- 案件単位 CSV 書き出し

## CSV 列

テンプレート互換で次の列を使います。

- `userId`
- `userName`
- `invoiceRecipient`
- `facilityName`
- `companyName`
- `reservationId`
- `date`
- `service`
- `staff`
- `price`
- `baseQuantity`
- `baseUnit`
- `taxIncluded`
- `extraCharges`
- `outsourceUnitPrice`
- `outsourceUnitQuantity`
- `outsourceUnit`
- `outsourceUnitExtraCharges`
- `invoiceCode`
- `invoiceDate`
- `isCollected`
- `isCollectedDate`
- `receiptIssueDate`
- `remarks`
- `memo`
- `visible`

補足:

- `extraCharges` は JSON 配列文字列
- `remarks` は請求書 / 領収書の備考欄
- `memo` は明細メモ
- Google Sheets へ直接保存する場合も、このテンプレート列を前提にします

## 実装メモ

- DB は正本ではなく中間保存
- 正本は CSV / スプレッドシート側に置く前提
- 今回の構成は「差し込み印刷 + 編集ワークベンチ」を最小単位で切り出したもの
- Excel 取込は引き続き利用できます。お客様要望で Excel を使う場合は、取込後に CSV 書き出しか Google Sheets 保存を選べます

背景設計は [demo-invoices-edit-workbench-spec.md](/Users/eriko/dev/prj/demo-invoices/demo-invoices-edit-workbench-spec.md:1) を参照してください。

## 検証コマンド

```bash
npm run typecheck
npm run build
```

## 注意

- public repo では実データを入れないでください
- 公開 CSV は誰でも閲覧できます
- 実在の顧客名、住所、請求情報、口座情報は入れないでください
- 本番運用は private 環境を前提にしてください
