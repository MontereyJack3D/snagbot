import type { Retailer, StockStatus } from "@/lib/types";
import { RETAILER_COLORS, RETAILER_LABELS } from "@/lib/retailers";

export function RetailerBadge({ retailer }: { retailer: Retailer }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold"
      style={{
        color: RETAILER_COLORS[retailer],
        background: `${RETAILER_COLORS[retailer]}1a`,
      }}
    >
      {RETAILER_LABELS[retailer]}
    </span>
  );
}

export function StatusBadge({ status }: { status: StockStatus }) {
  const map: Record<StockStatus, { label: string; color: string; bg: string; live?: boolean }> = {
    in_stock: { label: "In stock", color: "#22c55e", bg: "#16351f", live: true },
    out_of_stock: { label: "Out of stock", color: "#9aa0ad", bg: "#20242e" },
    unknown: { label: "Checking…", color: "#f59e0b", bg: "#2a2410" },
  };
  const s = map[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ color: s.color, background: s.bg }}
    >
      <span
        className={`h-2 w-2 rounded-full ${s.live ? "live-dot" : ""}`}
        style={{ background: s.color }}
      />
      {s.label}
    </span>
  );
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
