import { assertDatabaseEnv } from './env';

type QueryResultRow = object;

export interface QueryResult<T extends QueryResultRow> {
  rows: T[];
}

export interface DatabaseClient {
  query<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export async function withTransaction<T>(
  run: (db: DatabaseClient) => Promise<T>
): Promise<T> {
  const db = await getDb();

  await db.query('begin');
  try {
    const result = await run(db);
    await db.query('commit');
    return result;
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}

let clientPromise: Promise<DatabaseClient> | null = null;

export async function getDb(): Promise<DatabaseClient> {
  if (!clientPromise) {
    clientPromise = createClient();
  }

  return clientPromise;
}

async function createClient(): Promise<DatabaseClient> {
  const env = assertDatabaseEnv();

  try {
    const pg = await import('pg');
    const client = new pg.Client({
      connectionString: env.databaseUrl,
      ssl: env.sslMode === 'disable' ? false : { rejectUnauthorized: false }
    });

    await client.connect();
    await ensureSchemaCompatibility(client as DatabaseClient);
    return client as DatabaseClient;
  } catch (error) {
    throw new Error(
      `PostgreSQL client is not ready. Install 'pg' and verify DATABASE_URL. Original error: ${String(error)}`
    );
  }
}

async function ensureSchemaCompatibility(db: DatabaseClient): Promise<void> {
  await db.query(`
    alter table projects
    add column if not exists default_invoice_date_mode text not null default 'monthEnd'
      check (default_invoice_date_mode in ('visit', 'monthEnd', 'custom'))
  `);
}
