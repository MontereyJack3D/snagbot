// SnagBot extension — content script.
//
// Runs on Amazon / Walmart / Target pages inside YOUR logged-in session.
//  1. Detects whether the current page is a tracked product.
//  2. Reads real stock/price from the live DOM and reports it to the app.
//  3. If the item is armed for auto-buy AND in stock: clicks "add to cart",
//     then navigates to checkout.
//  4. On the checkout/review page, if AUTO-PLACE-ORDER is enabled, verifies the
//     total is within your price cap and clicks the final "Place order" after a
//     countdown you can abort.
//
// LINES IT HOLDS: it never solves CAPTCHAs, never spoofs your browser, never
// touches your saved payment details (it only clicks a button; your account
// already holds the card). Auto-place-order is OFF by default, fires once per
// item, and aborts if a price cap is set but the total can't be confirmed.

(() => {
  const HOST = location.hostname;
  const retailer = HOST.includes("amazon.")
    ? "amazon"
    : HOST.includes("walmart.")
    ? "walmart"
    : HOST.includes("target.")
    ? "target"
    : null;
  if (!retailer) return;

  const log = (...a) => console.log("[SnagBot]", ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, res));

  const visible = (el) =>
    el && el.offsetParent !== null && !el.disabled && el.getAttribute("aria-disabled") !== "true";

  function findByText(selector, texts) {
    return Array.from(document.querySelectorAll(selector)).find((el) => {
      const t = (el.innerText || el.value || "").trim().toLowerCase();
      return texts.some((x) => t.includes(x));
    });
  }

  function pageLooksLikeBotCheck() {
    const t = document.body?.innerText?.toLowerCase() || "";
    return (
      t.includes("enter the characters you see") ||
      t.includes("are you a human") ||
      t.includes("verify you are a human") ||
      t.includes("/errors/validatecaptcha") ||
      document.title.toLowerCase().includes("robot check")
    );
  }

  function parsePrice() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(s.textContent);
        const nodes = Array.isArray(data) ? data : [data];
        for (const n of nodes) {
          const offers = n?.offers;
          const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
          for (const o of list) {
            const p = parseFloat(o?.price ?? o?.lowPrice);
            if (!Number.isNaN(p)) return p;
          }
        }
      } catch {}
    }
    const el =
      document.querySelector(".a-price .a-offscreen") ||
      document.querySelector('[data-testid="price-wrap"]') ||
      document.querySelector('[data-test="product-price"]');
    if (el) {
      const m = el.textContent.match(/\$([\d,]+\.\d{2})/);
      if (m) return parseFloat(m[1].replace(/,/g, ""));
    }
    return null;
  }

  // Best-effort order total from the checkout/review page. Returns null if it
  // can't be found — the caller treats "can't verify" as a reason to abort when
  // a price cap is set.
  function readOrderTotal() {
    const text = (document.body.innerText || "").toLowerCase();
    for (const label of ["order total", "grand total", "estimated total", "total due", "order summary"]) {
      const i = text.indexOf(label);
      if (i !== -1) {
        const after = text.slice(i, i + 120);
        const m = after.match(/\$([\d,]+\.\d{2})/);
        if (m) return parseFloat(m[1].replace(/,/g, ""));
      }
    }
    return null;
  }

  const RETAILERS = {
    amazon: {
      addToCart: () =>
        document.querySelector("#add-to-cart-button") ||
        document.querySelector('input[name="submit.add-to-cart"]') ||
        findByText("input,button,span", ["add to cart"]),
      inStockHint: () =>
        !!(document.querySelector("#add-to-cart-button") || document.querySelector("#buy-now-button")),
      oosHint: () => {
        const a = document.querySelector("#availability")?.innerText?.toLowerCase() || "";
        return a.includes("unavailable") || a.includes("out of stock");
      },
      checkoutUrl: "https://www.amazon.com/gp/cart/view.html",
      isCheckoutPage: () =>
        /\/(gp\/buy|checkout)/.test(location.pathname) ||
        !!document.querySelector('input[name="placeYourOrder1"], #placeYourOrder, #submitOrderButtonId'),
      proceedToCheckout: () =>
        document.querySelector('input[name="proceedToRetailCheckout"]') ||
        document.querySelector('[data-feature-id="proceed-to-checkout-action"] input') ||
        findByText("input,button,a,span", ["proceed to checkout"]),
      placeOrder: () =>
        document.querySelector('input[name="placeYourOrder1"]') ||
        document.querySelector("#placeYourOrder input") ||
        document.querySelector("#submitOrderButtonId input") ||
        findByText("input,button,span", ["place your order", "place order"]),
    },
    walmart: {
      addToCart: () =>
        document.querySelector('[data-automation-id="atc"]') ||
        document.querySelector('[data-testid="add-to-cart-section"] button') ||
        findByText("button", ["add to cart"]),
      inStockHint: () => !!findByText("button", ["add to cart"]),
      oosHint: () => {
        const t = document.body.innerText.toLowerCase();
        return t.includes("out of stock") || t.includes("not available");
      },
      checkoutUrl: "https://www.walmart.com/checkout",
      isCheckoutPage: () => location.pathname.includes("/checkout"),
      proceedToCheckout: () =>
        findByText("button,a", ["continue to checkout", "check out", "checkout"]),
      placeOrder: () =>
        document.querySelector('[data-automation-id="place-order"]') ||
        document.querySelector('[data-testid="place-order-button"]') ||
        findByText("button", ["place order", "place your order"]),
    },
    target: {
      addToCart: () =>
        document.querySelector('[data-test="shippingButton"]') ||
        document.querySelector('[data-test="orderPickupButton"]') ||
        findByText("button", ["add to cart", "add for shipping"]),
      inStockHint: () =>
        !!(
          document.querySelector('[data-test="shippingButton"]') ||
          document.querySelector('[data-test="orderPickupButton"]')
        ),
      oosHint: () => {
        const t = document.body.innerText.toLowerCase();
        return t.includes("out of stock") || t.includes("sold out");
      },
      checkoutUrl: "https://www.target.com/checkout",
      isCheckoutPage: () => location.pathname.includes("/checkout"),
      proceedToCheckout: () =>
        document.querySelector('[data-test="checkout-button"]') ||
        findByText("button,a", ["checkout", "check out"]),
      placeOrder: () =>
        document.querySelector('[data-test="placeOrderButton"]') ||
        findByText("button", ["place your order", "place order"]),
    },
  };

  function computeStatus(r) {
    if (pageLooksLikeBotCheck()) return "unknown";
    if (r.inStockHint()) return "in_stock";
    if (r.oosHint()) return "out_of_stock";
    return "unknown";
  }

  // ---- abortable countdown overlay ----
  function countdownOverlay(seconds, label) {
    return new Promise((resolve) => {
      const wrap = document.createElement("div");
      wrap.style.cssText =
        "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.72);" +
        "display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif";
      const card = document.createElement("div");
      card.style.cssText =
        "background:#14161d;color:#e7e9ee;border:1px solid #22c55e;border-radius:16px;" +
        "padding:28px 32px;max-width:380px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.6)";
      let remaining = seconds;
      const render = () =>
        (card.innerHTML =
          `<div style="font-size:14px;color:#9aa0ad;margin-bottom:6px">SnagBot auto-checkout</div>` +
          `<div style="font-size:16px;font-weight:600;margin-bottom:10px">${label}</div>` +
          `<div style="font-size:44px;font-weight:800;color:#22c55e;margin-bottom:14px">${remaining}</div>` +
          `<button id="snagbot-cancel" style="width:100%;padding:12px;border-radius:10px;border:0;` +
          `background:#ef4444;color:#fff;font-weight:700;font-size:15px;cursor:pointer">Cancel — don't buy</button>` +
          `<div style="font-size:11px;color:#9aa0ad;margin-top:10px">Placing your order automatically…</div>`);
      render();
      wrap.appendChild(card);
      document.body.appendChild(wrap);
      const cleanup = () => wrap.remove();
      card.querySelector("#snagbot-cancel").onclick = () => {
        clearInterval(t);
        cleanup();
        resolve(false);
      };
      const t = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(t);
          cleanup();
          resolve(true);
        } else {
          render();
          card.querySelector("#snagbot-cancel").onclick = () => {
            clearInterval(t);
            cleanup();
            resolve(false);
          };
        }
      }, 1000);
    });
  }

  const PENDING_KEY = "snagbot_pending_checkout";

  async function startBuyFlow(r, target) {
    const boughtKey = `snagbot_bought_${target.id}`;
    if (sessionStorage.getItem(boughtKey)) return;

    const btn = r.addToCart();
    if (!visible(btn)) {
      log("add-to-cart not clickable yet");
      return;
    }
    sessionStorage.setItem(boughtKey, "1");
    // Remember what we're checking out so the checkout-page pass can verify it.
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ id: target.id, title: target.title, cap: target.targetPrice, ts: Date.now() })
    );
    send({
      type: "notify",
      title: "SnagBot: adding to cart",
      message: `${target.title} is in stock — adding to cart and heading to checkout.`,
    });
    btn.click();
    await sleep(2500);
    location.assign(r.checkoutUrl);
  }

  async function maybePlaceOrder(r, cfg) {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return;
    let pending;
    try {
      pending = JSON.parse(raw);
    } catch {
      sessionStorage.removeItem(PENDING_KEY);
      return;
    }
    // Only act for a fresh, in-progress checkout.
    if (!pending || Date.now() - pending.ts > 10 * 60 * 1000) {
      sessionStorage.removeItem(PENDING_KEY);
      return;
    }

    // Try to advance from cart -> checkout if we're not on the review page yet.
    if (!r.isCheckoutPage()) {
      const proceed = r.proceedToCheckout && r.proceedToCheckout();
      if (visible(proceed)) {
        log("advancing to checkout");
        proceed.click();
      }
      return; // let the next page load run this again
    }

    if (pageLooksLikeBotCheck()) {
      send({
        type: "notify",
        title: "SnagBot: human check at checkout",
        message: "Retailer wants to verify you're human. Auto-checkout paused — finish this one yourself.",
      });
      sessionStorage.removeItem(PENDING_KEY);
      return;
    }

    if (!cfg.autoPlaceOrder) {
      send({
        type: "notify",
        title: "SnagBot: review & place your order",
        message: "Item's in your cart at checkout. Turn on Auto-place-order in the popup to have me click the final button.",
      });
      sessionStorage.removeItem(PENDING_KEY);
      return;
    }

    // Price-cap guardrail: if a cap is set, the total MUST be confirmed <= cap.
    if (pending.cap != null) {
      const total = readOrderTotal();
      if (total == null) {
        send({
          type: "notify",
          title: "SnagBot: couldn't verify total — stopped",
          message: `Won't auto-place because I couldn't read the order total to check it's within $${pending.cap}. Finish manually.`,
        });
        sessionStorage.removeItem(PENDING_KEY);
        return;
      }
      if (total > pending.cap) {
        send({
          type: "notify",
          title: "SnagBot: over your price cap — stopped",
          message: `Order total $${total} is above your $${pending.cap} cap. Not buying.`,
        });
        sessionStorage.removeItem(PENDING_KEY);
        return;
      }
    }

    const placeBtn = r.placeOrder();
    if (!visible(placeBtn)) {
      log("place-order button not found yet");
      return; // may still be rendering; another pass will retry
    }

    // Single-fire: clear now so retries can't double-submit.
    sessionStorage.removeItem(PENDING_KEY);

    const proceed = await countdownOverlay(
      Math.max(2, cfg.placeOrderCountdown || 6),
      `Buying: ${pending.title}`
    );
    if (!proceed) {
      send({ type: "notify", title: "SnagBot: cancelled", message: "You cancelled — no order placed." });
      return;
    }

    log("PLACING ORDER");
    placeBtn.click();
    send({
      type: "notify",
      title: "SnagBot: order placed 🎉",
      message: `Placed your order for ${pending.title}. Check your email for the confirmation.`,
    });
    if (pending.id) {
      send({ type: "reportEvent", id: pending.id, message: "Auto-checkout: order placed" });
    }
  }

  async function main() {
    const cfg = (await send({ type: "getConfig" })) || {};

    // Checkout/cart pass: continue an in-progress auto-buy toward placing the order.
    if (sessionStorage.getItem(PENDING_KEY)) {
      const r = RETAILERS[retailer];
      await sleep(1500);
      await maybePlaceOrder(r, cfg);
      return;
    }

    // Product-page pass: is this a tracked target?
    const resp = await send({ type: "getTargetsForUrl", url: location.href }).catch(() => null);
    const target = resp?.target;
    if (!target) return;

    const r = RETAILERS[retailer];
    await sleep(1200);

    const status = computeStatus(r);
    const price = parsePrice();
    send({ type: "reportStatus", id: target.id, status, price });
    log(`status=${status} price=${price ?? "?"} armed=${target.autoBuy} autoPlaceOrder=${cfg.autoPlaceOrder}`);

    if (pageLooksLikeBotCheck()) {
      send({
        type: "notify",
        title: "SnagBot: human check needed",
        message: "Retailer is asking to verify you're human. Auto-buy paused — take over this tab.",
      });
      return;
    }

    const priceOk = target.targetPrice == null || price == null || price <= target.targetPrice;
    if (target.autoBuy && status === "in_stock" && priceOk) {
      await startBuyFlow(r, target);
    }
  }

  main();
})();
