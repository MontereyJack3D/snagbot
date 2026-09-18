import postgres from "postgres";

/**
 * Lazy Postgres connection (postgres.js). Works with Neon / Vercel Postgres /
 * Supabase / any Postgres via a `DATABASE_URL` connection string.
 *
 * On serverless we keep the pool tiny and disable prepared statements so it
 * plays nicely with connection poolers (Neon pooler / PgBouncer).
 */

let _sql: ReturnType<typeof postgres> | null = null;
let _schemaReady: Promise<void> | null = null;

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function sql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _sql = postgres(url, {
      ssl: "require",
      max: 1,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
    });
  }
  return _sql;
}

export async function ensureSchema(): Promise<void> {
  if (_schemaReady) return _schemaReady;
  const s = sql();
  _schemaReady = (async () => {
    await s`CREATE TABLE IF NOT EXISTS watches (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await s`CREATE TABLE IF NOT EXISTS events (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await s`CREATE TABLE IF NOT EXISTS settings (
      id int PRIMARY KEY,
      data jsonb NOT NULL
    )`;
  })();
  return _schemaReady;
}
