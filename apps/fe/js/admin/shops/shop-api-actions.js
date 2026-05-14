function getCachedShop(shopId) {
    return (window.__shopApiRows || []).find(item => Number(item.id) === Number(shopId));
}

function filteredShopApiRows() {
    const rows = window.__shopApiRows || [];
    const search = (document.getElementById('shop_api_search')?.value || '').trim().toLowerCase();
    const platform = window.shopApiPlatform || '';
    return rows.filter(shop => {
        const shopPlatform = getPlatform(shop);
        if (platform && shopPlatform !== platform) return false;
        if (search && !shopKeyText(shop).includes(search)) return false;
        return true;
    });
}

function renderShopPlatformTabs() {
    const wrap = document.getElementById('shop-api-platform-tabs');
    if (!wrap) return;
    const rows = window.__shopApiRows || [];
    const counts = rows.reduce((acc, shop) => {
        const platform = getPlatform(shop);
        acc[platform] = (acc[platform] || 0) + 1;
        acc.all += 1;
        return acc;
    }, { all: 0 });
    const items = [
        { value: '', label: 'Tất cả', count: counts.all || 0 },
        { value: 'shopee', label: 'Shopee', count: counts.shopee || 0 },
        { value: 'lazada', label: 'Lazada', count: counts.lazada || 0 },
        { value: 'tiktok', label: 'TikTok', count: counts.tiktok || 0 }
    ];
    wrap.innerHTML = items.map(item => `
        <button type="button" class="${(window.shopApiPlatform || '') === item.value ? 'active' : ''}" onclick="setShopApiPlatform('${item.value}')">
            ${escapeHtml(item.label)} <span style="color:${item.count ? '#16a34a' : '#94a3b8'}">${item.count}</span>
        </button>
    `).join('');
}

window.setShopApiPlatform = function(platform) {
    window.shopApiPlatform = platform || '';
    renderShopWarehouses();
};

window.setShopApiView = function(view) {
    const nextView = ['overview', 'price', 'listing', 'connect', 'warnings'].includes(view) ? view : 'overview';
    window.shopApiView = nextView;
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-shops')?.classList.add('active');
    document.querySelectorAll('.side-menu .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('sideShopConnect')?.classList.add('active');
    document.querySelectorAll('[data-shop-panel]').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.shopPanel === nextView);
    });
    document.querySelectorAll('[data-shop-view]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.shopView === nextView);
    });
    if (nextView === 'price' && !(window.catalogPriceEditorRows || []).length) {
        setTimeout(() => loadCatalogPriceEditorRows(), 0);
    }
    if (nextView === 'listing' && !(window.catalogListingEditorRows || []).length) {
        setTimeout(() => loadCatalogListingEditorRows(), 0);
    }
    if (['overview', 'warnings'].includes(nextView) && !window.__productCatalogOverview) {
        // Hai tab tổng quan/cảnh báo cùng đọc core catalog; tự tải khi người vận hành mở tab để tránh kẹt màn loading.
        setTimeout(() => loadProductCatalogOverview(), 0);
    }
    renderShopWarehouses();
};

window.loadShopWarehouses = async function() {
    try {
        if (typeof loadProductCatalogOverview === 'function') loadProductCatalogOverview();
        const res = await fetch(API + '/api/shops/api-configs?t=' + Date.now());
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const rows = (Array.isArray(data) ? data : []).filter(shop => !isTechnicalShopeeRow(shop));
        window.__shopApiRows = rows;
        renderShopPlatformTabs();
        renderCatalogPreviewShopOptions();
        updateCatalogPreviewHelp();
        renderCatalogListingPreviewShopOptions();
        updateCatalogListingPreviewHelp();
        syncCatalogDirectShopOptions();
        window.setShopApiView(window.shopApiView || 'overview');
        renderShopWarehouses();
    } catch (e) {
        notifyShopApi('❌ Lỗi tải danh sách kho/API: ' + e.message, true);
    }
};

window.renderShopWarehouses = function() {
    const wrap = document.getElementById('shop-warehouse-list');
    if (!wrap) return;

    renderShopPlatformTabs();
    const rows = filteredShopApiRows();
    const summary = document.getElementById('shop-api-summary');
    if (summary) {
        const apiActive = rows.filter(shop => String(shop.capability_mode || '') === 'api_active').length;
        const nonApi = rows.filter(shop => String(shop.capability_mode || '') !== 'api_active').length;
        summary.textContent = `${rows.length} shop đang hiển thị • ${apiActive} shop chạy API • ${nonApi} shop đi luồng không API`;
    }

    if (rows.length === 0) {
        wrap.innerHTML = `<div class="direct-empty">Không có shop phù hợp bộ lọc.</div>`;
        return;
    }

    wrap.innerHTML = rows.map(shop => {
        const id = Number(shop.id);
        const platform = platformLabel(shop.platform || shop.Platform);
        const shopName = shop.shop_name || shop.shopName || shop.user_name || '(không rõ tên shop)';
        const source = shop.warehouse_source || 'main';
        const state = getShopApiState(shop);
        const capability = shop.capability_badge || (state.capabilityMode === 'api_active' ? 'Có API' : 'Chưa API');
        const syncButton = renderProductSyncButton(shop);
        const statusHtml = renderStatus(shop);
        const actionsHtml = renderActions(shop);
        const modeClass = state.capabilityMode === 'api_active'
            ? 'is-api'
            : (state.capabilityMode === 'browser_reference' ? 'is-browser' : 'is-manual');
        const capabilityClass = state.capabilityMode === 'api_active' ? 'api' : 'manual';

        return `
            <div class="shop-connect-card ${modeClass}">
                <div class="shop-connect-cell">
                    <div class="shop-connect-label">Shop</div>
                    <div class="shop-connect-badges">
                        <span class="shop-connect-badge platform">${escapeHtml(platform)}</span>
                        <span class="shop-connect-badge ${capabilityClass}">${escapeHtml(capability)}</span>
                    </div>
                    <div class="shop-connect-name" title="${escapeHtml(shopName)}">${escapeHtml(shopName)}</div>
                    <div class="shop-connect-meta" title="${escapeHtml(shop.capability_identity || '')}">${shop.api_shop_id ? `ID: ${escapeHtml(shop.api_shop_id)} • ` : ''}${escapeHtml(shop.capability_identity || '')}</div>
                </div>
                <div class="shop-connect-cell">
                    <div class="shop-connect-label">Luồng</div>
                    ${renderProcessingMode(shop)}
                </div>
                <div class="shop-connect-cell">
                    <div class="shop-connect-label">Kết nối</div>
                    ${statusHtml}
                </div>
                <div class="shop-connect-cell shop-connect-warehouse">
                    <div class="shop-connect-label">Kho</div>
                    <select onchange="updateShopWarehouse(${id}, this.value)" style="padding:8px 12px;border-radius:6px;border:1px solid #cbd5e1;font-size:13px;cursor:pointer;font-weight:700;color:#1e40af;background:#eff6ff;">
                        <option value="main" ${source === 'main' ? 'selected' : ''}>📦 KHO CHÍNH (Bình Tân)</option>
                        <option value="sub" ${source === 'sub' ? 'selected' : ''}>📦 KHO PHỤ</option>
                    </select>
                </div>
                <div class="shop-connect-cell shop-connect-actions">
                    <div class="shop-connect-label">Thao tác</div>
                    ${renderActionGroup('Đồng bộ', [syncButton])}
                    ${actionsHtml}
                </div>
            </div>
        `;
    }).join('');
};

window.showNonApiGuide = function(shopId) {
    const shop = getCachedShop(shopId);
    if (!shop) {
        notifyShopApi('Không tìm thấy shop để xem hướng dẫn.', true);
        return;
    }
    const shopName = shop.shop_name || shop.user_name || 'Shop chưa rõ tên';
    const guide = shop.operator_guide || 'Shop này đang đi theo luồng tham chiếu tay.';
    const steps = shop.supports_browser_reference
        ? '1. Chỉ dùng browser hỗ trợ để kiểm tra hoặc lấy dữ liệu tham chiếu.\n2. Không gắn nhãn “đồng bộ API”.\n3. Nếu cần dữ liệu chuẩn, nên ưu tiên xin API hoặc import file có log.'
        : '1. Dùng dữ liệu nội bộ, file import hoặc thao tác tay có log.\n2. Không bấm nút đồng bộ API cho shop này.\n3. Nếu muốn chạy đồng bộ thật, cần cấu hình và cấp quyền API trước.';
    alert(`${shopName}\n\n${guide}\n\nHướng thao tác:\n${steps}`);
};

window.syncApiProductsForShop = async function(shopId) {
    const shop = getCachedShop(shopId);
    if (!shop?.id) {
        notifyShopApi('Không tìm thấy shop cần đồng bộ bài đăng.', true);
        return;
    }

    const state = getShopApiState(shop);
    if (!shop.supports_product_sync || !['shopee', 'lazada'].includes(state.platform) || !state.connected || state.refreshExpired) {
        notifyShopApi('Shop này chưa có API hợp lệ để đồng bộ bài đăng. Hãy xem phần hướng dẫn của shop không API hoặc kết nối lại API.', true);
        return;
    }
    try {
        let offset = 0;
        let page = 0;
        let hasMore = true;
        const totals = {
            fetched_products: 0,
            synced_products: 0,
            saved_product_knowledge: 0,
            synced_variations: 0,
            saved_product_catalog_snapshots: 0
        };
        while (hasMore && page < 30) {
            page += 1;
            notifyShopApi(`Đang đồng bộ bài đăng lần ${page}, offset ${offset}...`);
            const res = await fetch(API + '/api/products/sync-api-products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform: state.platform,
                    shop: shop.shop_name || shop.user_name || shop.api_shop_id || '',
                    limit: 500,
                    offset,
                    batchLimit: 40,
                    ...getProductSyncOptions()
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) throw new Error(data.error || 'Server tu choi dong bo bai dang');
            totals.fetched_products += Number(data.fetched_products || 0);
            totals.synced_products += Number(data.synced_products || 0);
            totals.saved_product_knowledge += Number(data.saved_product_knowledge || 0);
            totals.synced_variations += Number(data.synced_variations || 0);
            totals.saved_product_catalog_snapshots += Number(data.saved_product_catalog_snapshots || 0);
            const shopResult = Array.isArray(data.shops) ? data.shops[0] : data;
            hasMore = Boolean(shopResult?.has_more || data.has_more);
            const nextOffset = Number(shopResult?.next_offset || data.next_offsets?.[0]?.next_offset || 0);
            if (!hasMore || !nextOffset || nextOffset <= offset) break;
            offset = nextOffset;
        }
        notifyShopApi(
            `Đã làm xong cho ${shop.shop_name || shop.user_name || 'shop'}: ` +
            `${totals.saved_product_knowledge || totals.fetched_products} bài đăng API, ` +
            `${totals.saved_product_catalog_snapshots} snapshot catalog, ` +
            `${totals.synced_variations} SKU sàn được nạp về hệ thống.`
        );
        if (typeof loadVariations === 'function') loadVariations();
        if (typeof loadShopWarehouses === 'function') loadShopWarehouses();
        return;
    } catch (e) {
        notifyShopApi('Lỗi đồng bộ bài đăng: ' + e.message, true);
        return;
    }
};

function summarizeOrderSyncResult(orderData, statusData) {
    const errors = [...(orderData.errors || []), ...(statusData.errors || [])]
        .map(item => `${item.shop || item.platform || 'shop'}: ${item.error}`)
        .filter(Boolean);
    const warnings = [...(orderData.warnings || []), ...(statusData.warnings || [])]
        .map(item => `${item.shop || item.stage || 'cảnh báo'}: ${item.message || item.error || ''}`)
        .filter(Boolean);
    if (errors.length) return errors.slice(0, 2).join(' | ');
    if (warnings.length) return warnings.slice(0, 2).join(' | ');
    return '';
}

window.syncApiOrdersForShop = async function(shopId) {
    const shop = getCachedShop(shopId);
    if (!shop?.id) {
        notifyShopApi('Không tìm thấy shop cần kéo đơn API.', true);
        return;
    }
    const state = getShopApiState(shop);
    if (!['shopee', 'lazada'].includes(state.platform) || !state.connected || state.refreshExpired) {
        notifyShopApi('Shop này chưa đủ điều kiện kéo đơn bằng API. Kiểm tra token và quyền kết nối trước.', true);
        return;
    }

    const shopName = shop.shop_name || shop.user_name || shop.api_shop_id || '';
    notifyShopApi(`Đang kéo đơn và đối soát trạng thái API cho ${shopName}...`);
    try {
        const orderRes = await fetch(API + '/api/orders/sync-api-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                platform: state.platform,
                shop: shopName,
                days: state.platform === 'lazada' ? 90 : 15,
                limit: state.platform === 'lazada' ? 40 : 120,
                fetch_tracking: true,
                fetch_fees: true
            })
        });
        const orderData = await orderRes.json().catch(() => ({}));
        if (!orderRes.ok || orderData.status === 'error') {
            throw new Error(orderData.errors?.[0]?.error || orderData.error || 'Không kéo được đơn API.');
        }

        const statusRes = await fetch(API + '/api/orders/sync-api-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                platform: state.platform,
                shop: shopName,
                days: state.platform === 'lazada' ? 120 : 60,
                limit: state.platform === 'lazada' ? 40 : 120
            })
        });
        const statusData = await statusRes.json().catch(() => ({}));
        if (!statusRes.ok || statusData.status === 'error') {
            throw new Error(statusData.errors?.[0]?.error || statusData.error || 'Không đối soát được trạng thái đơn.');
        }

        const detail = summarizeOrderSyncResult(orderData, statusData);
        const message = `Đã kéo ${Number(orderData.imported_orders || 0).toLocaleString('vi-VN')} đơn, cập nhật ${Number(statusData.updated || 0).toLocaleString('vi-VN')}/${Number(statusData.checked || 0).toLocaleString('vi-VN')} trạng thái.`;
        notifyShopApi(detail ? `${message} Cảnh báo: ${detail}` : message, Boolean(detail));
        loadShopWarehouses();
    } catch (e) {
        notifyShopApi(`Lỗi kéo đơn API ${shopName}: ${e.message}`, true);
        loadShopWarehouses();
    }
};

window.openApiDashboard = function(shopId, section = '') {
    const shop = getCachedShop(shopId);
    const params = new URLSearchParams();
    if (shop?.shop_name) params.set('apiShop', shop.shop_name);
    if (section) params.set('apiSection', section);
    const suffix = params.toString() ? '?' + params.toString() : '';
    window.location.href = 'oms-dashboard.html' + suffix;
};

window.connectShopApi = function(shopId) {
    const shop = getCachedShop(shopId);
    if (!shop?.shop_name) {
        notifyShopApi('❌ Không tìm thấy shop cần kết nối.', true);
        return;
    }
    window.location.href = API + '/api/auth/shopee/url?shop=' + encodeURIComponent(shop.shop_name);
};

window.connectShopeeVideoApi = function(shopId) {
    const shop = getCachedShop(shopId);
    if (!shop?.shop_name) {
        notifyShopApi('❌ Không tìm thấy shop cần kết nối Shopee Video.', true);
        return;
    }
    if (!getShopeeVideoApiState(shop).hasApp) {
        notifyShopApi('❌ Cần lưu Partner ID/Key Shopee Video trước khi kết nối.', true);
        return;
    }
    window.location.href = API + '/api/auth/shopee/video/url?shop=' + encodeURIComponent(shop.shop_name);
};

window.testShopeeVideoApi = async function(shopId) {
    const shop = getCachedShop(shopId);
    if (!shop?.shop_name) {
        notifyShopApi('❌ Không tìm thấy shop cần test quyền video.', true);
        return;
    }
    try {
        notifyShopApi('⏳ Đang test quyền Shopee Video cho ' + (shop.shop_name || 'shop') + '...');
        const res = await fetch(API + '/api/video/test-permission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shop: shop.shop_name })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) throw new Error(data.message || data.error || 'Không test được quyền video');
        notifyShopApi('✅ ' + (data.message || 'Shopee Video API đã test quyền OK.'));
        loadShopWarehouses();
    } catch (e) {
        notifyShopApi('❌ Lỗi test quyền video: ' + e.message, true);
    }
};

window.refreshShopeeVideoToken = async function(shopId) {
    const shop = getCachedShop(shopId);
    if (!shop?.id) {
        notifyShopApi('❌ Không tìm thấy shop cần làm mới token video.', true);
        return;
    }
    try {
        notifyShopApi('⏳ Đang làm mới token Shopee Video cho ' + (shop.shop_name || 'shop') + '...');
        const res = await fetch(API + '/api/shops/force-refresh-video-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shop_id: shop.id })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) throw new Error(data.error || 'Không làm mới được token video');
        notifyShopApi('✅ ' + (data.message || 'Đã làm mới token Shopee Video.'));
        loadShopWarehouses();
    } catch (e) {
        notifyShopApi('❌ Lỗi làm mới token video: ' + e.message, true);
    }
};

window.disconnectShopeeVideoApi = async function(shopId) {
    const shop = getCachedShop(shopId);
    if (!shop?.id) {
        notifyShopApi('❌ Không tìm thấy shop cần ngắt Shopee Video.', true);
        return;
    }
    const ok = confirm('Ngắt riêng Shopee Video API của shop "' + (shop.shop_name || shop.user_name || shop.id) + '"? API chính vẫn giữ nguyên.');
    if (!ok) return;
    try {
        const res = await fetch(API + '/api/shops/disconnect-video-api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shop_id: shop.id })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) throw new Error(data.error || 'Không ngắt được Shopee Video API');
        notifyShopApi('✅ ' + (data.message || 'Đã ngắt riêng Shopee Video API.'));
        loadShopWarehouses();
    } catch (e) {
        notifyShopApi('❌ Lỗi ngắt Shopee Video API: ' + e.message, true);
    }
};

window.connectLazadaApi = function() {
    window.location.href = API + '/api/auth/lazada/url';
};

window.connectLazadaChatApi = function(shopId) {
    const shop = getCachedShop(shopId);
    if (!shop?.id) {
        notifyShopApi('❌ Không tìm thấy shop Lazada cần kết nối chat.', true);
        return;
    }
    window.location.href = API + '/api/auth/lazada/chat/url';
};

window.syncLazadaChatApi = async function(shopId) {
    const shop = getCachedShop(shopId);
    if (!shop?.id) {
        notifyShopApi('❌ Không tìm thấy shop Lazada cần đồng bộ chat.', true);
        return;
    }
    const chatState = getLazadaChatApiState(shop);
    if (!chatState.connected || chatState.accessExpired) {
        notifyShopApi('❌ Lazada Chat API chưa sẵn sàng. Hãy kết nối hoặc gia hạn chat trước khi đồng bộ.', true);
        return;
    }
    try {
        notifyShopApi('⏳ Đang đồng bộ hội thoại Lazada từ IM API...');
        const res = await fetch(API + '/api/chat/api-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                platform: 'lazada',
                shop: shop.shop_name || shop.user_name || shop.api_shop_id || '',
                days: 60,
                limit: 40
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) throw new Error(data.error || 'Không đồng bộ được chat Lazada');
        const result = Array.isArray(data.results)
            ? data.results.find(item => String(item.platform || '').toLowerCase() === 'lazada')
            : null;
        const sessions = Number(result?.pulled_sessions || result?.saved_conversations || 0).toLocaleString('vi-VN');
        const messages = Number(result?.pulled_messages || result?.saved_messages || 0).toLocaleString('vi-VN');
        notifyShopApi(`✅ Đã đồng bộ chat Lazada: ${sessions} hội thoại, ${messages} tin nhắn.`);
    } catch (e) {
        notifyShopApi('❌ Lỗi đồng bộ chat Lazada: ' + e.message, true);
    }
};

window.refreshShopToken = async function(shopId) {
    const shop = getCachedShop(shopId);
    if (!shop?.id) {
        notifyShopApi('❌ Không tìm thấy shop cần làm mới token.', true);
        return;
    }

    notifyShopApi('⏳ Đang làm mới token cho ' + (shop.shop_name || 'shop') + '...');
    try {
        const res = await fetch(API + '/api/shops/force-refresh-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shop_id: shop.id })
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(data.error || 'Không làm mới được token');
        notifyShopApi('✅ ' + (data.message || 'Đã làm mới token thành công'));
        loadShopWarehouses();
    } catch (e) {
        notifyShopApi('❌ Lỗi làm mới token: ' + e.message, true);
    }
};

window.disconnectShopApi = async function(shopId) {
    const shop = getCachedShop(shopId);
    if (!shop?.id) {
        notifyShopApi('❌ Không tìm thấy shop cần ngắt kết nối.', true);
        return;
    }

    const ok = confirm('Ngắt kết nối API của shop "' + (shop.shop_name || shop.user_name || shop.id) + '"? App ID/Key vẫn được giữ lại để bạn kết nối lại sau.');
    if (!ok) return;

    try {
        const res = await fetch(API + '/api/shops/disconnect-api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shop_id: shop.id })
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(data.error || 'Không ngắt kết nối được API');
        notifyShopApi('✅ ' + (data.message || 'Đã ngắt kết nối API'));
        loadShopWarehouses();
    } catch (e) {
        notifyShopApi('❌ Lỗi ngắt kết nối API: ' + e.message, true);
    }
};

window.disconnectLazadaChatApi = async function(shopId) {
    const shop = getCachedShop(shopId);
    if (!shop?.id) {
        notifyShopApi('❌ Không tìm thấy shop Lazada cần ngắt chat API.', true);
        return;
    }

    const ok = confirm('Ngắt riêng Lazada Chat API của shop "' + (shop.shop_name || shop.user_name || shop.id) + '"? API chính vẫn được giữ nguyên.');
    if (!ok) return;

    try {
        const res = await fetch(API + '/api/shops/disconnect-chat-api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shop_id: shop.id })
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(data.error || 'Không ngắt được Lazada Chat API');
        notifyShopApi('✅ ' + (data.message || 'Đã ngắt Lazada Chat API'));
        loadShopWarehouses();
    } catch (e) {
        notifyShopApi('❌ Lỗi ngắt Lazada Chat API: ' + e.message, true);
    }
};

window.updateShopWarehouse = async function(shopId, source) {
    try {
        const res = await fetch(API + '/api/products/update-shop-warehouse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shop_id: shopId, warehouse_source: source })
        });
        if (res.ok) {
            notifyShopApi('✅ Đã cập nhật nguồn kho thành công!');
        } else {
            notifyShopApi('❌ Lỗi khi cập nhật kho', true);
        }
    } catch (e) {
        notifyShopApi('❌ Lỗi kết nối API: ' + e.message, true);
    }
};
