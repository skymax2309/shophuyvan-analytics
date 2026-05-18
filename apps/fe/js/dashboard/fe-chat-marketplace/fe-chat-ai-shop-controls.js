// NEO: Frontend chat sàn - điều khiển AI/GHN theo từng shop, lưu backend thay vì chỉ đổi UI.
function chatAutoStatusPill(status = '') {
  const key = String(status || '').toLowerCase()
  const label = {
    connected: 'Đã kết nối',
    disconnected: 'Chưa kết nối',
    permission_missing: 'Thiếu quyền Chat API',
    token_expired: 'Token hết hạn',
    error: 'Lỗi API'
  }[key] || 'Chưa rõ'
  const tone = key === 'connected' ? 'api' : (key === 'permission_missing' || key === 'token_expired' || key === 'error' ? 'warn' : 'off')
  return `<span class="chat-pill ${tone}">${chatEscape(label)}</span>`
}

async function loadChatShopAutoSettings(options = {}) {
  if (chatState.shopAutoSettingsLoading && !options.force) return
  chatState.shopAutoSettingsLoading = true
  try {
    const data = await chatFetch('/api/chat/shop-auto-settings')
    chatState.shopAutoSettings = data.rows || []
    chatState.chatAutoGlobal = data
  } catch (error) {
    setChatGuardStatus(`Không tải được cấu hình AI theo shop: ${chatErrorMessage(error)}`, 'blocked')
  } finally {
    chatState.shopAutoSettingsLoading = false
  }
}

async function loadGhnAutoOrders(options = {}) {
  try {
    const qs = new URLSearchParams()
    const shop = chatEl('chatShop')?.value || ''
    if (shop) qs.set('shop', shop)
    qs.set('limit', options.limit || '30')
    const data = await chatFetch(`/api/chat/auto-ghn/orders?${qs.toString()}`)
    chatState.ghnAutoOrders = data.rows || []
  } catch (error) {
    setChatGuardStatus(`Không tải được danh sách đơn GHN: ${chatErrorMessage(error)}`, 'blocked')
  }
}

function renderChatAiShopControlsPanel() {
  const rows = chatState.shopAutoSettings || []
  const global = chatState.chatAutoGlobal || {}
  const ghnOrders = chatState.ghnAutoOrders || []
  const enabledAi = rows.filter(row => Number(row.ai_auto_reply_enabled)).length
  const enabledGhn = rows.filter(row => Number(row.ghn_auto_message_enabled)).length
  return `
    <div class="chat-settings-card">
      <div class="chat-settings-head">
        <div>
          <div class="chat-shop-name">AI tự trả lời theo từng shop</div>
          <div class="chat-shop-meta">Toggle ở đây lưu D1 thật. Runner sẽ bỏ qua shop đang tắt hoặc thiếu quyền Chat API.</div>
        </div>
        <span class="chat-pill ${Number(global.global_ai_auto_reply_enabled) ? 'api' : 'off'}">${Number(global.global_ai_auto_reply_enabled) ? 'AI tổng đang bật' : 'AI tổng đang tắt'}</span>
      </div>
      <div class="chat-settings-note">Biến môi trường live: AI ${Number(global.global_ai_auto_reply_enabled) ? 'đang bật' : 'đang tắt'} · GHN ${Number(global.global_ghn_auto_message_enabled) ? 'đang bật' : 'đang tắt'}. Nếu biến môi trường tắt, UI vẫn lưu cấu hình shop nhưng Worker không gửi live.</div>
      <div class="chat-notify-actions">
        <button class="chat-settings-save secondary" type="button" onclick="refreshChatAiShopControls()">Tải lại cấu hình</button>
        <button class="chat-settings-save secondary" type="button" onclick="runGhnAutoDryRun()">Dry-run đơn GHN</button>
        <button class="chat-settings-save secondary" type="button" onclick="loadGhnAutoOrders({limit: 50}).then(renderChatAutomationSettingsModal)">Tải đơn GHN</button>
      </div>
      <div class="chat-settings-note">Đang bật AI: ${enabledAi.toLocaleString('vi-VN')} shop · Tự nhắn GHN: ${enabledGhn.toLocaleString('vi-VN')} shop.</div>
      ${chatState.shopAutoSettingsLoading ? '<div class="chat-empty">Đang tải cấu hình shop...</div>' : ''}
      ${rows.length ? rows.map((row, index) => renderChatAiShopRow(row, index)).join('') : '<div class="chat-empty">Chưa có shop để cấu hình. Hãy kiểm tra /api/chat/shops hoặc kết nối shop trước.</div>'}
    </div>
    <div class="chat-settings-card">
      <div class="chat-settings-head">
        <div>
          <div class="chat-shop-name">Đơn GHN phát hiện được</div>
          <div class="chat-shop-meta">Danh sách chỉ dùng để dry-run/xác minh. Gửi live cần bật biến môi trường và bật GHN cho đúng shop.</div>
        </div>
        <span class="chat-pill ${ghnOrders.length ? 'warn' : 'off'}">${ghnOrders.length ? `${ghnOrders.length} đơn` : 'Chưa tải'}</span>
      </div>
      ${ghnOrders.length ? ghnOrders.slice(0, 30).map(row => `
        <div class="chat-context-card compact">
          <div class="chat-context-head">
            <div>
              <div class="chat-context-title">${chatEscape(row.order_sn || row.order_id || '')}</div>
              <div class="chat-context-meta">${chatEscape(row.shop || '')} · ${chatEscape(row.shipping_carrier || '')} · ${chatEscape(row.tracking_number || 'chưa có tracking')}</div>
            </div>
            <span class="chat-pill ${Number(row.already_sent) ? 'api' : (Number(row.eligible) ? 'warn' : 'off')}">${Number(row.already_sent) ? 'Đã nhắn' : (Number(row.eligible) ? 'Có thể nhắn' : chatEscape(row.skipped_reason || 'Bỏ qua'))}</span>
          </div>
        </div>
      `).join('') : '<div class="chat-empty">Bấm Tải đơn GHN hoặc Dry-run để kiểm tra danh sách.</div>'}
      <div id="chatGhnAutoStatus" class="chat-settings-note"></div>
    </div>
  `
}

function renderChatAiShopRow(row = {}, index = 0) {
  const disabled = row.chat_api_status !== 'connected'
  return `
    <div class="chat-context-card compact chat-shop-auto-row">
      <div class="chat-context-head">
        <div>
          <div class="chat-context-title">${chatEscape(row.shop_name || row.shop_id || '')}</div>
          <div class="chat-context-meta">${chatEscape(chatPlatformLabel(row.platform))} · shop_id ${chatEscape(row.shop_id || 'chưa có')} · sync ${chatEscape(chatTime(row.last_chat_sync_at) || 'chưa có')}</div>
        </div>
        ${chatAutoStatusPill(row.chat_api_status)}
      </div>
      <label class="chat-switch-row">
        <input type="checkbox" ${chatChecked(row.ai_auto_reply_enabled)} ${disabled ? 'disabled' : ''} onchange="toggleChatShopAutoSettingByIndex(${Number(index)}, 'ai_auto_reply_enabled', this.checked)">
        <span>${Number(row.ai_auto_reply_enabled) ? 'AI tự trả lời đang bật' : 'AI tự trả lời đang tắt'}</span>
      </label>
      <label class="chat-switch-row">
        <input type="checkbox" ${chatChecked(row.ghn_auto_message_enabled)} ${disabled ? 'disabled' : ''} onchange="toggleChatShopAutoSettingByIndex(${Number(index)}, 'ghn_auto_message_enabled', this.checked)">
        <span>${Number(row.ghn_auto_message_enabled) ? 'Tự nhắn đơn GHN đang bật' : 'Tự nhắn đơn GHN đang tắt'}</span>
      </label>
      <div class="chat-settings-note">AI hôm nay: ${Number(row.daily_ai_reply_count || 0).toLocaleString('vi-VN')}/${Number(row.max_ai_reply_per_day || 0).toLocaleString('vi-VN')} · manual takeover ${Number(row.manual_takeover_enabled) ? 'đang bật' : 'đang tắt'}.</div>
      ${disabled ? '<div class="chat-settings-note">Thiếu quyền/token Chat API nên không cho bật gửi thật.</div>' : ''}
    </div>
  `
}

window.refreshChatAiShopControls = async function() {
  await Promise.all([loadChatShopAutoSettings({ force: true }), loadGhnAutoOrders({ limit: 30 })])
  renderChatAutomationSettingsModal()
}

window.toggleChatShopAutoSettingByIndex = async function(index, field, checked) {
  const row = (chatState.shopAutoSettings || [])[Number(index)]
  if (!row) return
  await window.toggleChatShopAutoSetting(row.platform, row.shop_id, row.shop_name, field, checked)
}

window.toggleChatShopAutoSetting = async function(platform, shopId, shopName, field, checked) {
  const body = { platform, shop_id: shopId, shop_name: shopName }
  body[field] = checked ? 1 : 0
  try {
    const data = await chatFetch('/api/chat/shop-auto-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const row = data.row
    chatState.shopAutoSettings = (chatState.shopAutoSettings || []).map(item => (
      String(item.platform) === String(row.platform) && String(item.shop_id) === String(row.shop_id) && String(item.shop_name) === String(row.shop_name)
        ? row
        : item
    ))
    renderChatAutomationSettingsModal()
  } catch (error) {
    setChatGuardStatus(`Không lưu được toggle theo shop: ${chatErrorMessage(error)}`, 'blocked')
    await loadChatShopAutoSettings({ force: true })
    renderChatAutomationSettingsModal()
  }
}

window.runGhnAutoDryRun = async function() {
  if (chatState.ghnAutoRunning) return
  chatState.ghnAutoRunning = true
  const status = chatEl('chatGhnAutoStatus')
  if (status) status.textContent = 'Đang chạy dry-run GHN...'
  try {
    const data = await chatFetch('/api/chat/auto-ghn/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dry_run: true, limit: 20, shop: chatEl('chatShop')?.value || '' })
    })
    if (status) status.textContent = `Dry-run GHN: xử lý ${Number(data.processed || 0).toLocaleString('vi-VN')} đơn, dự kiến gửi ${Number((data.results || []).filter(item => item.status === 'would_send').length).toLocaleString('vi-VN')} tin.`
    await loadGhnAutoOrders({ limit: 30 })
    renderChatAutomationSettingsModal()
  } catch (error) {
    if (status) status.textContent = `Dry-run GHN lỗi: ${chatErrorMessage(error)}`
  } finally {
    chatState.ghnAutoRunning = false
  }
}
