# demo-invoices 編集ワークベンチ最小設計

## 目的

この repo の次段階は、静的な請求書デモを「差し込み印刷 + 編集ワークベンチ」へ拡張することです。

- 正式な元データはユーザ管理の CSV / スプレッドシートに置く
- アプリ内 DB は正式保存先ではなく、一時編集・整形・差分管理のために使う
- 1案件をまとめて編集し、新規追加し、最後に CSV / スプレッドシートへ戻せる構成にする

この文書では、まず最小構成を仕様書レベルに落とし、その上で `画面 / API / DB / CSV書き出し` の単位に分けて設計する。

## 現行 static 版の前提

現行の `invoices.html` には、次の業務前提がすでに入っている。

- 読み込み優先順は `選択中ローカルファイル -> config の公開 CSV / ローカル CSV -> fallback JSON`
- レコードは `customerId + reservationId` 単位で正規化される
- 1利用者の明細は `serviceDate` 降順で並ぶ
- 未回収タブでは請求対象の明細をチェック選択する
- `先月分 / 今月分` 相当の月タグで一括選択できる
- 請求書タブには選択した未回収明細だけが出る
- 備考欄は空なら非表示寄りで、入力した時だけ意味を持つ
- ローカルファイル選択は永続保存せず、その表示セッションでのみ有効

該当箇所:

- データ読込: [invoices.html](/Users/eriko/dev/prj/demo-invoices/invoices.html:974)
- レコード正規化: [invoices.html](/Users/eriko/dev/prj/demo-invoices/invoices.html:1023)
- 利用者グルーピングと日付降順: [invoices.html](/Users/eriko/dev/prj/demo-invoices/invoices.html:1075)
- 請求対象選択 state: [invoices.html](/Users/eriko/dev/prj/demo-invoices/invoices.html:1132)
- 請求書/領収書プレビュー: [invoices.html](/Users/eriko/dev/prj/demo-invoices/invoices.html:1320)
- 月タグ一括選択: [invoices.html](/Users/eriko/dev/prj/demo-invoices/invoices.html:1472)

## 目指す最小構成

最小構成では、アプリを次の 4 レイヤに分ける。

1. 画面
2. API
3. DB
4. CSV 入出力

責務の切り分けは次の通り。

- 画面: 案件の閲覧、編集、明細選択、請求書確認、書き出し実行
- API: CSV取込、案件保存、請求対象更新、CSV生成
- DB: 編集中の案件スナップショットと差分を保持
- CSV入出力: 外部フォーマットとの境界を担う

重要なのは、DB を正本にしないことです。正本はあくまで CSV / スプレッドシートであり、アプリ内のデータは「編集作業台の中間形式」として扱う。

## スコープ

### 今回入れる

- 1案件を一覧から選んで編集できる
- 新規案件を追加できる
- 既存明細を追加 / 更新 / 非表示化できる
- 未回収明細から請求対象を選べる
- 請求書 / 領収書プレビューを維持する
- 編集結果を CSV へ書き出せる
- 将来スプレッドシートへ戻しやすい API 形にしておく

### 今回入れない

- Google Sheets API への直接書き戻し
- 複数ユーザ同時編集
- 厳密な監査ログ
- 認証 / 権限管理
- 会計システム連携

## ドメイン設計

最小構成では、CSV 1 行をそのまま画面 state に持たず、次の 3 単位に正規化する。

### 1. Project

「1案件まるごと編集」の単位。

- `projectId`
- `customerId`
- `customerName`
- `invoiceRecipient`
- `facilityName`
- `companyName`
- `issueDate`
- `defaultRemarks`
- `status`
  - `draft`
  - `ready_for_export`
  - `exported`

### 2. ServiceLine

請求や回収の最小明細。

- `lineId`
- `projectId`
- `reservationId`
- `serviceDate`
- `serviceName`
- `staffName`
- `price`
- `quantity`
- `unit`
- `taxIncluded`
- `extraChargesJson`
- `memo`
- `visible`
- `collectionStatus`
  - `uncollected`
  - `collected`
- `collectedAt`
- `receiptIssuedAt`

### 3. InvoiceSelection

「未回収のうち、今どれを請求書に入れるか」の編集用 state。

- `projectId`
- `lineId`
- `selectedForInvoice`
- `selectionBatchKey`
  - 例: `2026-06`

この分離により、`回収状態` と `今回の請求対象選択` を混同しなくて済む。

## 業務ルール

### 1. データの正本

- 正本は外部 CSV / スプレッドシート
- DB はワークベンチ用の中間保存
- `CSV export 完了 = 正本反映準備完了` とみなす

### 2. 請求書に載る明細

- `collectionStatus = uncollected`
- かつ `selectedForInvoice = true`

### 3. 領収書に載る明細

- `collectionStatus = collected`

### 4. 表示順

- 明細は `serviceDate DESC`
- 同日内は `reservationId ASC`

### 5. 備考欄

- 初期値は空
- 入力がある時だけ請求書に表示
- 案件共通備考として扱う

### 6. ローカルファイル選択

- 一時 import として扱う
- ブラウザタブまたはワークベンチ session の間だけ有効
- DB に元ファイルそのものは保持しない

## 画面設計

最小構成の画面は 4 画面というより、1 画面内の 4 領域で構成する。

### 1. 案件一覧ペイン

目的:
どの案件を編集するか選ぶ。

表示項目:

- 利用者名
- 請求先名
- 未回収件数
- 回収済件数
- 最終取込元
- 編集状態
  - 未保存
  - CSV出力待ち
  - 出力済

操作:

- 案件選択
- 新規案件追加
- CSV / Excel 読込開始

### 2. 案件編集ペイン

目的:
1案件のヘッダ情報と明細をまとめて編集する。

表示項目:

- 利用者基本情報
- 請求先情報
- 請求日
- 案件備考
- 明細テーブル

明細テーブル列:

- サービス日
- サービス名
- 担当
- 数量
- 単価
- 税区分
- 回収状態
- 表示可否
- メモ

操作:

- 明細追加
- 明細編集
- 明細複製
- 明細非表示化
- 回収済へ変更
- 未回収へ戻す

### 3. 請求対象選択ペイン

目的:
未回収明細のうち、今回の請求対象だけを選ぶ。

表示:

- 未回収明細カード or テーブル
- `先月分 / 今月分` の一括選択タグ
- 全選択 / 解除
- 選択件数 / 選択金額

操作:

- 明細単位チェック
- 月単位トグル
- 全選択 / 全解除

### 4. プレビューペイン

目的:
請求書 / 領収書の印刷結果を確認する。

タブ:

- 未回収
- 請求書
- 回収済
- 領収書

継続利用する現行仕様:

- 請求書は選択済み未回収明細のみ表示
- 領収書は回収済み明細のみ表示
- 備考欄は入力時のみ表示
- PDF 保存前提の印刷 UI

## 画面状態管理

最小構成で必要な state は次の 3 系統。

### server state

- import した案件一覧
- 案件詳細
- CSV export ジョブ結果

### draft state

- 案件ヘッダ編集中の値
- 明細行の追加 / 更新 / 削除予定
- 選択中の請求対象
- 備考欄

### session state

- 現在選択中の案件
- 現在タブ
- ローカルファイル読込結果
- プレビューのズーム状態

## API 設計

API は REST ベースの最小構成で十分です。

### 1. `POST /api/imports`

用途:
CSV / Excel から案件データを取込む。

入力:

- `file`
- `sourceType`
  - `csv`
  - `xlsx`
- `sourceName`

出力:

- `importId`
- `projectCount`
- `lineCount`
- `warnings[]`

処理:

- ヘッダ検証
- 行単位パース
- 中間フォーマットへ正規化
- `projects`, `service_lines`, `invoice_selections` に保存

### 2. `GET /api/projects`

用途:
案件一覧取得。

出力:

- 案件要約配列

### 3. `POST /api/projects`

用途:
新規案件追加。

入力:

- 案件ヘッダ
- 初期明細配列

出力:

- 作成済み案件

### 4. `GET /api/projects/:projectId`

用途:
案件詳細取得。

出力:

- 案件ヘッダ
- 明細一覧
- 請求対象選択状態

### 5. `PATCH /api/projects/:projectId`

用途:
案件ヘッダ更新。

更新対象:

- 利用者名
- 請求先
- 請求日
- 備考

### 6. `POST /api/projects/:projectId/lines`

用途:
明細追加。

### 7. `PATCH /api/projects/:projectId/lines/:lineId`

用途:
明細更新。

更新対象:

- サービス日
- サービス名
- 数量
- 単価
- 税区分
- 回収状態
- 表示可否
- メモ

### 8. `POST /api/projects/:projectId/selections`

用途:
請求対象選択の一括更新。

入力:

- `selectedLineIds[]`

補足:

- 毎回全置換でよい
- 差分更新より実装が単純で事故が少ない

### 9. `POST /api/projects/:projectId/export`

用途:
案件単位で CSV 書き出し用データを生成する。

入力:

- `format`
  - `csv`
- `scope`
  - `project`
  - `all_projects`

出力:

- `fileName`
- `mimeType`
- `content`
  - まずは UTF-8 CSV 文字列でよい
- `exportedRowCount`
- `warnings[]`

## DB 設計

最小構成なら SQLite か Postgres のどちらでもよいが、責務上は同じです。まずは SQLite を推奨します。

理由:

- ローカル検証が軽い
- ワークベンチ用途なら十分
- 将来 Postgres へ移しやすい構成にできる

### テーブル 1: `imports`

- `id`
- `source_name`
- `source_type`
- `imported_at`
- `row_count`
- `warning_json`

### テーブル 2: `projects`

- `id`
- `import_id`
- `customer_id`
- `customer_name`
- `invoice_recipient`
- `facility_name`
- `company_name`
- `issue_date`
- `default_remarks`
- `status`
- `created_at`
- `updated_at`

制約:

- `status in ('draft', 'ready_for_export', 'exported')`

### テーブル 3: `service_lines`

- `id`
- `project_id`
- `reservation_id`
- `service_date`
- `service_name`
- `staff_name`
- `price`
- `quantity`
- `unit`
- `tax_included`
- `extra_charges_json`
- `memo`
- `visible`
- `collection_status`
- `collected_at`
- `receipt_issued_at`
- `sort_key`
- `created_at`
- `updated_at`

制約:

- `collection_status in ('uncollected', 'collected')`

### テーブル 4: `invoice_selections`

- `project_id`
- `line_id`
- `selected_for_invoice`
- `selection_batch_key`
- `updated_at`

主キー:

- `(project_id, line_id)`

### テーブル 5: `export_jobs`

- `id`
- `project_id`
- `export_type`
- `exported_row_count`
- `file_name`
- `created_at`

このテーブルは必須ではないが、何をいつ出したかを最低限残せるので入れておくと運用が安定する。

## CSV 入出力設計

CSV は「外部正本フォーマット」と「内部編集フォーマット」を分けて考える。

### 外部入力 CSV

入力列は現行テンプレート互換を維持する。

主な列:

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
- `invoiceCode`
- `invoiceDate`
- `isCollected`
- `isCollectedDate`
- `receiptIssueDate`
- `remarks`
- `memo`
- `visible`

### 内部正規化ルール

- `userId -> customer_id`
- `reservationId -> reservation_id`
- `date -> service_date`
- `service -> service_name`
- `staff -> staff_name`
- `baseQuantity -> quantity`
- `baseUnit -> unit`
- `isCollected -> collection_status`

### 外部出力 CSV

書き出し時は、元テンプレート互換の列へ戻す。

方針:

- 既存シートへ貼り戻しやすい列順を維持
- 内部専用列は出さない
- 追加列が必要なら末尾に足す

### 書き出しルール

1. `projects` と `service_lines` を結合する
2. `invoice_selections` は CSV の正本列には含めない
3. `collection_status` を `isCollected` へ戻す
4. `default_remarks` は各行の `remarks` へ展開する
5. `visible = false` の行も、運用方針に応じて出力可否を選べるようにする

最小構成の初期値:

- `visible = false` は CSV にも出力する
- ただし `visible` 列で非表示状態を維持する

理由:

- 完全削除より安全
- スプレッドシート側での復旧が容易

## 推奨ディレクトリ構成

この repo を拡張する場合の最小案です。

```text
src/
  app/
    projects/
      page.tsx
      [projectId]/page.tsx
  components/
    invoice/
    project-editor/
    project-list/
  lib/
    csv/
      import.ts
      export.ts
      headers.ts
    invoice/
      calc.ts
      preview.ts
    db/
      schema.ts
      queries.ts
    api/
      projects.ts
  types/
    project.ts
    service-line.ts
    csv.ts
```

静的 `invoices.html` をすぐ消す必要はなく、移行期間は参照実装として残してよい。

## 実装順

### Phase 1

- DB schema 作成
- CSV import / export の pure function 化
- 現行 `invoices.html` 相当の計算ロジックを `lib` 化

### Phase 2

- 案件一覧 API
- 案件詳細 API
- 案件編集 UI

### Phase 3

- 請求対象選択 UI
- 請求書 / 領収書 preview 統合
- CSV 書き出し

### Phase 4

- スプレッドシートへ戻す運用ガイド
- 差分確認 UI
- import 時バリデーション強化

## 最初に切る実装タスク

1. `types` を `Project`, `ServiceLine`, `InvoiceSelection` に分割する
2. 既存 CSV 列から内部型へ変換する importer を作る
3. 内部型からテンプレート CSV へ戻す exporter を作る
4. 明細選択 state を DB 保存前提の形に置き換える
5. 1案件編集画面を作る
6. 請求書 preview に新しい案件編集 state をつなぐ

## 意思決定メモ

今回の最小構成では、Google スプレッドシートを直接更新しない。

理由:

- 正本管理責任をユーザ側に残したい
- 認証と権限を先に入れると設計が重くなる
- まずは `CSV へ戻せる` ことを完成条件にした方が進めやすい

つまり最初の完成像は、
「CSV / スプシから取り込み、案件単位で編集し、請求書を確認し、CSV を吐き戻せる」
ところまでです。
