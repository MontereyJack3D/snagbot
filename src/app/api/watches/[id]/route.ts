import { NextResponse } from "next/server";
import { deleteWatch, getSettings, getWatch, updateWatch } from "@/lib/store";
import { evaluateAndAlert } from "@/lib/alerts";
import type { StockStatus, Watch } from "@/lib/types";

const CORS = { "Access-Control-Allow-Origin": "*" };

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const current = await getWatch(id);
  if (!current) return NextResponse.json({ error: "Not found." }, { status: 404, headers: CORS });

  const patch: Partial<Watch> = {};
  if (typeof body.title === "string") patch.title = body.title.trim();
  if (typeof body.autoBuy === "boolean") patch.autoBuy = body.autoBuy;
  if ("targetPrice" in body) {
    patch.targetPrice =
      body.targetPrice === "" || body.targetPrice == null ? null : Number(body.targetPrice);
  }

  // The extension reports authoritative status/price from a real browser.
  const reportedStatus: StockStatus | null =
    body.status === "in_stock" || body.status === "out_of_stock" || body.status === "unknown"
      ? body.status
      : null;
  const reportedPrice = typeof body.lastPrice === "number" ? body.lastPrice : null;

  // Fire the alert on the transition BEFORE we overwrite the stored status,
  // using the same evaluator as the server-side poller.
  let alerted = false;
  if (reportedStatus) {
    const settings = await getSettings();
    alerted = await evaluateAndAlert(current, reportedStatus, reportedPrice, settings);
    patch.status = reportedStatus;
    patch.lastCheckedAt = new Date().toISOString();
  }
  if (reportedPrice != null) patch.lastPrice = reportedPrice;

  const updated = await updateWatch(id, patch);
  return NextResponse.json({ watch: updated, alerted }, { headers: CORS });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteWatch(id);
  return NextResponse.json({ ok: true }, { headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      ...CORS,
      "Access-Control-Allow-Methods": "PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
