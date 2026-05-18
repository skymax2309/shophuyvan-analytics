import {
  buildOrdersV2,
  fillFirstSku,
  loadCostConfig,
  mergeOrderLines,
  normalizeOrder,
  parseFileMeta
} from '../parser/index.js'

const API = 'https://huyvan-worker-api.nghiemchihuy.workers.dev'
const btn = document.getElementById('btnImport')
const fileInput = document.getElementById('file')
const log = document.getElementById('log')

function fmt(value) {
  return Number(value || 0).toLocaleString('vi-VN')
}

function uniqueCount(rows) {
  return new Set(rows.map(row => row.order_id)).size
}

function setLog(html) {
  log.innerHTML = html
}

function addLog(html) {
  log.innerHTML += html
}

function renderSummary(meta, orders, skipped) {
  const normal = orders.filter(order => order.order_type === 'normal')
  const cancel = orders.filter(order => order.order_type === 'cancel')
  const returns = orders.filter(order => order.order_type === 'return')
  const uniqueNormal = uniqueCount(normal)
  const uniqueCancel = uniqueCount(cancel)
  const uniqueReturn = uniqueCount(returns)
  const totalUnique = uniqueNormal + uniqueCancel + uniqueReturn
  const allNonCancel = orders.filter(order => order.order_type !== 'cancel')
  const totalA = allNonCancel.reduce((sum, order) => sum + (order.raw_revenue || 0), 0)
  const totalD = returns.reduce((sum, order) => sum + (order.raw_revenue || 0), 0)
  const totalShopDiscount = allNonCancel.reduce((sum, order) => sum + (order.shop_discount || 0), 0)
  const totalComboDiscount = allNonCancel.reduce((sum, order) => sum + (order.combo_discount || 0), 0)
  const totalShopeeVoucher = allNonCancel.reduce((sum, order) => sum + (order.shopee_voucher || 0), 0)
  const totalRevenue = totalA - totalD
  const totalReturnFee = returns.reduce((sum, order) => sum + (order.return_fee || 0), 0)
  const cancelRate = totalUnique > 0 ? ((uniqueCancel / totalUnique) * 100).toFixed(1) : '0.0'
  const platformTag = `<span class="tag tag-${meta.platform}">${meta.platform.toUpperCase()}</span>`

  // NEO: Tóm tắt import dùng số đơn unique theo order_id để đối chiếu trực tiếp với Dashboard và ShipXanh.
  setLog(`
    <b>Sàn:</b> ${platformTag} &nbsp; <b>Shop:</b> ${meta.shop}<br><br>
    <div class="summary-row"><span class="summary-label">Tổng dòng đọc được</span><span class="summary-value">${orders.length} dòng</span></div>
    <div class="summary-row"><span class="summary-label"><span class="tag tag-normal">Bán</span> Đơn thành công</span><span class="summary-value">${uniqueNormal} đơn</span></div>
    <div class="summary-row"><span class="summary-label"><span class="tag tag-cancel">Hủy</span> Đơn hủy</span><span class="summary-value">${uniqueCancel} đơn (${cancelRate}%)</span></div>
    <div class="summary-row"><span class="summary-label"><span class="tag tag-return">Hoàn</span> Trả hàng / Hoàn tiền</span><span class="summary-value">${uniqueReturn} đơn</span></div>
    <div class="summary-row"><span class="summary-label">[A] Tổng giá bán không hủy</span><span class="summary-value">${fmt(totalA)} đ</span></div>
    ${totalShopDiscount > 0 ? `<div class="summary-row"><span class="summary-label">Mã giảm giá của Shop</span><span class="summary-value">${fmt(totalShopDiscount)} đ</span></div>` : ''}
    ${totalComboDiscount > 0 ? `<div class="summary-row"><span class="summary-label">Giảm giá Combo Shop</span><span class="summary-value">${fmt(totalComboDiscount)} đ</span></div>` : ''}
    ${totalShopeeVoucher > 0 ? `<div class="summary-row"><span class="summary-label">Mã giảm giá Shopee</span><span class="summary-value">${fmt(totalShopeeVoucher)} đ</span></div>` : ''}
    ${totalD > 0 ? `<div class="summary-row"><span class="summary-label">[D] Tiền hoàn trả</span><span class="summary-value">-${fmt(totalD)} đ</span></div>` : ''}
    ${totalReturnFee > 0 ? `<div class="summary-row"><span class="summary-label">Phí vận chuyển trả hàng</span><span class="summary-value">-${fmt(totalReturnFee)} đ</span></div>` : ''}
    <div class="summary-row summary-total"><span class="summary-label"><b>Doanh thu = A - D</b></span><span class="summary-value success">${fmt(totalRevenue)} đ</span></div>
    ${skipped.length > 0 ? `<br><small class="warning">Bỏ qua ${skipped.length} dòng không hợp lệ</small>` : ''}
    <br>Đang upload lên server...
  `)
}

async function importFile() {
  const file = fileInput.files[0]
  if (!file) {
    alert('Vui lòng chọn file trước.')
    return
  }

  btn.disabled = true
  setLog(`Đang đọc file <b>${file.name}</b>...`)

  try {
    await loadCostConfig(API)
    const meta = parseFileMeta(file.name)
    const data = await file.arrayBuffer()
    const workbook = XLSX.read(data)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(sheet)
    const rawOrders = []
    const skipped = []

    rows.forEach((row, index) => {
      const order = normalizeOrder(row, meta)
      if (order) rawOrders.push(order)
      else skipped.push(index + 2)
    })

    const merged = mergeOrderLines(rawOrders)
    const orders = fillFirstSku(merged)
    renderSummary(meta, orders, skipped)

    const response = await fetch(`${API}/api/import-orders-v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildOrdersV2(orders))
    })
    if (!response.ok) throw new Error(`Server lỗi ${response.status}: ${await response.text()}`)

    const result = await response.json()
    addLog(`<br><span class="success">Upload thành công: <b>${result.imported_orders}</b> đơn + <b>${result.imported_items}</b> SKU items.</span>`)
  } catch (error) {
    addLog(`<br><span class="error">Lỗi: ${error.message}</span>`)
    console.error(error)
  } finally {
    btn.disabled = false
  }
}

btn.addEventListener('click', importFile)
