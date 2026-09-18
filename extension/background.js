// SnagBot extension — background service worker.
//
// Responsibilities:
//  - Hold config (app URL, poll interval, whether to auto-open tabs).
//  - Fetch the armed auto-buy targets from the SnagBot web app.
//  - On a timer, reload armed product tabs (or open them) so the content
//    script re-checks stock in your real, logged-in session.
//  - Relay the app API for content scripts (avoids cross-origin/CORS issues:
//    the service worker has host permission for localhost).
//
// SAFETY: this worker never places an order. It only tells content scripts to
// check stock and, when armed, add-to-cart + navigate to checkout.

const DEFAULTS = {
  apiBase: "http://localhost:3000",
  pollSeconds: 45,
  autoOpenTabs: false, // if true, open background tabs for armed items to monitor while away
  enabled: true,
};

async function getConfig() {
  const stored = await chrome.storage.local.get("config");
  return { ...DEFAULTS, ...(stored.config || {}) };
}

async function setConfig(patch) {
  const cfg = await getConfig();
  const next = { ...cfg, ...patch };
  await chrome.storage.local.set({ config: next });
  await rescheduleAlarm(next.pollSeconds);
  return next;
}

async function rescheduleAlarm(pollSeconds) {
  await chrome.alarms.clear("poll");
  chrome.alarms.create("poll", { periodInMinutes: Math.max(0.25, pollSeconds / 60) });
}

async function fetchTargets() {
  const cfg = await getConfig();
  try {
    const res = await fetch(`${cfg.apiBase}/api/extension/targets`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.targets || [];
  } catch {
    return [];
  }
}

async function reportStatus(id, status, price) {
  const cfg = await getConfig();
  try {
    await fetch(`${cfg.apiBase}/api/watches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...(typeof price === "number" ? { lastPrice: price } : {}) }),
    });
  } catch {
    /* app may be offline; ignore */
  }
}

function matchTarget(targets, url) {
  return targets.find((t) => {
    if (t.productId && url.includes(t.productId)) return true;
    return url.split("?")[0] === t.url.split("?")[0];
  });
}

async function pollPass() {
  const cfg = await getConfig();
  if (!cfg.enabled) return;
  const targets = await fetchTargets();
  await chrome.storage.local.set({ targetsCache: targets, lastPoll: Date.now() });

  const armed = targets.filter((t) => t.autoBuy);
  if (armed.length === 0) return;

  const tabs = await chrome.tabs.query({
    url: ["https://*.amazon.com/*", "https://*.walmart.com/*", "https://*.target.com/*"],
  });

  for (const t of armed) {
    const openTab = tabs.find((tab) => tab.url && matchTarget([t], tab.url));
    if (openTab) {
      // Re-check by reloading; the content script re-runs on load.
      chrome.tabs.reload(openTab.id).catch(() => {});
    } else if (cfg.autoOpenTabs) {
      chrome.tabs.create({ url: t.url, active: false }).catch(() => {});
    }
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const cfg = await getConfig();
  await rescheduleAlarm(cfg.pollSeconds);
});
chrome.runtime.onStartup.addListener(async () => {
  const cfg = await getConfig();
  await rescheduleAlarm(cfg.pollSeconds);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "poll") pollPass();
});

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon128.png",
    title,
    message,
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case "getConfig":
        sendResponse(await getConfig());
        break;
      case "setConfig":
        sendResponse(await setConfig(msg.patch || {}));
        break;
      case "getTargetsForUrl": {
        const targets = await fetchTargets();
        await chrome.storage.local.set({ targetsCache: targets });
        sendResponse({ target: matchTarget(targets, msg.url) || null });
        break;
      }
      case "getTargets":
        sendResponse({ targets: await fetchTargets() });
        break;
      case "reportStatus":
        await reportStatus(msg.id, msg.status, msg.price);
        sendResponse({ ok: true });
        break;
      case "pollNow":
        await pollPass();
        sendResponse({ ok: true });
        break;
      case "notify":
        notify(msg.title, msg.message);
        sendResponse({ ok: true });
        break;
      default:
        sendResponse({ error: "unknown message" });
    }
  })();
  return true; // keep the channel open for async sendResponse
});
