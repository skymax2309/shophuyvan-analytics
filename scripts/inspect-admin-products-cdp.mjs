import fs from "node:fs/promises";
import path from "node:path";

const DEBUG_BASE = "http://127.0.0.1:9333";
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, ".browser-profiles", "shipxanh", "reference");
const TARGET_URL = `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/admin-products.html?v=${Date.now()}`;

async function getAppTab() {
  const pages = await fetch(`${DEBUG_BASE}/json/list`).then((r) => r.json());
  const tab = pages.find((p) => p.url?.includes("shophuyvan-analytics.nghiemchihuy.workers.dev/pages/admin-products"))
    || pages.find((p) => p.url?.includes("shophuyvan-analytics.nghiemchihuy.workers.dev"));
  if (!tab) throw new Error("No shophuyvan tab found on Chrome debug port 9333.");
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

const tab = await getAppTab();
const cdp = await connect(tab.webSocketDebuggerUrl);

await cdp.send("Runtime.enable");
await cdp.send("Page.enable");
await cdp.send("Network.enable");
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
await cdp.send("Emulation.setDeviceMetricsOverride", {
  width: 1920,
  height: 925,
  deviceScaleFactor: 1,
  mobile: false,
});

await cdp.send("Page.navigate", { url: TARGET_URL });
await cdp.send("Runtime.evaluate", {
  expression: "document.readyState === 'complete' ? true : new Promise(r => addEventListener('load', () => r(true), {once:true}))",
  awaitPromise: true,
  returnByValue: true,
});
await new Promise((resolve) => setTimeout(resolve, 1500));
await cdp.send("Runtime.evaluate", {
  expression: "window.switchTab && window.switchTab('shops')",
  awaitPromise: false,
});
await new Promise((resolve) => setTimeout(resolve, 2500));

const summaryExpr = `(() => {
  const visible = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
  };
  const text = (el) => (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const table = document.querySelector(".api-shop-table");
  return {
    title: document.title,
    url: location.href,
    activeSideItem: [...document.querySelectorAll(".side-menu .tab-btn.active")].map(text),
    tableVisible: table ? visible(table) : false,
    tableRect: table ? rect(table) : null,
    headers: [...document.querySelectorAll(".api-shop-table th")].map(text),
    productSyncButtons: [...document.querySelectorAll("button")].filter((btn) => text(btn).includes("Cập nhật sản phẩm") || text(btn).includes("Cần kết nối API")).map((btn) => ({ text: text(btn), disabled: btn.disabled })).slice(0, 20),
    rows: [...document.querySelectorAll(".api-shop-table tbody tr")].slice(0, 10).map((tr) => text(tr).slice(0, 400)),
    bodySample: text(document.body).slice(0, 1800)
  };
})()`;

const evaluated = await cdp.send("Runtime.evaluate", {
  expression: summaryExpr,
  returnByValue: true,
  awaitPromise: true,
});

await fs.mkdir(OUT_DIR, { recursive: true });
const summaryPath = path.join(OUT_DIR, "live-admin-products-shops-summary.json");
await fs.writeFile(summaryPath, JSON.stringify(evaluated.result.value, null, 2), "utf8");

const screenshot = await cdp.send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: false,
  fromSurface: true,
});
const screenshotPath = path.join(OUT_DIR, "live-admin-products-shops-visible.png");
await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

cdp.close();

console.log(JSON.stringify({ summaryPath, screenshotPath, ...evaluated.result.value }, null, 2));
