import fs from "node:fs/promises";
import path from "node:path";

const DEBUG_BASE = "http://127.0.0.1:9333";
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, ".browser-profiles", "shipxanh", "reference");
const TARGET_URL = "https://app.shipxanh.com/dashboard/stock/products";

async function getShipXanhTab() {
  const pages = await fetch(`${DEBUG_BASE}/json/list`).then((r) => r.json());
  const tab = pages.find((p) => p.type === "page" && p.url === TARGET_URL)
    || pages.find((p) => p.type === "page" && p.url?.includes("app.shipxanh.com/dashboard/stock/products"));
  if (!tab) throw new Error("No ShipXanh stock products tab found on Chrome debug port 9333.");
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

async function wait(cdp, ms = 900) {
  await cdp.send("Runtime.evaluate", {
    expression: `new Promise(resolve => setTimeout(resolve, ${ms}))`,
    awaitPromise: true,
    returnByValue: true,
  });
}

async function evalValue(cdp, expression) {
  const evaluated = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (evaluated.exceptionDetails) {
    throw new Error(evaluated.exceptionDetails.text || "Runtime evaluation failed");
  }
  return evaluated.result.value;
}

const tab = await getShipXanhTab();
const cdp = await connect(tab.webSocketDebuggerUrl);

await cdp.send("Runtime.enable");
await cdp.send("Page.enable");
await cdp.send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});

if (tab.url !== TARGET_URL) {
  await cdp.send("Page.navigate", { url: TARGET_URL });
  await evalValue(cdp, "document.readyState === 'complete' ? true : new Promise(r => addEventListener('load', () => r(true), {once:true}))");
}
await wait(cdp, 1500);

const setup = await evalValue(cdp, `(() => {
  const visible = (el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const text = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
  const buttons = [...document.querySelectorAll('button')].filter(visible).map((button, index) => {
    const rect = button.getBoundingClientRect();
    const icon = [...button.querySelectorAll('svg')].map(svg => svg.getAttribute('class') || '').join(' ');
    return {
      index,
      text: text(button),
      icon,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      html: button.outerHTML.slice(0, 300)
    };
  });
  const wanted = ['lucide-dollar-sign', 'lucide-banknote-arrow-down', 'lucide-square-pen', 'lucide-ellipsis-vertical'];
  const actions = {};
  for (const iconName of wanted) {
    const found = buttons.find(btn => btn.icon.includes(iconName));
    if (found) actions[iconName] = found;
  }
  return {
    url: location.href,
    title: document.title,
    actions,
    firstButtons: buttons.slice(0, 35),
    sample: text(document.body).slice(0, 1200)
  };
})()`);

async function probe(iconName, label) {
  const result = await evalValue(cdp, `(() => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const text = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
    const beforeUrl = location.href;
    const btn = [...document.querySelectorAll('button')].filter(visible).find(button =>
      [...button.querySelectorAll('svg')].some(svg => (svg.getAttribute('class') || '').includes(${JSON.stringify(iconName)}))
    );
    if (!btn) return { label: ${JSON.stringify(label)}, iconName: ${JSON.stringify(iconName)}, found: false, beforeUrl };
    const rect = btn.getBoundingClientRect();
    btn.click();
    return {
      label: ${JSON.stringify(label)},
      iconName: ${JSON.stringify(iconName)},
      found: true,
      beforeUrl,
      clickedRect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
    };
  })()`);
  await wait(cdp, 1200);
  const state = await evalValue(cdp, `(() => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const text = (el) => (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
    const overlays = [...document.querySelectorAll('[role="dialog"],[data-state="open"],.ant-modal,.el-dialog,.modal,.drawer,[class*="Modal"],[class*="modal"],[class*="Drawer"],[class*="drawer"],[class*="Popover"],[class*="popover"],[class*="Dropdown"],[class*="dropdown"],[role="menu"]')]
      .filter(visible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return { tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 160), text: text(el).slice(0, 1400), rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) } };
      })
      .filter(item => item.text);
    const formLabels = [...document.querySelectorAll('label,input,textarea,select,button')].filter(visible).slice(0, 80).map(el => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || '',
      placeholder: el.getAttribute('placeholder') || '',
      text: text(el).slice(0, 180)
    })).filter(item => item.text || item.placeholder);
    return {
      url: location.href,
      overlays,
      formLabels,
      bodySample: text(document.body).slice(0, 2600)
    };
  })()`);

  await evalValue(cdp, `(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const closeButton = [...document.querySelectorAll('button')].find(btn => /^(Đóng|Huỷ|Hủy|Cancel|Close|×)$/i.test((btn.innerText || btn.textContent || '').trim()));
    if (closeButton) closeButton.click();
    return true;
  })()`);
  await wait(cdp, 600);
  if (state.url !== TARGET_URL) {
    await cdp.send("Page.navigate", { url: TARGET_URL });
    await wait(cdp, 1200);
  }
  return { ...result, state };
}

const probes = [];
for (const [iconName, label] of [
  ["lucide-dollar-sign", "Dollar"],
  ["lucide-banknote-arrow-down", "Money/warehouse"],
  ["lucide-square-pen", "Edit"],
  ["lucide-ellipsis-vertical", "More menu"],
]) {
  probes.push(await probe(iconName, label));
}

await fs.mkdir(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, "shipxanh-action-probe.json");
await fs.writeFile(outPath, JSON.stringify({ setup, probes }, null, 2), "utf8");

const shot = await cdp.send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: false,
  fromSurface: true,
});
const screenshotPath = path.join(OUT_DIR, "shipxanh-action-probe-final.png");
await fs.writeFile(screenshotPath, Buffer.from(shot.data, "base64"));
cdp.close();

console.log(JSON.stringify({ outPath, screenshotPath, setup: setup.actions, probes }, null, 2));
