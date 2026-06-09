(() => {
  // Loader ADS mới chỉ nạp UI người vận hành; module kỹ thuật cũ giữ lại để audit caller riêng.
  const current = document.currentScript?.getAttribute('src') || '../js/dashboard/ads.js';
  const base = current.replace(/ads\.js(?:\?.*)?$/, 'ads/');
  const version = 'ads-redesign-20260528h';
  const files = [
    "ads-end-user-ui.js"
];
  for (const file of files) {
    document.write('<script src="' + base + file + '?v=' + version + '"><\/script>');
  }
})();
