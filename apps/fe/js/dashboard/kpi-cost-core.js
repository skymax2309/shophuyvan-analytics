(function () {
  function money(value) {
    const number = Number(value || 0)
    return Number.isFinite(number) ? number : 0
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
  }

  function isPackagingCost(row) {
    const text = normalizeText(`${row?.cost_name || ''} ${row?.cost_key || ''}`)
    return text.includes('dong goi') || text.includes('packaging') || text.includes('packing')
  }

  function splitOperationCosts(rows) {
    const costs = Array.isArray(rows) ? rows : []
    const total = costs.reduce((sum, row) => sum + money(row.actual_amount), 0)
    const packagingCosts = costs.filter(isPackagingCost)
    const packagingTotal = packagingCosts.reduce((sum, row) => sum + money(row.actual_amount), 0)
    return {
      total,
      packagingCosts,
      packagingTotal,
      operationTotal: Math.max(0, total - packagingTotal),
    }
  }

  function normalizeFeeComponent(row) {
    return {
      key: row?.key || '',
      label: row?.label || 'Khoản phí',
      value: money(row?.value),
      source: row?.source || 'core',
      source_label: row?.source_label || row?.source || 'Core',
      confidence: row?.confidence || 'confirmed',
      note: row?.note || '',
      percent_of_total: Number(row?.percent_of_total || 0),
    }
  }

  function buildFeeContext(dash, opPackagingTotal = 0) {
    const core = dash?.finance_fee_core
    if (!core || !core.totals) return null

    const totals = core.totals || {}
    const components = Array.isArray(core.components)
      ? core.components.map(normalizeFeeComponent)
      : []
    const discountComponents = Array.isArray(core.discount_components)
      ? core.discount_components.map(normalizeFeeComponent)
      : []
    const opsComponents = Array.isArray(core.ops_components)
      ? core.ops_components.map(normalizeFeeComponent)
      : []
    const packagingTotal = money(opPackagingTotal)

    const displayTotal = money(totals.display_total)
    const bucketedTotal = money(totals.bucketed_total)
    const unbucketedTotal = money(totals.unbucketed_total)

    // Frontend chỉ chuyển core backend thành biến render cũ để các card dùng chung một nguồn phí.
    return {
      t1_disc: money(totals.shop_discount_amount),
      t1_disc_shopee: money(totals.platform_voucher_amount),
      t1_disc_combo: money(totals.combo_discount_amount),
      t1_comm: money(totals.commission_fee),
      t1_svc: money(totals.service_fee),
      t1_pay: money(totals.payment_fee),
      t1_aff: money(totals.affiliate_fee),
      t1_ads: money(totals.ads_fee),
      t1_pish: money(totals.piship_fee),
      t1_handling: money(totals.handling_fee),
      t1_shipping: money(totals.shipping_fee),
      t1_fee_tax_vat: money(totals.tax_vat),
      t1_fee_tax_pit: money(totals.tax_pit),
      t1_fixed_from_order: money(totals.fixed_fee),
      t1_fixed: money(totals.fixed_fee) + packagingTotal,
      t1_ops_ads_fee: money(totals.ops_ads_fee_total),
      t1_ops_components: opsComponents,
      t1_fee_detail: bucketedTotal,
      t1_fee_fallback: displayTotal,
      t1_fee: displayTotal,
      t1_fee_unbucketed: unbucketedTotal,
      t1_fee_using_fallback: unbucketedTotal > 0,
      t1_fee_detail_orders: Number(core.detail_orders || 0),
      t1_fee_scope_orders: Number(core.scope_orders || 0),
      t1_fee_source_note: core.summary?.note || 'Đã chuẩn hóa từ Finance Core',
      t1_fee_components: components,
      t1_discount_components: discountComponents,
      t1_fee_basis_label: totals.percent_basis_label || 'Người mua thanh toán',
      t1_fee_core: core,
    }
  }

  window.SHV_KPI_CORE = {
    splitOperationCosts,
    buildFeeContext,
  }
})()
