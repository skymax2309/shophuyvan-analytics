import { API } from '../oms-dashboard/oms-api.js'
import { showToast } from '../utils/helpers.js'

const DEFAULT_TEMPLATE = 'Dạ Shop Huy Vân xác nhận đã nhận đơn {order_id} của mình. Shop sẽ chuẩn bị hàng và bàn giao đơn vị vận chuyển sớm. Mình kiểm tra giúp shop đúng sản phẩm và địa chỉ giao hàng nhé ạ.'

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function ensureConfirmPanel() {
  if (document.getElementById('orderConfirmSettingsPanel')) return
  const autoPanel = document.querySelector('[data-bot-settings-panel="auto"]')
  if (!autoPanel) return
  autoPanel.insertAdjacentHTML('beforeend', `
    <div class="bot-diagnostics" id="orderConfirmSettingsPanel">
      <div class="bot-diag-title">Tin xác nhận đơn hàng</div>
      <label class="bot-toggle">
        <input type="checkbox" id="order_confirm_message_enabled">
        <span>Bật soạn sẵn tin xác nhận khi bấm Nhắn khách từ đơn hàng</span>
      </label>
      <div class="bot-field-grid">
        <label>
          <span>Chế độ gửi</span>
          <select id="order_confirm_message_mode">
            <option value="draft_only">Chỉ tạo nháp để nhân viên kiểm tra</option>
            <option value="auto_send_when_allowed">Tự gửi khi sàn và shop cho phép</option>
          </select>
        </label>
        <label>
          <span>Kích hoạt khi</span>
          <select id="order_confirm_message_trigger_status">
            <option value="new_order">Đơn mới vào Core</option>
            <option value="processing">Đơn chuyển sang chờ xử lý</option>
          </select>
        </label>
      </div>
      <label class="bot-full-field">
        <span>Mẫu tin nhắn</span>
        <textarea id="order_confirm_message_template" rows="4"></textarea>
      </label>
      <div class="bot-helper-text">Biến dùng được: {order_id}, {customer_name}, {product_name}, {quantity}, {shop_name}</div>
    </div>
  `)
}

function fillConfirmSettings(settings = {}) {
  ensureConfirmPanel()
  const enabled = document.getElementById('order_confirm_message_enabled')
  const mode = document.getElementById('order_confirm_message_mode')
  const trigger = document.getElementById('order_confirm_message_trigger_status')
  const template = document.getElementById('order_confirm_message_template')
  if (enabled) enabled.checked = settings.order_confirm_message_enabled === true
  if (mode) mode.value = cleanText(settings.order_confirm_message_mode || 'draft_only')
  if (trigger) trigger.value = cleanText(settings.order_confirm_message_trigger_status || 'new_order')
  if (template) template.value = cleanText(settings.order_confirm_message_template || DEFAULT_TEMPLATE)
}

async function refreshConfirmSettings() {
  ensureConfirmPanel()
  const settings = await fetch(`${API}/api/bot/settings`, { cache: 'no-store' }).then(response => response.json())
  fillConfirmSettings(settings)
}

async function saveConfirmSettings() {
  ensureConfirmPanel()
  const payload = {
    order_confirm_message_enabled: !!document.getElementById('order_confirm_message_enabled')?.checked,
    order_confirm_message_mode: cleanText(document.getElementById('order_confirm_message_mode')?.value || 'draft_only'),
    order_confirm_message_trigger_status: cleanText(document.getElementById('order_confirm_message_trigger_status')?.value || 'new_order'),
    order_confirm_message_template: cleanText(document.getElementById('order_confirm_message_template')?.value || DEFAULT_TEMPLATE)
  }
  await fetch(`${API}/api/bot/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(async response => {
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || data.message || 'Không lưu được tin xác nhận đơn hàng.')
    return data
  })
}

function patchSaveButton() {
  if (window.__orderConfirmSettingsPatched) return
  const originalSave = window.saveBotSettings
  if (typeof originalSave !== 'function') return
  window.__orderConfirmSettingsPatched = true
  window.saveBotSettings = async function patchedSaveBotSettings(...args) {
    await originalSave.apply(this, args)
    await saveConfirmSettings()
    showToast('Đã lưu cấu hình tin xác nhận đơn hàng.')
  }
}

export function initOrderConfirmSettings() {
  ensureConfirmPanel()
  patchSaveButton()
  refreshConfirmSettings().catch(() => null)
  const modal = document.getElementById('botSettingsModal')
  if (!modal) return
  const observer = new MutationObserver(() => {
    if (modal.classList.contains('open')) refreshConfirmSettings().catch(() => null)
  })
  observer.observe(modal, { attributes: true, attributeFilter: ['class'] })
}
