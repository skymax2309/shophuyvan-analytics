(() => {
  const API_BASE = window.API || 'https://huyvan-worker-api.nghiemchihuy.workers.dev'
  const state = {
    data: {},
    overview: {},
    catalog: [],
    selectedCampaignId: '',
    logs: [],
    lastRun: null,
    preview: null,
    activeTab: 'overview',
    autoRefreshTimer: null,
    autoSyncing: false,
    trendDaily: [],
    settings: {},
    filters: {
      platform: '',
      shop: '',
      status: '',
      query: ''
    }
  }
 
  function el(id) {
    return document.getElementById(id)
  }

  function fmtText(value, fallback = '-') {
    const text = String(value ?? '').replace(/\u00a0/g, ' ').trim()
    if (!text) return fallback
    return text
      .replace(/\bCore\b/g, 'dữ liệu chuẩn')
      .replace(/\bread-model\b/gi, 'bảng tổng hợp')
      .replace(/\bguard\b/gi, 'kiểm tra an toàn')
      .replace(/\bpayload\b/gi, 'nội dung gửi')
      .replace(/\bendpoint\b/gi, 'kết nối')
      .replace(/\broute\b/gi, 'đường xử lý')
      .replace(/\brequest_id\b/gi, 'mã thao tác')
      .replace(/\bcache\b/gi, 'dữ liệu đã lưu')
      .replace(/\braw response\b/gi, 'kết quả trả về')
      .replace(/\bJSON\b/g, 'dữ liệu')
      .replace(/\bcurrent_cost\b/gi, 'giá vốn hiện tại')
      .replace(/\bprofit_after_ads\b/gi, 'lãi sau ADS')
      .replace(/\broas\b/gi, 'ROAS')
      .replace(/\bacos\b/gi, 'ACOS')
      .replace(/Finance dữ liệu chuẩn/gi, 'Dữ liệu tài chính')
      .replace(/Warehouse dữ liệu chuẩn/gi, 'Dữ liệu kho')
      .replace(/Product dữ liệu chuẩn/gi, 'Dữ liệu sản phẩm')
      .replace(/Promotion dữ liệu chuẩn/gi, 'Dữ liệu khuyến mãi')
      .replace(/ADS dữ liệu chuẩn/gi, 'Dữ liệu ADS')
  }

  function esc(value) {
    return fmtText(value, '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char])
  }

  function rawEsc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char])
  }

  const ADS_HELP_ITEMS = {
    roas: {
      title: 'ROAS và ACOS',
      explain: 'ROAS cho biết một đồng chi ADS tạo ra bao nhiêu đồng doanh thu. ACOS là tỷ lệ chi ADS trên doanh thu.',
      meaning: ['ROAS cao và ACOS thấp', 'ROAS giảm nhanh hoặc ACOS tăng', 'ROAS thấp hơn ngưỡng tối thiểu'],
      action: 'Ưu tiên giữ hoặc tăng ngân sách cho dòng tốt, giảm hoặc tạm dừng dòng kém.'
    },
    acos: {
      title: 'ACOS',
      explain: 'ACOS càng thấp thì chi phí ADS trên doanh thu càng tốt.',
      meaning: ['ACOS thấp hơn biên lợi nhuận', 'ACOS tăng nhưng đơn không tăng', 'ACOS cao làm lãi sau ADS âm'],
      action: 'Kiểm tra giá vốn, khuyến mãi và giảm ngân sách nếu ACOS vượt ngưỡng.'
    },
    ads_spend: {
      title: 'Chi ADS',
      explain: 'Tổng tiền đã chi cho quảng cáo trong khoảng ngày đang chọn.',
      meaning: ['Chi tăng cùng doanh thu', 'Chi tăng nhưng ROAS giảm', 'Chi cao mà không có doanh thu'],
      action: 'Đối chiếu với doanh thu ADS và lãi sau ADS trước khi tăng ngân sách.'
    },
    ads_revenue: {
      title: 'Doanh thu ADS',
      explain: 'Doanh thu được sàn ghi nhận có liên quan đến quảng cáo.',
      meaning: ['Doanh thu tăng cùng ROAS', 'Doanh thu chững lại', 'Không có doanh thu dù vẫn chi ADS'],
      action: 'Nếu thiếu doanh thu, kéo dữ liệu ADS lại trước khi quyết định.'
    },
    profit_after_ads: {
      title: 'Lãi sau ADS',
      explain: 'Lãi còn lại sau khi trừ giá vốn và chi phí quảng cáo theo dữ liệu chuẩn.',
      meaning: ['Lãi dương ổn định', 'Lãi thấp sát ngưỡng', 'Lãi âm'],
      action: 'Không tăng ngân sách khi lãi âm hoặc thiếu giá vốn.'
    },
    stock: {
      title: 'Tồn kho',
      explain: 'Số lượng còn lại dùng để quyết định có nên tăng ADS hay không.',
      meaning: ['Còn đủ hàng', 'Sắp hết hàng', 'Hết hoặc tồn quá thấp'],
      action: 'Dừng tăng ADS nếu tồn thấp; đẩy ADS cho SKU tồn cao nhưng còn hiệu quả.'
    },
    cost: {
      title: 'Giá vốn',
      explain: 'Giá vốn lấy từ Product/Warehouse Core để tính lãi sau ADS.',
      meaning: ['Có giá vốn rõ', 'Giá vốn cũ cần kiểm', 'Thiếu giá vốn'],
      action: 'Bổ sung giá vốn ở Nhập hàng/Product Master trước khi tự động tăng ADS.'
    },
    recommendation: {
      title: 'Khuyến nghị',
      explain: 'Khuyến nghị vận hành được đọc từ dữ liệu ADS, sản phẩm, tồn kho và tài chính.',
      meaning: ['Giữ hoặc tăng ADS', 'Theo dõi thêm', 'Giảm hoặc tạm dừng'],
      action: 'Bấm hành động riêng trên từng dòng để xem hoặc xử lý.'
    },
    sku_action: {
      title: 'Hành động SKU',
      explain: 'Nút hành động là bước vận hành an toàn cho SKU hoặc campaign đang được chọn.',
      meaning: ['Dữ liệu đủ để xử lý', 'Cần xem thêm', 'Thiếu dữ liệu hoặc bị chặn'],
      action: 'Luôn xem trước thay đổi trước khi áp dụng lên sàn.'
    },
    need_stop: {
      title: 'Không hiệu quả',
      explain: 'Campaign đang chi tiền nhưng không tạo hiệu quả đủ tốt.',
      meaning: ['Không còn nằm trong nhóm này', 'ROAS thấp', 'Lãi âm hoặc không có doanh thu'],
      action: 'Tạm dừng hoặc giảm ngân sách sau khi xem trước.'
    },
    need_reduce: {
      title: 'Cần giảm ADS',
      explain: 'Hiệu quả chưa đủ để giữ mức chi hiện tại.',
      meaning: ['ROAS cải thiện', 'ROAS dưới ngưỡng tốt', 'Chi tăng mà doanh thu không tăng'],
      action: 'Giảm nhẹ ngân sách và theo dõi lại.'
    },
    missing_cost: {
      title: 'Thiếu giá vốn',
      explain: 'Chưa có giá vốn đủ tin cậy nên không thể chốt lãi sau ADS.',
      meaning: ['Đã có giá vốn', 'Giá vốn cần kiểm', 'Thiếu giá vốn'],
      action: 'Cập nhật giá vốn trước khi bật tự động tăng ngân sách.'
    },
    low_stock: {
      title: 'Sắp hết hàng',
      explain: 'Tồn kho thấp nên tăng ADS có thể làm hết hàng nhanh.',
      meaning: ['Tồn đủ', 'Tồn thấp', 'Gần hết hàng'],
      action: 'Giảm hoặc giữ ADS, ưu tiên nhập thêm hàng.'
    },
    high_stock: {
      title: 'Tồn nhiều',
      explain: 'SKU còn nhiều hàng, có thể cân nhắc đẩy ADS nếu hiệu quả tốt.',
      meaning: ['Tồn cao và ROAS tốt', 'Tồn cao nhưng ROAS yếu', 'Tồn cao và lãi âm'],
      action: 'Chỉ tăng ngân sách khi ROAS và lãi sau ADS còn tốt.'
    },
    increase: {
      title: 'Nên tăng ADS',
      explain: 'SKU có hiệu quả tốt và còn điều kiện an toàn để tăng ngân sách.',
      meaning: ['ROAS tốt, còn lãi, còn tồn', 'Một chỉ số đang yếu', 'Thiếu giá vốn hoặc lãi âm'],
      action: 'Tăng theo giới hạn an toàn, không vượt trần ngân sách.'
    },
    negative_profit: {
      title: 'Lãi âm',
      explain: 'Sau khi trừ giá vốn và ADS, SKU đang không còn lãi.',
      meaning: ['Lãi dương', 'Lãi thấp', 'Lãi âm'],
      action: 'Dừng hoặc giảm ADS, kiểm tra giá vốn và khuyến mãi.'
    },
    keep_ads: {
      title: 'Giữ ADS',
      explain: 'SKU vẫn đang có hiệu quả đủ để tiếp tục theo dõi.',
      meaning: ['Hiệu quả ổn', 'Có dấu hiệu giảm', 'Chuyển sang lãi âm'],
      action: 'Giữ ngân sách hiện tại và xem lại ở lần đồng bộ sau.'
    }
  }

  function helpIcon(key, tone = '') {
    return `<button type="button" class="ads-help-icon ${rawEsc(tone)}" onclick="openUserHelp('${rawEsc(key)}', event)" aria-label="Giải thích ${esc(key)}" tabindex="-1">?</button>`
  }

  function helpLabel(label, key, tone = '') {
    return `<span class="ads-help-label"><span>${esc(label)}</span>${helpIcon(key, tone)}</span>`
  }

  function closeUserHelp() {
    el('adsUserHelpHost')?.remove()
  }

  function openUserHelp(key, event) {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    const item = ADS_HELP_ITEMS[key]
    if (!item) return
    closeUserHelp()
    const host = document.createElement('div')
    const isMobile = window.matchMedia('(max-width: 680px)').matches
    host.id = 'adsUserHelpHost'
    host.className = `ads-help-host ${isMobile ? 'mobile' : ''}`
    const rect = event?.currentTarget?.getBoundingClientRect?.()
    const left = rect ? Math.min(window.innerWidth - 340, Math.max(12, rect.left - 18)) : 24
    const top = rect ? Math.min(window.innerHeight - 360, Math.max(12, rect.bottom + 8)) : 80
    const style = isMobile ? '' : `style="left:${Math.round(left)}px;top:${Math.round(top)}px"`
    host.innerHTML = `
      <div class="ads-help-shade" onclick="closeUserHelp()"></div>
      <section class="ads-help-popover" ${style} role="dialog" aria-modal="true" aria-label="${esc(item.title)}" onclick="event.stopPropagation()">
        <header><b>${esc(item.title)}</b><button type="button" onclick="closeUserHelp()" aria-label="Đóng">×</button></header>
        <div class="ads-help-body">
          <p>${esc(item.explain)}</p>
          <dl>
            <div><dt>Tốt khi</dt><dd>${esc(item.meaning?.[0] || 'Số liệu đang hỗ trợ quyết định vận hành.')}</dd></div>
            <div><dt>Cần chú ý khi</dt><dd>${esc(item.meaning?.[1] || 'Số liệu thay đổi bất thường.')}</dd></div>
            <div><dt>Xấu khi</dt><dd>${esc(item.meaning?.[2] || 'Số liệu làm tăng rủi ro bán lỗ hoặc hết hàng.')}</dd></div>
          </dl>
          <p><b>Bạn nên làm gì:</b> ${esc(item.action)}</p>
        </div>
        <footer>
          ${item.quick ? `<button type="button" class="ads-user-btn ghost" onclick="${rawEsc(item.quick.action)}; closeUserHelp()">${esc(item.quick.label)}</button>` : ''}
          <button type="button" class="ads-user-btn primary" onclick="closeUserHelp()">Tôi hiểu</button>
        </footer>
      </section>
    `
    document.body.appendChild(host)
  }

  function money(value) {
    const n = Number(value || 0)
    return `${Math.round(n).toLocaleString('vi-VN')}đ`
  }

  function number(value, digits = 0) {
    const n = Number(value || 0)
    return n.toLocaleString('vi-VN', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    })
  }

  function todayText(offsetDays = 0) {
    const d = new Date(Date.now() + offsetDays * 86400000)
    return d.toISOString().slice(0, 10)
  }

  function storageKey() {
    return 'shophuyvan_ads_user_settings_v1'
  }

  function loadSettings() {
    const fallback = {
      roas_target: '5.0',
      good_roas: '5.0',
      minimum_roas: '2.5',
      high_acos: '25%',
      negative_profit: '0đ',
      low_stock: '20',
      high_stock: '500',
      minimum_runtime_hours: '2',
      minimum_runtime_minutes: '0',
      minimum_ads_spend: '50000',
      minimum_stock_for_budget: '30',
      require_cost_for_budget: true,
      require_positive_profit_for_budget: true,
      good_budget_increase_percent: '10',
      max_budget_increase_per_day: '2',
      max_campaign_daily_budget: '300000',
      max_shop_daily_budget: '2000000',
      medium_action: 'keep',
      medium_budget_decrease_percent: '10',
      auto_resume_enabled: true,
      resume_roas_multiplier: '1.3',
      resume_stock_multiplier: '2',
      max_resume_per_day: '2',
      poor_retry_action: 'pause_until_tomorrow',
      missing_data_action: 'watch',
      automation_enabled: false,
      emergency_stop: false,
      dry_run_mode: 1,
      max_campaigns_per_run: '10',
      max_budget_increase_pct: '30',
      max_budget_decrease_pct: '30',
      require_admin_confirm_above_pct: '50',
      schedules: [
        { id: 'morning', days: [1, 2, 3, 4, 5, 6], from: '08:00', to: '11:30', enabled: true },
        { id: 'evening', days: [1, 2, 3, 4, 5, 6, 0], from: '19:00', to: '22:30', enabled: true }
      ],
      missing_cost_alert: true,
      auto_recommendation: true,
      notification: true
    }
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey()) || '{}')
      const hasSavedRoasTarget = Object.prototype.hasOwnProperty.call(saved, 'roas_target')
      state.settings = { ...fallback, ...saved }
      if (!hasSavedRoasTarget && saved.good_roas) state.settings.roas_target = saved.good_roas
      state.settings.roas_target = state.settings.roas_target || state.settings.good_roas || fallback.roas_target
    } catch {
      state.settings = fallback
    }
  }

  function saveSettings() {
    localStorage.setItem(storageKey(), JSON.stringify(state.settings || {}))
  }

  let _saveTimer = null
  let _remoteSaveTimer = null

  function debouncedSave() {
    clearTimeout(_saveTimer)
    _saveTimer = setTimeout(() => saveSettings(), 400)
  }

  function debouncedRemoteSave() {
    clearTimeout(_remoteSaveTimer)
    _remoteSaveTimer = setTimeout(() => saveAdsAutomationSettings().catch(() => {}), 500)
  }

  function normalizeSchedule(row = {}, index = 0) {
    const defaultDays = [1, 2, 3, 4, 5, 6, 0]
    const days = Array.isArray(row.days) && row.days.length
      ? row.days.map(day => Number(day)).filter(day => defaultDays.includes(day))
      : defaultDays
    return {
      id: row.id || `slot_${index}`,
      days: days.length ? days : defaultDays,
      from: row.from || '08:00',
      to: row.to || '09:00',
      enabled: row.enabled !== false
    }
  }

  function scheduleRows() {
    const rows = Array.isArray(state.settings.schedules) ? state.settings.schedules : []
    return rows.map(normalizeSchedule)
  }

  function validateSchedules() {
    const rows = scheduleRows().filter(row => row.enabled !== false)
    const errors = []
    for (const row of rows) {
      if (!row.from || !row.to) errors.push('Khung giờ không được để trống.')
      if (row.from && row.to && row.to <= row.from) errors.push('Giờ kết thúc phải lớn hơn giờ bắt đầu.')
      if (!Array.isArray(row.days) || !row.days.length) errors.push('Khung giờ phải chọn ít nhất một ngày trong tuần.')
    }
    rows.forEach((row, index) => {
      rows.slice(index + 1).forEach(next => {
        const sameDay = (row.days || []).some(day => (next.days || []).includes(day))
        if (sameDay && row.from < next.to && next.from < row.to) errors.push('Không được lưu khung giờ trùng nhau.')
      })
    })
    return [...new Set(errors)]
  }

  function settingValue(key, fallback = '') {
    return state.settings?.[key] ?? fallback
  }

  function updateSettingValue(key, value) {
    state.settings[key] = value
    if (key === 'roas_target') state.settings.good_roas = value
    if (key === 'good_roas' && !state.settings.roas_target) state.settings.roas_target = value
    debouncedSave()
  }

  function qs() {
    const query = new URLSearchParams()
    const from = el('filterFrom')?.value || ''
    const to = el('filterTo')?.value || ''
    const platform = state.filters.platform || el('adsPlatform')?.value || ''
    const shop = state.filters.shop || el('adsShop')?.value || ''
    if (from) query.set('from', from)
    if (to) query.set('to', to)
    if (platform) query.set('platform', platform)
    if (shop) query.set('shop', shop)
    return query.toString()
  }

  function trendQs() {
    const query = new URLSearchParams()
    const to = el('filterTo')?.value || todayText()
    const platform = state.filters.platform || el('adsPlatform')?.value || ''
    const shop = state.filters.shop || el('adsShop')?.value || ''
    query.set('from', dateText(addDays(parseDateText(to) || new Date(), -6)))
    query.set('to', to)
    query.set('limit', '50')
    if (platform) query.set('platform', platform)
    if (shop) query.set('shop', shop)
    return query.toString()
  }

  async function apiGet(path) {
    const separator = path.includes('?') ? '&' : '?'
    let res
    try {
      res = await fetch(`${API_BASE}${path}${separator}_ads_ts=${Date.now()}`, { cache: 'no-store' })
    } catch (error) {
      throw new Error(friendlyFetchError(error, 'Không tải được dữ liệu ADS'))
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(fmtText(data.message || data.error || `Không tải được dữ liệu ADS (${res.status})`))
    return data
  }

  async function apiPost(path, bodyData = {}) {
    let res
    try {
      res = await fetch(API_BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(bodyData)
      })
    } catch (error) {
      throw new Error(friendlyFetchError(error, 'Thao tác ADS chưa chạy được'))
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(fmtText(data.message || data.error || `Thao tác ADS chưa chạy được (${res.status})`))
    return data
  }

  function friendlyFetchError(error, prefix) {
    const text = error?.message || ''
    if (/Failed to fetch|NetworkError|Load failed/i.test(text)) {
      return `${prefix}. Vui lòng bấm Làm mới. Nếu vẫn lỗi, kiểm tra kết nối hoặc đăng nhập lại.`
    }
    return fmtText(text || `${prefix}. Vui lòng bấm Làm mới.`)
  }

  function toast(message, tone = 'ok') {
    let host = el('adsUserToastHost')
    if (!host) {
      host = document.createElement('div')
      host.id = 'adsUserToastHost'
      host.className = 'ads-user-toast-host'
      document.body.appendChild(host)
    }
    const item = document.createElement('div')
    item.className = `ads-user-toast ${tone}`
    item.textContent = fmtText(message)
    host.appendChild(item)
    setTimeout(() => item.remove(), 5200)
  }

  function statusLabel(value) {
    if (value === 'good' || value === 'keep_ads') return 'Đang hiệu quả'
    if (value === 'danger' || value === 'need_stop') return 'Không hiệu quả'
    if (value === 'watch' || value === 'need_reduce') return 'ROAS thấp'
    if (value === 'missing_cost') return 'Thiếu giá vốn'
    if (value === 'low_stock') return 'Sắp hết hàng'
    return 'Thiếu dữ liệu'
  }

  function problemLabel(row = {}) {
    const recommendation = row.recommendation || row.status || ''
    const spend = Number(row.ads_spend ?? row.spend ?? 0)
    const revenue = Number(row.ads_revenue ?? row.revenue ?? 0)
    const roas = Number(row.roas || 0)
    if (row.cost_status === 'missing' || row.current_cost === null || row.current_cost === undefined) return 'Thiếu giá vốn'
    if (Number(row.profit_after_ads || 0) < 0) return 'Lãi âm'
    if (recommendation === 'low_stock' || Number(row.current_stock || 0) <= 20) return 'Sắp hết hàng'
    if (recommendation === 'need_stop') return 'Không hiệu quả'
    if (recommendation === 'need_reduce') return roas <= 0 || revenue <= 0 ? 'Không hiệu quả' : 'ROAS thấp'
    if (recommendation === 'insufficient_data') {
      if (spend > 0 && revenue <= 0) return 'Thiếu doanh thu ADS'
      return 'Thiếu dữ liệu'
    }
    if (Number(row.current_stock || 0) >= 500) return 'Tồn nhiều'
    if (recommendation === 'keep_ads') return roas >= 5 ? 'Đang tốt' : 'Đang hiệu quả'
    return statusLabel(recommendation)
  }

  function actionForRow(row = {}) {
    const recommendation = row.recommendation || row.status || ''
    const spend = Number(row.ads_spend ?? row.spend ?? 0)
    const revenue = Number(row.ads_revenue ?? row.revenue ?? 0)
    if (row.cost_status === 'missing' || row.current_cost === null || row.current_cost === undefined) return 'Kiểm giá vốn'
    if (recommendation === 'low_stock' || Number(row.current_stock || 0) <= 20) return 'Kiểm tồn kho'
    if (recommendation === 'need_stop' || Number(row.profit_after_ads || 0) < 0) return 'Tạm dừng'
    if (recommendation === 'need_reduce' || (spend > 0 && revenue <= 0)) return 'Giảm ngân sách'
    if (recommendation === 'insufficient_data') return 'Chưa đủ dữ liệu'
    if (recommendation === 'keep_ads') return 'Giữ ADS'
    return 'Xem'
  }

  function problemTone(row = {}) {
    const label = problemLabel(row)
    if (['Không hiệu quả', 'Lãi âm'].includes(label)) return 'danger'
    if (['ROAS thấp', 'Thiếu giá vốn', 'Sắp hết hàng', 'Tồn nhiều', 'Thiếu doanh thu ADS', 'Thiếu dữ liệu'].includes(label)) return 'watch'
    if (['Đang tốt', 'Đang hiệu quả'].includes(label)) return 'good'
    return 'neutral'
  }

  function rowClass(row = {}) {
    const tone = problemTone(row)
    if (tone === 'danger') return 'row-danger'
    if (tone === 'watch') return 'row-watch'
    if (tone === 'good') return 'row-good'
    return ''
  }

  function emptyState(message, action = '') {
    return `<div class="ads-empty-state"><div class="ads-empty-icon">ADS</div><p>${esc(message)}</p>${action ? `<button type="button" class="ads-user-btn primary" onclick="${rawEsc(action)}">Tải dữ liệu</button>` : ''}</div>`
  }

  function actionTone(row = {}) {
    const label = actionForRow(row)
    if (label === 'Tạm dừng') return 'danger'
    if (['Giảm ngân sách', 'Kiểm giá vốn', 'Kiểm tồn kho'].includes(label)) return 'watch'
    if (['Giữ ADS', 'Bật lại'].includes(label)) return 'good'
    return 'neutral'
  }

  function recommendationTone(row = {}) {
    const key = row.recommendation || row.status
    if (['need_stop', 'danger', 'negative_profit'].includes(key)) return 'danger'
    if (['need_reduce', 'missing_cost', 'low_stock', 'watch'].includes(key)) return 'watch'
    if (['keep_ads', 'good'].includes(key)) return 'good'
    return 'neutral'
  }

  function rows() {
    const q = (state.filters.query || '').toLowerCase()
    const status = state.filters.status || ''
    return (state.data.product_performance || []).filter(row => {
      const haystack = [row.product_name, row.sku_id, row.seller_sku, row.internal_sku, row.shop, row.platform]
        .map(value => String(value || '').toLowerCase())
        .join(' ')
      if (q && !haystack.includes(q)) return false
      if (!status) return true
      if (status === 'stop') return row.recommendation === 'need_stop' || Number(row.profit_after_ads || 0) < 0
      if (status === 'reduce') return row.recommendation === 'need_reduce'
      if (status === 'increase') return row.recommendation === 'keep_ads' && Number(row.roas || 0) >= 5
      if (status === 'good') return row.recommendation === 'keep_ads'
      if (status === 'negative') return Number(row.profit_after_ads || 0) < 0
      if (status === 'missing_cost') return row.cost_status === 'missing' || row.current_cost === null
      if (status === 'low_stock') return row.recommendation === 'low_stock' || Number(row.current_stock || 0) <= 20
      if (status === 'high_stock') return Number(row.current_stock || 0) >= 500
      if (status === 'missing_data') return row.recommendation === 'insufficient_data'
      return true
    })
  }

  function taskCards() {
    const cards = state.data.decision_cards || []
    const extra = [
      { key: 'increase', label: 'Nên tăng ADS', count: rows().filter(row => row.recommendation === 'keep_ads' && Number(row.roas || 0) >= 5).length, description: 'ROAS tốt, còn lãi' },
      { key: 'high_stock', label: 'Tồn nhiều cần đẩy', count: rows().filter(row => Number(row.current_stock || 0) >= 500).length, description: 'Tồn kho cao' },
      { key: 'missing_data', label: 'Thiếu dữ liệu', count: rows().filter(row => row.recommendation === 'insufficient_data').length, description: 'Cần kéo thêm số liệu' }
    ]
    return [...cards, ...extra]
  }

  function helpKeyForDecision(key = '') {
    const map = {
      need_stop: 'need_stop',
      need_reduce: 'need_reduce',
      missing_cost: 'missing_cost',
      low_stock: 'low_stock',
      high_stock: 'high_stock',
      increase: 'increase',
      negative_profit: 'negative_profit'
    }
    return map[key] || 'sku_action'
  }

  function helpKeyForMetric(label = '') {
    const text = String(label).toLowerCase()
    if (text.includes('roas')) return 'roas'
    if (text.includes('acos')) return 'acos'
    if (text.includes('doanh')) return 'ads_revenue'
    if (text.includes('chi')) return 'ads_spend'
    if (text.includes('lãi')) return 'profit_after_ads'
    if (text.includes('tồn')) return 'stock'
    if (text.includes('giá vốn')) return 'cost'
    if (text.includes('sku')) return 'sku_action'
    return 'recommendation'
  }

  function helpKeyForRecommendation(row = {}) {
    const key = row.recommendation || row.status
    if (key === 'need_stop') return 'need_stop'
    if (key === 'need_reduce') return 'need_reduce'
    if (key === 'missing_cost' || row.cost_status === 'missing' || row.current_cost === null) return 'missing_cost'
    if (key === 'low_stock') return 'low_stock'
    if (key === 'keep_ads' && Number(row.roas || 0) >= 5) return 'increase'
    if (key === 'keep_ads') return 'keep_ads'
    if (Number(row.profit_after_ads || 0) < 0) return 'negative_profit'
    return 'recommendation'
  }

  function renderFilters() {
    const shops = state.data.ads_shop_status || state.data.shops || []
    const shopOptions = ['<option value="">Tất cả shop</option>']
    for (const shop of shops) {
      const name = shop.shop || shop.shop_name || shop.user_name || shop.api_shop_id || ''
      if (!name) continue
      shopOptions.push(`<option value="${esc(name)}">${esc(name)}</option>`)
    }
    const shopSelect = el('adsShop')
    if (shopSelect) {
      const current = shopSelect.value
      shopSelect.innerHTML = shopOptions.join('')
      shopSelect.value = current
    }
  }

  function renderSummary() {
    const summary = state.data.summary || {}
    const decision = state.data.decision_summary || {}
    el('adsTodayWork').innerHTML = taskCards().map(card => `
      <button class="ads-user-task ${esc(card.key)}" type="button" onclick="filterAdsDecision('${esc(card.key)}')">
        <b>${number(card.count || 0)}</b><strong>${esc(card.label)}</strong><small>${esc(card.description)}</small>
      </button>
    `).join('')
    el('adsKpiGrid').innerHTML = [
      ['Chi ADS', money(summary.ads_spend), 'So với doanh thu và lãi', 'watch'],
      ['Doanh thu ADS', money(summary.revenue), 'Ghi nhận từ sàn', 'good'],
      ['ROAS TB', `${number(summary.roas, 2)}×`, `Tốt từ ${number(settingValue('good_roas', 4), 1)}×`, Number(summary.roas || 0) >= Number(settingValue('good_roas', 4)) ? 'good' : 'watch'],
      ['Lãi sau ADS', money(rows().reduce((sum, row) => sum + Number(row.profit_after_ads || 0), 0)), `${number(summary.sku_action_count || decision.sku_action_count || 0)} SKU cần xử lý`, rows().some(row => Number(row.profit_after_ads || 0) < 0) ? 'danger' : 'good']
    ].map(([label, value, sub, tone]) => `
      <article class="ads-user-kpi featured ${esc(tone)}">
        <span>${esc(label)}</span><b class="ads-num">${esc(value)}</b><small>${esc(sub)}</small>
      </article>
    `).join('')
  }

  function classificationRows() {
    const all = rows()
    return [
      ['Hiệu quả', all.filter(row => row.recommendation === 'keep_ads' && Number(row.roas || 0) >= Number(settingValue('good_roas', 5))).length, 'Có thể tăng ngân sách'],
      ['Trung bình', all.filter(row => row.recommendation === 'keep_ads' && Number(row.roas || 0) < Number(settingValue('good_roas', 5))).length, 'Giữ nguyên, theo dõi'],
      ['Không hiệu quả', all.filter(row => row.recommendation === 'need_stop' || row.recommendation === 'need_reduce' || Number(row.profit_after_ads || 0) < 0).length, 'Cần giảm hoặc tạm dừng'],
      ['Thiếu dữ liệu', all.filter(row => row.recommendation === 'insufficient_data' || row.cost_status === 'missing' || row.current_cost === null).length, 'Bổ sung giá vốn/dữ liệu']
    ]
  }

  function classificationTable() {
    return `
      <div class="ads-classification-table">
        ${classificationRows().map(([label, count, action]) => `
          <div><span>${esc(label)}</span><b class="ads-num">${number(count)}</b><em>${esc(action)}</em></div>
        `).join('')}
      </div>
    `
  }

  function parseDateText(value) {
    const text = String(value || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
    const date = new Date(`${text}T00:00:00`)
    return Number.isNaN(date.getTime()) ? null : date
  }

  function dateText(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function addDays(date, offset) {
    const next = new Date(date)
    next.setDate(next.getDate() + Number(offset || 0))
    return next
  }

  function trendDays(daily = []) {
    const byDay = new Map()
    for (const item of daily) {
      const key = String(item.day || item.date || '').slice(0, 10)
      if (key) byDay.set(key, item)
    }
    const last = daily[daily.length - 1] || {}
    const lastDay = String(last.day || last.date || '').slice(0, 10)
    const end = parseDateText(lastDay) || parseDateText(el('filterTo')?.value) || new Date()
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(end)
      day.setDate(end.getDate() - (6 - index))
      const key = dateText(day)
      const item = byDay.get(key)
      return {
        day: key,
        hasData: Boolean(item),
        ads_spend: item ? Number(item.ads_spend || 0) : 0,
        revenue: item ? Number(item.revenue || item.ads_revenue || 0) : 0
      }
    })
  }

  function automationStatusCard(showActions = true) {
    const last = state.lastRun || {}
    const autoOn = Boolean(state.settings.automation_enabled) && !state.settings.emergency_stop
    return `
      <div class="ads-automation-status-card">
        <span class="ads-user-pill ${autoOn ? 'good' : state.settings.emergency_stop ? 'danger' : 'neutral'}">${autoOn ? 'Đang bật' : state.settings.emergency_stop ? 'Tắt khẩn cấp' : 'Đang tắt'}</span>
        <h3>Tự động ADS</h3>
        <p>${autoOn ? 'Chạy theo khung giờ đã lưu, kiểm tra mỗi 15 phút.' : 'Chưa tự thay đổi ADS.'}</p>
        <dl>
          <div><dt>Lần chạy cuối</dt><dd>${esc(last.created_at || '-')}</dd></div>
          <div><dt>Đã gửi/readback</dt><dd class="ads-num">${number(last.actions_executed || 0)}</dd></div>
          <div><dt>Giữ nguyên/chờ</dt><dd class="ads-num">${number(last.actions_skipped || 0)}</dd></div>
          <div><dt>Lỗi</dt><dd class="ads-num">${number(last.errors || 0)}</dd></div>
        </dl>
        ${showActions ? `<div class="ads-user-row-actions">
          <button type="button" class="ads-user-btn primary" onclick="runAdsAutomationCheck()">Chạy ngay</button>
          <button type="button" class="ads-user-btn danger" onclick="emergencyStopAdsAutomation()">Tắt khẩn cấp</button>
        </div>` : ''}
      </div>
    `
  }

  function renderOverview() {
    const topRows = rows().slice(0, 6)
    const trend = trendDays(state.trendDaily?.length ? state.trendDaily : (state.data.daily || []))
    const trendDataDays = trend.filter(item => item.hasData).length
    const trendMaxSpend = Math.max(...trend.map(item => Number(item.ads_spend || 0)), 1)
    const promoRows = rows().filter(row => Number(row.current_promotion_price || 0) > 0 || row.promotion_status === 'active')
    el('adsOverviewTab').innerHTML = `
      <section class="ads-user-kpi-grid" id="adsKpiGrid"></section>
      <section class="ads-user-band">
        <div class="ads-user-section-title"><b>Việc cần làm hôm nay</b><span>${number(rows().length)} SKU trong danh sách</span></div>
        <div class="ads-user-task-grid" id="adsTodayWork"></div>
      </section>
      <section class="ads-overview-split">
        <div class="ads-user-panel">
          <div class="ads-user-section-title"><b>Xu hướng 7 ngày</b><span>${trendDataDays >= 7 ? 'Chi ADS và doanh thu' : `Có dữ liệu ${trendDataDays}/7 ngày`}</span></div>
          <div class="ads-user-trend">
            ${trend.map(item => `
              <div class="${item.hasData ? '' : 'ads-trend-missing'}">
                <span>${esc(item.day.slice(5))}</span>
                <i style="height:${item.hasData ? Math.max(10, Math.round((Number(item.ads_spend || 0) / trendMaxSpend) * 120)) : 6}px"></i>
                <b>${item.hasData ? money(item.ads_spend) : 'Chưa có'}</b>
              </div>
            `).join('')}
          </div>
          ${trendDataDays < 7 ? `<p class="ads-user-note">Đã gọi dữ liệu 7 ngày gần nhất nhưng Core chỉ trả ${number(trendDataDays)} ngày có snapshot ADS.</p>` : ''}
        </div>
        <div class="ads-user-panel">
          <div class="ads-user-section-title"><b>Top SKU ưu tiên</b><span>Ra quyết định nhanh</span></div>
          <div class="ads-user-priority-list">${topRows.map(productMini).join('') || emptyState('Chưa có SKU cần xử lý.', 'loadAdsDashboard()')}</div>
        </div>
      </section>
      <section class="ads-user-band">
        <div class="ads-user-section-title"><b>Ảnh hưởng khuyến mãi tới ADS</b><span>Chỉ tham chiếu hiệu quả quảng cáo</span></div>
        <div class="ads-user-kpi-grid compact">
          ${[
            ['SKU khuyến mãi có ADS', number(promoRows.length), 'Đang có chi phí quảng cáo'],
            ['SKU khuyến mãi lãi thấp', number(promoRows.filter(row => Number(row.profit_after_ads || 0) < 0 || row.recommendation === 'need_reduce').length), 'Cần giảm hoặc dừng ADS'],
            ['SKU sắp hết hàng đang chạy ADS', number(promoRows.filter(row => Number(row.current_stock || 0) <= 20).length), 'Rủi ro hết hàng'],
            ['SKU tồn cao nên đẩy ADS', number(promoRows.filter(row => Number(row.current_stock || 0) >= 500 && Number(row.roas || 0) >= 5).length), 'Còn dư tồn để tăng']
          ].map(([label, value, sub]) => `<article class="ads-user-kpi"><span>${esc(label)}</span><b class="ads-num">${esc(value)}</b><small>${esc(sub)}</small></article>`).join('')}
        </div>
      </section>
      <details class="ads-user-band">
        <summary class="ads-user-section-title"><b>Trạng thái shop và tự động</b><span>Mở khi cần kiểm vận hành</span></summary>
        <section class="ads-user-two-col decision">
          <div class="ads-user-panel">
            <div class="ads-user-section-title"><b>Phân loại hiệu quả hôm nay</b><button type="button" class="ads-user-btn ghost" onclick="showAdsUserTab('products')">Xem tất cả</button></div>
            ${classificationTable()}
          </div>
          <div class="ads-user-panel">${automationStatusCard()}</div>
        </section>
      </details>
    `
    renderSummary()
  }

  function productMini(row) {
    return `
      <article class="ads-user-mini-product">
        ${thumb(row)}
        <span><b>${esc(row.product_name || row.sku_id)}</b><small>${esc(row.seller_sku || row.internal_sku || row.sku_id)}</small></span>
        <span class="ads-user-mini-summary">Chi ADS ${money(row.ads_spend || row.spend)} · ROAS ${number(row.roas, 2)}</span>
        <span class="ads-user-mini-metrics ads-num"><small>Chi ADS</small><b>${money(row.ads_spend || row.spend)}</b></span>
        <span class="ads-user-mini-metrics ads-num"><small>Doanh thu</small><b>${money(row.ads_revenue || row.revenue)}</b></span>
        <span class="ads-user-mini-metrics ads-num"><small>ROAS</small><b>${number(row.roas, 2)}</b></span>
        <span class="ads-user-pill ${problemTone(row)}">${esc(problemLabel(row))}</span>
        <div class="ads-user-row-actions compact">${actionButtons(row, true)}</div>
      </article>
    `
  }

  function thumb(row) {
    const src = row.image_url || ''
    return src
      ? `<img class="ads-user-thumb" src="${esc(src)}" alt="">`
      : '<span class="ads-user-thumb empty">ADS</span>'
  }

  function productTable(rowSet = rows(), mode = 'products') {
    const cards = rowSet.map(row => `
      <article class="ads-user-product-card">
        <div class="ads-user-product-head">${thumb(row)}<div><b>${esc(row.product_name || row.sku_id)}</b><span>${esc(row.seller_sku || row.internal_sku || row.sku_id)}</span></div><em class="${problemTone(row)}">${esc(problemLabel(row))}</em></div>
        <div class="ads-user-mobile-metrics">
          <span>Tồn kho<b class="ads-num">${row.current_stock === null || row.current_stock === undefined ? '-' : number(row.current_stock)}</b></span>
          <span>Giá vốn<b class="ads-num">${row.current_cost === null || row.current_cost === undefined ? '-' : money(row.current_cost)}</b></span>
          <span>Chi ADS<b class="ads-num">${money(row.ads_spend || row.spend)}</b></span>
          <span>Doanh thu ADS<b class="ads-num">${money(row.ads_revenue || row.revenue)}</b></span>
          <span>Lãi sau ADS<b class="ads-num ${Number(row.profit_after_ads || 0) < 0 ? 'bad' : 'good'}">${row.profit_after_ads === null || row.profit_after_ads === undefined ? '-' : money(row.profit_after_ads)}</b></span>
          <span>${helpLabel('ROAS', 'roas')}<b class="ads-num">${number(row.roas, 2)}</b></span>
          <span>${helpLabel('ACOS', 'acos')}<b class="ads-num">${number(row.acos, 2)}%</b></span>
        </div>
        <span class="ads-user-pill ${actionTone(row)}">${esc(actionForRow(row))}</span>
        <p>${esc(row.recommendation_reason || 'Cần xem lại hiệu quả trong khoảng ngày đang chọn.')}</p>
        <div class="ads-user-row-actions">${actionButtons(row)}</div>
      </article>
    `).join('')
    const table = `
      <div class="ads-user-table-wrap">
        <table class="ads-user-table">
          <thead><tr>
            <th>Sản phẩm</th><th>SKU</th><th>Shop</th><th class="ads-num">Tồn</th><th class="ads-num">Chi ADS</th><th class="ads-num">${helpLabel('ROAS / ACOS', 'roas')}</th><th>Trạng thái</th><th>Hành động</th>
          </tr></thead>
          <tbody>${rowSet.map(row => `
            <tr class="${rowClass(row)}">
              <td><div class="ads-user-product-cell">${thumb(row)}<b>${esc(row.product_name || row.sku_id)}</b></div></td>
              <td>${esc(row.seller_sku || row.internal_sku || row.sku_id)}</td>
              <td>${esc(row.shop || '-')}</td>
              <td class="ads-num">${row.current_stock === null || row.current_stock === undefined ? '-' : number(row.current_stock)}</td>
              <td class="ads-num">${money(row.ads_spend || row.spend)}</td>
              <td class="ads-num"><div class="ads-metric-pair"><span>ROAS <b>${number(row.roas, 2)}</b></span><span>ACOS <b>${number(row.acos, 2)}%</b></span></div></td>
              <td>
                <div class="ads-product-status-stack">
                  <span class="ads-user-pill ${problemTone(row)}">${esc(problemLabel(row))}</span>
                  <span class="ads-user-pill ${actionTone(row)}">${esc(actionForRow(row))}</span>
                  <p>${esc(row.recommendation_reason || (row.profit_after_ads === null || row.profit_after_ads === undefined ? 'Thiếu lãi sau ADS để chốt quyết định.' : `Lãi sau ADS ${money(row.profit_after_ads)}`))}</p>
                </div>
              </td>
              <td><div class="ads-user-row-actions">${actionButtons(row)}</div></td>
            </tr>
          `).join('')}</tbody>
        </table>
      </div>`
    return rowSet.length
      ? `<div class="ads-user-mobile-list">${cards}</div>${table}`
      : emptyState('Chưa có sản phẩm phù hợp bộ lọc.', 'loadAdsDashboard()')
  }

  function actionButtons(row, compact = false) {
    const sku = esc(row.sku_id || row.seller_sku || row.internal_sku || '')
    const costUrl = `admin-purchase.html?query=${encodeURIComponent(row.internal_sku || row.seller_sku || row.sku_id || '')}`
    const action = actionForRow(row)
    const disabled = action === 'Chưa đủ dữ liệu'
    const actionClass = actionTone(row)
    const actionButton = action === 'Kiểm giá vốn'
      ? `<a class="ads-user-btn watch" href="${esc(costUrl)}">Kiểm giá vốn</a>`
      : `<button type="button" class="ads-user-btn ${esc(actionClass)}" ${disabled ? 'disabled' : ''} onclick="openAdsAdjustFromSku('${sku}')">${esc(action)}</button>`
    return `
      <button type="button" class="ads-user-btn ghost" onclick="viewAdsSku('${sku}')">Xem</button>
      ${compact ? '' : actionButton}
      ${compact ? actionButton : ''}
    `
  }

  function renderProducts() {
    const allRows = state.data.product_performance || []
    const groups = [
      ['stop', 'Cần dừng ADS', allRows.filter(row => row.recommendation === 'need_stop').length],
      ['reduce', 'Cần giảm ADS', allRows.filter(row => row.recommendation === 'need_reduce').length],
      ['increase', 'Nên tăng ADS', allRows.filter(row => row.recommendation === 'keep_ads' && Number(row.roas || 0) >= 5).length],
      ['good', 'Đang hiệu quả', allRows.filter(row => row.recommendation === 'keep_ads').length],
      ['negative', 'Lãi âm', allRows.filter(row => Number(row.profit_after_ads || 0) < 0).length],
      ['missing_cost', 'Thiếu giá vốn', allRows.filter(row => row.cost_status === 'missing' || row.current_cost === null).length],
      ['low_stock', 'Sắp hết hàng', allRows.filter(row => row.recommendation === 'low_stock' || Number(row.current_stock || 0) <= 20).length],
      ['high_stock', 'Tồn nhiều cần đẩy', allRows.filter(row => Number(row.current_stock || 0) >= 500).length],
      ['missing_data', 'Thiếu dữ liệu', allRows.filter(row => row.recommendation === 'insufficient_data').length]
    ]
    const groupCards = groups.map(([key, label, count]) => `<button type="button" onclick="setAdsStatus('${esc(key)}')"><b>${number(count)}</b><span>${esc(label)}</span></button>`).join('')
    el('adsProductsTab').innerHTML = `
      <section class="ads-user-band"><div class="ads-user-section-title"><b>Nhóm cần xử lý</b><span>Bấm để lọc nhanh</span></div><div class="ads-user-group-grid">${groupCards}</div></section>
      <section class="ads-user-panel"><div class="ads-user-section-title"><b>Cần xử lý</b><span>${number(rows().length)} dòng</span></div>${productTable()}</section>
    `
  }

  function capabilityRows() {
    return Array.isArray(state.overview.capabilities) ? state.overview.capabilities : []
  }

  function selectedCapability() {
    const shop = el('adsAdjustShop')?.value || ''
    const rows = capabilityRows()
    const filterPlatform = state.filters.platform || el('adsPlatform')?.value || ''
    if (shop) return rows.find(item => item.shop === shop) || rows[0] || null
    if (filterPlatform) return rows.find(item => item.platform === filterPlatform && item.supports_ads_guard_apply) || rows.find(item => item.platform === filterPlatform) || rows[0] || null
    return rows.find(item => item.platform === 'shopee' && item.supports_ads_guard_apply) ||
      rows.find(item => item.supports_ads_guard_apply) ||
      rows[0] ||
      null
  }

  function renderAdjust() {
    const errors = validateSchedules()
    const autoOn = Boolean(state.settings.automation_enabled) && !state.settings.emergency_stop
    const pausedRows = campaignRows(state.catalog || []).filter(row => /pause|paused|offline|disable|disabled|0/i.test(String(row.status || ''))).slice(0, 6)
    const recentLogs = (state.logs || []).slice(0, 6)
    el('adsAdjustTab').innerHTML = `
      <section class="ads-rule-hero ads-user-band">
        <div>
          <span class="ads-user-pill ${autoOn ? 'good' : state.settings.emergency_stop ? 'danger' : 'neutral'}">${autoOn ? 'Tự động đang bật' : state.settings.emergency_stop ? 'Đang tắt khẩn cấp' : 'Tự động đang tắt'}</span>
          <h2>Cài đặt ADS</h2>
          <p>Hệ thống chỉ tăng ngân sách khi ROAS tốt, còn lãi, còn tồn và có giá vốn. Campaign kém sẽ tạm dừng theo giới hạn an toàn.</p>
        </div>
        <div class="ads-rule-actions">
          <button type="button" class="ads-user-btn good" onclick="toggleAdsSetting('automation_enabled')">${autoOn ? 'Tắt tự động' : 'Bật tự động'}</button>
          <button type="button" class="ads-user-btn primary" onclick="runAdsAutomationCheck()">Chạy kiểm tra ngay</button>
          <button type="button" class="ads-user-btn danger" onclick="emergencyStopAdsAutomation()">Tắt khẩn cấp</button>
        </div>
      </section>
      ${errors.length ? `<section class="ads-user-note bad">${errors.map(esc).join('<br>')}</section>` : ''}
      <section class="ads-rules-flow">
        <div class="ads-rules-step full-width" data-step="BƯỚC 1 · KHUNG GIỜ">${ruleScheduleCard()}</div>
        <div class="ads-rules-step" data-step="BƯỚC 2 · ĐIỀU KIỆN">${ruleEvaluationCard()}</div>
        <div class="ads-rules-step" data-step="BƯỚC 3A · TĂNG NGÂN SÁCH">${ruleGoodCampaignCard()}</div>
        <div class="ads-rules-step" data-step="BƯỚC 3B · CÂN BẰNG">${ruleMediumCampaignCard()}</div>
        <div class="ads-rules-step full-width" data-step="BƯỚC 3C · DỪNG CAMPAIGN">${rulePoorCampaignCard()}</div>
        <div class="ads-rules-step" data-step="BƯỚC 4 · GIỚI HẠN AN TOÀN">${ruleSafetyCard()}</div>
        <div class="ads-rules-step" data-step="BƯỚC 4 · THIẾU DỮ LIỆU">${ruleMissingDataCard()}</div>
        <div class="ads-rules-step full-width" data-step="TRẠNG THÁI">${ruleStatusCard()}</div>
      </section>
      <section class="ads-user-band" style="margin-top:12px">${rulePausedCampaignCard(pausedRows)}${ruleRecentLogCard(recentLogs)}</section>
    `
  }

  function ruleStatusCard() {
    return `
      <div class="ads-user-section-title"><b>Trạng thái tự động</b><span>${state.settings.emergency_stop ? 'Đang khóa' : 'Sẵn sàng'}</span></div>
      <label class="ads-user-toggle-row"><span>Bật/Tắt tự động ADS</span>${toggleButton('automation_enabled')}</label>
      <div class="ads-rule-mode">
        <span>Chế độ chạy</span>
        <div class="ads-segmented" role="group" aria-label="Chế độ chạy ADS">
          ${segButton('dry_run_mode', '1', 'Thử nghiệm')}
          ${segButton('dry_run_mode', '0', 'Tự động')}
        </div>
      </div>
      ${automationStatusCard(false)}
    `
  }

  function dayButtons(row, index) {
    const labels = [[1, 'T2'], [2, 'T3'], [3, 'T4'], [4, 'T5'], [5, 'T6'], [6, 'T7'], [0, 'CN']]
    const selected = Array.isArray(row.days) ? row.days : [1, 2, 3, 4, 5, 6, 0]
    return `<div class="ads-day-picker">${labels.map(([day, label]) => `<button type="button" class="${selected.includes(day) ? 'active' : ''}" onclick="toggleAdsScheduleDay(${index}, ${day})">${label}</button>`).join('')}</div>`
  }

  function ruleScheduleCard() {
    return `
      <div class="ads-user-section-title"><b>Khung giờ chạy ADS</b><button type="button" class="ads-user-btn ghost" onclick="addAdsSchedule()">+ Thêm khung giờ</button></div>
      <div class="ads-schedule-list">
        ${scheduleRows().map((row, index) => `
          <div class="ads-schedule-row">
            ${dayButtons(row, index)}
            <label>Từ giờ<input type="time" value="${esc(row.from || '')}" onchange="updateAdsSchedule(${index}, 'from', this.value)"></label>
            <label>Đến giờ<input type="time" value="${esc(row.to || '')}" onchange="updateAdsSchedule(${index}, 'to', this.value)"></label>
            <label class="ads-user-toggle-row"><span>${row.enabled === false ? 'Tắt' : 'Bật'}</span>${toggleButton('', row.enabled !== false, `toggleAdsSchedule(${index})`)}</label>
            <button type="button" class="ads-user-btn danger" onclick="removeAdsSchedule(${index})">Xóa</button>
          </div>
        `).join('') || emptyState('Chưa có khung giờ. Bấm thêm khung giờ trước khi bật tự động.')}
      </div>
    `
  }

  function ruleEvaluationCard() {
    return `
      <div class="ads-user-section-title"><b>Điều kiện để tự động hành động</b><span>Chặn quyết định quá sớm</span></div>
      ${inputField('roas_target', 'ROAS mục tiêu áp dụng toàn bộ chiến dịch', 'x')}
      <p class="ads-user-note">ROAS mục tiêu này là chuẩn chung cho toàn bộ chiến dịch tự động. Campaign vượt mục tiêu mới được tăng ngân sách hoặc bật lại theo giới hạn an toàn.</p>
      ${inputField('minimum_runtime_hours', 'Chạy tối thiểu', 'giờ')}
      ${inputField('minimum_runtime_minutes', 'Thêm thời gian tối thiểu', 'phút')}
      ${inputField('minimum_ads_spend', 'Chi ADS tối thiểu', 'đ')}
      ${inputField('minimum_stock_for_budget', 'Tồn tối thiểu để tăng ngân sách', 'sản phẩm')}
      <label class="ads-user-toggle-row"><span>Bắt buộc có giá vốn để tự tăng ngân sách</span>${toggleButton('require_cost_for_budget')}</label>
      <label class="ads-user-toggle-row"><span>Bắt buộc lãi sau ADS dương để tự tăng ngân sách</span>${toggleButton('require_positive_profit_for_budget')}</label>
    `
  }

function inlineInput(key, suffix, width = '60px') {
    return `<span class="ads-inline-input-wrap"><input type="text" style="width: ${width};" value="${esc(settingValue(key))}" oninput="updateAdsSetting('${esc(key)}', this.value)"> <em>${esc(suffix)}</em></span>`;
  }

  function ruleGoodCampaignCard() {
    return `
      <div class="ads-rule-card modern-rule-card">
        <div class="ads-user-section-title"><b>📈 Tăng ngân sách (Campaign tốt)</b></div>
        <div class="ads-rule-condition-box">
          <span class="rule-badge">ĐIỀU KIỆN</span>
          <p>Sản phẩm có giá vốn, còn tồn kho, đang có lãi và ROAS đạt từ ${inlineInput('roas_target', 'trở lên', '40px')}.</p>
        </div>
        <div class="ads-rule-action-box action-increase">
          <span class="rule-badge action">HÀNH ĐỘNG</span>
          <p>Tự động tăng ${inlineInput('good_budget_increase_percent', '%', '40px')} ngân sách mỗi lần.</p>
          <p class="rule-limit">Tăng tối đa ${inlineInput('max_budget_increase_per_day', 'lần/ngày', '40px')}. Giới hạn trần không vượt quá ${inlineInput('max_campaign_daily_budget', 'đ/ngày', '90px')}.</p>
        </div>
      </div>
    `
  }

  function ruleMediumCampaignCard() {
    return `
      <div class="ads-rule-card modern-rule-card">
        <div class="ads-user-section-title"><b>⚖️ Cân bằng (Campaign trung bình)</b></div>
        <div class="ads-rule-condition-box">
          <span class="rule-badge">ĐIỀU KIỆN</span>
          <p>ROAS chưa đạt mức tốt, nhưng vẫn giữ được mức tối thiểu từ ${inlineInput('minimum_roas', 'trở lên', '40px')}.</p>
        </div>
        <div class="ads-rule-action-box action-neutral">
          <span class="rule-badge action">HÀNH ĐỘNG</span>
          <div class="ads-segmented" role="group" style="margin-bottom: 10px;">
            ${segButton('medium_action', 'keep', 'Chỉ giữ nguyên')}
            ${segButton('medium_action', 'reduce', 'Giảm nhẹ ngân sách')}
          </div>
          <p>Mức giảm ngân sách (nếu chọn giảm nhẹ) là ${inlineInput('medium_budget_decrease_percent', '%', '40px')} mỗi lần.</p>
        </div>
      </div>
    `
  }

  function rulePoorCampaignCard() {
    return `
      <div class="ads-rule-card modern-rule-card">
        <div class="ads-user-section-title"><b>Campaign không hiệu quả</b></div>
        <div class="ads-rule-condition-box">
          <span class="rule-badge">ĐIỀU KIỆN</span>
          <p>Chi tiêu đã cắn đủ ngưỡng, chạy đủ lâu nhưng lẹt đẹt doanh thu, lãi âm hoặc ROAS quá thấp.</p>
        </div>
        <div class="ads-rule-action-box action-decrease">
          <span class="rule-badge action">HÀNH ĐỘNG</span>
          <p>Tự động <b>Tạm dừng</b>. Cho phép hệ thống bật lại thử nghiệm tối đa ${inlineInput('max_resume_per_day', 'lần/ngày', '40px')}.</p>
          <div class="ads-resume-flow">
            <b>Bật lại sau khi tạm dừng</b>
            <label class="ads-user-toggle-row"><span>Cho phép tự bật lại campaign đã tạm dừng</span>${toggleButton('auto_resume_enabled')}</label>
            <span>Chỉ bật lại khi campaign đang tạm dừng, ROAS 7 ngày đạt ROAS mục tiêu x ${inlineInput('resume_roas_multiplier', 'lần', '40px')}, tồn kho đạt tối thiểu x ${inlineInput('resume_stock_multiplier', 'lần', '40px')} và còn lượt bật lại trong ngày.</span>
            <span>Nếu bật lại vẫn kém, hệ thống xử lý theo lựa chọn bên dưới.</span>
          </div>
          <div style="margin-top: 12px;">
            <p style="margin-bottom: 6px; font-size: 11px; color: #9fb3cc;">Nếu bật lại vẫn kém thì:</p>
            <div class="ads-segmented" role="group">
              ${segButton('poor_retry_action', 'pause_until_tomorrow', 'Dừng luôn đến mai')}
              ${segButton('poor_retry_action', 'operator_review', 'Để NV tự kiểm tra')}
            </div>
          </div>
        </div>
      </div>
    `
  }

  function ruleMissingDataCard() {
    return `
      <div class="ads-user-section-title"><b>Thiếu dữ liệu</b><span>Không tăng ngân sách</span></div>
      <p class="ads-user-note">Thiếu giá vốn, tồn kho, doanh thu ADS, thời gian chạy hoặc mức chi tối thiểu thì hệ thống không tự tăng ngân sách.</p>
      <div class="ads-segmented" role="group" aria-label="Hành động khi thiếu dữ liệu">
        ${segButton('missing_data_action', 'watch', 'Chỉ theo dõi')}
        ${segButton('missing_data_action', 'alert', 'Báo cần kiểm')}
      </div>
      <label class="ads-user-toggle-row"><span>Cảnh báo thiếu giá vốn</span>${toggleButton('missing_cost_alert')}</label>
      <label class="ads-user-toggle-row"><span>Khuyến nghị tự động</span>${toggleButton('auto_recommendation')}</label>
      <label class="ads-user-toggle-row"><span>Thông báo</span>${toggleButton('notification')}</label>
    `
  }

  function ruleSafetyCard() {
    return `
      <div class="ads-user-section-title"><b>Giới hạn an toàn</b><span>Không vượt trần</span></div>
      ${inputField('max_campaigns_per_run', 'Tối đa campaign thay đổi mỗi lần', 'campaign')}
      ${inputField('max_budget_increase_pct', 'Tối đa tăng ngân sách mỗi lần', '%')}
      ${inputField('max_budget_decrease_pct', 'Tối đa giảm ngân sách mỗi lần', '%')}
      ${inputField('max_shop_daily_budget', 'Ngân sách tối đa toàn shop', 'đ/ngày')}
      ${inputField('max_campaign_daily_budget', 'Ngân sách tối đa mỗi campaign', 'đ/ngày')}
      ${inputField('require_admin_confirm_above_pct', 'Thay đổi lớn hơn mức này thì chờ duyệt', '%')}
      ${inputField('max_budget_increase_per_day', 'Tăng ngân sách tối đa', 'lần/ngày')}
      ${inputField('max_resume_per_day', 'Bật lại tối đa', 'lần/ngày')}
    `
  }

  function rulePausedCampaignCard(rows) {
    return `
      <article class="ads-rule-card wide">
        <div class="ads-user-section-title"><b>Campaign đang bị tạm dừng</b><span>${number(rows.length)} mục gần nhất</span></div>
        ${rows.length ? `<div class="ads-rule-mini-list">${rows.map(row => `<span><b>${esc(row.campaign_name || row.product_name || row.campaign_id)}</b><em>${esc(row.shop || '-')} · ROAS ${number(row.roas, 2)}</em></span>`).join('')}</div>` : emptyState('Chưa có campaign tạm dừng trong danh sách hiện tại.')}
      </article>
    `
  }

  function capabilityOptions() {
    const rows = capabilityRows()
    if (!rows.length) return '<option value="">Chưa có shop đủ dữ liệu</option>'
    const selected = selectedCapability()?.shop || rows[0]?.shop || ''
    return rows.map(item => {
      const label = [String(item.platform || '').toUpperCase(), item.shop, item.supports_ads_guard_apply ? 'Có thể áp dụng' : 'Chỉ xem'].filter(Boolean).join(' · ')
      return `<option value="${esc(item.shop || '')}" ${String(item.shop || '') === String(selected) ? 'selected' : ''}>${esc(label)}</option>`
    }).join('')
  }

  function adsActionOptions(platform, scope) {
    if (platform === 'lazada') {
      return scope === 'adgroup'
        ? [['toggle_status', 'Bật/Tắt nhóm quảng cáo']]
        : [['toggle_status', 'Bật/Tắt chiến dịch'], ['change_budget', 'Đổi ngân sách']]
    }
    if (scope === 'keyword') return [['keyword_update', 'Đổi giá thầu từ khóa']]
    return [
      ['pause', 'Tạm dừng chiến dịch'],
      ['resume', 'Bật lại chiến dịch'],
      ['stop', 'Tắt ADS'],
      ['change_budget', 'Đổi ngân sách'],
      ['change_roas_target', 'Đổi ROAS toàn chiến dịch']
    ]
  }

  function manualAdjustmentCard() {
    const cap = selectedCapability()
    const platform = cap?.platform || 'shopee'
    const shop = cap?.shop || ''
    const actionOptions = adsActionOptions(platform, 'campaign')
    return `
      <section class="ads-user-band ads-manual-adjust-panel">
        <div class="ads-user-section-title">
          <b>Điều chỉnh chiến dịch thủ công</b>
          <span>Xem trước trước khi áp dụng lên sàn</span>
        </div>
        <div class="ads-user-two-col ads-manual-adjust-grid">
          <div class="ads-user-panel">
            <div class="ads-user-adjust-grid">
              <label>Gian hàng
                <select id="adsAdjustShop" onchange="loadAdsAdjustCatalog()">${capabilityOptions()}</select>
              </label>
              <input type="hidden" id="adsAdjustPlatform" value="${esc(platform)}">
              <label>Phạm vi
                <select id="adsAdjustScope" onchange="renderAdsActionOptions()">
                  <option value="campaign" selected>Toàn bộ chiến dịch</option>
                  <option value="adgroup">Nhóm quảng cáo</option>
                  <option value="keyword">Từ khóa</option>
                </select>
              </label>
              <label>Hành động
                <select id="adsAdjustAction" onchange="syncAdsAdjustDefaults()">
                  ${actionOptions.map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join('')}
                </select>
              </label>
              <label id="adsAdjustBudgetWrap" hidden>Ngân sách ngày
                <input id="adsAdjustBudget" type="number" min="0" step="1000" inputmode="numeric" placeholder="Nhập ngân sách mới">
              </label>
              <label id="adsAdjustRoasWrap" hidden>ROAS mục tiêu toàn chiến dịch
                <input id="adsAdjustRoas" type="number" min="0" step="0.1" inputmode="decimal" placeholder="Ví dụ 5.0">
                <small>Áp dụng cho toàn bộ chiến dịch đang chọn, không phải chỉ một SKU trong bảng.</small>
              </label>
              <label id="adsAdjustStatusWrap" hidden>Trạng thái ADS
                <input id="adsAdjustStatus" type="hidden" value="1">
                <button id="adsAdjustStatusToggle" type="button" class="ads-user-toggle on" role="switch" aria-checked="true" onclick="toggleAdsAdjustStatus()"><i></i><b>Bật</b></button>
              </label>
            </div>
            <div class="ads-user-row-actions">
              <button type="button" class="ads-user-btn ghost" onclick="loadAdsAdjustCatalog()">Tải chiến dịch</button>
              <button type="button" class="ads-user-btn primary" onclick="previewAdsAdjustment()">Xem trước</button>
              <button type="button" class="ads-user-btn danger" onclick="applyAdsAdjustment()">Áp dụng lên sàn</button>
            </div>
            <label class="ads-user-check">
              <input id="adsAdjustConfirmCheck" type="checkbox">
              <span>Tôi đã xem trước và kiểm đúng gian hàng, chiến dịch, ROAS/ngân sách cần đổi.</span>
            </label>
          </div>
          <div class="ads-user-panel">
            <div class="ads-user-section-title">
              <b>Chiến dịch</b>
              <span>${esc(shop || 'Chọn gian hàng để tải')}</span>
            </div>
            <label class="ads-user-search">Tìm chiến dịch
              <input id="adsCampaignSearch" type="search" placeholder="Tên campaign, SKU hoặc mã ADS" oninput="renderAdsCampaignOptions()">
            </label>
            <div id="adsAdjustCampaignList" class="ads-user-campaign-list">${campaignCards(state.catalog)}</div>
          </div>
        </div>
        <div id="adsAdjustPreview" class="ads-manual-preview">${previewHtml()}</div>
      </section>
    `
  }

  function ruleRecentLogCard(rows) {
    return `
      <article class="ads-rule-card wide">
        <div class="ads-user-section-title"><b>Lịch sử tự động gần nhất</b><span>${number(rows.length)} dòng</span></div>
        ${rows.length ? `<div class="ads-rule-mini-list">${rows.map(row => `<span><b>${esc(actionLabel(row.action_name || row.action_type || row.action))}</b><em>${esc(row.created_at || '-')} · ${esc(row.status === 'ok' ? 'Thành công' : 'Cần kiểm')}</em></span>`).join('')}</div>` : emptyState('Chưa có lịch sử tự động.')}
      </article>
    `
  }

  function inputField(key, label, suffix) {
    return `<label class="ads-input-suffix"><span>${esc(label)}</span><input value="${esc(settingValue(key))}" oninput="updateAdsSetting('${esc(key)}', this.value)"><em>${esc(suffix)}</em></label>`
  }

  function toggleButton(key, value = Boolean(state.settings?.[key]), handler = `toggleAdsSetting('${esc(key)}')`) {
    return `<button type="button" class="ads-user-toggle ${value ? 'on' : ''}" role="switch" aria-checked="${value ? 'true' : 'false'}" onclick="${handler}"><i></i><b>${value ? 'Bật' : 'Tắt'}</b></button>`
  }

  function segButton(key, value, label) {
    const active = String(settingValue(key)) === value
    return `<button type="button" class="${active ? 'active' : ''}" onclick="setAdsSegment('${esc(key)}','${esc(value)}')">${esc(label)}</button>`
  }

  function campaignOptions(catalog = []) {
    const q = (el('adsCampaignSearch')?.value || '').toLowerCase()
    const rows = catalog.filter(row => !q || [row.campaign_name, row.campaign_id, row.adgroup_name, row.adgroup_id].join(' ').toLowerCase().includes(q))
    return rows.map(row => `<option value="${esc(row.campaign_id)}" data-adgroup="${esc(row.adgroup_id || '')}">${esc(row.campaign_name || row.campaign_id)} - ${money(row.budget || 0)} - ROAS ${number(row.roas, 2)}</option>`).join('')
  }

  function campaignRows(catalog = []) {
    const q = (el('adsCampaignSearch')?.value || '').toLowerCase()
    return catalog
      .filter(row => !q || [row.campaign_name, row.campaign_id, row.adgroup_name, row.adgroup_id, row.product_name, row.product_sku].join(' ').toLowerCase().includes(q))
      .sort((a, b) => {
        const runningA = Number(a.spend || 0) > 0 || ['ongoing', 'running', 'active', 'danger', 'good', 'watch'].includes(String(a.status || '').toLowerCase())
        const runningB = Number(b.spend || 0) > 0 || ['ongoing', 'running', 'active', 'danger', 'good', 'watch'].includes(String(b.status || '').toLowerCase())
        if (runningA !== runningB) return runningA ? -1 : 1
        const noAdsA = String(a.status || '').toLowerCase() === 'no_ads'
        const noAdsB = String(b.status || '').toLowerCase() === 'no_ads'
        if (noAdsA !== noAdsB) return noAdsA ? 1 : -1
        return Number(b.spend || 0) - Number(a.spend || 0)
      })
  }

  function dashboardCampaignCatalog(platform = '', shop = '') {
    return (state.data.product_performance || [])
      .filter(row => (!platform || row.platform === platform) && (!shop || row.shop === shop))
      .map(row => ({
        platform: row.platform,
        shop: row.shop,
        campaign_id: row.campaign_id || row.sku,
        campaign_name: row.campaign_name || row.product_name,
        product_name: row.product_name,
        product_sku: row.internal_sku || row.product_sku || row.sku,
        image_url: row.image_url,
        spend: row.ads_spend,
        revenue: row.revenue,
        budget: row.budget || 0,
        roas: row.roas,
        status: row.status,
        recommendation: row.recommendation,
        product_status: row.product_status,
        current_cost: row.current_cost,
        available_stock: row.available_stock
      }))
      .filter(row => row.campaign_id)
      .sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0))
  }

  function mergeCampaignCatalog(apiRows = [], dashboardRows = []) {
    const dashboardById = new Map(dashboardRows.map(row => [String(row.campaign_id || ''), row]))
    const merged = apiRows.map(row => {
      const core = dashboardById.get(String(row.campaign_id || '')) || {}
      return {
        ...row,
        product_name: core.product_name || row.product_name || row.campaign_name,
        product_sku: core.product_sku || row.product_sku || row.internal_sku || row.seller_sku,
        image_url: core.image_url || row.image_url || row.product_image_url,
        spend: core.spend ?? row.spend,
        revenue: core.revenue ?? row.revenue,
        roas: core.roas ?? row.roas,
        status: core.status || row.status,
        recommendation: core.recommendation || row.recommendation || campaignRecommendation(row),
        current_cost: core.current_cost ?? row.current_cost,
        available_stock: core.available_stock ?? row.available_stock,
        shop: core.shop || row.shop,
        platform: core.platform || row.platform
      }
    })
    const seen = new Set(merged.map(row => String(row.campaign_id || '')))
    for (const row of dashboardRows) {
      const id = String(row.campaign_id || '')
      if (id && !seen.has(id)) merged.push(row)
    }
    return merged
  }

  function campaignRecommendation(row = {}) {
    const label = String(row.recommendation_label || row.status || '').toLowerCase()
    if (label.includes('giảm') || label.includes('roas thấp')) return 'need_reduce'
    if (label.includes('dừng') || label.includes('tạm dừng') || label.includes('không hiệu quả')) return 'need_stop'
    if (label.includes('giữ') || label.includes('hiệu quả')) return 'keep_ads'
    if (row.current_cost === null || row.current_cost === undefined) return 'missing_cost'
    if (Number(row.available_stock ?? row.current_stock ?? 0) <= 20) return 'low_stock'
    if (Number(row.spend || 0) > 0 && Number(row.revenue || 0) <= 0) return 'need_reduce'
    return 'insufficient_data'
  }

  function campaignDecisionRow(row = {}) {
    return {
      ...row,
      ads_spend: row.ads_spend ?? row.spend,
      ads_revenue: row.ads_revenue ?? row.revenue,
      current_stock: row.available_stock ?? row.current_stock,
      recommendation: row.recommendation || campaignRecommendation(row)
    }
  }

  function campaignCards(catalog = []) {
    const rows = campaignRows(catalog)
    if (!rows.length) return '<p class="ads-user-empty">Chưa có chiến dịch phù hợp bộ lọc.</p>'
    return rows.map(row => {
      const id = String(row.campaign_id || '')
      const active = id && id === String(state.selectedCampaignId || '')
      const productName = row.product_name || row.campaign_name || row.campaign_id || 'Chiến dịch chưa đặt tên'
      const sku = row.product_sku || row.internal_sku || row.seller_sku || ''
      const stock = row.available_stock ?? row.current_stock
      const cost = row.current_cost === null || row.current_cost === undefined ? 'Chưa có' : money(row.current_cost)
      const decision = campaignDecisionRow(row)
      return `
        <button type="button" class="ads-user-campaign-card ${active ? 'active' : ''}" onclick="selectAdsCampaign('${esc(id)}')">
          ${campaignThumb(row)}
          <span class="ads-user-campaign-main">
            <b>${esc(productName)}</b>
            <small>${esc([sku, row.shop, id ? `Mã ADS ${id}` : ''].filter(Boolean).join(' · '))}</small>
          </span>
          <span class="ads-user-campaign-metrics">
            <span><b class="ads-num">${money(row.spend || 0)}</b><small>Chi tiêu hôm nay</small></span>
            <span><b class="ads-num">${money(row.revenue || 0)}</b><small>Doanh thu</small></span>
            <span><b class="ads-num">${number(row.roas, 2)}</b><small>ROAS</small></span>
            <span><b class="ads-num">${cost}</b><small>Giá vốn</small></span>
            <span><b class="ads-num">${stock === null || stock === undefined ? '-' : number(stock)}</b><small>Tồn kho</small></span>
          </span>
          <em class="${problemTone(decision)}">${esc(problemLabel(decision))}</em>
        </button>
      `
    }).join('')
  }

  function campaignThumb(row) {
    const src = row.image_url || row.product_image_url || ''
    return src
      ? `<img class="ads-user-campaign-thumb" src="${esc(src)}" alt="">`
      : '<span class="ads-user-campaign-thumb empty">ADS</span>'
  }

  function previewHtml() {
    const preview = state.preview
    if (!preview) return '<p class="ads-user-empty">Chọn chiến dịch và bấm xem trước để kiểm tra thay đổi.</p>'
    const ok = preview.status === 'ok'
    return `
      <div class="ads-user-preview-box ${ok ? 'ok' : 'warn'}">
        <p>${esc(ok ? 'Đã xem trước. Có thể áp dụng sau khi đánh dấu xác nhận.' : 'Chưa đủ điều kiện áp dụng thay đổi này.')}</p>
        <dl>
          <div><dt>Nội dung</dt><dd>${esc(actionLabel(el('adsAdjustAction')?.value || preview.action))}</dd></div>
          <div><dt>Hiện tại</dt><dd>${esc(currentCampaignLabel())}</dd></div>
          <div><dt>Sau khi áp dụng</dt><dd>${esc(nextCampaignLabel())}</dd></div>
          <div><dt>Thay đổi</dt><dd>${esc(changeLabel())}</dd></div>
          <div><dt>Cảnh báo</dt><dd>${esc(preview.can_apply ? 'Chỉ áp dụng khi đã kiểm đúng gian hàng và chiến dịch.' : 'Chưa đủ điều kiện áp dụng.')}</dd></div>
        </dl>
      </div>
    `
  }

  function actionLabel(action) {
    const labels = {
      pause: 'Tạm dừng chiến dịch',
      resume: 'Bật lại chiến dịch',
      stop: 'Tắt ADS',
      change_budget: 'Điều chỉnh ngân sách',
      change_roas_target: 'Đổi ROAS toàn chiến dịch',
      increase_budget: 'Tăng ngân sách',
      decrease_budget: 'Giảm ngân sách',
      automation_run_summary: 'Tổng kết tự động',
      automation_cron_summary: 'Tổng kết tự động',
      automation_check: 'Chạy kiểm tra',
      toggle_status: 'Bật/Tắt ADS',
      keyword_update: 'Điều chỉnh từ khóa'
    }
    return labels[action] || 'Điều chỉnh ADS'
  }

  function selectedCampaign() {
    const id = String(state.selectedCampaignId || '')
    return (state.catalog || []).find(row => String(row.campaign_id || '') === id) || {}
  }

  function currentCampaignLabel() {
    const row = selectedCampaign()
    const decision = campaignDecisionRow(row)
    return `${row.campaign_name || row.campaign_id || '-'} · ${money(row.budget || 0)} · ${problemLabel(decision)}`
  }

  function nextCampaignLabel() {
    const action = el('adsAdjustAction')?.value || ''
    if (action === 'change_budget') return `Ngân sách ngày ${money(el('adsAdjustBudget')?.value || 0)}`
    if (action === 'change_roas_target') return `ROAS mục tiêu toàn chiến dịch ${number(el('adsAdjustRoas')?.value || 0, 1)}`
    if (action === 'toggle_status') return el('adsAdjustStatus')?.value === '1' ? 'Bật' : 'Tắt'
    return actionLabel(action)
  }

  function changeLabel() {
    const row = selectedCampaign()
    const action = el('adsAdjustAction')?.value || ''
    if (action === 'change_budget') {
      const next = Number(el('adsAdjustBudget')?.value || 0)
      const current = Number(row.budget || 0)
      return `${money(current)} -> ${money(next)}`
    }
    return nextCampaignLabel()
  }

  function renderSync() {
    const last = state.lastSync || {}
    const cards = [
      ['Kéo ADS', 'ads', 'Cập nhật số chi, doanh thu, chiến dịch'],
      ['Kéo chiến dịch', 'campaigns', 'Làm mới danh sách chiến dịch'],
      ['Kéo doanh thu ADS', 'revenue', 'Cập nhật doanh thu quảng cáo'],
      ['Làm mới sản phẩm', 'products', 'Cập nhật tên, ảnh, SKU'],
      ['Làm mới tồn kho', 'stock', 'Cập nhật số lượng còn lại']
    ]
    el('adsSyncTab').innerHTML = `
      <section class="ads-user-sync-grid">${cards.map(([title, key, desc]) => `
        <article class="ads-user-sync-card">
          <b>${esc(title)}</b><p>${esc(desc)}</p>
          <span>Lần cập nhật: ${esc(last.synced_at ? new Date(last.synced_at).toLocaleString('vi-VN') : 'chưa có trong lượt này')}</span>
          <span>Trạng thái: ${esc(last.status === 'ok' ? 'Đã cập nhật' : 'Sẵn sàng')}</span>
          <span>Số dòng: ${number(last.saved || last.updated_count || 0)}</span>
          <button class="ads-user-btn primary" type="button" onclick="runAdsSync('${esc(key)}')">Chạy</button>
        </article>
      `).join('')}</section>
      <section class="ads-user-panel"><div class="ads-user-section-title"><b>Kết quả đồng bộ</b><span>Người vận hành đọc nhanh</span></div><div id="adsSyncLog">${syncLogHtml(last)}</div></section>
    `
  }

  function syncLogHtml(result = {}) {
    if (!Object.keys(result).length) return '<p class="ads-user-empty">Chưa chạy đồng bộ trong lượt mở màn hình này.</p>'
    return `
      <div class="ads-user-log-line"><b>Đã quét</b><span>${number(result.scanned_count || result.fetched_campaigns || 0)} dòng</span></div>
      <div class="ads-user-log-line"><b>Đã cập nhật</b><span>${number(result.updated_count || result.saved || 0)} dòng</span></div>
      <div class="ads-user-log-line"><b>Không đổi</b><span>${number(result.unchanged_count || 0)} dòng</span></div>
      <div class="ads-user-log-line"><b>Lỗi</b><span>${number(result.failed_count || 0)} dòng</span></div>
      <div class="ads-user-log-line"><b>Thời gian chạy</b><span>${esc(result.synced_at ? new Date(result.synced_at).toLocaleString('vi-VN') : '-')}</span></div>
    `
  }

  function renderLogs() {
    const logs = state.logs || []
    el('adsLogsTab').innerHTML = `
      <section class="ads-user-kpi-grid">
        ${[
          ['Tổng thao tác hôm nay', logs.length],
          ['Thành công', logs.filter(log => log.status === 'ok').length],
          ['Đang chờ', logs.filter(log => log.mode === 'preview').length],
          ['Cần kiểm tra', logs.filter(log => log.status !== 'ok').length]
        ].map(([label, value]) => `<article class="ads-user-kpi"><span>${esc(label)}</span><b>${number(value)}</b><small>Trong danh sách gần nhất</small></article>`).join('')}
      </section>
      <section class="ads-user-panel"><div class="ads-user-section-title"><b>Lịch sử thao tác</b><span>${number(logs.length)} thao tác</span></div>
        <div class="ads-user-log-table">${logs.map(log => `
          <article>
            <span>${esc(log.created_at || '-')}</span>
            <span>Hệ thống</span>
            <span>${esc(log.shop || log.shop_key || '-')}</span>
            <span>${esc(actionLabel(log.action_name || log.action_type))}</span>
            <span>${esc(log.campaign_id || log.entity_id ? `Mã thao tác #${log.action_id || log.id || log.entity_id}` : `Mã thao tác #${log.action_id || log.id || '-'}`)}</span>
            <span>${esc(log.status === 'ok' ? 'Đã áp dụng hoặc đã xem trước' : 'Cần kiểm tra')}</span>
            <span><b class="${log.status === 'ok' ? 'good' : 'bad'}">${esc(log.status === 'ok' ? 'Thành công' : 'Chưa áp dụng được')}</b></span>
            <span>${esc(log.user_facing_result || log.error_message || log.response_payload?.message || 'Không có ghi chú thêm')}</span>
            <span>${log.status === 'pending_admin_confirm' ? `<button class="ads-user-btn good" type="button" onclick="confirmAdsAutomationAction(${Number(log.action_id || 0)}, 'approve')">Duyệt</button><button class="ads-user-btn danger" type="button" onclick="confirmAdsAutomationAction(${Number(log.action_id || 0)}, 'reject')">Từ chối</button>` : `<button class="ads-user-btn ghost" type="button" onclick="viewAdsLogDetail(${Number(log.action_id || log.id || 0)})">Xem chi tiết</button>`}</span>
          </article>
        `).join('') || '<p class="ads-user-empty">Chưa có thao tác nào.</p>'}</div>
      </section>
    `
  }

  function renderSettings() {
    const textSettings = [
      ['good_roas', 'Ngưỡng ROAS tốt'],
      ['high_acos', 'Ngưỡng ACOS cao'],
      ['negative_profit', 'Ngưỡng lãi âm'],
      ['low_stock', 'Ngưỡng tồn thấp'],
      ['high_stock', 'Ngưỡng tồn cao']
    ]
    const toggles = [
      ['missing_cost_alert', 'Cảnh báo thiếu giá vốn'],
      ['auto_recommendation', 'Khuyến nghị tự động'],
      ['notification', 'Thông báo']
    ]
    el('adsSettingsTab').innerHTML = `
      <section class="ads-user-settings">
        ${textSettings.map(([key, label]) => `
          <label><span>${esc(label)}</span><input value="${esc(state.settings[key])}" onchange="updateAdsSetting('${esc(key)}', this.value)"></label>
        `).join('')}
        ${toggles.map(([key, label]) => `
          <label class="ads-user-toggle-row">
            <span>${esc(label)}</span>
            <button type="button" class="ads-user-toggle ${state.settings[key] ? 'on' : ''}" role="switch" aria-checked="${state.settings[key] ? 'true' : 'false'}" onclick="toggleAdsSetting('${esc(key)}')">
              <i></i><b>${state.settings[key] ? 'Bật' : 'Tắt'}</b>
            </button>
          </label>
        `).join('')}
      </section>
    `
  }

  function renderActiveTab() {
    document.querySelectorAll('[data-ads-tab-panel]').forEach(panel => {
      panel.hidden = panel.dataset.adsTabPanel !== state.activeTab
      panel.classList.remove('ads-tab-entering')
    })
    document.querySelectorAll('[data-ads-tab]').forEach(button => {
      button.classList.toggle('active', button.dataset.adsTab === state.activeTab)
    })
    if (state.activeTab === 'overview') renderOverview()
    if (state.activeTab === 'products') renderProducts()
    if (state.activeTab === 'adjust') renderAdjust()
    if (state.activeTab === 'logs') renderLogs()
    const panel = document.querySelector(`[data-ads-tab-panel="${state.activeTab}"]`)
    if (panel) requestAnimationFrame(() => panel.classList.add('ads-tab-entering'))
  }

  async function loadOverview() {
    const data = await apiGet(`/api/ads/campaign-guard/overview?limit=50`)
    state.overview = data
    state.logs = data.logs || []
    const autoLogs = await apiGet('/api/ads/automation/logs?limit=50').catch(() => null)
    if (autoLogs?.rows?.length) state.logs = autoLogs.rows
    const lastRun = await apiGet('/api/ads/automation/last-run-summary').catch(() => null)
    state.lastRun = lastRun?.last_run || null
  }

  async function loadTrendDaily() {
    const data = await apiGet(`/api/ads/dashboard?${trendQs()}`)
    state.trendDaily = Array.isArray(data.daily) ? data.daily : []
  }

  async function loadDashboard() {
    const btn = el('adsRefreshBtn')
    const old = btn?.textContent || ''
    if (btn) {
      btn.disabled = true
      btn.textContent = 'Đang tải'
    }
    try {
      state.data = await apiGet(`/api/ads/dashboard?${qs()}`)
      await loadTrendDaily().catch(error => {
        console.error('[ADS_UI] load trend daily failed:', error?.message || error)
        state.trendDaily = state.data.daily || []
      })
      renderFilters()
      await loadOverview().catch(() => {})
      renderActiveTab()
      el('adsLastUpdated').textContent = `Cập nhật: ${new Date().toLocaleString('vi-VN')}`
    } catch (error) {
      el('adsOverviewTab').innerHTML = `<p class="ads-user-empty">${esc(error.message)}</p>`
      toast(error.message, 'bad')
    } finally {
      if (btn) {
        btn.disabled = false
        btn.textContent = old || 'Làm mới'
      }
    }
  }

  window.loadAdsDashboard = loadDashboard
  window.loadAds = loadDashboard

  window.showAdsUserTab = function(tab) {
    state.activeTab = tab
    renderActiveTab()
    if (tab === 'adjust' && !state.catalog.length) window.loadAdsAdjustCatalog()
  }

  window.onAdsFilterChanged = function() {
    state.filters.platform = el('adsPlatform')?.value || ''
    state.filters.shop = el('adsShop')?.value || ''
    state.filters.status = el('adsStatus')?.value || ''
    state.filters.query = el('adsSearch')?.value || ''
    loadDashboard()
  }

  window.renderAdsFilteredProducts = function() {
    state.filters.status = el('adsStatus')?.value || ''
    state.filters.query = el('adsSearch')?.value || ''
    renderActiveTab()
  }

  window.updateAdsSetting = function(key, value) {
    updateSettingValue(key, value)
    debouncedRemoteSave()
  }

  window.toggleAdsSetting = function(key) {
    state.settings[key] = !state.settings[key]
    if (key === 'automation_enabled' && state.settings[key]) state.settings.emergency_stop = false
    debouncedSave()
    saveAdsAutomationSettings().catch(() => {})
    renderActiveTab()
    toast('Đã lưu cài đặt.')
  }

  window.setAdsSegment = function(key, value) {
    updateSettingValue(key, value)
    debouncedRemoteSave()
    renderActiveTab()
  }

  window.addAdsSchedule = function() {
    state.settings.schedules = [...scheduleRows(), { id: `slot_${Date.now()}`, days: [1, 2, 3, 4, 5], from: '08:00', to: '09:00', enabled: true }]
    debouncedSave()
    saveAdsAutomationSettings().catch(() => {})
    renderActiveTab()
  }

  window.toggleAdsScheduleDay = function(index, day) {
    const schedules = scheduleRows()
    const current = schedules[index] || {}
    const days = Array.isArray(current.days) ? current.days.slice() : [1, 2, 3, 4, 5, 6, 0]
    const nextDays = days.includes(day) ? days.filter(value => value !== day) : [...days, day]
    schedules[index] = { ...current, days: nextDays.sort((a, b) => a - b) }
    state.settings.schedules = schedules
    debouncedSave()
    saveAdsAutomationSettings().catch(() => {})
    renderActiveTab()
  }

  window.updateAdsSchedule = function(index, key, value) {
    const schedules = scheduleRows()
    schedules[index] = { ...schedules[index], [key]: value }
    state.settings.schedules = schedules
    debouncedSave()
    debouncedRemoteSave()
    renderActiveTab()
  }

  window.toggleAdsSchedule = function(index) {
    const schedules = scheduleRows()
    schedules[index] = { ...schedules[index], enabled: schedules[index]?.enabled === false }
    state.settings.schedules = schedules
    debouncedSave()
    saveAdsAutomationSettings().catch(() => {})
    renderActiveTab()
  }

  window.removeAdsSchedule = function(index) {
    state.settings.schedules = scheduleRows().filter((_, rowIndex) => rowIndex !== index)
    debouncedSave()
    saveAdsAutomationSettings().catch(() => {})
    renderActiveTab()
  }

  async function saveAdsAutomationSettings() {
    await apiPost('/api/ads/automation/settings', { settings: state.settings })
  }

  async function loadAdsAutomationSettings() {
    const result = await apiGet('/api/ads/automation/settings')
    if (result?.settings && typeof result.settings === 'object') {
      state.settings = { ...state.settings, ...result.settings }
      saveSettings()
    }
  }

  window.runAdsAutomationCheck = async function() {
    const errors = validateSchedules()
    if (errors.length) {
      toast(errors[0], 'bad')
      state.activeTab = 'adjust'
      renderActiveTab()
      return
    }
    try {
      const result = await apiPost('/api/ads/automation/run-now', {
        settings: state.settings,
        from: el('filterFrom')?.value || todayText(),
        to: el('filterTo')?.value || todayText(),
        platform: state.filters.platform || '',
        shop: state.filters.shop || ''
      })
      state.logs = [{ action_name: 'automation_check', status: result.status === 'ok' ? 'ok' : 'blocked', created_at: new Date().toLocaleString('vi-VN'), error_message: result.message || '' }, ...(state.logs || [])]
      toast(result.message || 'Đã chạy kiểm tra luật tự động.')
      renderActiveTab()
    } catch (error) {
      toast(error.message, 'bad')
    }
  }

  window.emergencyStopAdsAutomation = async function() {
    state.settings.emergency_stop = true
    state.settings.automation_enabled = false
    saveSettings()
    try {
      await apiPost('/api/ads/automation/emergency-stop', { settings: state.settings })
      toast('Đã tắt khẩn cấp toàn bộ tự động ADS.', 'bad')
    } catch (error) {
      toast(error.message, 'bad')
    }
    renderActiveTab()
  }

  window.toggleAutomation = function() {
    window.toggleAdsSetting('automation_enabled')
  }

  window.runAdsCheck = function() {
    return window.runAdsAutomationCheck()
  }

  window.emergencyStop = function() {
    return window.emergencyStopAdsAutomation()
  }

  window.confirmAdsAutomationAction = async function(actionId, decision) {
    try {
      const result = await apiPost('/api/ads/automation/confirm-action', { action_id: actionId, decision })
      toast(result.message || 'Đã cập nhật thao tác chờ duyệt.')
      await loadOverview().catch(() => {})
      renderActiveTab()
    } catch (error) {
      toast(error.message, 'bad')
    }
  }

  window.viewAdsLogDetail = function(actionId) {
    const log = (state.logs || []).find(item => Number(item.action_id || item.id || 0) === Number(actionId))
    if (!log) return
    toast(log.user_facing_result || log.error_message || 'Không có ghi chú thêm.')
  }

  window.filterAdsDecision = function(key) {
    state.activeTab = 'products'
    const map = { need_stop: 'stop', need_reduce: 'reduce', missing_cost: 'missing_cost', low_stock: 'low_stock', increase: 'increase', missing_data: 'missing_data' }
    state.filters.status = map[key] || ''
    const select = el('adsStatus')
    if (select) select.value = state.filters.status
    renderActiveTab()
  }

  window.setAdsStatus = function(status) {
    state.filters.status = status
    const select = el('adsStatus')
    if (select) select.value = status
    renderActiveTab()
  }

  window.viewAdsSku = function(sku) {
    const row = rows().find(item => [item.sku_id, item.seller_sku, item.internal_sku].includes(sku)) || rows()[0]
    if (!row) return
    toast(`${row.product_name || sku}: ${problemLabel(row)} - ${actionForRow(row)}`)
  }

  window.openAdsAdjustFromSku = function() {
    state.activeTab = 'adjust'
    renderActiveTab()
  }

  window.renderAdsCampaignOptions = function() {
    const list = el('adsAdjustCampaignList')
    const rows = campaignRows(state.catalog)
    if (rows.length && !rows.some(row => String(row.campaign_id || '') === String(state.selectedCampaignId || ''))) {
      state.selectedCampaignId = String(rows[0].campaign_id || '')
    }
    if (list) list.innerHTML = campaignCards(state.catalog)
    syncAdsAdjustDefaults()
  }

  window.selectAdsCampaign = function(id) {
    state.selectedCampaignId = String(id || '')
    const list = el('adsAdjustCampaignList')
    if (list) list.innerHTML = campaignCards(state.catalog)
    syncAdsAdjustDefaults()
  }

  window.renderAdsActionOptions = function() {
    const platform = el('adsAdjustPlatform')?.value || selectedCapability()?.platform || 'shopee'
    const scope = el('adsAdjustScope')?.value || 'campaign'
    const select = el('adsAdjustAction')
    const options = adsActionOptions(platform, scope)
    if (select) select.innerHTML = options.map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join('')
    syncAdsAdjustDefaults()
  }

  window.syncAdsAdjustDefaults = function() {
    const action = el('adsAdjustAction')?.value || ''
    const isBudget = action === 'change_budget'
    const isRoas = action === 'change_roas_target'
    const isToggle = action === 'toggle_status'
    if (el('adsAdjustBudgetWrap')) el('adsAdjustBudgetWrap').hidden = !isBudget
    if (el('adsAdjustRoasWrap')) el('adsAdjustRoasWrap').hidden = !isRoas
    if (el('adsAdjustStatusWrap')) el('adsAdjustStatusWrap').hidden = !isToggle
    if (isToggle && el('adsAdjustStatus') && !el('adsAdjustStatus').value) el('adsAdjustStatus').value = '1'
    syncAdsAdjustStatusToggle()
    const row = selectedCampaign()
    if (isBudget && el('adsAdjustBudget') && !el('adsAdjustBudget').value) el('adsAdjustBudget').value = Math.round(Number(row.budget || 0))
    if (isRoas && el('adsAdjustRoas') && !el('adsAdjustRoas').value) el('adsAdjustRoas').value = String(row.roas_target ?? settingValue('good_roas', 5))
    state.preview = null
    const preview = el('adsAdjustPreview')
    if (preview) preview.innerHTML = previewHtml()
  }

  function syncAdsAdjustStatusToggle() {
    const value = el('adsAdjustStatus')?.value === '0' ? '0' : '1'
    const button = el('adsAdjustStatusToggle')
    if (!button) return
    const on = value === '1'
    button.classList.toggle('on', on)
    button.setAttribute('aria-checked', on ? 'true' : 'false')
    const label = button.querySelector('b')
    if (label) label.textContent = on ? 'Bật' : 'Tắt'
  }

  window.toggleAdsAdjustStatus = function() {
    const input = el('adsAdjustStatus')
    if (!input) return
    input.value = input.value === '1' ? '0' : '1'
    syncAdsAdjustStatusToggle()
    const preview = el('adsAdjustPreview')
    if (preview) preview.innerHTML = previewHtml()
  }

  window.loadAdsAdjustCatalog = async function() {
    const shop = el('adsAdjustShop')?.value || selectedCapability()?.shop || ''
    const cap = capabilityRows().find(item => item.shop === shop) || selectedCapability()
    const platform = cap?.platform || el('adsAdjustPlatform')?.value || 'shopee'
    if (el('adsAdjustPlatform')) el('adsAdjustPlatform').value = platform
    try {
      const data = await apiGet(`/api/ads/campaign-guard/campaigns?platform=${encodeURIComponent(platform)}&shop=${encodeURIComponent(shop)}&limit=250`)
      const apiRows = data.rows || []
      const dashboardRows = dashboardCampaignCatalog(platform, shop)
      state.catalog = mergeCampaignCatalog(apiRows, dashboardRows)
      state.selectedCampaignId = String(state.catalog[0]?.campaign_id || '')
      renderAdjust()
    } catch (error) {
      state.catalog = dashboardCampaignCatalog(platform, shop)
      if (!state.catalog.length) toast(error.message, 'bad')
      renderAdjust()
    }
  }

  window.previewAdsAdjustment = async function() {
    const cap = selectedCapability()
    const campaign = selectedCampaign()
    if (!cap || !cap.supports_ads_guard_apply) {
      toast('Gian hàng này chỉ xem dữ liệu, chưa thể áp dụng tự động.', 'bad')
      return
    }
    const bodyData = adjustmentBody(false, cap, campaign)
    try {
      state.preview = await apiPost('/api/ads/campaign-guard/preview', bodyData)
      el('adsAdjustPreview').innerHTML = previewHtml()
      toast(state.preview.can_apply ? 'Đã xem trước thay đổi.' : 'Chưa đủ điều kiện áp dụng.', state.preview.can_apply ? 'ok' : 'bad')
    } catch (error) {
      toast(error.message, 'bad')
    }
  }

  window.applyAdsAdjustment = async function() {
    const cap = selectedCapability()
    const campaign = selectedCampaign()
    if (!state.preview?.can_apply) {
      toast('Cần xem trước thành công trước khi áp dụng.', 'bad')
      return
    }
    if (!el('adsAdjustConfirmCheck')?.checked) {
      toast('Cần đánh dấu đã xem trước thay đổi.', 'bad')
      return
    }
    try {
      const result = await apiPost('/api/ads/campaign-guard/apply', adjustmentBody(true, cap, campaign))
      state.preview = result
      await loadOverview().catch(() => {})
      el('adsAdjustPreview').innerHTML = previewHtml()
      renderLogs()
      toast(result.status === 'ok' && result.applied ? 'Sàn đã xác nhận thay đổi.' : 'Sàn chưa xác nhận thay đổi.', result.status === 'ok' && result.applied ? 'ok' : 'bad')
    } catch (error) {
      toast(error.message, 'bad')
    }
  }

  function adjustmentBody(apply, cap, campaign) {
    const platform = el('adsAdjustPlatform')?.value || cap?.platform || ''
    const scope = el('adsAdjustScope')?.value || 'campaign'
    const action = el('adsAdjustAction')?.value || ''
    const bodyData = {
      platform,
      shop: el('adsAdjustShop')?.value || cap?.shop || '',
      scope,
      route_key: platform === 'lazada' ? (scope === 'adgroup' ? 'lazada_adgroup' : 'lazada_campaign') : 'shopee_manual',
      action,
      entity_id: scope === 'adgroup' ? (campaign.adgroup_id || campaign.campaign_id) : campaign.campaign_id,
      parent_campaign_id: campaign.campaign_id || '',
      confirm_text: apply ? (state.preview?.confirm_phrase || 'TOI_HIEU_DAY_LA_THAY_DOI_ADS_THAT') : ''
    }
    if (action === 'change_budget') bodyData.budget = el('adsAdjustBudget')?.value || ''
    if (action === 'change_roas_target') bodyData.roas_target = el('adsAdjustRoas')?.value || ''
    if (['toggle_status', 'toggle_campaign', 'toggle_adgroup'].includes(action)) bodyData.status_value = el('adsAdjustStatus')?.value || ''
    return bodyData
  }

  window.cancelAdsAdjustment = function() {
    state.preview = null
    const preview = el('adsAdjustPreview')
    if (preview) preview.innerHTML = previewHtml()
  }

  window.runAdsSync = async function(kind = 'ads') {
    try {
      const bodyData = { from: el('filterFrom')?.value || '', to: el('filterTo')?.value || '', performance_date: el('filterTo')?.value || todayText(), platform: state.filters.platform || '', shop: state.filters.shop || '', include_adgroups: true }
      const result = await apiPost('/api/ads/sync-campaigns', bodyData)
      state.lastSync = { ...result, synced_at: new Date().toISOString(), kind }
      await loadDashboard()
      state.activeTab = 'logs'
      renderActiveTab()
      toast('Đã chạy đồng bộ dữ liệu.')
    } catch (error) {
      state.lastSync = { status: 'error', failed_count: 1, synced_at: new Date().toISOString(), message: error.message }
      state.activeTab = 'logs'
      renderActiveTab()
      toast(error.message, 'bad')
    }
  }

  window.syncAdsCampaignSnapshots = function() {
    return window.runAdsSync('ads')
  }

  window.setAdsQuickDateRange = function(preset) {
    const from = el('filterFrom')
    const to = el('filterTo')
    if (!from || !to) return
    if (preset === 'today') {
      from.value = todayText()
      to.value = todayText()
    } else if (preset === 'last7') {
      from.value = todayText(-6)
      to.value = todayText()
    } else {
      from.value = todayText(-29)
      to.value = todayText()
    }
    loadDashboard()
  }

  window.onAdsDateInputChanged = loadDashboard

  async function syncTodaySilently() {
    if (state.autoSyncing) return
    const from = el('filterFrom')?.value || ''
    const to = el('filterTo')?.value || ''
    const today = todayText()
    if (from !== today || to !== today) return
    const key = `shophuyvan_ads_today_sync_${today}`
    const last = Number(localStorage.getItem(key) || 0)
    if (Date.now() - last < 5 * 60 * 1000) return
    state.autoSyncing = true
    try {
      const result = await apiPost('/api/ads/sync-campaigns', { from: today, to: today, performance_date: today, include_adgroups: true })
      state.lastSync = { ...result, synced_at: new Date().toISOString(), kind: 'auto_today' }
      localStorage.setItem(key, String(Date.now()))
      await loadDashboard()
    } catch (error) {
      console.warn('[ADS] auto sync today failed', error)
    } finally {
      state.autoSyncing = false
    }
  }

  function startRealtimeRefresh() {
    if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer)
    state.autoRefreshTimer = setInterval(() => {
      loadDashboard().catch(() => {})
      syncTodaySilently().catch(() => {})
    }, 60000)
  }

  function initDates() {
    if (!el('filterFrom')?.value) el('filterFrom').value = todayText()
    if (!el('filterTo')?.value) el('filterTo').value = todayText()
  }

  window.openUserHelp = openUserHelp
  window.closeUserHelp = closeUserHelp

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeUserHelp()
  })

  document.addEventListener('DOMContentLoaded', () => {
    loadSettings()
    initDates()
    loadAdsAutomationSettings()
      .catch(() => {})
      .then(() => loadDashboard())
      .then(() => syncTodaySilently())
      .catch(() => {})
    startRealtimeRefresh()
  })
})()
