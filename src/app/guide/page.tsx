import Link from 'next/link';

export default function GuidePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">Invoice Workbench</p>
        <h1>CSV を取り込んで、案件単位で編集して、CSV に戻す</h1>
        <p>
          このページは開発・確認用の案内です。日常の作業は案件ワークベンチから始める想定にして、
          利用者向けの入口は別にしています。
        </p>

        <div className="hero-actions">
          <Link className="button-link primary" href="/projects">
            案件ワークベンチを開く
          </Link>
          <a className="button-link secondary" href="/invoices.html">
            static demo を開く
          </a>
          <Link className="button-link secondary" href="/api/projects">
            API を確認する
          </Link>
        </div>
      </section>

      <section className="grid">
        <article className="card">
          <h2>いまできること</h2>
          <ul>
            <li>CSV 取込</li>
            <li>新規案件作成</li>
            <li>案件ヘッダ編集</li>
            <li>明細の追加 / 編集 / 複製 / 削除</li>
            <li>月単位の請求対象選択</li>
            <li>請求書 / 領収書プレビュー</li>
            <li>案件単位 CSV 書き出し</li>
          </ul>
        </article>

        <article className="card">
          <h2>実作業の入口</h2>
          <p>
            実際の作業は <code>/projects</code> に寄せています。CSV を取り込んで利用者を選ぶと、
            そのまま右側で編集とプレビューができる構成です。
          </p>
        </article>

        <article className="card">
          <h2>static demo の位置づけ</h2>
          <p>
            <code>invoices.html</code> は配布しやすい公開デモとして残しています。編集作業は Next.js
            側、見本や軽量配布は static 側という役割分担です。
          </p>
        </article>
      </section>
    </main>
  );
}
