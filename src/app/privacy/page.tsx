import Link from 'next/link';

export const metadata = {
  title: 'プライバシーポリシー | konoyubi Invoices',
  description: 'konoyubi Invoices のプライバシーポリシー'
};

export default function PrivacyPage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">Privacy Policy</p>
        <h1 className="page-title-static">プライバシーポリシー</h1>
        <p>
          konoyubi Invoices は、請求書作成や Google スプレッドシート連携に必要な範囲でのみ
          利用者情報と Google API のアクセス権を取り扱います。
        </p>
        <div className="hero-actions">
          <Link className="button-link primary" href="/guide">
            サービス案内へ戻る
          </Link>
          <Link className="button-link secondary" href="/terms">
            利用規約
          </Link>
          <Link className="button-link secondary" href="/projects">
            ワークベンチを開く
          </Link>
        </div>
      </section>

      <section className="card legal-card" style={{ marginTop: 24 }}>
        <h2>1. 取得する情報</h2>
        <p>
          本アプリは、請求書作成と source スプレッドシート連携のために、利用者が入力した案件情報、発行者情報、
          Google スプレッドシートの識別子、ならびに Google OAuth によって付与されたアクセス権を利用します。
        </p>

        <h2>2. 利用目的</h2>
        <p>取得した情報は、次の目的に限って利用します。</p>
        <ul>
          <li>請求書データの表示、編集、書き出し</li>
          <li>Google スプレッドシートの作成、更新、接続確認</li>
          <li>発行者情報の source スプレッドシートへの反映</li>
          <li>障害調査や運用上の保守対応</li>
        </ul>

        <h2>3. Google ユーザーデータの取扱い</h2>
        <p>
          Google API へのアクセスは、利用者が明示的に開始した処理に限って行います。現在の実装では、
          `spreadsheets` と `drive.file` の権限を利用し、本アプリが作成または接続対象として指定された
          スプレッドシートに対してのみ操作を行います。
        </p>
        <p>
          取得した Google ユーザーデータを広告目的で利用したり、第三者へ販売したりすることはありません。
        </p>

        <h2>4. 第三者提供</h2>
        <p>
          法令に基づく場合を除き、取得した情報を本人の同意なく第三者へ提供しません。ただし、
          Google スプレッドシート連携のために Google の提供する API を利用します。
        </p>

        <h2>5. 安全管理</h2>
        <p>
          アクセス制御、環境変数による資格情報管理、運用上必要なログ確認など、合理的な安全管理措置を講じます。
        </p>

        <h2>6. 保存期間と削除</h2>
        <p>
          保存された設定情報やローカルデータは、運用上必要な期間保持されることがあります。削除依頼や取扱いに関する
          お問い合わせは、運営者が別途案内する窓口で受け付けます。
        </p>

        <h2>7. 改定</h2>
        <p>
          本ポリシーは、必要に応じて更新されます。重要な変更がある場合は、本ページの内容を更新して通知します。
        </p>

        <p className="source-meta" style={{ marginTop: 24 }}>
          最終更新日: 2026年7月6日
        </p>
        <p className="source-meta">
          お問い合わせ: <a href="mailto:asagaorino@gmail.com">asagaorino@gmail.com</a>
        </p>
      </section>
    </main>
  );
}
