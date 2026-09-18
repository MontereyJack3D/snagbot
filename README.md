# SnagBot

A web-based **restock monitor + auto-buy assist** for Amazon, Walmart, and Target.

Track products, get an **email the instant something comes back in stock or drops below your
target price**, and let a lightweight **browser extension** auto-add the item to your cart and
jump you to checkout — running entirely inside *your own logged-in browser*.

> **What it deliberately does NOT do:** it never enters your payment details, never places the
> final order (it stops at the "Place order" screen for you), and never solves CAPTCHAs or spoofs
> your browser fingerprint. Those are the things that get real accounts and cards banned — and
> they're the line this tool holds on purpose. It won't out-race a scalper *botnet* on a
> 300ms-sellout; it *will* make you dramatically faster on normal restocks and when you're present.

---

## Two parts

| Part | What it is | What it does |
|------|-----------|--------------|
| **Web app** (this repo) | Next.js dashboard | Track products, poll stock/price, send email alerts, store your armed auto-buy list |
| **Browser extension** (`/extension`) | Chrome MV3 extension | Reliable stock checks from your real session + the auto-buy-to-checkout flow |

Retailers actively block server-side requests, so the **web app's own checks are best-effort**
(they work often for Amazon, less so for Walmart/Target). The **extension is the reliable path** —
it reads the live page in your logged-in browser and reports authoritative stock back to the app.

---

## Run the web app

```bash
npm install
npm run dev          # http://localhost:3000
```

1. Open the dashboard, click **Settings**, add your **alert email**.
   - Leave SMTP off to have alerts logged to the server console (good for testing).
   - Turn SMTP on and fill in a provider (Gmail app password, SendGrid, Mailgun, Resend SMTP…) to get real emails.
2. Paste an Amazon/Walmart/Target product URL, optionally set a **max price**, and click **Track**.
3. Toggle **Live** on (polls every 30s while the tab is open), or click **Check all now**.

### Keep monitoring while the browser is closed

```bash
npm run poll         # hits /api/check every 30s; set BASE_URL / INTERVAL_SECONDS to change
```

Or point any cron at `POST /api/check` (e.g. Vercel Cron, or a system crontab).

---

## Install the browser extension (auto-buy assist)

1. Go to `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked** and select the `extension/` folder.
3. Click the SnagBot icon → set the **app URL** (default `http://localhost:3000`) → **Save**.
4. In the web app, toggle **Auto-buy** on for any item you want it to grab.
5. Keep that product's tab open (or enable **Auto-open tabs** in the popup to monitor while away).

When an armed item is in stock (and within your target price), the extension adds it to your cart,
opens checkout, and notifies you — **you place the order**.

> Retailer page structures change often. The add-to-cart selectors live in
> [`extension/content.js`](extension/content.js) and are easy to update if a site changes.

---

## Data & storage

- **Local dev:** with no `DATABASE_URL`, the app uses a zero-dependency JSON store under `/data`.
- **Production:** set `DATABASE_URL` and it uses **Postgres** ([`src/lib/store-pg.ts`](src/lib/store-pg.ts))
  — tables are created automatically on first use. The selector lives in
  [`src/lib/store.ts`](src/lib/store.ts).

## Deploy to Vercel

This repo is wired for Vercel. Because retailers block server-side checks, **real-time detection
and email alerts are driven by the browser extension** (it reports stock via
`PATCH /api/watches/:id`, which fires alerts through the same path as the server poller). So you do
**not** need frequent server cron.

1. **Add a database.** In the Vercel project → **Storage** → create a Postgres store (Neon, free
   tier). Vercel adds `DATABASE_URL` to the project automatically. (Any Postgres works — paste its
   connection string as `DATABASE_URL` if you bring your own.)
2. **Add email env (optional).** For real emails, set your SMTP creds in **Settings → Environment
   Variables**, or just configure SMTP in-app (stored in the DB). Leave off to log alerts.
3. **Deploy.** Every push to the production branch auto-deploys.
4. **Point the extension** at your deployed URL (`https://<your-app>.vercel.app`) in its popup.

> **Cron note:** Vercel **Hobby** crons run only **once/day**, so `vercel.json`'s cron is just a
> daily backstop for the server-side check. Real-time monitoring runs in your browser via the
> extension + the dashboard's live polling. Upgrade to Pro (or use an external pinger hitting
> `/api/check`) if you want frequent *server-side* checks without a browser open.

## Legit-use note

This is built for a normal shopper buying for themselves on their own account. Automated purchasing
can violate retailer Terms of Service; you're responsible for how you use it. It intentionally omits
the evasion features (proxy rotation, CAPTCHA solving, fingerprint spoofing, multi-account) that
industrial scalping operations rely on.
