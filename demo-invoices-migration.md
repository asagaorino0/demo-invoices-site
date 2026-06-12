# `/demo/invoices` 移植メモ

`http://localhost:3000/demo/invoices` を別リポジトリへ複製するときの依存一覧です。

## このメモの位置づけ

このファイルは、`konoyubi` 側の元画面をどう移植するかを調べた開発メモです。

- 現在のこの repo の利用手順や公開方法の正解は [README.md](/Users/eriko/dev/prj/demo-invoices/README.md) を優先してください
- 現在のこの repo で実際に動いている画面の正解は [invoices.html](/Users/eriko/dev/prj/demo-invoices/invoices.html) を優先してください
- このメモは「元の `/demo/invoices` は何に依存していたか」を残すための補助資料です

そのため、このファイルだけを見て今の static 版の仕様だと判断しないでください。
今後ズレるのを防ぐため、現行仕様の更新先は `README.md` と `invoices.html` に寄せます。

## まずコピーする本体

- [app/demo/invoices/page.tsx](/Users/eriko/dev/prj/konoyubi/app/demo/invoices/page.tsx)
- [app/demo/invoices/mockData.ts](/Users/eriko/dev/prj/konoyubi/app/demo/invoices/mockData.ts)
- [app/demo/invoices/components/DemoAddServiceDialog.tsx](/Users/eriko/dev/prj/konoyubi/app/demo/invoices/components/DemoAddServiceDialog.tsx)
- [app/demo/invoices/components/DemoInvoicePreviewDialog.tsx](/Users/eriko/dev/prj/konoyubi/app/demo/invoices/components/DemoInvoicePreviewDialog.tsx)
- [app/demo/invoices/components/DemoNewUserDialog.tsx](/Users/eriko/dev/prj/konoyubi/app/demo/invoices/components/DemoNewUserDialog.tsx)
- [app/demo/invoices/components/DemoUserCheckDialog.tsx](/Users/eriko/dev/prj/konoyubi/app/demo/invoices/components/DemoUserCheckDialog.tsx)

## 一緒に必要な共有ファイル

### 型

- [app/usersDetail/types/user.ts](/Users/eriko/dev/prj/konoyubi/app/usersDetail/types/user.ts)
- [app/usersReservation/types/service.ts](/Users/eriko/dev/prj/konoyubi/app/usersReservation/types/service.ts)

`user.ts` はさらに `Reservation` 型を参照しています。

- [app/usersReservation/types/reservation.ts](/Users/eriko/dev/prj/konoyubi/app/usersReservation/types/reservation.ts)

`service.ts` はさらに以下を参照しています。

- [app/usersKartes/types/kartes.ts](/Users/eriko/dev/prj/konoyubi/app/usersKartes/types/kartes.ts)
- [lib/shift-change-log.ts](/Users/eriko/dev/prj/konoyubi/lib/shift-change-log.ts)

別リポジトリで「デモ画面だけ動けばよい」なら、これらを丸ごと持つよりも `DemoUser` / `DemoServiceHistory` の軽い型を新規作成する方が安全です。

### UI / util

- [components/ui/button.tsx](/Users/eriko/dev/prj/konoyubi/components/ui/button.tsx)
- [components/ui/card.tsx](/Users/eriko/dev/prj/konoyubi/components/ui/card.tsx)
- [components/ui/table2.tsx](/Users/eriko/dev/prj/konoyubi/components/ui/table2.tsx)
- [components/ui/select.tsx](/Users/eriko/dev/prj/konoyubi/components/ui/select.tsx)
- [components/ui/dialog.tsx](/Users/eriko/dev/prj/konoyubi/components/ui/dialog.tsx)
- [components/ui/tabs.tsx](/Users/eriko/dev/prj/konoyubi/components/ui/tabs.tsx)
- [components/ui/calendar.tsx](/Users/eriko/dev/prj/konoyubi/components/ui/calendar.tsx)
- [components/ui/checkbox.tsx](/Users/eriko/dev/prj/konoyubi/components/ui/checkbox.tsx)
- [components/ui/input.tsx](/Users/eriko/dev/prj/konoyubi/components/ui/input.tsx)
- [components/ui/label.tsx](/Users/eriko/dev/prj/konoyubi/components/ui/label.tsx)
- [components/ui/popover.tsx](/Users/eriko/dev/prj/konoyubi/components/ui/popover.tsx)
- [components/ui/format.ts](/Users/eriko/dev/prj/konoyubi/components/ui/format.ts)
- [lib/utils.ts](/Users/eriko/dev/prj/konoyubi/lib/utils.ts)

### グローバル CSS

請求書プレビュー縮尺にこのスタイルが必要です。

- [app/globals.css](/Users/eriko/dev/prj/konoyubi/app/globals.css)

最低でも次の class を移植先へ入れてください。

- `.invoice-sheet`
- `.invoice-scale-wrapper`
- `.invoice-scale`
- `.invoice-scale.no-scale`
- `.invoice-print-hidden`
- `.no-scale`

## いまのままだと追加で引っ張られる依存

### `DemoUserCheckDialog.tsx`

このファイルは本番側の請求書・領収書コンポーネントを直接使っています。

- [app/usersCheck/components/UserCheckDialog_preview.tsx](/Users/eriko/dev/prj/konoyubi/app/usersCheck/components/UserCheckDialog_preview.tsx)
- [app/usersCheck/components/UserCheckDialog_receipt.tsx](/Users/eriko/dev/prj/konoyubi/app/usersCheck/components/UserCheckDialog_receipt.tsx)

さらにそこから次も必要になります。

- `react-draggable`
- `@/hooks/useShopInfo`
- `@/hooks/useInvoiceLayout`
- [app/usersDeal/components/ShopStampDialog.tsx](/Users/eriko/dev/prj/konoyubi/app/usersDeal/components/ShopStampDialog.tsx)

別リポジトリへ最短で持っていくなら、ここが最大のボトルネックです。

### `DemoAddServiceDialog.tsx`

お気に入りメニューのデモデータを参照しています。

- [app/demo/reservations/mockData.ts](/Users/eriko/dev/prj/konoyubi/app/demo/reservations/mockData.ts)

必要なのは次の export だけです。

- `mockUserFavorites`
- `getDefaultFavorites`

移植先ではこの2つだけ `app/demo/invoices/mockFavorites.ts` のようなローカルファイルへ切り出すのが簡単です。

## npm 依存

最低限この route で直接使っています。

- `next`
- `react`
- `date-fns`
- `lucide-react`
- `sonner`
- `react-device-detect`
- `react-to-print`
- `react-day-picker`
- `@radix-ui/react-dialog`
- `@radix-ui/react-tabs`
- `@radix-ui/react-select`
- `@radix-ui/react-popover`
- `@radix-ui/react-checkbox`

`DemoUserCheckDialog` を本番コンポーネントのまま持っていく場合は追加で以下も必要です。

- `react-draggable`

## おすすめの移植方針

### 1. 最短で 1:1 コピーしたい場合

以下をまとめて持っていきます。

- `app/demo/invoices/*`
- `app/demo/reservations/mockData.ts`
- `app/usersCheck/components/UserCheckDialog_preview.tsx`
- `app/usersCheck/components/UserCheckDialog_receipt.tsx`
- 型、hooks、shared UI、globals.css の関連一式

この方法は早いですが、依存が広がります。

### 2. きれいに移植したい場合

以下の置き換えを先にやるのがおすすめです。

- `UserDetail` / `ServiceHistory` 参照をデモ専用型に置き換える
- `DemoAddServiceDialog` のお気に入り参照をローカル mock に置き換える
- `DemoUserCheckDialog` から `usersCheck` 依存を外す

特に `DemoUserCheckDialog` をローカル完結にできると、`/demo/invoices` 一式だけで持ち出しやすくなります。

## このリポジトリで確認した依存の中心

- [app/demo/invoices/page.tsx](/Users/eriko/dev/prj/konoyubi/app/demo/invoices/page.tsx:1)
- [app/demo/invoices/components/DemoUserCheckDialog.tsx](/Users/eriko/dev/prj/konoyubi/app/demo/invoices/components/DemoUserCheckDialog.tsx:1)
- [app/demo/invoices/components/DemoAddServiceDialog.tsx](/Users/eriko/dev/prj/konoyubi/app/demo/invoices/components/DemoAddServiceDialog.tsx:1)

## 次にやるとよいこと

別リポジトリのパスが分かれば、こちらで次まで進められます。

1. 移植先に実際にコピー
2. import path を移植先構成に合わせて修正
3. 足りない依存をローカル型・ローカル mock に置き換え
4. `npm run dev` ベースで起動確認
