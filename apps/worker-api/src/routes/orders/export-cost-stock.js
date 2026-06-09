import { calcProfit, getCostSettings } from '../../utils/db.js'
import { getFilters } from '../../utils/filters.js'
import { tableExists } from '../../core/orders/analytics-shared-core.js'
import { normalizeOrderReadModel } from '../../core/orders/read-core.js'
import { buildProductLookup, loadOrderFeeMap, loadSkuResolutionMaps, resolveItemProduct } from './cost-resolution.js'
import { cleanOrderText } from './status-workflow.js'

export async function exportOrders(request, env, cors) {
  const filters = getFilters(new URL(request.url))
  const conds  = ["1=1"]
  const params = []
  if (filters.from)     { conds.push(`date(o.order_date) >= ?`); params.push(filters.from) }
  if (filters.to)       { conds.push(`date(o.order_date) <= ?`); params.push(filters.to) }
  if (filters.platform) { conds.push(`o.platform = ?`);          params.push(filters.platform) }
  if (filters.shop)     { conds.push(`o.shop = ?`);              params.push(filters.shop) }

  const urlObj = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(urlObj.searchParams.get("limit") || "200", 10) || 200, 1), 500);
  const page  = Math.max(parseInt(urlObj.searchParams.get("page") || "1", 10) || 1, 1);
  const offset = (page - 1) * limit;

  // Đếm tổng số đơn để FE tính số trang
  const countRes = await env.DB.prepare(`SELECT COUNT(*) as total FROM orders_v2 o WHERE ${conds.join(" AND ")}`).bind(...params).first();
  const total = countRes ? countRes.total : 0;
  const hasFinanceCore = await tableExists(env, 'order_analytics')
  const hasFeeDetails = await tableExists(env, 'order_fee_details')
  const financeJoin = hasFinanceCore
    ? `LEFT JOIN order_analytics oa ON oa.order_sn = o.order_id`
    : ''
  const feeDetailJoin = hasFeeDetails
    ? `LEFT JOIN (
        SELECT
          LOWER(COALESCE(platform, '')) AS platform_key,
          order_id,
          SUM(COALESCE(tax_vat, 0) + COALESCE(tax_pit, 0)) AS tax_deduction,
          SUM(COALESCE(fee_commission, 0) + COALESCE(fee_payment, 0) + COALESCE(fee_service, 0) + COALESCE(fee_affiliate, 0) + COALESCE(fee_handling, 0)) AS marketplace_fee_total,
          SUM(COALESCE(fee_piship, 0)) AS piship_fee,
          SUM(CASE WHEN json_valid(COALESCE(raw_data, '')) THEN ABS(COALESCE(json_extract(raw_data, '$.buyer_payment_info.shopee_voucher'), 0)) ELSE 0 END) AS platform_voucher_total,
          SUM(CASE WHEN json_valid(COALESCE(raw_data, '')) THEN ABS(COALESCE(json_extract(raw_data, '$.order_income.voucher_from_seller'), 0)) ELSE 0 END) AS seller_cofunded_voucher_amount,
          SUM(CASE WHEN json_valid(COALESCE(raw_data, '')) THEN ABS(COALESCE(json_extract(raw_data, '$.order_income.voucher_from_shopee'), 0)) ELSE 0 END) AS platform_funded_voucher_amount,
          SUM(CASE WHEN json_valid(COALESCE(raw_data, '')) THEN ABS(COALESCE(json_extract(raw_data, '$.order_income.buyer_paid_shipping_fee'), json_extract(raw_data, '$.buyer_payment_info.shipping_fee'), 0)) ELSE 0 END) AS buyer_shipping_paid,
          SUM(CASE WHEN json_valid(COALESCE(raw_data, '')) THEN ABS(COALESCE(json_extract(raw_data, '$.buyer_payment_info.buyer_total_amount'), json_extract(raw_data, '$.order_income.buyer_total_amount'), 0)) ELSE 0 END) AS buyer_total_paid,
          SUM(CASE WHEN json_valid(COALESCE(raw_data, '')) THEN ABS(COALESCE(json_extract(raw_data, '$.order_income.order_discounted_price'), json_extract(raw_data, '$.order_income.order_selling_price'), json_extract(raw_data, '$.buyer_payment_info.merchant_subtotal'), 0)) ELSE 0 END) AS product_revenue_after_shop_discount,
          SUM(CASE WHEN json_valid(COALESCE(raw_data, '')) THEN ABS(COALESCE(json_extract(raw_data, '$.order_income.escrow_amount_after_adjustment'), json_extract(raw_data, '$.order_income.escrow_amount'), settlement, 0)) ELSE COALESCE(settlement, 0) END + COALESCE(fee_piship, 0)) AS actual_income
        FROM order_fee_details
        GROUP BY LOWER(COALESCE(platform, '')), order_id
      ) fd ON fd.platform_key = LOWER(COALESCE(o.platform, '')) AND fd.order_id = o.order_id`
    : ''
  const feeDetailColumns = hasFeeDetails
    ? `
      COALESCE(fd.tax_deduction, 0) AS finance_tax_deduction,
      COALESCE(fd.marketplace_fee_total, 0) AS fee_detail_marketplace_fee_total,
      COALESCE(fd.piship_fee, 0) AS fee_detail_piship_fee,
      COALESCE(fd.platform_voucher_total, 0) AS fee_detail_platform_voucher_total,
      COALESCE(fd.seller_cofunded_voucher_amount, 0) AS fee_detail_seller_cofunded_voucher_amount,
      COALESCE(fd.platform_funded_voucher_amount, 0) AS fee_detail_platform_funded_voucher_amount,
      COALESCE(fd.buyer_shipping_paid, 0) AS fee_detail_buyer_shipping_paid,
      COALESCE(fd.buyer_total_paid, 0) AS fee_detail_buyer_total_paid,
      COALESCE(fd.product_revenue_after_shop_discount, 0) AS fee_detail_product_revenue_after_shop_discount,
      COALESCE(fd.actual_income, 0) AS fee_detail_actual_income`
    : `
      0 AS finance_tax_deduction,
      0 AS fee_detail_marketplace_fee_total,
      0 AS fee_detail_piship_fee,
      0 AS fee_detail_platform_voucher_total,
      0 AS fee_detail_seller_cofunded_voucher_amount,
      0 AS fee_detail_platform_funded_voucher_amount,
      0 AS fee_detail_buyer_shipping_paid,
      0 AS fee_detail_buyer_total_paid,
      0 AS fee_detail_product_revenue_after_shop_discount,
      0 AS fee_detail_actual_income`
  const fdProductRevenueExpr = hasFeeDetails ? 'COALESCE(fd.product_revenue_after_shop_discount, 0)' : '0'
  const fdBuyerShippingExpr = hasFeeDetails ? 'COALESCE(fd.buyer_shipping_paid, 0)' : '0'
  const fdBuyerPaidExpr = hasFeeDetails ? 'COALESCE(fd.buyer_total_paid, 0)' : '0'
  const fdPlatformVoucherExpr = hasFeeDetails ? 'COALESCE(fd.platform_voucher_total, 0)' : '0'
  const fdSellerCofundExpr = hasFeeDetails ? 'COALESCE(fd.seller_cofunded_voucher_amount, 0)' : '0'
  const fdPlatformFundedExpr = hasFeeDetails ? 'COALESCE(fd.platform_funded_voucher_amount, 0)' : '0'
  const fdActualIncomeExpr = hasFeeDetails ? 'COALESCE(fd.actual_income, 0)' : '0'
  const fdMarketplaceFeeExpr = hasFeeDetails ? 'COALESCE(fd.marketplace_fee_total, 0)' : '0'
  const fdTaxExpr = hasFeeDetails ? 'COALESCE(fd.tax_deduction, 0)' : '0'
  const fdPishipExpr = hasFeeDetails ? 'COALESCE(fd.piship_fee, o.fee_piship, 0)' : 'COALESCE(o.fee_piship, 0)'
  const taxonomyNumber = (path, fallback) => hasFinanceCore
    ? `COALESCE(CASE WHEN json_valid(COALESCE(oa.source_json, '')) THEN json_extract(oa.source_json, '$.taxonomy.${path}') END, ${fallback})`
    : fallback
  const taxonomyText = (path, fallback = "''") => hasFinanceCore
    ? `COALESCE(CASE WHEN json_valid(COALESCE(oa.source_json, '')) THEN json_extract(oa.source_json, '$.taxonomy.${path}') END, ${fallback})`
    : fallback
  const grossFallbackExpr = hasFinanceCore
    ? `COALESCE(NULLIF(${fdProductRevenueExpr} + ${fdBuyerShippingExpr}, 0), oa.revenue, o.revenue, 0)`
    : `COALESCE(NULLIF(${fdProductRevenueExpr} + ${fdBuyerShippingExpr}, 0), o.revenue, 0)`
  const productFallbackExpr = `COALESCE(NULLIF(${fdProductRevenueExpr}, 0), MAX(0, ${grossFallbackExpr} - ${fdBuyerShippingExpr}))`
  const buyerPaidFallbackExpr = `COALESCE(NULLIF(${fdBuyerPaidExpr}, 0), MAX(0, ${grossFallbackExpr} - ${fdPlatformVoucherExpr}))`
  const grossRevenueExpr = taxonomyNumber('gross_revenue', grossFallbackExpr)
  const productRevenueExpr = taxonomyNumber('product_revenue_after_shop_discount', productFallbackExpr)
  const buyerShippingExpr = taxonomyNumber('buyer_shipping_paid', fdBuyerShippingExpr)
  const buyerPaidExpr = taxonomyNumber('buyer_total_paid', buyerPaidFallbackExpr)
  const platformVoucherExpr = taxonomyNumber('platform_voucher_total', fdPlatformVoucherExpr)
  const sellerCofundExpr = taxonomyNumber('seller_cofunded_voucher_amount', fdSellerCofundExpr)
  const platformFundedExpr = taxonomyNumber('platform_funded_voucher_amount', fdPlatformFundedExpr)
  const actualIncomeAvailableExpr = taxonomyNumber('actual_income_available', '1')
  const actualIncomeExpr = hasFinanceCore
    ? `CASE WHEN ${actualIncomeAvailableExpr} = 0 THEN NULL ELSE ${taxonomyNumber('actual_income', fdActualIncomeExpr)} END`
    : fdActualIncomeExpr
  const estimatedIncomeExpr = taxonomyNumber('estimated_income', '0')
  const actualIncomeSettlementExpr = taxonomyNumber('actual_income_settlement', '0')
  const profitBasisExpr = taxonomyNumber('profit_basis', actualIncomeExpr)
  const profitStatusExpr = taxonomyText('profit_status', "''")
  const settlementStatusExpr = taxonomyText('settlement_status', "''")
  const marketplaceFeeExpr = taxonomyNumber('marketplace_fee_total', fdMarketplaceFeeExpr)
  const taxTotalExpr = taxonomyNumber('tax_total', fdTaxExpr)
  const pishipExpr = taxonomyNumber('piship_fee', fdPishipExpr)
  const opsCostExpr = taxonomyNumber('ops_cost_setting_total', `${fdPishipExpr} + COALESCE(o.fee_packaging, 0) + COALESCE(o.fee_operation, 0) + COALESCE(o.fee_labor, 0)`)
  const financeColumns = hasFinanceCore
    ? `
      COALESCE(oa.revenue, o.revenue, 0) AS finance_revenue,
      COALESCE(oa.actual_income, 0) AS finance_actual_income,
      COALESCE(oa.platform_fees, 0) AS finance_platform_fees,
      COALESCE(oa.ads_cost_allocated, 0) AS finance_ads_cost,
      COALESCE(oa.refund_deduction, 0) AS finance_refund,
      COALESCE(oa.cost_of_goods, o.cost_real, 0) AS finance_cost_real,
      COALESCE(oa.net_profit, o.profit_real, 0) AS finance_net_profit,
      COALESCE(oa.actual_income_source, '') AS finance_income_source,
      ${grossRevenueExpr} AS finance_gross_revenue,
      ${productRevenueExpr} AS finance_product_revenue_after_shop_discount,
      ${buyerShippingExpr} AS finance_buyer_shipping_paid,
      ${buyerPaidExpr} AS finance_buyer_total_paid,
      ${platformVoucherExpr} AS finance_platform_voucher_total,
      ${sellerCofundExpr} AS finance_seller_cofunded_voucher_amount,
      ${platformFundedExpr} AS finance_platform_funded_voucher_amount,
      ${actualIncomeExpr} AS finance_actual_income_taxonomy,
      ${estimatedIncomeExpr} AS finance_estimated_income,
      ${actualIncomeSettlementExpr} AS finance_actual_income_settlement,
      ${actualIncomeAvailableExpr} AS finance_actual_income_available,
      ${profitBasisExpr} AS finance_profit_basis,
      ${profitStatusExpr} AS finance_profit_status,
      ${settlementStatusExpr} AS finance_settlement_status,
      ${marketplaceFeeExpr} AS finance_marketplace_fee_total,
      ${taxTotalExpr} AS finance_tax_total,
      ${pishipExpr} AS finance_piship_fee,
      ${opsCostExpr} AS finance_ops_cost_setting_total,
      CASE WHEN oa.order_sn IS NOT NULL THEN 1 ELSE 0 END AS has_finance_core,
      ${feeDetailColumns}
    `
    : `
      COALESCE(o.revenue, 0) AS finance_revenue,
      0 AS finance_actual_income,
      COALESCE(o.fee, 0) AS finance_platform_fees,
      0 AS finance_ads_cost,
      0 AS finance_refund,
      COALESCE(o.cost_real, 0) AS finance_cost_real,
      COALESCE(o.profit_real, 0) AS finance_net_profit,
      '' AS finance_income_source,
      ${fdProductRevenueExpr} + ${fdBuyerShippingExpr} AS finance_gross_revenue,
      ${fdProductRevenueExpr} AS finance_product_revenue_after_shop_discount,
      ${fdBuyerShippingExpr} AS finance_buyer_shipping_paid,
      ${fdBuyerPaidExpr} AS finance_buyer_total_paid,
      ${fdPlatformVoucherExpr} AS finance_platform_voucher_total,
      ${fdSellerCofundExpr} AS finance_seller_cofunded_voucher_amount,
      ${fdPlatformFundedExpr} AS finance_platform_funded_voucher_amount,
      ${fdActualIncomeExpr} AS finance_actual_income_taxonomy,
      0 AS finance_estimated_income,
      0 AS finance_actual_income_settlement,
      1 AS finance_actual_income_available,
      ${fdActualIncomeExpr} AS finance_profit_basis,
      '' AS finance_profit_status,
      '' AS finance_settlement_status,
      ${fdMarketplaceFeeExpr} AS finance_marketplace_fee_total,
      ${fdTaxExpr} AS finance_tax_total,
      ${fdPishipExpr} AS finance_piship_fee,
      ${fdPishipExpr} + COALESCE(o.fee_packaging, 0) + COALESCE(o.fee_operation, 0) + COALESCE(o.fee_labor, 0) AS finance_ops_cost_setting_total,
      0 AS has_finance_core,
      ${feeDetailColumns}
    `
  const financeRevenueExpr = hasFinanceCore
    ? `COALESCE(NULLIF(${grossRevenueExpr}, 0), oa.revenue, o.revenue, 0)`
    : `COALESCE(NULLIF(${fdProductRevenueExpr} + ${fdBuyerShippingExpr}, 0), o.revenue, 0)`

  // Export chỉ phân bổ số đã được Finance Core chuẩn hóa; không tự dựng lại lãi/phí từ công thức legacy.
  const rows = await env.DB.prepare(`
    WITH item_counts AS (
      SELECT order_id,
             COUNT(*) AS item_count,
             SUM(COALESCE(revenue_line, 0)) AS item_revenue
      FROM order_items
      GROUP BY order_id
    ),
    export_base AS (
    SELECT
      o.order_date, o.platform, o.shop, o.order_id,
      oi.sku, oi.product_name, oi.qty,
      COALESCE(o.source_updated_at, '') AS source_updated_at,
      COALESCE(oi.revenue_line, 0) AS raw_revenue,
      COALESCE(o.raw_revenue, o.revenue, 0) AS order_original_price,
      COALESCE(o.discount_shop, 0) + COALESCE(o.discount_combo, 0) AS order_shop_discount,
      COALESCE(o.discount_shopee, 0) AS order_platform_voucher,
      ${financeColumns},
      CASE
        WHEN ${financeRevenueExpr} > 0 AND COALESCE(oi.revenue_line, 0) > 0
          THEN COALESCE(oi.revenue_line, 0) * 1.0 / ${financeRevenueExpr}
        ELSE 1.0 / COALESCE(NULLIF(ic.item_count, 0), 1)
      END AS line_ratio,
      o.order_type,
      o.oms_status,
      o.shipping_status,
      o.tracking_number,
      o.cancel_reason,
      o.return_fee
    FROM orders_v2 o
    LEFT JOIN order_items oi ON oi.order_id = o.order_id
    LEFT JOIN item_counts ic ON ic.order_id = o.order_id
    ${financeJoin}
    ${feeDetailJoin}
    WHERE ${conds.join(" AND ")}
    )
    SELECT
      order_date, platform, shop, order_id, sku, product_name, qty,
      ROUND(finance_gross_revenue * line_ratio, 2) AS gross_revenue,
      ROUND(finance_product_revenue_after_shop_discount * line_ratio, 2) AS product_revenue_after_shop_discount,
      ROUND(finance_buyer_shipping_paid * line_ratio, 2) AS buyer_shipping_paid,
      ROUND(finance_buyer_total_paid * line_ratio, 2) AS buyer_total_paid,
      ROUND(finance_platform_voucher_total * line_ratio, 2) AS platform_voucher_total,
      ROUND(finance_seller_cofunded_voucher_amount * line_ratio, 2) AS seller_cofunded_voucher_amount,
      ROUND(finance_platform_funded_voucher_amount * line_ratio, 2) AS platform_funded_voucher_amount,
      ROUND(COALESCE(NULLIF(order_original_price, 0), finance_revenue) * line_ratio, 2) AS original_price,
      ROUND(order_shop_discount * line_ratio, 2) AS shop_discount,
      ROUND(finance_gross_revenue * line_ratio, 2) AS revenue,
      ROUND(finance_buyer_total_paid * line_ratio, 2) AS buyer_paid,
      ROUND(finance_platform_voucher_total * line_ratio, 2) AS platform_voucher,
      ROUND(raw_revenue, 2) AS raw_revenue,
      CASE WHEN finance_actual_income_available = 0 THEN NULL ELSE ROUND(COALESCE(finance_actual_income_taxonomy, finance_actual_income) * line_ratio, 2) END AS actual_income,
      ROUND(finance_estimated_income * line_ratio, 2) AS estimated_income,
      ROUND(finance_actual_income_settlement * line_ratio, 2) AS actual_income_settlement,
      finance_actual_income_available AS actual_income_available,
      ROUND(finance_profit_basis * line_ratio, 2) AS profit_basis,
      finance_profit_status AS profit_status,
      finance_settlement_status AS settlement_status,
      ROUND(finance_cost_real * line_ratio, 2) AS cost_real,
      ROUND(finance_cost_real * line_ratio, 2) AS cost,
      ROUND(finance_marketplace_fee_total * line_ratio, 2) AS fee_platform,
      ROUND(finance_marketplace_fee_total * line_ratio, 2) AS marketplace_fee_total,
      0 AS fee_payment,
      0 AS fee_affiliate,
      ROUND(finance_ads_cost * line_ratio, 2) AS fee_ads,
      ROUND(finance_ads_cost * line_ratio, 2) AS ads_fee_total,
      ROUND(finance_ads_cost * line_ratio, 2) AS ops_ads_fee,
      ROUND(finance_piship_fee * line_ratio, 2) AS piship_fee,
      ROUND(finance_ops_cost_setting_total * line_ratio, 2) AS ops_cost_setting_total,
      ROUND(finance_tax_total * line_ratio, 2) AS tax_total,
      ROUND(finance_tax_total * line_ratio, 2) AS tax_deduction,
      ROUND(finance_refund * line_ratio, 2) AS return_refund,
      ROUND((finance_seller_cofunded_voucher_amount + finance_marketplace_fee_total + finance_tax_total) * line_ratio, 2) AS fee,
      ROUND((finance_seller_cofunded_voucher_amount + finance_marketplace_fee_total + finance_tax_total) * line_ratio, 2) AS deduction_total,
      ROUND(finance_net_profit * line_ratio, 2) AS profit_real,
      ROUND(finance_net_profit * line_ratio, 2) AS profit,
      0 AS tax_flat,
      0 AS tax_income,
      'Người mua thanh toán' AS percent_basis_label,
      order_type, oms_status, shipping_status, tracking_number, cancel_reason, return_fee,
      CASE WHEN has_finance_core = 1 THEN 'order_analytics' ELSE 'orders_v2_legacy_fallback' END AS finance_source,
      CASE
        WHEN has_finance_core = 1 AND finance_income_source = 'orders_v2_estimate_no_ads' THEN 'estimated'
        WHEN has_finance_core = 1 THEN 'confirmed'
        ELSE 'fallback'
      END AS finance_confidence,
      finance_income_source,
      source_updated_at
    FROM export_base
    ORDER BY order_date DESC, order_id, sku
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  const data = (rows.results || []).map(row => {
    const statusCore = normalizeOrderReadModel(row)
    return {
      ...row,
      raw_platform_status: statusCore.raw_platform_status,
      order_status_core: statusCore.order_status_core,
      fulfillment_status_core: statusCore.fulfillment_status_core,
      display_status_vi: statusCore.display_status_vi,
      terminal_status: statusCore.terminal_status,
      status_reason: statusCore.status_reason,
      label_eligible: statusCore.label_eligible,
      label_status: statusCore.label_status,
      label_reason: statusCore.label_reason,
      shipping_label_url: statusCore.shipping_label_url,
      label_file_path: statusCore.label_file_path,
      last_label_download_at: statusCore.last_label_download_at,
      last_label_error: statusCore.last_label_error
    }
  })

  return Response.json({
    data,
    total: total,
    page: page,
    totalPages: Math.ceil(total / limit)
  }, { headers: cors });
}

export async function recalcCost(request, env, cors) {
  const cfg = await getCostSettings(env)
// Lấy thêm cột combo_items chứa chuỗi JSON
  const productRows = await env.DB.prepare(`SELECT sku, product_name, image_url, cost_invoice, cost_real, stock, stock_main, stock_sub, is_combo, combo_items FROM products`).all()
  const productMap = {}
  for (const p of productRows.results) productMap[p.sku] = p

  // TÍNH LẠI GIÁ VỐN CHO SẢN PHẨM COMBO TỪ CHUỖI JSON
  for (const p of productRows.results) {
    if (p.is_combo === 1 && p.combo_items) {
      try {
        const components = JSON.parse(p.combo_items);
        if (components.length > 0) {
          let comboCostReal = 0;
          let comboCostInvoice = 0;
          for (const comp of components) {
            // Trong JSON của bạn, key là 'sku' và 'qty'
            const compData = productMap[comp.sku] || { cost_real: 0, cost_invoice: 0 };
            comboCostReal += (compData.cost_real * (comp.qty || 1));
            comboCostInvoice += (compData.cost_invoice * (comp.qty || 1));
          }
          productMap[p.sku].cost_real = comboCostReal;
          productMap[p.sku].cost_invoice = comboCostInvoice;
        }
      } catch(e) {
        // Bỏ qua nếu lỗi parse JSON để không sập API
        console.error("Lỗi parse combo_items cho SKU:", p.sku);
      }
    }
  }

  const productLookup = buildProductLookup(productRows)
  const { varMap, aliasMap } = await loadSkuResolutionMaps(env)

const BATCH = 50
  let updated = 0

  // ── Nhận tín hiệu khoanh vùng từ Client ──────────────────────────
  let targetSku = null;
  try {
    const body = await request.json();
    if (body && body.sku) targetSku = body.sku;
  } catch(e) {} // Bỏ qua nếu Client không gửi body

  // ── Recalc bảng mới (orders_v2) TỐI ƯU HÓA ───────────────────────
  let ordersV2;
  let itemsAll;

  if (targetSku) {
    console.log(`[RECALC_COST] ⚡ Tối ưu: Chỉ tính lại các đơn chứa SKU [${targetSku}]`);
    ordersV2 = await env.DB.prepare(`SELECT * FROM orders_v2 WHERE order_id IN (SELECT order_id FROM order_items WHERE sku = ?)`).bind(targetSku).all();
    itemsAll = await env.DB.prepare(`SELECT * FROM order_items WHERE order_id IN (SELECT order_id FROM order_items WHERE sku = ?)`).bind(targetSku).all();
  } else {
    console.log(`[RECALC_COST] ⚠️ Chạy Full: Tính lại TOÀN BỘ đơn hàng trong hệ thống...`);
    ordersV2 = await env.DB.prepare(`SELECT * FROM orders_v2`).all();
    itemsAll = await env.DB.prepare(`SELECT * FROM order_items`).all();
  }

  // Group items theo order_id
  const itemsByOrder = {}
  for (const item of itemsAll.results) {
    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = []
    itemsByOrder[item.order_id].push(item)
  }

  // Build tiktokFeeMap từ bảng tiktok_fees (nếu có)
  let tiktokFeeMap = {}
  try {
    const tiktokFees = await env.DB.prepare(`SELECT * FROM tiktok_order_fees`).all()
    for (const row of tiktokFees.results) {
      tiktokFeeMap[row.order_id] = row
    }
  } catch(e) {
    // Bảng chưa tồn tại hoặc không có dữ liệu — bỏ qua
    tiktokFeeMap = {}
  }

  const realFeeMap = await loadOrderFeeMap(env)

  let updatedV2 = 0
  for (let i = 0; i < ordersV2.results.length; i += 50) {
    const chunk = ordersV2.results.slice(i, i + 50)
    const stmts = chunk.map(o => {
      const orderItems       = itemsByOrder[o.order_id] || []
      const totalCostReal    = orderItems.reduce((s, item) => {
        const p = resolveItemProduct(productLookup, item, varMap, aliasMap)
        return s + Number(p.cost_real || 0) * (item.qty || 1)
      }, 0)
      const totalCostInvoice = orderItems.reduce((s, item) => {
        const p = resolveItemProduct(productLookup, item, varMap, aliasMap)
        return s + Number(p.cost_invoice || 0) * (item.qty || 1)
      }, 0)

      // Tính return_fee TRƯỚC calcProfit
      let return_fee = o.return_fee || 0
      if (o.order_type === "return") {
        return_fee = o.platform === "tiktok"
          ? (cfg["tiktok_return_fee"]?.value    ?? 4620)
          : (cfg["shopee_return_fee"]?.value     ?? 1620)
      } else if (o.order_type === "cancel") {
        const isFailed = /giao.*thất bại|không giao được|failed delivery/i.test(o.cancel_reason || "")
        if (isFailed) {
          return_fee = o.platform === "tiktok"
            ? (cfg["tiktok_failed_delivery_fee"]?.value ?? 1620)
            : (cfg["shopee_failed_delivery_fee"]?.value  ?? 1620)
        }
      }

      const realFee = realFeeMap[o.order_id] || {}
    const orderForCalc = {
      ...o,
      cost_invoice:    totalCostInvoice,
      cost_real:       totalCostReal,
      is_first_sku:    1,
      return_fee,
      ...realFee,
    }
    const p = calcProfit(orderForCalc, cfg)

      return env.DB.prepare(`
        UPDATE orders_v2 SET
          cost_invoice   = ?, cost_real      = ?,
          profit_invoice = ?, profit_real    = ?,
          fee            = ?, tax_flat       = ?,
          tax_income     = ?, fee_platform   = ?,
          fee_payment    = ?, fee_affiliate  = ?,
          fee_ads        = ?, fee_piship     = ?,
          fee_service    = ?, fee_packaging  = ?,
          fee_operation  = ?, fee_labor      = ?,
          return_fee     = ?
        WHERE order_id = ?
      `).bind(
        p.cost_invoice,  p.cost_real,
        p.profit_invoice, p.profit_real,
        p.total_fee,      p.tax_flat,
        p.tax_income,     p.fee_platform  || 0,
        p.fee_payment  || 0, p.fee_affiliate || 0,
        p.fee_ads      || 0, p.fee_piship    || 0,
        p.fee_service  || 0, p.fee_packaging || 0,
        p.fee_operation|| 0, p.fee_labor     || 0,
        return_fee,
        o.order_id
      )
    })
    await env.DB.batch(stmts)
    updatedV2 += chunk.length
  }

  // Cập nhật cost trong order_items
  const itemStmts = []
  for (const item of itemsAll.results) {
    const p = resolveItemProduct(productLookup, item, varMap, aliasMap)
    itemStmts.push(
      env.DB.prepare(`UPDATE order_items SET cost_real=?, cost_invoice=? WHERE id=?`)
        .bind(Number(p.cost_real || 0) * (item.qty||1), Number(p.cost_invoice || 0) * (item.qty||1), item.id)
    )
  }
  for (let i = 0; i < itemStmts.length; i += 50) {
    await env.DB.batch(itemStmts.slice(i, i + 50))
  }

  return Response.json({ status: "ok", updated, updated_v2: updatedV2 }, { headers: cors })
}

export async function ensureInventoryMovementTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      key TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      platform TEXT,
      shop TEXT,
      sku TEXT NOT NULL,
      warehouse_source TEXT NOT NULL DEFAULT 'main',
      qty_delta INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      order_status TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_inventory_movements_order ON inventory_movements(order_id)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_inventory_movements_sku ON inventory_movements(sku, warehouse_source)`).run()
}

export function stockImpactsInventory(order) {
  const oms = String(order?.oms_status || '').toUpperCase()
  const shipping = String(order?.shipping_status || '').toUpperCase()
  const type = String(order?.order_type || '').toLowerCase()
  if (oms === 'CANCELLED' || shipping === 'CANCELLED' || type === 'cancel') return false
  if (oms === 'UNPAID' || shipping === 'UNPAID') return false
  return ['PENDING', 'SHIPPING', 'SHIPPED', 'COMPLETED', 'RETURN'].includes(oms) ||
    ['LOGISTICS_PENDING_ARRANGE', 'LOGISTICS_REQUEST_CREATED', 'LOGISTICS_PACKAGED', 'SHIPPED', 'COMPLETED', 'RETURN', 'RETURN_REFUND', 'FAILED_DELIVERY'].includes(shipping)
}

export async function loadShopInventoryContext(env) {
  const apiShopKeys = new Set()
  const warehouseByShop = new Map()
  try {
    const { results } = await env.DB.prepare(`
      SELECT platform, shop_name, user_name, api_shop_id,
             COALESCE(warehouse_source, 'main') AS warehouse_source,
             access_token
      FROM shops
    `).all()
    for (const shop of results || []) {
      const platform = cleanOrderText(shop.platform).toLowerCase()
      const warehouse = shop.warehouse_source === 'sub' ? 'sub' : 'main'
      for (const value of [shop.shop_name, shop.user_name, shop.api_shop_id]) {
        const identity = cleanOrderText(value).toLowerCase()
        if (!platform || !identity) continue
        const key = `${platform}|${identity}`
        warehouseByShop.set(key, warehouse)
        if (cleanOrderText(shop.access_token)) apiShopKeys.add(key)
      }
    }
  } catch (error) {
    console.error('[INVENTORY_CONTEXT]', error.message)
  }
  return { apiShopKeys, warehouseByShop }
}

export function orderShopKey(order) {
  return `${String(order?.platform || '').toLowerCase()}|${cleanOrderText(order?.shop).toLowerCase()}`
}

export function isApiManagedOrder(order, apiShopKeys) {
  return apiShopKeys.has(orderShopKey(order))
}

export async function adjustProductStock(env, sku, warehouse, diff) {
  if (!sku || !diff) return
  if (warehouse === 'sub') {
    await env.DB.prepare(`
      UPDATE products
      SET stock_sub = IFNULL(stock_sub, 0) + ?,
          stock = IFNULL(stock_main, 0) + IFNULL(stock_sub, 0) + ?
      WHERE sku = ?
    `).bind(diff, diff, sku).run()
    return
  }
  await env.DB.prepare(`
    UPDATE products
    SET stock_main = IFNULL(stock_main, 0) + ?,
        stock = IFNULL(stock_main, 0) + ? + IFNULL(stock_sub, 0)
    WHERE sku = ?
  `).bind(diff, diff, sku).run()
}

export async function applyInventoryMovements(env, processedOrders, processedItems) {
  await ensureInventoryMovementTables(env)
  const ordersById = new Map(processedOrders.map(order => [String(order.order_id), order]))
  const orderIds = [...ordersById.keys()].filter(Boolean)
  if (!orderIds.length) return { adjusted: 0, restored: 0 }

  const { apiShopKeys, warehouseByShop } = await loadShopInventoryContext(env)
  const desired = new Map()

  for (const item of processedItems) {
    const orderId = String(item.order_id || '')
    const order = ordersById.get(orderId)
    const sku = cleanOrderText(item.sku)
    if (!order || !sku || isApiManagedOrder(order, apiShopKeys) || !stockImpactsInventory(order)) continue

    const shopKey = orderShopKey(order)
    const warehouse = warehouseByShop.get(shopKey) || 'main'
    const qty = Math.max(1, Number(item.qty || 1) || 1)
    const key = `${String(order.platform || '').toLowerCase()}|${cleanOrderText(order.shop)}|${orderId}|${sku}|${warehouse}`
    const previous = desired.get(key)
    const qtyDelta = -qty
    if (previous) previous.qty_delta += qtyDelta
    else desired.set(key, {
      key,
      order_id: orderId,
      platform: String(order.platform || '').toLowerCase(),
      shop: cleanOrderText(order.shop),
      sku,
      warehouse_source: warehouse,
      qty_delta: qtyDelta,
      reason: 'order_import',
      order_status: cleanOrderText(order.oms_status || order.shipping_status)
    })
  }

  const placeholders = orderIds.map(() => '?').join(',')
  const { results } = await env.DB.prepare(`
    SELECT key, order_id, sku, warehouse_source, qty_delta
    FROM inventory_movements
    WHERE order_id IN (${placeholders})
  `).bind(...orderIds).all()
  const existing = new Map((results || []).map(row => [row.key, row]))

  let adjusted = 0
  let restored = 0

  for (const movement of desired.values()) {
    const old = existing.get(movement.key)
    const oldQty = Number(old?.qty_delta || 0)
    const diff = movement.qty_delta - oldQty
    if (diff) {
      await adjustProductStock(env, movement.sku, movement.warehouse_source, diff)
      if (diff < 0) adjusted += Math.abs(diff)
      else restored += diff
    }
    await env.DB.prepare(`
      INSERT INTO inventory_movements
        (key, order_id, platform, shop, sku, warehouse_source, qty_delta, reason, order_status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        qty_delta = excluded.qty_delta,
        order_status = excluded.order_status,
        updated_at = datetime('now')
    `).bind(
      movement.key,
      movement.order_id,
      movement.platform,
      movement.shop,
      movement.sku,
      movement.warehouse_source,
      movement.qty_delta,
      movement.reason,
      movement.order_status
    ).run()
  }

  for (const [key, movement] of existing.entries()) {
    if (desired.has(key)) continue
    const qty = Number(movement.qty_delta || 0)
    if (qty) {
      await adjustProductStock(env, movement.sku, movement.warehouse_source || 'main', -qty)
      if (qty < 0) restored += Math.abs(qty)
    }
    await env.DB.prepare(`DELETE FROM inventory_movements WHERE key = ?`).bind(key).run()
  }

  return { adjusted, restored }
}

export async function refreshInventoryMovementsForOrders(env, orderIds) {
  const ids = [...new Set((orderIds || []).map(String).filter(Boolean))]
  if (!ids.length) return { adjusted: 0, restored: 0 }
  const placeholders = ids.map(() => '?').join(',')
  const orders = await env.DB.prepare(`
    SELECT *
    FROM orders_v2
    WHERE order_id IN (${placeholders})
  `).bind(...ids).all()
  const items = await env.DB.prepare(`
    SELECT *
    FROM order_items
    WHERE order_id IN (${placeholders})
  `).bind(...ids).all()
  return applyInventoryMovements(env, orders.results || [], items.results || [])
}

export function orderPushSignature(row = {}) {
  return [
    cleanOrderText(row.platform).toLowerCase(),
    cleanOrderText(row.shop).toLowerCase(),
    cleanOrderText(row.order_type).toLowerCase(),
    cleanOrderText(row.oms_status),
    cleanOrderText(row.shipping_status),
    cleanOrderText(row.shipping_carrier),
    cleanOrderText(row.tracking_number)
  ].join('|')
}

export async function loadOrderPushRows(env, orderIds) {
  const ids = [...new Set((orderIds || []).map(cleanOrderText).filter(Boolean))]
  if (!ids.length) return []
  const rows = []
  const BATCH = 80
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const placeholders = chunk.map(() => '?').join(',')
    const { results } = await env.DB.prepare(`
      SELECT order_id, platform, shop, order_date, order_type, revenue,
             oms_status, shipping_status, shipping_carrier, tracking_number,
             oms_updated_at
      FROM orders_v2
      WHERE order_id IN (${placeholders})
    `).bind(...chunk).all()
    rows.push(...(results || []))
  }
  return rows
}
