#!/usr/bin/env node
/**
 * Background poller. Hits the app's /api/check endpoint on an interval so
 * monitoring + email alerts keep running even when no browser tab is open.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 INTERVAL_SECONDS=30 node scripts/poll.mjs
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";
const INTERVAL = Number(process.env.INTERVAL_SECONDS || 30) * 1000;

async function pass() {
  try {
    const res = await fetch(`${BASE}/api/check`, { method: "POST" });
    const data = await res.json();
    const stamp = new Date().toLocaleTimeString();
    console.log(
      `[${stamp}] checked ${data.checked} · in stock ${data.inStock} · alerts ${data.alertsFired}`
    );
  } catch (err) {
    console.error(`[poll] error: ${err.message}`);
  }
}

console.log(`SnagBot poller → ${BASE} every ${INTERVAL / 1000}s`);
await pass();
setInterval(pass, INTERVAL);
