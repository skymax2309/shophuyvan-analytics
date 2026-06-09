function directShopValue(shop = {}) {
    return shop.shop_name || shop.user_name || shop.api_shop_id || shop.api_seller_id || '';
}

function directShopLabel(shop = {}) {
    const name = directShopValue(shop) || 'Shop chưa rõ tên';
    const mode = String(shop.capability_mode || '') === 'api_active' ? 'API' : 'chưa API';
    return `${name} - ${mode}`;
}

function directShopRows(platform, apiOnly = false) {
    const rows = Array.isArray(window.__shopApiRows) ? window.__shopApiRows : [];
    return rows.filter(shop => {
        if (platform && getPlatform(shop) !== platform) return false;
        if (apiOnly && String(shop.capability_mode || '') !== 'api_active') return false;
        return !!directShopValue(shop);
    });
}

function setSelectOptions(select, rows, emptyText) {
    if (!select) return;
    const current = select.value;
    if (!rows.length) {
        select.innerHTML = `<option value="">${escapeHtml(emptyText)}</option>`;
        return;
    }
    select.innerHTML = rows.map(shop => `<option value="${escapeHtml(directShopValue(shop))}">${escapeHtml(directShopLabel(shop))}</option>`).join('');
    if (rows.some(shop => directShopValue(shop) === current)) select.value = current;
}

function syncCatalogDirectShopOptions() {
    const pricePlatform = document.getElementById('catalogPriceEditorPlatform')?.value || 'shopee';
    const listingPlatform = document.getElementById('catalogListingEditorPlatform')?.value || 'shopee';
    setSelectOptions(
        document.getElementById('catalogPriceEditorShop'),
        directShopRows(pricePlatform, false),
        'Không có shop phù hợp'
    );
    setSelectOptions(
        document.getElementById('catalogListingEditorShop'),
        directShopRows(listingPlatform, true),
        'Không có shop API phù hợp'
    );
}

function ensureCatalogBulkPriceControls() {
    ensureCatalogTikTokPromotionControls();
    if (document.getElementById('catalogBulkPromoPercent')) return;
    const actions = document.querySelector('[onclick="loadCatalogPriceEditorRows()"]')?.closest('.ops-actions');
    if (!actions) return;
    if (!document.getElementById('catalogSyncPromoFromPlatformBtn')) {
        actions.insertAdjacentHTML('beforeend', `
          <button id="catalogSyncPromoFromPlatformBtn" type="button" class="soft" onclick="syncCatalogPromoPricesFromPlatform()">Đồng bộ giá KM từ sàn</button>
        `);
    }
    actions.insertAdjacentHTML('beforebegin', `
      <div class="ops-filter-grid catalog-bulk-price-tools">
        <label class="ops-field">
          <span>Chỉnh hàng loạt</span>
          <input id="catalogBulkPromoPercent" type="number" step="0.5" placeholder="Ví dụ 5 hoặc -3">
        </label>
        <label class="ops-field">
          <span>Tính theo</span>
          <select id="catalogBulkPromoBase">
            <option value="current">Giá KM mới đang nhập</option>
            <option value="promo">Giá KM hiện tại</option>
            <option value="original">Giá gốc</option>
          </select>
        </label>
        <label class="ops-field">
          <span>Thao tác</span>
          <button type="button" class="primary" onclick="applyCatalogPromoPercentBulk()">Áp dụng % cho dòng đã chọn</button>
        </label>
      </div>
    `);
}

function ensureCatalogTikTokPromotionControls() {
    if (document.getElementById('catalogTikTokPromotionTools')) {
        updateCatalogTikTokPromotionControls();
        return;
    }
    const actions = document.querySelector('[onclick="loadCatalogPriceEditorRows()"]')?.closest('.ops-actions');
    if (!actions) return;
    actions.insertAdjacentHTML('beforebegin', `
      <div id="catalogTikTokPromotionTools" class="ops-filter-grid catalog-tiktok-promo-tools" style="display:none">
        <label class="ops-field catalog-tiktok-promo-url">
          <span>Link chương trình TikTok</span>
          <input id="catalogTikTokPromotionUrl" type="url" placeholder="Dán link discount/edit mới khi TikTok đổi chương trình">
        </label>
        <label class="ops-field">
          <span>Cấu hình</span>
          <button type="button" class="soft" onclick="saveCatalogTikTokPromotionUrl()">Lưu link TikTok</button>
        </label>
      </div>
    `);
    updateCatalogTikTokPromotionControls();
}

function getCatalogTikTokPromotionUrl() {
    return String(document.getElementById('catalogTikTokPromotionUrl')?.value || '').trim();
}

function isValidTikTokPromotionUrl(url) {
    return /^https:\/\/seller-vn\.tiktok\.com\/promotion\/marketing-tools\/discount\/edit\/\d+/.test(String(url || '').trim());
}

function updateCatalogTikTokPromotionControls() {
    const wrap = document.getElementById('catalogTikTokPromotionTools');
    if (!wrap) return;
    const isTikTok = selectedCatalogPricePlatform() === 'tiktok';
    wrap.style.display = isTikTok ? '' : 'none';
    if (!isTikTok) return;
    const settings = window.productCatalogSettings || {};
    const urls = settings.tiktok_promotion_urls && typeof settings.tiktok_promotion_urls === 'object' ? settings.tiktok_promotion_urls : {};
    const input = document.getElementById('catalogTikTokPromotionUrl');
    const shop = selectedCatalogPriceShop() || '0909128999';
    if (input && !input.value) input.value = urls[shop] || urls['0909128999'] || urls.default || '';
}

window.saveCatalogTikTokPromotionUrl = async function() {
    const shop = selectedCatalogPriceShop() || '0909128999';
    const url = getCatalogTikTokPromotionUrl();
    if (!url) return notifyShopApi('Dán link chương trình TikTok trước khi lưu.', true);
    if (!isValidTikTokPromotionUrl(url)) return notifyShopApi('Link TikTok phải là trang discount/edit của Seller Center.', true);
    const current = window.productCatalogSettings || {};
    const urls = current.tiktok_promotion_urls && typeof current.tiktok_promotion_urls === 'object'
        ? { ...current.tiktok_promotion_urls }
        : {};
    urls[shop] = url;
    try {
        const res = await fetch(API + '/api/products/catalog-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tiktok_promotion_urls: urls })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) throw new Error(data.error || 'Không lưu được link TikTok');
        applyCatalogSettingsToUi(data.settings || {});
        notifyShopApi('Đã lưu link chương trình TikTok cho automation.');
    } catch (error) {
        notifyShopApi('Lỗi lưu link TikTok: ' + error.message, true);
    }
};

function catalogPriceSelectedSet() {
    if (!(window.catalogPriceSelectedSkus instanceof Set)) window.catalogPriceSelectedSkus = new Set();
    return window.catalogPriceSelectedSkus;
}

function catalogPriceDraftMap() {
    if (!window.catalogPriceDrafts || typeof window.catalogPriceDrafts !== 'object') window.catalogPriceDrafts = {};
    return window.catalogPriceDrafts;
}

function selectedCatalogPricePlatform() {
    return document.getElementById('catalogPriceEditorPlatform')?.value || 'shopee';
}

function selectedCatalogPriceShop() {
    return document.getElementById('catalogPriceEditorShop')?.value || '';
}

function selectedCatalogListingPlatform() {
    return document.getElementById('catalogListingEditorPlatform')?.value || 'shopee';
}

function selectedCatalogListingShop() {
    return document.getElementById('catalogListingEditorShop')?.value || '';
}

async function fetchVariationRowsForShop(platform, shop, includeOutOfStock = false) {
    if (!shop) return [];
    const params = new URLSearchParams({ platform, shop, t: String(Date.now()) });
    if (includeOutOfStock) params.set('include_out_of_stock', '1');
    const res = await fetch(API + '/api/sync-variations?' + params.toString());
    const rows = await res.json().catch(() => []);
    if (!res.ok) throw new Error(Array.isArray(rows) ? 'Không tải được danh sách sản phẩm' : (rows.error || 'Không tải được danh sách sản phẩm'));
    return (Array.isArray(rows) ? rows : []).filter(row => String(row.platform || '').toLowerCase() === platform);
}

window.handleCatalogPriceEditorPlatformChange = function() {
    syncCatalogDirectShopOptions();
    updateCatalogTikTokPromotionControls();
    const legacyPlatform = document.getElementById('catalogPreviewPlatform');
    if (legacyPlatform && ['shopee', 'lazada'].includes(selectedCatalogPricePlatform())) {
        legacyPlatform.value = selectedCatalogPricePlatform();
        renderCatalogPreviewShopOptions();
    }
    loadCatalogPriceEditorRows();
};

window.loadCatalogPriceEditorRows = async function() {
    ensureCatalogBulkPriceControls();
    const platform = selectedCatalogPricePlatform();
    const shop = selectedCatalogPriceShop();
    updateCatalogTikTokPromotionControls();
    const summary = document.getElementById('catalogPriceEditorSummary');
    const list = document.getElementById('catalogPriceEditorList');
    if (!shop) {
        window.catalogPriceEditorRows = [];
        if (summary) summary.textContent = 'Chọn shop để tải danh sách sản phẩm còn tồn.';
        if (list) list.className = 'direct-empty', list.innerHTML = 'Chưa có shop phù hợp.';
        return;
    }
    try {
        if (summary) summary.textContent = `Đang tải sản phẩm của ${shop}...`;
        const rows = await fetchVariationRowsForShop(platform, shop, false);
        window.catalogPriceEditorRows = rows;
        window.catalogPriceSelectedSkus = new Set();
        window.catalogPriceDrafts = {};
        renderCatalogPriceEditorRows();
    } catch (error) {
        window.catalogPriceEditorRows = [];
        if (summary) summary.textContent = 'Không tải được danh sách sản phẩm.';
        if (list) list.className = 'direct-empty', list.innerHTML = escapeHtml(error.message);
        notifyShopApi('Lỗi tải sản phẩm: ' + error.message, true);
    }
};

window.renderCatalogPriceEditorRows = function() {
    const list = document.getElementById('catalogPriceEditorList');
    const summary = document.getElementById('catalogPriceEditorSummary');
    if (!list) return;
    const search = String(document.getElementById('catalogPriceEditorSearch')?.value || '').trim().toLowerCase();
    const rows = (window.catalogPriceEditorRows || []).filter(row => {
        if (!search) return true;
        return [
            row.product_name,
            row.variation_name,
            row.platform_sku,
            row.platform_item_id,
            row.internal_sku
        ].filter(Boolean).join(' ').toLowerCase().includes(search);
    });
    if (summary) {
        summary.textContent = `${formatCatalogNumber(rows.length)} SKU đang hiển thị trong ${formatCatalogNumber(window.catalogPriceEditorRows?.length || 0)} SKU còn tồn. Sửa ô Giá KM mới rồi bấm lưu hoặc preview.`;
    }
    if (!rows.length) {
        list.className = 'direct-empty';
        list.innerHTML = 'Không có sản phẩm phù hợp bộ lọc.';
        return;
    }
    const uploadStatusMeta = (row = {}) => {
        const status = String(row.promo_upload_status || '').toLowerCase();
        const message = row.promo_upload_message || '';
        if (status === 'uploaded') return { cls: 'ok', label: 'Đã up sàn', message };
        if (status === 'out_of_stock') return { cls: 'warn', label: 'Hết hàng', message: message || 'Shopee báo hết hàng nên không nhận giá KM cho phân loại này.' };
        if (status === 'failed') return { cls: 'error', label: 'Lỗi upload', message };
        if (status === 'skipped') return { cls: 'muted', label: 'Bỏ qua', message };
        return null;
    };
    list.className = 'direct-table-wrap';
    const selected = catalogPriceSelectedSet();
    const drafts = catalogPriceDraftMap();
    const filteredSkus = rows.map(row => String(row.platform_sku || '')).filter(Boolean);
    const allFilteredSelected = filteredSkus.length > 0 && filteredSkus.every(sku => selected.has(sku));
    list.innerHTML = `
        <div class="catalog-price-select-bar">
          <label>
            <input id="catalogPriceSelectAllVisible" type="checkbox" ${allFilteredSelected ? 'checked' : ''} onchange="toggleCatalogPriceFilteredSelection(this.checked)">
            Chọn tất cả ${escapeHtml(formatCatalogNumber(rows.length))} SKU đang lọc
          </label>
          <span>Đã chọn ${escapeHtml(formatCatalogNumber(selected.size))} SKU. Bulk áp dụng cho toàn bộ SKU đã chọn, không chỉ 120 dòng đang hiện.</span>
        </div>
        <table class="direct-table">
          <thead>
            <tr>
              <th>Chọn</th>
              <th>Sản phẩm</th>
              <th>SKU sàn</th>
              <th>Giá gốc</th>
              <th>Giá KM hiện tại</th>
              <th>Giá KM mới</th>
              <th>Tồn</th>
            </tr>
          </thead>
          <tbody>
            ${rows.slice(0, 120).map(row => {
                const sku = row.platform_sku || '';
                const currentPromo = Number(row.discount_price || 0);
                const displayPrice = currentPromo || Number(row.price || 0);
                const inputValue = Object.prototype.hasOwnProperty.call(drafts, sku) ? drafts[sku] : displayPrice;
                const uploadStatus = uploadStatusMeta(row);
                return `
                  <tr>
                    <td data-label="Chọn"><input class="catalog-price-row-check" type="checkbox" data-sku="${escapeHtml(sku)}" ${selected.has(sku) ? 'checked' : ''} onchange="toggleCatalogPriceRowSelection(this)"></td>
                    <td data-label="Sản phẩm">
                      <div class="direct-product-cell">
                        ${row.image_url ? `<img src="${escapeHtml(row.image_url)}" alt="">` : '<img alt="">'}
                        <div>
                          <div class="direct-product-name">${escapeHtml(row.product_name || 'Sản phẩm chưa rõ tên')}</div>
                          <div class="direct-product-sub">${escapeHtml(row.variation_name || '')}</div>
                        </div>
                      </div>
                    </td>
                    <td data-label="SKU sàn"><strong>${escapeHtml(sku || 'Chưa có')}</strong><div class="direct-product-sub">Item ${escapeHtml(row.platform_item_id || '')}</div></td>
                    <td data-label="Giá gốc">${escapeHtml(formatVnd(row.price))}</td>
                    <td data-label="Giá KM hiện tại">
                      <div>${escapeHtml(currentPromo ? formatVnd(currentPromo) : 'Chưa có')}</div>
                      ${uploadStatus ? `<div class="catalog-upload-status ${escapeHtml(uploadStatus.cls)}" title="${escapeHtml(uploadStatus.message || '')}">${escapeHtml(uploadStatus.label)}</div>` : ''}
                    </td>
                    <td data-label="Giá KM mới">
                      <input class="direct-price-input catalog-price-input" type="number" min="0" step="1000" value="${escapeHtml(inputValue)}" data-sku="${escapeHtml(sku)}" oninput="markCatalogPriceEditorChange(this)">
                    </td>
                    <td data-label="Tồn">${escapeHtml(formatCatalogNumber(row.stock))}</td>
                  </tr>
                `;
            }).join('')}
          </tbody>
        </table>
        ${rows.length > 120 ? `<div class="direct-summary">Đang hiển thị 120 dòng đầu. Dùng ô tìm kiếm để lọc đúng sản phẩm cần sửa.</div>` : ''}
    `;
};

window.toggleCatalogPriceRowSelection = function(input) {
    const sku = input?.dataset?.sku || '';
    if (!sku) return;
    const selected = catalogPriceSelectedSet();
    if (input.checked) selected.add(sku);
    else selected.delete(sku);
};

window.toggleCatalogPriceFilteredSelection = function(checked) {
    const search = String(document.getElementById('catalogPriceEditorSearch')?.value || '').trim().toLowerCase();
    const selected = catalogPriceSelectedSet();
    for (const row of window.catalogPriceEditorRows || []) {
        const haystack = [
            row.product_name,
            row.variation_name,
            row.platform_sku,
            row.platform_item_id,
            row.internal_sku
        ].filter(Boolean).join(' ').toLowerCase();
        if (search && !haystack.includes(search)) continue;
        const sku = String(row.platform_sku || '');
        if (!sku) continue;
        if (checked) selected.add(sku);
        else selected.delete(sku);
    }
    renderCatalogPriceEditorRows();
};

window.markCatalogPriceEditorChange = function(input) {
    input.classList.add('changed');
    const sku = input.dataset.sku || '';
    if (sku) {
        catalogPriceDraftMap()[sku] = catalogPreviewNumber(input.value);
        catalogPriceSelectedSet().add(sku);
    }
    const row = input.closest('tr');
    const check = row?.querySelector('.catalog-price-row-check');
    if (check) check.checked = true;
};

function collectCatalogPriceEditorItems({ changedOnly = false } = {}) {
    const drafts = catalogPriceDraftMap();
    const selected = catalogPriceSelectedSet();
    const inputs = [...document.querySelectorAll('.catalog-price-input')];
    const items = [];
    for (const input of inputs) {
        const row = input.closest('tr');
        const checked = row?.querySelector('.catalog-price-row-check')?.checked;
        if (!checked && (!changedOnly || !input.classList.contains('changed'))) continue;
        const sku = input.dataset.sku || '';
        const price = catalogPreviewNumber(input.value);
        if (sku && price > 0) items.push({ sku, price });
    }
    for (const sku of selected) {
        if (items.some(item => item.sku === sku)) continue;
        if (changedOnly && !Object.prototype.hasOwnProperty.call(drafts, sku)) continue;
        const sourceRow = (window.catalogPriceEditorRows || []).find(item => String(item.platform_sku || '') === sku) || {};
        const fallback = Number(sourceRow.discount_price || sourceRow.price || 0);
        const price = catalogPreviewNumber(Object.prototype.hasOwnProperty.call(drafts, sku) ? drafts[sku] : fallback);
        if (sku && price > 0) items.push({ sku, price });
    }
    return items;
}

window.applyCatalogPromoPercentBulk = function() {
    const percent = Number(document.getElementById('catalogBulkPromoPercent')?.value || 0);
    const baseMode = document.getElementById('catalogBulkPromoBase')?.value || 'current';
    if (!Number.isFinite(percent) || percent === 0) return notifyShopApi('Nhập phần trăm cần tăng/giảm giá khuyến mãi.', true);
    const selected = catalogPriceSelectedSet();
    if (!selected.size) return notifyShopApi('Tick các SKU cần chỉnh giá hàng loạt trước.', true);
    const drafts = catalogPriceDraftMap();
    selected.forEach(sku => {
        const sourceRow = (window.catalogPriceEditorRows || []).find(item => String(item.platform_sku || '') === sku) || {};
        const visibleInput = document.querySelector(`.catalog-price-input[data-sku="${CSS.escape(sku)}"]`);
        const current = catalogPreviewNumber(visibleInput?.value ?? drafts[sku] ?? sourceRow.discount_price ?? sourceRow.price);
        const base = baseMode === 'original'
            ? catalogPreviewNumber(sourceRow.price)
            : (baseMode === 'promo' ? catalogPreviewNumber(sourceRow.discount_price || current) : current);
        if (base <= 0) return;
        const next = Math.max(0, Math.round((base * (1 + percent / 100)) / 1000) * 1000);
        drafts[sku] = next;
        if (visibleInput) {
            visibleInput.value = String(next);
            window.markCatalogPriceEditorChange(visibleInput);
        }
    });
    renderCatalogPriceEditorRows();
    notifyShopApi(`Đã áp dụng ${percent > 0 ? '+' : ''}${percent}% cho ${formatCatalogNumber(selected.size)} SKU đã chọn.`);
};

window.saveCatalogPromoPrices = async function() {
    const platform = selectedCatalogPricePlatform();
    const shop = selectedCatalogPriceShop();
    const items = collectCatalogPriceEditorItems({ changedOnly: true });
    if (!shop) return notifyShopApi('Chưa chọn shop để lưu giá khuyến mãi.', true);
    if (!items.length) return notifyShopApi('Chưa có dòng nào được sửa giá khuyến mãi.', true);
    try {
        const res = await fetch(API + '/api/products/update-promo-prices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform, shop, items })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error || data.success === false) throw new Error(data.error || 'Không lưu được giá khuyến mãi');
        notifyShopApi(`Đã lưu ${formatCatalogNumber(data.updated || items.length)} giá khuyến mãi trong OMS.`);
        await loadCatalogPriceEditorRows();
    } catch (error) {
        notifyShopApi('Lỗi lưu giá khuyến mãi: ' + error.message, true);
    }
};

function selectedCatalogPriceShopRow() {
    const platform = selectedCatalogPricePlatform();
    const shop = selectedCatalogPriceShop();
    return directShopRows(platform, false).find(row => directShopValue(row) === shop) || null;
}

window.syncCatalogPromoPricesFromPlatform = async function() {
    const platform = selectedCatalogPricePlatform();
    const shop = selectedCatalogPriceShop();
    const shopRow = selectedCatalogPriceShopRow();
    if (!shop) return notifyShopApi('Chưa chọn shop để đồng bộ giá khuyến mãi.', true);
    const isApiShop = String(shopRow?.capability_mode || '') === 'api_active';
    try {
        if (platform === 'shopee' && isApiShop) {
            const res = await fetch(API + '/api/discounts/shopee/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shop, discount_status: 'ongoing', include_detail: 1, shop_limit: 1 })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error || data.status === 'error') throw new Error(data.error || data.message || 'Không đồng bộ được Shopee Discount Core');
            notifyShopApi(`Đã đồng bộ Shopee Discount Core cho ${shop}.`);
            await loadCatalogPriceEditorRows();
            return;
        }
        if (platform === 'lazada' && isApiShop) {
            const res = await fetch(API + '/api/products/sync-api-products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform: 'lazada', shop, limit: 500, include_out_of_stock: 1 })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error || data.status === 'error') throw new Error(data.error || 'Không đồng bộ được sản phẩm Lazada API');
            notifyShopApi(`Đã đồng bộ giá KM Lazada API: ${formatCatalogNumber(data.synced_variations || 0)} SKU.`);
            await loadCatalogPriceEditorRows();
            return;
        }
        const payload = {
            platform,
            shop,
            action_type: 'tai_file',
            source: 'Product Master Promotion Core',
            requires_visible_browser: true,
            promotion_url: platform === 'tiktok' ? getCatalogTikTokPromotionUrl() : ''
        };
        if (platform === 'tiktok') {
            if (!payload.promotion_url) return notifyShopApi('Dán link chương trình TikTok trước khi tạo job đồng bộ.', true);
            if (!isValidTikTokPromotionUrl(payload.promotion_url)) return notifyShopApi('Link TikTok phải là trang discount/edit của Seller Center.', true);
        }
        const res = await fetch(API + '/api/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: 'admin',
                platform,
                shop_name: shop,
                task_type: 'promotion_prices',
                payload: JSON.stringify(payload)
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error || data.status === 'error') throw new Error(data.error || 'Không tạo được job đồng bộ giá KM');
        notifyShopApi(`Đã tạo job đồng bộ giá KM #${data.id || ''}. Runner phải mở Chrome visible bằng profile automation của shop.`);
    } catch (error) {
        notifyShopApi('Lỗi đồng bộ giá KM từ sàn: ' + error.message, true);
    }
};

window.previewCatalogPriceEditorRows = function() {
    const platform = selectedCatalogPricePlatform();
    const shop = selectedCatalogPriceShop();
    const items = collectCatalogPriceEditorItems();
    if (!shop) return notifyShopApi('Chưa chọn shop để preview đẩy giá.', true);
    if (!items.length) return notifyShopApi('Hãy tick hoặc sửa ít nhất một dòng giá để preview.', true);
    if (platform === 'tiktok') {
        createTikTokPromotionUploadJob(items);
        return;
    }
    if (!['shopee', 'lazada'].includes(platform)) {
        notifyShopApi('Sàn này chưa có luồng ghi giá khuyến mãi.', true);
        return;
    }
    const legacyPlatform = document.getElementById('catalogPreviewPlatform');
    const legacyShop = document.getElementById('catalogPreviewShop');
    const legacyAction = document.getElementById('catalogPreviewActionType');
    const legacyItems = document.getElementById('catalogPreviewItems');
    if (legacyPlatform) legacyPlatform.value = platform;
    renderCatalogPreviewShopOptions();
    if (legacyShop) legacyShop.value = shop;
    if (legacyAction) legacyAction.value = 'update_price';
    if (legacyItems) legacyItems.value = items.map(item => `${item.sku}|${item.price}`).join('\n');
    runCatalogWritePreview();
};

async function createTikTokPromotionUploadJob(items) {
    const platform = selectedCatalogPricePlatform();
    const shop = selectedCatalogPriceShop();
    const promotionUrl = getCatalogTikTokPromotionUrl();
    if (!promotionUrl) return notifyShopApi('Dán link chương trình TikTok trước khi tạo job upload.', true);
    if (!isValidTikTokPromotionUrl(promotionUrl)) return notifyShopApi('Link TikTok phải là trang discount/edit của Seller Center.', true);
    try {
        await window.saveCatalogTikTokPromotionUrl();
        const payload = {
            platform,
            shop,
            action_type: 'up_gia',
            source: 'Product Master Promotion Core',
            promotion_url: promotionUrl,
            items,
            requires_visible_browser: true
        };
        const res = await fetch(API + '/api/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: 'admin',
                platform,
                shop_name: shop,
                task_type: 'promotion_prices',
                payload: JSON.stringify(payload)
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error || data.status === 'error') throw new Error(data.error || 'Không tạo được job upload TikTok');
        notifyShopApi(`Đã tạo job upload giá KM TikTok #${data.id || ''}. Runner sẽ tải mẫu, điền file và up lại bằng Chrome visible.`);
    } catch (error) {
        notifyShopApi('Lỗi tạo job upload TikTok: ' + error.message, true);
    }
}

window.handleCatalogListingEditorPlatformChange = function() {
    syncCatalogDirectShopOptions();
    const legacyPlatform = document.getElementById('catalogListingPreviewPlatform');
    if (legacyPlatform) {
        legacyPlatform.value = selectedCatalogListingPlatform();
        renderCatalogListingPreviewShopOptions();
    }
    loadCatalogListingEditorRows();
};

window.handleCatalogListingEditorActionChange = function() {
    const actionType = document.getElementById('catalogListingEditorAction')?.value || 'update_item';
    const legacyAction = document.getElementById('catalogListingActionType');
    if (legacyAction) legacyAction.value = actionType;
    renderCatalogListingPreviewShopOptions();
    updateCatalogListingPreviewHelp();
    renderCatalogListingEditorRows();
};

window.loadCatalogListingEditorRows = async function() {
    const platform = selectedCatalogListingPlatform();
    const shop = selectedCatalogListingShop();
    const summary = document.getElementById('catalogListingEditorSummary');
    const list = document.getElementById('catalogListingEditorList');
    if (!shop) {
        window.catalogListingEditorRows = [];
        if (summary) summary.textContent = 'Chọn shop API để tải danh sách bài đăng.';
        if (list) list.className = 'direct-empty', list.innerHTML = 'Chưa có shop API phù hợp.';
        return;
    }
    try {
        if (summary) summary.textContent = `Đang tải bài đăng của ${shop}...`;
        const rows = await fetchVariationRowsForShop(platform, shop, true);
        const grouped = new Map();
        for (const row of rows) {
            const key = row.platform_item_id || row.product_name || row.platform_sku;
            if (!key) continue;
            const current = grouped.get(key) || {
                platform_item_id: row.platform_item_id || '',
                product_name: row.product_name || 'Sản phẩm chưa rõ tên',
                image_url: row.image_url || '',
                variations: [],
                stock: 0,
                min_price: 0,
                max_price: 0
            };
            const price = Number(row.discount_price || row.price || 0);
            current.variations.push(row);
            current.stock += Number(row.stock || 0);
            current.min_price = current.min_price ? Math.min(current.min_price, price || current.min_price) : price;
            current.max_price = Math.max(current.max_price || 0, price || 0);
            if (!current.image_url && row.image_url) current.image_url = row.image_url;
            grouped.set(key, current);
        }
        window.catalogListingEditorRows = [...grouped.values()];
        renderCatalogListingEditorRows();
    } catch (error) {
        window.catalogListingEditorRows = [];
        if (summary) summary.textContent = 'Không tải được danh sách bài đăng.';
        if (list) list.className = 'direct-empty', list.innerHTML = escapeHtml(error.message);
        notifyShopApi('Lỗi tải bài đăng: ' + error.message, true);
    }
};

window.renderCatalogListingEditorRows = function() {
    const list = document.getElementById('catalogListingEditorList');
    const summary = document.getElementById('catalogListingEditorSummary');
    if (!list) return;
    const actionType = document.getElementById('catalogListingEditorAction')?.value || 'update_item';
    const search = String(document.getElementById('catalogListingEditorSearch')?.value || '').trim().toLowerCase();
    const rows = (window.catalogListingEditorRows || []).filter(row => {
        if (!search) return true;
        return [
            row.product_name,
            row.platform_item_id,
            ...(row.variations || []).map(item => item.platform_sku)
        ].filter(Boolean).join(' ').toLowerCase().includes(search);
    });
    if (summary) {
        summary.textContent = `${formatCatalogNumber(rows.length)} bài đăng đang hiển thị. Tick dòng cần thao tác rồi bấm preview.`;
    }
    if (!rows.length) {
        list.className = 'direct-empty';
        list.innerHTML = 'Không có bài đăng phù hợp bộ lọc.';
        return;
    }
    const needsTitle = actionType === 'update_item';
    list.className = 'direct-table-wrap';
    list.innerHTML = `
        <table class="direct-table">
          <thead>
            <tr>
              <th>Chọn</th>
              <th>Bài đăng</th>
              <th>Item ID</th>
              <th>SKU/model</th>
              <th>Giá đang bán</th>
              <th>Tồn</th>
              <th>${needsTitle ? 'Tên mới' : 'Ghi chú'}</th>
            </tr>
          </thead>
          <tbody>
            ${rows.slice(0, 100).map(row => {
                const first = row.variations?.[0] || {};
                const priceText = row.min_price && row.max_price && row.min_price !== row.max_price
                    ? `${formatVnd(row.min_price)} - ${formatVnd(row.max_price)}`
                    : formatVnd(row.min_price || row.max_price);
                return `
                  <tr>
                    <td data-label="Chọn"><input class="catalog-listing-row-check" type="checkbox" data-item-id="${escapeHtml(row.platform_item_id)}"></td>
                    <td data-label="Bài đăng">
                      <div class="direct-product-cell">
                        ${row.image_url ? `<img src="${escapeHtml(row.image_url)}" alt="">` : '<img alt="">'}
                        <div>
                          <div class="direct-product-name">${escapeHtml(row.product_name)}</div>
                          <div class="direct-product-sub">${formatCatalogNumber(row.variations?.length || 0)} SKU/model</div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Item ID"><strong>${escapeHtml(row.platform_item_id || 'Chưa có')}</strong></td>
                    <td data-label="SKU/model">${escapeHtml(first.platform_sku || 'Chưa có SKU')}</td>
                    <td data-label="Giá đang bán">${escapeHtml(priceText)}</td>
                    <td data-label="Tồn">${escapeHtml(formatCatalogNumber(row.stock))}</td>
                    <td data-label="${needsTitle ? 'Tên mới' : 'Ghi chú'}">
                      ${needsTitle
                        ? `<input class="direct-price-input catalog-listing-title-input" style="width:100%;min-width:220px;" value="${escapeHtml(row.product_name)}" oninput="this.closest('tr').querySelector('.catalog-listing-row-check').checked=true">`
                        : `<span class="direct-product-sub">Lệnh ${escapeHtml(document.getElementById('catalogListingEditorAction')?.selectedOptions?.[0]?.textContent || actionType)} sẽ dùng item ID dòng này.</span>`}
                    </td>
                  </tr>
                `;
            }).join('')}
          </tbody>
        </table>
        ${rows.length > 100 ? `<div class="direct-summary">Đang hiển thị 100 bài đăng đầu. Dùng ô tìm kiếm để lọc đúng bài cần sửa.</div>` : ''}
    `;
};

function collectCatalogListingEditorItems() {
    const actionType = document.getElementById('catalogListingEditorAction')?.value || 'update_item';
    const checkedRows = [...document.querySelectorAll('.catalog-listing-row-check:checked')].map(input => input.closest('tr')).filter(Boolean);
    const sourceRows = window.catalogListingEditorRows || [];
    return checkedRows.map(rowEl => {
        const itemId = rowEl.querySelector('.catalog-listing-row-check')?.dataset.itemId || '';
        const source = sourceRows.find(row => String(row.platform_item_id || '') === String(itemId)) || {};
        const first = source.variations?.[0] || {};
        if (actionType === 'unlist_item' || actionType === 'delete_item') return { platform_item_id: itemId };
        if (actionType === 'add_model') {
            return {
                platform_item_id: itemId,
                model_name: first.variation_name || 'Model mới',
                platform_sku: first.platform_sku || '',
                price: Number(first.discount_price || first.price || 0),
                stock: Number(first.stock || 0)
            };
        }
        if (actionType === 'update_model') {
            return {
                platform_item_id: itemId,
                model_id: first.model_id || '',
                platform_sku: first.platform_sku || '',
                model_name: first.variation_name || '',
                price: Number(first.discount_price || first.price || 0),
                stock: Number(first.stock || 0)
            };
        }
        if (actionType === 'delete_model') {
            return { platform_item_id: itemId, model_id: first.model_id || '', platform_sku: first.platform_sku || '' };
        }
        return {
            platform_item_id: itemId,
            title: rowEl.querySelector('.catalog-listing-title-input')?.value || source.product_name || '',
            category_id: '',
            brand_name: ''
        };
    }).filter(item => item.platform_item_id);
}

window.previewCatalogListingEditorRows = function() {
    const platform = selectedCatalogListingPlatform();
    const shop = selectedCatalogListingShop();
    const actionType = document.getElementById('catalogListingEditorAction')?.value || 'update_item';
    const items = collectCatalogListingEditorItems();
    if (!shop) return notifyShopApi('Chưa chọn shop API để preview bài đăng/model.', true);
    if (!items.length) return notifyShopApi('Hãy tick ít nhất một bài đăng để preview.', true);
    const legacyPlatform = document.getElementById('catalogListingPreviewPlatform');
    const legacyShop = document.getElementById('catalogListingPreviewShop');
    const legacyAction = document.getElementById('catalogListingActionType');
    const legacyItems = document.getElementById('catalogListingPreviewItems');
    if (legacyPlatform) legacyPlatform.value = platform;
    if (legacyAction) legacyAction.value = actionType;
    renderCatalogListingPreviewShopOptions();
    if (legacyShop) legacyShop.value = shop;
    if (legacyItems) {
        legacyItems.value = items.map(item => {
            if (actionType === 'unlist_item' || actionType === 'delete_item') return item.platform_item_id;
            if (actionType === 'add_model') return [item.platform_item_id, item.model_name, item.platform_sku, item.price, item.stock].join('|');
            if (actionType === 'update_model') return [item.platform_item_id, item.model_id, item.platform_sku, item.model_name, item.price, item.stock].join('|');
            if (actionType === 'delete_model') return [item.platform_item_id, item.model_id, item.platform_sku].join('|');
            return [item.platform_item_id, item.title, item.category_id, item.brand_name].join('|');
        }).join('\n');
    }
    runCatalogListingPreview();
};

window.saveProductCatalogToggle = async function(key, enabled) {
    try {
        const res = await fetch(API + '/api/products/catalog-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [key]: enabled ? 1 : 0 })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) throw new Error(data.error || 'Không lưu được cấu hình core sản phẩm');
        applyCatalogSettingsToUi(data.settings || {});
        notifyShopApi('Đã lưu cấu hình core sản phẩm.');
    } catch (error) {
        notifyShopApi('Lỗi lưu cấu hình core sản phẩm: ' + error.message, true);
        if (typeof loadProductCatalogOverview === 'function') loadProductCatalogOverview();
    }
};

window.loadProductCatalogOverview = async function() {
    try {
        const res = await fetch(API + '/api/products/catalog-overview?limit=8&t=' + Date.now());
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) throw new Error(data.error || 'Không tải được tổng quan catalog');
        window.__productCatalogOverview = data;
        applyCatalogSettingsToUi(data.settings || {});
        renderCatalogSummaryCards(data.summary || {});
        renderCatalogDiscrepancies(Array.isArray(data.discrepancies) ? data.discrepancies : []);
        renderCatalogLowStockRows(Array.isArray(data.low_stock_rows) ? data.low_stock_rows : []);
        renderCatalogLimitRows(Array.isArray(data.shops) ? data.shops : []);
        renderCapabilitySummary(data.summary || {});
        renderCapabilityGuides(Array.isArray(data.shops) ? data.shops : []);
        renderCatalogAudit(data.audit || {}, data.sku_warnings || {});
        renderCatalogHistory(Array.isArray(data.history) ? data.history : []);
        updateCatalogPreviewHelp();
        updateCatalogListingPreviewHelp();
        syncCatalogDirectShopOptions();
    } catch (error) {
        notifyShopApi('Lỗi tải tổng quan catalog: ' + error.message, true);
    }
};
