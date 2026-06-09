# demo-invoices-site

GitHub Pages でそのまま公開できる、静的な請求書デモサイトです。  
Google スプレッドシートの公開 CSV を読み込み、未設定時はローカル JSON を表示します。

## このリポジトリについて

このリポジトリは public のお試し配布用です。

- 実データは入れないでください
- 個人情報は入れないでください
- 本番運用は private 環境で行ってください

## ファイル構成

- `invoices.html`: 請求書一覧とプレビューを表示するメインページ
- `data/invoices-site-config.json`: データ取得元や表示文言の設定
- `data/invoices.json`: フォールバック用のサンプルデータ
- `data/invoices-sheet-template.csv`: Google スプレッドシート作成用テンプレート

## 使い方

1. `data/invoices-site-config.json` を開く
2. `invoiceSheetCsvUrl` に Google スプレッドシートの公開 CSV URL を設定する
3. URL を設定しない場合は `data/invoices.json` が表示される
4. GitHub Pages で `main` ブランチの `/ (root)` を公開する

## Google スプレッドシート公開URLの取り方

1. Google スプレッドシートを開く
2. `ファイル` → `共有` → `ウェブに公開` を開く
3. 対象シートを選ぶ
4. 形式を `カンマ区切りの値（.csv）` にする
5. `公開する` を押す
6. 表示された URL を `invoiceSheetCsvUrl` に貼る

## データ列

以下の列を使います。

- `invoiceId`
- `customerCode`
- `customerName`
- `recipientName`
- `issueDate`
- `serviceDate`
- `serviceName`
- `quantity`
- `unitPrice`
- `taxMode`
- `isPaid`
- `notes`
- `visible`

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