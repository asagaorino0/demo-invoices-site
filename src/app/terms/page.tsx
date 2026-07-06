import Link from 'next/link';

export const metadata = {
  title: '利用規約 | demo-invoices workbench',
  description: 'demo-invoices workbench の利用規約'
};

export default function TermsPage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">Terms Of Service</p>
        <h1 className="page-title-static">利用規約</h1>
        <p>
          demo-invoices workbench の利用にあたっては、以下の条件に同意したものとみなします。
        </p>
        <div className="hero-actions">
          <Link className="button-link primary" href="/guide">
            サービス案内へ戻る
          </Link>
          <Link className="button-link secondary" href="/projects">
            ワークベンチを開く
          </Link>
        </div>
      </section>

      <section className="card legal-card" style={{ marginTop: 24 }}>
        <h2>1. 適用</h2>
        <p>
          本規約は、本アプリの提供条件および本アプリの利用に関する運営者と利用者の関係を定めるものです。
        </p>

        <h2>2. 提供内容</h2>
        <p>
          本アプリは、請求書データの編集、Google スプレッドシート連携、プレビュー確認などの機能を提供します。
          運営者は、必要に応じて機能の変更、停止、終了を行うことがあります。
        </p>

        <h2>3. 利用者の責任</h2>
        <ul>
          <li>利用者は、入力データや接続先スプレッドシートの内容について責任を負います。</li>
          <li>利用者は、法令または第三者の権利を侵害する目的で本アプリを利用してはいけません。</li>
          <li>利用者は、OAuth 認証情報や連携設定を適切に管理するものとします。</li>
        </ul>

        <h2>4. 禁止事項</h2>
        <ul>
          <li>不正アクセスまたはこれを試みる行為</li>
          <li>本アプリの運営を妨害する行為</li>
          <li>第三者になりすまして利用する行為</li>
          <li>法令、公序良俗に反する行為</li>
        </ul>

        <h2>5. 免責</h2>
        <p>
          運営者は、本アプリに事実上または法律上の瑕疵がないことを保証するものではありません。利用者が本アプリを
          利用したことにより生じた損害について、運営者は故意または重過失がある場合を除き責任を負いません。
        </p>

        <h2>6. サービス変更・停止</h2>
        <p>
          運営者は、保守、障害対応、法令対応その他の理由により、本アプリの全部または一部を予告なく変更または停止
          することがあります。
        </p>

        <h2>7. 規約の変更</h2>
        <p>
          本規約は、必要に応じて改定されます。改定後は、本ページに掲載した時点から効力を生じます。
        </p>

        <p className="source-meta" style={{ marginTop: 24 }}>
          最終更新日: 2026年7月6日
        </p>
      </section>
    </main>
  );
}
