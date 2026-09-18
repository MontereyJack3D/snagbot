import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { addWatch, getWatches } from "@/lib/store";
import { detectRetailer } from "@/lib/retailers";
import type { Watch } from "@/lib/types";

export async function GET() {
  const watches = await getWatches();
  return NextResponse.json({ watches });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url.trim() : "";

  if (!url) {
    return NextResponse.json({ error: "A product URL is required." }, { status: 400 });
  }
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "That doesn't look like a valid URL." }, { status: 400 });
  }

  const retailer = detectRetailer(url);
  if (retailer === "unknown") {
    return NextResponse.json(
      { error: "Only Amazon, Walmart, and Target URLs are supported right now." },
      { status: 400 }
    );
  }

  const targetPrice =
    body.targetPrice === "" || body.targetPrice == null
      ? null
      : Number(body.targetPrice);

  if (targetPrice != null && (Number.isNaN(targetPrice) || targetPrice < 0)) {
    return NextResponse.json({ error: "Target price must be a positive number." }, { status: 400 });
  }

  const watch: Watch = {
    id: randomUUID(),
    url,
    retailer,
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : url,
    targetPrice,
    autoBuy: Boolean(body.autoBuy),
    status: "unknown",
    lastPrice: null,
    lastCheckedAt: null,
    lastAlertedAt: null,
    createdAt: new Date().toISOString(),
  };

  await addWatch(watch);
  return NextResponse.json({ watch }, { status: 201 });
}
