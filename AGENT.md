# AGENT.md

## Purpose

このファイルは、将来 `demo-invoices` をローカル保存運用から PostgreSQL 運用へ切り替えるときの作業メモです。

## Current Assumption

- 現時点では Google Sheets を正本にする運用が前提
- DB が未設定または未接続でも、`.demo-invoices-local-store.json` を使ってローカル保存で動作する
- 複数 PC で選択状態や請求対象の並び順を共有したくなったタイミングで PostgreSQL へ移行する

## Important Files

- `.demo-invoices-local-store.json`
  ローカル保存データ本体。移行元として扱う
- `db/schema.sql`
  PostgreSQL 初期スキーマ
- `src/lib/db/projects.ts`
  案件、明細、選択状態の保存ロジック
- `src/app/projects/[projectId]/project-editor.tsx`
  請求対象の選択と並び替え UI

## Data Model Notes

- 請求対象の選択状態と並び順は `invoice_selections` で管理する
- 並び順は `updatedAt` ベースで復元する実装になっている
- 明細の同一性は実質 `lineId` で管理する
- `lineId` は `customerId + reservationId` を元に安定生成される

## Migration Preconditions

- `reservationId` は安定していること
  これが変わると別明細扱いになり、既存の選択状態や順番を引き継げない
- `.demo-invoices-local-store.json` を消さないこと
  既存の案件、明細、選択状態の移行元になる
- `.env.local` に実際の `DATABASE_URL` を設定できること

## Migration Steps

1. PostgreSQL 接続先を用意する
   Azure を使う場合は `Azure Database for PostgreSQL Flexible Server` を想定
2. `.env.local` の `DATABASE_URL` を実値へ差し替える
3. スキーマを適用する

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

4. 接続確認を行う
   `DATABASE_URL` がプレースホルダのままだと `ENOTFOUND` になる
5. 必要なら `.demo-invoices-local-store.json` のデータを DB へ移す
6. 画面上で以下を確認する
   - 案件一覧が表示される
   - 明細編集が保存される
   - 請求対象の選択が保存される
   - ドラッグ並び替え後、再表示しても順番が維持される
   - スプシ再取り込み後も選択状態と並び順が維持される

## Azure Notes

- 既存の `Azure Cosmos DB` アカウントはこのアプリの PostgreSQL 接続先としては使えない
- 使うのは `Azure Database for PostgreSQL` か `Cosmos DB for PostgreSQL`
- 既存コードをそのまま活かすなら `Azure Database for PostgreSQL` が最も自然
- 開発用途では高コスト構成を避ける
  推奨例:
  - `Dev/Test`
  - `Burstable`
  - `B1ms` または最小構成
  - 高可用性 `無効`

## Verification Checklist

- `.env.local` の `DATABASE_URL` に `USERNAME` や `HOST` のプレースホルダが残っていない
- PostgreSQL 接続エラーでローカル保存へフォールバックしていない
- `.demo-invoices-local-store.json` を参照しなくても同じ案件データが見える
- 別 PC から開いても選択状態と並び順が共有される
