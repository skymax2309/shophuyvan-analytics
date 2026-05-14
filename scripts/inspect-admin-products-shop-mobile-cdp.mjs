import fs from "node:fs/promises";
import path from "node:path";

const DEBUG_BASE = "http://127.0.0.1:9333";
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, ".browser-profiles", "shipxanh", "reference");

async function getAppTab() {
  const pages = await fetch(`${DEBUG_BASE}/json/list`).then((r) => r.json());
  const tab = pages.find((p) => p.url?.includes("shophuyvan-analytics.nghiemchihuy.workers.dev"))
    || pages[0];
  if (!tab) throw new Error("No Chrome debug tab found on port 9333.");
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

async function inspectMode(view, filename) {
  const tab = await getAppTab();
  const cdp = await connect(tab.webSocketDebuggerUrl);

  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });

  await cdp.send("Page.navigate", {
    url: `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/admin-products.html?v=${Date.now()}#shops`,
  });
  await cdp.send("Runtime.evaluate", {
    expression: "document.readyState === 'complete' ? true : new Promise(r => addEventListener('load', () => r(true), {once:true}))",
    awaitPromise: true,
    returnByValue: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 2800));
  await cdp.send("Runtime.evaluate", {
    expression: `window.setShopApiView && window.setShopApiView('${view}')`,
    awaitPromise: true,
    returnByValue: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 900));

  const summaryExpr = `(() => {
    const text = (el) => (el?.innerText || el?.textContent || "").replace(/\\s+/g, " ").trim();
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const overflowX = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth;
    return {
      url: location.href,
      viewport: { w: innerWidth, h: innerHeight, scrollW: document.documentElement.scrollWidth, overflowX },
      activeSideItem: [...document.querySelectorAll(".side-menu .tab-btn.active")].map(text),
      activeMode: [...document.querySelectorAll(".shop-api-mode-tabs button.active")].map(text),
      summary: text(document.querySelector("#shop-api-summary")),
      options: text(document.querySelector(".shop-api-options")),
      visibleRows: [...document.querySelectorAll(".api-shop-table tbody tr")].slice(0, 4).map((tr) => text(tr).slice(0, 300)),
      firstRowRect: document.querySelector(".api-shop-table tbody tr") ? rect(document.querySelector(".api-shop-table tbody tr")) : null,
      toolbarRect: document.querySelector(".shop-api-toolbar") ? rect(document.querySelector(".shop-api-toolbar")) : null,
      productButtons: [...document.querySelectorAll(".api-shop-table button")].map(text).slice(0, 12)
    };
  })()`;

  const evaluated = await cdp.send("Runtime.evaluate", {
    expression: summaryExpr,
    returnByValue: true,
    awaitPromise: true,
  });

  await fs.mkdir(OUT_DIR, { recursive: true });
  const summaryPath = path.join(OUT_DIR, `${filename}.json`);
  await fs.writeFile(summaryPath, JSON.stringify(evaluated.result.value, null, 2), "utf8");

  const screenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  const screenshotPath = path.join(OUT_DIR, `${filename}.png`);
  await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

  cdp.close();
  return { summaryPath, screenshotPath, ...evaluated.result.value };
}

const connectSummary = await inspectMode("connect", "live-admin-products-shops-mobile-connect");
const productSummary = await inspectMode("products", "live-admin-products-shops-mobile-products");

console.log(JSON.stringify({ connectSummary, productSummary }, null, 2));
