// SnagBot extension — content script.
//
// Runs on Amazon / Walmart / Target pages inside YOUR logged-in session.
//  1. Detects whether the current page is a tracked product.
//  2. Reads real stock/price from the live DOM and reports it to the app.
//  3. If the item is armed for auto-buy AND in stock: clicks "add to cart",
//     then navigates to the cart/checkout page — and STOPS there.
//
// HARD SAFETY RULE: this script contains no "place order" / "submit payment"
// click. It deliberately hands control back to you at the final step. It also
// does not touch CAPTCHAs — if one appears, it backs off and just alerts you.

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

  // ---- helpers ----
  const visible = (el) =>
    el && el.offsetParent !== null && !el.disabled && el.getAttribute("aria-disabled") !== "true";

  function findByText(selector, texts) {
    const els = Array.from(document.querySelectorAll(selector));
    return els.find((el) => {
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
    // Try JSON-LD first.
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
    // Fallback: first $-formatted number near a price element.
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

  // ---- retailer-specific add-to-cart + checkout ----
  const RETAILERS = {
    amazon: {
      addToCart: () =>
        document.querySelector("#add-to-cart-button") ||
        document.querySelector('input[name="submit.add-to-cart"]') ||
        findByText("input,button,span", ["add to cart"]),
      buyNow: () =>
        document.querySelector("#buy-now-button") ||
        document.querySelector('input[name="submit.buy-now"]'),
      inStockHint: () =>
        !!(document.querySelector("#add-to-cart-button") || document.querySelector("#buy-now-button")),
      oosHint: () => {
        const a = document.querySelector("#availability")?.innerText?.toLowerCase() || "";
        return a.includes("unavailable") || a.includes("out of stock");
      },
      checkoutUrl: "https://www.amazon.com/gp/cart/view.html",
    },
    walmart: {
      addToCart: () =>
        document.querySelector('[data-automation-id="atc"]') ||
        document.querySelector('[data-testid="add-to-cart-section"] button') ||
        findByText("button", ["add to cart"]),
      buyNow: () => null,
      inStockHint: () => !!findByText("button", ["add to cart"]),
      oosHint: () => {
        const t = document.body.innerText.toLowerCase();
        return t.includes("out of stock") || t.includes("not available");
      },
      checkoutUrl: "https://www.walmart.com/cart",
    },
    target: {
      addToCart: () =>
        document.querySelector('[data-test="shippingButton"]') ||
        document.querySelector('[data-test="orderPickupButton"]') ||
        findByText("button", ["add to cart", "add for shipping"]),
      buyNow: () => null,
      inStockHint: () =>
        !!(
          document.querySelector('[data-test="shippingButton"]') ||
          document.querySelector('[data-test="orderPickupButton"]')
        ),
      oosHint: () => {
        const t = document.body.innerText.toLowerCase();
        return t.includes("out of stock") || t.includes("sold out");
      },
      checkoutUrl: "https://www.target.com/cart",
    },
  };

  function computeStatus(r) {
    if (pageLooksLikeBotCheck()) return "unknown";
    const inStock = r.inStockHint();
    const oos = r.oosHint();
    if (inStock) return "in_stock";
    if (oos) return "out_of_stock";
    return "unknown";
  }

  async function runBuyFlow(r, target) {
    // Guard against re-running in a loop across reloads for the same item.
    const key = `snagbot_bought_${target.id}`;
    if (sessionStorage.getItem(key)) return;

    const btn = r.addToCart();
    if (!visible(btn)) {
      log("add-to-cart not clickable yet");
      return;
    }
    sessionStorage.setItem(key, "1");
    log("ARMED — adding to cart");
    chrome.runtime.sendMessage({
      type: "notify",
      title: "SnagBot: adding to cart",
      message: `${target.title} is in stock — adding to cart and heading to checkout.`,
    });
    btn.click();

    // Give the cart mutation time, then go to the cart/checkout page and STOP.
    await sleep(2500);
    chrome.runtime.sendMessage({
      type: "notify",
      title: "SnagBot: review & place your order",
      message: "Item is in your cart. Opening checkout — you place the final order.",
    });
    location.assign(r.checkoutUrl);
    // Intentionally nothing past here. No place-order click.
  }

  async function main() {
    const r = RETAILERS[retailer];

    // Ask the app (via background) whether this page is a tracked target.
    let resp;
    try {
      resp = await chrome.runtime.sendMessage({ type: "getTargetsForUrl", url: location.href });
    } catch {
      return; // extension context not ready
    }
    const target = resp?.target;
    if (!target) return; // not a tracked product page

    // Wait briefly for the buy box to render.
    await sleep(1200);

    const status = computeStatus(r);
    const price = parsePrice();
    chrome.runtime.sendMessage({ type: "reportStatus", id: target.id, status, price });
    log(`status=${status} price=${price ?? "?"} armed=${target.autoBuy}`);

    if (pageLooksLikeBotCheck()) {
      chrome.runtime.sendMessage({
        type: "notify",
        title: "SnagBot: human check needed",
        message: "The retailer is asking to verify you're human. Auto-buy paused — take over this tab.",
      });
      return;
    }

    const priceOk = target.targetPrice == null || price == null || price <= target.targetPrice;
    if (target.autoBuy && status === "in_stock" && priceOk) {
      await runBuyFlow(r, target);
    }
  }

  main();
})();
