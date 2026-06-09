window.SHV_PROMO = (() => {
  const API_BASE = window.API || window.SHV_API || 'https://huyvan-worker-api.nghiemchihuy.workers.dev'

  const MODULES = [
    { key: 'shopee-discount', platform: 'shopee', module: 'discount', name: 'Shopee Giảm giá', desc: 'Giảm giá trực tiếp trên sản phẩm.', tone: 'red', kind: 'discount' },
    { key: 'shopee-voucher', platform: 'shopee', module: 'voucher', name: 'Shopee Voucher', desc: 'Mã giảm giá do shop tạo cho khách.', tone: 'orange', kind: 'voucher' },
    { key: 'shopee-bundle', platform: 'shopee', module: 'bundle_deal', name: 'Shopee Combo', desc: 'Ưu đãi mua theo bộ sản phẩm.', tone: 'amber', kind: 'program' },
    { key: 'shopee-addon', platform: 'shopee', module: 'add_on_deal', name: 'Shopee Mua kèm', desc: 'Ưu đãi mua thêm sản phẩm giá tốt.', tone: 'orange', kind: 'program' },
    { key: 'shopee-flash', platform: 'shopee', module: 'shop_flash_sale', name: 'Shopee Flash Sale', desc: 'Ưu đãi trong khung giờ giới hạn.', tone: 'yellow', kind: 'program' },
    { key: 'lazada-voucher', platform: 'lazada', module: 'voucher', name: 'Lazada Voucher', desc: 'Mã giảm giá do shop tạo trên Lazada.', tone: 'violet', kind: 'voucher' },
    { key: 'lazada-freeship', platform: 'lazada', module: 'free_shipping', name: 'Lazada Freeship', desc: 'Hỗ trợ phí vận chuyển cho khách.', tone: 'green', kind: 'program' },
    { key: 'lazada-flexicombo', platform: 'lazada', module: 'flexicombo', name: 'Lazada Flexicombo', desc: 'Ưu đãi combo linh hoạt trên Lazada.', tone: 'purple', kind: 'program' }
  ]

  const state = {
    activeModule: 'shopee-discount',
    view: 'module',
    core: {},
    moduleData: {},
    drawerRow: null,
    loading: false,
    error: '',
    lastSync: null,
    flashAuto: {
      shop: '',
      enabled: false,
      emergency_stop: false,
      min_stock: '20',
      block_below_cost: true,
      schedules: [],
      selectedProducts: [],
      productPickerOpen: false,
      productPickerScheduleId: null
    },
    cleanup: {
      status: 'expired',
      inactive_days: '30',
      no_products: false,
      no_revenue: false,
      visibleRows: []
    },
    activePlatformTab: 'shopee',
    hideEmptyModules: true
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

  function text(value, fallback = '-') {
    const clean = String(value ?? '').replace(/\u00a0/g, ' ').trim()
    return clean || fallback
  }

  function userMessage(value, fallback = 'Chưa có dữ liệu') {
    return text(value, fallback)
      .replace(/json:\s*cannot unmarshal[^.]+/gi, 'Sàn chưa nhận đúng định dạng thao tác')
      .replace(/no edit permission[^.]+/gi, 'Sàn chưa cho phép sửa chương trình này')
      .replace(/expired can not update/gi, 'Chương trình đã kết thúc nên sàn không cho sửa')
      .replace(/cannot delete ongoing and expired shop flash sale/gi, 'Shopee không cho xóa Flash Sale đang chạy hoặc đã kết thúc')
      .replace(/\bpayload\b/gi, 'nội dung gửi')
      .replace(/\bendpoint\b/gi, 'kết nối')
      .replace(/\brequest_id\b/gi, 'mã thao tác')
      .replace(/\braw response\b/gi, 'kết quả trả về')
  }

  function money(value) {
    if (value === null || value === undefined || value === '') return '-'
    const n = Number(value)
    if (!Number.isFinite(n)) return '-'
    if (n === 0) return '0đ'
    return `${Math.round(n).toLocaleString('vi-VN')}đ`
  }

  function numText(value, digits = 0) {
    if (value === null || value === undefined || value === '') return '-'
    const n = Number(value)
    if (!Number.isFinite(n)) return '-'
    return n.toLocaleString('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  }

  function todayText(offsetDays = 0) {
    const d = new Date(Date.now() + offsetDays * 86400000)
    return d.toISOString().slice(0, 10)
  }

  function dateLabel(value) {
    if (!value) return '-'
    const raw = String(value)
    const numeric = Number(raw)
    const date = Number.isFinite(numeric) && numeric > 100000 ? new Date(numeric * 1000) : new Date(raw)
    if (Number.isNaN(date.getTime())) return raw
    return date.toLocaleDateString('vi-VN')
  }

  function moduleByKey(key = state.activeModule) {
    return MODULES.find(item => item.key === key) || MODULES[0]
  }

  function filters() {
    return {
      from: el('promotionFrom')?.value || '',
      to: el('promotionTo')?.value || '',
      platform: el('promotionPlatform')?.value || '',
      shop: el('promotionShop')?.value || '',
      status: el('promotionStatus')?.value || 'not_expired',
      search: (el('promotionSearch')?.value || '').trim().toLowerCase()
    }
  }

  function matchesSearch(row, query = filters().search) {
    if (!query) return true
    const haystack = [
      row.promotion_name,
      row.name,
      row.product_name,
      row.seller_sku,
      row.sku_id,
      row.item_id,
      row.promotion_id,
      row.shop
    ].map(value => String(value ?? '').toLowerCase()).join(' ')
    return haystack.includes(query)
  }

  function activeShop() {
    return filters().shop || ''
  }

  function statusTone(value = '') {
    const lower = String(value).toLowerCase()
    if (/ongoing|active|enabled|đang/.test(lower)) return 'good'
    if (/upcoming|pending|sắp|chờ/.test(lower)) return 'watch'
    if (/expired|ended|finish|deleted|kết thúc/.test(lower)) return 'neutral'
    if (/error|fail|blocked|khóa|thiếu/.test(lower)) return 'bad'
    return 'neutral'
  }

  function capabilityAllows(data, action = 'update') {
    return Boolean((data?.capabilities || []).some(item => {
      const name = String(item.action || '').toLowerCase()
      return item.allowed === true && (!action || name.includes(action) || name === action)
    }))
  }

  function isVerifiedResult(result = {}) {
    if (result.verified === true) return true
    if (result.readback_match === true) return true
    if (result.verify_result?.verified === true) return true
    return false
  }

  function toast(message, tone = 'ok') {
    const host = el('promotionToastHost')
    if (!host) return
    const item = document.createElement('div')
    item.className = `promo-toast ${tone}`
    item.textContent = userMessage(message, tone === 'bad' ? 'Thao tác chưa thành công' : 'Đã cập nhật')
    host.appendChild(item)
    const items = Array.from(host.querySelectorAll('.promo-toast'))
    while (items.length > 3) items.shift().remove()
    setTimeout(() => item.remove(), 5200)
  }

  function skeleton(lines = 4) {
    return `<div class="promo-skeleton-stack">${Array.from({ length: lines }, () => '<span class="promo-skeleton"></span>').join('')}</div>`
  }

  function emptyState(title = 'Chưa có dữ liệu', detail = 'Bấm làm mới hoặc đồng bộ khuyến mãi để cập nhật dữ liệu mới nhất.') {
    return `<div class="promo-state empty"><b>${esc(title)}</b><span>${esc(detail)}</span></div>`
  }

  function errorState(message = 'Không tải được dữ liệu') {
    return `<div class="promo-state error"><b>Lỗi tải dữ liệu</b><span>${esc(userMessage(message))}</span><button class="promo-btn secondary" type="button" data-promo-action="reload">Thử lại</button></div>`
  }

  function setLastUpdated() {
    const target = el('promotionLastUpdated')
    if (target) target.textContent = `Cập nhật: ${new Date().toLocaleString('vi-VN')}`
  }

  function initDates() {
    if (!el('promotionFrom')?.value) el('promotionFrom').value = todayText(-23)
    if (!el('promotionTo')?.value) el('promotionTo').value = todayText()
    if (!state.flashAuto.schedules.length) {
      state.flashAuto.schedules = [{ id: `flash_${Date.now()}`, date: todayText(), from: '20:00', to: '22:00', enabled: true }]
    }
  }

  return {
    API_BASE,
    MODULES,
    state,
    el,
    esc,
    text,
    userMessage,
    money,
    numText,
    todayText,
    dateLabel,
    moduleByKey,
    filters,
    matchesSearch,
    activeShop,
    statusTone,
    capabilityAllows,
    isVerifiedResult,
    toast,
    skeleton,
    emptyState,
    errorState,
    setLastUpdated,
    initDates
  }
})()
