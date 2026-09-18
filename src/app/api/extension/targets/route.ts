import { NextResponse } from "next/server";
import { getWatches } from "@/lib/store";
import { extractProductId } from "@/lib/retailers";

/**
 * Consumed by the browser-extension companion. Returns the items the user has
 * flagged for auto-buy assist, with a stable product id so the extension can
 * match the page it's on. The extension only ever acts inside YOUR own logged-in
 * browser session, and always stops at the final "Place Order" confirmation.
 */
export async function GET() {
  const watches = await getWatches();
  const targets = watches
    .filter((w) => w.autoBuy)
    .map((w) => ({
      id: w.id,
      url: w.url,
      retailer: w.retailer,
      productId: extractProductId(w.url, w.retailer),
      title: w.title,
      targetPrice: w.targetPrice,
      status: w.status,
    }));

  return NextResponse.json(
    { targets },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
