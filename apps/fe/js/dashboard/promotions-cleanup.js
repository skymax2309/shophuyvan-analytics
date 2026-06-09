{
  const Promo = window.SHV_PROMO
  const { state, MODULES, esc, text, numText, dateLabel, statusTone, capabilityAllows, emptyState } = Promo

  function cleanupRows() {
    const rows = []
    for (const mod of MODULES) {
      const data = state.moduleData[mod.key] || {}
      const canWrite = capabilityAllows(data)
      for (const row of data.programs || []) {
        const statusText = `${row.status || ''} ${row.status_label || ''}`.toLowerCase()
        const ended = /expired|ended|finish|finished|deleted|kết thúc/.test(statusText)
        if (state.cleanup.status === 'expired' && !ended) continue
        if (state.cleanup.no_products && Number(row.item_count || 0) > 0) continue
        rows.push({ ...row, module_key: mod.key, module_name: mod.name, module_value: mod.module, canWrite })
      }
    }
    return rows
  }

  function actionButtons(row, index) {
    if (!row.canWrite) {
      return '<span class="promo-pill neutral">Chưa thể tự áp dụng trên sàn</span>'
    }
    const actions = []
    if (row.platform === 'shopee') {
      actions.push(`<button class="promo-btn warning" type="button" data-cleanup-action="end" data-index="${index}">Kết thúc trên sàn</button>`)
      if (!(row.module_value === 'shop_flash_sale' && /expired|ended|kết thúc/i.test(`${row.status} ${row.status_label}`))) {
        actions.push(`<button class="promo-btn danger" type="button" data-cleanup-action="delete" data-index="${index}">Xóa trên sàn</button>`)
      }
    }
    if (row.platform === 'lazada') {
      actions.push(`<button class="promo-btn warning" type="button" data-cleanup-action="deactivate" data-index="${index}">Tắt trên sàn</button>`)
    }
    actions.push(`<button class="promo-btn secondary" type="button" data-cleanup-action="hide" data-index="${index}">Ẩn khỏi danh sách hoạt động</button>`)
    return actions.join('')
  }

  function renderCleanup() {
    state.view = 'cleanup'
    const rows = cleanupRows()
    state.cleanup.visibleRows = rows
    const target = Promo.el('promotionWorkPanel')
    Promo.el('promotionModuleDetail').hidden = true
    target.hidden = false
    target.innerHTML = `
      <section class="promo-panel promo-cleanup-panel">
        <div class="promo-section-title">
          <div>
            <span>Dọn chương trình cũ</span>
            <h2>Chương trình cần xử lý</h2>
            <p>Chỉ thao tác lên sàn khi dữ liệu quyền ghi cho phép. Lịch sử trong dữ liệu chuẩn không bị xóa.</p>
          </div>
          <button class="promo-btn secondary" type="button" data-promo-action="reload-cleanup">Làm mới danh sách</button>
        </div>
        <div class="promo-cleanup-filter">
          <label>Nhóm chương trình
            <select data-cleanup-filter="status">
              <option value="expired" ${state.cleanup.status === 'expired' ? 'selected' : ''}>Đã kết thúc</option>
              <option value="all" ${state.cleanup.status === 'all' ? 'selected' : ''}>Tất cả trạng thái</option>
            </select>
          </label>
          <label>Không chạy X ngày
            <input type="number" min="1" step="1" value="${esc(state.cleanup.inactive_days)}" data-cleanup-filter="inactive_days">
          </label>
          <label class="promo-check"><input type="checkbox" ${state.cleanup.no_products ? 'checked' : ''} data-cleanup-filter="no_products"> Không có sản phẩm</label>
          <label class="promo-check"><input type="checkbox" ${state.cleanup.no_revenue ? 'checked' : ''} data-cleanup-filter="no_revenue"> Không có doanh thu</label>
        </div>
        ${state.error ? `<div class="promo-state error"><b>Lỗi tải danh sách</b><span>${esc(state.error)}</span></div>` : state.loading ? '<div class="promo-state empty"><b>Đang tải danh sách...</b><span>Hệ thống đang đọc chương trình đã kết thúc.</span></div>' : rows.length ? `
          <div class="promo-cleanup-list">
            ${rows.map((row, index) => `
              <article class="promo-cleanup-row">
                <div>
                  <b>${esc(text(row.promotion_name, 'Chương trình'))}</b>
                  <span>${esc(row.module_name)} · ${esc(text(row.shop))}</span>
                </div>
                <span class="promo-pill ${statusTone(row.status || row.status_label)}">${esc(text(row.status_label || row.status, 'Đã kết thúc'))}</span>
                <span>Ngày kết thúc <b>${esc(dateLabel(row.end_time))}</b></span>
                <span class="promo-num">${numText(row.item_count || 0)} SKU</span>
                <div class="promo-row-actions">${actionButtons(row, index)}</div>
              </article>
            `).join('')}
          </div>
        ` : emptyState('Chưa có chương trình cũ theo bộ lọc', 'Không có thao tác nào được gửi lên sàn trong trạng thái này.')}
      </section>
    `
  }

  async function showPromotionCleanup() {
    await Promise.all(MODULES.map(mod => Promo.api.fetchPromotionModule(mod.key, 'expired').catch(() => null)))
    renderCleanup()
  }

  function updateCleanupFilter(key, value) {
    state.cleanup[key] = value
    renderCleanup()
  }

  window.SHV_PROMO_CLEANUP = {
    renderCleanup,
    showPromotionCleanup,
    updateCleanupFilter
  }
}
