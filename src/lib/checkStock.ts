import * as cheerio from "cheerio";
import type { Retailer, StockStatus } from "./types";

export interface StockResult {
  status: StockStatus;
  price: number | null;
  title: string | null;
  /** Human-readable note about how the result was derived / why it's unknown. */
  note?: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchHtml(url: string): Promise<{ ok: boolean; html: string; status: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    const html = await res.text();
    return { ok: res.ok, html, status: res.status };
  } catch {
    return { ok: false, html: "", status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

function parsePriceFromJsonLd($: cheerio.CheerioAPI): number | null {
  const scripts = $('script[type="application/ld+json"]');
  for (const el of scripts.toArray()) {
    try {
      const data = JSON.parse($(el).text());
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        const offers = node?.offers;
        const offerList = Array.isArray(offers) ? offers : offers ? [offers] : [];
        for (const offer of offerList) {
          const p = parseFloat(offer?.price ?? offer?.lowPrice);
          if (!Number.isNaN(p)) return p;
        }
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return null;
}

function parseTitle($: cheerio.CheerioAPI): string | null {
  return (
    $('meta[property="og:title"]').attr("content") ||
    $("title").first().text().trim() ||
    null
  );
}

/**
 * Server-side stock/price check. This is BEST-EFFORT: Target, Walmart, and
 * Amazon actively block datacenter/server requests, so a check will often come
 * back "unknown" from a hosted server. The reliable signal for these sites is
 * the browser extension reporting from your real logged-in session — this
 * function is the lightweight fallback and works well for many Amazon pages.
 */
export async function checkStock(url: string, _retailer: Retailer): Promise<StockResult> {
  const { ok, html, status } = await fetchHtml(url);

  if (!html) {
    return { status: "unknown", price: null, title: null, note: "No response (network error or timeout)." };
  }
  if (!ok) {
    return {
      status: "unknown",
      price: null,
      title: null,
      note: `Blocked or error (HTTP ${status}). Use the extension for reliable checks on this retailer.`,
    };
  }

  const $ = cheerio.load(html);
  const title = parseTitle($);
  const price = parsePriceFromJsonLd($);
  const text = $("body").text().toLowerCase();

  // If the page is a bot-check / captcha interstitial, don't guess.
  if (
    text.includes("enter the characters you see below") ||
    text.includes("are you a human") ||
    text.includes("verify you are a human") ||
    text.includes("robot check")
  ) {
    return {
      status: "unknown",
      price,
      title,
      note: "Retailer served a bot-check page. Use the extension (your real browser) for this item.",
    };
  }

  const oos = [
    "out of stock",
    "currently unavailable",
    "sold out",
    "not available",
    "temporarily out of stock",
    "get notified when it's back",
  ];
  const inStock = [
    "add to cart",
    "add to bag",
    "in stock",
    "buy now",
    "ship it",
    "pick up today",
  ];

  const looksOos = oos.some((s) => text.includes(s));
  const looksInStock = inStock.some((s) => text.includes(s));

  let stock: StockStatus = "unknown";
  if (looksInStock && !looksOos) stock = "in_stock";
  else if (looksOos && !looksInStock) stock = "out_of_stock";
  else if (looksInStock && looksOos) stock = "in_stock"; // add-to-cart present wins

  return {
    status: stock,
    price,
    title,
    note:
      stock === "unknown"
        ? "Could not determine stock from the page markup."
        : undefined,
  };
}
