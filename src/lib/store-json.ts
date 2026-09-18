import { promises as fs } from "fs";
import path from "path";
import type { Watch, AlertEvent, Settings } from "./types";

/**
 * Tiny JSON-file-backed store. Deliberately dependency-free so the app runs
 * with zero external services. Swap this module for a real DB (Postgres,
 * SQLite, etc.) when you deploy somewhere with persistent storage.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const WATCHES_FILE = path.join(DATA_DIR, "watches.json");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

const DEFAULT_SETTINGS: Settings = {
  notifyEmail: "",
  alertCooldownMinutes: 10,
  smtp: null,
};

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown) {
  await ensureDir();
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

// ---- Watches ----

export async function getWatches(): Promise<Watch[]> {
  return readJson<Watch[]>(WATCHES_FILE, []);
}

export async function getWatch(id: string): Promise<Watch | undefined> {
  const all = await getWatches();
  return all.find((w) => w.id === id);
}

export async function saveWatches(watches: Watch[]): Promise<void> {
  await writeJson(WATCHES_FILE, watches);
}

export async function addWatch(watch: Watch): Promise<void> {
  const all = await getWatches();
  all.unshift(watch);
  await saveWatches(all);
}

export async function updateWatch(
  id: string,
  patch: Partial<Watch>
): Promise<Watch | undefined> {
  const all = await getWatches();
  const idx = all.findIndex((w) => w.id === id);
  if (idx === -1) return undefined;
  all[idx] = { ...all[idx], ...patch };
  await saveWatches(all);
  return all[idx];
}

export async function deleteWatch(id: string): Promise<void> {
  const all = await getWatches();
  await saveWatches(all.filter((w) => w.id !== id));
}

// ---- Events ----

export async function getEvents(limit = 100): Promise<AlertEvent[]> {
  const all = await readJson<AlertEvent[]>(EVENTS_FILE, []);
  return all.slice(0, limit);
}

export async function addEvent(event: AlertEvent): Promise<void> {
  const all = await readJson<AlertEvent[]>(EVENTS_FILE, []);
  all.unshift(event);
  // Keep the log bounded.
  await writeJson(EVENTS_FILE, all.slice(0, 500));
}

// ---- Settings ----

export async function getSettings(): Promise<Settings> {
  const stored = await readJson<Partial<Settings>>(SETTINGS_FILE, {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await writeJson(SETTINGS_FILE, settings);
}
