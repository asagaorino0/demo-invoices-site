// Legacy DB mode must not fall back to instance-local files in production.
// Source spreadsheet mode bypasses this DB adapter entirely.
export function shouldUseLocalProjectStore(error: unknown): boolean {
  const message = String(error || '');
  const canFallback =
    message.includes('PostgreSQL client is not ready') ||
    message.includes('DATABASE_URL is not configured') ||
    message.includes('ENOTFOUND') ||
    message.includes('ECONNREFUSED') ||
    message.includes('getaddrinfo');

  if (canFallback && (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1')) {
    const missing = message.includes('DATABASE_URL is not configured');
    const code = missing ? 'project_database_not_configured' : 'project_database_unavailable';
    // Do not log the raw error: connection errors can contain credentials.
    console.error('[project-storage]', { code });
    throw new Error(
      missing
        ? '案件の保存先が未設定です。source スプレッドシートを設定するか、DB 運用の場合は DATABASE_URL を設定してください。 [project_database_not_configured]'
        : '案件の保存先 DB に接続できません。DATABASE_URL・接続権限・DB の稼働状態を確認してください。 [project_database_unavailable]'
    );
  }

  return canFallback;
}
