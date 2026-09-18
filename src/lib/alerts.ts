import { randomUUID } from "crypto";
import { sendAlertEmail } from "./email";
import { addEvent, updateWatch } from "./store";
import type { AlertEvent, Settings, StockStatus, Watch } from "./types";

function minutesSince(iso: string | null): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

function meetsPrice(watch: Watch, price: number | null): boolean {
  if (watch.targetPrice == null) return true;
  if (price == null) return true;
  return price <= watch.targetPrice;
}

async function logEvent(
  watchId: string,
  type: AlertEvent["type"],
  message: string,
  price: number | null,
  url: string
) {
  await addEvent({
    id: randomUUID(),
    watchId,
    type,
    message,
    price,
    url,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Shared alert decision, used by BOTH the server-side poller (runCheck) and the
 * extension status report (PATCH /api/watches/[id]). Fires an email on the
 * out-of-stock -> in-stock transition, or on a qualifying price drop, honoring
 * the per-item cooldown. Returns whether an alert was sent.
 *
 * The caller is responsible for persisting the new status/price on the watch;
 * this only handles the alert side effects (email, event log, lastAlertedAt).
 */
export async function evaluateAndAlert(
  watch: Watch,
  newStatus: StockStatus,
  newPrice: number | null,
  settings: Settings
): Promise<boolean> {
  const wasInStock = watch.status === "in_stock";
  const nowInStock = newStatus === "in_stock";
  const priceDropped =
    watch.targetPrice != null &&
    newPrice != null &&
    newPrice <= watch.targetPrice &&
    (watch.lastPrice == null || newPrice < watch.lastPrice);

  const cooldownOk = minutesSince(watch.lastAlertedAt) >= settings.alertCooldownMinutes;
  const shouldAlert =
    cooldownOk &&
    ((nowInStock && !wasInStock && meetsPrice(watch, newPrice)) || priceDropped);

  if (!shouldAlert) return false;

  const reason: "in_stock" | "price_drop" = nowInStock && !wasInStock ? "in_stock" : "price_drop";
  const emailResult = await sendAlertEmail(settings, { watch, price: newPrice, reason });
  await logEvent(
    watch.id,
    reason,
    `${reason === "in_stock" ? "Back in stock" : "Price drop"} — ${emailResult.note}`,
    newPrice,
    watch.url
  );
  await updateWatch(watch.id, { lastAlertedAt: new Date().toISOString() });
  return true;
}
