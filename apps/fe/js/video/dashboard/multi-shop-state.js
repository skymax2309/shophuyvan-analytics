function multiShopDefaultAt() {
  return defaultScheduleDateTimeLocal(30)
}

function ensureMultiShopRows() {
  const existing = new Map(state.multiShopRows.map(row => [cleanText(row.shop), row]))
  const rows = shopeeVideoCapabilityRows().map(capability => {
    const shop = cleanText(capability.shop_name || capability.shop || capability.user_name)
    const previous = existing.get(shop) || {}
    return {
      shop,
      enabled: previous.enabled ?? (Number(capability.video_ready) === 1 ? 1 : 0),
      video_ready: Number(capability.video_ready) === 1 ? 1 : 0,
      video_sync_mode: cleanText(capability.video_sync_mode),
      caption: previous.caption || '',
      hashtags: previous.hashtags || VIDEO_REQUIRED_HASHTAG,
      item_ids: previous.item_ids || '',
      item_rows: parseMultiShopItemRows(previous.item_ids || '', previous.item_rows || previous.items || []),
      scheduled_at: previous.scheduled_at || multiShopDefaultAt(),
      allow_duplicate: previous.allow_duplicate || 0
    }
  }).filter(row => row.shop)
  state.multiShopRows = rows
  if (!cleanText(document.getElementById('videoCampaignKey')?.value) && rows.length) {
    state.multiShopPreview = null
  }
}

let multiShopProductPickerFeature = null

function multiShopProductPicker() {
  if (!multiShopProductPickerFeature) {
    multiShopProductPickerFeature = createMultiShopProductPicker({
      API_BASE,
      state,
      cleanText,
      escapeHtml,
      numberValue,
      formatNumber,
      fetchJson,
      setStatus,
      renderMultiShopPanel,
      readMultiShopRowsFromDom
    })
  }
  return multiShopProductPickerFeature
}

function normalizeMultiShopProduct(row = {}) {
  return multiShopProductPicker().normalizeProduct(row)
}

function parseMultiShopItemRows(itemIdsText, detailRows = []) {
  return multiShopProductPicker().parseItemRows(itemIdsText, detailRows)
}

function multiShopProductSearchState(shop) {
  return multiShopProductPicker().searchState(shop)
}

function multiShopProductUrl(product = {}) {
  return multiShopProductPicker().productUrl(product)
}

function renderMultiShopProductPicker(row = {}, preview = null) {
  return multiShopProductPicker().render(row, preview)
}

async function searchMultiShopProduct(shop) {
  return multiShopProductPicker().search(shop)
}

function attachMultiShopProduct(shop, itemId) {
  return multiShopProductPicker().attach(shop, itemId)
}

function removeMultiShopProduct(shop, itemId) {
  return multiShopProductPicker().remove(shop, itemId)
}

function readMultiShopRowsFromDom() {
  const previousByShop = new Map(state.multiShopRows.map(row => [cleanText(row.shop), row]))
  const rows = [...document.querySelectorAll('[data-multi-shop-row]')].map(node => {
    const shop = cleanText(node.dataset.shop)
    const previous = previousByShop.get(shop) || {}
    const itemIds = cleanText(node.querySelector('[data-multi-field="item_ids"]')?.value || '')
    const itemRows = parseMultiShopItemRows(itemIds, previous.item_rows || previous.items || [])
    return {
      shop,
      enabled: node.querySelector('[data-multi-field="enabled"]')?.checked ? 1 : 0,
      caption: cleanText(node.querySelector('[data-multi-field="caption"]')?.value || ''),
      hashtags: cleanText(node.querySelector('[data-multi-field="hashtags"]')?.value || VIDEO_REQUIRED_HASHTAG),
      item_ids: itemRows.map(item => item.item_id).join(', '),
      item_rows: itemRows,
      scheduled_at: cleanText(node.querySelector('[data-multi-field="scheduled_at"]')?.value || multiShopDefaultAt()),
      allow_duplicate: node.querySelector('[data-multi-field="allow_duplicate"]')?.checked ? 1 : 0
    }
  }).filter(row => row.shop)
  state.multiShopRows = rows
  return rows
}

function multiShopPayloadRows() {
  return readMultiShopRowsFromDom().map(row => ({
    shop: row.shop,
    enabled: row.enabled,
    caption: row.caption,
    hashtags: row.hashtags,
    item_ids: row.item_ids,
    scheduled_at: row.scheduled_at,
    allow_duplicate: row.allow_duplicate,
    item_rows: parseMultiShopItemRows(row.item_ids, row.item_rows),
    items: parseMultiShopItemRows(row.item_ids, row.item_rows)
  }))
}

function postedVideoRows() {
  const allRows = state.dashboard?.library || []
  const postedRows = allRows.filter(row => cleanText(row.list_type) === 'post' || numberValue(row.status) === 300)
  return postedRows.length ? postedRows : allRows
}

function duplicateScoreLabel(score) {
  if (score >= VIDEO_DUPLICATE_HIGH_SCORE) return { tone: 'danger', label: 'Không nên đăng lại' }
  if (score >= VIDEO_DUPLICATE_MEDIUM_SCORE) return { tone: 'warning', label: 'Cần đổi nội dung' }
  return { tone: 'muted', label: 'Chỉ giống nhẹ' }
}

function uploadDuplicateCandidates() {
  const draftCaption = uploadCaptionValue()
  const productText = state.uploadItems.map(row => cleanText(row.product_name || row.item_name || row.item_id)).filter(Boolean).join(' ')
  const fileName = cleanText(document.getElementById('videoUploadFile')?.files?.[0]?.name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ')
  const draftText = [draftCaption, productText, fileName].filter(Boolean).join(' ')
  if (compareTokens(draftText).length < 2) return []
  const selectedItemIds = new Set(state.uploadItems.map(row => cleanText(row.item_id)).filter(Boolean))
  return postedVideoRows()
    .map(row => {
      const linkedRows = Array.isArray(row.links) ? row.links : []
      const rowText = [
        row.caption,
        ...linkedRows.map(item => cleanText(item.product_name || item.item_name || item.custom_item_name || item.item_id))
      ].filter(Boolean).join(' ')
      const titleScore = tokenSimilarity(draftText, rowText)
      const rowItemIds = linkedRows.map(item => cleanText(item.item_id)).filter(Boolean)
      const sharedItems = rowItemIds.filter(id => selectedItemIds.has(id)).length
      const productScore = selectedItemIds.size && rowItemIds.length ? sharedItems / Math.max(selectedItemIds.size, rowItemIds.length) : 0
      const score = Math.round(Math.min(1, titleScore * 0.78 + productScore * 0.22) * 100)
      return {
        ...row,
        duplicate_score: score,
        duplicate_title_score: Math.round(titleScore * 100),
        duplicate_product_score: Math.round(productScore * 100)
      }
    })
    .filter(row => numberValue(row.duplicate_score) >= 30)
    .sort((left, right) => numberValue(right.duplicate_score) - numberValue(left.duplicate_score) || numberValue(right.views) - numberValue(left.views))
    .slice(0, 5)
}

function topDuplicateCandidate() {
  return uploadDuplicateCandidates()[0] || null
}

function videoQueueStatusLabel(status) {
  const code = cleanText(status)
  if (code === 'queued') return { label: 'Chờ đến giờ', tone: 'warning' }
  if (code === 'processing') return { label: 'Đang upload', tone: 'warning' }
  if (code === 'browser_upload_required') return { label: 'Chờ Chrome local', tone: 'warning' }
  if (code === 'browser_opening' || code === 'browser_uploading') return { label: 'Chrome đang thao tác', tone: 'warning' }
  if (code === 'browser_preview_ready') return { label: 'Đã mở preview', tone: 'success' }
  if (code === 'browser_login_required') return { label: 'Cần đăng nhập Seller', tone: 'warning' }
  if (code === 'browser_error') return { label: 'Chrome lỗi', tone: 'danger' }
  if (code === 'browser_posted') return { label: 'Đã đăng tay', tone: 'success' }
  if (code === 'done') return { label: 'Đã đăng', tone: 'success' }
  if (code === 'error') return { label: 'Lỗi', tone: 'danger' }
  if (code === 'cancelled') return { label: 'Đã hủy', tone: 'muted' }
  return { label: 'Không rõ', tone: 'muted' }
}

function analysisSortField() {
  const sort = cleanText(state.analysisSort)
  if (sort === 'views') return 'views'
  if (sort === 'orders') return 'placed_orders'
  return 'placed_sales'
}

function analysisMetricLabel() {
  const sort = cleanText(state.analysisSort)
  if (sort === 'views') return 'lượt xem'
  if (sort === 'orders') return 'đơn đặt'
  return 'doanh số'
}

function analysisMetricValue(row = {}) {
  const field = analysisSortField()
  return numberValue(row[field])
}

function sortedByAnalysisMetric(rows = []) {
  const field = analysisSortField()
  return [...rows].sort((left, right) => {
    const diff = numberValue(right[field]) - numberValue(left[field])
    if (diff !== 0) return diff
    return numberValue(right.placed_sales) - numberValue(left.placed_sales)
  })
}

function filteredAnalysisRows(rows = []) {
  const min = numberValue(state.analysisMin)
  const filteredRows = min > 0
    ? rows.filter(row => analysisMetricValue(row) >= min)
    : rows
  return sortedByAnalysisMetric(filteredRows)
}

function topVideoRowsForDisplay() {
  const sourceRows = videoRowsForAnalysis()
  const filteredRows = filteredAnalysisRows(sourceRows)
  // Nếu người vận hành đặt ngưỡng doanh số/đơn nhưng Shopee chưa trả hiệu suất theo video,
  // vẫn hiển thị thư viện video để họ có dữ liệu thao tác thay vì một khung rỗng khó hiểu.
  return filteredRows.length || !sourceRows.length ? filteredRows : sortedByAnalysisMetric(sourceRows)
}

function videoRowsForAnalysis() {
  const topRows = state.dashboard?.top_video_rows || []
  if (topRows.length) return topRows
  // Khi endpoint hiệu suất chưa trả top video, dùng thư viện video đã đăng để vẫn lọc được theo lượt xem.
  return (state.dashboard?.library || [])
    .filter(row => cleanText(row.list_type) === 'post' || numberValue(row.status) === 300)
    .map(row => ({
      ...row,
      placed_orders: numberValue(row.placed_orders),
      placed_sales: numberValue(row.placed_sales)
    }))
}

function setStatus(message, type = 'info') {
  const node = document.getElementById('videoStatusBox')
  if (!node) return
  node.className = `video-status-box${type ? ` ${type}` : ''}`
  node.textContent = cleanText(message) || 'Sẵn sàng thao tác.'
}

function setVideoProgressStatus(options = {}) {
  const node = document.getElementById('videoStatusBox')
  if (!node) return
  const current = Math.max(0, numberValue(options.current))
  const total = Math.max(0, numberValue(options.total))
  const percent = total ? Math.min(100, Math.round((current / total) * 100)) : 0
  node.className = `video-status-box${options.type ? ` ${options.type}` : ''}`
  node.innerHTML = `
    <div class="video-progress-status">
      <div class="video-progress-head">
        <strong>${escapeHtml(options.title || 'Đang xử lý')}</strong>
        <span>${total ? `${formatNumber(current)}/${formatNumber(total)}` : escapeHtml(options.valueText || '')}</span>
      </div>
      ${total ? `
        <div class="video-progress-bar" aria-label="Tiến trình">
          <span style="width:${percent}%"></span>
        </div>
      ` : ''}
      <div class="video-progress-message">${escapeHtml(options.message || '')}</div>
      ${options.detail ? `<div class="video-progress-detail">${escapeHtml(options.detail)}</div>` : ''}
    </div>
  `
}

function uniqueVideoWarnings(warnings = []) {
  const seen = new Set()
  return warnings.filter(warning => {
    const message = cleanText(warning?.message || warning?.stage || warning)
    const key = `${cleanText(warning?.stage)}|${message}`
    if (!message || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function selectedShopRow() {
  return state.capabilities.find(row => cleanText(row.shop_name) === cleanText(state.selectedShop)) || null
}

function selectedShopReady() {
  const shop = selectedShopRow()
  return Boolean(shop && Number(shop.video_ready) === 1)
}

function selectedLibraryRow() {
  const rows = state.dashboard?.library || []
  return rows.find(row => cleanText(row.video_key) === cleanText(state.selectedVideoKey)) || null
}

function isPostedShopeeVideo(row = {}) {
  const status = numberValue(row.status)
  const listType = cleanText(row.list_type).toLowerCase()
  const postId = cleanText(row.post_id)
  if (status === 300 || listType === 'post') return true
  return Boolean(postId && status !== 200 && listType !== 'draft')
}

// Open Platform chỉ cho sửa thông tin trước khi video được đăng; UI khóa sớm để không gửi lệnh ghi chắc chắn lỗi.
function canEditShopeeVideoInfo(row = {}) {
  const status = numberValue(row.status)
  if (status === 400 || status >= 600) return false
  return !isPostedShopeeVideo(row)
}

function isBadShopeeVideoTitle(row = {}) {
  const caption = normalizeCompareText(row.caption)
  return caption.includes('bam vao gio hang de mua')
}

function libraryRowsForDisplay() {
  const allRows = state.dashboard?.library || []
  const query = normalizeCompareText(state.libraryQuery)
  return allRows.filter(row => {
    const statusFilter = cleanText(state.libraryStatus)
    const status = numberValue(row.status)
    if (statusFilter === 'post' && status !== 300) return false
    if (statusFilter === 'draft' && status !== 200) return false
    if (statusFilter === 'deleted' && status !== 400) return false
    if (state.libraryBadTitleOnly && !isBadShopeeVideoTitle(row)) return false
    if (query) {
      const haystack = normalizeCompareText([
        row.caption,
        row.video_upload_id,
        row.post_id,
        row.video_key,
        row.status_label,
        ...(Array.isArray(row.links) ? row.links.map(link => `${link.item_name || ''} ${link.product_name || ''} ${link.internal_sku || ''}`) : [])
      ].join(' '))
      if (!haystack.includes(query)) return false
    }
    return true
  })
}

function libraryUniqueCount(rows = [], predicate = () => true) {
  const keys = new Set()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!predicate(row)) continue
    const key = cleanText(row.video_upload_id || row.post_id || row.video_key)
    if (key) keys.add(key)
  }
  return keys.size
}

function libraryStatusSummary(rows = []) {
  const post = libraryUniqueCount(rows, row => numberValue(row.status) === 300)
  const draft = libraryUniqueCount(rows, row => numberValue(row.status) === 200)
  const deleted = libraryUniqueCount(rows, row => numberValue(row.status) === 400)
  const badTitle = libraryUniqueCount(rows, row => numberValue(row.status) === 300 && isBadShopeeVideoTitle(row))
  return {
    post,
    draft,
    deleted,
    badTitle,
    active: post + draft
  }
}

function selectedLibraryRows() {
  const keys = state.librarySelectedKeys || new Set()
  return (state.dashboard?.library || []).filter(row => keys.has(cleanText(row.video_key)))
}

function pruneLibrarySelection() {
  const existingKeys = new Set((state.dashboard?.library || []).map(row => cleanText(row.video_key)).filter(Boolean))
  state.librarySelectedKeys = new Set([...state.librarySelectedKeys].filter(key => existingKeys.has(key)))
}

function applyEditedVideoToState(selected, patch = {}) {
  if (!selected || !state.dashboard) return
  const videoKey = cleanText(selected.video_key)
  const videoUploadId = cleanText(selected.video_upload_id)
  const postId = cleanText(selected.post_id)
  const patchCoverUrl = videoCoverBelongsToVideo(patch.cover_image_url, videoUploadId)
  const nextLinks = Array.isArray(patch.items) ? patch.items.map(item => ({
    item_id: cleanText(item.item_id),
    custom_item_name: cleanText(item.custom_item_name),
    product_name: cleanText(item.product_name || item.item_name)
  })) : selected.links
  // Sau khi Shopee nhận lệnh sửa, cache thư viện có thể chưa kịp đồng bộ lại.
  // Cập nhật dòng đang chọn ngay trên UI để người vận hành thấy lệnh vừa lưu đã áp dụng.
  state.dashboard.library = (state.dashboard.library || []).map(row => {
    const sameVideo = cleanText(row.video_key) === videoKey ||
      (videoUploadId && cleanText(row.video_upload_id) === videoUploadId) ||
      (postId && cleanText(row.post_id) === postId)
    if (!sameVideo) return row
    return {
      ...row,
      caption: cleanText(patch.caption) || cleanText(row.caption),
      cover_image_url: patchCoverUrl || cleanText(row.cover_image_url),
      links: nextLinks
    }
  })
  state.editItems = Array.isArray(nextLinks) ? nextLinks : state.editItems
  if (patchCoverUrl) state.editCoverUrl = patchCoverUrl
}

function selectedShopGuide() {
  const row = selectedShopRow()
  return cleanText(row?.video_operator_guide || row?.operator_guide)
}

function videoModeInfo(row = {}) {
  const mode = cleanText(row.video_sync_mode)
  if (mode === 'lazada_media_api') return { label: 'Lazada Media API sẵn sàng', tone: 'success' }
  if (mode === 'lazada_needs_auth') return { label: 'Lazada cần kết nối API', tone: 'warning' }
  if (Number(row.video_ready) === 1 || mode === 'api_live') return { label: 'Video API sẵn sàng', tone: 'success' }
  if (mode === 'api_needs_permission_test') return { label: 'Cần test quyền video', tone: 'warning' }
  if (mode === 'api_needs_auth') return { label: 'Cần kết nối Video API', tone: 'warning' }
  if (mode === 'api_missing_app') return { label: 'Chưa cấu hình Video API', tone: 'muted' }
  if (mode === 'api_missing_user_id') return { label: 'Thiếu user_id video', tone: 'warning' }
  if (mode === 'browser_reference' || cleanText(row.platform) === 'tiktok') return { label: 'Browser / tham chiếu', tone: 'muted' }
  return { label: 'Tham chiếu tay', tone: 'muted' }
}

async function fetchJson(url, options) {
  let response
  try {
    response = await fetch(url, options)
  } catch (error) {
    // Lỗi mạng/CORS cần đổi sang tiếng Việt để đội vận hành biết là chưa gọi được API, không phải lỗi dữ liệu video.
    throw new Error(`Không gọi được API video. Hãy thử tải lại trang hoặc kiểm tra Worker API. Chi tiết: ${cleanText(error?.message) || 'fetch lỗi'}`)
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.status === 'error') {
    throw new Error(cleanText(data?.message || data?.error) || `Lỗi HTTP ${response.status}`)
  }
  return data
}

// Tab đóng gói giữ lại luồng cũ để shop không có API vẫn có nơi tra cứu video thực tế.
function renderTabState() {
  document.querySelectorAll('[data-video-tab]').forEach(button => {
    button.classList.toggle('active', cleanText(button.dataset.videoTab) === state.activeTab)
  })
  const center = document.getElementById('videoCenterTab')
  const packing = document.getElementById('videoPackingTab')
  const subtabSwitch = document.getElementById('videoSubtabSwitch')
  if (center) center.hidden = state.activeTab !== 'center'
  if (packing) packing.hidden = state.activeTab !== 'packing'
  if (subtabSwitch) subtabSwitch.hidden = state.activeTab !== 'center'
  renderSubtabState()
}

function normalizeVideoSubtab(value) {
  const text = cleanText(value)
  if (text === 'automation') return 'upload'
  return ['overview', 'library', 'detail', 'upload', 'multi', 'lazada', 'shop'].includes(text) ? text : 'overview'
}

function setVideoSubtab(value) {
  state.activeSubtab = normalizeVideoSubtab(value)
  localStorage.setItem('shv_video_active_subtab', state.activeSubtab)
  const params = new URLSearchParams(window.location.search)
  params.set('view', state.activeSubtab)
  if (state.selectedShop) params.set('shop', state.selectedShop)
  if (state.selectedLazadaShop) params.set('lazadaShop', state.selectedLazadaShop)
  window.history.replaceState({}, document.title, `${window.location.pathname}?${params.toString()}`)
  renderSubtabState()
}

function renderSubtabState() {
  state.activeSubtab = normalizeVideoSubtab(state.activeSubtab)
  document.querySelectorAll('[data-video-subtab]').forEach(button => {
    button.classList.toggle('active', cleanText(button.dataset.videoSubtab) === state.activeSubtab)
  })
  document.querySelectorAll('[data-video-subview]').forEach(node => {
    node.hidden = cleanText(node.dataset.videoSubview) !== state.activeSubtab
  })
  document.querySelectorAll('[data-video-shopee-control]').forEach(node => {
    node.hidden = ['lazada', 'shop'].includes(state.activeSubtab)
  })
  const workArea = document.getElementById('videoWorkArea')
  if (workArea) workArea.hidden = !['library', 'detail', 'upload', 'multi'].includes(state.activeSubtab)
  const detailStack = document.getElementById('videoDetailStack')
  if (detailStack) detailStack.hidden = !['detail', 'upload', 'multi'].includes(state.activeSubtab)
  renderWarnings()
}

// Tóm tắt toàn bộ khả năng theo shop để người vận hành thấy rõ shop nào đi API, shop nào đi tham chiếu tay.
