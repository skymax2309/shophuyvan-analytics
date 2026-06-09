const API_BASE = window.SHV_AUTH?.API || window.SHV_API || 'https://huyvan-worker-api.nghiemchihuy.workers.dev'

const state = {
  products: [],
  filtered: [],
  selected: new Set(),
  summary: {},
  settings: {},
  batches: [],
  historyBySku: new Map(),
  activeSku: '',
  activeBatchId: '',
  activeSection: 'products',
  activeTab: 'general',
  editingItem: null,
  importRawRows: [],
  importPreviewRows: [],
  manualPreviewRow: null,
  log: []
}

const STATUS_LABELS = {
  no_purchase_history: ['Chưa có lịch sử nhập', 'gray'],
  cost_ready: ['Dữ liệu chuẩn', 'green'],
  cost_missing: ['Thiếu giá vốn', 'yellow'],
  missing: ['Chưa có dữ liệu', 'gray'],
  cost_stale: ['Cần kiểm', 'yellow'],
  low_stock: ['Sắp hết hàng', 'yellow'],
  out_of_stock: ['Hết hàng', 'red'],
  import_row_blocked: ['Row bị chặn', 'red'],
  import_ready: ['Sẵn sàng import', 'green']
}

const BLOCK_REASON_LABELS = {
  missing_import_date: 'Thiếu ngày nhập hàng',
  missing_sku: 'Thiếu mã hàng/SKU',
  sku_not_found_in_product_core: 'SKU không có trong Product Core',
  invalid_quantity: 'Số lượng nhập không hợp lệ',
  invalid_package_count: 'Số kiện không hợp lệ',
  invalid_quantity_per_package: 'Số sản phẩm / kiện không hợp lệ',
  missing_purchase_price: 'Thiếu giá nhập và giá khai thuế',
  missing_package_weight: 'Thiếu kg / kiện',
  missing_package_dimensions: 'Thiếu kích thước kiện',
  invalid_shipping_calculation_method: 'Cách tính vận chuyển không hợp lệ'
}

const SHIPPING_METHOD_LABELS = {
  by_weight: 'Theo kg',
  by_volume: 'Theo khối',
  greater_of_weight_or_volume: 'Lấy lớn hơn',
  fixed_per_package: 'Cố định / kiện',
  manual: 'Nhập tay'
}

function qs(selector) {
  return document.querySelector(selector)
}

function qsa(selector) {
  return Array.from(document.querySelectorAll(selector))
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function money(value) {
  if (value === null || value === undefined || value === '') return 'Chưa có'
  const number = Number(value)
  if (!Number.isFinite(number)) return 'Chưa có'
  return `${Math.round(number).toLocaleString('vi-VN')}đ`
}

function numberText(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  return number.toLocaleString('vi-VN')
}

function dateText(value) {
  const text = String(value || '').slice(0, 10)
  if (!text) return 'Chưa nhập'
  const parts = text.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return text
}

function badge(status) {
  const [label, tone] = STATUS_LABELS[status] || [status || 'Chưa rõ', 'gray']
  return `<span class="badge ${tone}">${escapeHtml(label)}</span>`
}

function setLoading(isLoading, text = '') {
  document.documentElement.dataset.purchaseLoading = isLoading ? 'true' : 'false'
  qs('#stateText').textContent = text || (isLoading ? 'Đang xử lý...' : 'Sẵn sàng')
  qsa('button').forEach(button => {
    if (['close-import', 'close-manual', 'close-settings', 'close-edit'].includes(button.dataset.action)) return
    if (button.closest('.drawer-tabs')) return
    button.disabled = isLoading
  })
  if (!isLoading) syncActionDisabledStates()
}

function syncActionDisabledStates() {
  const manualReady = state.manualPreviewRow?.status === 'ready'
  const importReady = state.importPreviewRows.some(row => row.status === 'ready')
  const manualButton = qs('[data-action="confirm-manual"]')
  const importButton = qs('[data-action="confirm-import"]')
  if (manualButton) manualButton.disabled = !manualReady
  if (importButton) importButton.disabled = !importReady
}

function toast(message, type = 'success') {
  const stack = qs('#toastStack')
  const item = document.createElement('div')
  item.className = `toast ${type}`
  item.textContent = message
  stack.appendChild(item)
  window.setTimeout(() => item.remove(), 4200)
}

function addLog(message, payload = null) {
  const line = {
    at: new Date().toISOString(),
    message,
    payload
  }
  state.log.unshift(line)
  state.log = state.log.slice(0, 80)
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    const message = data.message || data.error || `HTTP ${res.status}`
    throw new Error(message)
  }
  return data
}

function filterPayload() {
  return {
    search: qs('#filterSearch').value.trim(),
    category: qs('#filterCategory').value,
    supplier: qs('#filterSupplier').value.trim().toLowerCase(),
    from: qs('#filterFrom').value,
    to: qs('#filterTo').value,
    stock_status: qs('#filterStockStatus').value,
    cost_status: qs('#filterCostStatus').value,
    logistics_status: qs('#filterLogisticsStatus').value
  }
}

async function loadPurchaseReadModel() {
  setLoading(true, 'Đang đọc Product Core và Warehouse/Purchase Core...')
  try {
    const filters = filterPayload()
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value && ['search', 'stock_status', 'cost_status', 'logistics_status'].includes(key)) params.set(key, value)
    })
    params.set('limit', '500')
    const data = await api(`/api/purchase/read-model?${params.toString()}`)
    state.products = data.products || []
    state.summary = data.summary || {}
    state.filtered = applyClientFilters(state.products, filters)
    state.selected.clear()
    renderAll()
    addLog('Đọc Purchase Core thành công', data.summary)
  } catch (error) {
    toast(error.message, 'error')
    addLog('Đọc Purchase Core lỗi', error.message)
  } finally {
    setLoading(false, 'Dữ liệu đọc từ Warehouse/Purchase Core')
  }
}

async function loadImportBatches() {
  try {
    const data = await api('/api/purchase/import-batches?limit=100')
    state.batches = data.batches || []
    renderBatches()
    addLog('Đọc danh sách đợt nhập', { count: state.batches.length })
  } catch (error) {
    toast(error.message, 'error')
    addLog('Đọc danh sách đợt nhập lỗi', error.message)
  }
}

async function openBatchDetail(batchId) {
  try {
    const data = await api(`/api/purchase/import-batch?id=${encodeURIComponent(batchId)}`)
    state.activeBatchId = batchId
    renderBatchDetail(data.batch, data.items || [])
    addLog('Đọc chi tiết đợt nhập', { batchId, items: data.items?.length || 0 })
  } catch (error) {
    toast(error.message, 'error')
  }
}

function renderBatchDetail(batch, items) {
  const drawer = qs('#detailDrawer')
  drawer.classList.add('is-open')
  drawer.innerHTML = `
    <div class="drawer-header">
      <div>
        <h2>${escapeHtml(batch?.batch_code || batch?.import_batch_id || 'Đợt nhập')}</h2>
        <div class="product-sub">Packing List / tờ khai lấy từ Purchase Core</div>
      </div>
      <button class="icon-btn" type="button" data-action="close-drawer"><i data-lucide="x"></i></button>
    </div>
    <div class="drawer-body">
      <div class="info-grid">
        ${infoRow('Ngày nhập', dateText(batch?.import_date))}
        ${infoRow('Nhà cung cấp', batch?.supplier_name)}
        ${infoRow('Đơn vị vận chuyển', batch?.forwarder_name)}
        ${infoRow('Mã vận đơn', batch?.purchase_tracking_number)}
        ${infoRow('Số kiện', numberText(batch?.total_package_count))}
        ${infoRow('Tổng kg', numberText(batch?.total_weight_kg))}
        ${infoRow('Tổng khối', numberText(batch?.total_volume_m3))}
        ${infoRow('Tổng giá vốn', money(batch?.total_landed_cost))}
      </div>
      <div class="modal-actions inline-actions">
        <button class="btn btn-ghost" type="button" data-export-batch="packing"><i data-lucide="file-spreadsheet"></i><span>Xuất Packing List</span></button>
        <button class="btn btn-ghost" type="button" data-export-batch="customs"><i data-lucide="file-text"></i><span>Xuất tờ khai</span></button>
        <button class="btn btn-ghost" type="button" data-export-batch="cost"><i data-lucide="circle-dollar-sign"></i><span>Tổng hợp chi phí</span></button>
      </div>
      <div class="timeline">
        ${items.map((item, index) => `<article class="timeline-card">
          <div class="timeline-top"><span>${index + 1}. ${escapeHtml(item.product_name || item.internal_sku)}</span><span>${escapeHtml(item.internal_sku || item.sku_id)}</span></div>
          <div class="timeline-meta">
            <span>Số lượng: <strong>${numberText(item.quantity_imported)}</strong></span>
            <span>Số kiện / SP mỗi kiện: <strong>${numberText(item.package_count)} / ${numberText(item.quantity_per_package)}</strong></span>
            <span>Kg / D x R x C: <strong>${escapeHtml(`${item.package_weight_kg || 0} kg, ${item.package_length_cm || 0} x ${item.package_width_cm || 0} x ${item.package_height_cm || 0} cm`)}</strong></span>
            <span>Giá vốn / sản phẩm: <strong>${money(item.landed_cost_per_unit)}</strong></span>
            <span>Tổng tiền dòng: <strong>${money(item.total_batch_cost)}</strong></span>
          </div>
        </article>`).join('')}
      </div>
    </div>
  `
  state.activeBatchItems = items
  state.activeBatchMeta = batch
  if (window.lucide) window.lucide.createIcons()
}

function applyClientFilters(rows, filters) {
  return (rows || []).filter(row => {
    if (filters.category && String(row.category || '') !== filters.category) return false
    if (filters.from && String(row.latest_import_date || '') < filters.from) return false
    if (filters.to && String(row.latest_import_date || '') > filters.to) return false
    if (filters.supplier) {
      const supplier = String(row.supplier_name || '').toLowerCase()
      if (!supplier.includes(filters.supplier)) return false
    }
    if (filters.logistics_status && String(row.logistics_profile_status || '') !== filters.logistics_status) return false
    return true
  })
}

function renderAll() {
  renderSummary()
  renderFilterOptions()
  renderTable()
  renderCards()
  renderBatches()
  updateResultCount()
  renderDrawer()
  if (window.lucide) window.lucide.createIcons()
}

function renderBatches() {
  const body = qs('#batchTableBody')
  const cards = qs('#batchCardList')
  const count = qs('#batchCount')
  if (!body || !cards || !count) return
  count.textContent = `${state.batches.length.toLocaleString('vi-VN')} đợt nhập`
  body.innerHTML = state.batches.map(batch => {
    const batchId = batch.import_batch_id || batch.purchase_batch_id || batch.batch_code
    return `
    <tr>
      <td><strong>${escapeHtml(batch.batch_code || batch.import_batch_id || batch.purchase_batch_id)}</strong></td>
      <td>${dateText(batch.import_date)}</td>
      <td>${escapeHtml(batch.supplier_name || '')}</td>
      <td>${escapeHtml(batch.forwarder_name || '')}</td>
      <td>${escapeHtml(batch.purchase_tracking_number || '')}</td>
      <td>${numberText(batch.total_package_count)}</td>
      <td>${numberText(batch.total_quantity)}</td>
      <td>${numberText(batch.total_weight_kg)}</td>
      <td>${numberText(batch.total_volume_m3)}</td>
      <td class="money">${money(batch.total_landed_cost)}</td>
      <td>${badge(batch.shipment_status || 'cost_ready')}</td>
      <td><button class="btn btn-ghost" type="button" data-open-batch="${escapeHtml(batchId)}"><i data-lucide="panel-right-open"></i><span>Chi tiết</span></button></td>
    </tr>
  `}).join('')
  cards.innerHTML = state.batches.map(batch => {
    const batchId = batch.import_batch_id || batch.purchase_batch_id || batch.batch_code
    return `
    <article class="mobile-card">
      <div class="product-name">${escapeHtml(batch.batch_code || batch.import_batch_id || batch.purchase_batch_id)}</div>
      <div class="mobile-metrics">
        <div class="metric-line"><span>Ngày nhập</span><strong>${dateText(batch.import_date)}</strong></div>
        <div class="metric-line"><span>Số kiện</span><strong>${numberText(batch.total_package_count)}</strong></div>
        <div class="metric-line"><span>Tổng kg / khối</span><strong>${numberText(batch.total_weight_kg)} / ${numberText(batch.total_volume_m3)}</strong></div>
        <div class="metric-line"><span>Tổng giá vốn</span><strong>${money(batch.total_landed_cost)}</strong></div>
      </div>
      <button class="btn btn-ghost" type="button" data-open-batch="${escapeHtml(batchId)}">Chi tiết</button>
    </article>
  `}).join('')
}

function switchSection(section) {
  state.activeSection = section
  qsa('[data-section-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.sectionTab === section)
  })
  qsa('[data-section-panel]').forEach(panel => {
    panel.hidden = panel.dataset.sectionPanel !== section
  })
  if (section === 'batches' && !state.batches.length) loadImportBatches()
}

function renderSummary() {
  const cards = [
    ['package', 'Tổng sản phẩm từ Product Core', state.summary.total_product_core, 'Đang kinh doanh'],
    ['shopping-cart', 'SKU đã có lịch sử nhập', state.summary.sku_with_purchase_history, percent(state.summary.sku_with_purchase_history, state.summary.total_product_core)],
    ['alert-circle', 'SKU chưa có lịch sử nhập', state.summary.sku_without_purchase_history, 'Cần bổ sung lô nhập'],
    ['calendar-days', 'Lần nhập gần nhất', dateText(state.summary.latest_import_date), state.summary.latest_import_date ? 'Readback Purchase Core' : 'Chưa nhập'],
    ['circle-dollar-sign', 'Tổng giá trị nhập 30 ngày', money(state.summary.total_import_value_30d), 'Theo Purchase Batch'],
    ['chart-no-axes-combined', 'Giá vốn bình quân toàn kho', money(state.summary.average_current_cost), '/ 1 sản phẩm']
  ]
  qs('#summaryCards').innerHTML = cards.map(([icon, label, value, sub]) => `
    <article class="summary-card">
      <div class="summary-icon"><i data-lucide="${icon}"></i></div>
      <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? '0')}</strong><small>${escapeHtml(sub || '')}</small></div>
    </article>
  `).join('')
}

function percent(value, total) {
  const v = Number(value || 0)
  const t = Number(total || 0)
  if (!t) return '0%'
  return `${((v / t) * 100).toFixed(1)}%`
}

function renderFilterOptions() {
  const categorySelect = qs('#filterCategory')
  const currentCategory = categorySelect.value
  const categories = [...new Set(state.products.map(row => row.category).filter(Boolean))].sort()
  categorySelect.innerHTML = '<option value="">Tất cả danh mục</option>' + categories.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('')
  categorySelect.value = categories.includes(currentCategory) ? currentCategory : ''
  qs('#skuOptions').innerHTML = state.products.slice(0, 500).map(row => `<option value="${escapeHtml(row.internal_sku || row.sku_id)}">${escapeHtml(row.product_name || '')}</option>`).join('')
}

function updateResultCount() {
  qs('#resultCount').textContent = `${state.filtered.length.toLocaleString('vi-VN')} sản phẩm`
  qs('#emptyState').hidden = state.filtered.length > 0
}

function productStatus(row) {
  if (row.purchase_history_status === 'no_purchase_history') return 'no_purchase_history'
  if (row.current_cost_status && row.current_cost_status !== 'missing') return row.current_cost_status
  if (Number(row.total_remaining_stock || 0) <= 0) return 'out_of_stock'
  return 'cost_ready'
}

function imageTag(row) {
  const src = row.image_url || '../icons/shophuyvan-icon.svg'
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(row.product_name || row.sku_id || 'Sản phẩm')}">`
}

function logisticsBadge(row) {
  return row.logistics_profile_status === 'ready'
    ? '<span class="badge green">Đã có mặc định</span>'
    : '<span class="badge yellow">Thiếu thông số</span>'
}

function logisticsText(row) {
  const dims = [row.package_length_cm, row.package_width_cm, row.package_height_cm]
    .map(value => Number(value || 0))
  const dimText = dims.every(value => value > 0) ? `${dims[0]} x ${dims[1]} x ${dims[2]} cm` : 'Thiếu D x R x C'
  const weight = Number(row.package_weight_kg || 0) > 0 ? `${numberText(row.package_weight_kg)} kg/kiện` : 'Thiếu kg/kiện'
  const method = SHIPPING_METHOD_LABELS[row.shipping_calculation_method] || 'Chưa chọn'
  return `${weight}<div class="product-sub">${escapeHtml(dimText)} · ${escapeHtml(method)}</div>${logisticsBadge(row)}`
}

function renderTable() {
  qs('#purchaseTableBody').innerHTML = state.filtered.map(row => `
    <tr data-sku="${escapeHtml(row.sku_id)}">
      <td><input type="checkbox" class="row-check" data-sku="${escapeHtml(row.sku_id)}" ${state.selected.has(row.sku_id) ? 'checked' : ''}></td>
      <td>
        <div class="product-cell">
          ${imageTag(row)}
          <div>
            <div class="product-name">${escapeHtml(row.product_name || 'Chưa có tên')}</div>
            <div class="product-sub">${escapeHtml(row.variation_name || row.category || '')}</div>
          </div>
        </div>
      </td>
      <td><strong>${escapeHtml(row.internal_sku || row.sku_id)}</strong><div class="product-sub">${escapeHtml(row.seller_sku || '')}</div></td>
      <td>${dateText(row.latest_import_date)}</td>
      <td class="money">${money(row.latest_landed_cost_per_unit)}</td>
      <td class="money">${money(row.current_cost)}</td>
      <td>${numberText(row.total_remaining_stock || row.product_stock)}</td>
      <td>${logisticsText(row)}</td>
      <td>${badge(productStatus(row))}</td>
      <td><div class="row-actions"><button class="icon-btn" type="button" data-open-sku="${escapeHtml(row.sku_id)}" title="Xem chi tiết"><i data-lucide="panel-right-open"></i></button></div></td>
    </tr>
  `).join('')
}

function renderCards() {
  qs('#purchaseCardList').innerHTML = state.filtered.map(row => `
    <article class="mobile-card" data-sku="${escapeHtml(row.sku_id)}">
      <div class="mobile-product">
        ${imageTag(row)}
        <div>
          <div class="product-name">${escapeHtml(row.product_name || 'Chưa có tên')}</div>
          <div class="product-sub">${escapeHtml(row.internal_sku || row.sku_id)} · ${escapeHtml(row.seller_sku || '')}</div>
        </div>
      </div>
      <div class="mobile-metrics">
        <div class="metric-line"><span>Lần nhập gần nhất</span><strong>${dateText(row.latest_import_date)}</strong></div>
        <div class="metric-line"><span>Giá vốn lô</span><strong>${money(row.latest_landed_cost_per_unit)}</strong></div>
        <div class="metric-line"><span>Giá vốn hiện tại</span><strong>${money(row.current_cost)}</strong></div>
        <div class="metric-line"><span>Tồn kho chung</span><strong>${numberText(row.total_remaining_stock || row.product_stock)}</strong></div>
        <div class="metric-line"><span>Thông số kiện</span><strong>${row.logistics_profile_status === 'ready' ? 'Đã có' : 'Thiếu'}</strong></div>
      </div>
      <div class="metric-line"><span>${badge(productStatus(row))}</span><button class="btn btn-ghost" type="button" data-open-sku="${escapeHtml(row.sku_id)}">Chi tiết</button></div>
    </article>
  `).join('')
}

async function openDrawer(sku) {
  state.activeSku = sku
  state.activeTab = 'general'
  qs('#detailDrawer').classList.add('is-open')
  if (!state.historyBySku.has(sku)) {
    try {
      const data = await api(`/api/purchase/history?sku=${encodeURIComponent(sku)}`)
      state.historyBySku.set(sku, data)
      addLog('Đọc lịch sử SKU', { sku, history: data.history?.length || 0 })
    } catch (error) {
      toast(error.message, 'error')
    }
  }
  renderDrawer()
}

function currentProduct() {
  return state.products.find(row => row.sku_id === state.activeSku) || null
}

function currentHistory() {
  return state.historyBySku.get(state.activeSku) || { history: [], cost_layers: [], current_cost: null }
}

function renderDrawer() {
  const drawer = qs('#detailDrawer')
  const product = currentProduct()
  if (!product) {
    drawer.innerHTML = '<div class="drawer-empty">Chọn một SKU để xem lịch sử nhập hàng và lớp tồn kho.</div>'
    drawer.classList.remove('is-open')
    return
  }
  const tabs = [
    ['general', 'Thông tin chung'],
    ['history', 'Lịch sử nhập hàng'],
    ['logistics', 'Thông số kiện hàng'],
    ['layers', 'Lớp tồn kho & giá vốn'],
    ['revisions', 'Lịch sử chỉnh sửa']
  ]
  drawer.innerHTML = `
    <div class="drawer-header">
      <div class="drawer-product">
        ${imageTag(product)}
        <div>
          <h2>${escapeHtml(product.product_name || product.sku_id)}</h2>
          <div class="product-sub">Mã kho: ${escapeHtml(product.internal_sku || product.sku_id)} · SKU bán sàn: ${escapeHtml(product.seller_sku || 'Chưa có')}</div>
          <div style="margin-top:8px">${badge(productStatus(product))}</div>
        </div>
      </div>
      <button class="icon-btn" type="button" data-action="close-drawer"><i data-lucide="x"></i></button>
    </div>
    <div class="drawer-tabs">${tabs.map(([id, label]) => `<button type="button" data-tab="${id}" class="${state.activeTab === id ? 'active' : ''}">${label}</button>`).join('')}</div>
    <div class="drawer-body">${renderDrawerTab(product)}</div>
  `
  if (window.lucide) window.lucide.createIcons()
}

function renderDrawerTab(product) {
  const data = currentHistory()
  if (state.activeTab === 'history') return renderHistory(data.history || [])
  if (state.activeTab === 'logistics') return renderLogistics(product, data.logistics_profile || product)
  if (state.activeTab === 'layers') return renderLayers(data.cost_layers || [], data.current_cost)
  if (state.activeTab === 'revisions') return renderRevisions(data.revisions || [])
  return renderGeneral(product, data.current_cost)
}

function renderGeneral(product, currentCost) {
  return `
    <div class="info-grid">
      ${infoRow('Product ID', product.product_id)}
      ${infoRow('SKU nội bộ', product.internal_sku || product.sku_id)}
      ${infoRow('Seller SKU', product.seller_sku)}
      ${infoRow('Danh mục', product.category)}
      ${infoRow('Trạng thái Product Core', product.product_status)}
      ${infoRow('Giá vốn hiện tại', money(product.current_cost))}
      ${infoRow('Phương pháp', currentCost?.current_cost_method || product.current_cost_method)}
      ${infoRow('Lô nhập gần nhất', product.latest_purchase_batch_id || 'Chưa có')}
      ${infoRow('Giá vốn lô gần nhất', money(product.latest_landed_cost_per_unit))}
      ${infoRow('Lô còn tồn', numberText(product.batch_count))}
    </div>
  `
}

function renderHistory(history) {
  if (!history.length) return '<div class="empty-state">Chưa có lịch sử nhập hàng cho SKU này.</div>'
  return `<div class="timeline">${history.map(row => `
    <article class="timeline-card">
      <div class="timeline-top"><span>${dateText(row.import_date)}</span><span>${escapeHtml(row.purchase_batch_id || '')}</span></div>
      <div class="timeline-meta">
        <span>Mã vận đơn: <strong>${escapeHtml(row.purchase_tracking_number || 'Chưa có')}</strong></span>
        <span>Số lượng nhập: <strong>${numberText(row.quantity_imported)} (${numberText(row.package_count)} kiện)</strong></span>
        <span>Giá nhập: <strong>${money(row.unit_purchase_price_vnd)}</strong></span>
        <span>Phí ship phân bổ: <strong>${money(perUnit(row.domestic_shipping_cost, row.international_shipping_cost, row.quantity_imported))}</strong></span>
        <span>Thuế phân bổ: <strong>${money(perUnit(row.vat_amount, row.import_tax_amount, row.quantity_imported))}</strong></span>
        <span>Giá vốn lô: <strong>${money(row.landed_cost_per_unit)}</strong></span>
        <span>Tồn còn lại: <strong>${numberText(row.quantity_remaining)}</strong></span>
        <span>Nhà cung cấp: <strong>${escapeHtml(row.supplier_name || 'Chưa có')}</strong></span>
        <span>Ghi chú: <strong>${escapeHtml(row.note || '')}</strong></span>
        <span>Thông số kiện: <strong>${escapeHtml(`${row.package_weight_kg || 0} kg, ${row.package_length_cm || 0} x ${row.package_width_cm || 0} x ${row.package_height_cm || 0} cm`)}</strong></span>
        <span>Cách tính ship: <strong>${escapeHtml(SHIPPING_METHOD_LABELS[row.shipping_calculation_method] || row.shipping_calculation_method || 'Chưa có')}</strong></span>
        <span>Source: <strong>${escapeHtml(row.source || 'warehouse_purchase_core')}</strong></span>
      </div>
      <div class="timeline-actions">
        <button class="btn btn-ghost" type="button" data-edit-item="${escapeHtml(row.id || row.purchase_batch_item_id || '')}"><i data-lucide="edit-3"></i><span>Chỉnh sửa</span></button>
        <button class="btn btn-ghost" type="button" data-tab="revisions"><i data-lucide="history"></i><span>Xem lịch sử sửa</span></button>
      </div>
    </article>
  `).join('')}</div>`
}

function renderLogistics(product, profile) {
  return `
    <div class="info-grid">
      ${infoRow('Trạng thái', profile?.logistics_profile_status === 'ready' ? 'Đã có mặc định' : 'Thiếu thông số kiện')}
      ${infoRow('Kg / kiện', profile?.package_weight_kg || product.package_weight_kg)}
      ${infoRow('D x R x C', `${profile?.package_length_cm || product.package_length_cm || 0} x ${profile?.package_width_cm || product.package_width_cm || 0} x ${profile?.package_height_cm || product.package_height_cm || 0} cm`)}
      ${infoRow('Khối / kiện', profile?.package_volume_m3 || product.package_volume_m3)}
      ${infoRow('Số SP / kiện mặc định', profile?.default_quantity_per_package || product.default_quantity_per_package)}
      ${infoRow('Cách tính vận chuyển', SHIPPING_METHOD_LABELS[profile?.shipping_calculation_method || product.shipping_calculation_method] || 'Chưa chọn')}
      ${infoRow('Nguồn cập nhật', profile?.logistics_profile_source || 'warehouse_purchase_core')}
      ${infoRow('Cập nhật lần cuối', profile?.last_logistics_profile_updated_at || 'Chưa có')}
    </div>
  `
}

function perUnit(a, b, qty) {
  const q = Number(qty || 0)
  if (!q) return null
  return (Number(a || 0) + Number(b || 0)) / q
}

function renderLayers(layers, currentCost) {
  if (!layers.length) return '<div class="empty-state">Chưa có lớp tồn kho theo lô.</div>'
  const current = currentCost?.current_cost
  return `
    <div class="timeline">
      ${layers.map(row => {
        const contribution = Number(current || 0) > 0
          ? (Number(row.quantity_remaining || 0) * Number(row.landed_cost_per_unit || 0))
          : 0
        return `<article class="layer-card">
          ${infoRow('Ngày nhập', dateText(row.import_date))}
          ${infoRow('Mã lô', row.purchase_batch_id)}
          ${infoRow('Tồn còn lại', numberText(row.quantity_remaining))}
          ${infoRow('Giá vốn lô', money(row.landed_cost_per_unit))}
          ${infoRow('Đóng góp vào current_cost', money(contribution))}
          ${infoRow('Trạng thái lớp', row.layer_status)}
        </article>`
      }).join('')}
      <article class="formula-card">${infoRow('Current cost cuối cùng', money(current))}${infoRow('Method', 'weighted_average_remaining_stock')}</article>
    </div>
  `
}

function renderFormula(history) {
  const row = history[0]
  if (!row) return '<div class="empty-state">Chưa có formula_snapshot.</div>'
  const snapshot = safeJson(row.formula_snapshot)
  return `<pre class="formula-card">${escapeHtml(JSON.stringify(snapshot, null, 2))}</pre>`
}

function renderReport(product, data) {
  return `
    <div class="info-grid">
      ${infoRow('SKU', product.sku_id)}
      ${infoRow('Số lô đã nhập', numberText((data.history || []).length))}
      ${infoRow('Số lớp tồn kho', numberText((data.cost_layers || []).length))}
      ${infoRow('Giá vốn hiện tại', money(data.current_cost?.current_cost))}
      ${infoRow('Tổng tồn còn lại', numberText(data.current_cost?.total_remaining_stock))}
      ${infoRow('Nguồn', 'warehouse_purchase_core')}
    </div>
  `
}

function renderRevisions(revisions) {
  if (!revisions.length) return '<div class="empty-state">Chưa có lịch sử chỉnh sửa cho SKU này.</div>'
  return `<div class="timeline">${revisions.map(row => {
    const fields = safeJson(row.changed_fields)
    return `<article class="timeline-card">
      <div class="timeline-top"><span>${escapeHtml(row.edited_at || '')}</span><span>${escapeHtml(row.edited_by || 'system')}</span></div>
      <div class="timeline-meta">
        <span>Lý do sửa: <strong>${escapeHtml(row.edit_reason || 'Chưa có')}</strong></span>
        <span>Field đã đổi: <strong>${escapeHtml(Array.isArray(fields) ? fields.join(', ') : JSON.stringify(fields))}</strong></span>
      </div>
      <details class="revision-details">
        <summary>Before / after</summary>
        <pre>${escapeHtml(JSON.stringify({ before: safeJson(row.before_payload), after: safeJson(row.after_payload) }, null, 2))}</pre>
      </details>
    </article>`
  }).join('')}</div>`
}

function safeJson(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return { raw: value } }
}

function infoRow(label, value) {
  return `<div class="info-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? 'Chưa có')}</strong></div>`
}

function formObject(form) {
  return Object.fromEntries(new FormData(form).entries())
}

function updatePackageVolume(form) {
  const length = Number(form.elements.package_length_cm?.value || 0)
  const width = Number(form.elements.package_width_cm?.value || 0)
  const height = Number(form.elements.package_height_cm?.value || 0)
  const volume = length > 0 && width > 0 && height > 0 ? (length * width * height) / 1000000 : 0
  if (form.elements.package_volume_m3) form.elements.package_volume_m3.value = volume ? volume.toFixed(6) : ''
}

function fillLogisticsFromSelectedSku() {
  const form = qs('#manualForm')
  const sku = form.elements.ma_hang?.value
  const product = state.products.find(row => [row.sku_id, row.internal_sku, row.seller_sku].filter(Boolean).includes(sku))
  if (!product) return
  const map = {
    package_length_cm: product.package_length_cm,
    package_width_cm: product.package_width_cm,
    package_height_cm: product.package_height_cm,
    package_weight_kg: product.package_weight_kg,
    sl_sp_tren_kien: product.default_quantity_per_package,
    shipping_calculation_method: product.shipping_calculation_method
  }
  Object.entries(map).forEach(([field, value]) => {
    if (value !== null && value !== undefined && value !== '' && form.elements[field] && !form.elements[field].value) form.elements[field].value = value
  })
  updatePackageVolume(form)
}

function parseWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Không đọc được file Excel.'))
    reader.onload = event => {
      const workbook = XLSX.read(new Uint8Array(event.target.result), { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
      resolve(normalizeExcelRows(rows))
    }
    reader.readAsArrayBuffer(file)
  })
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function normalizeExcelRows(rows) {
  const headerIndex = rows.findIndex(row => row.map(normalizeHeader).some(cell => ['ten_san_pham', 'ma_hang', 'sku', 'ngay_nhap_hang'].includes(cell)))
  if (headerIndex < 0) throw new Error('Không tìm thấy hàng tiêu đề Excel.')
  const headers = rows[headerIndex].map(normalizeHeader)
  const dataRows = rows.slice(headerIndex + 1)
  return dataRows.map(row => {
    const item = {}
    headers.forEach((key, index) => {
      if (!key) return
      item[key] = row[index]
    })
    return mapExcelRow(item)
  }).filter(row => Object.values(row).some(value => String(value || '').trim()))
}

function mapExcelRow(row) {
  return {
    ten_san_pham: pick(row, 'ten_san_pham', 'ten_sp', 'san_pham'),
    ma_van_don: pick(row, 'ma_van_don', 'mavandon'),
    ma_hang: pick(row, 'ma_hang', 'sku', 'seller_sku'),
    sl_nhap: numberInput(pick(row, 'sl_nhap', 'so_luong', 'quantity')),
    gia_nhap_te: numberInput(pick(row, 'gia_nhap_te', 'gia_nhap', 'unit_purchase_price_foreign')),
    gia_khai_thue: numberInput(pick(row, 'gia_khai_thue', 'declared_tax_price')),
    ship_noi_dia_te: numberInput(pick(row, 'ship_noi_dia_te', 'ship_noi_dia')),
    so_kien: numberInput(pick(row, 'so_kien', 'package_count')),
    sl_sp_tren_kien: numberInput(pick(row, 'sl_sp_tren_kien', 'sl_sp_kien', 'quantity_per_package')),
    trong_luong_kg: numberInput(pick(row, 'trong_luong_kg', 'tong_kg')),
    thue_vat_percent: numberInput(pick(row, 'thue_vat_percent', 'vat_percent')),
    phi_vanchuyen_thuc: numberInput(pick(row, 'phi_vanchuyen_thuc', 'tong_tien_van_chuyen')),
    cong_dung: pick(row, 'cong_dung', 'muc_dich'),
    chat_lieu: pick(row, 'chat_lieu'),
    link_nhap_hang: pick(row, 'link_nhap_hang', 'link_sp'),
    kich_thuoc_sp_d: numberInput(pick(row, 'kich_thuoc_sp_d')),
    kich_thuoc_sp_r: numberInput(pick(row, 'kich_thuoc_sp_r')),
    kich_thuoc_sp_c: numberInput(pick(row, 'kich_thuoc_sp_c')),
    kich_thuoc_d: numberInput(pick(row, 'kich_thuoc_d')),
    kich_thuoc_r: numberInput(pick(row, 'kich_thuoc_r')),
    kich_thuoc_c: numberInput(pick(row, 'kich_thuoc_c')),
    package_length_cm: numberInput(pick(row, 'package_length_cm', 'dai_kien', 'chieu_dai_kien')),
    package_width_cm: numberInput(pick(row, 'package_width_cm', 'rong_kien', 'chieu_rong_kien')),
    package_height_cm: numberInput(pick(row, 'package_height_cm', 'cao_kien', 'chieu_cao_kien')),
    package_weight_kg: numberInput(pick(row, 'package_weight_kg', 'kg_kien', 'can_nang_kien')),
    shipping_calculation_method: pick(row, 'shipping_calculation_method', 'cach_tinh_vc'),
    cach_tinh_vc: pick(row, 'cach_tinh_vc'),
    image_url: pick(row, 'image_url'),
    ngay_nhap_hang: excelDate(pick(row, 'ngay_nhap_hang', 'import_date')),
    supplier_name: pick(row, 'supplier_name', 'nha_cung_cap'),
    source: 'excel_preview'
  }
}

function pick(row, ...keys) {
  for (const key of keys) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return value
  }
  return ''
}

function numberInput(value) {
  if (value === '' || value === null || value === undefined) return ''
  const number = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(number) ? number : ''
}

function excelDate(value) {
  if (!value) return ''
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value)
    if (date) return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
  }
  return String(value).slice(0, 10)
}

async function handleExcelFile(file) {
  setLoading(true, 'Đang parse Excel và gửi backend preview...')
  try {
    state.importRawRows = await parseWorkbook(file)
    const preview = await api('/api/purchase/import-preview', {
      method: 'POST',
      body: JSON.stringify({ rows: state.importRawRows })
    })
    state.importPreviewRows = preview.rows || []
    renderPreview(preview)
    syncActionDisabledStates()
    openModal('#importModal')
    addLog('Preview Excel xong', { ready: preview.ready_count, blocked: preview.blocked_count })
  } catch (error) {
    toast(error.message, 'error')
    addLog('Preview Excel lỗi', error.message)
  } finally {
    qs('#excelInput').value = ''
    setLoading(false, 'Dữ liệu đọc từ Warehouse/Purchase Core')
  }
}

function renderPreview(preview) {
  qs('#previewSummary').innerHTML = `
    <span class="badge green">Ready: ${numberText(preview.ready_count)}</span>
    <span class="badge red">Blocked: ${numberText(preview.blocked_count)}</span>
  `
  qs('#previewBody').innerHTML = (preview.rows || []).map(row => `
    <tr>
      <td>${row.row_index}</td>
      <td>${escapeHtml(row.sku_id || row.internal_sku || '')}</td>
      <td>${escapeHtml(row.product_name || row.raw_payload?.ten_san_pham || '')}</td>
      <td>${dateText(row.import_date)}</td>
      <td>${numberText(row.quantity_imported)}</td>
      <td>${money(row.landed_cost_per_unit)}</td>
      <td>${row.status === 'ready' ? badge('import_ready') : `<span class="badge red">${escapeHtml(BLOCK_REASON_LABELS[row.block_reason] || row.block_reason)}</span>`}</td>
    </tr>
  `).join('')
}

async function confirmImport() {
  const readyRawRows = state.importPreviewRows
    .filter(row => row.status === 'ready')
    .map(row => row.raw_payload)
  if (!readyRawRows.length) {
    toast('Không có row hợp lệ để confirm.', 'error')
    return
  }
  setLoading(true, 'Đang ghi Purchase Core...')
  try {
    const result = await api('/api/purchase/import-confirm', {
      method: 'POST',
      body: JSON.stringify({ rows: readyRawRows })
    })
    closeModal('#importModal')
    toast(`Đã ghi ${result.inserted_count} lô nhập vào Core.`)
    addLog('Confirm import thành công', result)
    await loadPurchaseReadModel()
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    setLoading(false, 'Dữ liệu đọc từ Warehouse/Purchase Core')
  }
}

async function previewManual() {
  const row = formObject(qs('#manualForm'))
  setLoading(true, 'Đang preview lô nhập thủ công...')
  try {
    const preview = await api('/api/purchase/manual-preview', {
      method: 'POST',
      body: JSON.stringify(row)
    })
    state.manualPreviewRow = preview.rows?.[0] || null
    renderManualPreview(state.manualPreviewRow)
    addLog('Preview manual', state.manualPreviewRow)
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    setLoading(false, 'Dữ liệu đọc từ Warehouse/Purchase Core')
    syncActionDisabledStates()
  }
}

function renderManualPreview(row) {
  if (!row) {
    qs('#manualPreview').innerHTML = ''
    return
  }
  qs('#manualPreview').innerHTML = row.status === 'ready'
    ? `<div class="formula-card">${infoRow('SKU', row.sku_id)}${infoRow('Tổng kg', numberText(row.total_weight_kg))}${infoRow('Tổng khối', numberText(row.total_volume_m3))}${infoRow('Phí ship phân bổ / SP', money(row.allocated_shipping_per_unit))}${infoRow('Giá vốn lô', money(row.landed_cost_per_unit))}${infoRow('Tổng giá trị lô', money(row.total_batch_cost))}${infoRow('Tồn còn lại', numberText(row.quantity_remaining))}</div>`
    : `<div class="formula-card">${infoRow('Trạng thái', 'Bị chặn')}${infoRow('Lý do', BLOCK_REASON_LABELS[row.block_reason] || row.block_reason)}</div>`
}

async function confirmManual() {
  const row = formObject(qs('#manualForm'))
  setLoading(true, 'Đang confirm lô nhập thủ công...')
  try {
    const result = await api('/api/purchase/manual-confirm', {
      method: 'POST',
      body: JSON.stringify({ ...row, update_logistics_profile: row.update_logistics_profile === '1' })
    })
    closeModal('#manualModal')
    toast(`Đã ghi ${result.inserted_count} lô nhập.`)
    addLog('Confirm manual thành công', result)
    await loadPurchaseReadModel()
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    setLoading(false, 'Dữ liệu đọc từ Warehouse/Purchase Core')
  }
}

function openEditItem(itemId) {
  const data = currentHistory()
  const item = (data.history || []).find(row => String(row.id || row.purchase_batch_item_id || '') === String(itemId))
  if (!item) {
    toast('Không tìm thấy dòng nhập để chỉnh sửa.', 'error')
    return
  }
  state.editingItem = item
  const form = qs('#editForm')
  Object.entries({
    purchase_batch_item_id: item.id || item.purchase_batch_item_id,
    import_date: String(item.import_date || '').slice(0, 10),
    quantity_imported: item.quantity_imported,
    package_count: item.package_count,
    quantity_per_package: item.quantity_per_package,
    package_length_cm: item.package_length_cm,
    package_width_cm: item.package_width_cm,
    package_height_cm: item.package_height_cm,
    package_weight_kg: item.package_weight_kg,
    shipping_calculation_method: item.shipping_calculation_method || 'by_weight',
    unit_purchase_price_foreign: item.unit_purchase_price_foreign,
    unit_purchase_price_vnd: item.unit_purchase_price_vnd,
    declared_tax_price: item.declared_tax_price,
    international_shipping_cost: item.international_shipping_cost,
    vat_percent: item.vat_percent,
    supplier_name: item.supplier_name,
    purchase_tracking_number: item.purchase_tracking_number,
    edit_reason: ''
  }).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value ?? ''
  })
  openModal('#editModal')
}

async function saveEditItem() {
  const form = qs('#editForm')
  const values = formObject(form)
  if (!values.edit_reason?.trim()) {
    toast('Bắt buộc nhập lý do sửa.', 'error')
    return
  }
  setLoading(true, 'Đang lưu revision và tính lại current_cost...')
  try {
    const result = await api('/api/purchase/batch-item-edit', {
      method: 'PATCH',
      body: JSON.stringify({
        purchase_batch_item_id: values.purchase_batch_item_id,
        patch: values,
        edit_reason: values.edit_reason
      })
    })
    closeModal('#editModal')
    state.historyBySku.delete(state.activeSku)
    toast('Đã lưu chỉnh sửa và tạo lịch sử sửa.')
    addLog('Chỉnh sửa dòng nhập', result)
    await loadPurchaseReadModel()
    if (state.activeSku) await openDrawer(state.activeSku)
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    setLoading(false, 'Dữ liệu đọc từ Warehouse/Purchase Core')
  }
}

async function loadSettings() {
  const data = await api('/api/purchase/settings')
  state.settings = data.settings || {}
  const form = qs('#settingsForm')
  Object.entries(state.settings).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value
  })
  const manual = qs('#manualForm')
  if (manual.elements.exchange_rate && !manual.elements.exchange_rate.value) manual.elements.exchange_rate.value = state.settings.ti_gia_te || state.settings.exchange_rate || 3650
  if (manual.elements.thue_vat_percent && !manual.elements.thue_vat_percent.value) manual.elements.thue_vat_percent.value = 10
  if (manual.elements.ngay_nhap_hang && !manual.elements.ngay_nhap_hang.value) manual.elements.ngay_nhap_hang.value = new Date().toISOString().slice(0, 10)
}

async function saveSettings() {
  const values = formObject(qs('#settingsForm'))
  const settings = Object.entries(values).map(([key, value]) => ({ key, value }))
  setLoading(true, 'Đang lưu cài đặt...')
  try {
    await api('/api/purchase/settings', {
      method: 'PATCH',
      body: JSON.stringify({ settings })
    })
    closeModal('#settingsModal')
    toast('Đã lưu tỉ giá và phí ship.')
    await loadSettings()
  } catch (error) {
    toast(error.message, 'error')
  } finally {
    setLoading(false, 'Dữ liệu đọc từ Warehouse/Purchase Core')
  }
}

async function exportData(type) {
  try {
    const params = new URLSearchParams()
    const filters = filterPayload()
    Object.entries(filters).forEach(([key, value]) => {
      if (value && ['search', 'stock_status', 'cost_status', 'logistics_status'].includes(key)) params.set(key, value)
    })
    const data = await api(`/api/purchase/export?${params.toString()}`)
    const rows = data.rows || []
    if (type === 'excel') {
      writeTabularFile(rows.map(exportRowVi), 'NhapHangCore', `HuyVan_NhapHangCore_${new Date().toISOString().slice(0, 10)}`)
    } else {
      if (!window.jspdf?.jsPDF) {
        writeCsvFile(rows.map(exportRowVi), `HuyVan_NhapHangCore_${new Date().toISOString().slice(0, 10)}_pdf_fallback.csv`)
        toast('Thư viện PDF chưa tải, đã xuất CSV UTF-8 để không mất dữ liệu.', 'error')
        return
      }
      const { jsPDF } = window.jspdf
      const doc = new jsPDF('l', 'mm', 'a4')
      doc.text('Quản lý nhập hàng chính ngạch - Warehouse Purchase Core', 14, 14)
      doc.autoTable({
        startY: 20,
        head: [['Sản phẩm', 'SKU', 'Ngày nhập', 'Mã lô', 'Mã vận đơn', 'SL nhập', 'Tồn', 'Giá vốn lô', 'Giá vốn hiện tại', 'Tổng lô', 'NCC', 'Source']],
        body: rows.map(row => [
          row.product_name, row.sku, row.import_date, row.purchase_batch_id, row.purchase_tracking_number,
          row.quantity_imported, row.quantity_remaining, money(row.landed_cost_per_unit), money(row.current_cost),
          money(row.total_batch_cost), row.supplier_name, row.source
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [8, 145, 178] }
      })
      doc.save(`HuyVan_NhapHangCore_${new Date().toISOString().slice(0, 10)}.pdf`)
    }
    toast(`Đã xuất ${type.toUpperCase()} theo filter hiện tại.`)
    addLog(`Export ${type}`, { rows: rows.length })
  } catch (error) {
    toast(error.message, 'error')
  }
}

function writeTabularFile(rows, sheetName, fileBaseName) {
  if (window.XLSX?.utils) {
    const ws = window.XLSX.utils.json_to_sheet(rows)
    const wb = window.XLSX.utils.book_new()
    window.XLSX.utils.book_append_sheet(wb, ws, sheetName)
    window.XLSX.writeFile(wb, `${fileBaseName}.xlsx`)
    return
  }
  writeCsvFile(rows, `${fileBaseName}.csv`)
}

function writeCsvFile(rows, filename) {
  const dataRows = rows || []
  const headers = [...new Set(dataRows.flatMap(row => Object.keys(row || {})))]
  const escapeCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`
  const csv = [
    headers.map(escapeCell).join(','),
    ...dataRows.map(row => headers.map(header => escapeCell(row?.[header])).join(','))
  ].join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function exportRowVi(row) {
  return {
    'Sản phẩm': row.product_name,
    'SKU': row.sku,
    'Ngày nhập': row.import_date,
    'Mã lô': row.purchase_batch_id,
    'Mã vận đơn': row.purchase_tracking_number,
    'Số lượng nhập': row.quantity_imported,
    'Tồn còn lại': row.quantity_remaining,
    'Giá vốn lô': row.landed_cost_per_unit,
    'Giá vốn hiện tại': row.current_cost,
    'Tổng giá trị lô': row.total_batch_cost,
    'Nhà cung cấp': row.supplier_name,
    'Source': row.source,
    'Ảnh sản phẩm': row.image_url
  }
}

function exportBatch(type) {
  const batch = state.activeBatchMeta
  const items = state.activeBatchItems || []
  if (!batch || !items.length) {
    toast('Chưa có chi tiết đợt nhập để xuất file.', 'error')
    return
  }
  const exportDate = new Date().toISOString().slice(0, 10)
  let rows = []
  let sheetName = 'PackingList'
  if (type === 'customs') {
    sheetName = 'ToKhai'
    rows = items.map(item => ({
      'Tên sản phẩm': item.product_name,
      'SKU': item.internal_sku || item.sku_id,
      'Công dụng': item.cong_dung,
      'Chất liệu': item.chat_lieu,
      'Số lượng': item.quantity_imported,
      'Giá khai thuế': item.declared_tax_price,
      'Tổng giá khai thuế': Number(item.quantity_imported || 0) * Number(item.declared_tax_price || 0),
      'Thuế VAT %': item.vat_percent,
      'Tiền thuế': item.vat_amount,
      'Mã vận đơn': item.purchase_tracking_number,
      'Nhà cung cấp': item.supplier_name,
      'Link nhập hàng': item.link_nhap_hang,
      'Ghi chú': item.note
    }))
  } else if (type === 'cost') {
    sheetName = 'TongHopChiPhi'
    rows = items.map(item => ({
      'SKU': item.internal_sku || item.sku_id,
      'Số lượng': item.quantity_imported,
      'Giá nhập': item.unit_purchase_price_vnd,
      'Giá khai thuế': item.declared_tax_price,
      'Phí ship phân bổ': item.allocated_shipping_per_unit,
      'Thuế phân bổ': item.allocated_tax_per_unit,
      'Phí khác': item.other_fee,
      'Giá vốn lô': item.landed_cost_per_unit,
      'Tổng giá vốn dòng': item.total_batch_cost
    }))
  } else {
    rows = items.map((item, index) => ({
      'STT': index + 1,
      'Tên sản phẩm': item.product_name,
      'SKU': item.internal_sku || item.sku_id,
      'Số lượng': item.quantity_imported,
      'Số kiện': item.package_count,
      'Số sản phẩm/kiện': item.quantity_per_package,
      'Cân nặng/kiện': item.package_weight_kg,
      'Dài': item.package_length_cm,
      'Rộng': item.package_width_cm,
      'Cao': item.package_height_cm,
      'Khối/kiện': item.package_volume_m3,
      'Tổng kg': item.total_weight_kg,
      'Tổng khối': item.total_volume_m3,
      'Link nhập hàng': item.link_nhap_hang,
      'Ghi chú': item.note
    }))
  }
  rows.push({ 'STT': 'Tổng cộng', 'Số lượng': batch.total_quantity, 'Số kiện': batch.total_package_count, 'Tổng kg': batch.total_weight_kg, 'Tổng khối': batch.total_volume_m3 })
  writeTabularFile(rows, sheetName, `HuyVan_${sheetName}_${batch.batch_code || batch.import_batch_id || batch.purchase_batch_id}_${exportDate}`)
  toast(`Đã xuất ${sheetName} từ Purchase Core.`)
}

function openModal(selector) {
  qs(selector).hidden = false
  if (window.lucide) window.lucide.createIcons()
}

function closeModal(selector) {
  qs(selector).hidden = true
}

function resetFilter() {
  ['#filterSearch', '#filterSupplier', '#filterFrom', '#filterTo'].forEach(selector => { qs(selector).value = '' })
  ;['#filterCategory', '#filterStockStatus', '#filterCostStatus', '#filterLogisticsStatus'].forEach(selector => { qs(selector).value = '' })
  loadPurchaseReadModel()
}

function copyLog() {
  const text = JSON.stringify(state.log, null, 2)
  navigator.clipboard?.writeText(text).then(() => toast('Đã copy log thao tác.')).catch(() => {
    window.prompt('Copy log thao tác:', text)
  })
}

function wireEvents() {
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action
    const openSku = event.target.closest('[data-open-sku]')?.dataset.openSku
    const openBatch = event.target.closest('[data-open-batch]')?.dataset.openBatch
    const editItem = event.target.closest('[data-edit-item]')?.dataset.editItem
    const sectionTab = event.target.closest('[data-section-tab]')?.dataset.sectionTab
    const exportBatchType = event.target.closest('[data-export-batch]')?.dataset.exportBatch
    const tab = event.target.closest('[data-tab]')?.dataset.tab
    if (openSku) openDrawer(openSku)
    if (openBatch) openBatchDetail(openBatch)
    if (editItem) openEditItem(editItem)
    if (exportBatchType) {
      try {
        exportBatch(exportBatchType)
      } catch (error) {
        toast(error.message || 'Không xuất được file đợt nhập.', 'error')
        addLog('Export batch lỗi', error.message || String(error))
      }
    }
    if (sectionTab) switchSection(sectionTab)
    if (tab) {
      state.activeTab = tab
      renderDrawer()
    }
    if (!action) return
    const actions = {
      'import-excel': () => qs('#excelInput').click(),
      'open-manual': () => openModal('#manualModal'),
      'sync-product-core': loadPurchaseReadModel,
      'export-excel': () => exportData('excel'),
      'export-pdf': () => exportData('pdf'),
      'open-settings': () => openModal('#settingsModal'),
      'close-settings': () => closeModal('#settingsModal'),
      'save-settings': saveSettings,
      'reload-batches': loadImportBatches,
      'reset-filter': resetFilter,
      'apply-filter': loadPurchaseReadModel,
      'copy-log': copyLog,
      'close-import': () => closeModal('#importModal'),
      'confirm-import': confirmImport,
      'close-manual': () => closeModal('#manualModal'),
      'preview-manual': previewManual,
      'confirm-manual': confirmManual,
      'close-edit': () => closeModal('#editModal'),
      'save-edit': saveEditItem,
      'close-drawer': () => {
        state.activeSku = ''
        renderDrawer()
      }
    }
    actions[action]?.()
  })

  qs('#excelInput').addEventListener('change', event => {
    const file = event.target.files?.[0]
    if (file) handleExcelFile(file)
  })
  qs('#filterSearch').addEventListener('keydown', event => {
    if (event.key === 'Enter') loadPurchaseReadModel()
  })
  qsa('#filterCategory,#filterStockStatus,#filterCostStatus,#filterLogisticsStatus').forEach(el => {
    el.addEventListener('change', loadPurchaseReadModel)
  })
  qs('#manualForm').addEventListener('input', event => {
    if (['package_length_cm', 'package_width_cm', 'package_height_cm'].includes(event.target.name)) updatePackageVolume(qs('#manualForm'))
  })
  qs('#manualForm').elements.ma_hang.addEventListener('change', fillLogisticsFromSelectedSku)
  qs('#selectAllRows').addEventListener('change', event => {
    state.selected = event.target.checked ? new Set(state.filtered.map(row => row.sku_id)) : new Set()
    renderTable()
  })
  document.addEventListener('change', event => {
    if (!event.target.matches('.row-check')) return
    const sku = event.target.dataset.sku
    if (event.target.checked) state.selected.add(sku)
    else state.selected.delete(sku)
  })
}

async function initPurchasePage() {
  wireEvents()
  if (window.lucide) window.lucide.createIcons()
  await loadSettings().catch(error => toast(error.message, 'error'))
  await loadPurchaseReadModel()
}

document.addEventListener('DOMContentLoaded', initPurchasePage)
