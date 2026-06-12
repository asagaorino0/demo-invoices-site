# demo-invoices-site

GitHub Pages でそのまま公開できる、静的な請求書デモサイトです。  
元の `konoyubi` の `DemoUserCheckDialog` を public/static 向けに寄せてあり、`未回収 / 請求書 / 回収済 / 領収書` を利用者単位で確認できます。

## このリポジトリについて

このリポジトリは public のお試し配布用です。

- 実データは入れないでください
- 個人情報は入れないでください
- 本番運用は private 環境で行ってください

## ファイル構成

- `invoices.html`: 利用者一覧と請求書管理ダイアログを表示するメインページ
- `invoices-site-config.json`: 発行元表示やデータ取得元の設定
- `invoices.json`: フォールバック用のサンプル service history データ
- `invoices-sheet-template.csv`: Google スプレッドシート用テンプレート
- `demo-invoices-migration.md`: 元の `konoyubi` 画面を移植するときの依存メモ

`demo-invoices-migration.md` は開発用の背景資料です。今のこの repo の使い方や仕様確認は `README.md` と `invoices.html` を優先してください。

## 使い方

1. `invoices-site-config.json` を開く
2. `invoiceSheetCsvUrl` に Google スプレッドシートの公開 CSV URL を設定する
3. ローカル CSV を使う場合は `localInvoiceCsvUrl` に `./invoices-sheet-template.csv` のような相対パスを設定する
4. どちらの CSV も使わない場合は `invoices.json` が表示される
5. `invoices.html` を `http://` 経由で開く

読み込み優先順は以下です。

1. `invoiceSheetCsvUrl`
2. `localInvoiceCsvUrl`
3. `fallbackInvoicesUrl`

## 表示内容

- `未回収`: 未回収の施術履歴を表示し、チェックした項目を請求書対象に選べます。その場で `回収済にする` も試せます
- `請求書`: 未回収タブでチェックした項目だけをまとめた請求書プレビューを表示します
- `回収済`: 回収済みの履歴を表示します
- `領収書`: 回収済み分だけをまとめた領収書プレビューを表示します

`印刷 / PDF` からブラウザ印刷を開き、保存先で `PDF に保存` を選ぶとPDF化できます。

## Google スプレッドシート公開URLの取り方

1. Google スプレッドシートを開く
2. `ファイル` → `共有` → `ウェブに公開` を開く
3. 対象シートを選ぶ
4. 形式を `カンマ区切りの値（.csv）` にする
5. `公開する` を押す
6. 表示された URL を `invoiceSheetCsvUrl` に貼る

## ローカル CSV の使い方

1. `invoices-sheet-template.csv` を複製して任意の CSV を作る
2. `invoices-site-config.json` の `localInvoiceCsvUrl` にそのファイルパスを設定する
3. `invoiceSheetCsvUrl` を空にするとローカル CSV が優先される
4. ブラウザで直接 `file://` を開くのではなく、ローカルサーバーまたは GitHub Pages など `http://` 経由で表示する

設定ファイルを触りたくない場合は、画面左側の `CSV / Excel ファイルを選択` からその場でローカルファイルを読み込めます。選択したファイルは、そのタブを開いている間だけ優先されます。Excel は1枚目のシートを読み込みます。

## データ列

以下の列を使います。

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
- `extraCharges` は JSON 配列文字列で入れます
- `remarks` は請求書・領収書の備考欄に出します
- `memo` は履歴カード下部の補足表示に使います

## 公開時の注意

- public repo ではサンプルデータのみを使用してください
- 公開 CSV は誰でも閲覧できます
- 実在の顧客名、住所、請求情報、口座情報は入れないでください

## GitHub Pages 設定

- `Settings`
- `Pages`
- `Build and deployment`
- `Deploy from a branch`
- `Branch: main`
- `Folder: / (root)`

## ライセンス

必要に応じて設定してください。
