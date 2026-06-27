# 発行者シート仕様

`konoyubi` で新規作成した Google スプレッドシートの `発行者` シートは、このアプリで請求書の発行者情報として読み込まれます。

## 推奨シート名

- `発行者`

## 推奨フォーマット

1 行目をヘッダ、2 行目を値にする表形式を推奨します。

| issuerName | issuerPostalCode | issuerAddress | issuerContact | issuerEmail | issuerInvoiceNumber | issuerRepresentativeName | issuerRepresentativeTitle | issuerStampUrl | bankNote |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 株式会社このゆび | 150-0001 | 東京都渋谷区... | 03-1234-5678 | info@example.com | T1234567890123 | 山田花子 | 代表取締役 | https://.../stamp.png | 振込先：○○銀行 1234567 |

## 必須ではないが実運用でほぼ必要な列

- `issuerName`
- `issuerPostalCode`
- `issuerAddress`
- `issuerContact`
- `issuerInvoiceNumber`
- `bankNote`

## 対応している列名

### 発行者情報

- `issuerName`
  別名: `発行者名`, `発行者`, `会社名`, `名称`, `shop`, `shop名`, `shopname`, `shopshopname`, `店舗名`
- `issuerPostalCode`
  別名: `郵便番号`, `〒`, `postalCode`, `shopzip`, `shop郵便番号`, `店舗郵便番号`
- `issuerAddress`
  別名: `住所`, `所在地`, `address`, `shop住所`, `shop所在地`, `shopaddress`, `店舗住所`
- `issuerContact`
  別名: `電話番号`, `tel`, `電話`, `連絡先`, `shoptel`, `shop電話番号`, `店舗電話番号`
- `issuerEmail`
  別名: `email`, `mail`, `メール`, `メールアドレス`
- `issuerInvoiceNumber`
  別名: `登録番号`, `適格請求書発行事業者番号`, `invoiceNumber`, `shopinvoiceNumber`, `shop登録番号`, `店舗登録番号`
- `issuerRepresentativeName`
  別名: `代表者名`, `代表者`, `shoprepresentativename`, `店舗代表者名`
- `issuerRepresentativeTitle`
  別名: `代表者肩書き`, `肩書き`, `役職`, `shoprepresentativetitle`, `店舗代表者肩書き`
- `issuerStampUrl`
  別名: `印影url`, `印鑑url`, `shopstampurl`, `店舗印影url`
- `bankNote`
  別名: `振込先`, `振込先情報`, `bank`

### 振込先補助列

`bankNote` を直接書かなくても、次の 2 列から自動組み立てできます。

- `bankName`
  別名: `shopbankname`, `銀行名`, `振込先銀行`, `店舗銀行名`
- `bankNumber`
  別名: `shopbanknumber`, `口座番号`, `振込先口座`, `店舗口座番号`

この場合、画面上では `振込先：{bankName} {bankNumber}` として扱います。

## 代替フォーマット

表形式ではなく、1 列目をキー、2 列目以降を値として持つ縦持ち形式でも読み込めます。

| A列 | B列 |
| --- | --- |
| 発行者名 | 株式会社このゆび |
| 郵便番号 | 150-0001 |
| 住所 | 東京都渋谷区... |
| 電話番号 | 03-1234-5678 |
| 登録番号 | T1234567890123 |
| 振込先 | 振込先：○○銀行 1234567 |

## 注意

- ラベルは大文字小文字、空白、`:` / `：`、`-`、`_`、`.` の差を吸収して判定します。
- 先頭の空行は避け、最初にデータが入っている行をヘッダ行として扱います。
- 表形式では、ヘッダ行の次にある最初の非空行だけを値として使います。
- `issuerStampUrl` は画像 URL を想定しています。

## konoyubi からの自動作成パラメータ

`konoyubi` からこのアプリの `/api/google/auth` を直接開くと、Google 認証後にスプレッドシートを作成し、そのまま `発行者` シートの 2 行目まで初期化できます。

主なクエリパラメータ:

- `spreadsheetTitle`
- `sheetName`
- `historySheetName`
- `returnPath`
- `issuerName`
- `issuerPostalCode`
- `issuerAddress`
- `issuerContact`
- `issuerEmail`
- `issuerInvoiceNumber`
- `issuerRepresentativeName`
- `issuerRepresentativeTitle`
- `issuerStampUrl`
- `bankNote`

`bankNote` の代わりに次も使えます。

- `bankName`
- `bankNumber`

実装例は [src/lib/konoyubi/build-source-sheet-auth-url.ts](/Users/eriko/dev/prj/demo-invoices/src/lib/konoyubi/build-source-sheet-auth-url.ts:1) に置いています。
