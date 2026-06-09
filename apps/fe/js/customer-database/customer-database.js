import { API } from '../oms-dashboard/oms-api.js'

const state = { rows: [], visibleRows: [], summary: {} }

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function escapeHtml(value) {
  return cleanText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function customerName(row) {
  return cleanText(row.recipient_name || row.customer_name || row.buyer_username || 'Khách sàn')
}

function customerId(row) {
  return cleanText(row.buyer_id || row.buyer_username || row.contact_key || row.source_order_id || row.last_order_id)
}

function phoneText(row) {
  return cleanText(row.phone || row.phone_normalized || row.phone_last4)
}

function dedupeKey(row) {
  const phone = cleanText(row.phone_normalized || row.phone)
  if (phone) return `${row.platform}|${row.shop}|phone:${phone}`
  const buyer = customerId(row).toLowerCase()
  if (buyer) return `${row.platform}|${row.shop}|id:${buyer}`
  const name = customerName(row).toLowerCase()
  const address = cleanText(row.address_text).toLowerCase()
  return `${row.platform}|${row.shop}|${name}|${address || row.last_order_id || row.source_order_id}`
}

function dedupeRows(rows) {
  const map = new Map()
  for (const row of rows) {
    const key = dedupeKey(row)
    const current = map.get(key)
    if (!current || cleanText(row.last_seen_at) > cleanText(current.last_seen_at)) {
      map.set(key, row)
    }
  }
  return [...map.values()]
}

function statusLabel(row) {
  const consent = cleanText(row.consent_status || 'unknown')
  const contact = cleanText(row.contact_status || 'not_contacted')
  return `
    <div class="badge-line">
      <span class="badge ${consent === 'unknown' ? 'warn' : ''}">Đồng ý: ${escapeHtml(consent)}</span>
      <span class="badge">Liên hệ: ${escapeHtml(contact)}</span>
    </div>
  `
}

function renderSummary() {
  const el = document.getElementById('customerSummary')
  const item = state.summary || {}
  const marketplaceTotal = Number(item.shopee_total || 0) + Number(item.tiktok_total || 0) + Number(item.lazada_total || 0)
  const socialTotal = Number(item.zalo_total || 0) + Number(item.facebook_total || 0)
  const values = [
    ['Tổng khách', item.total || 0],
    ['Sau lọc trùng', state.visibleRows.length || 0],
    ['Sàn TMĐT', marketplaceTotal],
    ['Zalo/Facebook', socialTotal],
    ['Có SĐT', item.with_phone || 0],
    ['Có địa chỉ', item.with_address || 0]
  ]
  el.innerHTML = values.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${Number(value || 0).toLocaleString('vi-VN')}</b></div>`).join('')
}

function renderRows() {
  const el = document.getElementById('customerList')
  if (!state.visibleRows.length) {
    el.innerHTML = '<div class="empty-state">Chưa có dữ liệu khách hàng trong Customer Core.</div>'
    return
  }
  el.innerHTML = state.visibleRows.map(row => `
    <article class="customer-row" data-customer-row>
      <div class="customer-cell customer-name">
        <b>${escapeHtml(customerName(row))}</b>
        <small>${escapeHtml(row.platform || '-').toUpperCase()} · ${escapeHtml(row.shop || '-')}</small>
      </div>
      <div class="customer-cell">
        <span>${escapeHtml(phoneText(row) || 'Chưa có số')}</span>
      </div>
      <div class="customer-cell customer-address">
        <span>${escapeHtml(row.address_text || 'Chưa có địa chỉ')}</span>
      </div>
      <div class="customer-cell">
        <span>${escapeHtml(customerId(row) || 'Chưa có ID')}</span>
        <small>Đơn cuối: ${escapeHtml(row.last_order_id || row.source_order_id || '-')}</small>
      </div>
      <div class="customer-cell">
        <span>${escapeHtml(row.source || '-')}</span>
        <small>${escapeHtml(row.last_seen_at || row.last_synced_at || '-')}</small>
        ${statusLabel(row)}
      </div>
    </article>
  `).join('')
}

async function readJson(path, options = {}) {
  const response = await fetch(`${API}${path}`, { cache: 'no-store', ...options })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || data.message || `HTTP ${response.status}`)
  return data
}

function currentQuery() {
  const platform = cleanText(document.getElementById('customerPlatform')?.value)
  const search = cleanText(document.getElementById('customerSearch')?.value)
  const query = new URLSearchParams({ limit: '500' })
  if (platform) query.set('platform', platform)
  if (search) query.set('search', search)
  return query
}

async function loadCustomers() {
  const query = currentQuery()
  const [summary, list] = await Promise.all([
    readJson(`/api/customers/marketplace/summary?${query.toString()}`),
    readJson(`/api/customers/marketplace?${query.toString()}`)
  ])
  state.summary = summary
  state.rows = Array.isArray(list.data) ? list.data : []
  state.visibleRows = dedupeRows(state.rows)
  renderSummary()
  renderRows()
}

async function rebuildCustomers() {
  const button = document.getElementById('btnRebuildCustomers')
  button.disabled = true
  button.textContent = 'Đang đồng bộ...'
  try {
    await readJson('/api/customers/marketplace/rebuild', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 150, trigger: 'customer_database_page' })
    })
    await loadCustomers()
  } finally {
    button.disabled = false
    button.textContent = 'Đồng bộ lại Core'
  }
}

function csvCell(value) {
  return `"${cleanText(value).replace(/"/g, '""')}"`
}

function downloadCustomers() {
  const headers = ['ten_khach_hang', 'so_dien_thoai', 'dia_chi', 'id_khach_hang', 'san', 'shop', 'don_cuoi', 'nguon', 'lan_cuoi']
  const rows = state.visibleRows.map(row => [
    customerName(row),
    phoneText(row),
    row.address_text,
    customerId(row),
    row.platform,
    row.shop,
    row.last_order_id || row.source_order_id,
    row.source,
    row.last_seen_at || row.last_synced_at
  ])
  const csv = `\ufeff${headers.map(csvCell).join(',')}\n${rows.map(row => row.map(csvCell).join(',')).join('\n')}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)
  link.href = url
  link.download = `shophuyvan-khach-hang-san-${stamp}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

let searchTimer = 0
document.getElementById('customerPlatform')?.addEventListener('change', loadCustomers)
document.getElementById('btnCustomerRefresh')?.addEventListener('click', loadCustomers)
document.getElementById('btnRebuildCustomers')?.addEventListener('click', rebuildCustomers)
document.getElementById('btnDownloadCustomers')?.addEventListener('click', downloadCustomers)
document.getElementById('customerSearch')?.addEventListener('input', () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadCustomers, 250)
})

loadCustomers().catch(error => {
  document.getElementById('customerList').innerHTML = `<div class="empty-state">Lỗi tải dữ liệu: ${escapeHtml(error.message)}</div>`
})
