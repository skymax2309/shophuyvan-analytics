// NEO: Tài chính marketplace tách theo nhóm query, render và thao tác; loader này giữ tương thích nếu HTML cũ vẫn gọi income.js.
(function loadIncomeChunks() {
  const version = 'core-first-20260513a';
  const chunks = [
    'income/income-core-query.js',
    'income/income-render-overview-shops.js',
    'income/income-render-marketplace-docs.js',
    'income/income-actions-shopee-main.js',
    'income/income-actions-escrow-fee.js',
    'income/income-actions-report-statement.js'
  ];
  if (document.readyState === 'loading') {
    document.write(chunks.map(src => `<script src="../js/dashboard/${src}?v=${version}"><\/script>`).join(''));
    return;
  }
  chunks.reduce((promise, src) => promise.then(() => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL(src + '?v=' + version, document.currentScript?.src || window.location.href).href;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  })), Promise.resolve());
})();
