import { ensureSchema, sql } from "./db";
import type { Watch, AlertEvent, Settings } from "./types";

/**
 * Postgres-backed store. Mirrors the API of store-json.ts exactly so the rest
 * of the app is storage-agnostic. Each record is kept as a JSONB blob to avoid
 * column drift as the shape evolves.
 */

const DEFAULT_SETTINGS: Settings = {
  notifyEmail: "",
  alertCooldownMinutes: 10,
  smtp: null,
};

// Wrap a typed record as a JSONB value for postgres.js. Our interfaces don't
// carry an index signature, which postgres.js's JSONValue type requires.
function jsonb(value: object) {
  return sql().json(value as unknown as Record<string, never>);
}

// ---- Watches ----

export async function getWatches(): Promise<Watch[]> {
  await ensureSchema();
  const rows = await sql()<{ data: Watch }[]>`
    SELECT data FROM watches ORDER BY created_at DESC`;
  return rows.map((r) => r.data);
}

export async function getWatch(id: string): Promise<Watch | undefined> {
  await ensureSchema();
  const rows = await sql()<{ data: Watch }[]>`
    SELECT data FROM watches WHERE id = ${id} LIMIT 1`;
  return rows[0]?.data;
}

export async function addWatch(watch: Watch): Promise<void> {
  await ensureSchema();
  await sql()`
    INSERT INTO watches (id, data, created_at)
    VALUES (${watch.id}, ${jsonb(watch)}, ${watch.createdAt})
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`;
}

export async function updateWatch(
  id: string,
  patch: Partial<Watch>
): Promise<Watch | undefined> {
  await ensureSchema();
  const current = await getWatch(id);
  if (!current) return undefined;
  const next = { ...current, ...patch };
  await sql()`UPDATE watches SET data = ${jsonb(next)} WHERE id = ${id}`;
  return next;
}

export async function deleteWatch(id: string): Promise<void> {
  await ensureSchema();
  await sql()`DELETE FROM watches WHERE id = ${id}`;
}

// ---- Events ----

export async function getEvents(limit = 100): Promise<AlertEvent[]> {
  await ensureSchema();
  const rows = await sql()<{ data: AlertEvent }[]>`
    SELECT data FROM events ORDER BY created_at DESC LIMIT ${limit}`;
  return rows.map((r) => r.data);
}

export async function addEvent(event: AlertEvent): Promise<void> {
  await ensureSchema();
  await sql()`
    INSERT INTO events (id, data, created_at)
    VALUES (${event.id}, ${jsonb(event)}, ${event.createdAt})
    ON CONFLICT (id) DO NOTHING`;
  // Keep the log bounded.
  await sql()`
    DELETE FROM events WHERE id IN (
      SELECT id FROM events ORDER BY created_at DESC OFFSET 500
    )`;
}

// ---- Settings ----

export async function getSettings(): Promise<Settings> {
  await ensureSchema();
  const rows = await sql()<{ data: Partial<Settings> }[]>`
    SELECT data FROM settings WHERE id = 1 LIMIT 1`;
  return { ...DEFAULT_SETTINGS, ...(rows[0]?.data ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await ensureSchema();
  await sql()`
    INSERT INTO settings (id, data) VALUES (1, ${jsonb(settings)})
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`;
}
