const $ = (id) => document.getElementById(id);

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

async function load() {
  const cfg = await send({ type: "getConfig" });
  $("apiBase").value = cfg.apiBase;
  $("pollSeconds").value = cfg.pollSeconds;
  $("autoOpenTabs").checked = !!cfg.autoOpenTabs;
  $("enabled").checked = cfg.enabled !== false;
  await renderTargets();
}

async function renderTargets() {
  const { targets } = (await send({ type: "getTargets" })) || { targets: [] };
  const box = $("targets");
  const armed = (targets || []).filter((t) => t.autoBuy);
  if (armed.length === 0) {
    box.innerHTML = `<div class="status">No items armed for auto-buy. Toggle “Auto-buy” on an item in the SnagBot app.</div>`;
    return;
  }
  box.innerHTML = armed
    .map(
      (t) => `
      <div class="t">
        <div class="title">${escapeHtml(t.title)}</div>
        <div style="margin-top:4px;display:flex;justify-content:space-between;align-items:center">
          <span class="pill ${t.status === "in_stock" ? "in" : "out"}">${
            t.status === "in_stock" ? "in stock" : t.status === "out_of_stock" ? "out" : "checking"
          }</span>
          <a href="${t.url}" target="_blank">open ↗</a>
        </div>
      </div>`
    )
    .join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

$("save").addEventListener("click", async () => {
  await send({
    type: "setConfig",
    patch: {
      apiBase: $("apiBase").value.trim().replace(/\/$/, ""),
      pollSeconds: Math.max(15, Number($("pollSeconds").value) || 45),
      autoOpenTabs: $("autoOpenTabs").checked,
      enabled: $("enabled").checked,
    },
  });
  $("status").textContent = "Saved.";
  await renderTargets();
});

$("refresh").addEventListener("click", async () => {
  $("status").textContent = "Syncing…";
  await send({ type: "pollNow" });
  await renderTargets();
  $("status").textContent = "Synced.";
});

load();
