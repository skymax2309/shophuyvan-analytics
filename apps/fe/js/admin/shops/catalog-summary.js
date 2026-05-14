function escapeHtml(str) {
    if (str === null || str === undefined || str === '') return '&mdash;';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function notifyShopApi(message, isError = false) {
    if (typeof showToast === 'function') {
        showToast(message, isError);
        return;
    }
    console[isError ? 'error' : 'log'](message);
}

function truthyApiFlag(value) {
    return value === true || value === 1 || value === '1';
}

window.shopApiView = window.shopApiView || 'overview';
window.shopApiPlatform = window.shopApiPlatform || '';
window.productCatalogSettings = window.productCatalogSettings || null;
window.catalogPriceEditorRows = window.catalogPriceEditorRows || [];
window.catalogListingEditorRows = window.catalogListingEditorRows || [];

function catalogNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function formatCatalogNumber(value) {
    return catalogNumber(value).toLocaleString('vi-VN');
}

function catalogCompactList(values = [], emptyText = 'Không rõ') {
    const rows = Array.isArray(values) ? values.filter(Boolean) : [];
    return rows.length ? rows.join(', ') : emptyText;
}

function renderCatalogSummaryCards(summary = {}) {
    const wrap = document.getElementById('productCatalogSummaryGrid');
    if (!wrap) return;
    const cards = [
        { label: 'Bài đăng API', value: formatCatalogNumber(summary.api_products), note: `${formatCatalogNumber(summary.api_variations)} SKU trên sàn` },
        { label: 'Trạng thái NORMAL', value: formatCatalogNumber(summary.status_normal), note: `${formatCatalogNumber(summary.status_total)} bài đăng toàn trạng thái` },
        { label: 'SKU so sánh trực tiếp', value: formatCatalogNumber(summary.comparable_skus), note: `${formatCatalogNumber(summary.mismatch_skus)} SKU đang lệch tồn` },
        { label: 'Tồn nội bộ', value: formatCatalogNumber(summary.total_internal_stock), note: `${formatCatalogNumber(summary.low_stock_skus)} SKU chạm ngưỡng min` },
        { label: 'Tồn sàn quy đổi', value: formatCatalogNumber(summary.total_marketplace_stock), note: `${formatCatalogNumber(summary.skipped_complex_mappings)} mapping phức tạp chưa so sánh` }
    ];
    wrap.innerHTML = cards.map(card => `
        <div style="background:#fff;border:1px solid #dbeafe;border-radius:10px;padding:12px;">
            <div style="font-size:12px;font-weight:800;color:#64748b;">${escapeHtml(card.label)}</div>
            <div style="font-size:26px;font-weight:900;color:#0f172a;line-height:1.2;margin-top:4px;">${escapeHtml(card.value)}</div>
            <div style="font-size:12px;color:#64748b;margin-top:4px;">${escapeHtml(card.note)}</div>
        </div>
    `).join('');
}

function renderCatalogDiscrepancies(rows = []) {
    const wrap = document.getElementById('productCatalogDiscrepancyList');
    if (!wrap) return;
    if (!rows.length) {
        wrap.innerHTML = '<div class="catalog-warning-empty">Chưa thấy lệch tồn ở nhóm mapping 1 SKU = 1 SKU.</div>';
        return;
    }
    // Dữ liệu cảnh báo được chuyển sang bảng ngang để người vận hành so sánh nhanh nhiều SKU.
    wrap.innerHTML = `
        <table class="catalog-warning-table">
            <thead>
                <tr>
                    <th>SKU</th>
                    <th>Sản phẩm</th>
                    <th>Nội bộ</th>
                    <th>Tồn sàn</th>
                    <th>Lệch</th>
                    <th>Sàn</th>
                    <th>Shop</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(row => `
                    <tr>
                        <td class="sku" title="${escapeHtml(row.sku)}">${escapeHtml(row.sku)}</td>
                        <td class="product" title="${escapeHtml(row.product_name || '')}">${escapeHtml(row.product_name || '')}</td>
                        <td class="num">${formatCatalogNumber(row.internal_stock)}</td>
                        <td class="num">${formatCatalogNumber(row.marketplace_stock)}</td>
                        <td class="num danger">${formatCatalogNumber(row.diff)}</td>
                        <td class="muted" title="${escapeHtml(catalogCompactList(row.platforms, 'Không rõ sàn'))}">${escapeHtml(catalogCompactList(row.platforms, 'Không rõ sàn'))}</td>
                        <td class="muted" title="${escapeHtml(catalogCompactList(row.shops, 'Không rõ shop'))}">${escapeHtml(catalogCompactList(row.shops, 'Không rõ shop'))}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

/**
 * Hiển thị các SKU đang chạm ngưỡng tồn tối thiểu để người vận hành thấy ngay rủi ro hết hàng.
 * Khối này chỉ đọc dữ liệu từ core đối soát tồn, không tự ý đẩy tồn lên sàn.
 */
function renderCatalogLowStockRows(rows = []) {
    const wrap = document.getElementById('productCatalogLowStockList');
    if (!wrap) return;
    if (!Array.isArray(rows) || !rows.length) {
        wrap.innerHTML = '<div class="catalog-warning-empty">Chưa có SKU nào chạm ngưỡng tồn tối thiểu.</div>';
        return;
    }
    wrap.innerHTML = `
        <table class="catalog-warning-table">
            <thead>
                <tr>
                    <th>SKU</th>
                    <th>Sản phẩm</th>
                    <th>Nội bộ</th>
                    <th>Ngưỡng min</th>
                    <th>Tồn sàn</th>
                    <th>Sàn</th>
                    <th>Shop</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(row => `
                    <tr>
                        <td class="sku" title="${escapeHtml(row.sku)}">${escapeHtml(row.sku)}</td>
                        <td class="product" title="${escapeHtml(row.product_name || '')}">${escapeHtml(row.product_name || '')}</td>
                        <td class="num warn">${formatCatalogNumber(row.internal_stock)}</td>
                        <td class="num">${formatCatalogNumber(row.min_stock)}</td>
                        <td class="num">${formatCatalogNumber(row.marketplace_stock)}</td>
                        <td class="muted" title="${escapeHtml(catalogCompactList(row.platforms, 'Không rõ sàn'))}">${escapeHtml(catalogCompactList(row.platforms, 'Không rõ sàn'))}</td>
                        <td class="muted" title="${escapeHtml(catalogCompactList(row.shops, 'Không rõ shop'))}">${escapeHtml(catalogCompactList(row.shops, 'Không rõ shop'))}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderCatalogLimitRows(shops = []) {
    const wrap = document.getElementById('productCatalogLimitList');
    if (!wrap) return;
    const rows = shops.filter(shop => {
        const limits = shop.write_limits || {};
        return catalogNumber(limits.price_max) > 0 || catalogNumber(limits.stock_max) > 0 || catalogNumber(limits.item_count_max) > 0;
    }).slice(0, 6);

    if (!rows.length) {
        wrap.innerHTML = '<div class="catalog-warning-empty">Chưa có dữ liệu giới hạn ghi sản phẩm từ Open Platform.</div>';
        return;
    }

    wrap.innerHTML = `
        <table class="catalog-warning-table">
            <thead>
                <tr>
                    <th>Shop</th>
                    <th>Sàn</th>
                    <th>Giá min</th>
                    <th>Giá max</th>
                    <th>Tồn min</th>
                    <th>Tồn max</th>
                    <th>Tối đa bài</th>
                    <th>Tên/Mô tả</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(shop => {
        const limits = shop.write_limits || {};
        return `
                    <tr>
                        <td class="sku" title="${escapeHtml(shop.shop || 'Không rõ shop')}">${escapeHtml(shop.shop || 'Không rõ shop')}</td>
                        <td class="muted">${escapeHtml(platformLabel(shop.platform))}</td>
                        <td class="num">${formatCatalogNumber(limits.price_min)}</td>
                        <td class="num">${formatCatalogNumber(limits.price_max)}</td>
                        <td class="num">${formatCatalogNumber(limits.stock_min)}</td>
                        <td class="num">${formatCatalogNumber(limits.stock_max)}</td>
                        <td class="num">${formatCatalogNumber(limits.item_count_max)}</td>
                        <td class="muted">Tên ${formatCatalogNumber(limits.item_name_max)} ký tự • Mô tả ${formatCatalogNumber(limits.item_description_max)} ký tự</td>
                    </tr>
        `;
    }).join('')}
            </tbody>
        </table>
    `;
}

function renderCapabilitySummary(summary = {}) {
    const wrap = document.getElementById('productCatalogCapabilityGrid');
    if (!wrap) return;
    const cards = [
        { label: 'Tổng shop', value: formatCatalogNumber(summary.shop_count || summary.total_shops) },
        { label: 'Đang chạy API', value: formatCatalogNumber(summary.api_active_shops) },
        { label: 'Cần kết nối API', value: formatCatalogNumber(summary.api_needs_auth_shops) },
        { label: 'Tham chiếu tay', value: formatCatalogNumber(summary.manual_reference_shops) },
        { label: 'Browser hỗ trợ', value: formatCatalogNumber(summary.browser_reference_shops) }
    ];
    wrap.innerHTML = cards.map(card => `
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px;background:#f8fafc;">
            <div style="font-size:12px;font-weight:800;color:#64748b;">${escapeHtml(card.label)}</div>
            <div style="font-size:22px;font-weight:900;color:#0f172a;margin-top:4px;">${escapeHtml(card.value)}</div>
        </div>
    `).join('');
}

function renderCapabilityGuides(shops = []) {
    const wrap = document.getElementById('productCatalogCapabilityGuides');
    if (!wrap) return;
    const groups = new Map();
    for (const shop of shops) {
        const key = String(shop.capability_mode || '');
        if (!key || groups.has(key)) continue;
        groups.set(key, {
            badge: shop.capability_badge || 'Không rõ',
            guide: shop.operator_guide || 'Chưa có hướng dẫn.',
            mode: key
        });
    }
    const rows = [...groups.values()];
    if (!rows.length) {
        wrap.innerHTML = '<div>Chưa có dữ liệu capability shop.</div>';
        return;
    }
    wrap.innerHTML = rows.map(row => `
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px;background:#fff;">
            <div style="font-weight:800;color:#0f172a;">${escapeHtml(row.badge)}</div>
            <div style="margin-top:4px;color:#475569;">${escapeHtml(row.guide)}</div>
        </div>
    `).join('');
}

function renderCatalogAudit(audit = {}, skuWarnings = {}) {
    const summaryWrap = document.getElementById('productCatalogAuditSummary');
    const listWrap = document.getElementById('productCatalogAuditList');
    if (summaryWrap) {
        const summary = audit.summary || {};
        const skuSummary = skuWarnings.summary || {};
        const cards = [
            { label: 'Thiếu ảnh', value: formatCatalogNumber(summary.missing_image_listings) },
            { label: 'Thiếu cân nặng', value: formatCatalogNumber(summary.missing_weight_listings) },
            { label: 'Thiếu thuộc tính', value: formatCatalogNumber(summary.missing_attribute_listings) },
            { label: 'Thiếu ngành hàng', value: formatCatalogNumber(summary.missing_category_listings) },
            { label: 'Sai ngành hàng', value: formatCatalogNumber(summary.wrong_category_listings) },
            { label: 'Cảnh báo vi phạm', value: formatCatalogNumber(summary.violation_warning_listings) },
            { label: 'Bị giá KM tác động', value: formatCatalogNumber(summary.promotion_affected_listings) },
            { label: 'Bị giảm hiển thị', value: formatCatalogNumber(summary.deboost_listings) },
            { label: 'SKU chưa map', value: formatCatalogNumber(skuSummary.unmapped_skus) },
            { label: 'SKU rác', value: formatCatalogNumber(skuSummary.garbage_skus) },
            { label: 'Map phức tạp', value: formatCatalogNumber(skuSummary.complex_mapping_skus) }
        ];
        summaryWrap.innerHTML = cards.map(card => `
            <div class="catalog-audit-metric">
                <span>${escapeHtml(card.label)}</span>
                <b>${escapeHtml(card.value)}</b>
            </div>
        `).join('');
    }
    if (!listWrap) return;
    const auditRows = Array.isArray(audit.rows) ? audit.rows : [];
    const duplicateRows = Array.isArray(skuWarnings.duplicate_rows) ? skuWarnings.duplicate_rows : [];
    const garbageRows = Array.isArray(skuWarnings.garbage_rows) ? skuWarnings.garbage_rows : [];
    const complexRows = Array.isArray(skuWarnings.complex_rows) ? skuWarnings.complex_rows : [];
    const rows = [
        ...auditRows.map(item => ({
            title: `${item.product_name || item.platform_item_id} (${platformLabel(item.platform)} - ${item.shop || 'Không rõ shop'})`,
            detail: item.warnings.join(' • ')
        })),
        ...duplicateRows.map(item => ({
            title: `${item.internal_sku} (${platformLabel(item.platform)} - ${item.shop || 'Không rõ shop'})`,
            detail: `Một SKU nội bộ đang gắn ${formatCatalogNumber(item.total)} SKU sàn trong cùng shop. Cần kiểm tra xem có map trùng hay không.`
        })),
        ...garbageRows.map(item => ({
            title: `${item.platform_sku} (${platformLabel(item.platform)} - ${item.shop || 'Không rõ shop'})`,
            detail: item.reason
        })),
        ...complexRows.map(item => {
            const components = Array.isArray(item.component_rows) ? item.component_rows : [];
            const componentText = components.length
                ? components.map(component => `${component.sku} x${formatCatalogNumber(component.qty)} (tồn ${formatCatalogNumber(component.internal_stock)})`).join(' • ')
                : 'Chưa có dữ liệu thành phần';
            const missingText = Array.isArray(item.missing_components) && item.missing_components.length
                ? ` | Thiếu thành phần: ${item.missing_components.join(', ')}`
                : '';
            return {
                title: `${item.platform_sku || 'SKU sàn chưa rõ'} (${platformLabel(item.platform)} - ${item.shop || 'Không rõ shop'})`,
                detail: `${item.reason_label}. Tồn sàn ${formatCatalogNumber(item.marketplace_stock)} | Ước lượng tồn khả dụng ${formatCatalogNumber(item.estimated_available_stock)}. ${componentText}${missingText}`
            };
        })
    ].slice(0, 10);
    if (!rows.length) {
        listWrap.innerHTML = '<div class="catalog-warning-empty">Chưa thấy cảnh báo lớn trong nhóm audit hiện tại.</div>';
        return;
    }
    listWrap.innerHTML = `
        <table class="catalog-warning-table">
            <thead>
                <tr>
                    <th>Đối tượng</th>
                    <th>Chi tiết cảnh báo</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(row => `
                    <tr>
                        <td class="product" title="${escapeHtml(row.title)}">${escapeHtml(row.title)}</td>
                        <td class="muted" title="${escapeHtml(row.detail)}">${escapeHtml(row.detail)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderCatalogHistory(history = []) {
    const wrap = document.getElementById('productCatalogHistoryList');
    if (!wrap) return;
    if (!Array.isArray(history) || !history.length) {
        wrap.innerHTML = '<div class="catalog-warning-empty">Chưa có snapshot theo ngày để phân tích.</div>';
        return;
    }
    wrap.innerHTML = `
        <table class="catalog-warning-table">
            <thead>
                <tr>
                    <th>Ngày</th>
                    <th>Bài đăng</th>
                    <th>Tồn sàn quy đổi</th>
                </tr>
            </thead>
            <tbody>
                ${history.map(row => `
                    <tr>
                        <td class="sku">${escapeHtml(row.snapshot_date || '')}</td>
                        <td class="num">${formatCatalogNumber(row.listing_count)}</td>
                        <td class="num">${formatCatalogNumber(row.marketplace_stock)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}
