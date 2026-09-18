import { NextResponse } from "next/server";
import { getEvents } from "@/lib/store";

export async function GET() {
  const events = await getEvents(50);
  return NextResponse.json({ events });
}
