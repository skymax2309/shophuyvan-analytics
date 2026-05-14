import fs from "node:fs/promises";
import path from "node:path";

const DEBUG_BASE = "http://127.0.0.1:9333";
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, ".browser-profiles", "shipxanh", "reference");
const TARGET_URL = process.env.SHIPXANH_URL || "https://app.shipxanh.com/dashboard/stock/products";
const OUT_NAME = process.env.SHIPXANH_OUT || (TARGET_URL.includes("/connect/shops") ? "update-products" : "stock-products");

async function getShipXanhTab() {
  const pages = await fetch(`${DEBUG_BASE}/json/list`).then((r) => r.json());
  const tab = pages.find((p) => p.url?.includes("app.shipxanh.com/dashboard/stock/products")) || pages.find((p) => p.url?.includes("app.shipxanh.com"));
  if (!tab) throw new Error("No ShipXanh tab found on Chrome debug port 9333.");
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

const tab = await getShipXanhTab();
const cdp = await connect(tab.webSocketDebuggerUrl);

await cdp.send("Runtime.enable");
await cdp.send("Page.enable");
await cdp.send("Network.enable");
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
await cdp.send("Emulation.setDeviceMetricsOverride", {
  width: Number(process.env.SHIPXANH_WIDTH || 1440),
  height: Number(process.env.SHIPXANH_HEIGHT || 900),
  deviceScaleFactor: 1,
  mobile: false,
});
if (tab.url !== TARGET_URL) {
  await cdp.send("Page.navigate", { url: TARGET_URL });
  await cdp.send("Runtime.evaluate", {
    expression: "document.readyState === 'complete' ? true : new Promise(r => addEventListener('load', () => r(true), {once:true}))",
    awaitPromise: true,
    returnByValue: true,
  });
  await new Promise((resolve) => setTimeout(resolve, Number(process.env.SHIPXANH_WAIT_MS || 8000)));
}

const summaryExpr = `(() => {
  const visible = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.visibility !== "hidden" && s.display !== "none" && r.width > 0 && r.height > 0;
  };
  const text = (el) => (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
  const pick = (sel, limit = 40) => [...document.querySelectorAll(sel)].filter(visible).slice(0, limit).map((el) => ({
    tag: el.tagName.toLowerCase(),
    cls: el.className?.toString?.().slice(0, 140) || "",
    text: text(el).slice(0, 220),
    rect: (() => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })()
  })).filter(x => x.text);
  return {
    title: document.title,
    url: location.href,
    viewport: { w: innerWidth, h: innerHeight },
    headings: pick("h1,h2,h3,.title,[class*=title],[class*=Title]", 30),
    controls: pick("button,a,input,select,[role=button]", 80),
    cards: pick("[class*=card],[class*=Card],[class*=product],[class*=Product],[class*=stock],[class*=Stock],tr,li", 80),
    bodySample: text(document.body).slice(0, 5000)
  };
})()`;

const evaluated = await cdp.send("Runtime.evaluate", {
  expression: summaryExpr,
  returnByValue: true,
  awaitPromise: true,
});

await fs.mkdir(OUT_DIR, { recursive: true });

const summaryPath = path.join(OUT_DIR, `${OUT_NAME}-summary.json`);
await fs.writeFile(summaryPath, JSON.stringify(evaluated.result.value, null, 2), "utf8");

const screenshot = await cdp.send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: false,
  fromSurface: true,
});
const screenshotPath = path.join(OUT_DIR, `${OUT_NAME}-visible.png`);
await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

cdp.close();

console.log(JSON.stringify({
  tab: { title: tab.title, url: tab.url },
  summaryPath,
  screenshotPath,
  viewport: evaluated.result.value?.viewport,
  headings: evaluated.result.value?.headings?.slice(0, 8),
  controls: evaluated.result.value?.controls?.slice(0, 12),
}, null, 2));
