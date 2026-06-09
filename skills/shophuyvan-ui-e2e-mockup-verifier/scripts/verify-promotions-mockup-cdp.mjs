#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const DEFAULT_CDP_URL = "http://127.0.0.1:9333";
const DEFAULT_URL = "https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/promotions.html";
const DEFAULT_OUT_DIR = "E:/shophuyvan-runtime/verification/promotions-mockup";
const DEFAULT_TIMEOUT_MS = 45000;

const VIEWPORTS = [
  { name: "desktop", width: 1366, height: 900 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 }
];

const OVERVIEW_SELECTORS = [
  "#promotionOverview",
  "#promotionModuleCards",
  "[data-testid='promotions-overview']",
  "#promotions-overview",
  ".promotions-overview",
  "#promotions-summary",
  ".promotions-summary",
  "[data-section='promotions-overview']"
];

const FLASH_SECTION_SELECTORS = [
  "#promotionFlashAutoPanel",
  "#flashAutoSettingsTab",
  "[data-testid='flash-auto-section']",
  "#flash-auto-section",
  ".flash-auto-section",
  "[data-section='flash-auto']",
  "#flash-auto",
  "section[data-tab='flash-auto']"
];

const FLASH_TAB_SELECTORS = [
  "[data-promo-child-tab='flash-auto']",
  "[data-tab='flash-auto']",
  "[data-target='flash-auto']",
  "#tab-flash-auto",
  "button[aria-controls='flash-auto-section']",
  "button[data-testid='flash-auto-tab']"
];

function parseArgs(argv) {
  const options = {
    url: DEFAULT_URL,
    cdpUrl: DEFAULT_CDP_URL,
    outDir: DEFAULT_OUT_DIR,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--url") {
      options.url = argv[i + 1] || options.url;
      i += 1;
    } else if (arg === "--cdp") {
      options.cdpUrl = argv[i + 1] || options.cdpUrl;
      i += 1;
    } else if (arg === "--out-dir") {
      options.outDir = argv[i + 1] || options.outDir;
      i += 1;
    } else if (arg === "--timeout-ms") {
      const raw = Number(argv[i + 1]);
      if (Number.isFinite(raw) && raw > 0) {
        options.timeoutMs = raw;
      }
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return options;
}

function printHelp() {
  console.log("Usage:");
  console.log(
    "  node skills/shophuyvan-ui-e2e-mockup-verifier/scripts/verify-promotions-mockup-cdp.mjs --url <promotions_url> [--cdp <http://127.0.0.1:9333>] [--out-dir <path>] [--timeout-ms <ms>]"
  );
}

function makeStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function probeSelectors(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    let count = 0;
    try {
      count = await locator.count();
    } catch {
      count = 0;
    }

    if (count > 0) {
      let visible = false;
      try {
        visible = await locator.first().isVisible();
      } catch {
        visible = false;
      }
      return { matched: true, selector, count, visible };
    }
  }

  return { matched: false, selector: null, count: 0, visible: false };
}

async function activateFlashAutoTab(page) {
  for (const selector of FLASH_TAB_SELECTORS) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.isVisible()) {
        await locator.click({ timeout: 2000 });
        return { activated: true, method: "selector", selector };
      }
    } catch {
      // keep trying other selectors
    }
  }

  try {
    const clickedByText = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll("button, a, [role='tab'], [data-tab], [class*='tab']")
      );
      const words = ["flash auto", "flash-auto", "flash sale", "flash", "khuyen mai", "khuyến mãi"];

      const normalize = (value) =>
        String(value || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();

      for (const el of candidates) {
        const text = normalize(el.textContent);
        if (words.some((w) => text.includes(normalize(w)))) {
          el.click();
          return true;
        }
      }
      return false;
    });

    if (clickedByText) {
      return { activated: true, method: "text", selector: null };
    }
  } catch {
    // ignore and return false
  }

  return { activated: false, method: null, selector: null };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(options.outDir);
  const stamp = makeStamp();

  await ensureDir(outDir);

  const summary = {
    generatedAt: new Date().toISOString(),
    cdpUrl: options.cdpUrl,
    url: options.url,
    outputDir: outDir,
    checks: [],
    pass: false,
    failures: []
  };

  let browser;
  try {
    browser = await chromium.connectOverCDP(options.cdpUrl, {
      timeout: options.timeoutMs
    });

    const context = browser.contexts()[0] || (await browser.newContext());

    for (const viewport of VIEWPORTS) {
      const page = await context.newPage();
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await page.goto(options.url, {
        waitUntil: "domcontentloaded",
        timeout: options.timeoutMs
      });

      await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(800);

      const overview = await probeSelectors(page, OVERVIEW_SELECTORS);
      const flashTab = await activateFlashAutoTab(page);

      if (flashTab.activated) {
        await page.waitForTimeout(600);
      }

      const flashAuto = await probeSelectors(page, FLASH_SECTION_SELECTORS);

      const screenshotName = `promotions-mockup-${stamp}-${viewport.name}.png`;
      const screenshotPath = path.join(outDir, screenshotName);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      summary.checks.push({
        viewport,
        screenshotPath,
        overview,
        flashTab,
        flashAuto,
        pass: overview.matched && flashAuto.matched
      });

      await page.close();
    }

    const failedViewports = summary.checks.filter((entry) => !entry.pass);
    summary.pass = failedViewports.length === 0;
    summary.failures = failedViewports.map((entry) => ({
      viewport: entry.viewport.name,
      overviewMatched: entry.overview.matched,
      flashAutoMatched: entry.flashAuto.matched
    }));
  } catch (error) {
    summary.pass = false;
    summary.failures.push({
      type: "runtime_error",
      message: error instanceof Error ? error.message : String(error)
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  const reportPath = path.join(outDir, `promotions-mockup-summary-${stamp}.json`);
  const latestPath = path.join(outDir, "promotions-mockup-summary-latest.json");

  await fs.writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await fs.writeFile(latestPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(`Summary written: ${reportPath}`);
  console.log(`Latest written: ${latestPath}`);

  if (!summary.pass) {
    process.exitCode = 1;
    console.error("Verification failed. Check summary JSON for details.");
  } else {
    console.log("Verification passed for all viewports.");
  }
}

run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
