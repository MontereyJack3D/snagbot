import { randomUUID } from "crypto";
import { checkStock } from "./checkStock";
import { evaluateAndAlert } from "./alerts";
import { addEvent, getSettings, getWatches, updateWatch } from "./store";
import type { StockStatus } from "./types";

export interface CheckSummary {
  checked: number;
  inStock: number;
  alertsFired: number;
  results: {
    id: string;
    title: string;
    status: StockStatus;
    price: number | null;
    alerted: boolean;
    note?: string;
  }[];
}

/**
 * Runs one poll pass over every watch: server-side best-effort stock check,
 * fire alerts via the shared evaluator, then persist the new state.
 *
 * Note: on Amazon/Walmart/Target the reliable detector is the browser
 * extension (it reports status via PATCH, which fires alerts through the same
 * evaluateAndAlert path). This server pass is a best-effort backstop.
 */
export async function runCheck(): Promise<CheckSummary> {
  const [watches, settings] = await Promise.all([getWatches(), getSettings()]);
  const summary: CheckSummary = { checked: 0, inStock: 0, alertsFired: 0, results: [] };

  for (const watch of watches) {
    const result = await checkStock(watch.url, watch.retailer);
    summary.checked++;

    const alerted = await evaluateAndAlert(watch, result.status, result.price, settings);
    if (alerted) summary.alertsFired++;

    if (result.status === "unknown" && result.note) {
      await addEvent({
        id: randomUUID(),
        watchId: watch.id,
        type: "error",
        message: result.note,
        price: result.price,
        url: watch.url,
        createdAt: new Date().toISOString(),
      });
    }

    if (result.status === "in_stock") summary.inStock++;

    await updateWatch(watch.id, {
      status: result.status,
      lastPrice: result.price ?? watch.lastPrice,
      title: result.title && watch.title === watch.url ? result.title : watch.title,
      lastCheckedAt: new Date().toISOString(),
    });

    summary.results.push({
      id: watch.id,
      title: watch.title,
      status: result.status,
      price: result.price,
      alerted,
      note: result.note,
    });
  }

  return summary;
}
