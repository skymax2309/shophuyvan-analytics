import fs from "node:fs/promises";
import path from "node:path";

const DEBUG_BASE = "http://127.0.0.1:9333";
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, ".browser-profiles", "shipxanh", "reference");

async function getShipXanhTab() {
  const pages = await fetch(`${DEBUG_BASE}/json/list`).then((r) => r.json());
  const tab = pages.find((p) => p.url?.includes("app.shipxanh.com/dashboard/connect/shops/batch-edit-products"))
    || pages.find((p) => p.url?.includes("app.shipxanh.com"));
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

const clickResult = await cdp.send("Runtime.evaluate", {
  expression: `(() => {
    const visible = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.visibility !== "hidden" && s.display !== "none" && r.width > 0 && r.height > 0;
    };
    const text = (el) => (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
    const btn = [...document.querySelectorAll("button,[role=button]")].find((el) => visible(el) && text(el).includes("Sửa chi tiết"));
    if (!btn) return { ok: false, reason: "Không thấy nút Sửa chi tiết" };
    btn.click();
    const r = btn.getBoundingClientRect();
    return { ok: true, text: text(btn), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
  })()`,
  returnByValue: true,
  awaitPromise: true,
});

await new Promise((resolve) => setTimeout(resolve, Number(process.env.SHIPXANH_WAIT_MS || 3500)));

const summaryExpr = `(() => {
  const visible = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.visibility !== "hidden" && s.display !== "none" && r.width > 0 && r.height > 0;
  };
  const text = (el) => (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
  const val = (el) => el?.value || el?.getAttribute?.("value") || el?.getAttribute?.("placeholder") || "";
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const pick = (sel, limit = 80) => [...document.querySelectorAll(sel)].filter(visible).slice(0, limit).map((el) => ({
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute("type") || "",
    cls: String(el.className || "").slice(0, 120),
    name: el.getAttribute("name") || "",
    placeholder: el.getAttribute("placeholder") || "",
    value: val(el).slice(0, 160),
    text: text(el).slice(0, 240),
    rect: rect(el)
  })).filter((x) => x.text || x.placeholder || x.value || x.name);
  const containers = pick(".ant-modal,.ant-drawer,.ant-form,.ant-card,.ant-tabs,.ant-table,.ant-row,.ant-col,form,[class*=modal],[class*=drawer],[class*=form],[class*=Form]", 80);
  return {
    title: document.title,
    url: location.href,
    clickResult: ${JSON.stringify(clickResult.result.value)},
    headings: pick("h1,h2,h3,h4,.ant-modal-title,.ant-drawer-title,[class*=title],[class*=Title]", 60),
    tabs: pick(".ant-tabs-tab, [role=tab], .ant-segmented-item, .ant-radio-button-wrapper", 60),
    labels: pick("label,.ant-form-item-label,.ant-form-item,.ant-descriptions-item,.ant-row,.ant-col", 140),
    fields: pick("input,textarea,select,.ant-select,.ant-input-number,.ant-upload,.ant-checkbox-wrapper,.ant-radio-wrapper", 140),
    buttons: pick("button,[role=button]", 100),
    containers: containers.slice(0, 40),
    bodySample: text(document.body).slice(0, 9000)
  };
})()`;

const evaluated = await cdp.send("Runtime.evaluate", {
  expression: summaryExpr,
  returnByValue: true,
  awaitPromise: true,
});

await fs.mkdir(OUT_DIR, { recursive: true });
const summaryPath = path.join(OUT_DIR, "shipxanh-product-form-summary.json");
await fs.writeFile(summaryPath, JSON.stringify(evaluated.result.value, null, 2), "utf8");
const screenshot = await cdp.send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: false,
  fromSurface: true,
});
const screenshotPath = path.join(OUT_DIR, "shipxanh-product-form-visible.png");
await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

cdp.close();

console.log(JSON.stringify({
  summaryPath,
  screenshotPath,
  clickResult: evaluated.result.value?.clickResult,
  headings: evaluated.result.value?.headings?.slice(0, 12),
  tabs: evaluated.result.value?.tabs?.slice(0, 20),
  fields: evaluated.result.value?.fields?.slice(0, 30),
  buttons: evaluated.result.value?.buttons?.slice(0, 30),
}, null, 2));
