import fs from "node:fs/promises";
import path from "node:path";

const DEBUG_BASE = "http://127.0.0.1:9333";
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, ".browser-profiles", "shipxanh", "reference");

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

async function findSkuTab() {
  const pages = await fetch(`${DEBUG_BASE}/json/list`).then((r) => r.json());
  return (
    pages.find((p) => p.url?.includes("/pages/sku")) ||
    pages.find((p) => p.url?.includes("shophuyvan-analytics.nghiemchihuy.workers.dev"))
  );
}

async function waitForLoad(cdp) {
  await cdp.send("Runtime.evaluate", {
    expression: "document.readyState === 'complete' ? true : new Promise(r => addEventListener('load', () => r(true), {once:true}))",
    awaitPromise: true,
    returnByValue: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 2200));
}

const tab = await findSkuTab();
if (!tab) throw new Error("No shophuyvan SKU tab found on Chrome debug port 9333.");

const cdp = await connect(tab.webSocketDebuggerUrl);
await cdp.send("Runtime.enable");
await cdp.send("Page.enable");
await cdp.send("Network.enable");
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
await cdp.send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});

if (!tab.url?.includes("/pages/sku")) {
  await cdp.send("Page.navigate", {
    url: `https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/sku.html?v=${Date.now()}`,
  });
  await waitForLoad(cdp);
}

await cdp.send("Runtime.evaluate", {
  expression: "window.switchSkuTab && window.switchSkuTab('has-price')",
});
await new Promise((resolve) => setTimeout(resolve, 1000));

const detailInfo = (
  await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const visible = (el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
      };
      const detailButton = [...document.querySelectorAll(".stock-card-actions button")]
        .find((btn) => visible(btn) && (btn.getAttribute("title") || "").includes("chi tiết"));
      const onclick = detailButton?.getAttribute("onclick") || "";
      const match = onclick.match(/product-detail\\.html\\?sku=([^']+)/);
      const sku = match?.[1] || "";
      return {
        onclick,
        sku,
        url: sku ? new URL("product-detail.html?sku=" + encodeURIComponent(sku), location.href).href : ""
      };
    })()`,
    returnByValue: true,
    awaitPromise: true,
  })
).result.value;

if (!detailInfo.url) {
  cdp.close();
  throw new Error(`Cannot find product detail URL. ${JSON.stringify(detailInfo)}`);
}

const summaryExpr = `(() => {
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const wrapper = document.querySelector(".pd-wrapper");
  const table = document.querySelector(".var-table");
  const tableWrap = document.querySelector(".var-table-wrap");
  return {
    title: document.title,
    url: location.href,
    bodyWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    wrapper: wrapper ? rect(wrapper) : null,
    table: table ? rect(table) : null,
    tableWrap: tableWrap ? rect(tableWrap) : null,
    tableMinWidth: table ? getComputedStyle(table).minWidth : "",
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    comboButtons: [...document.querySelectorAll("button,a")]
      .map((el) => el.textContent.trim())
      .filter((text) => /combo/i.test(text)),
    actionBar: document.querySelector(".bottom-actions") ? rect(document.querySelector(".bottom-actions")) : null,
    bodySample: document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, 1000)
  };
})()`;

async function capture(mode, metrics) {
  await cdp.send("Emulation.setDeviceMetricsOverride", metrics);
  await cdp.send("Page.navigate", { url: `${detailInfo.url}&v=${Date.now()}-${mode}` });
  await waitForLoad(cdp);
  const summary = (
    await cdp.send("Runtime.evaluate", {
      expression: summaryExpr,
      returnByValue: true,
      awaitPromise: true,
    })
  ).result.value;

  await fs.mkdir(OUT_DIR, { recursive: true });
  const summaryPath = path.join(OUT_DIR, `live-product-detail-${mode}-summary.json`);
  const screenshotPath = path.join(OUT_DIR, `live-product-detail-${mode}-visible.png`);
  await fs.writeFile(summaryPath, JSON.stringify({ detailInfo, summary }, null, 2), "utf8");
  const screenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true,
  });
  await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
  return { summaryPath, screenshotPath, ...summary };
}

const desktop = await capture("desktop", {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
const mobile = await capture("mobile", {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});

cdp.close();
console.log(JSON.stringify({ detailInfo, desktop, mobile }, null, 2));
