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

  window.SHV_KPI_CORE = {
    splitOperationCosts,
  }
})()
