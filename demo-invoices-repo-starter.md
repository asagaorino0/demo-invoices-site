# demo/invoices 配布版スターター

`konoyubi` の `http://localhost:3000/demo/invoices` を、別リポジトリで「DBなし / Google スプレッドシート利用 / 公開お試し版あり」で配布したいときの初期方針です。

## 結論

最初の 1 本目は、次の前提で作るのが安全です。

- 配布版 repo は `konoyubi` のコピーではなく新規作成
- 本番用の型や hooks は持ち込まず、配布版専用の軽い型を作る
- データは Google スプレッドシート公開 CSV を読む
- フォールバック用 JSON も同梱する
- 個人情報は入れない
- public 版はサンプルデータ専用、本番版は非公開 repo または private deployment 前提

## repo 作成時の注意

### 1. 先に公開境界を決める

公開 repo に置いてよいのは、原則として次だけです。

- サンプル顧客名
- サンプル請求先
- サンプル住所
- サンプル施術履歴
- ダミー印影

公開 repo に置かないもの:

- 実在顧客の氏名
- 実在施設名と請求情報の組み合わせ
- 本番の印影
- 非公開の業務ルール
- `.env`

### 2. `konoyubi` の依存をそのまま持ってこない

移植メモのとおり、`demo/invoices` は本番側コンポーネントへ依存しています。特に `DemoUserCheckDialog` は依存が広がりやすいので、配布版では次の置き換えがおすすめです。

- `UserDetail` を使わず `DemoUser` を新規作成
- `serviceHistory` を `DemoInvoiceLine[]` に整理
- 請求書プレビューを配布版専用コンポーネントへ切り出す
- 領収書も同様にローカル完結へ寄せる

### 3. スプシは「公開 CSV 前提」で列設計する

まずは次の 3 系統に分けると扱いやすいです。

- `customers`: 顧客の基本情報
- `invoiceLines`: 請求対象の明細
- `siteConfig`: サイト表示名や請求書の固定文言

お試し版だけなら、最初は `invoiceLines` 1 シートでも十分です。

### 4. static 配布前提で作る

`nishisumi` 方式に寄せるなら、GitHub Pages に載せやすい構成が向いています。

- HTML/CSS/JS だけで作る
- もしくは Next.js でも static export 前提に寄せる
- API routes や DB 接続は入れない

## おすすめ構成

### A. いちばん配りやすい構成

```text
invoice-demo-site/
  index.html
  invoices.html
  preview.html
  README.md
  .gitignore
  data/
    site-config.json
    invoice-lines.json
    invoices-sheet-template.csv
```

向いているケース:

- とにかく配布しやすくしたい
- GitHub Pages でそのまま公開したい
- 管理者がコードを触らずシート更新だけしたい

### B. UI を保ちやすい構成

```text
invoice-demo-site/
  app/
    demo/
      invoices/
        page.tsx
        components/
        mockData.ts
        types.ts
  public/
  data/
  README.md
  .gitignore
  package.json
```

向いているケース:

- 既存の `demo/invoices` の見た目を保ちたい
- React コンポーネントで管理したい
- あとで private deployment に移しやすくしたい

## 初期 `.gitignore`

Next.js で始めるなら最初はこれで十分です。

```gitignore
node_modules
.next
out
dist
.env
.env.local
.env.*.local
.DS_Store
*.log
```

静的サイトだけなら、もっと小さくて構いません。

```gitignore
.DS_Store
dist
*.log
```

## 初期 README に必ず書くこと

- この repo は公開サンプル版か、本番版か
- 個人情報を入れないこと
- Google スプレッドシートを `ウェブに公開` して使うこと
- シート列名を変更すると表示が壊れること
- フォールバック JSON があること

## シート設計の注意

### public お試し版で向く列

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

### public お試し版で避けたい列

- 個人電話番号
- メールアドレス
- 実住所
- 口座情報
- 本物の請求先担当者名
- 社内メモ

## 公開版と本番版の分け方

### 公開版

- repo: public
- データ: ダミーのみ
- シート: 公開
- URL: GitHub Pages など

### 本番版

- repo: private 推奨
- データ: 実データ
- シート: 閲覧権限を厳格管理
- 配信: private hosting か認証あり環境

注意:
スプシを「ウェブに公開」する方式は、実データ運用には不向きです。実運用では公開 CSV ではなく、認証付きの取得方式を別途考える方が安全です。

## 最初の作業順

1. 新しい repo を配布版として作る
2. `demo/invoices` の UI をそのままコピーするのではなく、配布版専用 `types.ts` を作る
3. 請求書プレビューをローカルコンポーネント化する
4. シート列を確定する
5. `data/site-config.json` とフォールバック JSON を置く
6. public デモデータで表示確認する
7. GitHub Pages で公開する

## 次に切るべき最小タスク

- `DemoUserCheckDialog` の本番依存を切る
- デモ専用型を作る
- シート CSV を読むローダーを作る
- フォールバック JSON を用意する
- README と運用ガイドを書く

## 判断基準

早く出したいなら:
静的サイト寄りに切る方が安全です。

見た目を優先したいなら:
Next.js で作っても良いですが、最初から「配布版専用に依存を閉じる」ことが重要です。
