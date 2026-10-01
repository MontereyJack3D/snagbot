import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { addEvent, getEvents, getWatch } from "@/lib/store";
import type { AlertEventType } from "@/lib/types";

const CORS = { "Access-Control-Allow-Origin": "*" };

export async function GET() {
  const events = await getEvents(50);
  return NextResponse.json({ events });
}

// Lets the extension log an event (e.g. "order placed") into the activity feed.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const watchId = typeof body.watchId === "string" ? body.watchId : "";
  const message = typeof body.message === "string" ? body.message.slice(0, 300) : "";
  if (!watchId || !message) {
    return NextResponse.json({ error: "watchId and message required." }, { status: 400, headers: CORS });
  }
  const type: AlertEventType =
    body.type === "in_stock" || body.type === "price_drop" || body.type === "error"
      ? body.type
      : "auto_buy_started";
  const watch = await getWatch(watchId);
  await addEvent({
    id: randomUUID(),
    watchId,
    type,
    message,
    price: null,
    url: watch?.url ?? "",
    createdAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true }, { headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: { ...CORS, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
  });
}
