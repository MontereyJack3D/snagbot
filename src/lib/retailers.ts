import type { Retailer } from "./types";

export function detectRetailer(url: string): Retailer {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
  if (host.includes("amazon.")) return "amazon";
  if (host.includes("walmart.")) return "walmart";
  if (host.includes("target.")) return "target";
  return "unknown";
}

export const RETAILER_LABELS: Record<Retailer, string> = {
  amazon: "Amazon",
  walmart: "Walmart",
  target: "Target",
  unknown: "Unknown",
};

export const RETAILER_COLORS: Record<Retailer, string> = {
  amazon: "#ff9900",
  walmart: "#0071dc",
  target: "#cc0000",
  unknown: "#6b7280",
};

/**
 * Best-effort extraction of a stable product id, used for de-duping and for
 * the browser extension to match the page it's on to a watch.
 */
export function extractProductId(url: string, retailer: Retailer): string | null {
  try {
    const u = new URL(url);
    if (retailer === "amazon") {
      const m = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
      return m ? m[1].toUpperCase() : null;
    }
    if (retailer === "walmart") {
      const m = u.pathname.match(/\/ip\/(?:.*\/)?(\d+)/);
      return m ? m[1] : null;
    }
    if (retailer === "target") {
      const m = u.pathname.match(/\/A-(\d+)/);
      return m ? m[1] : null;
    }
  } catch {
    return null;
  }
  return null;
}
