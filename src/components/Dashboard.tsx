"use client";

import { useCallback, useEffect, useState } from "react";
import type { AlertEvent, Watch } from "@/lib/types";
import { RetailerBadge, StatusBadge, timeAgo } from "./ui";
import SettingsModal from "./SettingsModal";

const POLL_SECONDS = 30;

export default function Dashboard() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [live, setLive] = useState(false);
  const [checking, setChecking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [countdown, setCountdown] = useState(POLL_SECONDS);
  const [emailSet, setEmailSet] = useState(true);

  const loadWatches = useCallback(async () => {
    const res = await fetch("/api/watches");
    const data = await res.json();
    setWatches(data.watches ?? []);
  }, []);

  const loadEvents = useCallback(async () => {
    const res = await fetch("/api/events");
    const data = await res.json();
    setEvents(data.events ?? []);
  }, []);

  const checkNow = useCallback(async () => {
    setChecking(true);
    try {
      await fetch("/api/check", { method: "POST" });
      await Promise.all([loadWatches(), loadEvents()]);
    } finally {
      setChecking(false);
      setCountdown(POLL_SECONDS);
    }
  }, [loadWatches, loadEvents]);

  const refreshEmailSet = useCallback(async () => {
    const r = await fetch("/api/settings");
    const d = await r.json();
    setEmailSet(Boolean(d.settings?.notifyEmail));
  }, []);

  const toggleLive = useCallback(() => {
    setCountdown(POLL_SECONDS);
    setLive((v) => !v);
  }, []);

  // Initial data load on mount — the standard data-fetching escape hatch.
  useEffect(() => {
    void loadWatches();
    void loadEvents();
    void refreshEmailSet();
  }, [loadWatches, loadEvents, refreshEmailSet]);

  // Live polling loop with a visible countdown.
  useEffect(() => {
    if (!live) return;
    let remaining = POLL_SECONDS;
    const tick = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        remaining = POLL_SECONDS;
        void checkNow();
      }
      setCountdown(remaining);
    }, 1000);
    return () => clearInterval(tick);
  }, [live, checkNow]);

  const inStockCount = watches.filter((w) => w.status === "in_stock").length;

  return (
    <div className="min-h-screen">
      <Header
        live={live}
        toggleLive={toggleLive}
        checking={checking}
        checkNow={checkNow}
        countdown={countdown}
        openSettings={() => setSettingsOpen(true)}
      />

      {!emailSet && (
        <div className="mx-auto max-w-6xl px-4">
          <button
            onClick={() => setSettingsOpen(true)}
            className="mb-4 w-full rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-4 py-2 text-left text-sm text-[var(--warn)]"
          >
            ⚠️ No alert email set yet — click to add one so you actually get pinged.
          </button>
        </div>
      )}

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 pb-16 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <StatsRow total={watches.length} inStock={inStockCount} autoBuy={watches.filter((w) => w.autoBuy).length} />
          <AddWatchForm onAdded={loadWatches} />
          <WatchList watches={watches} onChange={loadWatches} />
        </div>
        <ActivityFeed events={events} watches={watches} />
      </main>

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} onSaved={refreshEmailSet} />
      )}
    </div>
  );
}

function Header(props: {
  live: boolean;
  toggleLive: () => void;
  checking: boolean;
  checkNow: () => void;
  countdown: number;
  openSettings: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 mb-6 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-lg font-black text-black">
            S
          </div>
          <div>
            <div className="text-lg font-bold leading-none">SnagBot</div>
            <div className="text-xs text-[var(--muted)]">restock monitor · auto-buy assist</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={props.toggleLive}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              props.live
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--border)] bg-[var(--panel)] text-[var(--muted)]"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${props.live ? "live-dot bg-[var(--accent)]" : "bg-[var(--muted)]"}`} />
            {props.live ? `Live · ${props.countdown}s` : "Live off"}
          </button>
          <button
            onClick={props.checkNow}
            disabled={props.checking}
            className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
          >
            {props.checking ? "Checking…" : "Check all now"}
          </button>
          <button
            onClick={props.openSettings}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Settings
          </button>
        </div>
      </div>
    </header>
  );
}

function StatsRow({ total, inStock, autoBuy }: { total: number; inStock: number; autoBuy: number }) {
  const cells = [
    { label: "Tracking", value: total },
    { label: "In stock now", value: inStock, accent: inStock > 0 },
    { label: "Auto-buy armed", value: autoBuy },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {cells.map((c) => (
        <div key={c.label} className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
          <div
            className="text-2xl font-bold"
            style={c.accent ? { color: "var(--accent)" } : undefined}
          >
            {c.value}
          </div>
          <div className="text-xs text-[var(--muted)]">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

function AddWatchForm({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [autoBuy, setAutoBuy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/watches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, targetPrice, autoBuy }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setUrl("");
      setTargetPrice("");
      setAutoBuy(false);
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="mb-3 text-sm font-semibold">Track a product</div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste an Amazon, Walmart, or Target product URL"
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
        />
        <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3">
          <span className="text-sm text-[var(--muted)]">$</span>
          <input
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            placeholder="max price"
            inputMode="decimal"
            className="w-24 bg-transparent px-1 py-2.5 text-sm outline-none placeholder:text-[var(--muted)]"
          />
        </div>
        <button
          disabled={busy}
          className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Track"}
        </button>
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[var(--muted)]">
        <input
          type="checkbox"
          checked={autoBuy}
          onChange={(e) => setAutoBuy(e.target.checked)}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        Arm auto-buy assist for this item (browser extension will auto-add to cart & jump to checkout)
      </label>
      {error && <div className="mt-2 text-xs text-[var(--danger)]">{error}</div>}
    </form>
  );
}

function WatchList({ watches, onChange }: { watches: Watch[]; onChange: () => void }) {
  if (watches.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel)] p-10 text-center text-sm text-[var(--muted)]">
        Nothing tracked yet. Paste a product URL above to start watching for restocks.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {watches.map((w) => (
        <WatchCard key={w.id} watch={w} onChange={onChange} />
      ))}
    </div>
  );
}

function WatchCard({ watch, onChange }: { watch: Watch; onChange: () => void }) {
  const [busy, setBusy] = useState(false);

  async function toggleAutoBuy() {
    setBusy(true);
    await fetch(`/api/watches/${watch.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoBuy: !watch.autoBuy }),
    });
    await onChange();
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/watches/${watch.id}`, { method: "DELETE" });
    await onChange();
    setBusy(false);
  }

  const priceStr = watch.lastPrice != null ? `$${watch.lastPrice.toFixed(2)}` : "—";
  const belowTarget =
    watch.targetPrice != null && watch.lastPrice != null && watch.lastPrice <= watch.targetPrice;

  return (
    <div
      className="rounded-xl border bg-[var(--panel)] p-4 transition"
      style={watch.status === "in_stock" ? { borderColor: "var(--accent)" } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <RetailerBadge retailer={watch.retailer} />
            <StatusBadge status={watch.status} />
          </div>
          <a
            href={watch.url}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-sm font-medium hover:underline"
            title={watch.title}
          >
            {watch.title}
          </a>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
            <span>
              Price:{" "}
              <span style={belowTarget ? { color: "var(--accent)", fontWeight: 600 } : { color: "var(--foreground)" }}>
                {priceStr}
              </span>
            </span>
            {watch.targetPrice != null && <span>Target: ${watch.targetPrice.toFixed(2)}</span>}
            <span>Checked {timeAgo(watch.lastCheckedAt)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {watch.status === "in_stock" && (
            <a
              href={watch.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-bold text-black hover:brightness-110"
            >
              Buy now →
            </a>
          )}
          <button
            onClick={toggleAutoBuy}
            disabled={busy}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
              watch.autoBuy
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--muted)]"
            }`}
          >
            {watch.autoBuy ? "⚡ Auto-buy on" : "Auto-buy off"}
          </button>
          <button onClick={remove} disabled={busy} className="text-xs text-[var(--muted)] hover:text-[var(--danger)]">
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function ActivityFeed({ events, watches }: { events: AlertEvent[]; watches: Watch[] }) {
  const titleFor = (id: string) => watches.find((w) => w.id === id)?.title ?? "item";
  const icon: Record<string, string> = {
    in_stock: "🟢",
    price_drop: "💸",
    error: "⚠️",
    auto_buy_started: "⚡",
  };
  return (
    <aside className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="mb-3 text-sm font-semibold">Activity</div>
      {events.length === 0 ? (
        <div className="text-xs text-[var(--muted)]">No alerts yet. Restocks and price drops show up here.</div>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => (
            <li key={e.id} className="flex gap-2 text-xs">
              <span>{icon[e.type] ?? "•"}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{titleFor(e.watchId)}</div>
                <div className="text-[var(--muted)]">{e.message}</div>
                <div className="text-[10px] text-[var(--muted)]">{timeAgo(e.createdAt)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
