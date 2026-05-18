(function () {
  const API = window.SHV_AUTH?.API || window.SHV_API || 'https://huyvan-worker-api.nghiemchihuy.workers.dev'
  const REVIEW_SHOPEE_SHOP = 'chihuy1984'
  const STATUS_GRID_ID = 'reviewStatusGrid'
  const EVIDENCE_BODY_ID = 'reviewEvidenceBody'
  const LAZADA_PROOF_ID = 'lazadaLiveProof'

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

  function formatNumber(value) {
    const number = Number(value || 0)
    return Number.isFinite(number) ? number.toLocaleString('vi-VN') : '0'
  }

  function formatMoney(value) {
    const number = Number(value || 0)
    return `${Number.isFinite(number) ? number.toLocaleString('vi-VN') : '0'}đ`
  }

  function endDateForSnapshot() {
    const date = new Date()
    date.setDate(date.getDate() - 1)
    return date.toISOString().slice(0, 10)
  }

  async function fetchJson(path) {
    const response = await fetch(`${API}${path}`, { cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(cleanText(data.error || data.message || `HTTP ${response.status}`))
    }
    return data
  }

  async function settle(label, task) {
    try {
      return { label, status: 'fulfilled', value: await task() }
    } catch (error) {
      return { label, status: 'rejected', reason: cleanText(error?.message || error) }
    }
  }

  function unwrapSettled(result, fallback = null) {
    return result?.status === 'fulfilled' ? result.value : fallback
  }

  function shopLabel(row = {}) {
    return cleanText(row.shop_name || row.shop || row.user_name || row.account || row.email || row.api_shop_id)
  }

  function platformRows(capabilities = {}, platform) {
    const target = cleanText(platform).toLowerCase()
    return (Array.isArray(capabilities?.rows) ? capabilities.rows : [])
      .filter(row => cleanText(row.platform).toLowerCase() === target)
  }

  function isApiActive(row = {}) {
    return cleanText(row.capability_mode) === 'api_active' ||
      cleanText(row.video_sync_mode) === 'lazada_media_api' ||
      Number(row.access_token_live) === 1 ||
      Number(row.video_ready) === 1
  }

  function chooseLiveShop(rows = []) {
    return rows.find(row => isApiActive(row)) || rows[0] || null
  }

  function statusCard(label, value, tone = 'muted', note = '') {
    return `
      <article class="review-status-card ${escapeHtml(tone)}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        ${note ? `<small>${escapeHtml(note)}</small>` : ''}
      </article>
    `
  }

  function evidenceRow(name, value, note, tone = '') {
    const badge = tone ? `<span class="review-pill ${escapeHtml(tone)}">${escapeHtml(note)}</span>` : escapeHtml(note)
    return `
      <tr>
        <td><strong>${escapeHtml(name)}</strong></td>
        <td>${escapeHtml(value)}</td>
        <td>${badge}</td>
      </tr>
    `
  }

  function renderUser(user) {
    document.getElementById('reviewUserName').textContent = user?.username || 'Chưa xác định'
    document.getElementById('reviewUserRole').textContent = user?.role === 'reviewer'
      ? 'Reviewer chỉ đọc'
      : cleanText(user?.role_label || user?.role || 'Tài khoản nội bộ')
  }

  function summarizeVideoOverview(overview = {}) {
    const views = Number(overview.views || overview.view_count || 0)
    const orders = Number(overview.placed_orders || overview.orders || 0)
    const sales = Number(overview.placed_sales || overview.sales || 0)
    return `${formatNumber(views)} lượt xem, ${formatNumber(orders)} đơn, ${formatMoney(sales)}`
  }

  function quotaText(quota = {}) {
    const payload = quota?.quota || quota?.result || quota || {}
    const parts = [
      cleanText(payload.daily_quota || payload.dailyQuota) ? `daily ${payload.daily_quota || payload.dailyQuota}` : '',
      cleanText(payload.used || payload.used_quota || payload.usedQuota) ? `used ${payload.used || payload.used_quota || payload.usedQuota}` : '',
      cleanText(payload.remaining || payload.remaining_quota || payload.remainingQuota) ? `remaining ${payload.remaining || payload.remaining_quota || payload.remainingQuota}` : ''
    ].filter(Boolean)
    return parts.length ? parts.join(', ') : 'Endpoint quota phản hồi OK'
  }

  function renderStatus({ user, capabilities, shopeeDashboard, shopeeQueue, webhooks, lazadaShop, lazadaLibrary, lazadaQuota, lazadaQuotaResult }) {
    const shopeeRows = platformRows(capabilities, 'shopee')
    const lazadaRows = platformRows(capabilities, 'lazada')
    const activeShopeeRows = shopeeRows.filter(isApiActive)
    const activeLazadaRows = lazadaRows.filter(isApiActive)
    const shopeeReviewShop = shopeeRows.find(row => shopLabel(row).toLowerCase() === REVIEW_SHOPEE_SHOP)
    const shopeeVideoReady = shopeeReviewShop && cleanText(shopeeReviewShop.video_permission_status).toLowerCase() === 'ok'
    const shopeeLibraryCount = Array.isArray(shopeeDashboard?.library) ? shopeeDashboard.library.length : 0
    const shopeeQueueRows = Array.isArray(shopeeQueue?.rows) ? shopeeQueue.rows : Array.isArray(shopeeQueue?.items) ? shopeeQueue.items : []
    const webhookRows = Array.isArray(webhooks?.recent) ? webhooks.recent : []
    const lazadaLibraryRows = Array.isArray(lazadaLibrary?.rows) ? lazadaLibrary.rows : []
    const statusGrid = document.getElementById(STATUS_GRID_ID)

    statusGrid.innerHTML = [
      statusCard(
        'Phiên đăng nhập',
        user?.role === 'reviewer' ? 'Reviewer OK' : 'Tài khoản nội bộ',
        user?.role === 'reviewer' ? 'success' : 'warning',
        user?.role === 'reviewer' ? 'Đúng vai trò kiểm duyệt chỉ đọc.' : 'Trang vẫn xem được bằng admin/manager.'
      ),
      statusCard(
        'Lazada API live',
        `${activeLazadaRows.length}/${lazadaRows.length} shop có API sống`,
        activeLazadaRows.length ? 'success' : 'warning',
        lazadaShop ? `Shop kiểm: ${shopLabel(lazadaShop)}` : 'Chưa tìm thấy shop Lazada trong capability.'
      ),
      statusCard(
        'Lazada Media Center',
        lazadaQuotaResult?.status === 'fulfilled' ? 'Quota endpoint OK' : 'Đọc từ cache/capability',
        lazadaQuotaResult?.status === 'fulfilled' ? 'success' : 'warning',
        lazadaQuotaResult?.status === 'fulfilled' ? quotaText(lazadaQuota) : cleanText(lazadaQuotaResult?.reason || lazadaShop?.video_operator_guide)
      ),
      statusCard(
        'Kho video Lazada',
        `${formatNumber(lazadaLibraryRows.length)} video đang cache`,
        lazadaLibraryRows.length ? 'success' : 'muted',
        'Đọc từ core video production theo platform=lazada.'
      ),
      statusCard(
        'Shopee API chính',
        `${activeShopeeRows.length}/${shopeeRows.length} shop có API sống`,
        activeShopeeRows.length ? 'success' : 'warning',
        'Module Shopee đang xin Open Platform Go Live.'
      ),
      statusCard(
        'Shopee Video API',
        shopeeVideoReady ? `${REVIEW_SHOPEE_SHOP} đã test quyền OK` : `${REVIEW_SHOPEE_SHOP} cần kiểm tra lại quyền`,
        shopeeVideoReady ? 'success' : 'warning',
        cleanText(shopeeReviewShop?.video_permission_message || shopeeReviewShop?.operator_guide || '')
      ),
      statusCard(
        'Thư viện Shopee video',
        `${formatNumber(shopeeLibraryCount)} video đang cache`,
        shopeeLibraryCount ? 'success' : 'muted',
        summarizeVideoOverview(shopeeDashboard?.overview || {})
      ),
      statusCard(
        'Reviewer read-only',
        'GET only cho reviewer',
        'success',
        `Queue Shopee ${formatNumber(shopeeQueueRows.length)} job, webhook ${formatNumber(webhookRows.length)} event đọc được.`
      )
    ].join('')
  }

  function renderLazadaProof({ lazadaShop, lazadaLibrary, lazadaQuota, lazadaQuotaResult }) {
    const node = document.getElementById(LAZADA_PROOF_ID)
    if (!node) return
    const rows = Array.isArray(lazadaLibrary?.rows) ? lazadaLibrary.rows : []
    const live = lazadaShop && isApiActive(lazadaShop)
    const quotaOk = lazadaQuotaResult?.status === 'fulfilled'
    const sampleRows = rows.slice(0, 3)

    node.innerHTML = `
      <div class="review-lazada-cards">
        ${statusCard('Trạng thái Lazada', live ? 'Live API connected' : 'Chưa xác nhận live', live ? 'success' : 'warning', cleanText(lazadaShop?.video_operator_guide || lazadaShop?.capability_badge || ''))}
        ${statusCard('Shop Lazada', shopLabel(lazadaShop) || 'Chưa chọn được shop', live ? 'success' : 'warning', cleanText(lazadaShop?.seller_id || lazadaShop?.api_shop_id || lazadaShop?.user_name))}
        ${statusCard('Media quota', quotaOk ? quotaText(lazadaQuota) : 'Quota chưa đọc được', quotaOk ? 'success' : 'warning', quotaOk ? 'Lazada endpoint phản hồi qua API production.' : cleanText(lazadaQuotaResult?.reason || 'Có thể token cần gia hạn.'))}
        ${statusCard('Video cache', `${formatNumber(rows.length)} dòng`, rows.length ? 'success' : 'muted', 'Dữ liệu Lazada đã lưu trong core video.')}
      </div>
      <div class="review-lazada-samples">
        <h3>Module Lazada live reviewer có thể kiểm tra</h3>
        <div class="review-action-list" data-reviewer-allow="true">
          <a href="dashboard_video.html?view=lazada&review=shopee${lazadaShop ? `&lazadaShop=${encodeURIComponent(shopLabel(lazadaShop))}` : ''}" class="review-link-card">
            <span>LZ</span>
            <div><strong>Lazada Video / Media Center</strong><small>Quota, video_id, upload flow có guard và thư viện đã lưu.</small></div>
          </a>
          <a href="admin-products.html?review=shopee#shops" class="review-link-card">
            <span>API</span>
            <div><strong>Lazada API connection</strong><small>Shop/token/API config hiển thị trong module sản phẩm.</small></div>
          </a>
        </div>
        ${sampleRows.length ? `
          <div class="review-table-wrap review-lazada-table">
            <table class="review-table">
              <thead><tr><th>Video ID</th><th>Tiêu đề / trạng thái</th><th>Nguồn</th></tr></thead>
              <tbody>
                ${sampleRows.map(row => `
                  <tr>
                    <td>${escapeHtml(row.video_upload_id || row.video_id || row.id)}</td>
                    <td>${escapeHtml(cleanText(row.caption || row.title || row.state_label || row.status || 'Video Lazada đã lưu'))}</td>
                    <td><span class="review-pill success">platform=lazada</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : '<div class="review-empty">Chưa có video Lazada trong cache, nhưng capability/API vẫn hiển thị trạng thái kết nối.</div>'}
      </div>
    `
  }

  function renderEvidence({ capabilities, shopeeDashboard, shopeeQueue, webhooks, lazadaShop, lazadaLibrary, lazadaQuotaResult }) {
    const shopeeRows = platformRows(capabilities, 'shopee')
    const lazadaRows = platformRows(capabilities, 'lazada')
    const activeShopeeRows = shopeeRows.filter(isApiActive)
    const activeLazadaRows = lazadaRows.filter(isApiActive)
    const shopeeReviewShop = shopeeRows.find(row => shopLabel(row).toLowerCase() === REVIEW_SHOPEE_SHOP)
    const shopeeLibraryCount = Array.isArray(shopeeDashboard?.library) ? shopeeDashboard.library.length : 0
    const topVideoCount = Array.isArray(shopeeDashboard?.top_video_rows) ? shopeeDashboard.top_video_rows.length : 0
    const topProductCount = Array.isArray(shopeeDashboard?.top_product_rows) ? shopeeDashboard.top_product_rows.length : 0
    const shopeeQueueRows = Array.isArray(shopeeQueue?.rows) ? shopeeQueue.rows : Array.isArray(shopeeQueue?.items) ? shopeeQueue.items : []
    const webhookSummary = Array.isArray(webhooks?.summary) ? webhooks.summary : []
    const lazadaLibraryRows = Array.isArray(lazadaLibrary?.rows) ? lazadaLibrary.rows : []
    const body = document.getElementById(EVIDENCE_BODY_ID)

    body.innerHTML = [
      evidenceRow('Business Product URL', window.location.href.split('?')[0], 'Dùng URL này trong form Go Live', 'success'),
      evidenceRow('Tài khoản live test', 'shopee_reviewer, vai trò reviewer', 'Chỉ xem, không có quyền ghi', 'success'),
      evidenceRow('Lazada live integration', `${activeLazadaRows.length} shop active trên tổng ${lazadaRows.length} shop Lazada`, activeLazadaRows.length ? 'Đủ bằng chứng e-commerce live' : 'Cần gia hạn token Lazada', activeLazadaRows.length ? 'success' : 'warning'),
      evidenceRow('Lazada shop kiểm duyệt', shopLabel(lazadaShop) || 'Chưa có shop Lazada', lazadaQuotaResult?.status === 'fulfilled' ? 'Quota API phản hồi OK' : 'Đọc capability/cache', lazadaQuotaResult?.status === 'fulfilled' ? 'success' : 'warning'),
      evidenceRow('Lazada video/cache', `${lazadaLibraryRows.length} dòng video/media đã lưu`, 'Reviewer có link vào module Lazada Video', lazadaLibraryRows.length ? 'success' : 'muted'),
      evidenceRow('Shopee API shops', `${activeShopeeRows.length} shop active trên tổng ${shopeeRows.length} shop Shopee`, activeShopeeRows.length ? 'Shopee module đã chuẩn bị' : 'Đang xin duyệt Go Live', activeShopeeRows.length ? 'success' : 'warning'),
      evidenceRow('Shop kiểm video Shopee', `${REVIEW_SHOPEE_SHOP}: ${cleanText(shopeeReviewShop?.capability_badge || 'Chưa có dữ liệu')}`, cleanText(shopeeReviewShop?.video_permission_status) === 'ok' ? 'Video API đã test OK' : 'Cần test lại Video API', cleanText(shopeeReviewShop?.video_permission_status) === 'ok' ? 'success' : 'warning'),
      evidenceRow('Shopee video analytics cache', `${shopeeLibraryCount} video, ${topVideoCount} video hiệu quả, ${topProductCount} sản phẩm kéo đơn`, 'Đọc từ snapshot dashboard video', shopeeLibraryCount ? 'success' : 'warning'),
      evidenceRow('Queue đăng video Shopee', `${shopeeQueueRows.length} job gần nhất trong queue`, 'Có luồng hẹn giờ/đa shop riêng', shopeeQueueRows.length ? 'success' : 'muted'),
      evidenceRow('Webhook / push', `${webhookSummary.length} nhóm trạng thái trong 7 ngày`, 'Core push/webhook đọc được', webhookSummary.length ? 'success' : 'muted')
    ].join('')
  }

  function renderApiWarning(results) {
    const failed = Object.entries(results)
      .filter(([, result]) => result?.status === 'rejected')
      .map(([label, result]) => `${label}: ${cleanText(result.reason)}`)
    if (!failed.length) return

    const body = document.getElementById(EVIDENCE_BODY_ID)
    body.insertAdjacentHTML('beforeend', evidenceRow(
      'Cảnh báo API đọc',
      failed.join(' | '),
      'Trang vẫn mở được, cần kiểm tra endpoint nếu reviewer hỏi sâu',
      'warning'
    ))
  }

  async function init() {
    const productUrl = document.getElementById('reviewProductUrl')
    if (productUrl) productUrl.textContent = window.location.href.split('?')[0]

    let user = null
    try {
      user = await window.SHV_AUTH?.getCurrentUser?.()
    } catch {
      user = null
    }
    renderUser(user)

    const capabilitiesResult = await settle('capabilities', () => fetchJson('/api/video/capabilities'))
    const capabilities = unwrapSettled(capabilitiesResult, { rows: [] })
    const lazadaShop = chooseLiveShop(platformRows(capabilities, 'lazada'))
    const lazadaShopName = shopLabel(lazadaShop)
    const endDate = endDateForSnapshot()
    const results = {
      capabilities: capabilitiesResult,
      shopeeDashboard: await settle('shopeeDashboard', () => fetchJson(`/api/video/dashboard?platform=shopee&shop=${encodeURIComponent(REVIEW_SHOPEE_SHOP)}&period_type=Last7d&end_date=${encodeURIComponent(endDate)}`)),
      shopeeQueue: await settle('shopeeQueue', () => fetchJson('/api/video/upload-queue?platform=shopee&limit=10')),
      webhooks: await settle('webhooks', () => fetchJson('/api/webhooks/events?core=1&limit=10')),
      lazadaLibrary: lazadaShopName
        ? await settle('lazadaLibrary', () => fetchJson(`/api/video/library?platform=lazada&shop=${encodeURIComponent(lazadaShopName)}&list_type=all&limit=50`))
        : { label: 'lazadaLibrary', status: 'rejected', reason: 'Chưa có shop Lazada để đọc library.' },
      // NEO: Trang review cần chứng minh Lazada đang live bằng lệnh GET an toàn; không tạo/sửa/xóa dữ liệu sàn khi Shopee kiểm duyệt.
      lazadaQuota: lazadaShopName && isApiActive(lazadaShop)
        ? await settle('lazadaQuota', () => fetchJson(`/api/video/lazada/quota?shop=${encodeURIComponent(lazadaShopName)}`))
        : { label: 'lazadaQuota', status: 'rejected', reason: 'Shop Lazada chưa đủ trạng thái API active để đọc quota.' }
    }
    const payload = {
      user,
      capabilities,
      shopeeDashboard: unwrapSettled(results.shopeeDashboard, { library: [], overview: {} }),
      shopeeQueue: unwrapSettled(results.shopeeQueue, { rows: [] }),
      webhooks: unwrapSettled(results.webhooks, { recent: [], summary: [] }),
      lazadaShop,
      lazadaLibrary: unwrapSettled(results.lazadaLibrary, { rows: [] }),
      lazadaQuota: unwrapSettled(results.lazadaQuota, null),
      lazadaQuotaResult: results.lazadaQuota
    }

    renderStatus(payload)
    renderLazadaProof(payload)
    renderEvidence(payload)
    renderApiWarning(results)
  }

  init().catch(error => {
    document.getElementById(STATUS_GRID_ID).innerHTML = statusCard(
      'Không tải được dữ liệu',
      cleanText(error.message || error),
      'danger',
      'Kiểm tra lại phiên đăng nhập reviewer hoặc Worker API.'
    )
    document.getElementById(LAZADA_PROOF_ID).innerHTML = statusCard(
      'Không tải được Lazada proof',
      cleanText(error.message || error),
      'danger',
      'Cần kiểm tra Worker API.'
    )
    document.getElementById(EVIDENCE_BODY_ID).innerHTML = evidenceRow(
      'Lỗi tải trang review',
      cleanText(error.message || error),
      'Cần kiểm tra Worker API',
      'danger'
    )
  })
})()
