function platformLabel(platform) {
    const value = String(platform || '').toLowerCase();
    if (value === 'shopee') return 'Shopee';
    if (value === 'lazada') return 'Lazada';
    if (value === 'tiktok') return 'TikTok';
    return value ? value.toUpperCase() : 'Không rõ';
}

function shopKeyText(shop) {
    return String([
        shop.shop_name,
        shop.shopName,
        shop.user_name,
        shop.api_shop_id,
        shop.api_seller_id
    ].filter(Boolean).join(' ')).toLowerCase();
}

function getProductSyncOptions() {
    return { includeOutOfStock: true, syncFullListing: true };
}

function parseApiDate(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw || raw.toLowerCase() === 'invalid date') return null;

    const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z';
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatApiDate(value) {
    const date = value instanceof Date ? value : parseApiDate(value);
    if (!date) return '';
    return date.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function remainingApiTime(date) {
    if (!date) return '';
    const diff = date.getTime() - Date.now();
    if (diff <= 0) return 'đã hết hạn';

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const days = Math.floor(diff / day);
    const hours = Math.floor((diff % day) / hour);
    const minutes = Math.max(1, Math.floor((diff % hour) / minute));

    if (days > 0) return `còn ${days} ngày ${hours} giờ`;
    if (hours > 0) return `còn ${hours} giờ ${minutes} phút`;
    return `còn ${minutes} phút`;
}

function isTechnicalShopeeRow(shop) {
    const name = String(shop.shop_name || '').trim();
    const user = String(shop.user_name || '').trim();
    return /^Shopee\s+\d+$/i.test(name) && /^\d+$/.test(user || name.replace(/\D/g, ''));
}

function getPlatform(shop) {
    return String(shop.platform || shop.Platform || '').trim().toLowerCase();
}

function getShopApiState(shop) {
    const platform = getPlatform(shop);
    const capabilityMode = String(shop.capability_mode || '').trim();
    const accessDate = parseApiDate(shop.token_expire_at);
    const refreshDate = parseApiDate(shop.api_refresh_expire_at);
    const hasAccess = truthyApiFlag(shop.has_access_token);
    const hasRefresh = truthyApiFlag(shop.has_refresh_token);
    const hasPartnerKey = truthyApiFlag(shop.has_partner_key);
    const hasApiShop = !!shop.api_shop_id;
    const accessExpired = !!accessDate && accessDate.getTime() <= Date.now();
    const refreshExpired = !!refreshDate && refreshDate.getTime() <= Date.now();
    const connected = capabilityMode === 'api_active' || (platform === 'shopee'
        ? hasAccess && hasRefresh && hasApiShop
        : hasAccess || hasRefresh || hasApiShop);
    const hasPartnerConfig = hasPartnerKey || !!shop.api_partner_id || connected;

    return {
        platform,
        capabilityMode,
        accessDate,
        refreshDate,
        hasPartnerConfig,
        connected,
        accessExpired,
        refreshExpired
    };
}

/**
 * Lazada đang tách app chat IM khỏi app API chính.
 * Trạng thái này chỉ đọc bộ chat_access_token riêng để UI không nhầm
 * “đã kết nối API chính” với “đã kết nối Chat API”.
 */
function getLazadaChatApiState(shop) {
    const platform = getPlatform(shop);
    const accessDate = parseApiDate(shop.chat_token_expire_at);
    const refreshDate = parseApiDate(shop.chat_api_refresh_expire_at);
    const connectedDate = parseApiDate(shop.chat_api_connected_at);
    const hasAccess = truthyApiFlag(shop.has_chat_access_token);
    const accessExpired = !!accessDate && accessDate.getTime() <= Date.now();
    const refreshExpired = !!refreshDate && refreshDate.getTime() <= Date.now();
    const remainingMs = accessDate ? accessDate.getTime() - Date.now() : NaN;
    const expiringSoon = Number.isFinite(remainingMs) && remainingMs > 0 && remainingMs <= 3 * 24 * 60 * 60 * 1000;
    return {
        platform,
        hasAccess,
        accessDate,
        refreshDate,
        connectedDate,
        connected: platform === 'lazada' && (hasAccess || !!connectedDate),
        accessExpired,
        refreshExpired,
        expiringSoon
    };
}

/**
 * Shopee Video dùng Partner ID/Key và token riêng, nên trạng thái ở đây không đọc
 * access_token chính của đơn hàng/sản phẩm/ADS.
 */
function getShopeeVideoApiState(shop) {
    const platform = getPlatform(shop);
    const accessDate = parseApiDate(shop.video_token_expire_at);
    const refreshDate = parseApiDate(shop.video_api_refresh_expire_at);
    const connectedDate = parseApiDate(shop.video_api_connected_at);
    const testedDate = parseApiDate(shop.video_permission_tested_at);
    const hasApp = !!shop.video_partner_id && truthyApiFlag(shop.has_video_partner_key);
    const hasToken = truthyApiFlag(shop.has_video_access_token);
    const hasRefresh = truthyApiFlag(shop.has_video_refresh_token);
    const hasUser = !!shop.video_api_user_id;
    const accessExpired = !!accessDate && accessDate.getTime() <= Date.now();
    const refreshExpired = !!refreshDate && refreshDate.getTime() <= Date.now();
    const permissionStatus = String(shop.video_permission_status || '').trim().toLowerCase();
    return {
        platform,
        hasApp,
        hasToken,
        hasRefresh,
        hasUser,
        accessDate,
        refreshDate,
        connectedDate,
        testedDate,
        permissionStatus,
        permissionOk: permissionStatus === 'ok',
        message: String(shop.video_permission_message || '').trim(),
        connected: platform === 'shopee' && hasToken && hasUser,
        accessExpired,
        refreshExpired
    };
}

function renderShopeeStatus(shop) {
    const mainState = getShopApiState(shop);
    const videoState = getShopeeVideoApiState(shop);
    let mainText = 'Chưa cấu hình';
    let mainDetail = 'Cần App chính';
    let mainTone = 'neutral';

    if (!mainState.hasPartnerConfig) {
        mainDetail = 'Thiếu Partner ID/Key';
    } else if (!mainState.connected) {
        mainText = 'Chưa cấp quyền';
        mainDetail = 'Đã có App';
        mainTone = 'warn';
    } else if (mainState.refreshExpired) {
        mainText = 'Hết quyền';
        mainDetail = mainState.refreshDate ? formatApiDate(mainState.refreshDate) : 'Cần gia hạn';
        mainTone = 'bad';
    } else if (mainState.accessExpired) {
        mainText = 'Cần làm mới';
        mainDetail = mainState.accessDate ? remainingApiTime(mainState.accessDate) : 'Token hết hạn';
        mainTone = 'warn';
    } else {
        mainText = 'Đang chạy';
        mainDetail = mainState.accessDate ? `Token ${remainingApiTime(mainState.accessDate)}` : 'Token OK';
        mainTone = 'ok';
    }

    let videoText = 'Chưa cấu hình';
    let videoDetail = 'Video riêng';
    let videoTone = 'neutral';

    if (!videoState.hasApp) {
        videoDetail = 'Thiếu App video';
    } else if (!videoState.connected || videoState.refreshExpired) {
        videoText = videoState.refreshExpired ? 'Hết quyền' : 'Chưa cấp quyền';
        videoDetail = videoState.refreshExpired && videoState.refreshDate ? formatApiDate(videoState.refreshDate) : 'Cần kết nối';
        videoTone = videoState.refreshExpired ? 'bad' : 'warn';
    } else if (videoState.accessExpired) {
        videoText = 'Cần làm mới';
        videoDetail = videoState.accessDate ? remainingApiTime(videoState.accessDate) : 'Token hết hạn';
        videoTone = 'warn';
    } else if (!videoState.permissionOk) {
        videoText = 'Cần test';
        videoDetail = videoState.message || 'Chưa test quyền';
        videoTone = 'warn';
    } else {
        videoText = 'Sẵn sàng';
        videoDetail = videoState.accessDate ? `Token ${remainingApiTime(videoState.accessDate)}` : 'Đã test quyền';
        videoTone = 'ok';
    }

    return `
        <div class="shop-connect-status">
            ${renderStatusMini('API chính', mainText, mainDetail, mainTone)}
            ${renderStatusMini('Video', videoText, videoDetail, videoTone)}
        </div>
        ${renderApiSyncDiagnostics(shop)}
    `;
}

function renderLazadaStatus(shop) {
    const mainState = getShopApiState(shop);
    const chatState = getLazadaChatApiState(shop);
    let mainText = 'Chưa kết nối';
    let mainDetail = 'API chính';
    let mainTone = 'neutral';
    if (mainState.connected && !mainState.accessExpired) {
        mainText = 'Đang chạy';
        mainDetail = mainState.accessDate ? `Token ${remainingApiTime(mainState.accessDate)}` : 'Token OK';
        mainTone = 'ok';
    } else if (mainState.connected && mainState.accessExpired) {
        mainText = 'Cần gia hạn';
        mainDetail = mainState.accessDate ? formatApiDate(mainState.accessDate) : 'Token hết hạn';
        mainTone = 'bad';
    }

    let chatText = 'Chưa kết nối';
    let chatDetail = 'Chat riêng';
    let chatTone = 'neutral';
    if (chatState.connected && !chatState.accessExpired) {
        chatText = chatState.expiringSoon ? 'Sắp hết hạn' : 'Đang chạy';
        chatDetail = chatState.accessDate ? `Token ${remainingApiTime(chatState.accessDate)}` : 'Token OK';
        chatTone = chatState.expiringSoon ? 'warn' : 'ok';
    } else if (chatState.connected && chatState.accessExpired) {
        chatText = 'Cần gia hạn';
        chatDetail = chatState.accessDate ? formatApiDate(chatState.accessDate) : 'Token hết hạn';
        chatTone = 'bad';
    }

    return `
        <div class="shop-connect-status">
            ${renderStatusMini('API chính', mainText, mainDetail, mainTone)}
            ${renderStatusMini('Chat', chatText, chatDetail, chatTone)}
        </div>
        ${renderApiSyncDiagnostics(shop)}
    `;
}

function statusBadge(text, bg, color) {
    return `<span style="display:inline-flex;align-items:center;gap:4px;background:${bg};color:${color};padding:4px 8px;border-radius:6px;font-weight:700;font-size:12px;">${text}</span>`;
}

function renderStatusMini(label, value, detail = '', tone = 'neutral') {
    const toneClass = tone && tone !== 'neutral' ? ` is-${tone}` : '';
    return `
        <div class="shop-status-mini${toneClass}">
            <span>${escapeHtml(label)}</span>
            <b title="${escapeHtml(value)}">${escapeHtml(value)}</b>
            ${detail ? `<small title="${escapeHtml(String(detail))}">${escapeHtml(String(detail))}</small>` : ''}
        </div>
    `;
}

function syncTone(status) {
    const value = String(status || '').toLowerCase();
    if (value === 'ok') return 'ok';
    if (value === 'partial_error' || value === 'no_api_shop') return 'warn';
    if (value === 'error') return 'bad';
    return 'neutral';
}

function syncLabel(status) {
    const value = String(status || '').toLowerCase();
    if (value === 'ok') return 'OK';
    if (value === 'partial_error') return 'Có cảnh báo';
    if (value === 'error') return 'Lỗi';
    if (value === 'no_api_shop') return 'Không có shop API';
    return 'Chưa chạy';
}

function orderSyncMode(shop) {
    return String(shop.order_sync_mode || shop.order_source_mode || '').toLowerCase();
}

function orderSyncShortLabel(mode) {
    if (mode === 'api_sync') return 'Kéo đơn API';
    if (mode === 'browser_sync') return 'Quét Browser';
    if (mode === 'import_file_sync') return 'Import đơn';
    return 'Đơn manual';
}

function orderSyncDetail(shop) {
    const lastAt = formatApiDate(shop.last_order_sync_at || shop.last_order_source_at);
    const touched24h = Number(shop.last_order_source_touched_24h || 0);
    const total7d = Number(shop.last_order_source_orders_7d || 0);
    const countText = touched24h > 0
        ? `${touched24h} đơn / 24h`
        : (total7d > 0 ? `${total7d} đơn / 7 ngày` : '');
    return [lastAt, countText].filter(Boolean).join(' · ') || 'Chưa có lần chạy';
}

function orderRunnerValue(shop) {
    const status = String(shop.order_runner_status || '').toLowerCase();
    if (shop.order_runner_status_label) return String(shop.order_runner_status_label);
    if (status === 'scheduled') return 'Cron API đã cấu hình';
    if (status === 'paused') return 'Đang tạm dừng';
    if (Number(shop.order_runner_running || 0) === 1) return 'Đang chạy';
    return 'Chưa có runner tự động';
}

function orderRunnerTone(shop) {
    const status = String(shop.order_runner_status || '').toLowerCase();
    if (status === 'scheduled' || status === 'running') return 'ok';
    if (status === 'paused') return 'warn';
    if (status === 'not_running') return 'bad';
    if (status === 'helper_unavailable') return 'warn';
    return 'warn';
}

function orderRunnerDetail(shop) {
    const startedAt = formatApiDate(shop.order_runner_started_at || shop.report_worker_started_at || shop.radar_started_at);
    const pid = shop.order_runner_pid || shop.report_worker_pid || shop.radar_pid || '';
    const schedule = shop.order_runner_schedule || '';
    const pieces = [];
    if (startedAt) pieces.push(`bật ${startedAt}`);
    if (pid) pieces.push(`PID ${pid}`);
    if (schedule) pieces.push(schedule);
    return pieces.join(' · ') || (shop.order_runner_missing_message || 'Chưa có lịch runner tự động');
}

function orderRunnerSourceDetail(shop) {
    const source = shop.order_runner_running_source || '';
    const runner = shop.order_runner_name || '';
    const error = shop.order_runner_last_error || shop.report_worker_autostart_error || '';
    return [runner, error ? `Lỗi: ${error}` : source].filter(Boolean).join(' · ') || 'Chưa ghi nguồn runner';
}

function operationDiagnosticValue(status, fallback = 'Chưa chạy') {
    const value = String(status || '').toLowerCase();
    if (value === 'ok' || value === 'success') return 'OK';
    if (value === 'error') return 'Lỗi';
    if (value === 'manual_required') return 'Cần làm thủ công';
    if (value === 'running') return 'Đang chạy';
    if (value === 'pending') return 'Đang chờ';
    return status || fallback;
}

function operationDiagnosticTone(status, errorCount = 0, manualCount = 0) {
    const value = String(status || '').toLowerCase();
    if (Number(errorCount || 0) > 0 || value === 'error') return 'bad';
    if (Number(manualCount || 0) > 0 || value === 'manual_required') return 'warn';
    if (value === 'ok' || value === 'success') return 'ok';
    return 'warn';
}

function detailParserDiagnostic(shop) {
    const lastAt = formatApiDate(shop.detail_parser_last_run_at);
    const touched = Number(shop.detail_parser_touched_count || 0);
    const retry = Number(shop.pending_next_retry_count || 0);
    const error = shop.detail_parser_last_error || '';
    const detail = [
        lastAt || 'Chưa có lần chạy',
        touched ? `${touched} đơn có detail` : '',
        retry ? `${retry} đơn chờ retry` : '',
        error ? `Lỗi: ${error}` : ''
    ].filter(Boolean).join(' · ');
    return renderStatusMini(
        'Detail parser',
        operationDiagnosticValue(shop.detail_parser_last_status),
        detail,
        operationDiagnosticTone(shop.detail_parser_last_status, error ? 1 : 0)
    );
}

function labelRunnerDiagnostic(shop) {
    const lastAt = formatApiDate(shop.label_runner_last_run_at);
    const manual = Number(shop.label_manual_required_count || 0);
    const errors = Number(shop.label_runner_error_count || 0);
    const error = shop.label_runner_last_error || '';
    const detail = [
        lastAt || 'Chưa có lần chạy',
        manual ? `${manual} manual_required` : '',
        errors ? `${errors} lỗi` : '',
        error ? `Lỗi gần nhất: ${error}` : ''
    ].filter(Boolean).join(' · ');
    return renderStatusMini(
        'Tem vận chuyển',
        operationDiagnosticValue(shop.label_runner_last_status),
        detail,
        operationDiagnosticTone(shop.label_runner_last_status, errors, manual)
    );
}

function tiktokRunnerDiagnostic(shop) {
    const platform = String(shop.platform || shop.Platform || '').toLowerCase();
    if (platform !== 'tiktok') return '';
    const paused = Number(shop.tiktok_runner_paused || 0) === 1;
    const loginRequired = Number(shop.tiktok_runner_profile_login_required || 0) === 1;
    const state = String(shop.tiktok_runner_state || shop.order_runner_status || '').toLowerCase();
    const value = paused
        ? 'Tạm dừng'
        : (loginRequired ? 'Cần đăng nhập' : (state === 'running' ? 'Đang chạy' : (state === 'error' ? 'Lỗi' : 'Không chạy')));
    const tone = paused || loginRequired ? 'warn' : (state === 'running' ? 'ok' : (state === 'error' ? 'bad' : 'neutral'));
    const detail = [
        shop.tiktok_runner_type ? `Runner type: ${shop.tiktok_runner_type}` : '',
        shop.tiktok_runner_profile_dir ? `Profile: ${shop.tiktok_runner_profile_dir}` : '',
        `PID ${shop.tiktok_runner_pid || '-'}`,
        shop.tiktok_runner_browser_pids ? `Chrome PID ${shop.tiktok_runner_browser_pids}` : '',
        shop.tiktok_runner_started_at ? `Bật ${formatApiDate(shop.tiktok_runner_started_at)}` : '',
        `Heartbeat ${formatApiDate(shop.tiktok_runner_last_heartbeat_at) || '-'}`,
        `Lần chạy ${formatApiDate(shop.tiktok_runner_last_run_at) || '-'}`,
        shop.tiktok_runner_current_order_no ? `Đơn ${shop.tiktok_runner_current_order_no}` : '',
        `Queue ${Number(shop.tiktok_runner_queue_pending || 0)}/${Number(shop.tiktok_runner_queue_processing || 0)}/${Number(shop.tiktok_runner_queue_failed || 0)}`,
        `Retry ${formatApiDate(shop.tiktok_runner_next_retry_at) || '-'}`,
        `Lý do: ${shop.tiktok_runner_pause_reason || '-'}`,
        loginRequired ? 'Cần đăng nhập TikTok Seller Center cho profile automation' : '',
        `Lỗi: ${shop.tiktok_runner_last_error || 'Không có'}`,
        Number(shop.tiktok_runner_touched_24h || 0) ? `${Number(shop.tiktok_runner_touched_24h || 0)} lượt / 24h` : ''
    ].filter(Boolean).join(' · ');
    const controls = `
        <div class="runner-controls">
            <button type="button" onclick="controlTikTokRunner('pause')">Tạm dừng</button>
            <button type="button" onclick="controlTikTokRunner('resume')">Kiểm resume</button>
            <button type="button" onclick="controlTikTokRunner('stop')">Dừng phiên</button>
        </div>
    `;
    return renderStatusMini('TikTok automation', value, detail, tone) + controls;
}

function renderApiSyncDiagnostics(shop) {
    const mode = orderSyncMode(shop);
    const state = getShopApiState(shop);
    const hasOrderSource = Boolean(shop.last_order_sync_at || shop.last_order_source_at);
    const orderStatus = shop.last_order_sync_status || (hasOrderSource ? 'ok' : '');
    const statusSync = shop.last_order_status_sync_status || '';
    const realtimeMode = String(shop.realtime_mode || '').toLowerCase();
    const apiOrderMode = mode === 'api_sync' || state.capabilityMode === 'api_active';
    const realtimeText = shop.realtime_active
        ? 'Webhook đang có tín hiệu'
        : (apiOrderMode && realtimeMode === 'fallback_polling' ? 'Fallback polling' : 'Không polling API');
    const statusDetail = apiOrderMode
        ? (formatApiDate(shop.last_order_status_sync_at) || 'Chưa có lần chạy')
        : (formatApiDate(shop.last_order_status_sync_at) || 'Theo nguồn đơn fallback');
    const errorText = shop.last_order_sync_error || shop.last_order_status_sync_error || shop.last_webhook_event_error || '';
    return `
        <div class="shop-sync-diagnostics">
            ${renderStatusMini(orderSyncShortLabel(mode), syncLabel(orderStatus), orderSyncDetail(shop), syncTone(orderStatus))}
            ${renderStatusMini('Runner đơn', orderRunnerValue(shop), orderRunnerDetail(shop), orderRunnerTone(shop))}
            ${renderStatusMini('Nguồn runner', shop.order_runner_type || 'chưa rõ', orderRunnerSourceDetail(shop), shop.order_runner_running_source === 'local_helper_health' ? 'warn' : 'neutral')}
            ${renderStatusMini(apiOrderMode ? 'Trạng thái API' : 'Trạng thái', apiOrderMode ? syncLabel(statusSync) : (statusSync ? syncLabel(statusSync) : 'Theo fallback'), statusDetail, apiOrderMode ? syncTone(statusSync) : 'neutral')}
            ${renderStatusMini('Webhook', shop.last_webhook_event_at ? 'Đã nhận' : 'Chưa thấy', formatApiDate(shop.last_webhook_event_at) || 'Chờ event sàn', shop.last_webhook_event_at ? 'ok' : 'warn')}
            ${renderStatusMini('Realtime', realtimeText, realtimeMode === 'webhook_plus_polling' ? 'Webhook + polling' : (apiOrderMode ? 'Polling dự phòng' : 'Browser/import/manual'), shop.realtime_active ? 'ok' : (apiOrderMode ? 'warn' : 'neutral'))}
            ${tiktokRunnerDiagnostic(shop)}
            ${detailParserDiagnostic(shop)}
            ${labelRunnerDiagnostic(shop)}
            ${errorText ? `<div class="shop-sync-error" title="${escapeHtml(errorText)}">Lỗi gần nhất: ${escapeHtml(errorText)}</div>` : ''}
        </div>
    `;
}

function renderStatus(shop) {
    const state = getShopApiState(shop);
    const guide = shop.operator_guide || '';

    if (state.platform === 'shopee') {
        return renderShopeeStatus(shop);
    }

    if (state.capabilityMode === 'manual_reference') {
        return `<div class="shop-connect-status">${renderStatusMini('API chính', 'Chưa API', guide || 'Tham chiếu tay', 'warn')}</div>${renderApiSyncDiagnostics(shop)}`;
    }

    if (state.capabilityMode === 'browser_reference') {
        return `<div class="shop-connect-status">${renderStatusMini('API chính', 'Browser', guide || 'Có kiểm soát', 'warn')}</div>${renderApiSyncDiagnostics(shop)}`;
    }

    if (state.capabilityMode === 'api_needs_auth') {
        return `<div class="shop-connect-status">${renderStatusMini('API chính', 'Cần kết nối', guide || 'Cần cấp quyền', 'warn')}</div>${renderApiSyncDiagnostics(shop)}`;
    }

    if (state.platform === 'tiktok') {
        return `<div class="shop-connect-status">${renderStatusMini('API chính', 'Chưa API', 'Dùng file/browser', 'warn')}</div>${renderApiSyncDiagnostics(shop)}`;
    }

    if (state.platform === 'lazada') {
        return renderLazadaStatus(shop);
    }

    return `<div class="shop-connect-status">${renderStatusMini('API chính', 'Chưa hỗ trợ', '', 'neutral')}</div>`;
}

function actionButton(label, action, style = 'primary') {
    const styles = {
        primary: 'background:#2563eb;color:white;border:1px solid #2563eb;',
        shopee: 'background:#f97316;color:white;border:1px solid #f97316;',
        lazada: 'background:#0ea5e9;color:white;border:1px solid #0ea5e9;',
        soft: 'background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;',
        danger: 'background:#fee2e2;color:#dc2626;border:1px solid #fecaca;',
        disabled: 'background:#f8fafc;color:#cbd5e1;border:1px solid #e2e8f0;cursor:not-allowed;'
    };
    const disabled = style === 'disabled' ? 'disabled' : '';
    return `<button ${disabled} onclick="${action}" style="padding:6px 10px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;${styles[style] || styles.primary}">${label}</button>`;
}

function renderActionGroup(title, buttons = [], note = '') {
    if (!buttons.length) return '';
    return `
        <div class="shop-action-line">
            <span>${escapeHtml(title)}</span>
            <div class="shop-action-buttons">${buttons.join('')}</div>
        </div>
    `;
}

function renderProductSyncButton(shop) {
    const id = Number(shop.id);
    const state = getShopApiState(shop);
    if (!Number.isFinite(id) || !['shopee', 'lazada'].includes(state.platform)) {
        return actionButton('Không hỗ trợ', '', 'disabled');
    }
    if (shop.supports_product_sync) {
        return actionButton('Đồng bộ', `syncApiProductsForShop(${id})`, 'soft');
    }
    if (shop.supports_manual_reference || shop.supports_browser_reference) {
        return actionButton('Xem hướng dẫn', `showNonApiGuide(${id})`, 'soft');
    }
    return actionButton('Cần kết nối API', '', 'disabled');
}

function renderProcessingMode(shop) {
    const mode = String(shop.order_sync_mode || shop.order_source_mode || shop.product_sync_mode || shop.capability_mode || '');
    if (mode === 'api_sync') {
        return `
            <div class="shop-mode-compact"><b>API</b><span>Open Platform</span></div>
        `;
    }
    if (mode === 'browser_sync') {
        return `
            <div class="shop-mode-compact"><b>Browser</b><span>Helper có log</span></div>
        `;
    }
    if (mode === 'import_file_sync') {
        return `
            <div class="shop-mode-compact"><b>Import</b><span>File chuẩn hóa</span></div>
        `;
    }
    if (mode === 'manual_reference') {
        return `
            <div class="shop-mode-compact"><b>Manual</b><span>Tham chiếu có log</span></div>
        `;
    }
    if (mode === 'api_snapshot') {
        return `
            <div class="shop-mode-compact"><b>API snapshot</b><span>Open Platform</span></div>
        `;
    }
    if (mode === 'await_api_auth') {
        return `
            <div class="shop-mode-compact"><b>Chờ cấp quyền</b><span>Cần xác thực API</span></div>
        `;
    }
    if (mode === 'browser_reference') {
        return `
            <div class="shop-mode-compact"><b>Browser hỗ trợ</b><span>Thao tác có log</span></div>
        `;
    }
    return `
        <div class="shop-mode-compact"><b>Tham chiếu tay</b><span>File hoặc dữ liệu nội bộ</span></div>
    `;
}

function renderActions(shop) {
    const id = Number(shop.id);
    const state = getShopApiState(shop);
    const buttons = [];

    if (!Number.isFinite(id)) {
        return actionButton('Không hợp lệ', '', 'disabled');
    }

    if (state.platform === 'shopee') {
        const videoState = getShopeeVideoApiState(shop);
        const mainButtons = [];
        const videoButtons = [];
        if (shop.supports_manual_reference || shop.supports_browser_reference) {
            mainButtons.push(actionButton('Xem hướng dẫn', `showNonApiGuide(${id})`, 'soft'));
        }
        if (!state.hasPartnerConfig) {
            mainButtons.push(actionButton('Cấu hình', `openApiDashboard(${id})`, 'soft'));
        } else {
            mainButtons.push(actionButton('Kết nối', `connectShopApi(${id})`, 'shopee'));
        }

        if (state.connected && !state.refreshExpired) {
            mainButtons.push(actionButton('Làm mới', `refreshShopToken(${id})`, 'soft'));
            mainButtons.push(actionButton('Đơn API', `syncApiOrdersForShop(${id})`, 'soft'));
        }
        if (state.connected) {
            mainButtons.push(actionButton('Ngắt', `disconnectShopApi(${id})`, 'danger'));
        }

        if (!videoState.hasApp) {
            videoButtons.push(actionButton('Cấu hình', `openApiDashboard(${id}, 'video')`, 'soft'));
        } else {
            videoButtons.push(actionButton('Kết nối', `connectShopeeVideoApi(${id})`, 'shopee'));
        }
        if (videoState.connected) {
            videoButtons.push(actionButton('Test quyền', `testShopeeVideoApi(${id})`, 'soft'));
            if (!videoState.refreshExpired) {
                videoButtons.push(actionButton('Làm mới', `refreshShopeeVideoToken(${id})`, 'soft'));
            }
            videoButtons.push(actionButton('Ngắt', `disconnectShopeeVideoApi(${id})`, 'danger'));
        } else if (videoState.hasApp) {
            videoButtons.push(actionButton('Test quyền', '', 'disabled'));
        }

        return `
            <div style="display:grid;gap:8px;">
                ${renderActionGroup('API', mainButtons)}
                ${renderActionGroup('Video', videoButtons)}
            </div>
        `;
    } else if (state.platform === 'lazada') {
        const mainButtons = [];
        if (shop.supports_manual_reference || shop.supports_browser_reference) {
            mainButtons.push(actionButton('Xem hướng dẫn', `showNonApiGuide(${id})`, 'soft'));
        }
        mainButtons.push(actionButton(state.connected ? 'Gia hạn' : 'Kết nối', `connectLazadaApi(${id})`, 'lazada'));
        if (state.connected) {
            mainButtons.push(actionButton('Đơn API', `syncApiOrdersForShop(${id})`, 'soft'));
            mainButtons.push(actionButton('Ngắt', `disconnectShopApi(${id})`, 'danger'));
        }
        return `
            <div style="display:grid;gap:8px;">
                ${renderActionGroup('API', mainButtons)}
            </div>
        `;
    } else if (shop.supports_browser_reference || shop.supports_manual_reference) {
        buttons.push(actionButton('Xem hướng dẫn', `showNonApiGuide(${id})`, 'soft'));
    } else {
        buttons.push(actionButton('Không hỗ trợ', '', 'disabled'));
    }

    return `<div class="shop-action-buttons">${buttons.join('')}</div>`;
}
