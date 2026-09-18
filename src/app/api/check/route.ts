import { NextResponse } from "next/server";
import { runCheck } from "@/lib/runCheck";

// Trigger a poll pass. Called by the dashboard's live polling, the "Check all
// now" button, and any external cron (e.g. Vercel Cron / a system crontab
// hitting this endpoint).
export async function POST() {
  const summary = await runCheck();
  return NextResponse.json(summary);
}

export async function GET() {
  const summary = await runCheck();
  return NextResponse.json(summary);
}
