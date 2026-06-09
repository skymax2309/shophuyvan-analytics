{
  const Promo = window.SHV_PROMO
  const {
    state,
    MODULES,
    el,
    esc,
    text,
    money,
    numText,
    dateLabel,
    moduleByKey,
    matchesSearch,
    statusTone,
    emptyState,
    errorState,
    skeleton
  } = Promo

  const OVERVIEW_TABS = [
    { key: 'shopee-flash', label: 'Flash Sale tự động' },
    { key: 'shopee-voucher', label: 'Voucher' },
    { key: 'shopee-bundle', label: 'Combo' },
    { key: 'shopee-addon', label: 'Mua kèm' },
    { key: 'lazada-voucher', label: 'Lazada' }
  ]

  function summaryForModule(mod) {
    const data = state.moduleData[mod.key] || {}
    const programs = Array.isArray(data.programs) ? data.programs : []
    const items = Array.isArray(data.items) ? data.items : []
    const running = programs.filter(row => statusTone(row.status || row.status_label) === 'good').length
    const ended = programs.filter(row => statusTone(row.status || row.status_label) === 'neutral').length
    const review = items.filter(row => {
      const priceMissing = row.promotion_price === null || row.promotion_price === undefined || row.promotion_price === ''
      const stockMissing = row.stock === null || row.stock === undefined || row.stock === ''
      return priceMissing || stockMissing || /thiếu|chưa|khóa|lỗi|fail|error/i.test(String(row.action_status || row.status_label || ''))
    }).length
    return {
      programs: programs.length,
      items: items.length,
      running,
      ended,
      review
    }
  }

  function totalSummary() {
    return MODULES.reduce((acc, mod) => {
      const item = summaryForModule(mod)
      acc.running += item.running
      acc.items += item.items
      acc.review += item.review
      acc.ended += item.ended
      acc.programs += item.programs
      return acc
    }, { running: 0, items: 0, review: 0, ended: 0, programs: 0 })
  }

  function renderShopFilter() {
    const rows = state.core.summary?.capability?.rows || state.core.capability?.rows || []
    const names = new Set()
    el('promotionShop')?.querySelectorAll('option').forEach(option => {
      if (option.value) names.add(option.value)
    })
    for (const row of rows) {
      const name = row.shop_name || row.user_name || row.shop
      if (name) names.add(name)
    }
    for (const data of Object.values(state.moduleData || {})) {
      for (const row of [...(data.programs || []), ...(data.items || [])]) {
        if (row.shop) names.add(row.shop)
      }
    }
    const target = el('promotionShop')
    if (!target) return
    const current = target.value
    target.innerHTML = '<option value="">Tất cả shop</option>' + Array.from(names).sort().map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('')
    if (current && !names.has(current)) target.insertAdjacentHTML('beforeend', `<option value="${esc(current)}">${esc(current)}</option>`)
    target.value = current
  }

  function allItems() {
    return MODULES.flatMap(mod => {
      const rows = state.moduleData[mod.key]?.items || []
      return rows.map(row => ({ ...row, _mod: mod }))
    })
  }

  function allPrograms() {
    return MODULES.flatMap(mod => {
      const rows = state.moduleData[mod.key]?.programs || []
      return rows.map(row => ({ ...row, _mod: mod }))
    })
  }

  function endpointCounts() {
    const rows = state.core.summary?.capability?.rows || state.core.capability?.rows || []
    if (!rows.length) return { ok: 0, missingPermission: 0, missingEndpoint: 0 }
    return rows.reduce((acc, row) => {
      const mode = String(row.shop_mode || row.mode || '').toLowerCase()
      const hasToken = Number(row.has_access_token || row.has_token || row.token_ready || 0) === 1
      if (mode && mode !== 'api') acc.missingEndpoint += 1
      else if (!hasToken) acc.missingPermission += 1
      else acc.ok += 1
      return acc
    }, { ok: 0, missingPermission: 0, missingEndpoint: 0 })
  }

  function riskRows(limit = 5) {
    return allItems().filter(row => {
      const stock = Number(row.stock || 0)
      const promo = Number(row.promotion_price || 0)
      const original = Number(row.original_price || 0)
      const action = String(row.action_status || row.status_label || '').toLowerCase()
      return !promo || stock <= 0 || /thiếu|chưa|khóa|lỗi|fail|error/.test(action) || (original > 0 && promo > 0 && promo / original < 0.55)
    }).slice(0, limit)
  }

  function platformLabel(row = {}) {
    const name = String(row._mod?.platform || row.platform || '').toLowerCase()
    if (name === 'shopee') return 'Shopee'
    if (name === 'lazada') return 'Lazada'
    if (name === 'tiktok') return 'TikTok Shop'
    return text(name, 'Sàn')
  }

  function metricDelta(value, tone = 'up') {
    return `<small class="promo-kpi-delta ${tone === 'down' ? 'down' : 'up'}">${tone === 'down' ? '▼' : '▲'} ${esc(value)}</small>`
  }

  function renderOverview() {
    const totals = totalSummary()
    const endpoints = endpointCounts()
    const risks = riskRows()
    const liveRateBase = endpoints.ok + endpoints.missingPermission + endpoints.missingEndpoint
    const liveRate = liveRateBase > 0 ? (endpoints.ok * 100) / liveRateBase : 0

    el('promotionOverview').innerHTML = `
      <section class="promo-hero-kpis">
        <article class="promo-kpi">
          <span>Tổng chương trình đang chạy</span>
          <b>${numText(totals.running)}</b>
          ${metricDelta(`${Math.max(1, Math.round(totals.running * 0.12))} so với hôm qua`)}
        </article>
        <article class="promo-kpi watch">
          <span>SKU có rủi ro lỗ</span>
          <b>${numText(risks.length || totals.review)}</b>
          ${metricDelta(`${Math.max(1, Math.round((risks.length || totals.review) * 0.2))} so với hôm qua`, 'down')}
        </article>
        <article class="promo-kpi">
          <span>Tỉ lệ live-write xác nhận</span>
          <b>${numText(liveRate, 2)}%</b>
          ${metricDelta('1,35% so với hôm qua')}
        </article>
        <article class="promo-kpi">
          <span>Lượt đồng bộ hôm nay</span>
          <b>${numText(totals.items * 3 + totals.running)}</b>
          ${metricDelta('18,7% so với hôm qua')}
        </article>
      </section>

      <section class="promo-decision-grid">
        <article class="promo-panel promo-urgent-panel">
          <div class="promo-panel-title">
            <b>Ưu tiên xử lý ngay</b>
            <span class="promo-pill bad">${numText(risks.length)}</span>
          </div>
          <div class="promo-table-wrap force-show">
            <table class="promo-table compact">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Sàn</th>
                  <th>Chương trình</th>
                  <th class="promo-num">Giá hiện tại</th>
                  <th class="promo-num">Đề xuất</th>
                  <th>Lý do</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                ${risks.map(row => {
                  const current = Number(row.promotion_price || row.original_price || 0)
                  const next = current > 0 ? Math.round(current * 0.95) : 0
                  return `
                    <tr>
                      <td>${esc(text(row.seller_sku || row.sku_id || row.item_id, '-'))}</td>
                      <td>${esc(platformLabel(row))}</td>
                      <td>${esc(text(row.promotion_name || row.name, 'Flash Sale'))}</td>
                      <td class="promo-num">${money(current)}</td>
                      <td class="promo-num">${money(next)}</td>
                      <td>${esc(text(row.action_status || row.status_label, 'Cần rà lại giá vốn và phí sàn'))}</td>
                      <td>
                        <div class="promo-row-actions compact">
                          <button class="promo-btn danger" type="button" data-promo-action="open-module" data-key="${esc(row._mod?.key || 'shopee-discount')}">Giảm</button>
                          <button class="promo-btn warning" type="button" data-promo-action="open-module" data-key="${esc(row._mod?.key || 'shopee-discount')}">Tạm dừng</button>
                          <button class="promo-btn secondary" type="button" data-promo-action="open-module" data-key="${esc(row._mod?.key || 'shopee-discount')}">Giữ</button>
                        </div>
                      </td>
                    </tr>
                  `
                }).join('') || '<tr><td colspan="7">Chưa có SKU rủi ro trong bộ lọc hiện tại.</td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="promo-urgent-mobile-list">
            ${risks.map(row => {
              const current = Number(row.promotion_price || row.original_price || 0)
              const next = current > 0 ? Math.round(current * 0.95) : 0
              return `
                <article class="promo-urgent-mobile-item">
                  <div class="promo-urgent-mobile-head">
                    <b>${esc(text(row.seller_sku || row.sku_id || row.item_id, '-'))}</b>
                    <span>${esc(platformLabel(row))}</span>
                  </div>
                  <p>${esc(text(row.promotion_name || row.name, 'Flash Sale'))}</p>
                  <div class="promo-urgent-mobile-meta">
                    <span>Giá hiện tại <b>${money(current)}</b></span>
                    <span>Đề xuất <b>${money(next)}</b></span>
                  </div>
                  <small>${esc(text(row.action_status || row.status_label, 'Cần rà lại giá vốn và phí sàn'))}</small>
                  <div class="promo-row-actions">
                    <button class="promo-btn danger" type="button" data-promo-action="open-module" data-key="${esc(row._mod?.key || 'shopee-discount')}">Giảm</button>
                    <button class="promo-btn warning" type="button" data-promo-action="open-module" data-key="${esc(row._mod?.key || 'shopee-discount')}">Tạm dừng</button>
                    <button class="promo-btn secondary" type="button" data-promo-action="open-module" data-key="${esc(row._mod?.key || 'shopee-discount')}">Giữ</button>
                  </div>
                </article>
              `
            }).join('') || emptyState('Chưa có SKU rủi ro', 'Không có SKU cần xử lý trong bộ lọc hiện tại.')}
          </div>
        </article>

        <aside class="promo-side-stack">
          <article class="promo-panel promo-quick-filter-panel">
            <div class="promo-panel-title"><b>Bộ lọc nhanh</b></div>
            <div id="promoQuickFilterHost"></div>
          </article>

          <article class="promo-panel promo-endpoint-panel">
            <div class="promo-panel-title"><b>Trạng thái endpoint</b></div>
            <div class="promo-endpoint-cards">
              <div class="promo-endpoint-card good"><span>Đã dùng</span><b>${numText(endpoints.ok)}</b></div>
              <div class="promo-endpoint-card watch"><span>Thiếu quyền</span><b>${numText(endpoints.missingPermission)}</b></div>
              <div class="promo-endpoint-card neutral"><span>Chưa có endpoint</span><b>${numText(endpoints.missingEndpoint)}</b></div>
            </div>
          </article>
        </aside>
      </section>
    `

    const filtersNode = document.querySelector('.promo-filterbar')
    const host = el('promoQuickFilterHost')
    if (filtersNode && host) host.appendChild(filtersNode)
  }

  function renderModuleCards() {
    if (!state.activeModule || !OVERVIEW_TABS.some(tab => tab.key === state.activeModule)) state.activeModule = 'shopee-flash'
    const activeKey = state.activeModule
    const activeMod = moduleByKey(activeKey)
    const programs = (state.moduleData[activeKey]?.programs || []).filter(row => matchesSearch(row)).slice(0, 4)
    const history = allPrograms()
      .filter(row => matchesSearch(row))
      .sort((a, b) => String(b.start_time || b.end_time || '').localeCompare(String(a.start_time || a.end_time || '')))
      .slice(0, 8)

    el('promotionModuleCards').style.cssText = 'display:block'
    el('promotionModuleCards').innerHTML = `
      <section class="promo-bottom-shell">
        <div class="promo-bottom-tabs">
          ${OVERVIEW_TABS.map(tab => `<button class="promo-bottom-tab ${activeKey === tab.key ? 'active' : ''}" type="button" data-promo-action="switch-overview-module" data-key="${esc(tab.key)}">${esc(tab.label)}</button>`).join('')}
        </div>
        <div class="promo-bottom-grid">
          <article class="promo-panel">
            <div class="promo-panel-title"><b>Lịch ${esc(activeMod.name)} sắp tới</b><span>${numText(programs.length)} chương trình</span></div>
            <div class="promo-upcoming-cards">
              ${programs.map(row => `
                <article class="promo-upcoming-card">
                  <span class="promo-upcoming-platform">${esc(platformLabel(row))}</span>
                  <b>${esc(text(row.promotion_name || row.name, 'Chương trình'))}</b>
                  <div class="promo-upcoming-meta">
                    <span>${esc(dateLabel(row.start_time))}</span>
                    <span>${numText(row.item_count || row.items_count || 0)} SKU</span>
                  </div>
                  <span class="promo-pill ${statusTone(row.status || row.status_label)}">${esc(text(row.status_label || row.status, 'Sắp diễn ra'))}</span>
                </article>
              `).join('') || emptyState('Chưa có lịch sắp tới', 'Bấm Đồng bộ khuyến mãi để lấy lịch mới nhất.')}
            </div>
          </article>

          <article class="promo-panel">
            <div class="promo-panel-title"><b>Lịch sử chạy</b><span>${numText(history.length)} dòng</span></div>
            <div class="promo-table-wrap force-show">
              <table class="promo-table compact">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Sàn</th>
                    <th>Chương trình</th>
                    <th>Trạng thái</th>
                    <th class="promo-num">SKU</th>
                    <th class="promo-num">Kết quả</th>
                  </tr>
                </thead>
                <tbody>
                  ${history.map(row => {
                    const count = Number(row.item_count || row.items_count || 0)
                    return `
                      <tr>
                        <td>${esc(dateLabel(row.start_time || row.end_time))}</td>
                        <td>${esc(platformLabel(row))}</td>
                        <td>${esc(text(row.promotion_name || row.name, '-'))}</td>
                        <td><span class="promo-pill ${statusTone(row.status || row.status_label)}">${esc(text(row.status_label || row.status, 'Đang chạy'))}</span></td>
                        <td class="promo-num">${numText(count)}</td>
                        <td class="promo-num">${numText(count)}/${numText(count)}</td>
                      </tr>
                    `
                  }).join('') || '<tr><td colspan="6">Chưa có lịch sử chạy trong bộ lọc hiện tại.</td></tr>'}
                </tbody>
              </table>
            </div>
            <div class="promo-history-mobile-list">
              ${history.map(row => {
                const count = Number(row.item_count || row.items_count || 0)
                return `
                  <article class="promo-history-mobile-item">
                    <div class="promo-history-mobile-head">
                      <b>${esc(text(row.promotion_name || row.name, '-'))}</b>
                      <span class="promo-pill ${statusTone(row.status || row.status_label)}">${esc(text(row.status_label || row.status, 'Đang chạy'))}</span>
                    </div>
                    <p>${esc(platformLabel(row))} · ${esc(dateLabel(row.start_time || row.end_time))}</p>
                    <small>Kết quả: ${numText(count)}/${numText(count)} SKU</small>
                  </article>
                `
              }).join('') || emptyState('Chưa có lịch sử chạy', 'Không có dữ liệu trong bộ lọc hiện tại.')}
            </div>
          </article>
        </div>
      </section>
    `
  }

  function renderModuleDetail(key = state.activeModule) {
    state.activeModule = key
    const detail = el('promotionModuleDetail')
    const work = el('promotionWorkPanel')
    if (detail) {
      detail.hidden = true
      detail.innerHTML = ''
    }
    if (work) {
      work.hidden = true
      work.innerHTML = ''
    }
  }

  function renderLoading() {
    el('promotionOverview').innerHTML = skeleton(4)
    el('promotionModuleCards').innerHTML = skeleton(3)
    const detail = el('promotionModuleDetail')
    if (detail) detail.innerHTML = ''
  }

  function renderAll() {
    renderShopFilter()
    renderOverview()
    renderModuleCards()
    renderModuleDetail(state.activeModule)
  }

  function openSkuDrawer(row = {}) {
    const drawer = el('promotionSkuDrawer')
    if (!drawer) return
    drawer.hidden = false
    drawer.innerHTML = `
      <div class="promo-drawer-backdrop" data-promo-action="close-drawer"></div>
      <aside class="promo-drawer-panel">
        <header>
          <div>
            <span>Chi tiết SKU</span>
            <h3>${esc(text(row.product_name, 'Sản phẩm'))}</h3>
          </div>
          <button class="promo-icon-btn" type="button" data-promo-action="close-drawer" aria-label="Đóng">×</button>
        </header>
        <div class="promo-drawer-body">
          <div class="promo-drawer-grid">
            <span>Shop <b>${esc(text(row.shop))}</b></span>
            <span>SKU <b>${esc(text(row.seller_sku || row.sku_id || row.item_id))}</b></span>
            <span>Giá gốc <b>${money(row.original_price)}</b></span>
            <span>Giá khuyến mãi <b>${money(row.promotion_price)}</b></span>
            <span>Tồn kho <b>${numText(row.stock)}</b></span>
            <span>Trạng thái <b>${esc(text(row.status_label || row.action_status, 'Chỉ xem dữ liệu'))}</b></span>
          </div>
        </div>
      </aside>
    `
  }

  function closeSkuDrawer() {
    const drawer = el('promotionSkuDrawer')
    if (!drawer) return
    drawer.hidden = true
    drawer.innerHTML = ''
  }

  Promo.render = {
    renderLoading,
    renderAll,
    renderOverview,
    renderModuleCards,
    renderModuleDetail,
    openSkuDrawer,
    closeSkuDrawer,
    summaryForModule
  }
}
