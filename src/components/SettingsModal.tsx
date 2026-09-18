"use client";

import { useEffect, useState } from "react";

interface SettingsForm {
  notifyEmail: string;
  alertCooldownMinutes: number;
  smtp: { host: string; port: number; user: string; pass: string; from: string } | null;
}

export default function SettingsModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [showSmtp, setShowSmtp] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        setForm(d.settings);
        setShowSmtp(Boolean(d.settings?.smtp));
      });
  }, []);

  async function save() {
    if (!form) return;
    setSaving(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notifyEmail: form.notifyEmail,
        alertCooldownMinutes: Number(form.alertCooldownMinutes),
        smtp: showSmtp ? form.smtp ?? {} : null,
      }),
    });
    setSaving(false);
    onSaved();
    onClose();
  }

  function setSmtp(patch: Partial<NonNullable<SettingsForm["smtp"]>>) {
    setForm((f) =>
      f
        ? {
            ...f,
            smtp: {
              host: "",
              port: 587,
              user: "",
              pass: "",
              from: "",
              ...(f.smtp ?? {}),
              ...patch,
            },
          }
        : f
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Settings</h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--foreground)]">
            ✕
          </button>
        </div>

        {!form ? (
          <div className="text-sm text-[var(--muted)]">Loading…</div>
        ) : (
          <div className="space-y-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Alert email</label>
              <input
                type="email"
                value={form.notifyEmail}
                onChange={(e) => setForm({ ...form, notifyEmail: e.target.value })}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                Min minutes between repeat alerts (same item)
              </label>
              <input
                type="number"
                min={0}
                value={form.alertCooldownMinutes}
                onChange={(e) => setForm({ ...form, alertCooldownMinutes: Number(e.target.value) })}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-3">
              <label className="flex cursor-pointer items-center justify-between">
                <span className="text-sm font-medium">Send real emails (SMTP)</span>
                <input
                  type="checkbox"
                  checked={showSmtp}
                  onChange={(e) => setShowSmtp(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
              </label>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Off = alerts are logged to the server console (great for testing). On = fill in your
                provider (e.g. Gmail app password, SendGrid, Mailgun, Resend SMTP).
              </p>

              {showSmtp && (
                <div className="mt-3 space-y-2">
                  {[
                    { key: "host", ph: "smtp.gmail.com", label: "Host" },
                    { key: "user", ph: "username", label: "User" },
                    { key: "pass", ph: "app password", label: "Password" },
                    { key: "from", ph: "SnagBot <you@example.com>", label: "From" },
                  ].map((f) => (
                    <input
                      key={f.key}
                      type={f.key === "pass" ? "password" : "text"}
                      placeholder={f.label + " — " + f.ph}
                      value={(form.smtp?.[f.key as "host" | "user" | "pass" | "from"] as string) ?? ""}
                      onChange={(e) => setSmtp({ [f.key]: e.target.value })}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  ))}
                  <input
                    type="number"
                    placeholder="Port — 587"
                    value={form.smtp?.port ?? 587}
                    onChange={(e) => setSmtp({ port: Number(e.target.value) })}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </div>
              )}
            </div>

            <button
              onClick={save}
              disabled={saving}
              className="w-full rounded-lg bg-[var(--accent)] py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
