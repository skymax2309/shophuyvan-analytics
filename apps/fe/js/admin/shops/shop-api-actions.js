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

const SHOP_RUNNER_HELPER_URL = 'http://127.0.0.1:8765';

function canCallShopRunnerHelper() {
    const host = window.location.hostname || '';
    return host === 'localhost'
        || host === '127.0.0.1'
        || host.endsWith('.workers.dev')
        || host.includes('shophuyvan-analytics');
}

async function loadShopRunnerHealth() {
    if (!canCallShopRunnerHelper()) {
        return { ok: false, error: 'browser_blocks_loopback' };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
        const response = await fetch(`${SHOP_RUNNER_HELPER_URL}/health?t=${Date.now()}`, {
            cache: 'no-store',
            signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return { ok: false, error: data.error || `local_helper_${response.status}` };
        }
        return data && typeof data === 'object' ? data : { ok: false, error: 'invalid_local_helper_health' };
    } catch (error) {
        return { ok: false, error: error?.name === 'AbortError' ? 'local_helper_timeout' : (error?.message || 'local_helper_unreachable') };
    } finally {
        clearTimeout(timer);
    }
}

function mergeShopRunnerHealth(shop, health) {
    const next = { ...shop };
    if (next.order_runner_running_source !== 'local_helper_health') return next;

    next.local_helper_ok = health?.ok ? 1 : 0;
    next.radar_running = health?.radar_running ? 1 : 0;
    next.radar_pid = health?.radar_pid || '';
    next.radar_started_at = health?.radar_started_at || '';
    next.report_worker_running = health?.report_worker_running ? 1 : 0;
    next.report_worker_pid = health?.report_worker_pid || '';
    next.report_worker_started_at = health?.report_worker_started_at || '';
    next.report_worker_log_file = health?.report_worker_log_file || '';
    next.report_worker_error_file = health?.report_worker_error_file || '';
    next.report_worker_autostarted = health?.report_worker_autostarted ? 1 : 0;
    next.report_worker_autostart_error = health?.report_worker_autostart_error || '';
    const tiktokRunner = health?.tiktok_runner || {};
    next.tiktok_runner_state = tiktokRunner.runner_state || tiktokRunner.state || '';
    next.tiktok_runner_paused = tiktokRunner.paused ? 1 : 0;
    next.tiktok_runner_pause_reason = tiktokRunner.pause_reason || '';
    next.tiktok_runner_type = tiktokRunner.runner_type || '';
    next.tiktok_runner_profile_dir = tiktokRunner.chrome_profile || tiktokRunner.profile_dir || '';
    next.tiktok_runner_pid = tiktokRunner.pid || '';
    next.tiktok_runner_browser_pids = Array.isArray(tiktokRunner.browser_pids) ? tiktokRunner.browser_pids.join(', ') : '';
    next.tiktok_runner_started_at = tiktokRunner.started_at || '';
    next.tiktok_runner_last_heartbeat_at = tiktokRunner.heartbeat || tiktokRunner.last_heartbeat_at || '';
    next.tiktok_runner_last_run_at = tiktokRunner.last_run_at || '';
    next.tiktok_runner_current_order_no = tiktokRunner.current_order_no || '';
    next.tiktok_runner_queue_pending = Number(tiktokRunner.queue_pending || 0) || 0;
    next.tiktok_runner_queue_processing = Number(tiktokRunner.queue_processing || 0) || 0;
    next.tiktok_runner_queue_failed = Number(tiktokRunner.queue_failed || 0) || 0;
    next.tiktok_runner_last_error = tiktokRunner.last_error || '';
    next.tiktok_runner_next_retry_at = tiktokRunner.next_retry_at || '';
    next.tiktok_runner_touched_24h = Number(tiktokRunner.touched_24h || 0) || 0;
    next.tiktok_runner_profile_login_required = tiktokRunner.profile_login_required ? 1 : 0;

    if (!health?.ok) {
        next.order_runner_running = '';
        next.order_runner_status = 'helper_unavailable';
        next.order_runner_status_label = 'Không đọc được helper local';
        next.order_runner_last_error = `${health?.error || 'Không đọc được local helper'}; chưa xác minh runner tự động`;
        return next;
    }

    const type = String(next.order_runner_type || '');
    const platform = String(next.platform || next.Platform || '').toLowerCase();
    if (platform === 'tiktok') {
        const running = Boolean(tiktokRunner.running);
        next.order_runner_running = running ? 1 : 0;
        next.order_runner_pid = tiktokRunner.pid || '';
        next.order_runner_started_at = tiktokRunner.started_at || '';
        next.order_runner_last_error = tiktokRunner.last_error || next.report_worker_autostart_error || '';
        next.order_runner_status = tiktokRunner.paused ? 'paused' : (running ? 'running' : (tiktokRunner.state || 'not_running'));
        next.order_runner_status_label = tiktokRunner.paused
            ? 'Đang tạm dừng tự động TikTok'
            : (running ? 'TikTok runner đang chạy' : (tiktokRunner.profile_login_required ? 'Cần đăng nhập TikTok Seller Center cho profile automation' : 'TikTok runner không chạy'));
        return next;
    }
    const useRadar = type.includes('radar');
    const running = useRadar ? Boolean(health.radar_running) : Boolean(health.report_worker_running);
    next.order_runner_running = running ? 1 : 0;
    next.order_runner_pid = useRadar ? (health.radar_pid || '') : (health.report_worker_pid || '');
    next.order_runner_started_at = useRadar ? (health.radar_started_at || '') : (health.report_worker_started_at || '');
    next.order_runner_last_error = next.report_worker_autostart_error || '';
    next.order_runner_status = running ? 'running' : 'not_running';
    next.order_runner_status_label = running
        ? (useRadar ? 'Radar đang chạy' : (health.report_worker_autostarted ? 'report_worker vừa bật' : 'report_worker đang chạy'))
        : 'Chưa có runner tự động';
    return next;
}

window.controlTikTokRunner = async function(action) {
    const endpoint = {
        pause: '/tiktok-runner/pause',
        resume: '/tiktok-runner/resume',
        stop: '/tiktok-runner/stop'
    }[action];
    if (!endpoint) return;
    try {
        const payload = { reason: `admin_${action}` };
        if (action === 'resume') {
            payload.allow_run = false;
        }
        const response = await fetch(`${SHOP_RUNNER_HELPER_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            cache: 'no-store'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.ok === false) throw new Error(data?.error || `local_helper_${response.status}`);
        notifyShopApi(action === 'resume'
            ? 'Đã kiểm API resume TikTok runner; runner vẫn tạm dừng cho tới khi được cho phép chạy thật.'
            : 'Đã cập nhật TikTok runner.');
        await loadShopWarehouses();
    } catch (error) {
        notifyShopApi('Không điều khiển được TikTok runner: ' + (error?.message || error), true);
    }
};

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
        const apiPromise = fetch(API + '/api/shops/api-configs?t=' + Date.now()).then(async res => {
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        });
        const [data, runnerHealth] = await Promise.all([apiPromise, loadShopRunnerHealth()]);
        window.__shopRunnerHealth = runnerHealth;
        const rows = (Array.isArray(data) ? data : [])
            .filter(shop => !isTechnicalShopeeRow(shop))
            .map(shop => mergeShopRunnerHealth(shop, runnerHealth));
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
        const noRunner = rows.filter(shop => shop.order_runner_running_source === 'local_helper_health' && shop.order_runner_status === 'not_running').length;
        const unknownRunner = rows.filter(shop => shop.order_runner_running_source === 'local_helper_health' && shop.order_runner_status === 'helper_unavailable').length;
        summary.textContent = `${rows.length} shop đang hiển thị • ${apiActive} shop chạy API • ${nonApi} shop đi luồng không API${noRunner ? ` • ${noRunner} shop chưa có runner tự động` : ''}${unknownRunner ? ` • ${unknownRunner} shop chưa xác minh runner local` : ''}`;
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
