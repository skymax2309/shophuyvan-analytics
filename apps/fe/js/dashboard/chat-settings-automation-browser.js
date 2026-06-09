(() => {
  const PRESETS = {
    compact: { width: 620, height: 480, left: 0, top: 0 },
    top_right: { width: 620, height: 480, left: 1260, top: 0 },
    desktop: { width: 1200, height: 800, left: 0, top: 0 },
    custom: null
  };

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(Math.max(number, min), max);
  }

  function field($, id) {
    return typeof $ === "function" ? $(id) : null;
  }

  function applyPreset(runtime = {}) {
    const $ = runtime.$;
    const preset = field($, "automationBrowserPreset")?.value || "compact";
    const bounds = PRESETS[preset];
    if (!bounds) return;
    field($, "automationBrowserWidth").value = bounds.width;
    field($, "automationBrowserHeight").value = bounds.height;
    field($, "automationBrowserLeft").value = bounds.left;
    field($, "automationBrowserTop").value = bounds.top;
  }

  function collect(runtime = {}) {
    const $ = runtime.$;
    return {
      automation_browser_preset: field($, "automationBrowserPreset")?.value || "compact",
      automation_browser_width: clampNumber(field($, "automationBrowserWidth")?.value, 300, 1600, 620),
      automation_browser_height: clampNumber(field($, "automationBrowserHeight")?.value, 320, 1000, 480),
      automation_browser_left: clampNumber(field($, "automationBrowserLeft")?.value, 0, 2400, 0),
      automation_browser_top: clampNumber(field($, "automationBrowserTop")?.value, 0, 1400, 0),
      automation_browser_hidden: false
    };
  }

  function fill(runtime = {}) {
    const $ = runtime.$;
    const settings = runtime.state?.settings || {};
    if (field($, "automationBrowserPreset")) field($, "automationBrowserPreset").value = settings.automation_browser_preset || "compact";
    if (field($, "automationBrowserWidth")) field($, "automationBrowserWidth").value = settings.automation_browser_width || 620;
    if (field($, "automationBrowserHeight")) field($, "automationBrowserHeight").value = settings.automation_browser_height || 480;
    if (field($, "automationBrowserLeft")) field($, "automationBrowserLeft").value = settings.automation_browser_left || 0;
    if (field($, "automationBrowserTop")) field($, "automationBrowserTop").value = settings.automation_browser_top || 0;
  }

  function bind(runtime = {}) {
    const $ = runtime.$;
    field($, "automationBrowserPreset")?.addEventListener("change", () => applyPreset(runtime));
    ["automationBrowserWidth", "automationBrowserHeight", "automationBrowserLeft", "automationBrowserTop"].forEach((id) => {
      field($, id)?.addEventListener("input", () => {
        if (field($, "automationBrowserPreset")) field($, "automationBrowserPreset").value = "custom";
      });
    });
  }

  window.ShopHuyVanAutomationBrowserSettings = { collect, fill, bind };
})();
