const returnLedgerState = {
  loading: false,
  syncing: false
}

function returnEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[ch])
}

function returnMoney(value) {
  return Number(value || 0).toLocaleString('vi-VN') + 'đ'
}

function returnShort(value) {
  const n = Number(value || 0)
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + ' tỷ'
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + ' tr'
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + 'k'
  return n.toLocaleString('vi-VN')
}

function returnPlatformLabel(value) {
  const key = String(value || '').toLowerCase()
  if (key === 'shopee') return 'Shopee'
  if (key === 'lazada') return 'Lazada'
  if (key === 'tiktok') return 'TikTok'
  return value || 'Chưa rõ'
}

function returnCancelReasonLabel(row = {}) {
  return String(row.cancel_reason_vi || row.cancel_reason_label || row.cancel_reason || 'Không rõ lý do')
}

function setReturnLedgerStatus(message, tone = '') {
  const el = document.getElementById('returnLedgerStatus')
  if (!el) return
  el.textContent = message
  el.className = `return-ledger-status ${tone}`.trim()
}

function getSingleFilterShop() {
  const shop = String(document.getElementById('filterShop')?.value || '').trim()
  return shop && !shop.includes(',') ? shop : ''
}

function buildReturnLedgerUrl() {
  const params = new URLSearchParams((getFilterParams() || '').replace(/^\?/, ''))
  params.set('limit', '12')
  return `${API}/api/returns/ledger?${params.toString()}`
}

function renderReturnLedger(data) {
  const summary = data.summary || {}
  const grid = document.getElementById('returnLedgerSummary')
  const recent = document.getElementById('returnLedgerRecent')
  if (grid) {
    const cards = [
      ['Dòng ledger', Number(summary.ledger_rows || 0).toLocaleString('vi-VN'), 'Từ bảng marketplace_return_reverse_ledger'],
      ['Đơn ảnh hưởng', Number(summary.affected_orders || 0).toLocaleString('vi-VN'), `${Number(summary.closed_orders || 0).toLocaleString('vi-VN')} đơn đã chốt tài chính`],
      ['Hoàn đã trừ', returnShort(summary.effective_refund_amount), 'Chỉ tính dòng is_finance_closed'],
      ['Đang mở / tranh chấp', `${Number(summary.open_rows || 0)} / ${Number(summary.dispute_rows || 0)}`, 'Chưa trừ vào lãi ròng']
    ]
    grid.innerHTML = cards.map(([label, value, sub]) => `
      <div class="return-ledger-card">
        <span>${returnEscape(label)}</span>
        <strong>${returnEscape(value)}</strong>
        <small>${returnEscape(sub)}</small>
      </div>
    `).join('')
  }
  if (recent) {
    const rows = data.recent || []
    if (!rows.length) {
      recent.innerHTML = '<div class="return-ledger-status">Chưa có dòng hoàn/trả trong bộ lọc hiện tại.</div>'
    } else {
      recent.innerHTML = rows.map(row => `
        <div class="return-ledger-row">
          <div>
            <b>${returnEscape(returnPlatformLabel(row.platform))} · ${returnEscape(row.shop || 'Chưa rõ shop')}</b>
            <small>Đơn ${returnEscape(row.order_id || '-')} · Reverse ${returnEscape(row.reverse_id || '-')}</small>
          </div>
          <div>
            <span>${returnEscape(row.normalized_status || 'open')} · ${returnEscape(row.ledger_kind || 'return')}</span>
            <small>${returnEscape(row.reverse_status || row.line_status || 'Chưa rõ trạng thái')}</small>
          </div>
          <div>
            <span>${returnMoney(row.effective_refund_amount || 0)}</span>
            <small>Refund gốc ${returnMoney(row.refund_amount || 0)}</small>
          </div>
          <div>
            <span>${returnEscape(row.reason_text || row.reason_code || 'Chưa rõ lý do')}</span>
            <small>${returnEscape(row.source_detail || row.source_mode || '')}</small>
          </div>
        </div>
      `).join('')
    }
  }
}

async function loadReturnLedger(options = {}) {
  if (returnLedgerState.loading) return
  returnLedgerState.loading = true
  if (!options.silent) setReturnLedgerStatus('Đang tải ledger hoàn/trả...')
  try {
    const res = await fetch(buildReturnLedgerUrl())
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.error) throw new Error(data.message || data.error || `HTTP ${res.status}`)
    renderReturnLedger(data)
    const s = data.summary || {}
    setReturnLedgerStatus(`Ledger: ${Number(s.ledger_rows || 0).toLocaleString('vi-VN')} dòng, ${Number(s.closed_orders || 0).toLocaleString('vi-VN')} đơn đã chốt, hoàn đã trừ ${returnMoney(s.effective_refund_amount || 0)}.`, 'ok')
  } catch (error) {
    setReturnLedgerStatus(`Không tải được ledger hoàn/trả: ${error.message}`, 'error')
  } finally {
    returnLedgerState.loading = false
  }
}

async function syncReturnLedger(platform) {
  if (returnLedgerState.syncing) return
  const key = String(platform || '').toLowerCase()
  const isShopee = key === 'shopee'
  const btn = document.getElementById(isShopee ? 'syncShopeeReturnsBtn' : 'syncLazadaReturnsBtn')
  const oldText = btn?.textContent || ''
  returnLedgerState.syncing = true
  if (btn) {
    btn.disabled = true
    btn.textContent = isShopee ? 'Đang đồng bộ Shopee...' : 'Đang đồng bộ Lazada...'
  }
  try {
    const shop = getSingleFilterShop()
    // Sync dùng cửa sổ an toàn để không vượt giới hạn API: Shopee Returns tối đa 15 ngày, Lazada Reverse chạy batch 30 ngày.
    const body = isShopee
      ? { hours: 24, page_size: 100, max_pages: 6, include_detail: true }
      : { days: 30, page_size: 80, max_pages: 4, include_detail: true, include_history: true }
    if (shop) body.shop = shop
    const endpoint = isShopee ? '/api/returns/shopee/sync' : '/api/returns/lazada/sync'
    setReturnLedgerStatus(isShopee ? 'Đang gọi Shopee Returns API...' : 'Đang gọi Lazada Reverse API...')
    const res = await fetch(API + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.error) throw new Error(data.message || data.error || `HTTP ${res.status}`)
    const warningCount = Array.isArray(data.warnings) ? data.warnings.length : 0
    setReturnLedgerStatus(`${returnPlatformLabel(key)} đã sync: lấy ${Number(data.fetched_returns || 0)} dòng, lưu ledger ${Number(data.ledger_saved || 0)}, hoàn đã chốt ${returnMoney(data.refund_amount || 0)}${warningCount ? `, ${warningCount} cảnh báo` : ''}.`, warningCount ? '' : 'ok')
    await loadReturnLedger({ silent: true })
    if (typeof loadDashboard === 'function') await loadDashboard()
    if (typeof loadOrderAnalytics === 'function') loadOrderAnalytics()
  } catch (error) {
    setReturnLedgerStatus(`Đồng bộ ${returnPlatformLabel(key)} lỗi: ${error.message}`, 'error')
  } finally {
    returnLedgerState.syncing = false
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText
    }
  }
}

function renderFeeTable(platform, d, total) {
  const cfg = {
    tiktok:  { color: "#333",    failed_count: d.tiktok_failed_delivery_count  || 0, failed_fee: d.tiktok_failed_delivery_fee  || 0, free_count: d.tiktok_free_cancel_count  || 0, return_count: d.tiktok_return_count  || 0, return_fee: (d.tiktok_return_count  || 0) * 4620, total_fee: d.total_tiktok_cancel_fee  || 0 },
    shopee:  { color: "#ee4d2d", failed_count: d.shopee_failed_delivery_count  || 0, failed_fee: d.shopee_failed_delivery_fee  || 0, free_count: d.shopee_free_cancel_count  || 0, return_count: d.shopee_return_count  || 0, return_fee: d.shopee_return_fee  || 0, total_fee: d.total_shopee_cancel_fee  || 0 },
    lazada:  { color: "#0f146d", failed_count: d.lazada_failed_delivery_count  || 0, failed_fee: d.lazada_failed_delivery_fee  || 0, free_count: d.lazada_free_cancel_count  || 0, return_count: d.lazada_return_count  || 0, return_fee: d.lazada_return_fee  || 0, total_fee: d.total_lazada_cancel_fee  || 0 },
  }
  const c = cfg[platform]
  const name = platform.charAt(0).toUpperCase() + platform.slice(1)
  return `
    <div style="margin-top:16px;margin-bottom:8px;font-size:12px;font-weight:700;color:#888">
      📋 CHI TIẾT PHÍ BỊ TRỪ —
      <span style="background:${c.color};color:white;border-radius:4px;padding:2px 8px">${name.toUpperCase()}</span>
    </div>
    <div style="background:#fafafa;border-radius:8px;overflow:hidden;border:1px solid #f0f0f0;margin-bottom:14px">
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;font-size:11px;font-weight:700;color:#888;padding:8px 12px;border-bottom:1px solid #f0f0f0;background:#f5f5f5">
        <span>Loại đơn</span><span style="text-align:center">Số đơn</span><span style="text-align:center">Tỉ lệ</span><span style="text-align:right">Phí bị trừ</span>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;font-size:12px;padding:10px 12px;border-bottom:1px solid #f0f0f0;align-items:center">
        <div>
          <div style="font-weight:600;color:#16a34a">✅ Hủy không mất phí</div>
          <div style="font-size:11px;color:#888">Khách hủy sớm / hết hàng / tự động hủy</div>
        </div>
        <div style="text-align:center;font-weight:700">${c.free_count}</div>
        <div style="text-align:center;color:#888">${pct(c.free_count, total)}</div>
        <div style="text-align:right;font-weight:700;color:#16a34a">0 đ</div>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;font-size:12px;padding:10px 12px;border-bottom:1px solid #f0f0f0;align-items:center">
        <div>
          <div style="font-weight:600;color:#f59e0b">⚠️ Giao hàng thất bại</div>
          <div style="font-size:11px;color:#888">Shipper không giao được — sàn thu phí hoàn</div>
        </div>
        <div style="text-align:center;font-weight:700">${c.failed_count}</div>
        <div style="text-align:center;color:#888">${pct(c.failed_count, total)}</div>
        <div style="text-align:right;font-weight:700;color:#f59e0b">${fmt(c.failed_fee)}</div>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;font-size:12px;padding:10px 12px;border-bottom:1px solid #f0f0f0;align-items:center">
        <div>
          <div style="font-weight:600;color:#ef4444">↩️ Trả hàng / Hoàn tiền</div>
          <div style="font-size:11px;color:#888">Khách trả hàng — sàn thu phí SFR + xử lý</div>
        </div>
        <div style="text-align:center;font-weight:700">${c.return_count}</div>
        <div style="text-align:center;color:#888">${pct(c.return_count, total)}</div>
        <div style="text-align:right;font-weight:700;color:#ef4444">${fmt(c.return_fee)}</div>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;font-size:12px;padding:10px 12px;background:#fff8f8;align-items:center;font-weight:700">
        <div>Tổng phí ${name} bị trừ</div>
        <div style="text-align:center">${c.failed_count + c.return_count}</div>
        <div style="text-align:center;color:#888">${pct(c.failed_count + c.return_count, total)}</div>
        <div style="text-align:right;color:#ef4444">${fmt(c.total_fee)}</div>
      </div>
    </div>`
}

async function loadCancel() {
  const qs = getFilterParams()
  const [dash, stats] = await Promise.all([
    fetch(API + "/api/dashboard"    + qs).then(r => r.json()),
    fetch(API + "/api/cancel-stats" + qs).then(r => r.json()),
  ])

  const total      = dash.total_all_orders || 1
  const cancelRows = stats.filter(r => r.order_type === "cancel")
  const returnRows = stats.filter(r => r.order_type === "return")
  const totalCancel = cancelRows.reduce((s, r) => s + r.total_orders, 0)
  const totalReturn = returnRows.reduce((s, r) => s + r.total_orders, 0)

  const byPlatform = {}
  stats.forEach(r => {
    if (!byPlatform[r.platform]) byPlatform[r.platform] = { cancel: 0, return: 0 }
    if (r.order_type === "cancel") byPlatform[r.platform].cancel += r.total_orders
    if (r.order_type === "return") byPlatform[r.platform].return += r.total_orders
  })

  const plts = Object.keys(byPlatform)
  makeChart("chartCancel", "bar", plts, [
    {
      label: "Đơn hủy",
      data: plts.map(p => byPlatform[p].cancel),
      backgroundColor: "#ef444480", borderColor: "#ef4444", borderWidth: 2, borderRadius: 6,
    },
    {
      label: "Đơn hoàn",
      data: plts.map(p => byPlatform[p].return),
      backgroundColor: "#f59e0b80", borderColor: "#f59e0b", borderWidth: 2, borderRadius: 6,
    }
  ], {
    legend: true,
    extra: { plugins: { legend: { display: true } }, scales: { y: { ticks: { stepSize: 1 } } } }
  })

  document.getElementById("cancelStats").innerHTML = `
    <div style="padding:20px">
      <div style="font-size:13px;font-weight:700;margin-bottom:14px">📊 Thống kê hủy / hoàn</div>
      <div class="stat-row">
        <div>
          <div style="font-weight:600">Tổng đơn hủy</div>
          <div class="stat-bar" style="width:${Math.min(100, totalCancel / total * 100 * 5)}%;background:linear-gradient(90deg,#ef4444,#fca5a5)"></div>
        </div>
        <div style="font-weight:700;color:#ef4444">${totalCancel} đơn (${pct(totalCancel, total)})</div>
      </div>
      <div class="stat-row">
        <div>
          <div style="font-weight:600">Tổng đơn hoàn</div>
          <div class="stat-bar" style="width:${Math.min(100, totalReturn / total * 100 * 5)}%;background:linear-gradient(90deg,#f59e0b,#fde68a)"></div>
        </div>
        <div style="font-weight:700;color:#f59e0b">${totalReturn} đơn (${pct(totalReturn, total)})</div>
      </div>
      <div class="stat-row">
        <div style="font-weight:600">💸 Tổng phí bị trừ (hủy + hoàn)</div>
        <div style="font-weight:700;color:#ef4444">${fmt(dash.total_return_fee)}</div>
      </div>
      <div class="stat-row">
        <div>
          <div style="font-weight:600">Hoàn tiền API đã chốt</div>
          <div style="font-size:11px;color:#888">Từ ledger Shopee Returns / Lazada Reverse, chỉ trừ khi đã đóng tài chính</div>
        </div>
        <div style="font-weight:700;color:#0f766e">${fmt(dash.total_return_refund)}</div>
      </div>
      ${renderFeeTable('tiktok', dash, total)}
      ${renderFeeTable('shopee', dash, total)}
      ${renderFeeTable('lazada', dash, total)}
      <div style="margin-top:16px;font-size:12px;font-weight:700;color:#888;margin-bottom:8px">LÝ DO HỦY PHỔ BIẾN</div>
      ${cancelRows.slice(0, 5).map(r => {
        const reasonLabel = returnCancelReasonLabel(r)
        const shortReason = reasonLabel.substring(0, 40) + (reasonLabel.length > 40 ? "..." : "")
        return `
        <div class="stat-row">
          <div style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis" title="${returnEscape(reasonLabel)}">
            <span class="badge badge-${r.platform}" style="margin-right:4px">${returnEscape(r.platform)}</span>
            ${returnEscape(shortReason)}
          </div>
          <div style="font-weight:600">${r.total_orders} đơn</div>
        </div>`
      }).join("")}
    </div>`
  await loadReturnLedger({ silent: true })
}
