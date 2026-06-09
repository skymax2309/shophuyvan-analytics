import { API } from '../oms-dashboard/oms-api.js';
import { showToast } from '../utils/helpers.js';
import { checkRadarLocal, runRadarJobsLocal, saveRadarSchedulerConfig, wakeRadarLocal } from './oms-radar-helper.js';

const DEFAULT_SETTINGS = {
  enabled: false,
  auto_order_enabled: true,
  auto_status_enabled: true,
  auto_detail_enabled: true,
  auto_finance_enabled: true,
  auto_label_enabled: true,
  auto_customer_enabled: true,
  auto_start_python: true,
  order_min_minutes: 10,
  order_max_minutes: 20,
  status_min_minutes: 10,
  status_max_minutes: 20,
  detail_min_minutes: 30,
  detail_max_minutes: 60,
  finance_min_minutes: 60,
  finance_max_minutes: 120,
  label_min_minutes: 30,
  label_max_minutes: 90,
  customer_min_minutes: 60,
  customer_max_minutes: 180,
  run_start_time: '05:00',
  run_end_time: '23:00',
  run_start_hour: 5,
  run_end_hour: 23
};

const AUTO_ACTIONS = [
  {
    id: 'order',
    setting: 'auto_order_enabled',
    action_type: 'pull_orders',
    label: 'Tự kéo đơn mới',
    detail: 'Lấy đơn mới vào Order Core.',
    scope: ['order_list', 'basic_order', 'status', 'tracking', 'items']
  },
  {
    id: 'status',
    setting: 'auto_status_enabled',
    action_type: 'refresh_status',
    label: 'Tự cập nhật trạng thái',
    detail: 'Cập nhật trạng thái, hành trình và tracking.',
    scope: ['status', 'fulfillment', 'tracking', 'timeline', 'items']
  },
  {
    id: 'detail',
    setting: 'auto_detail_enabled',
    action_type: 'sync_detail',
    label: 'Tự đồng bộ chi tiết',
    detail: 'Bù thông tin chi tiết thiếu về Order Core.',
    scope: ['status_detail', 'tracking_timeline', 'customer', 'items']
  },
  {
    id: 'finance',
    setting: 'auto_finance_enabled',
    action_type: 'sync_finance',
    label: 'Tự cập nhật tài chính',
    detail: 'Chỉ cập nhật Finance Core an toàn, không sync Payment live.',
    scope: ['actual_income', 'estimated_income', 'profit_basis', 'temporary_fee']
  },
  {
    id: 'label',
    setting: 'auto_label_enabled',
    action_type: 'retry_label',
    label: 'Tự tải lại tem lỗi',
    detail: 'Retry tem lỗi qua Label Core, không gọi ship/arrange.',
    scope: ['label_pdf', 'label_status']
  },
  {
    id: 'customer',
    setting: 'auto_customer_enabled',
    action_type: 'sync_customers',
    label: 'Tự lấy database khách hàng',
    detail: 'TikTok lấy qua runner chi tiết; Lazada lấy qua Open Platform rồi ghi Customer Core.',
    scope: ['customer_profile', 'phone', 'address', 'source_order']
  }
];

const LOCAL_ACTION_SHOPS = [
  { platform: 'tiktok', shop: '0909128999', label: 'TikTok 0909128999', limit: 1 },
  { platform: 'shopee', shop: 'khogiadungcona', label: 'Shopee khogiadungcona', limit: 1 }
];

const DATE_SCAN_ACTIONS = [
  { value: 'pull_orders', label: 'Kéo đơn mới' },
  { value: 'refresh_status', label: 'Cập nhật trạng thái' },
  { value: 'retry_label', label: 'Tải lại tem lỗi' },
  { value: 'sync_finance', label: 'Đồng bộ tài chính' },
  { value: 'refresh_tracking', label: 'Quét lại tracking' },
  { value: 'sync_detail', label: 'Đồng bộ chi tiết' },
  { value: 'scan_all_errors', label: 'Tổng hợp lỗi' }
];

const DATE_SCAN_FIELDS = [
  { value: 'created_at', label: 'Ngày tạo đơn' },
  { value: 'updated_at', label: 'Ngày cập nhật' },
  { value: 'status_updated_at', label: 'Ngày đổi trạng thái' },
  { value: 'last_synced_at', label: 'Ngày đồng bộ cuối' }
];

let dateScanPreviewResult = null;
let dateScanLastLiveResult = null;
let coreShopOptions = [];
let pullAllLastResult = null;

function numberValue(id, fallback) {
  const value = Number.parseInt(document.getElementById(id)?.value, 10);
  return Number.isFinite(value) ? value : fallback;
}

function checkedValue(id) {
  return !!document.getElementById(id)?.checked;
}

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim();
}

function escapeHtml(value) {
  return cleanText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function todayYmd() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function coreShopValue(shop = {}) {
  return cleanText(shop.shop_name || shop.user_name || shop.configured_alias || shop.shop_id || shop.api_shop_id);
}

function coreShopLabel(shop = {}) {
  const display = cleanText(shop.shop_display_name || shop.configured_alias || shop.shop_name || shop.user_name || shop.shop_id);
  const mode = cleanText(shop.operator_badge || shop.api_capability || shop.api_status);
  const count = Number(shop.counts?.orders || 0) || 0;
  return `${display || 'Shop Core'}${mode ? ` · ${mode}` : ''}${count ? ` · ${count} đơn` : ''}`;
}

async function fetchCoreShops(platform) {
  const platforms = platform ? [platform] : ['tiktok', 'shopee', 'lazada'];
  const results = await Promise.all(platforms.map(async item => {
    const data = await fetch(`${API}/api/core/shops?platform=${encodeURIComponent(item)}&limit=200`, { cache: 'no-store' })
      .then(response => response.json())
      .catch(() => ({ shops: [] }));
    return Array.isArray(data?.shops) ? data.shops : [];
  }));
  return results.flat().filter(shop => coreShopValue(shop));
}

function renderCoreShopSelect(platform, preferred = '') {
  const select = document.getElementById('botDateScanShop');
  if (!select) return;
  const filtered = coreShopOptions.filter(shop => !platform || cleanText(shop.platform).toLowerCase() === platform);
  const previous = preferred || select.value;
  select.innerHTML = filtered.length
    ? filtered.map(shop => {
      const value = coreShopValue(shop);
      return `<option value="${escapeHtml(value)}"${value === previous ? ' selected' : ''}>${escapeHtml(coreShopLabel(shop))}</option>`;
    }).join('')
    : '<option value="">Không đọc được Shop Core</option>';
}

async function refreshManualCoreShops(preferred = '') {
  const platform = cleanText(document.getElementById('botDateScanPlatform')?.value).toLowerCase() || 'tiktok';
  const select = document.getElementById('botDateScanShop');
  if (select) select.innerHTML = '<option value="">Đang đọc Shop Core...</option>';
  coreShopOptions = await fetchCoreShops('');
  renderCoreShopSelect(platform, preferred);
}

function formatDateTime(value) {
  const text = cleanText(value);
  if (!text) return 'Chưa có';
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  });
}

function resultText(value) {
  if (!value) return 'Chưa từng chạy từ khi bật auto';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const parts = [];
    if (value.status) parts.push(value.status);
    if (Array.isArray(value.ran_shops)) parts.push(`chạy ${value.ran_shops.length} shop`);
    if (Array.isArray(value.skipped) && value.skipped.length) parts.push(`bỏ qua ${value.skipped.length}`);
    if (Array.isArray(value.errors) && value.errors.length) parts.push(`lỗi ${value.errors.length}`);
    return parts.join(' · ') || JSON.stringify(value);
  }
  return String(value);
}

function reasonText(value) {
  const key = cleanText(value);
  const labels = {
    auto_disabled: 'Auto đang tắt',
    outside_active_window: 'Ngoài khung giờ chạy',
    scheduler_not_running: 'Scheduler chưa chạy',
    radar_online_scheduler_stale: 'Radar online nhưng scheduler chưa chạy',
    browser_lock_busy: 'Scheduler đang chờ tác vụ trước',
    loop_stopped: 'Scheduler đã dừng'
  };
  return labels[key] || key || '';
}

function nextWorkerCronAt() {
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  const minute = Math.floor(now.getMinutes() / 5) * 5 + 5;
  if (minute >= 60) {
    next.setHours(next.getHours() + 1, 0, 0, 0);
  } else {
    next.setMinutes(minute, 0, 0);
  }
  return next.toISOString();
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function normalizeTime(value, legacyHour, fallback) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const hour = Number.parseInt(match[1], 10);
    const minute = Number.parseInt(match[2], 10);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${pad2(hour)}:${pad2(minute)}`;
    }
  }
  const hour = Number.parseInt(legacyHour, 10);
  if (Number.isFinite(hour)) return `${pad2(Math.min(Math.max(hour, 0), 23))}:00`;
  return fallback;
}

function timeValue(id, fallback) {
  return normalizeTime(document.getElementById(id)?.value, null, fallback);
}

function formatBotTimeInput(input) {
  let raw = String(input?.value || '').replace(/\D/g, '').slice(0, 4);
  if (raw.length >= 3) raw = `${raw.slice(0, 2)}:${raw.slice(2)}`;
  input.value = raw;
}

function normalizeBotTimeInput(input, fallback) {
  input.value = normalizeTime(input.value, null, fallback);
}

function hourFromTime(value, fallback) {
  const text = normalizeTime(value, fallback, `${pad2(fallback)}:00`);
  return Number.parseInt(text.slice(0, 2), 10);
}

function ensureBotSettingsModal() {
  if (document.getElementById('botSettingsModal')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="botSettingsModal">
      <div class="modal bot-settings-modal">
        <div class="modal-header">
          <div class="modal-title">Cài đặt vận hành</div>
          <button class="modal-close" onclick="closeModal('botSettingsModal')">x</button>
        </div>
        <div class="bot-settings-body">
          <div class="bot-settings-tabs" role="tablist" aria-label="Cài đặt vận hành OMS">
            <button type="button" class="active" data-bot-settings-tab="auto" onclick="switchBotSettingsTab('auto')">Cài tự động</button>
            <button type="button" data-bot-settings-tab="manual" onclick="switchBotSettingsTab('manual')">Chạy thủ công</button>
          </div>
          <section class="bot-settings-panel active" data-bot-settings-panel="auto">
            <label class="bot-toggle">
              <input type="checkbox" id="bot_enabled">
              <span>Bật auto cho shop không API</span>
            </label>
            <div class="bot-action-grid">
              ${AUTO_ACTIONS.map(action => `
                <label class="bot-toggle bot-action-toggle">
                  <input type="checkbox" id="bot_${action.setting}">
                  <span>
                    <b>${escapeHtml(action.label)}</b>
                    <small>${escapeHtml(action.detail)}</small>
                    <em>action_type=${escapeHtml(action.action_type)}</em>
                  </span>
                </label>
              `).join('')}
            </div>
            <label class="bot-toggle">
              <input type="checkbox" id="bot_auto_start_python">
              <span>Tự bật Radar Python khi máy chạy</span>
            </label>
            <div class="bot-helper-card">
              <div>
                <div class="bot-helper-title">Radar Python local</div>
                <div class="bot-helper-text" id="botHelperStatus">Đang kiểm tra...</div>
              </div>
              <button class="btn btn-primary bot-helper-btn" id="btnWakeRadarNow" onclick="wakeRadarFromSettings()">Đánh thức ngay</button>
            </div>
            <div class="bot-diagnostics" id="botSchedulerDiagnostics">
              <div class="bot-diag-title">Scheduler no-API</div>
              <div class="bot-diag-empty">Đang đọc last/next/result/error...</div>
            </div>
            <div class="bot-diagnostics" id="botApiDiagnostics">
              <div class="bot-diag-title">Shop API chạy nền</div>
              <div class="bot-diag-empty">Đang đọc cron/API diagnostic...</div>
            </div>
            <div class="bot-field-grid">
              <label>
                <span>Kéo đơn mới từ</span>
                <input type="number" min="1" max="240" id="bot_order_min">
              </label>
              <label>
                <span>Đến phút</span>
                <input type="number" min="1" max="240" id="bot_order_max">
              </label>
              <label>
                <span>Cập nhật trạng thái từ</span>
                <input type="number" min="1" max="240" id="bot_status_min">
              </label>
              <label>
                <span>Đến phút</span>
                <input type="number" min="1" max="240" id="bot_status_max">
              </label>
              <label>
                <span>Đồng bộ chi tiết từ</span>
                <input type="number" min="1" max="240" id="bot_detail_min">
              </label>
              <label>
                <span>Đến phút</span>
                <input type="number" min="1" max="240" id="bot_detail_max">
              </label>
              <label>
                <span>Cập nhật tài chính từ</span>
                <input type="number" min="1" max="240" id="bot_finance_min">
              </label>
              <label>
                <span>Đến phút</span>
                <input type="number" min="1" max="240" id="bot_finance_max">
              </label>
              <label>
                <span>Tải lại tem lỗi từ</span>
                <input type="number" min="1" max="240" id="bot_label_min">
              </label>
              <label>
                <span>Đến phút</span>
                <input type="number" min="1" max="240" id="bot_label_max">
              </label>
              <label>
                <span>Database khách từ</span>
                <input type="number" min="1" max="240" id="bot_customer_min">
              </label>
              <label>
                <span>Đến phút</span>
                <input type="number" min="1" max="240" id="bot_customer_max">
              </label>
              <label>
                <span>Bắt đầu lúc</span>
                <input type="text" inputmode="numeric" maxlength="5" placeholder="05:00" id="bot_run_start" oninput="formatBotTimeInput(this)" onblur="normalizeBotTimeInput(this, '05:00')">
              </label>
              <label>
                <span>Kết thúc lúc</span>
                <input type="text" inputmode="numeric" maxlength="5" placeholder="23:00" id="bot_run_end" oninput="formatBotTimeInput(this)" onblur="normalizeBotTimeInput(this, '23:00')">
              </label>
            </div>
          </section>
          <section class="bot-settings-panel" data-bot-settings-panel="manual">
          <div class="bot-diagnostics bot-manual-panel" id="botDateScanPanel">
            <div class="bot-diag-title">Chạy thủ công theo Core</div>
            <div class="bot-field-grid">
              <label>
                <span>Sàn</span>
                <select id="botDateScanPlatform" onchange="onBotDateScanPlatformChange()">
                  <option value="tiktok">TikTok</option>
                  <option value="shopee">Shopee</option>
                  <option value="lazada">Lazada</option>
                </select>
              </label>
              <label>
                <span>Shop</span>
                <select id="botDateScanShop">
                  <option value="">Đang đọc Shop Core...</option>
                </select>
              </label>
              <label>
                <span>Tác vụ</span>
                <select id="botDateScanAction">
                  ${DATE_SCAN_ACTIONS.map(action => `<option value="${escapeHtml(action.value)}">${escapeHtml(action.label)}</option>`).join('')}
                </select>
              </label>
              <label>
                <span>Trường ngày</span>
                <select id="botDateScanField">
                  ${DATE_SCAN_FIELDS.map(field => `<option value="${escapeHtml(field.value)}">${escapeHtml(field.label)}</option>`).join('')}
                </select>
              </label>
              <label>
                <span>Từ ngày</span>
                <input type="date" id="botDateScanFrom">
              </label>
              <label>
                <span>Đến ngày</span>
                <input type="date" id="botDateScanTo">
              </label>
              <label>
                <span>Giới hạn preview</span>
                <input type="number" min="1" max="200" id="botDateScanLimit" value="50">
              </label>
              <label class="bot-toggle">
                <input type="checkbox" id="botDateScanDryRun" checked>
                <span>Dry-run</span>
              </label>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px">
              <button class="btn btn-ghost" id="btnPreviewDateScan" onclick="previewDateRangeScan()">Xem trước danh sách</button>
              <button class="btn btn-primary" id="btnRunDateScan" onclick="runSelectedDateRangeScan()">Chạy các đơn đã chọn</button>
              <button class="btn btn-ghost" id="btnRefreshDateScanJob" onclick="refreshDateRangeJobStatus()">Làm mới trạng thái job</button>
              <button class="btn btn-ghost" id="btnCopyDateScanLog" onclick="copyDateRangeScanLog()">Copy log</button>
            </div>
            <div class="bot-diag-empty" id="botDateScanResult">Chưa có preview.</div>
          </div>
          </section>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
          <button class="btn btn-ghost" onclick="closeModal('botSettingsModal')">Đóng</button>
          <button class="btn btn-primary" id="btnSaveBotSettings" onclick="saveBotSettings()">Lưu cài đặt</button>
        </div>
      </div>
    </div>
  `);
}

export function switchBotSettingsTab(tab) {
  const next = tab === 'manual' ? 'manual' : 'auto';
  document.querySelectorAll('[data-bot-settings-tab]').forEach(button => {
    button.classList.toggle('active', button.getAttribute('data-bot-settings-tab') === next);
  });
  document.querySelectorAll('[data-bot-settings-panel]').forEach(panel => {
    panel.classList.toggle('active', panel.getAttribute('data-bot-settings-panel') === next);
  });
  const saveButton = document.getElementById('btnSaveBotSettings');
  if (saveButton) saveButton.hidden = next === 'manual';
}

function fillBotSettings(settings) {
  const data = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  document.getElementById('bot_enabled').checked = !!data.enabled;
  AUTO_ACTIONS.forEach(action => {
    const input = document.getElementById(`bot_${action.setting}`);
    if (input) input.checked = data[action.setting] !== false;
  });
  document.getElementById('bot_auto_start_python').checked = data.auto_start_python !== false;
  document.getElementById('bot_order_min').value = data.order_min_minutes;
  document.getElementById('bot_order_max').value = data.order_max_minutes;
  document.getElementById('bot_status_min').value = data.status_min_minutes;
  document.getElementById('bot_status_max').value = data.status_max_minutes;
  document.getElementById('bot_detail_min').value = data.detail_min_minutes;
  document.getElementById('bot_detail_max').value = data.detail_max_minutes;
  document.getElementById('bot_finance_min').value = data.finance_min_minutes;
  document.getElementById('bot_finance_max').value = data.finance_max_minutes;
  document.getElementById('bot_label_min').value = data.label_min_minutes;
  document.getElementById('bot_label_max').value = data.label_max_minutes;
  document.getElementById('bot_customer_min').value = data.customer_min_minutes;
  document.getElementById('bot_customer_max').value = data.customer_max_minutes;
  document.getElementById('bot_run_start').value = normalizeTime(data.run_start_time, data.run_start_hour, DEFAULT_SETTINGS.run_start_time);
  document.getElementById('bot_run_end').value = normalizeTime(data.run_end_time, data.run_end_hour, DEFAULT_SETTINGS.run_end_time);
  setDateScanDefaults();
  refreshManualCoreShops('0909128999').catch(() => null);
}

function setHelperStatus(text, ok = false) {
  const el = document.getElementById('botHelperStatus');
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? '#22c55e' : 'var(--muted)';
}

function diagItem(label, value) {
  return `
    <div class="bot-diag-item">
      <div class="bot-diag-label">${escapeHtml(label)}</div>
      <div class="bot-diag-value">${escapeHtml(value) || 'Chưa có'}</div>
    </div>
  `;
}

function renderSchedulerDiagnostics(status) {
  const el = document.getElementById('botSchedulerDiagnostics');
  if (!el) return;
  if (!status?.ok && !status?.scheduler) {
    el.innerHTML = `
      <div class="bot-diag-title">Scheduler no-API</div>
      <div class="bot-diag-empty">Không đọc được helper local. Scheduler chưa được chứng minh đang chạy.</div>
    `;
    return;
  }
  const scheduler = status.scheduler || status;
  const activeWindow = scheduler.active_window || {};
  const processText = status.radar_running
    ? `Đang chạy · PID ${status.radar_pid || '-'}`
    : 'Đã dừng';
  const schedulerText = scheduler.scheduler_running
    ? 'Scheduler đang chạy'
    : (status.radar_running ? 'Radar online nhưng scheduler chưa chạy' : 'Scheduler chưa chạy');
  const skipped = reasonText(scheduler.skipped_reason);
  const shops = Array.isArray(scheduler.shops_to_run) ? scheduler.shops_to_run : [];
  const actionDiagnostics = AUTO_ACTIONS.map(action => {
    const id = action.id;
    const enabled = scheduler[action.setting] !== false;
    return `
      ${diagItem(action.label, enabled ? 'ON' : 'OFF')}
      ${diagItem(`Lần chạy ${action.action_type}`, formatDateTime(scheduler[`last_${id}_run_at`]))}
      ${diagItem(`Lần kế tiếp ${action.action_type}`, formatDateTime(scheduler[`next_${id}_run_at`]))}
      ${diagItem(`Kết quả ${action.action_type}`, resultText(scheduler[`last_${id}_result`]))}
    `;
  }).join('');
  el.innerHTML = `
    <div class="bot-diag-title">Scheduler no-API</div>
    <div class="bot-diag-grid">
      ${diagItem('Radar process', processText)}
      ${diagItem('Heartbeat', formatDateTime(scheduler.heartbeat_at || status.heartbeat_at))}
      ${diagItem('Scheduler', schedulerText)}
      ${diagItem('Giờ hiện tại', scheduler.current_time || '-')}
      ${diagItem('Khung giờ', `${activeWindow.start || '-'}-${activeWindow.end || '-'} · ${activeWindow.in_window ? 'Đang trong giờ' : 'Ngoài khung giờ chạy'}`)}
      ${diagItem('Lý do bỏ qua (skipped_reason)', skipped || (scheduler.enabled === false ? 'Auto đang tắt' : '-'))}
      ${actionDiagnostics}
      ${diagItem('Lỗi gần nhất (last_error)', scheduler.last_error || '-')}
      ${diagItem('Kết quả đánh thức (immediate_check_result)', scheduler.last_wake_result || status.immediate_check_result || '-')}
    </div>
    <div class="bot-shop-list">
      ${shops.length ? shops.map(shop => `
        <div class="bot-shop-row">
          <div class="bot-shop-name">${escapeHtml(shop.shop || shop.name || 'Shop no-API')}</div>
          <div class="bot-shop-meta">${escapeHtml(shop.platform || '') || 'no-api/local'} · sẽ chạy bằng Radar/local helper nếu tới lịch và an toàn</div>
        </div>
      `).join('') : '<div class="bot-diag-empty">Chưa có danh sách shop sẽ chạy.</div>'}
    </div>
  `;
}

const API_SHOP_RULES = [
  { platform: 'shopee', key: 'chihuy1984', label: 'Shopee chihuy1984' },
  { platform: 'shopee', key: 'chihuy2309', label: 'Shopee chihuy2309' },
  { platform: 'shopee', key: 'phambich2312', label: 'Shopee phambich2312' },
  { platform: 'lazada', key: 'kinhdoanhonlinegiasoc@gmail.com', label: 'Lazada kinhdoanhonlinegiasoc@gmail.com' }
];

function findApiShop(rows, rule) {
  return rows.find(row => {
    if (cleanText(row.platform).toLowerCase() !== rule.platform) return false;
    const keys = [row.shop_name, row.user_name, row.api_shop_id]
      .map(value => cleanText(value).toLowerCase())
      .filter(Boolean);
    return keys.includes(rule.key);
  });
}

function renderApiDiagnostics(rows) {
  const el = document.getElementById('botApiDiagnostics');
  if (!el) return;
  const list = Array.isArray(rows) ? rows : [];
  const nextFallback = nextWorkerCronAt();
  el.innerHTML = `
    <div class="bot-diag-title">Shop API chạy nền</div>
    <div class="bot-shop-list">
      ${API_SHOP_RULES.map(rule => {
        const row = findApiShop(list, rule);
        if (!row) {
          return `
            <div class="bot-shop-row">
              <div class="bot-shop-name">${escapeHtml(rule.label)}</div>
              <div class="bot-shop-meta">API cron chưa có diagnostic shop. Cần kiểm `/api/shops/api-configs`.</div>
            </div>
          `;
        }
        const enabled = row.capability_mode === 'api_active' || Number(row.order_api_available || 0) === 1;
        const orderStatus = row.last_order_sync_status || (row.last_order_sync_at ? 'ok' : 'API cron chưa chạy');
        const statusStatus = row.last_order_status_sync_status || (row.last_order_status_sync_at ? 'ok' : 'API cron chưa chạy');
        const error = row.last_order_sync_error || row.last_order_status_sync_error || '';
        return `
          <div class="bot-shop-row">
            <div class="bot-shop-name">${escapeHtml(rule.label)}</div>
            <div class="bot-shop-meta">
              API realtime: ${enabled ? 'enabled' : 'chưa sẵn sàng'} · cron source: ${escapeHtml(row.cron_source || row.order_runner_running_source || 'scheduled handler')}<br>
              last_order_sync_at: ${escapeHtml(formatDateTime(row.last_order_sync_at))} · result: ${escapeHtml(orderStatus)}<br>
              last_status_sync_at: ${escapeHtml(formatDateTime(row.last_order_status_sync_at))} · result: ${escapeHtml(statusStatus)}<br>
              last_tracking_sync_at: ${escapeHtml(formatDateTime(row.status_runner_last_run_at || row.last_order_status_sync_at))}<br>
              last_api_sync_result: ${escapeHtml(`${orderStatus}/${statusStatus}`)}<br>
              next_sync_at: ${escapeHtml(formatDateTime(row.next_sync_at || nextFallback))}${error ? `<br>error: ${escapeHtml(error)}` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function setDateScanDefaults() {
  const value = todayYmd();
  const from = document.getElementById('botDateScanFrom');
  const to = document.getElementById('botDateScanTo');
  if (from && !from.value) from.value = value;
  if (to && !to.value) to.value = value;
}

export async function onBotDateScanPlatformChange() {
  const platform = cleanText(document.getElementById('botDateScanPlatform')?.value).toLowerCase();
  if (!coreShopOptions.length) {
    await refreshManualCoreShops();
    return;
  }
  renderCoreShopSelect(platform);
}

function dateRangeScanPayload(dryRun) {
  return {
    platform: cleanText(document.getElementById('botDateScanPlatform')?.value).toLowerCase(),
    shop: cleanText(document.getElementById('botDateScanShop')?.value),
    action_type: cleanText(document.getElementById('botDateScanAction')?.value),
    from_date: cleanText(document.getElementById('botDateScanFrom')?.value),
    to_date: cleanText(document.getElementById('botDateScanTo')?.value),
    date_field: cleanText(document.getElementById('botDateScanField')?.value),
    limit: Number.parseInt(document.getElementById('botDateScanLimit')?.value, 10) || 10,
    dry_run: dryRun
  };
}

function selectedDateScanOrderIds() {
  return Array.from(document.querySelectorAll('.bot-date-scan-check:checked'))
    .map(input => cleanText(input.value))
    .filter(Boolean);
}

function renderDateRangeScanResult(result, liveResult = null) {
  const el = document.getElementById('botDateScanResult');
  if (!el) return;
  const rows = Array.isArray(result?.per_order) ? result.per_order : [];
  const liveRows = new Map((Array.isArray(liveResult?.per_order) ? liveResult.per_order : []).map(row => [cleanText(row.order_id), row]));
  const selectedIds = new Set(Array.isArray(liveResult?.selected_eligible_order_ids) ? liveResult.selected_eligible_order_ids.map(cleanText) : []);
  const summary = `
    <div class="bot-diag-grid">
      ${diagItem('Tổng đơn trong khoảng ngày', String(result?.total_orders_in_date_range ?? 0))}
      ${diagItem('Đủ điều kiện chạy', String(result?.eligible_count ?? 0))}
      ${diagItem('Bỏ qua', String(result?.skipped_count ?? 0))}
      ${diagItem('Trạng thái chạy', liveResult?.result_status || liveResult?.status || (result?.dry_run ? 'dry_run' : 'queued'))}
      ${diagItem('Runner local', liveResult?.runner?.started || liveResult?.runner?.report_worker_running ? `Đã gọi /report-run · PID ${liveResult.runner.report_worker_pid || '-'}` : (liveResult?.runner?.blocked ? 'Browser chặn loopback' : liveResult?.runner?.error || 'Chưa chạy'))}
    </div>
  `;
  const body = rows.length ? rows.slice(0, 50).map(row => {
    const orderId = cleanText(row.order_id);
    const liveRow = liveRows.get(orderId) || {};
    const checkedText = selectedIds.has(orderId) ? 'Đã gửi job' : (liveRow.result_status || '');
    return `
      <div class="bot-shop-row">
        <label class="bot-toggle" style="align-items:flex-start">
          <input class="bot-date-scan-check" type="checkbox" value="${escapeHtml(orderId)}" ${row.eligible ? '' : 'disabled'}>
          <span>
            <b>${escapeHtml(orderId || 'Không có mã đơn')}</b>
            <small>${escapeHtml(row.current_status || 'Chưa có trạng thái')} · ${escapeHtml(row.action || '')}</small>
            <em>${escapeHtml(row.eligible ? (row.runner_api_path || row.action_path || '') : (row.skip_reason || 'Bỏ qua'))}${checkedText ? ` · ${escapeHtml(checkedText)}` : ''}</em>
          </span>
        </label>
      </div>
    `;
  }).join('') : '<div class="bot-diag-empty">Không có đơn trong khoảng ngày đã chọn.</div>';
  const jobRows = Array.isArray(liveResult?.jobs) ? liveResult.jobs : [];
  el.innerHTML = `${summary}<div class="bot-shop-list">${body}</div><div class="bot-shop-list">${renderJobRows(jobRows)}</div>`;
}

function apiCacheBustPath(path) {
  const sep = String(path || '').includes('?') ? '&' : '?';
  return `${path}${sep}_cb=${Date.now()}`;
}

async function postDateRangeScan(payload) {
  const response = await fetch(API + apiCacheBustPath('/api/orders/manual-sync/backfill'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status === 'error') {
    throw new Error(data.message || data.error || 'Không gửi được job quét lại theo ngày');
  }
  return data;
}

async function postJson(path, payload) {
  const response = await fetch(API + apiCacheBustPath(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.status === 'error' || data.error) {
    throw new Error(data.message || data.error || `HTTP ${response.status}`);
  }
  return data;
}

function localPullJobs(result) {
  return (Array.isArray(result?.jobs) ? result.jobs : [])
    .map(job => cleanText(job.id))
    .filter(Boolean);
}

function extractJobIds(value) {
  const ids = [];
  if (Array.isArray(value?.jobs)) {
    ids.push(...value.jobs.map(job => cleanText(job.id || job.job_id)).filter(Boolean));
  }
  if (Array.isArray(value?.local_job_ids)) ids.push(...value.local_job_ids.map(cleanText).filter(Boolean));
  return [...new Set(ids)];
}

function compactJobLog(row = {}) {
  const text = cleanText(row.log_text || row.message || row.error);
  if (!text) return '';
  try {
    const parsed = JSON.parse(text);
    const business = parsed.business_summary || {};
    if (Object.keys(business).length) {
      const orders = Array.isArray(parsed.per_order) ? parsed.per_order : [];
      const headline = [
        business.action_label || business.action_type || parsed.final_status || parsed.result_status,
        `quét ${business.scanned_count ?? 0}`,
        `tạo ${business.created_count ?? 0}`,
        `cập nhật ${business.updated_count ?? 0}`,
        `không đổi ${business.unchanged_count ?? 0}`,
        `lỗi ${business.failed_count ?? 0}`,
        `Core ${business.core_readback_ok ? 'OK' : 'chưa OK'}`
      ].filter(Boolean).join(' · ');
      const orderLines = orders.slice(0, 4).map(item => {
        const changed = Array.isArray(item.changed_fields) && item.changed_fields.length
          ? ` (${item.changed_fields.join(', ')})`
          : '';
        const error = item.error_code ? ` · lỗi: ${item.error_code}` : '';
        const skip = item.skip_reason ? ` · bỏ qua: ${item.skip_reason}` : '';
        return `${item.order_id}: ${item.result}${changed}${error}${skip}`;
      });
      return [headline, ...orderLines].join('\n');
    }
    const finalStatus = cleanText(parsed.final_status || parsed.result_status || parsed.event);
    const readback = parsed.core_readback || {};
    const parts = [
      finalStatus,
      `quét ${readback.orders_scanned ?? parsed.orders_scanned ?? '-'}`,
      `tạo ${readback.orders_created ?? parsed.orders_created ?? '-'}`,
      `cập nhật ${readback.orders_updated ?? parsed.orders_updated ?? parsed.updated ?? '-'}`,
      `lỗi ${parsed.error_count ?? 0}`
    ];
    const orderIds = Array.isArray(parsed.order_ids) ? parsed.order_ids.slice(0, 5).join(', ') : '';
    return `${parts.filter(Boolean).join(' · ')}${orderIds ? ` · đơn ${orderIds}` : ''}`;
  } catch {
    return text.length > 260 ? `${text.slice(0, 260)}...` : text;
  }
}

function renderJobBusinessTable(row = {}) {
  const text = cleanText(row.log_text || row.message || row.error);
  if (!text) return '';
  try {
    const parsed = JSON.parse(text);
    const business = parsed.business_summary || {};
    const orders = Array.isArray(parsed.per_order) ? parsed.per_order : [];
    if (!Object.keys(business).length && !orders.length) return '';
    return `
      <div class="bot-job-business">
        <div class="bot-job-business-head">
          <span>Đã quét: <b>${escapeHtml(business.scanned_count ?? 0)}</b></span>
          <span>Cập nhật: <b>${escapeHtml(business.updated_count ?? 0)}</b></span>
          <span>Không đổi: <b>${escapeHtml(business.unchanged_count ?? 0)}</b></span>
          <span>Lỗi: <b>${escapeHtml(business.failed_count ?? 0)}</b></span>
          <span>Core: <b>${business.core_readback_ok ? 'OK' : 'Chưa OK'}</b></span>
        </div>
        ${orders.length ? `
          <div class="bot-job-order-table">
            ${orders.slice(0, 8).map(item => `
              <div class="bot-job-order-row">
                <span>${escapeHtml(item.order_id || '-')}</span>
                <b>${escapeHtml(item.result || '-')}</b>
                <small>${escapeHtml((item.changed_fields || []).join(', ') || item.error_code || item.skip_reason || 'dữ liệu đã mới nhất')}</small>
              </div>
            `).join('')}
          </div>
        ` : '<div class="bot-diag-empty">Runner chưa trả per-order result.</div>'}
      </div>
    `;
  } catch {
    return '';
  }
}

async function fetchJobRows(jobIds = []) {
  const wanted = (jobIds || []).map(cleanText).filter(Boolean);
  if (!wanted.length) return [];
  const rows = await fetch(`${API}/api/jobs?ids=${encodeURIComponent(wanted.join(','))}`, { cache: 'no-store' }).then(r => r.json()).catch(() => []);
  const wantedSet = new Set(wanted);
  return (Array.isArray(rows) ? rows : []).filter(row => wantedSet.has(String(row.id)));
}

function isTerminalJobStatus(status) {
  return ['completed', 'completed_no_change', 'failed', 'runner_timeout', 'runner_requires_login']
    .includes(cleanText(status).toLowerCase());
}

async function waitForJobRows(jobIds = [], onRows, timeoutMs = 900000) {
  const wanted = (jobIds || []).map(cleanText).filter(Boolean);
  if (!wanted.length) return [];
  const deadline = Date.now() + timeoutMs;
  let latest = await fetchJobRows(wanted);
  if (typeof onRows === 'function') onRows(latest);
  while (Date.now() < deadline) {
    if (latest.length >= wanted.length && latest.every(row => isTerminalJobStatus(row.status))) return latest;
    await new Promise(resolve => setTimeout(resolve, 5000));
    latest = await fetchJobRows(wanted);
    if (typeof onRows === 'function') onRows(latest);
  }
  return latest;
}

function renderJobRows(rows = []) {
  if (!rows.length) return '<div class="bot-diag-empty">Chưa có job local cần theo dõi.</div>';
  return rows.map(row => `
    <div class="bot-shop-row">
      <div class="bot-shop-name">Job ${escapeHtml(row.id)} · ${escapeHtml(row.platform || '')}:${escapeHtml(row.shop_name || row.shop || '')}</div>
      <div class="bot-shop-meta">
        ${escapeHtml(row.task_type || row.action_type || '')} · trạng thái: ${escapeHtml(row.status || 'queued')}<br>
        ${escapeHtml(compactJobLog(row) || 'Chưa có log chi tiết từ runner.').replace(/\n/g, '<br>')}
      </div>
      ${renderJobBusinessTable(row)}
    </div>
  `).join('');
}

function renderPullAllResult(result) {
  const el = document.getElementById('botDateScanResult');
  if (!el || !result) return;
  const apiFetched = (result.api || []).reduce((sum, row) => sum + (Number(row.result?.fetched || 0) || 0), 0);
  const apiImported = (result.api || []).reduce((sum, row) => sum + (Number(row.result?.imported_orders || 0) || 0), 0);
  const apiUpdated = (result.api || []).reduce((sum, row) => sum + (Number(row.result?.updated || 0) || 0), 0);
  const jobRows = Array.isArray(result.job_rows) ? result.job_rows : [];
  el.innerHTML = `
    <div class="bot-diag-grid">
      ${diagItem('Tác vụ ngoài panel', 'Kéo đơn toàn bộ shop')}
      ${diagItem('API fetched/imported/updated', `${apiFetched}/${apiImported}/${apiUpdated}`)}
      ${diagItem('Job local đã queue', String(result.local_job_ids?.length || 0))}
      ${diagItem('Runner local', result.runner?.started || result.runner?.report_worker_running ? `Đã gọi /report-run · PID ${result.runner.report_worker_pid || '-'}` : (result.runner?.blocked ? 'Browser chặn loopback' : result.runner?.error || 'Chưa cần runner'))}
    </div>
    <div class="bot-shop-list">${renderJobRows(jobRows)}</div>
    <pre class="bot-copy-log">${escapeHtml(JSON.stringify(result, null, 2))}</pre>
  `;
}

function openManualRunLogPanel() {
  ensureBotSettingsModal();
  document.getElementById('botSettingsModal')?.classList.add('open');
  switchBotSettingsTab('manual');
}

export async function pullAllCoreShopsNow() {
  openManualRunLogPanel();
  const button = document.getElementById('btnPullAllCoreShops');
  if (button) button.disabled = true;
  const today = todayYmd();
  const scope = AUTO_ACTIONS.find(action => action.action_type === 'pull_orders')?.scope || ['order_list', 'basic_order', 'status', 'tracking', 'items'];
  const result = {
    started_at: new Date().toISOString(),
    action_type: 'pull_orders',
    api: [],
    local: [],
    local_job_ids: [],
    runner: null
  };
  renderPullAllResult({
    ...result,
    job_rows: [],
    runner: { started: false, error: 'Đang gọi API/Core và chuẩn bị queue job local...' }
  });
  try {
    for (const platform of ['shopee', 'lazada']) {
      const apiResult = await postJson('/api/orders/sync-api-orders', {
        platform,
        days: 3,
        limit: platform === 'lazada' ? 40 : 80,
        fetch_fees: false,
        fetch_tracking: platform === 'shopee' ? false : true,
        suppress_push: true
      });
      result.api.push({ platform, path: '/api/orders/sync-api-orders', result: apiResult });
    }
    for (const target of LOCAL_ACTION_SHOPS) {
      const localResult = await postDateRangeScan({
        action_type: 'pull_orders',
        platform: target.platform,
        shop: target.shop,
        from: today,
        to: today,
        limit: Math.max(1, Number(target.limit || 1) || 1),
        dry_run: false,
        sync_scope: scope
      });
      result.local.push({ ...target, path: '/api/orders/manual-sync/backfill', result: localResult });
      result.local_job_ids.push(...localPullJobs(localResult));
    }
    if (result.local_job_ids.length) {
      result.job_rows = await fetchJobRows(result.local_job_ids);
      renderPullAllResult(result);
      result.runner = await runRadarJobsLocal({
        job_ids: result.local_job_ids,
        action_type: 'pull_orders',
        scope,
        watch: false,
        max_jobs: Math.min(result.local_job_ids.length, 10),
        job_timeout: 1200,
        allow_run: true,
        reason: 'oms_pull_all_core_shops'
      });
      result.job_rows = await waitForJobRows(result.local_job_ids, rows => {
        result.job_rows = rows;
        renderPullAllResult(result);
      });
    }
    result.finished_at = new Date().toISOString();
    pullAllLastResult = result;
    renderPullAllResult(result);
    showToast(`Đã kéo đơn API và queue ${result.local_job_ids.length} job local.`);
  } catch (error) {
    result.finished_at = new Date().toISOString();
    result.error = error.message;
    pullAllLastResult = result;
    renderPullAllResult(result);
    showToast('Lỗi kéo đơn toàn bộ shop: ' + error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

export async function previewDateRangeScan() {
  const btn = document.getElementById('btnPreviewDateScan');
  if (btn) btn.disabled = true;
  try {
    const payload = dateRangeScanPayload(true);
    document.getElementById('botDateScanDryRun').checked = true;
    dateScanPreviewResult = await postDateRangeScan(payload);
    renderDateRangeScanResult(dateScanPreviewResult);
    showToast('Đã có danh sách preview.');
  } catch (e) {
    showToast('Lỗi preview: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

export async function runSelectedDateRangeScan() {
  const ids = selectedDateScanOrderIds();
  if (!ids.length) {
    showToast('Chọn ít nhất một đơn đủ điều kiện từ preview.');
    return;
  }
  const btn = document.getElementById('btnRunDateScan');
  if (btn) btn.disabled = true;
  try {
    const payload = {
      ...dateRangeScanPayload(false),
      selected_order_ids: ids
    };
    document.getElementById('botDateScanDryRun').checked = false;
    const result = await postDateRangeScan(payload);
    dateScanLastLiveResult = result;
    renderDateRangeScanResult(dateScanPreviewResult || result, result);
    const jobIds = extractJobIds(result);
    if (jobIds.length) {
      dateScanLastLiveResult.jobs = await fetchJobRows(jobIds);
      renderDateRangeScanResult(dateScanPreviewResult || result, dateScanLastLiveResult);
      dateScanLastLiveResult.runner = await runRadarJobsLocal({
        job_ids: jobIds,
        action_type: payload.action_type,
        scope: payload.sync_scope || [],
        watch: false,
        max_jobs: Math.min(jobIds.length, 10),
        job_timeout: 1200,
        allow_run: true,
        reason: 'oms_manual_date_scan'
      });
      renderDateRangeScanResult(dateScanPreviewResult || result, dateScanLastLiveResult);
      dateScanLastLiveResult.jobs = await waitForJobRows(jobIds, rows => {
        dateScanLastLiveResult.jobs = rows;
        dateScanLastLiveResult.result_status = rows.map(row => `${row.id}:${row.status}`).join(', ') || result.result_status;
        renderDateRangeScanResult(dateScanPreviewResult || result, dateScanLastLiveResult);
      });
      dateScanLastLiveResult.result_status = dateScanLastLiveResult.jobs.map(row => `${row.id}:${row.status}`).join(', ') || result.result_status;
      renderDateRangeScanResult(dateScanPreviewResult || result, dateScanLastLiveResult);
    }
    showToast(jobIds.length ? 'Đã chạy runner local và cập nhật log job.' : 'Đã xử lý tác vụ theo Core.');
  } catch (e) {
    showToast('Lỗi chạy job: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

export async function refreshDateRangeJobStatus() {
  const jobs = Array.isArray(dateScanLastLiveResult?.jobs) ? dateScanLastLiveResult.jobs : [];
  if (!jobs.length) {
    showToast('Chưa có job live để làm mới.');
    return;
  }
  try {
    const rows = await fetch(`${API}/api/jobs?mode=monitor`, { cache: 'no-store' }).then(r => r.json());
    const wanted = new Set(jobs.map(job => String(job.id)));
    const matched = (Array.isArray(rows) ? rows : []).filter(row => wanted.has(String(row.id)));
    dateScanLastLiveResult = {
      ...dateScanLastLiveResult,
      jobs: matched.length ? matched : jobs,
      result_status: matched.map(row => `${row.id}:${row.status}`).join(', ') || dateScanLastLiveResult.result_status
    };
    renderDateRangeScanResult(dateScanPreviewResult || dateScanLastLiveResult, dateScanLastLiveResult);
    showToast('Đã làm mới trạng thái job.');
  } catch (error) {
    showToast('Không làm mới được job: ' + error.message);
  }
}

export async function copyDateRangeScanLog() {
  const text = JSON.stringify({
    preview: dateScanPreviewResult,
    live: dateScanLastLiveResult,
    pull_all: pullAllLastResult
  }, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    showToast('Đã copy log.');
  } catch {
    const box = document.getElementById('botDateScanResult');
    if (box) box.insertAdjacentHTML('afterbegin', `<pre class="bot-copy-log">${escapeHtml(text)}</pre>`);
    showToast('Không truy cập clipboard, đã hiện log trong panel.');
  }
}

async function refreshHelperStatus() {
  setHelperStatus('Đang kiểm tra helper local...');
  const [status, apiRows] = await Promise.all([
    checkRadarLocal(),
    fetch(API + '/api/shops/api-configs', { cache: 'no-store' }).then(r => r.json()).catch(() => [])
  ]);
  renderSchedulerDiagnostics(status);
  renderApiDiagnostics(apiRows);
  if (status?.ok) {
    const radarText = status.radar_running ? 'Radar process đang chạy' : 'Helper đang chạy, Radar đã dừng';
    const schedulerText = status.scheduler_running ? 'scheduler đang chạy' : (status.radar_running ? 'scheduler chưa chạy' : 'chưa có scheduler');
    setHelperStatus(`${radarText}; ${schedulerText}.`, Boolean(status.scheduler_running));
  } else if (status?.blocked) {
    setHelperStatus('Chrome chặn web public gọi trực tiếp vào máy. Watchdog Windows đang bật mỗi 1 phút để tự mở Radar khi có job.');
  } else {
    setHelperStatus('Chưa thấy helper local. Nếu vừa mở máy, Watchdog Windows sẽ bật lại trong tối đa 1 phút.');
  }
}

export function initBotSettings() {
  ensureBotSettingsModal();
}

export async function openBotSettingsModal() {
  ensureBotSettingsModal();
  fillBotSettings(DEFAULT_SETTINGS);
  document.getElementById('botSettingsModal').classList.add('open');
  switchBotSettingsTab('auto');
  refreshHelperStatus();
  try {
    const settings = await fetch(API + '/api/bot/settings').then(r => r.json());
    fillBotSettings(settings);
  } catch {
    showToast('Không đọc được cấu hình auto, đang dùng mặc định.');
  }
}

export async function openManualBotRunModal() {
  ensureBotSettingsModal();
  fillBotSettings(DEFAULT_SETTINGS);
  document.getElementById('botSettingsModal').classList.add('open');
  switchBotSettingsTab('manual');
  await refreshManualCoreShops(document.getElementById('botDateScanShop')?.value || '0909128999').catch(() => null);
  refreshHelperStatus();
}

export async function wakeRadarFromSettings() {
  const btn = document.getElementById('btnWakeRadarNow');
  if (btn) btn.disabled = true;
  setHelperStatus('Đang gửi lệnh đánh thức Radar...');
  const wake = await wakeRadarLocal('settings');
  if (wake?.ok) {
    renderSchedulerDiagnostics(wake);
    setHelperStatus(`Đã đánh thức Radar Python: ${wake.immediate_check_result || 'scheduler check đã gửi'}.`, true);
    showToast('Đã đánh thức Radar Python.');
  } else if (wake?.blocked) {
    setHelperStatus('Chrome chặn gọi trực tiếp vào máy trên web public. Watchdog Windows sẽ tự mở Radar trong tối đa 1 phút.');
    showToast('Watchdog Windows sẽ tự mở Radar trong tối đa 1 phút.');
  } else {
    setHelperStatus('Chưa gọi được helper local. Watchdog Windows sẽ tự mở lại trong tối đa 1 phút.');
    showToast('Chưa gọi được helper local, Watchdog sẽ tự mở lại trong tối đa 1 phút.');
  }
  await refreshHelperStatus();
  if (btn) btn.disabled = false;
}

export async function saveBotSettings() {
  const payload = {
    enabled: checkedValue('bot_enabled'),
    auto_start_python: checkedValue('bot_auto_start_python'),
    order_min_minutes: numberValue('bot_order_min', DEFAULT_SETTINGS.order_min_minutes),
    order_max_minutes: numberValue('bot_order_max', DEFAULT_SETTINGS.order_max_minutes),
    status_min_minutes: numberValue('bot_status_min', DEFAULT_SETTINGS.status_min_minutes),
    status_max_minutes: numberValue('bot_status_max', DEFAULT_SETTINGS.status_max_minutes),
    detail_min_minutes: numberValue('bot_detail_min', DEFAULT_SETTINGS.detail_min_minutes),
    detail_max_minutes: numberValue('bot_detail_max', DEFAULT_SETTINGS.detail_max_minutes),
    finance_min_minutes: numberValue('bot_finance_min', DEFAULT_SETTINGS.finance_min_minutes),
    finance_max_minutes: numberValue('bot_finance_max', DEFAULT_SETTINGS.finance_max_minutes),
    label_min_minutes: numberValue('bot_label_min', DEFAULT_SETTINGS.label_min_minutes),
    label_max_minutes: numberValue('bot_label_max', DEFAULT_SETTINGS.label_max_minutes),
    customer_min_minutes: numberValue('bot_customer_min', DEFAULT_SETTINGS.customer_min_minutes),
    customer_max_minutes: numberValue('bot_customer_max', DEFAULT_SETTINGS.customer_max_minutes),
    run_start_time: timeValue('bot_run_start', DEFAULT_SETTINGS.run_start_time),
    run_end_time: timeValue('bot_run_end', DEFAULT_SETTINGS.run_end_time),
    run_start_hour: 0,
    run_end_hour: 0
  };
  AUTO_ACTIONS.forEach(action => {
    payload[action.setting] = checkedValue(`bot_${action.setting}`);
  });
  payload.run_start_hour = hourFromTime(payload.run_start_time, DEFAULT_SETTINGS.run_start_hour);
  payload.run_end_hour = hourFromTime(payload.run_end_time, DEFAULT_SETTINGS.run_end_hour);
  if (payload.order_max_minutes < payload.order_min_minutes) payload.order_max_minutes = payload.order_min_minutes;
  if (payload.status_max_minutes < payload.status_min_minutes) payload.status_max_minutes = payload.status_min_minutes;
  if (payload.detail_max_minutes < payload.detail_min_minutes) payload.detail_max_minutes = payload.detail_min_minutes;
  if (payload.finance_max_minutes < payload.finance_min_minutes) payload.finance_max_minutes = payload.finance_min_minutes;
  if (payload.label_max_minutes < payload.label_min_minutes) payload.label_max_minutes = payload.label_min_minutes;
  if (payload.customer_max_minutes < payload.customer_min_minutes) payload.customer_max_minutes = payload.customer_min_minutes;

  const btn = document.getElementById('btnSaveBotSettings');
  if (btn) btn.disabled = true;
  try {
    const saved = await fetch(API + '/api/bot/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(async r => {
      if (!r.ok) throw new Error(await r.text().catch(() => 'Không lưu được cấu hình'));
      return r.json();
    });
    await saveRadarSchedulerConfig(saved).catch(() => null);
    showToast('Đã lưu cấu hình tự động vận hành.');
    fillBotSettings(saved);
    await refreshHelperStatus();
  } catch (e) {
    showToast('Lỗi lưu cấu hình auto: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

Object.assign(window, {
  saveBotSettings,
  wakeRadarFromSettings,
  formatBotTimeInput,
  normalizeBotTimeInput,
  switchBotSettingsTab,
  openBotSettingsModal,
  openManualBotRunModal,
  onBotDateScanPlatformChange,
  pullAllCoreShopsNow,
  previewDateRangeScan,
  runSelectedDateRangeScan,
  refreshDateRangeJobStatus,
  copyDateRangeScanLog
});
