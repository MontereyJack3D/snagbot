export type Retailer = "amazon" | "walmart" | "target" | "unknown";

export type StockStatus = "in_stock" | "out_of_stock" | "unknown";

export interface Watch {
  id: string;
  url: string;
  retailer: Retailer;
  title: string;
  /** Only alert/auto-buy if price is at or below this (in dollars). null = any price. */
  targetPrice: number | null;
  /** Whether the auto-buy assist (browser extension) should act on this item. */
  autoBuy: boolean;
  // Runtime state, updated by the checker.
  status: StockStatus;
  lastPrice: number | null;
  lastCheckedAt: string | null;
  /** Last time we fired an in-stock alert, to avoid spamming on every poll. */
  lastAlertedAt: string | null;
  createdAt: string;
}

export type AlertEventType = "in_stock" | "price_drop" | "error" | "auto_buy_started";

export interface AlertEvent {
  id: string;
  watchId: string;
  type: AlertEventType;
  message: string;
  price: number | null;
  url: string;
  createdAt: string;
}

export interface Settings {
  /** Email address alerts are sent to. */
  notifyEmail: string;
  /** Minimum minutes between repeat alerts for the same item. */
  alertCooldownMinutes: number;
  /** SMTP config (optional). If unset, alerts are logged only. */
  smtp: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
  } | null;
}
