import fs from "node:fs/promises";
import path from "node:path";

const DEBUG_BASE = "http://127.0.0.1:9333";
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, ".browser-profiles", "shipxanh", "reference");
const SKU_URL = "shophuyvan-analytics.nghiemchihuy.workers.dev/pages/sku";
const SKU_URL_MATCH = process.env.SKU_URL_MATCH || SKU_URL;

async function getSkuTab() {
  const pages = await fetch(`${DEBUG_BASE}/json/list`).then((r) => r.json());
  const tab = pages.find((p) => p.url?.includes(SKU_URL_MATCH)) || pages.find((p) => p.url?.includes(SKU_URL)) || pages.find((p) => p.url?.includes("shophuyvan-analytics.nghiemchihuy.workers.dev"));
  if (!tab) throw new Error("No SKU tab found on Chrome debug port 9333.");
  return tab;
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let seq = 0;

    ws.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const id = ++seq;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((res, rej) => pending.set(id, { res, rej, method }));
        },
        close() {
          ws.close();
        },
      });
    });

    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id || !pending.has(msg.id)) return;
      const item = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) item.rej(new Error(`${item.method}: ${msg.error.message}`));
      else item.res(msg.result);
    });

    ws.addEventListener("error", reject);
  });
}

const tab = await getSkuTab();
const cdp = await connect(tab.webSocketDebuggerUrl);
await cdp.send("Runtime.enable");
await cdp.send("Page.enable");
await cdp.send("Network.enable");
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
if (process.env.SKU_MOBILE === "1") {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
} else {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1920,
    height: 925,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

if (!tab.url?.includes("/pages/sku")) {
  await cdp.send("Page.navigate", {
    url: `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/sku.html?v=${Date.now()}`,
  });
}

await cdp.send("Runtime.evaluate", {
  expression: "document.readyState === 'complete' ? true : new Promise(r => addEventListener('load', () => r(true), {once:true}))",
  awaitPromise: true,
  returnByValue: true,
});
await new Promise((resolve) => setTimeout(resolve, 2500));
if (process.env.SKU_TAB) {
  await cdp.send("Runtime.evaluate", {
    expression: `window.switchSkuTab && window.switchSkuTab(${JSON.stringify(process.env.SKU_TAB)})`,
    awaitPromise: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 800));
}
await cdp.send("Runtime.evaluate", {
  expression: "window.scrollTo(0, 0)",
  awaitPromise: false,
});
await new Promise((resolve) => setTimeout(resolve, 200));
if (process.env.SKU_OPEN_VARIANTS === "1") {
  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const visible = (el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
      };
      const btn = [...document.querySelectorAll(".stock-card-actions button[title='Cập nhật nhanh']")].find(visible);
      if (btn) btn.click();
      return Boolean(btn);
    })()`,
    awaitPromise: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 600));
}
if (process.env.SKU_OPEN_COMBO === "1") {
  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const visible = (el) => {
        if (!el) return false;
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
      };
      const panel = [...document.querySelectorAll(".stock-variant-panel.is-open")].find(visible);
      const btn = panel?.querySelector(".stock-combo-action");
      if (btn) btn.click();
      return Boolean(btn);
    })()`,
    awaitPromise: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 600));
} else {
  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      if (typeof window.closeComboModal === "function") window.closeComboModal();
      const el = document.querySelector("#comboModal");
      if (el) el.style.display = "none";
    })()`,
    awaitPromise: false,
  });
}

const summaryExpr = `(() => {
  const visible = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
  };
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const firstCard = [...document.querySelectorAll(".stock-product-card")].find(visible);
  const openPanel = [...document.querySelectorAll(".stock-variant-panel.is-open")].find(visible);
  return {
    title: document.title,
    url: location.href,
    cardCount: [...document.querySelectorAll(".stock-product-card")].filter(visible).length,
    hasGrid: getComputedStyle(document.querySelector("#skuNoPriceTable,#skuHasPriceTable,#skuMissingMapTable,#skuComboTable") || document.body).display,
    firstCard: firstCard ? rect(firstCard) : null,
    openPanel: openPanel ? rect(openPanel) : null,
    openPanelPosition: openPanel ? getComputedStyle(openPanel).position : "",
    comboActionCount: openPanel ? openPanel.querySelectorAll(".stock-combo-action").length : 0,
    sideNav: document.querySelector(".side-nav") ? rect(document.querySelector(".side-nav")) : null,
    container: document.querySelector(".container") ? rect(document.querySelector(".container")) : null,
    managementCard: document.querySelector(".sku-management-card") ? rect(document.querySelector(".sku-management-card")) : null,
    toolbar: document.querySelector(".sku-list-toolbar") ? rect(document.querySelector(".sku-list-toolbar")) : null,
    tabs: document.querySelector(".sku-filter-tabs") ? rect(document.querySelector(".sku-filter-tabs")) : null,
    listArea: document.querySelector(".sku-list-area") ? rect(document.querySelector(".sku-list-area")) : null,
    exportVisible: Boolean([...document.querySelectorAll(".sku-list-toolbar button")].find((btn) => visible(btn) && btn.textContent.includes("Export"))),
    importVisible: Boolean([...document.querySelectorAll(".sku-list-toolbar button")].find((btn) => visible(btn) && btn.textContent.includes("Import"))),
    firstMedia: document.querySelector(".stock-card-media") ? rect(document.querySelector(".stock-card-media")) : null,
    firstActions: [...document.querySelectorAll(".stock-card-actions button")].slice(0, 4).map((btn) => ({ text: btn.textContent.trim(), ...rect(btn) })),
    metricRects: openPanel ? [...openPanel.querySelectorAll(".stock-variant-row .stock-metric")].slice(0, 4).map(rect) : [],
    firstStockChipText: document.querySelector(".stock-stock-chip")?.textContent?.trim() || "",
    firstPriceText: document.querySelector(".stock-card-price")?.textContent?.trim() || "",
    comboModal: (() => {
      const el = document.querySelector("#comboModal");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        display: s.display,
        visible: s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0,
        title: document.querySelector("#comboTargetSku")?.textContent?.trim() || "",
        saveVisible: Boolean(document.querySelector("#btnSaveCombo"))
      };
    })(),
    bodySample: document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, 1200)
  };
})()`;

const evaluated = await cdp.send("Runtime.evaluate", {
  expression: summaryExpr,
  returnByValue: true,
  awaitPromise: true,
});

await fs.mkdir(OUT_DIR, { recursive: true });
const suffix = `${process.env.SKU_MOBILE === "1" ? "mobile" : "desktop"}${process.env.SKU_TAB ? `-${process.env.SKU_TAB}` : ""}`;
const summaryPath = path.join(OUT_DIR, `live-sku-${suffix}-summary.json`);
await fs.writeFile(summaryPath, JSON.stringify(evaluated.result.value, null, 2), "utf8");

const screenshot = await cdp.send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: false,
  fromSurface: true,
});
const screenshotPath = path.join(OUT_DIR, `live-sku-${suffix}-visible.png`);
await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

cdp.close();
console.log(JSON.stringify({ summaryPath, screenshotPath, ...evaluated.result.value }, null, 2));
