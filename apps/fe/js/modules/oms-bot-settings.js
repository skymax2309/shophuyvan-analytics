import { API } from '../oms-dashboard/oms-api.js';
import { showToast, closeModal } from '../utils/helpers.js';
import { checkRadarLocal, wakeRadarLocal } from './oms-radar-helper.js';

const DEFAULT_SETTINGS = {
  enabled: false,
  auto_start_python: true,
  order_min_minutes: 10,
  order_max_minutes: 20,
  status_min_minutes: 10,
  status_max_minutes: 20,
  run_start_time: '05:00',
  run_end_time: '23:00',
  run_start_hour: 5,
  run_end_hour: 23
};

function numberValue(id, fallback) {
  const value = Number.parseInt(document.getElementById(id)?.value, 10);
  return Number.isFinite(value) ? value : fallback;
}

function checkedValue(id) {
  return !!document.getElementById(id)?.checked;
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
          <div class="modal-title">Tự động kéo đơn</div>
          <button class="modal-close" onclick="closeModal('botSettingsModal')">x</button>
        </div>
        <div class="bot-settings-body">
          <label class="bot-toggle">
            <input type="checkbox" id="bot_enabled">
            <span>Bật auto cho shop không API</span>
          </label>
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
              <span>Bắt đầu lúc</span>
              <input type="text" inputmode="numeric" maxlength="5" placeholder="05:00" id="bot_run_start" oninput="formatBotTimeInput(this)" onblur="normalizeBotTimeInput(this, '05:00')">
            </label>
            <label>
              <span>Kết thúc lúc</span>
              <input type="text" inputmode="numeric" maxlength="5" placeholder="23:00" id="bot_run_end" oninput="formatBotTimeInput(this)" onblur="normalizeBotTimeInput(this, '23:00')">
            </label>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
          <button class="btn btn-ghost" onclick="closeModal('botSettingsModal')">Đóng</button>
          <button class="btn btn-primary" id="btnSaveBotSettings" onclick="saveBotSettings()">Lưu cài đặt</button>
        </div>
      </div>
    </div>
  `);

  if (!document.getElementById('botSettingsStyle')) {
    document.head.insertAdjacentHTML('beforeend', `
      <style id="botSettingsStyle">
        .bot-settings-modal { max-width: 520px; }
        .bot-settings-body { display: flex; flex-direction: column; gap: 12px; }
        .bot-toggle { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface2); font-size: 13px; font-weight: 700; }
        .bot-toggle input { width: 18px; height: 18px; accent-color: var(--blue); }
        .bot-helper-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid rgba(59,130,246,.45); background: rgba(37,99,235,.12); border-radius: 8px; padding: 12px; }
        .bot-helper-title { font-size: 13px; font-weight: 800; color: var(--text); }
        .bot-helper-text { margin-top: 3px; color: var(--muted); font-size: 12px; line-height: 1.4; }
        .bot-helper-btn { flex: 0 0 auto; white-space: nowrap; }
        .bot-field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .bot-field-grid label { display: flex; flex-direction: column; gap: 5px; min-width: 0; color: var(--muted); font-size: 11px; font-weight: 700; text-transform: uppercase; }
        .bot-field-grid input { width: 100%; box-sizing: border-box; background: var(--surface2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; font-size: 15px; font-weight: 800; }
        @media (max-width: 640px) {
          .bot-settings-modal { width: calc(100vw - 24px); max-width: none; }
          .bot-helper-card { align-items: stretch; flex-direction: column; }
          .bot-helper-btn { width: 100%; }
          .bot-field-grid { grid-template-columns: 1fr; }
        }
      </style>
    `);
  }
}

function fillBotSettings(settings) {
  const data = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  document.getElementById('bot_enabled').checked = !!data.enabled;
  document.getElementById('bot_auto_start_python').checked = data.auto_start_python !== false;
  document.getElementById('bot_order_min').value = data.order_min_minutes;
  document.getElementById('bot_order_max').value = data.order_max_minutes;
  document.getElementById('bot_status_min').value = data.status_min_minutes;
  document.getElementById('bot_status_max').value = data.status_max_minutes;
  document.getElementById('bot_run_start').value = normalizeTime(data.run_start_time, data.run_start_hour, DEFAULT_SETTINGS.run_start_time);
  document.getElementById('bot_run_end').value = normalizeTime(data.run_end_time, data.run_end_hour, DEFAULT_SETTINGS.run_end_time);
}

function setHelperStatus(text, ok = false) {
  const el = document.getElementById('botHelperStatus');
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? '#22c55e' : 'var(--muted)';
}

async function refreshHelperStatus() {
  setHelperStatus('Đang kiểm tra helper local...');
  const status = await checkRadarLocal();
  if (status?.ok) {
    const radarText = status.radar_running ? 'Radar đang chạy' : 'Helper đang chạy, Radar chưa mở';
    setHelperStatus(`${radarText}. Bấm kéo đơn/cập nhật sẽ đánh thức Python ngay.`, true);
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
  refreshHelperStatus();
  try {
    const settings = await fetch(API + '/api/bot/settings').then(r => r.json());
    fillBotSettings(settings);
  } catch {
    showToast('Không đọc được cấu hình auto, đang dùng mặc định.');
  }
}

export async function wakeRadarFromSettings() {
  const btn = document.getElementById('btnWakeRadarNow');
  if (btn) btn.disabled = true;
  setHelperStatus('Đang gửi lệnh đánh thức Radar...');
  const wake = await wakeRadarLocal('settings');
  if (wake?.ok) {
    setHelperStatus('Đã đánh thức Radar Python. Có thể bấm kéo đơn/cập nhật ngay.', true);
    showToast('Đã đánh thức Radar Python.');
  } else if (wake?.blocked) {
    setHelperStatus('Chrome chặn gọi trực tiếp vào máy trên web public. Watchdog Windows sẽ tự mở Radar trong tối đa 1 phút.');
    showToast('Watchdog Windows sẽ tự mở Radar trong tối đa 1 phút.');
  } else {
    setHelperStatus('Chưa gọi được helper local. Watchdog Windows sẽ tự mở lại trong tối đa 1 phút.');
    showToast('Chưa gọi được helper local, Watchdog sẽ tự mở lại trong tối đa 1 phút.');
  }
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
    run_start_time: timeValue('bot_run_start', DEFAULT_SETTINGS.run_start_time),
    run_end_time: timeValue('bot_run_end', DEFAULT_SETTINGS.run_end_time),
    run_start_hour: 0,
    run_end_hour: 0
  };
  payload.run_start_hour = hourFromTime(payload.run_start_time, DEFAULT_SETTINGS.run_start_hour);
  payload.run_end_hour = hourFromTime(payload.run_end_time, DEFAULT_SETTINGS.run_end_hour);
  if (payload.order_max_minutes < payload.order_min_minutes) payload.order_max_minutes = payload.order_min_minutes;
  if (payload.status_max_minutes < payload.status_min_minutes) payload.status_max_minutes = payload.status_min_minutes;

  const btn = document.getElementById('btnSaveBotSettings');
  if (btn) btn.disabled = true;
  try {
    await fetch(API + '/api/bot/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(async r => {
      if (!r.ok) throw new Error(await r.text().catch(() => 'Không lưu được cấu hình'));
      return r.json();
    });
    showToast('Đã lưu cấu hình auto kéo đơn.');
    closeModal('botSettingsModal');
  } catch (e) {
    showToast('Lỗi lưu cấu hình auto: ' + e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

Object.assign(window, { saveBotSettings, wakeRadarFromSettings, formatBotTimeInput, normalizeBotTimeInput });
