import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/store";
import type { Settings } from "@/lib/types";

export async function GET() {
  const settings = await getSettings();
  // Never send the SMTP password back to the client.
  const safe = {
    ...settings,
    smtp: settings.smtp ? { ...settings.smtp, pass: settings.smtp.pass ? "********" : "" } : null,
  };
  return NextResponse.json({ settings: safe });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const current = await getSettings();

  const next: Settings = {
    notifyEmail: typeof body.notifyEmail === "string" ? body.notifyEmail.trim() : current.notifyEmail,
    alertCooldownMinutes:
      typeof body.alertCooldownMinutes === "number" && body.alertCooldownMinutes >= 0
        ? body.alertCooldownMinutes
        : current.alertCooldownMinutes,
    smtp: current.smtp,
  };

  if (body.smtp && typeof body.smtp === "object") {
    const s = body.smtp;
    // Keep existing password if the client sent the masked placeholder.
    const pass =
      s.pass && s.pass !== "********" ? String(s.pass) : current.smtp?.pass ?? "";
    if (s.host || s.user || pass) {
      next.smtp = {
        host: String(s.host ?? current.smtp?.host ?? ""),
        port: Number(s.port ?? current.smtp?.port ?? 587),
        user: String(s.user ?? current.smtp?.user ?? ""),
        pass,
        from: String(s.from ?? current.smtp?.from ?? ""),
      };
    } else {
      next.smtp = null;
    }
  }

  await saveSettings(next);
  return NextResponse.json({ ok: true });
}
