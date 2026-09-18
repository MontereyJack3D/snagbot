import nodemailer from "nodemailer";
import type { Settings, Watch } from "./types";

interface AlertPayload {
  watch: Watch;
  price: number | null;
  reason: "in_stock" | "price_drop";
}

function buildEmail(payload: AlertPayload) {
  const { watch, price, reason } = payload;
  const priceStr = price != null ? `$${price.toFixed(2)}` : "price unknown";
  const subject =
    reason === "price_drop"
      ? `💸 Price drop: ${watch.title} (${priceStr})`
      : `🟢 IN STOCK: ${watch.title} (${priceStr})`;

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto">
    <h2 style="margin:0 0 4px">${reason === "price_drop" ? "Price drop" : "Back in stock"}</h2>
    <p style="color:#555;margin:0 0 16px">${watch.title}</p>
    <div style="background:#f4f4f5;border-radius:12px;padding:16px;margin-bottom:16px">
      <div style="font-size:28px;font-weight:700">${priceStr}</div>
      ${watch.targetPrice != null ? `<div style="color:#16a34a;font-size:13px">Target: $${watch.targetPrice.toFixed(2)}</div>` : ""}
    </div>
    <a href="${watch.url}"
       style="display:inline-block;background:#111;color:#fff;text-decoration:none;
              padding:14px 22px;border-radius:10px;font-weight:600">
      Go buy it now →
    </a>
    <p style="color:#999;font-size:12px;margin-top:20px">
      Sent by your SnagBot monitor. Act fast — stock can disappear in seconds.
    </p>
  </div>`;

  const textBody = `${subject}\n\n${watch.title}\n${priceStr}\n\nBuy now: ${watch.url}`;
  return { subject, html, text: textBody };
}

/**
 * Sends an alert email if SMTP is configured; otherwise logs to the console so
 * the app is fully functional out of the box (you'll see alerts in the server
 * log even without an email provider set up).
 */
export async function sendAlertEmail(
  settings: Settings,
  payload: AlertPayload
): Promise<{ sent: boolean; note: string }> {
  const { subject, html, text } = buildEmail(payload);

  if (!settings.notifyEmail) {
    return { sent: false, note: "No notify email set." };
  }
  if (!settings.smtp) {
    console.log(`[ALERT · email not configured] To ${settings.notifyEmail}: ${subject}`);
    return { sent: false, note: "SMTP not configured — logged to console only." };
  }

  try {
    const transport = nodemailer.createTransport({
      host: settings.smtp.host,
      port: settings.smtp.port,
      secure: settings.smtp.port === 465,
      auth: { user: settings.smtp.user, pass: settings.smtp.pass },
    });
    await transport.sendMail({
      from: settings.smtp.from || settings.smtp.user,
      to: settings.notifyEmail,
      subject,
      text,
      html,
    });
    return { sent: true, note: "Email sent." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ALERT · email failed]", msg);
    return { sent: false, note: `Email failed: ${msg}` };
  }
}
