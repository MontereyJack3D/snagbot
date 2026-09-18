/**
 * Storage selector. Uses Postgres when DATABASE_URL is set (production /
 * Vercel), and falls back to the zero-dependency JSON file store for local dev.
 *
 * Both implementations expose the identical API, so the rest of the app never
 * needs to know which one is active.
 */
import { hasDatabase } from "./db";
import * as json from "./store-json";
import * as pg from "./store-pg";

const impl = hasDatabase() ? pg : json;

export const getWatches = impl.getWatches;
export const getWatch = impl.getWatch;
export const addWatch = impl.addWatch;
export const updateWatch = impl.updateWatch;
export const deleteWatch = impl.deleteWatch;
export const getEvents = impl.getEvents;
export const addEvent = impl.addEvent;
export const getSettings = impl.getSettings;
export const saveSettings = impl.saveSettings;
