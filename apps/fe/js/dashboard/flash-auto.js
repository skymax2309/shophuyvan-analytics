window.FlashAuto = (() => {
  const API_BASE = window.API || window.SHV_API || 'https://huyvan-worker-api.nghiemchihuy.workers.dev'
  const DAYS = [
    ['mon', 'T2'],
    ['tue', 'T3'],
    ['wed', 'T4'],
    ['thu', 'T5'],
    ['fri', 'T6'],
    ['sat', 'T7'],
    ['sun', 'CN']
  ]
  const state = {
    settings: [],
    logs: [],
    currentShop: '',
    selectedShops: [],
    batchSummary: [],
    timeslots: [],
    loading: false
  }

  function el(id) {
    return document.getElementById(id)
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char])
  }

  function num(value, fallback = 0) {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  function cleanText(value) {
    return String(value ?? '').replace(/\u00a0/g, ' ').trim()
  }

  function asBool(value) {
    return value === true || Number(value || 0) === 1 || String(value).toLowerCase() === 'true'
  }

  function switchOn(id, fallback = false) {
    const node = el(id)
    if (!node) return fallback
    if (typeof node.dataset.switchOn !== 'undefined') return node.dataset.switchOn === '1'
    return !!node.checked
  }

  function availableShopIds() {
    return state.settings.map(item => item.shop_id).filter(Boolean)
  }

  function supportsFlashApi(row = {}) {
    return String(row.platform || '').toLowerCase() === 'shopee' && asBool(row.has_access_token)
  }

  function preferredCurrentShop() {
    const rows = Array.isArray(state.settings) ? state.settings : []
    const enabledApiShop = rows.find(row => supportsFlashApi(row) && asBool(row.enabled))
    if (enabledApiShop?.shop_id) return enabledApiShop.shop_id
    const apiShop = rows.find(row => supportsFlashApi(row))
    if (apiShop?.shop_id) return apiShop.shop_id
    const shopeeShop = rows.find(row => String(row.platform || '').toLowerCase() === 'shopee')
    if (shopeeShop?.shop_id) return shopeeShop.shop_id
    return rows[0]?.shop_id || ''
  }

  function ensureShopSelection() {
    const ids = new Set(availableShopIds())
    if (!ids.size) {
      state.currentShop = ''
      state.selectedShops = []
      return
    }
    if (!ids.has(state.currentShop)) state.currentShop = preferredCurrentShop()
    const currentRow = state.settings.find(item => item.shop_id === state.currentShop)
    if (!supportsFlashApi(currentRow)) {
      const preferred = preferredCurrentShop()
      if (preferred && preferred !== state.currentShop) state.currentShop = preferred
    }
    const selected = state.selectedShops.filter(shopId => ids.has(shopId))
    if (!selected.length) selected.push(state.currentShop)
    state.selectedShops = Array.from(new Set(selected))
  }

  function selectedShopIds() {
    ensureShopSelection()
    return state.selectedShops.slice()
  }

  function currentSetting() {
    return state.settings.find(item => item.shop_id === state.currentShop) || state.settings[0] || null
  }

  function parseDays(value) {
    if (Array.isArray(value)) return value
    try {
      const parsed = JSON.parse(value || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  function money(value) {
    if (value === null || value === undefined || value === '') return '-'
    const n = Number(value)
    if (!Number.isFinite(n)) return '-'
    return `${Math.round(n).toLocaleString('vi-VN')}đ`
  }

  function timeLabel(value) {
    if (!value) return '-'
    const date = new Date(String(value).replace(' ', 'T'))
    if (Number.isNaN(date.getTime())) return String(value)
    return date.toLocaleString('vi-VN')
  }

  function userMessage(msg) {
    const text = String(msg || '').trim()
    if (/no permission|api_permission_missing/i.test(text)) return 'Shop chưa được cấp quyền Flash Sale trên sàn'
    if (/token_scope_missing/i.test(text)) return 'Token shop đã hết hạn hoặc thiếu quyền Flash Sale'
    if (/expired/i.test(text)) return 'Khung giờ Flash đã kết thúc'
    if (/invalid/i.test(text)) return 'Thông tin đăng ký không hợp lệ'
    if (/timeslot|khung giờ/i.test(text)) return 'Không tìm được khung giờ phù hợp'
    if (/live_write_disabled/i.test(text)) return 'Hệ thống đang chặn gửi thật lên sàn'
    return text || 'Sàn chưa xác nhận, thử lại sau.'
  }

  function toast(message, tone = 'ok') {
    const host = el('flashAutoToastHost')
    if (!host) return
    const item = document.createElement('div')
    item.className = `flash-auto-toast ${tone}`
    item.textContent = userMessage(message)
    host.appendChild(item)
    setTimeout(() => item.remove(), 3600)
  }

  async function request(path, options = {}, config = {}) {
    const allowErrorPayload = config.allowErrorPayload === true
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok && !allowErrorPayload) throw new Error(userMessage(data.message || data.error || `HTTP ${res.status}`))
    if (!res.ok && allowErrorPayload) return { ...data, _http_error: true, _http_status: res.status }
    return data
  }

  async function loadSettings() {
    const data = await request('/api/discounts/flash-auto/settings/all')
    state.settings = Array.isArray(data.settings) ? data.settings : []
    if (!state.currentShop && state.settings.length) state.currentShop = state.settings[0].shop_id
    ensureShopSelection()
    return state.settings
  }

  async function loadLogs(limit = 20) {
    const shop = state.currentShop ? `&shop=${encodeURIComponent(state.currentShop)}` : ''
    const data = await request(`/api/discounts/flash-auto/logs?limit=${limit}${shop}`)
    state.logs = Array.isArray(data.logs) ? data.logs : []
    return state.logs
  }

  function collectSetting(shopId = state.currentShop) {
    const base = currentSetting() || {}
    const pickedDays = Array.from(document.querySelectorAll('[data-flash-run-day].on')).map(node => node.dataset.flashRunDay).filter(Boolean)
    const days = pickedDays.length ? pickedDays : parseDays(base.schedule_days)
    return {
      ...base,
      shop_id: shopId,
      enabled: switchOn('flashEnabled', asBool(base.enabled)) ? 1 : 0,
      auto_submit: switchOn('flashAutoSubmit', asBool(base.auto_submit)) ? 1 : 0,
      fallback_discount_percent: num(el('flashFallbackPercent')?.value, 10),
      min_discount_percent: num(el('flashMinDiscount')?.value, 5),
      max_items: num(el('flashMaxItems')?.value, 50),
      min_stock: num(el('flashMinStock')?.value, 5),
      active_only: switchOn('flashActiveOnly', asBool(base.active_only)) ? 1 : 0,
      timeslot_mode: el('flashTimeslotMode')?.value || 'auto',
      timeslot_id: el('flashTimeslotId')?.value || null,
      run_before_minutes: num(el('flashRunBefore')?.value, 30),
      schedule_days: days
    }
  }

  async function saveSettings() {
    const setting = collectSetting(state.currentShop)
    const data = await request('/api/discounts/flash-auto/settings', {
      method: 'POST',
      body: JSON.stringify(setting)
    })
    await loadSettings()
    render()
    return data
  }

  async function saveTemplateForShops(shopIds, options = {}) {
    const ids = Array.from(new Set((shopIds || []).filter(Boolean)))
    if (!ids.length) throw new Error('Chọn ít nhất một shop để áp dụng.')
    const template = collectSetting(state.currentShop)
    if (ids.length === 1) {
      const shopId = ids[0]
      const data = await request('/api/discounts/flash-auto/settings', {
        method: 'POST',
        body: JSON.stringify({ setting: { ...template, shop_id: shopId } })
      })
      await loadSettings()
      await loadLogs(20)
      render()
      return {
        mode: 'single',
        results: [{
          shop_id: shopId,
          shop_name: state.settings.find(item => item.shop_id === shopId)?.shop_name || shopId,
          ok: true,
          message: data?.message || 'Đã lưu'
        }]
      }
    }
    const payload = {
      template,
      setting: template,
      shop_ids: ids,
      selected_shop_ids: ids,
      shops: ids
    }
    const data = await request('/api/discounts/flash-auto/settings/batch', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    await loadSettings()
    await loadLogs(20)
    render()
    const rawResults = Array.isArray(data?.results) ? data.results : Array.isArray(data?.items) ? data.items : []
    const results = rawResults.length ? rawResults : ids.map(shopId => ({
      shop_id: shopId,
      ok: false,
      message: data?.message || 'Chưa có phản hồi theo từng shop.'
    }))
    if (!options.silent) {
      const done = results.filter(item => item?.ok !== false && !item?.error).length
      toast(`Đã áp dụng cho ${done}/${ids.length} shop.`, done === ids.length ? 'ok' : 'bad')
    }
    return { mode: 'batch', results }
  }

  async function runCheck(shopId, options = {}) {
    const shop = shopId || state.currentShop || currentSetting()?.shop_id
    return request('/api/discounts/flash-auto/run', {
      method: 'POST',
      body: JSON.stringify({
        shop_id: shop,
        force_submit: options.force_submit === true ? 1 : 0
      })
    }, { allowErrorPayload: true })
  }

  async function runBatchCheck(shopIds, options = {}) {
    const ids = Array.from(new Set((shopIds || []).filter(Boolean)))
    if (!ids.length) throw new Error('Chọn ít nhất một shop để chạy.')
    return request('/api/discounts/flash-auto/run/batch', {
      method: 'POST',
      body: JSON.stringify({
        shop_ids: ids,
        selected_shop_ids: ids,
        shops: ids,
        force_submit: options.force_submit === true ? 1 : 0
      })
    }, { allowErrorPayload: true })
  }

  async function loadTimeslots() {
    if (!state.currentShop) return []
    const data = await request(`/api/discounts/flash-deal/timeslots?shop=${encodeURIComponent(state.currentShop)}`)
    state.timeslots = Array.isArray(data.timeslots) ? data.timeslots : []
    return state.timeslots
  }

  async function refreshHistoryTab() {
    await loadLogs(20)
    render()
  }

  function badge(text, tone = 'watch') {
    return `<span class="flash-auto-badge ${esc(tone)}">${esc(text)}</span>`
  }

  function shopLabel(shopId) {
    const row = state.settings.find(item => item.shop_id === shopId)
    return row?.shop_name || shopId
  }

  async function toggleShopEnabled(shopId) {
    const row = state.settings.find(item => item.shop_id === shopId)
    if (!row) throw new Error('Không tìm thấy shop để đổi trạng thái.')
    const nextEnabled = asBool(row.enabled) ? 0 : 1
    await request('/api/discounts/flash-auto/settings', {
      method: 'POST',
      body: JSON.stringify({
        setting: {
          ...row,
          shop_id: shopId,
          enabled: nextEnabled
        }
      })
    })
    state.currentShop = shopId
    state.selectedShops = [shopId]
    await loadSettings()
    await loadLogs(20)
    render()
    toast(`${shopLabel(shopId)} đã ${nextEnabled ? 'bật' : 'tắt'} Flash Sale tự động.`, 'ok')
  }

  function normalizeBatchRows(rows = [], mode = 'save') {
    return (Array.isArray(rows) ? rows : []).map((row, index) => {
      const shopId = row.shop_id || row.shop || row.id || state.selectedShops[index] || ''
      const statusKey = cleanText(row.status).toLowerCase()
      const verified = asBool(row.verified)
      const liveSent = asBool(row.live_write_sent)
      const successStatus = statusKey === 'ok' || statusKey === 'success'
      const pendingStatus = statusKey === 'submitted' || statusKey === 'prepared' || statusKey === 'skipped'
      const deniedStatus = statusKey === 'permission_denied'
      const success = row.ok === true || successStatus || verified || (mode === 'save' && row.error !== true && !deniedStatus && statusKey !== 'error' && statusKey !== 'failed')
      const tone = success ? 'good' : (pendingStatus || liveSent) ? 'watch' : 'bad'
      const status = success ? 'Thành công' : pendingStatus ? 'Đang chờ xác nhận' : 'Chưa xong'
      const message = userMessage(row.message || row.error || (success ? 'Đã xử lý xong.' : 'Shop chưa xử lý được.'))
      return {
        shop_id: shopId,
        shop_name: shopLabel(shopId),
        tone,
        status,
        message,
        items_submitted: num(row.items_submitted),
        items_confirmed: num(row.items_confirmed),
        live_write_sent: liveSent,
        verified
      }
    })
  }

  function renderToggle(id, checked, label, hint) {
    return `
      <button
        class="flash-auto-switch ${checked ? 'on' : ''}"
        type="button"
        id="${esc(id)}"
        data-switch-id="${esc(id)}"
        data-switch-on="${checked ? '1' : '0'}"
        aria-pressed="${checked ? 'true' : 'false'}"
      >
        <span class="flash-auto-switch-copy">
          <b>${esc(label)}</b>
          <small>${esc(hint)}</small>
        </span>
        <span class="flash-auto-switch-pill">
          <i></i>
          <em>${checked ? 'Bật' : 'Tắt'}</em>
        </span>
      </button>
    `
  }

  function renderShopList() {
    if (!state.settings.length) return '<div class="flash-auto-state">Chưa có shop nào trong cài đặt Flash Sale.</div>'
    return `<div class="flash-auto-shop-list">${state.settings.map(row => `
      <article class="flash-auto-shop">
        <div class="flash-auto-shop-head">
          <div class="flash-auto-shop-meta">
            <b>${esc(row.shop_name || row.shop_id)}</b>
            <div class="flash-auto-muted">${esc(row.platform || '')} · ${esc(row.has_access_token ? 'Đã kết nối API' : 'Chưa kết nối API')}</div>
          </div>
          <div class="flash-auto-shop-actions">
            <button
              class="flash-auto-shop-toggle ${asBool(row.enabled) ? 'on' : ''}"
              type="button"
              data-flash-shop-power="${esc(row.shop_id)}"
              aria-pressed="${asBool(row.enabled) ? 'true' : 'false'}"
            >
              <i></i>
              <span>${asBool(row.enabled) ? 'Đang bật' : 'Đang tắt'}</span>
            </button>
          </div>
        </div>
      </article>
    `).join('')}</div>`
  }

  function endpointSummary() {
    const rows = Array.isArray(state.settings) ? state.settings : []
    const used = rows.filter(row => String(row.platform || '').toLowerCase() === 'shopee').length
    const permissionMissing = rows.filter(row => String(row.platform || '').toLowerCase() === 'shopee' && !asBool(row.has_access_token)).length
    const endpointMissing = rows.filter(row => String(row.platform || '').toLowerCase() !== 'shopee').length
    return { used, permissionMissing, endpointMissing }
  }

  function runStatusKey(row = {}) {
    const explicit = cleanText(row.status).toLowerCase()
    if (explicit) return explicit
    if (asBool(row.skipped)) return 'skipped'
    if (asBool(row.live_write_sent) && asBool(row.verified)) return 'success'
    if (asBool(row.live_write_sent)) return 'submitted'
    if (num(row.items_submitted) > 0) return 'prepared'
    return 'failed'
  }

  function runStatusTone(row = {}) {
    const status = runStatusKey(row)
    if (status === 'success') return { label: 'Thành công', tone: 'good' }
    if (status === 'submitted') return { label: 'Chờ xác nhận', tone: 'watch' }
    if (status === 'prepared') return { label: 'Đã chuẩn bị', tone: 'watch' }
    if (status === 'skipped') return { label: 'Đã bỏ qua', tone: 'watch' }
    if (status === 'permission_denied') return { label: 'Thiếu quyền', tone: 'bad' }
    return { label: 'Thất bại', tone: 'bad' }
  }

  function runTitle(row = {}) {
    if (row.message) return userMessage(row.message)
    const status = runStatusKey(row)
    if (status === 'submitted') return 'Đã gửi lên sàn, chờ xác nhận'
    if (status === 'prepared') return 'Đã chuẩn bị danh sách, chờ chạy tiếp'
    if (status === 'skipped') return 'Đợt chạy đã được bỏ qua theo điều kiện'
    return 'Chưa gửi thành công'
  }

  function renderBatchSummary() {
    if (!state.batchSummary.length) return ''
    return `
      <section class="flash-auto-section">
        <h2>Kết quả theo shop</h2>
        <div class="flash-auto-history-list">
          ${state.batchSummary.map(row => `
            <article class="flash-auto-history-row">
              <div class="flash-auto-history-head">
                <b>${esc(row.shop_name || row.shop_id)}</b>
                ${badge(row.status, row.tone)}
              </div>
              <div class="flash-auto-muted">Đăng ký: ${num(row.items_submitted).toLocaleString('vi-VN')} SP · Xác nhận: ${num(row.items_confirmed).toLocaleString('vi-VN')} SP</div>
              <div>${esc(row.message)}</div>
            </article>
          `).join('')}
        </div>
      </section>
    `
  }

  function renderTimeslotSelect(setting) {
    if (setting.timeslot_mode !== 'manual') return ''
    const options = state.timeslots.map(slot => {
      const id = slot.timeslot_id || slot.time_slot_id || slot.id
      const label = [id, slot.start_time, slot.end_time].filter(Boolean).join(' · ')
      return `<option value="${esc(id)}" ${String(setting.timeslot_id || '') === String(id) ? 'selected' : ''}>${esc(label)}</option>`
    }).join('')
    return `<label class="flash-auto-field">Khung giờ thủ công
      <select id="flashTimeslotId"><option value="">Chọn khung giờ</option>${options}</select>
    </label>`
  }

  function renderSettings() {
    const setting = currentSetting()
    const target = el('flashAutoSettingsTab')
    if (!target) return
    if (!setting) {
      target.innerHTML = '<div class="flash-auto-state">Chưa tải được cài đặt Flash Sale.</div>'
      return
    }
    const days = new Set(parseDays(setting.schedule_days))
    const endpoint = endpointSummary()
    const recentLogs = state.logs.slice(0, 4)
    const lastUpdated = timeLabel(setting.updated_at || state.logs[0]?.ran_at || '')
    const shopLabelText = setting.shop_name || setting.shop_id
    const modeAuto = setting.timeslot_mode !== 'manual'
    target.innerHTML = `
      <section class="flash-auto-mock-shell">
        <header class="flash-auto-mock-top">
          <div>
            <p class="flash-auto-breadcrumb">Khuyến mãi sàn <span>›</span> Flash Sale tự động <span>›</span> Cài đặt</p>
            <small class="flash-auto-updated">Cập nhật lúc: ${esc(lastUpdated === '-' ? 'Đang tải...' : lastUpdated)}</small>
          </div>
          <button class="flash-auto-btn secondary" type="button" data-flash-command="reload">Làm mới</button>
        </header>
        <section class="flash-auto-section flash-auto-endpoint-top">
          <h2>Trạng thái endpoint</h2>
          <div class="flash-auto-endpoint-grid">
            <article class="flash-auto-endpoint-card good"><span>Đã dùng</span><b>${endpoint.used}</b></article>
            <article class="flash-auto-endpoint-card watch"><span>Thiếu quyền</span><b>${endpoint.permissionMissing}</b></article>
            <article class="flash-auto-endpoint-card neutral"><span>Chưa có endpoint</span><b>${endpoint.endpointMissing}</b></article>
          </div>
        </section>
        <div class="flash-auto-mock-layout">
          <div class="flash-auto-left-col">
            <section class="flash-auto-section flash-auto-section-strong">
              <h2>1. Trạng thái chạy</h2>
              <div class="flash-auto-status-grid">
                <div class="flash-auto-status-main">
                  ${renderToggle('flashEnabled', asBool(setting.enabled), 'Trạng thái hiện tại', 'Flash Sale tự động đang hoạt động')}
                </div>
                <article class="flash-auto-emergency">
                  <b>Dừng khẩn</b>
                  <p>Tạm dừng ngay mọi tác vụ Flash Sale tự động.</p>
                  <button class="flash-auto-btn danger" type="button" data-flash-command="pause">Dừng khẩn</button>
                </article>
              </div>
            </section>
            <section class="flash-auto-section">
              <h2>2. Luật áp giá</h2>
              <div class="flash-auto-control-grid compact-2">
                <label class="flash-auto-field">Giảm thêm nếu chưa có giá KM (%)
                  <input id="flashFallbackPercent" type="number" min="0" max="90" step="1" value="${esc(setting.fallback_discount_percent)}">
                </label>
                <label class="flash-auto-field">Tồn kho tối thiểu
                  <input id="flashMinStock" type="number" min="0" step="1" value="${esc(setting.min_stock)}">
                </label>
                <label class="flash-auto-field">Giảm tối thiểu so giá gốc (%)
                  <input id="flashMinDiscount" type="number" min="0" max="90" step="1" value="${esc(setting.min_discount_percent)}">
                </label>
                <label class="flash-auto-field">Số SKU tối đa mỗi lần chạy
                  <input id="flashMaxItems" type="number" min="1" max="200" step="1" value="${esc(setting.max_items)}">
                </label>
                ${renderToggle('flashActiveOnly', asBool(setting.active_only), 'Không đẩy giá dưới giá vốn', 'Luôn ưu tiên SKU an toàn để chạy live-write')}
              </div>
            </section>
            <section class="flash-auto-section flash-auto-schedule">
              <h2>3. Lịch chạy</h2>
              <div class="flash-auto-control-grid compact-3">
                <label class="flash-auto-field">Chế độ chạy
                  <select id="flashTimeslotMode">
                    <option value="auto" ${modeAuto ? 'selected' : ''}>Tự động</option>
                    <option value="manual" ${modeAuto ? '' : 'selected'}>Thủ công</option>
                  </select>
                </label>
                ${renderTimeslotSelect(setting)}
                <label class="flash-auto-field">Chạy trước (phút)
                  <input id="flashRunBefore" type="number" min="0" max="1440" step="1" value="${esc(setting.run_before_minutes)}">
                </label>
              </div>
              <div class="flash-auto-days flash-auto-days-large">
                ${DAYS.map(([key, label]) => `<button class="flash-auto-day ${days.has(key) ? 'on' : ''}" type="button" data-flash-run-day="${esc(key)}">${label}</button>`).join('')}
              </div>
              <div class="flash-auto-actions flash-auto-actions-inline">
                <button class="flash-auto-btn primary" type="button" data-flash-command="save">Lưu cài đặt</button>
                <button class="flash-auto-btn secondary" type="button" data-flash-command="reload">Làm mới</button>
                <button class="flash-auto-btn warning" type="button" data-flash-command="run-now">Chạy ngay (có xác nhận)</button>
              </div>
            </section>
          </div>
          <aside class="flash-auto-right-col">
            <section class="flash-auto-section">
              <h2>Shop áp dụng và chỉnh sửa</h2>
              <div class="flash-auto-shop-summary">
                <span>Shop hiện tại: <b>${esc(shopLabelText)}</b></span>
                <span>Bật shop nào thì shop đó chạy tự động.</span>
              </div>
              ${renderShopList()}
            </section>
          </aside>
        </div>
        <div class="flash-auto-bottom-grid">
          <section class="flash-auto-section">
            <h2>Lịch sử gần nhất</h2>
            <div class="flash-auto-history-list">
              ${recentLogs.length ? recentLogs.map(row => {
                const status = runStatusTone(row)
                return `
                  <article class="flash-auto-history-row">
                    <div class="flash-auto-history-head">
                      <b>${esc(runTitle(row))}</b>
                      ${badge(status.label, status.tone)}
                    </div>
                    <div class="flash-auto-muted">${esc(timeLabel(row.ran_at))} · ${num(row.items_confirmed).toLocaleString('vi-VN')}/${num(row.items_submitted).toLocaleString('vi-VN')} SKU</div>
                  </article>
                `
              }).join('') : '<div class="flash-auto-state">Chưa có lịch sử chạy Flash Sale.</div>'}
            </div>
          </section>
        </div>
        ${renderBatchSummary()}
      </section>
    `
  }

  function render() {
    const setting = currentSetting()
    const status = el('flashAutoStatusText')
    if (status) {
      const updated = timeLabel(setting?.updated_at || state.logs[0]?.ran_at || '')
      status.textContent = setting
        ? `${setting.shop_name || setting.shop_id} · ${asBool(setting.enabled) ? 'Đang bật' : 'Đang tắt'} · Cập nhật ${updated === '-' ? 'đang tải' : updated}`
        : 'Chưa có cài đặt'
    }
    renderSettings()
  }

  async function pollLiveWrite(shopId) {
    const MAX_ATTEMPTS = 6
    const DELAY_MS = 4000
    let attempt = 0
    let lastResult = null
    const targetShop = shopId || state.currentShop
    await saveSettings()
    toast('Đang khởi động Flash Sale tự động...', 'ok')
    refreshHistoryTab()
    while (attempt < MAX_ATTEMPTS) {
      attempt += 1
      toast(`Lần thử ${attempt}/${MAX_ATTEMPTS} - đang gọi sàn...`, 'ok')
      lastResult = await runCheck(targetShop, { force_submit: true })
      const ok = lastResult.live_write_sent === true && lastResult.verified === true
      if (ok) {
        toast('Sàn đã xác nhận gửi Flash Sale thành công.', 'ok')
        state.batchSummary = normalizeBatchRows([{
          ...lastResult,
          shop_id: targetShop,
          status: 'ok',
          ok: true
        }], 'run')
        await refreshHistoryTab()
        return
      }
      const statusKey = runStatusKey(lastResult)
      const hardError = statusKey === 'failed' || statusKey === 'permission_denied' || /không cho phép|no permission|api_permission_missing|token_scope_missing|live_write_disabled|blocked|invalid|expired|hết hạn|kết thúc|không hỗ trợ|chưa kết nối api|đang tắt|chưa có cài đặt|không có sp đủ điều kiện|chưa tự submit/i.test(lastResult.message || '')
      if (hardError || attempt >= MAX_ATTEMPTS) {
        state.batchSummary = normalizeBatchRows([{
          ...lastResult,
          shop_id: targetShop,
          ok: false
        }], 'run')
        toast(userMessage(lastResult.message) || `Đã thử ${MAX_ATTEMPTS} lần, sàn chưa xác nhận.`, 'bad')
        await refreshHistoryTab()
        return
      }
      await new Promise(resolve => setTimeout(resolve, DELAY_MS))
    }
  }

  async function runBatchNow(shopIds) {
    const ids = Array.from(new Set((shopIds || []).filter(Boolean)))
    if (!ids.length) throw new Error('Chọn ít nhất một shop để chạy.')
    await saveTemplateForShops(ids, { silent: true })
    const data = await runBatchCheck(ids, { force_submit: true })
    const rawRows = Array.isArray(data?.results) ? data.results : Array.isArray(data?.items) ? data.items : []
    const rows = rawRows.length ? rawRows : ids.map(shopId => ({
      shop_id: shopId,
      ok: false,
      message: data?.message || 'Chưa có phản hồi theo từng shop.'
    }))
    state.batchSummary = normalizeBatchRows(rows, 'run')
    const done = state.batchSummary.filter(row => row.tone !== 'bad').length
    toast(`Đã chạy ${done}/${ids.length} shop.`, done === ids.length ? 'ok' : 'bad')
    await refreshHistoryTab()
  }

  async function reload() {
    await loadSettings()
    await loadLogs(20)
    render()
  }

  function wire() {
    document.addEventListener('click', event => {
      const toggle = event.target.closest('[data-switch-id]')
      if (toggle) {
        const nextOn = toggle.dataset.switchOn !== '1'
        toggle.dataset.switchOn = nextOn ? '1' : '0'
        toggle.classList.toggle('on', nextOn)
        toggle.setAttribute('aria-pressed', nextOn ? 'true' : 'false')
        const label = toggle.querySelector('.flash-auto-switch-pill em')
        if (label) label.textContent = nextOn ? 'Bật' : 'Tắt'
        return
      }
      const powerShop = event.target.closest('[data-flash-shop-power]')
      if (powerShop) {
        toggleShopEnabled(powerShop.dataset.flashShopPower).catch(error => toast(error.message, 'bad'))
        return
      }
      const day = event.target.closest('[data-flash-run-day]')
      if (day) {
        day.classList.toggle('on')
        return
      }
      const command = event.target.closest('[data-flash-command]')
      if (command?.dataset.flashCommand === 'save') {
        command.disabled = true
        command.textContent = 'Đang xử lý...'
        saveSettings().then(() => {
          state.batchSummary = []
          toast('Đã lưu cài đặt cho shop hiện tại.', 'ok')
          render()
        }).catch(error => toast(error.message, 'bad')).finally(() => {
          command.disabled = false
          command.textContent = 'Lưu cài đặt'
        })
      }
      if (command?.dataset.flashCommand === 'pause') {
        const shopId = state.currentShop
        const updates = [request('/api/discounts/flash-auto/settings', {
          method: 'POST',
          body: JSON.stringify({ setting: { ...collectSetting(shopId), enabled: 0 } })
        })]
        Promise.allSettled(updates).then(async () => {
          toast('Đã dừng khẩn cho shop hiện tại.', 'ok')
          await reload()
        }).catch(error => toast(error.message, 'bad'))
      }
      if (command?.dataset.flashCommand === 'reload') {
        reload().catch(error => toast(error.message, 'bad'))
        return
      }
      if (command?.dataset.flashCommand === 'run-now') {
        command.disabled = true
        command.textContent = 'Đang xử lý...'
        const runner = pollLiveWrite(state.currentShop)
        runner.catch(error => toast(error.message, 'bad')).finally(() => {
          command.disabled = false
          command.textContent = 'Chạy ngay (có xác nhận)'
        })
      }
    })
    document.addEventListener('change', event => {
      if (event.target.id === 'flashTimeslotMode') {
        const setting = currentSetting()
        if (setting) setting.timeslot_mode = event.target.value
        if (event.target.value === 'manual') loadTimeslots().then(render).catch(error => toast(error.message, 'bad'))
        else render()
      }
    })
    el('flashAutoReloadBtn')?.addEventListener('click', () => reload().catch(error => toast(error.message, 'bad')))
  }

  document.addEventListener('DOMContentLoaded', () => {
    wire()
    reload().catch(error => toast(error.message, 'bad'))
  })

  return {
    api: { saveSettings, runCheck },
    refreshHistoryTab,
    userMessage,
    pollLiveWrite
  }
})()

