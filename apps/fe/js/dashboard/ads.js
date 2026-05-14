(() => {
  // Loader ADS giữ thứ tự file con để trang chạy ổn định, từng file vẫn dễ kiểm tra dưới ngưỡng 30KB.
  const current = document.currentScript?.getAttribute('src') || '../js/dashboard/ads.js';
  const base = current.replace(/ads\.js(?:\?.*)?$/, 'ads/');
  const version = 'ads-promotion-live-20260513b';
  const files = [
  "ads-state-nav-utils.js",
  "ads-guard-core.js",
  "ads-dashboard-render.js",
  "ads-campaign-modals.js",
  "ads-top-picks.js",
  "ads-discount-cards.js",
  "ads-discount-actions.js",
  "ads-promotion-core.js",
  "ads-promotion-browser-detail.js",
  "ads-promotion-queue-guard.js",
  "ads-dashboard-sync-init.js"
];
  for (const file of files) {
    document.write('<script src="' + base + file + '?v=' + version + '"><\/script>');
  }
})();
