// ── DASHBOARD ────────────────────────────────────────────────────────
async function loadDashboard() {
  const qs = getFilterParams()

  const fromVal    = document.getElementById("filterFrom").value  || ""
  const toVal      = document.getElementById("filterTo").value    || ""
  const platVal    = document.getElementById("filterPlatform")?.value || ""
  const shopVal    = document.getElementById("filterShop")?.value    || ""

  const makeDateOnlyQs = () => {
    const parts = []
    if (fromVal) parts.push("from=" + encodeURIComponent(fromVal))
    if (toVal)   parts.push("to=" + encodeURIComponent(toVal))
    return parts.length ? "?" + parts.join("&") : ""
  }

  const rqsParts = []
  // Báo cáo sàn được chốt theo tháng, backend sẽ quy đổi from/to về report_month để cùng bộ lọc với Dashboard.
  if (fromVal) rqsParts.push("from=" + encodeURIComponent(fromVal))
  if (toVal)   rqsParts.push("to=" + encodeURIComponent(toVal))
  if (platVal) rqsParts.push("platform=" + encodeURIComponent(platVal))
  if (shopVal) {
    shopVal.split(",").map(s => s.trim()).filter(Boolean)
      .forEach(s => rqsParts.push("shop=" + encodeURIComponent(s)))
  }
  const rqs = rqsParts.length ? "?" + rqsParts.join("&") : ""

  const oqsParts = []
  if (fromVal)  oqsParts.push("from=" + fromVal)
  if (toVal)    oqsParts.push("to="   + toVal)
  if (platVal)  oqsParts.push("platform=" + platVal)
  if (shopVal) {
    shopVal.split(",").map(s => s.trim()).filter(Boolean)
      .forEach(s => oqsParts.push("shop=" + encodeURIComponent(s)))
  }
  const oqs = oqsParts.length ? "?" + oqsParts.join("&") : ""

  // NEO: Danh sách shop trong bộ lọc phải lấy từ cấu hình shop chuẩn, không chỉ từ doanh thu theo ngày để shop ít đơn hoặc chưa API không bị ẩn.
  const formatFilterDate = (value) => {
    if (!value) return ""
    const parts = String(value).split("-")
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value
  }

  const [dash, revDay, profDay, platforms, shops, shopTreeRows, allShopRows, rptSum, opCosts, cancelStats] = await Promise.all([
    fetch(API + "/api/dashboard"        + qs).then(r => r.json()),
    fetch(API + "/api/revenue-by-day"   + qs).then(r => r.json()),
    fetch(API + "/api/profit-by-day"    + qs).then(r => r.json()),
    fetch(API + "/api/top-platform"     + qs).then(r => r.json()),
    fetch(API + "/api/top-shop"         + qs).then(r => r.json()),
    fetch(API + "/api/top-shop"         + makeDateOnlyQs()).then(r => r.json()).catch(() => []),
    fetch(API + "/api/shops?t=" + Date.now()).then(r => r.json()).catch(() => []),
    fetch(API + "/api/report-summary"   + rqs).then(r => r.json()).catch(() => ({})),
    fetch(API + "/api/operation-costs"  + oqs).then(r => r.json())
      .then(d => Array.isArray(d) ? d : (Array.isArray(d.costs) ? d.costs : []))
      .catch(() => []),
    fetch(API + "/api/cancel-stats" + qs).then(r => r.json()).catch(() => []),
  ])

  const filterInfo = document.getElementById("filterInfo")
  if (filterInfo) {
    const rangeText = fromVal && toVal
      ? (fromVal === toVal ? `Đang lọc ngày ${formatFilterDate(fromVal)}` : `Đang lọc ${formatFilterDate(fromVal)} - ${formatFilterDate(toVal)}`)
      : "Đang xem toàn bộ thời gian"
    const shopCount = shopVal ? shopVal.split(",").map(s => s.trim()).filter(Boolean).length : 0
    const shopText = shopCount ? ` · ${shopCount} shop` : ""
    const platformText = platVal ? ` · ${platVal}` : ""
    filterInfo.textContent = `${rangeText}${shopText}${platformText}`
  }

  // ── KPI ────────────────────────────────────────────────────────────
  const totalOrders  = Number(dash.success_orders || dash.total_orders || 0)
  const shippingOrders  = Number(dash.shipping_orders || 0)
  const cancelOrders = dash.cancel_orders || 0
  const returnOrders = dash.return_orders || 0
  const allOrders    = dash.total_all_orders || totalOrders
  const cancelRate   = allOrders > 0 ? ((cancelOrders + returnOrders) / allOrders * 100).toFixed(1) : 0

  // ── PRE-COMPUTE ─────────────────────────────────────────────────────
  const costSplit = window.SHV_KPI_CORE?.splitOperationCosts
    ? window.SHV_KPI_CORE.splitOperationCosts(opCosts)
    : { total: opCosts.reduce((s, c) => s + (c.actual_amount || 0), 0), packagingTotal: 0, operationTotal: opCosts.reduce((s, c) => s + (c.actual_amount || 0), 0), packagingCosts: [] }
  const opDisplayTotal = costSplit.total || 0
  const opPackagingTotal = costSplit.packagingTotal || 0
  const opTotal = costSplit.operationTotal || 0
  const rev     = dash.total_revenue || 0
  const revBCGross = rptSum.total_gross_revenue || 0
  const revBC   = rptSum.total_net_product_revenue || Math.max(0, revBCGross - (rptSum.total_refund || 0))

  // Tab 1 — phí lấy từ Finance Core backend; fallback cũ chỉ dùng khi API chưa trả core.
  const feeCore = window.SHV_KPI_CORE?.buildFeeContext?.(dash, opPackagingTotal)
  let t1_disc = dash.total_discount_shop || 0
  let t1_disc_shopee = dash.total_discount_shopee || 0
  let t1_disc_combo = dash.total_discount_combo || 0
  let t1_comm = dash.total_platform_fee || 0
  let t1_svc = dash.total_service_fee || 0
  let t1_pay = dash.total_payment_fee || 0
  let t1_aff = dash.total_affiliate_fee || 0
  let t1_ads = dash.total_ads_fee || 0
  let t1_pish = dash.total_piship_fee || 0
  let t1_handling = dash.total_handling_fee || 0
  let t1_shipping = dash.total_shipping_fee || 0
  let t1_fee_tax_vat = dash.total_fee_tax_vat || 0
  let t1_fee_tax_pit = dash.total_fee_tax_pit || 0
  let t1_fixed_from_order = dash.total_fixed_fee || 0
  let t1_fixed = t1_fixed_from_order + opPackagingTotal
  let t1_ops_ads_fee = 0
  let t1_ops_components = []
  let t1_discount_total = t1_disc + t1_disc_shopee + t1_disc_combo
  let t1_fee_detail_without_operation_packaging = t1_comm + t1_svc + t1_pay + t1_aff + t1_ads + t1_pish + t1_handling + t1_shipping + t1_fee_tax_vat + t1_fee_tax_pit + t1_fixed_from_order
  let t1_fee_detail = t1_fee_detail_without_operation_packaging + opPackagingTotal
  const legacyFeeRaw = Number(dash.total_fee || 0)
  // Nếu fallback legacy còn lẫn voucher/giảm giá, loại khỏi khấu trừ để doanh thu buyer_paid không bị trừ shop_discount hai lần.
  const legacyFeeLooksBroad = t1_discount_total > 0 && legacyFeeRaw >= t1_fee_detail_without_operation_packaging + t1_discount_total - 1
  let t1_fee_fallback = (legacyFeeLooksBroad ? Math.max(0, legacyFeeRaw - t1_discount_total) : legacyFeeRaw) + opPackagingTotal
  let t1_fee = Math.max(t1_fee_detail, t1_fee_fallback)
  let t1_fee_unbucketed = Math.max(0, t1_fee_fallback - t1_fee_detail)
  let t1_fee_using_fallback = t1_fee_unbucketed > 0
  let t1_fee_detail_orders = Number(dash.total_fee_detail_orders || 0)
  let t1_fee_scope_orders = Number(dash.total_fee_scope_orders || 0)
  let t1_fee_source_note = t1_fee_detail_orders
    ? `Đã tách ${t1_fee_detail_orders}/${t1_fee_scope_orders || t1_fee_detail_orders} đơn từ Payment/Finance/ADS`
    : 'Chưa có dòng phí chi tiết từ Payment/Finance'
  let t1_fee_components = []
  let t1_discount_components = []
  let t1_fee_basis_label = 'Người mua thanh toán'
  let t1_fee_core = null
  if (feeCore) {
    ;({
      t1_disc, t1_disc_shopee, t1_disc_combo, t1_comm, t1_svc, t1_pay, t1_aff, t1_ads, t1_pish,
      t1_handling, t1_shipping, t1_fee_tax_vat, t1_fee_tax_pit, t1_fixed_from_order, t1_fixed,
      t1_ops_ads_fee, t1_ops_components,
      t1_fee_detail, t1_fee_fallback, t1_fee, t1_fee_unbucketed, t1_fee_using_fallback,
      t1_fee_detail_orders, t1_fee_scope_orders, t1_fee_source_note, t1_fee_components, t1_discount_components,
      t1_fee_basis_label, t1_fee_core
    } = feeCore)
    t1_discount_total = t1_disc + t1_disc_shopee + t1_disc_combo
  }
  const t1_return_refund = dash.total_return_refund || 0

  const t1_tax_flat = rev * 0.015
  const t1_ops_total = opDisplayTotal + t1_ops_ads_fee
  const t1_lhd      = rev - (dash.total_cost_invoice || 0) - t1_ops_total - t1_fee - t1_return_refund
  const t1_tax_ln   = Math.max(0, t1_lhd * 0.17)
  const t1_ltt      = rev - (dash.total_cost_real || 0) - t1_ops_total - t1_fee - t1_tax_flat - t1_return_refund
  const t1_ltt_hd   = rev - (dash.total_cost_real || 0) - t1_ops_total - t1_fee - t1_tax_ln - t1_return_refund

  // Tab 2 — fees từ báo cáo
  const t2_refund  = rptSum.total_refund            || 0
  const t2_cofund  = rptSum.total_co_funded_voucher  || 0
  const t2_comm    = rptSum.total_fee_commission     || 0
  const t2_svc     = rptSum.total_fee_service        || 0
  const t2_pay     = rptSum.total_fee_payment        || 0
  const t2_aff     = rptSum.total_fee_affiliate      || 0
  const t2_ads     = rptSum.total_fee_ads            || 0
  const t2_pish    = rptSum.total_fee_piship         || 0
  // NEO: Doanh thu báo cáo dùng doanh thu ròng sau hoàn/hủy; không cộng hoàn tiền vào phí lần nữa để tránh trừ hai lần.
  const t2_fee     = t2_comm + t2_svc + t2_pay + t2_aff + t2_ads + t2_pish + opPackagingTotal

  const t2_tax_flat = revBC * 0.015
  const t2_lhd      = revBC - (dash.total_cost_invoice || 0) - opDisplayTotal - t2_fee
  const t2_tax_ln   = Math.max(0, t2_lhd * 0.17)
  const t2_ltt      = revBC - (dash.total_cost_real || 0) - opDisplayTotal - t2_fee - t2_tax_flat
  const t2_ltt_hd   = revBC - (dash.total_cost_real || 0) - opDisplayTotal - t2_fee - t2_tax_ln

  const renderContext = {
    dash, revDay, profDay, platforms, shops, shopTreeRows, allShopRows, rptSum, opCosts, cancelStats,
    totalOrders, shippingOrders, cancelOrders, returnOrders, allOrders, cancelRate,
    costSplit, opDisplayTotal, opPackagingTotal, opTotal, rev, revBC, revBCGross,
    t1_disc, t1_disc_shopee, t1_disc_combo, t1_comm, t1_svc, t1_pay, t1_aff, t1_ads, t1_pish,
    t1_handling, t1_shipping, t1_fee_tax_vat, t1_fee_tax_pit, t1_fixed_from_order, t1_fixed,
    t1_ops_ads_fee, t1_ops_components, t1_ops_total,
    t1_fee_detail, t1_fee_fallback, t1_fee, t1_fee_unbucketed, t1_fee_using_fallback,
    t1_fee_detail_orders, t1_fee_scope_orders, t1_fee_source_note, t1_fee_components, t1_discount_components, t1_fee_basis_label, t1_fee_core, t1_return_refund,
    t1_tax_flat, t1_lhd, t1_tax_ln, t1_ltt, t1_ltt_hd,
    t2_refund, t2_cofund, t2_comm, t2_svc, t2_pay, t2_aff, t2_ads, t2_pish,
    t2_fee, t2_tax_flat, t2_lhd, t2_tax_ln, t2_ltt, t2_ltt_hd,
    fmt, fmtShort, makeChart, buildShopTree,
  }

  // KPI chỉ truyền context đã chuẩn hóa sang module render để file này không ôm HTML dài.
  if (!window.SHV_KPI_CARDS || !window.SHV_KPI_DAILY) {
    throw new Error('Thi?u module render KPI Dashboard')
  }
  window.SHV_KPI_CARDS.render(renderContext)
  window.SHV_KPI_DAILY.render(renderContext)
}
