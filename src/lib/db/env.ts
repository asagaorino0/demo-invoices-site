export interface DatabaseEnv {
  databaseUrl: string;
  databaseName: string;
  sslMode: string;
}

export function getDatabaseEnv(): DatabaseEnv {
  return {
    databaseUrl: process.env.DATABASE_URL || '',
    databaseName: process.env.POSTGRES_DB_NAME || 'konoyubi_invoices',
    sslMode: process.env.POSTGRES_SSL_MODE || 'require'
  };
}

export function assertDatabaseEnv(): DatabaseEnv {
  const env = getDatabaseEnv();

  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

  return env;
}
