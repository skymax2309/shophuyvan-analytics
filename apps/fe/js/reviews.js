(function () {
  const API = window.SHV_AUTH?.API || window.SHV_API || 'https://huyvan-worker-api.nghiemchihuy.workers.dev'
  const state = {
    activeTab: 'overview',
    core: null,
    actions: null,
    selectedReview: null,
    selectedSuggestion: '',
    loading: false
  }

  function cleanText(value) {
    return String(value ?? '').replace(/\u00a0/g, ' ').trim()
  }

  function lowerText(value) {
    return cleanText(value).toLowerCase()
  }

  function escapeHtml(value) {
    return cleanText(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function formatNumber(value) {
    const number = Number(value || 0)
    return Number.isFinite(number) ? number.toLocaleString('vi-VN') : '0'
  }

  function formatMoney(value) {
    const number = Number(value || 0)
    return `${Number.isFinite(number) ? number.toLocaleString('vi-VN') : '0'}đ`
  }

  function formatDate(value) {
    const text = cleanText(value)
    if (!text) return 'Chưa rõ ngày'
    const date = new Date(text)
    if (Number.isNaN(date.getTime())) return text
    return date.toLocaleString('vi-VN', { hour12: false })
  }

  function el(id) {
    return document.getElementById(id)
  }

  function setStatus(message, tone = '') {
    const box = el('reviewStatus')
    if (!box) return
    box.textContent = message
    box.style.borderColor = tone === 'error' ? '#fecaca' : tone === 'success' ? '#bbf7d0' : '#cbd5e1'
    box.style.color = tone === 'error' ? '#b91c1c' : tone === 'success' ? '#15803d' : '#64748b'
    box.style.background = tone === 'error' ? '#fff1f2' : tone === 'success' ? '#f0fdf4' : '#fff'
  }

  async function fetchJson(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      cache: 'no-store',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      ...options
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.error) throw new Error(cleanText(data.error || data.message || data.errors?.[0] || `HTTP ${response.status}`))
    return data
  }

  function currentFilters() {
    return {
      platform: el('reviewPlatformFilter')?.value || '',
      shop: el('reviewShopFilter')?.value || '',
      limit: el('reviewLimitSelect')?.value || '30',
      q: lowerText(el('reviewSearchInput')?.value || '')
    }
  }

  function buildQuery(params = {}) {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (cleanText(value)) search.set(key, value)
    })
    return search.toString()
  }

  function allReviewRows() {
    const core = state.core || {}
    const rows = [
      ...(Array.isArray(core.attention) ? core.attention : []),
      ...(Array.isArray(core.recent) ? core.recent : [])
    ]
    const seen = new Set()
    return rows.filter(row => {
      const key = `${row.platform}|${row.shop}|${row.review_id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  function filteredReviews(rows = allReviewRows()) {
    const { q } = currentFilters()
    if (!q) return rows
    return rows.filter(row => [
      row.platform,
      row.shop,
      row.review_id,
      row.order_id,
      row.platform_item_id,
      row.item_sku,
      row.product_name,
      row.buyer_name,
      row.review_text,
      row.seller_reply
    ].some(value => lowerText(value).includes(q)))
  }

  function ratingLabel(row = {}) {
    const rating = Number(row.rating_overall || 0)
    return rating ? `${rating.toLocaleString('vi-VN')}★` : 'Chưa có sao'
  }

  function reviewBadges(row = {}) {
    const badges = []
    if (Number(row.is_negative)) badges.push('<span class="review-pill bad">Review xấu</span>')
    if (Number(row.can_reply) && !Number(row.has_reply)) badges.push('<span class="review-pill warn">Cần trả lời</span>')
    if (Number(row.has_reply)) badges.push('<span class="review-pill good">Đã trả lời</span>')
    if (Number(row.has_media)) badges.push('<span class="review-pill info">Có ảnh/video</span>')
    return badges.join('')
  }

  function renderSummaryCards() {
    const summary = state.core?.summary || {}
    const cards = [
      ['Tổng review', summary.total_reviews],
      ['Review xấu', summary.negative_reviews],
      ['Cần trả lời', summary.need_reply_reviews],
      ['Có ảnh/video', summary.with_media_reviews],
      ['Trùng ADS', summary.ads_risk_reviews],
      ['Thiếu map', summary.catalog_gap_reviews]
    ]
    el('reviewSummaryCards').innerHTML = cards.map(([label, value]) => `
      <article class="review-stat">
        <span>${escapeHtml(label)}</span>
        <strong>${formatNumber(value)}</strong>
      </article>
    `).join('')
  }

  function renderShopFilter() {
    const select = el('reviewShopFilter')
    if (!select || select.dataset.loaded === '1') return
    const shops = Array.isArray(state.core?.by_shop) ? state.core.by_shop : []
    select.innerHTML = '<option value="">Tất cả shop</option>' + shops.map(row => `
      <option value="${escapeHtml(row.shop)}">${escapeHtml(row.platform)} - ${escapeHtml(row.shop)}</option>
    `).join('')
    select.dataset.loaded = '1'
  }

  function renderReviewCard(row = {}) {
    const canReply = Number(row.can_reply) && !Number(row.has_reply)
    const platformArg = encodeURIComponent(cleanText(row.platform))
    const shopArg = encodeURIComponent(cleanText(row.shop))
    const reviewArg = encodeURIComponent(cleanText(row.review_id))
    return `
      <article class="review-row">
        <div class="review-row-head">
          <div>
            <b>${escapeHtml(row.product_name || 'Sản phẩm chưa rõ')}</b>
            <div class="review-meta">
              <span>${escapeHtml(row.platform)} / ${escapeHtml(row.shop)}</span>
              <span>SKU: ${escapeHtml(row.item_sku || row.platform_item_id || 'chưa map')}</span>
              <span>${escapeHtml(formatDate(row.reviewed_at || row.updated_at))}</span>
            </div>
          </div>
          <span class="review-pill ${Number(row.is_negative) ? 'bad' : 'info'}">${escapeHtml(ratingLabel(row))}</span>
        </div>
        <div class="review-badges">${reviewBadges(row)}</div>
        <div class="review-text">${escapeHtml(row.review_text || 'Khách không để lại nội dung.')}</div>
        ${row.seller_reply ? `<div class="review-text"><b>Shop đã trả lời:</b> ${escapeHtml(row.seller_reply)}</div>` : ''}
        <div class="review-row-actions">
          <button type="button" class="primary" onclick="selectReviewForReply('${platformArg}','${shopArg}','${reviewArg}')" ${canReply ? '' : 'disabled'}>Gợi ý trả lời</button>
          <button type="button" onclick="copyReviewInfo('${reviewArg}')">Copy mã</button>
        </div>
      </article>
    `
  }

  function renderOverview() {
    const byShop = Array.isArray(state.core?.by_shop) ? state.core.by_shop : []
    const riskRows = Array.isArray(state.core?.ads_risk) ? state.core.ads_risk : []
    el('reviewPanelOverview').innerHTML = `
      <div class="review-section-title">
        <h2>Phase 1 - Tổng quan theo shop</h2>
        <details class="review-help"><summary>?</summary>Shop có API đọc review từ sàn. Shop chưa API chỉ xem dữ liệu đã lưu/import.</details>
      </div>
      <div class="review-table-wrap">
        <table class="review-table">
          <thead><tr><th>Sàn/shop</th><th>Tổng</th><th>Review xấu</th><th>Cần trả lời</th><th>Lần đồng bộ</th></tr></thead>
          <tbody>
            ${byShop.length ? byShop.map(row => `
              <tr>
                <td><b>${escapeHtml(row.platform)}</b><br>${escapeHtml(row.shop)}</td>
                <td>${formatNumber(row.total_reviews)}</td>
                <td>${formatNumber(row.negative_reviews)}</td>
                <td>${formatNumber(row.need_reply_reviews)}</td>
                <td>${escapeHtml(formatDate(row.last_synced_at))}</td>
              </tr>
            `).join('') : '<tr><td colspan="5">Chưa có dữ liệu review.</td></tr>'}
          </tbody>
        </table>
      </div>
      <div style="height:12px"></div>
      <div class="review-section-title"><h2>Sản phẩm review xấu còn trùng ADS</h2></div>
      <div class="review-risk-list">
        ${riskRows.length ? riskRows.map(row => `
          <article class="review-risk-row">
            <b>${escapeHtml(row.product_name || 'Sản phẩm chưa rõ')}</b>
            <div class="review-meta">
              <span>${escapeHtml(row.platform)} / ${escapeHtml(row.shop)}</span>
              <span>SKU: ${escapeHtml(row.item_sku || row.platform_item_id || 'chưa map')}</span>
              <span>Chi ADS: ${formatMoney(row.spend)}</span>
              <span>Doanh thu ADS: ${formatMoney(row.revenue)}</span>
            </div>
            <div class="review-text">${escapeHtml(row.review_text || 'Chưa có mẫu nội dung review.')}</div>
          </article>
        `).join('') : '<div class="review-empty">Chưa thấy sản phẩm review xấu đang trùng ADS trong dữ liệu hiện tại.</div>'}
      </div>
    `
  }

  function renderAttention() {
    const rows = filteredReviews((state.core?.attention || []))
    el('reviewPanelAttention').innerHTML = `
      <div class="review-section-title">
        <h2>Review cần xử lý</h2>
        <details class="review-help"><summary>?</summary>Ưu tiên review xấu và review còn có thể trả lời nhưng chưa phản hồi.</details>
      </div>
      <div class="review-list">${rows.length ? rows.map(renderReviewCard).join('') : '<div class="review-empty">Không có review cần xử lý theo bộ lọc hiện tại.</div>'}</div>
    `
  }

  function renderAiPanel() {
    const rows = filteredReviews((state.core?.attention || [])).filter(row => Number(row.can_reply) && !Number(row.has_reply))
    const selected = state.selectedReview
    el('reviewPanelAi').innerHTML = `
      <div class="review-split">
        <section>
          <div class="review-section-title">
            <h2>Phase 2 - Chọn review để tạo phản hồi</h2>
            <details class="review-help"><summary>?</summary>AI nội bộ tạo nháp ngắn, có guard chặn kéo khách ra ngoài sàn.</details>
          </div>
          <div class="review-list">${rows.length ? rows.map(renderReviewCard).join('') : '<div class="review-empty">Không có review nào còn quyền trả lời.</div>'}</div>
        </section>
        <section class="reviews-card review-composer">
          <div>
            <b>${selected ? escapeHtml(selected.product_name || selected.review_id) : 'Chưa chọn review'}</b>
            <div class="review-meta">${selected ? `${escapeHtml(selected.platform)} / ${escapeHtml(selected.shop)} · ${escapeHtml(ratingLabel(selected))}` : 'Bấm Gợi ý trả lời ở danh sách bên trái.'}</div>
          </div>
          <textarea id="reviewReplyTextarea" placeholder="Nội dung phản hồi sẽ hiện ở đây sau khi tạo gợi ý...">${escapeHtml(state.selectedSuggestion)}</textarea>
          <div class="reviews-actions">
            <button type="button" class="primary" onclick="saveReviewReplyPreview()" ${selected ? '' : 'disabled'}>Lưu nháp vào hàng đợi</button>
            <button type="button" onclick="copyReviewReplyDraft()" ${state.selectedSuggestion ? '' : 'disabled'}>Copy nội dung</button>
          </div>
        </section>
      </div>
    `
  }

  function replyContentFromLog(row = {}) {
    const payload = row.preview_payload?.payload || row.preview_payload || {}
    const first = Array.isArray(payload.comment_list) ? payload.comment_list[0] : null
    return cleanText(first?.comment || payload.content || row.request_payload?.content || row.request_payload?.reply)
  }

  function renderQueue() {
    const rows = Array.isArray(state.actions?.rows) ? state.actions.rows : []
    el('reviewPanelQueue').innerHTML = `
      <div class="review-section-title">
        <h2>Phase 3 - Hàng đợi duyệt và log</h2>
        <details class="review-help"><summary>?</summary>Nút gửi thật đang khóa an toàn; dùng duyệt/copy/gửi thủ công cho tới khi endpoint live được bật.</details>
      </div>
      <div class="review-queue-list">
        ${rows.length ? rows.map(row => `
          <article class="review-queue-row">
            <div class="review-queue-head">
              <div>
                <b>#${formatNumber(row.id)} · ${escapeHtml(row.product_name || row.review_id)}</b>
                <div class="review-meta">${escapeHtml(row.platform)} / ${escapeHtml(row.shop)} · ${escapeHtml(row.action_status)} · ${escapeHtml(formatDate(row.created_at))}</div>
              </div>
              <span class="review-pill ${row.action_status === 'preview_blocked' || row.action_status === 'send_locked' ? 'bad' : 'info'}">${escapeHtml(row.action_status)}</span>
            </div>
            <div class="review-text">${escapeHtml(replyContentFromLog(row) || 'Chưa có nội dung preview.')}</div>
            <div class="review-text">${escapeHtml(row.note || '')}</div>
            <div class="review-queue-actions">
              <button type="button" class="primary" onclick="updateReviewAction(${Number(row.id)}, 'approve')">Duyệt nháp</button>
              <button type="button" onclick="copyReviewAction(${Number(row.id)})">Copy gửi tay</button>
              <button type="button" onclick="updateReviewAction(${Number(row.id)}, 'mark_manual_sent')">Đã gửi tay</button>
              <button type="button" class="danger" onclick="updateReviewAction(${Number(row.id)}, 'send_live')">Gửi thật</button>
              <button type="button" onclick="updateReviewAction(${Number(row.id)}, 'cancel')">Hủy</button>
            </div>
          </article>
        `).join('') : '<div class="review-empty">Chưa có nháp phản hồi nào trong hàng đợi.</div>'}
      </div>
    `
  }

  function renderSyncPanel() {
    const core = state.core || {}
    el('reviewPanelSync').innerHTML = `
      <div class="review-section-title">
        <h2>Đồng bộ/API</h2>
        <details class="review-help"><summary>?</summary>Shopee đọc bằng Product.get_comment. Lazada đọc theo history/list và bị giới hạn subrequest nên chạy batch nhỏ.</details>
      </div>
      <div class="review-list">
        <article class="review-row">
          <b>Shop có API</b>
          <div class="review-text">${escapeHtml(core.shop_api || 'Đọc review từ API sàn rồi lưu vào review_core.')}</div>
        </article>
        <article class="review-row">
          <b>Shop không có API</b>
          <div class="review-text">${escapeHtml(core.shop_no_api || 'Không gọi sàn; chỉ xem dữ liệu đã cache/import.')}</div>
        </article>
        <article class="review-row">
          <b>Khóa an toàn</b>
          <div class="review-text">${escapeHtml(core.next_step || 'Reply thật đang khóa, chỉ preview và log.')}</div>
        </article>
      </div>
    `
  }

  function renderTabs() {
    document.querySelectorAll('#reviewTabs button').forEach(button => {
      button.classList.toggle('active', button.dataset.tab === state.activeTab)
    })
    const panels = {
      overview: el('reviewPanelOverview'),
      attention: el('reviewPanelAttention'),
      ai: el('reviewPanelAi'),
      queue: el('reviewPanelQueue'),
      sync: el('reviewPanelSync')
    }
    Object.entries(panels).forEach(([key, panel]) => {
      if (panel) panel.hidden = key !== state.activeTab
    })
  }

  window.switchReviewTab = function (tab) {
    state.activeTab = tab
    renderReviewPage()
  }

  window.renderReviewPage = function () {
    if (!state.core) return
    renderSummaryCards()
    renderOverview()
    renderAttention()
    renderAiPanel()
    renderQueue()
    renderSyncPanel()
    renderTabs()
  }

  async function loadActions() {
    const filters = currentFilters()
    const qs = buildQuery({ platform: filters.platform, shop: filters.shop, limit: 50 })
    state.actions = await fetchJson(`/api/reviews/actions?${qs}`)
  }

  window.reloadReviews = async function () {
    if (state.loading) return
    state.loading = true
    setStatus('Đang tải dữ liệu đánh giá...')
    try {
      const filters = currentFilters()
      const qs = buildQuery({ platform: filters.platform, shop: filters.shop, limit: filters.limit })
      state.core = await fetchJson(`/api/reviews?${qs}`)
      await loadActions()
      renderShopFilter()
      renderReviewPage()
      setStatus(`Đã tải ${formatNumber(state.core?.summary?.total_reviews)} review. Lần đồng bộ: ${formatDate(state.core?.summary?.last_synced_at)}`, 'success')
    } catch (error) {
      setStatus(`Không tải được dữ liệu đánh giá: ${error.message}`, 'error')
    } finally {
      state.loading = false
    }
  }

  window.selectReviewForReply = async function (platform, shop, reviewId) {
    platform = decodeURIComponent(platform || '')
    shop = decodeURIComponent(shop || '')
    reviewId = decodeURIComponent(reviewId || '')
    const row = allReviewRows().find(item => lowerText(item.platform) === lowerText(platform) && cleanText(item.shop) === cleanText(shop) && cleanText(item.review_id) === cleanText(reviewId))
    if (!row) return setStatus('Không tìm thấy review trong danh sách hiện tại.', 'error')
    state.selectedReview = row
    state.selectedSuggestion = ''
    state.activeTab = 'ai'
    renderReviewPage()
    setStatus('Đang tạo gợi ý phản hồi...')
    try {
      const data = await fetchJson('/api/reviews/reply-suggest', {
        method: 'POST',
        body: JSON.stringify({ platform, shop, review_id: reviewId })
      })
      state.selectedSuggestion = data.suggestion || ''
      renderReviewPage()
      setStatus(data.note || 'Đã tạo gợi ý phản hồi.', 'success')
    } catch (error) {
      setStatus(`Không tạo được gợi ý: ${error.message}`, 'error')
    }
  }

  window.saveReviewReplyPreview = async function () {
    const review = state.selectedReview
    const content = cleanText(el('reviewReplyTextarea')?.value)
    if (!review) return setStatus('Chưa chọn review để lưu nháp.', 'error')
    if (!content) return setStatus('Chưa có nội dung phản hồi.', 'error')
    try {
      const data = await fetchJson('/api/reviews/reply-preview', {
        method: 'POST',
        body: JSON.stringify({
          platform: review.platform,
          shop: review.shop,
          review_id: review.review_id,
          content
        })
      })
      await loadActions()
      state.activeTab = 'queue'
      renderReviewPage()
      setStatus(`Đã lưu nháp #${formatNumber(data.action_id)} vào hàng đợi duyệt.`, 'success')
    } catch (error) {
      setStatus(`Không lưu được nháp: ${error.message}`, 'error')
    }
  }

  window.updateReviewAction = async function (actionId, action) {
    try {
      const data = await fetchJson('/api/reviews/reply-action', {
        method: 'POST',
        body: JSON.stringify({ action_id: actionId, action })
      })
      await loadActions()
      renderReviewPage()
      setStatus(data.note || 'Đã cập nhật hàng đợi review.', data.live_send_locked ? 'error' : 'success')
    } catch (error) {
      setStatus(`Không cập nhật được hàng đợi: ${error.message}`, 'error')
    }
  }

  window.copyReviewAction = async function (actionId) {
    const row = (state.actions?.rows || []).find(item => Number(item.id) === Number(actionId))
    const content = replyContentFromLog(row)
    if (!content) return setStatus('Nháp này chưa có nội dung để copy.', 'error')
    await navigator.clipboard?.writeText(content)
    setStatus('Đã copy nội dung phản hồi.', 'success')
  }

  window.copyReviewReplyDraft = async function () {
    const content = cleanText(el('reviewReplyTextarea')?.value)
    if (!content) return
    await navigator.clipboard?.writeText(content)
    setStatus('Đã copy nội dung phản hồi.', 'success')
  }

  window.copyReviewInfo = async function (reviewId) {
    reviewId = decodeURIComponent(reviewId || '')
    await navigator.clipboard?.writeText(cleanText(reviewId))
    setStatus('Đã copy mã review.', 'success')
  }

  window.syncReviewPlatform = async function (platform) {
    const shop = el('reviewShopFilter')?.value || ''
    setStatus(`Đang đồng bộ ${platform === 'lazada' ? 'Lazada' : 'Shopee'}...`)
    try {
      const path = platform === 'lazada' ? '/api/reviews/lazada/batch-sync' : '/api/reviews/shopee/sync'
      const data = await fetchJson(path, {
        method: 'POST',
        body: JSON.stringify({ shop, limit: 50, max_pages: platform === 'lazada' ? 2 : 2 })
      })
      await reloadReviews()
      const saved = data.saved ?? data.results?.[platform]?.saved ?? 0
      setStatus(`Đồng bộ xong ${platform}: lưu/cập nhật ${formatNumber(saved)} review.`, 'success')
    } catch (error) {
      setStatus(`Đồng bộ ${platform} lỗi: ${error.message}`, 'error')
    }
  }

  window.repairReviewMapping = async function () {
    const filters = currentFilters()
    setStatus('Đang sửa mapping review từ catalog...')
    try {
      const data = await fetchJson('/api/reviews/repair-mapping', {
        method: 'POST',
        body: JSON.stringify({ platform: filters.platform, shop: filters.shop, limit: 500 })
      })
      await reloadReviews()
      setStatus(`Repair xong: quét ${formatNumber(data.scanned)}, cập nhật ${formatNumber(data.updated)}, còn thiếu ${formatNumber(data.remaining)}.`, 'success')
    } catch (error) {
      setStatus(`Repair mapping lỗi: ${error.message}`, 'error')
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.reloadReviews()
  })
})()
