// NEO: Admin shop/SKU đã tách theo tính năng trong ./shops; loader này giữ tương thích nếu HTML cũ vẫn gọi var-shops.js.
(function loadShopAdminChunks() {
    const version = 'core-first-20260513a';
    const chunks = [
        'shops/catalog-summary.js',
        'shops/catalog-preview.js',
        'shops/catalog-editors.js',
        'shops/shop-status-render.js',
        'shops/shop-api-actions.js'
    ];
    if (document.readyState === 'loading') {
        document.write(chunks.map(src => `<script src="../js/admin/${src}?v=${version}"><\/script>`).join(''));
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
