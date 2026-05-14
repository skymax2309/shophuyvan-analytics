function applyCatalogSettingsToUi(settings = {}) {

    window.productCatalogSettings = settings;
    const manualToggle = document.getElementById('catalogManualStockToggle');
    const stockToggle = document.getElementById('catalogMarketplaceStockToggle');
    const priceToggle = document.getElementById('catalogMarketplacePriceToggle');
    const guardNote = document.getElementById('productCatalogGuardNote');
    if (manualToggle) manualToggle.checked = Number(settings.manual_internal_stock_edit_enabled || 0) === 1;
    if (stockToggle) stockToggle.checked = Number(settings.marketplace_stock_push_enabled || 0) === 1;
    if (priceToggle) priceToggle.checked = Number(settings.marketplace_price_push_enabled || 0) === 1;
    if (guardNote) {
        guardNote.textContent = settings.stock_push_guard_note || 'Kho thật đang tham chiếu ngoài hệ thống nên phần ghi tồn được khóa mặc định.';
    }
}

function catalogPreviewNumber(value) {
    const cleaned = String(value ?? '').trim().replace(/[^\d-]/g, '');
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : 0;
}

function getCatalogPreviewActionType() {
    return document.getElementById('catalogPreviewActionType')?.value || 'update_price';
}

function getCatalogPreviewPlatform() {
    return document.getElementById('catalogPreviewPlatform')?.value || 'shopee';
}

/**
 * Chỉ cho shop API thật đi vào luồng preview ghi giá / ghi tồn.
 * Shop không API sẽ dùng màn hướng dẫn riêng để tránh nhầm là đang có kết nối Open Platform.
 */
function getCatalogPreviewEligibleShops() {
    const platform = getCatalogPreviewPlatform();
    const rows = Array.isArray(window.__shopApiRows) ? window.__shopApiRows : [];
    return rows.filter(shop => {
        const mode = String(shop.capability_mode || '');
        return String(shop.platform || '').toLowerCase() === platform
            && mode === 'api_active'
            && truthyApiFlag(shop.supports_write_preview);
    });
}

function updateCatalogPreviewHelp() {
    const actionType = getCatalogPreviewActionType();
    const textarea = document.getElementById('catalogPreviewItems');
    const help = document.getElementById('catalogWritePreviewHelp');
    if (textarea) {
        textarea.placeholder = actionType === 'update_stock'
            ? 'Ví dụ đẩy tồn\nSKU_A|120\nSKU_B|35'
            : 'Ví dụ đẩy giá\nSKU_A|15000\nSKU_B|27500';
    }
    if (help) {
        help.innerHTML = actionType === 'update_stock'
            ? 'Định dạng mỗi dòng: <strong>SKU sàn | Tồn mới</strong>. Phần này chỉ preview vì core ShipXanh đang khóa đẩy tồn thật.'
            : 'Định dạng mỗi dòng: <strong>SKU sàn | Giá mới</strong>. Giá sẽ bị chặn nếu thấp hơn giá bảo vệ theo core.';
    }
}

function renderCatalogPreviewShopOptions() {
    const select = document.getElementById('catalogPreviewShop');
    if (!select) return;
    const rows = getCatalogPreviewEligibleShops();
    if (!rows.length) {
        select.innerHTML = '<option value="">Không có shop API hợp lệ</option>';
        return;
    }
    const currentValue = select.value;
    select.innerHTML = rows.map(shop => {
        const shopName = shop.shop_name || shop.user_name || shop.api_shop_id || 'Shop chưa rõ tên';
        return `<option value="${escapeHtml(shopName)}">${escapeHtml(shopName)}</option>`;
    }).join('');
    if (rows.some(shop => (shop.shop_name || shop.user_name || shop.api_shop_id || '') === currentValue)) {
        select.value = currentValue;
    }
}

function renderCatalogPreviewResult(result = null) {
    const summaryWrap = document.getElementById('catalogWritePreviewSummary');
    const listWrap = document.getElementById('catalogWritePreviewList');
    if (!summaryWrap || !listWrap) return;
    if (!result) {
        summaryWrap.textContent = 'Chưa chạy preview.';
        listWrap.innerHTML = '<div>Chưa có kết quả preview.</div>';
        return;
    }
    const summary = result.summary || {};
    const settings = result.settings || {};
    summaryWrap.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
            <span><strong>Tổng dòng:</strong> ${escapeHtml(formatCatalogNumber(summary.total_rows))}</span>
            <span><strong>Sẵn sàng gửi:</strong> ${escapeHtml(formatCatalogNumber(summary.ready_rows))}</span>
            <span><strong>Bị chặn:</strong> ${escapeHtml(formatCatalogNumber(summary.blocked_rows))}</span>
            <span><strong>Công tắc giá:</strong> ${Number(settings.marketplace_price_push_enabled || 0) === 1 ? 'Đang bật' : 'Đang tắt'}</span>
            <span><strong>Công tắc tồn:</strong> ${Number(settings.marketplace_stock_push_enabled || 0) === 1 ? 'Đang bật' : 'Đang tắt'}</span>
        </div>
    `;

    const rows = Array.isArray(result.rows) ? result.rows : [];
    if (!rows.length) {
        listWrap.innerHTML = '<div>Không có dòng preview hợp lệ.</div>';
        return;
    }

    listWrap.innerHTML = rows.map(row => {
        const ready = Number(row.can_send_now || 0) === 1;
        const warnings = Array.isArray(row.warnings) ? row.warnings : [];
        const borderColor = ready ? '#bbf7d0' : '#fed7aa';
        const bgColor = ready ? '#f0fdf4' : '#fff7ed';
        const statusText = ready
            ? 'Có thể gửi thật khi bật công tắc'
            : (warnings.length ? 'Bị chặn: xem cảnh báo bên dưới' : 'Chỉ preview, chưa mở gửi thật');
        return `
            <div style="border:1px solid ${borderColor};border-radius:10px;padding:10px;background:${bgColor};">
                <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;">
                    <div>
                        <div style="font-weight:900;color:#0f172a;">${escapeHtml(row.platform_sku || 'SKU chưa rõ')}</div>
                        <div style="font-size:12px;color:#475569;margin-top:4px;">
                            Shop ${escapeHtml(row.shop || '')} • SKU nội bộ ${escapeHtml(row.internal_sku || 'chưa map')}
                        </div>
                    </div>
                    <div style="font-size:12px;font-weight:800;color:${ready ? '#166534' : '#b45309'};">
                        ${escapeHtml(statusText)}
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-top:10px;">
                    <div><strong>Giá hiện tại:</strong> ${escapeHtml(formatCatalogNumber(row.current_price))}đ</div>
                    <div><strong>Giá đề xuất:</strong> ${escapeHtml(formatCatalogNumber(row.proposed_price))}đ</div>
                    <div><strong>Tồn hiện tại:</strong> ${escapeHtml(formatCatalogNumber(row.current_stock))}</div>
                    <div><strong>Tồn đề xuất:</strong> ${escapeHtml(formatCatalogNumber(row.proposed_stock))}</div>
                    <div><strong>Giá vốn chặn:</strong> ${escapeHtml(formatCatalogNumber(row.guard_price))}đ</div>
                    <div><strong>Giá vốn tham chiếu:</strong> ${escapeHtml(formatCatalogNumber(row.cost_base))}đ</div>
                </div>
                <div style="margin-top:8px;color:#475569;">
                    ${warnings.length ? warnings.map(escapeHtml).join('<br>') : 'Không có cảnh báo thêm.'}
                </div>
            </div>
        `;
    }).join('');
}

function parseCatalogPreviewItems(text, actionType) {
    const lines = String(text || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    const rows = [];
    const invalidLines = [];
    for (const line of lines) {
        const parts = line.split(/\||\t/).map(part => part.trim()).filter(Boolean);
        if (parts.length < 2) {
            invalidLines.push(line);
            continue;
        }
        const platformSku = parts[0];
        const numericValue = catalogPreviewNumber(parts[1]);
        if (!platformSku || !Number.isFinite(numericValue) || numericValue <= 0) {
            invalidLines.push(line);
            continue;
        }
        rows.push(actionType === 'update_stock'
            ? { platform_sku: platformSku, stock: numericValue }
            : { platform_sku: platformSku, price: numericValue });
    }
    if (invalidLines.length) {
        throw new Error(`Có dòng sai định dạng. Hãy dùng đúng mẫu "SKU|Giá hoặc Tồn". Dòng lỗi: ${invalidLines.slice(0, 3).join(' ; ')}`);
    }
    return rows;
}

window.handleCatalogPreviewPlatformChange = function() {
    renderCatalogPreviewShopOptions();
};

window.handleCatalogPreviewActionChange = function() {
    updateCatalogPreviewHelp();
};

window.fillCatalogPreviewSample = function() {
    const textarea = document.getElementById('catalogPreviewItems');
    if (!textarea) return;
    textarea.value = getCatalogPreviewActionType() === 'update_stock'
        ? 'SKU_A|120\nSKU_B|35'
        : 'SKU_A|15000\nSKU_B|27500';
};

window.runCatalogWritePreview = async function() {
    const platform = getCatalogPreviewPlatform();
    const shop = document.getElementById('catalogPreviewShop')?.value || '';
    const actionType = getCatalogPreviewActionType();
    const input = document.getElementById('catalogPreviewItems')?.value || '';
    if (!shop) {
        notifyShopApi('Chưa có shop API hợp lệ để chạy preview.', true);
        return;
    }
    try {
        const items = parseCatalogPreviewItems(input, actionType);
        if (!items.length) {
            throw new Error('Bạn chưa nhập SKU nào để preview.');
        }
        const res = await fetch(API + '/api/products/catalog-write-preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                platform,
                shop,
                action_type: actionType,
                items
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) throw new Error(data.error || 'Không preview được lệnh ghi dữ liệu lên sàn');
        renderCatalogPreviewResult(data);
        notifyShopApi(`Đã preview ${formatCatalogNumber(data.summary?.total_rows || 0)} dòng cho shop ${shop}.`);
    } catch (error) {
        renderCatalogPreviewResult(null);
        notifyShopApi('Lỗi preview ghi dữ liệu: ' + error.message, true);
    }
};

function getCatalogListingPreviewActionType() {
    return document.getElementById('catalogListingActionType')?.value || 'update_item';
}

function getCatalogListingPreviewPlatform() {
    return document.getElementById('catalogListingPreviewPlatform')?.value || 'shopee';
}

/**
 * Preview bài đăng/model chỉ mở cho shop API đang hoạt động đúng capability core.
 * Shop không API phải đi luồng tham chiếu tay để tránh ngộ nhận là có quyền ghi dữ liệu thật.
 */
function getCatalogListingPreviewEligibleShops() {
    const platform = getCatalogListingPreviewPlatform();
    const actionType = getCatalogListingPreviewActionType();
    const isModelAction = actionType.includes('model');
    const rows = Array.isArray(window.__shopApiRows) ? window.__shopApiRows : [];
    return rows.filter(shop => {
        if (String(shop.platform || '').toLowerCase() !== platform) return false;
        if (String(shop.capability_mode || '') !== 'api_active') return false;
        return isModelAction
            ? truthyApiFlag(shop.supports_model_write_api)
            : truthyApiFlag(shop.supports_listing_write_api);
    });
}

function catalogListingPreviewPlaceholder(actionType) {
    if (actionType === 'unlist_item' || actionType === 'delete_item') {
        return 'Ví dụ ẩn/xóa bài đăng\nitem_id_1\nitem_id_2';
    }
    if (actionType === 'add_model') {
        return 'Ví dụ thêm model\nitem_id|Tên model mới|SKU_SAN_MOI|15000|12';
    }
    if (actionType === 'update_model') {
        return 'Ví dụ sửa model\nitem_id|model_id|SKU_SAN|Tên model mới|15000|12';
    }
    if (actionType === 'delete_model') {
        return 'Ví dụ xóa model\nitem_id|model_id|SKU_SAN';
    }
    return 'Ví dụ sửa bài đăng\nitem_id|Tên mới|category_id|brand_name';
}

function catalogListingPreviewHelpText(actionType) {
    if (actionType === 'unlist_item') {
        return 'Định dạng mỗi dòng: <strong>item_id</strong>. Hệ thống chỉ xem trước lệnh ẩn bài đăng, chưa gửi thật.';
    }
    if (actionType === 'delete_item') {
        return 'Định dạng mỗi dòng: <strong>item_id</strong>. Lệnh xóa bài đăng đang ở chế độ guard, chỉ trả cảnh báo và log.';
    }
    if (actionType === 'add_model') {
        return 'Định dạng mỗi dòng: <strong>item_id | Tên model | SKU sàn | Giá | Tồn</strong>. Dùng để kiểm tra payload thêm model trước khi mở ghi thật.';
    }
    if (actionType === 'update_model') {
        return 'Định dạng mỗi dòng: <strong>item_id | model_id | SKU sàn | Tên model | Giá | Tồn</strong>. Hệ thống đối chiếu model hiện có trong snapshot.';
    }
    if (actionType === 'delete_model') {
        return 'Định dạng mỗi dòng: <strong>item_id | model_id | SKU sàn</strong>. Core sẽ kiểm tra model đang tồn tại hay không trước khi cho ghi thật.';
    }
    return 'Định dạng mỗi dòng: <strong>item_id | Tên mới | category_id | brand_name</strong>. Có thể bỏ trống cột cuối nếu chưa cần đổi ngành hàng hoặc thương hiệu.';
}

function updateCatalogListingPreviewHelp() {
    const actionType = getCatalogListingPreviewActionType();
    const help = document.getElementById('catalogListingPreviewHelp');
    const textarea = document.getElementById('catalogListingPreviewItems');
    if (help) help.innerHTML = catalogListingPreviewHelpText(actionType);
    if (textarea) textarea.placeholder = catalogListingPreviewPlaceholder(actionType);
}

function renderCatalogListingPreviewShopOptions() {
    const select = document.getElementById('catalogListingPreviewShop');
    if (!select) return;
    const rows = getCatalogListingPreviewEligibleShops();
    if (!rows.length) {
        select.innerHTML = '<option value="">Không có shop API hợp lệ cho loại lệnh này</option>';
        return;
    }
    const currentValue = select.value;
    select.innerHTML = rows.map(shop => {
        const shopName = shop.shop_name || shop.user_name || shop.api_shop_id || 'Shop chưa rõ tên';
        return `<option value="${escapeHtml(shopName)}">${escapeHtml(shopName)}</option>`;
    }).join('');
    if (rows.some(shop => (shop.shop_name || shop.user_name || shop.api_shop_id || '') === currentValue)) {
        select.value = currentValue;
    }
}

function parseCatalogListingPreviewItems(text, actionType) {
    const lines = String(text || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    const rows = [];
    const invalidLines = [];
    for (const line of lines) {
        const parts = line.split(/\||\t/).map(part => part.trim());
        if (!parts[0]) {
            invalidLines.push(line);
            continue;
        }
        if (actionType === 'unlist_item' || actionType === 'delete_item') {
            rows.push({ platform_item_id: parts[0] });
            continue;
        }
        if (actionType === 'add_model') {
            if (parts.length < 5) {
                invalidLines.push(line);
                continue;
            }
            rows.push({
                platform_item_id: parts[0],
                model_name: parts[1],
                platform_sku: parts[2],
                price: catalogPreviewNumber(parts[3]),
                stock: catalogPreviewNumber(parts[4])
            });
            continue;
        }
        if (actionType === 'update_model') {
            if (parts.length < 6) {
                invalidLines.push(line);
                continue;
            }
            rows.push({
                platform_item_id: parts[0],
                model_id: parts[1],
                platform_sku: parts[2],
                model_name: parts[3],
                price: catalogPreviewNumber(parts[4]),
                stock: catalogPreviewNumber(parts[5])
            });
            continue;
        }
        if (actionType === 'delete_model') {
            if (parts.length < 3) {
                invalidLines.push(line);
                continue;
            }
            rows.push({
                platform_item_id: parts[0],
                model_id: parts[1],
                platform_sku: parts[2]
            });
            continue;
        }
        rows.push({
            platform_item_id: parts[0],
            title: parts[1] || '',
            category_id: parts[2] || '',
            brand_name: parts[3] || ''
        });
    }
    if (invalidLines.length) {
        throw new Error(`Có dòng sai định dạng cho preview bài đăng/model. Dòng lỗi: ${invalidLines.slice(0, 3).join(' ; ')}`);
    }
    return rows;
}

function catalogListingStatusLabel(row = {}) {
    const currentStatus = String(row.current_status || '').trim();
    if (currentStatus) return currentStatus;
    const previewStatus = String(row.status || '').trim().toLowerCase();
    if (previewStatus.endsWith('_ready')) return 'Sẵn sàng gửi khi mở ghi thật';
    if (previewStatus.endsWith('_preview_only')) return 'Chỉ preview để kiểm tra payload';
    return 'Preview/guard';
}

function renderCatalogListingPreviewResult(result = null) {
    const summaryWrap = document.getElementById('catalogListingPreviewSummary');
    const listWrap = document.getElementById('catalogListingPreviewList');
    if (!summaryWrap || !listWrap) return;
    if (!result) {
        summaryWrap.textContent = 'Chưa chạy preview bài đăng/model.';
        listWrap.innerHTML = '<div>Chưa có kết quả preview bài đăng/model.</div>';
        return;
    }
    const summary = result.summary || {};
    summaryWrap.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
            <span><strong>Tổng dòng:</strong> ${escapeHtml(formatCatalogNumber(summary.total_rows))}</span>
            <span><strong>Sẵn sàng gửi:</strong> ${escapeHtml(formatCatalogNumber(summary.ready_rows))}</span>
            <span><strong>Bị chặn:</strong> ${escapeHtml(formatCatalogNumber(summary.blocked_rows))}</span>
            <span><strong>Chế độ:</strong> Preview/guard</span>
        </div>
    `;
    const rows = Array.isArray(result.rows) ? result.rows : [];
    if (!rows.length) {
        listWrap.innerHTML = '<div>Không có dòng preview bài đăng/model hợp lệ.</div>';
        return;
    }
    listWrap.innerHTML = rows.map(row => {
        const warnings = Array.isArray(row.warnings) ? row.warnings : [];
        return `
            <div style="border:1px solid #cbd5e1;border-radius:10px;padding:10px;background:#f8fafc;">
                <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;">
                    <div>
                        <div style="font-weight:900;color:#0f172a;">${escapeHtml(row.action_label || 'Preview bài đăng/model')}</div>
                        <div style="font-size:12px;color:#475569;margin-top:4px;">Shop ${escapeHtml(row.shop || '')} • ${escapeHtml(row.product_name || row.platform_item_id || 'Chưa rõ bài đăng')}</div>
                    </div>
                    <div style="font-size:12px;font-weight:800;color:#b45309;">${escapeHtml(row.capability_badge || 'Cần kiểm tra capability')}</div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-top:10px;">
                    <div><strong>Item ID:</strong> ${escapeHtml(row.platform_item_id || 'Chưa có')}</div>
                    <div><strong>Model ID:</strong> ${escapeHtml(row.current_model_id || 'Chưa có')}</div>
                    <div><strong>SKU sàn:</strong> ${escapeHtml(row.current_platform_sku || row.proposed_platform_sku || 'Chưa có')}</div>
                    <div><strong>Trạng thái:</strong> ${escapeHtml(catalogListingStatusLabel(row))}</div>
                    <div><strong>Giá hiện tại:</strong> ${escapeHtml(formatCatalogNumber(row.current_price_min))}đ</div>
                    <div><strong>Tồn hiện tại:</strong> ${escapeHtml(formatCatalogNumber(row.current_marketplace_stock))}</div>
                </div>
                <div style="margin-top:8px;color:#475569;">
                    ${warnings.length ? warnings.map(escapeHtml).join('<br>') : 'Không có cảnh báo thêm.'}
                </div>
            </div>
        `;
    }).join('');
}

window.handleCatalogListingPreviewPlatformChange = function() {
    renderCatalogListingPreviewShopOptions();
    updateCatalogListingPreviewHelp();
};

window.handleCatalogListingActionChange = function() {
    renderCatalogListingPreviewShopOptions();
    updateCatalogListingPreviewHelp();
};

window.fillCatalogListingPreviewSample = function() {
    const textarea = document.getElementById('catalogListingPreviewItems');
    if (!textarea) return;
    const actionType = getCatalogListingPreviewActionType();
    if (actionType === 'unlist_item' || actionType === 'delete_item') {
        textarea.value = 'item_id_1\nitem_id_2';
        return;
    }
    if (actionType === 'add_model') {
        textarea.value = 'item_id|Tên model mới|SKU_SAN_MOI|15000|12';
        return;
    }
    if (actionType === 'update_model') {
        textarea.value = 'item_id|model_id|SKU_SAN|Tên model mới|15000|12';
        return;
    }
    if (actionType === 'delete_model') {
        textarea.value = 'item_id|model_id|SKU_SAN';
        return;
    }
    textarea.value = 'item_id|Tên mới|category_id|brand_name';
};

window.runCatalogListingPreview = async function() {
    const platform = getCatalogListingPreviewPlatform();
    const shop = document.getElementById('catalogListingPreviewShop')?.value || '';
    const actionType = getCatalogListingPreviewActionType();
    const input = document.getElementById('catalogListingPreviewItems')?.value || '';
    if (!shop) {
        notifyShopApi('Chưa có shop API hợp lệ để chạy preview bài đăng/model.', true);
        return;
    }
    try {
        const items = parseCatalogListingPreviewItems(input, actionType);
        if (!items.length) {
            throw new Error('Bạn chưa nhập dữ liệu bài đăng/model để preview.');
        }
        const res = await fetch(API + '/api/products/catalog-listing-preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                platform,
                shop,
                action_type: actionType,
                items
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) throw new Error(data.error || 'Không preview được lệnh bài đăng/model');
        renderCatalogListingPreviewResult(data);
        notifyShopApi(`Đã preview ${formatCatalogNumber(data.summary?.total_rows || 0)} dòng bài đăng/model cho shop ${shop}.`);
    } catch (error) {
        renderCatalogListingPreviewResult(null);
        notifyShopApi('Lỗi preview bài đăng/model: ' + error.message, true);
    }
};
