function renderSearchResults(targetId, rows, mode) {
  const node = document.getElementById(targetId)
  if (!node) return
  if (!rows.length) {
    node.innerHTML = `<div class="video-empty"><strong>Chưa có kết quả phù hợp.</strong></div>`
    return
  }
  node.innerHTML = rows.map(row => `
    <div class="video-search-row">
      <div class="video-search-row-head">
        <div>
          <strong>${escapeHtml(cleanText(row.product_name || row.item_sku || row.item_id))}</strong>
          <span class="video-mini-label">${escapeHtml(cleanText(row.item_id))} · ${escapeHtml(cleanText(row.item_sku))}</span>
        </div>
        <button class="video-chip-btn" type="button" data-action="add-linked-item" data-mode="${escapeHtml(mode)}" data-item='${escapeHtml(JSON.stringify(row))}'>Thêm</button>
      </div>
    </div>
  `).join('')
}

async function searchCatalog(query, mode) {
  const shop = state.selectedShop
  if (!shop || !selectedShopReady()) return
  const text = cleanText(query)
  const targetId = mode === 'edit'
    ? 'videoEditSearchResults'
    : mode === 'schedule'
      ? 'videoScheduleSearchResults'
      : 'videoUploadSearchResults'
  if (!text || text.length < 2) {
    renderSearchResults(targetId, [], mode)
    return
  }
  try {
    const data = await fetchJson(`${API_BASE}/api/video/catalog-items?platform=shopee&shop=${encodeURIComponent(shop)}&query=${encodeURIComponent(text)}&limit=10`)
    renderSearchResults(targetId, data.rows || [], mode)
  } catch (error) {
    setStatus(error.message, 'error')
  }
}

function onEditSearchInput(event) {
  clearTimeout(state.editSearchTimer)
  state.editSearchTimer = setTimeout(() => searchCatalog(event.target.value, 'edit'), 300)
}

function onUploadSearchInput(event) {
  clearTimeout(state.uploadSearchTimer)
  state.uploadSearchTimer = setTimeout(() => searchCatalog(event.target.value, 'upload'), 300)
}

function onScheduleSearchInput(event) {
  clearTimeout(state.scheduleSearchTimer)
  state.scheduleSearchTimer = setTimeout(() => searchCatalog(event.target.value, 'schedule'), 300)
}

function addLinkedItem(mode, rawItemJson) {
  const item = JSON.parse(rawItemJson || '{}')
  const target = mode === 'edit' ? state.editItems : mode === 'schedule' ? state.scheduleItems : state.uploadItems
  const itemId = cleanText(item.item_id)
  if (!itemId || target.some(row => cleanText(row.item_id) === itemId)) return
  target.push({
    item_id: itemId,
    product_name: cleanText(item.product_name || item.item_sku || item.item_id)
  })
  renderSelectedItems(mode === 'edit' ? 'videoEditSelectedItems' : mode === 'schedule' ? 'videoScheduleSelectedItems' : 'videoUploadSelectedItems', target, mode)
  if (mode === 'edit') {
    state.editTitleSuggestions = []
    renderEditAiTitleSuggestions()
  }
  if (mode === 'schedule') renderSchedulePreview()
  if (mode === 'upload') {
    renderUploadDuplicateCheck()
    renderPublishPreview()
  }
}

function removeLinkedItem(mode, itemId) {
  const target = mode === 'edit' ? state.editItems : mode === 'schedule' ? state.scheduleItems : state.uploadItems
  const nextRows = target.filter(row => cleanText(row.item_id) !== cleanText(itemId))
  if (mode === 'edit') state.editItems = nextRows
  else if (mode === 'schedule') state.scheduleItems = nextRows
  else state.uploadItems = nextRows
  renderSelectedItems(mode === 'edit' ? 'videoEditSelectedItems' : mode === 'schedule' ? 'videoScheduleSelectedItems' : 'videoUploadSelectedItems', nextRows, mode)
  if (mode === 'edit') {
    state.editTitleSuggestions = []
    renderEditAiTitleSuggestions()
  }
  if (mode === 'schedule') renderSchedulePreview()
  if (mode === 'upload') {
    renderUploadDuplicateCheck()
    renderPublishPreview()
  }
}

function chooseCover(url) {
  const selected = selectedLibraryRow()
  state.editCoverUrl = videoCoverBelongsToVideo(url, selected?.video_upload_id)
  renderDetail()
}

async function loadCapabilities() {
  setStatus('Đang tải khả năng video theo shop...', 'info')
  const data = await fetchJson(`${API_BASE}/api/video/capabilities`)
  state.capabilities = Array.isArray(data.rows) ? data.rows : []
  renderCapabilitySummary()
  renderShopSelect()
  renderLazadaVideoPanel()
  if (state.selectedLazadaShop) await loadLazadaVideoLibrary(false)
  renderManualPlan()
  renderUploadPanel()
  renderMultiShopPanel()
  renderAutomationPanel()
  renderSubtabState()
  if (state.selectedShop) {
    await loadDashboard()
    await loadUploadQueue()
  } else {
    setStatus('Chưa có shop Shopee nào trong danh sách video.', 'warning')
  }
}

// Dashboard luôn đọc từ core D1; chỉ khi bấm đồng bộ mới gọi lại Shopee Video API.
async function loadDashboard(sync = false, options = {}) {
  if (!state.selectedShop) {
    setStatus('Vui lòng chọn shop Shopee để xem dashboard video.', 'warning')
    return
  }
  const ready = selectedShopReady()
  const guide = selectedShopGuide()
  if (sync && !ready) {
    setStatus(guide || 'Shop này chưa đủ điều kiện đồng bộ Shopee Video.', 'warning')
    return
  }
  try {
    if (sync) {
      setStatus(options.syncAll ? `Đang tải lại toàn bộ thư viện Shopee Video cho shop ${state.selectedShop}...` : `Đang đồng bộ Shopee Video cho shop ${state.selectedShop}...`, 'info')
      const syncResult = await fetchJson(`${API_BASE}/api/video/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: state.selectedShop,
          period_type: state.periodType,
          end_date: state.endDate,
          sync_all: options.syncAll ? 1 : 0,
          max_pages: options.syncAll ? 50 : undefined
        })
      })
      if (syncResult.status === 'warning') {
        setStatus(syncResult.message || 'Luồng đồng bộ video trả về cảnh báo.', 'warning')
      }
    }

    const dashboard = await fetchJson(`${API_BASE}/api/video/dashboard?platform=shopee&shop=${encodeURIComponent(state.selectedShop)}&period_type=${encodeURIComponent(state.periodType)}&end_date=${encodeURIComponent(state.endDate)}`)
    state.dashboard = dashboard
    pruneLibrarySelection()
    const firstVideo = cleanText(state.selectedVideoKey)
      ? (dashboard.library || []).find(row => cleanText(row.video_key) === cleanText(state.selectedVideoKey))
      : (dashboard.library || []).find(row => cleanText(row.list_type) === 'post') || dashboard.library?.[0]
    state.selectedVideoKey = cleanText(firstVideo?.video_key)
    state.detail = firstVideo?.detail_cache || null
    state.editItems = Array.isArray(firstVideo?.links) ? firstVideo.links.map(link => ({
      item_id: cleanText(link.item_id),
      custom_item_name: cleanText(link.custom_item_name),
      product_name: cleanText(link.product_name || link.item_name)
    })) : []
    state.editCoverUrl = preferredVideoCoverUrl(firstVideo, state.detail)

    renderOverview()
    renderWarnings()
    renderTrendTable()
    renderAudience()
    renderTopVideos()
    renderTopProducts()
    renderInsights()
    renderLibrary()
    renderDetail()
    renderUploadPanel()
    renderAutomationPanel()
    renderSubtabState()

    const cachedText = cleanText(dashboard.synced_at) ? `Cache dashboard đã đồng bộ lúc ${shortDateTime(dashboard.synced_at)}.` : 'Đã tải dữ liệu video từ core.'
    setStatus(ready ? cachedText : guide || cachedText, ready ? 'success' : 'warning')
  } catch (error) {
    setStatus(error.message, 'error')
  }
}

async function loadDetail(refresh = false) {
  const selected = selectedLibraryRow()
  if (!selected || !state.selectedShop) return
  try {
    setStatus(`Đang tải chi tiết video cho shop ${state.selectedShop}...`, 'info')
    const url = `${API_BASE}/api/video/detail?platform=shopee&shop=${encodeURIComponent(state.selectedShop)}&video_upload_id=${encodeURIComponent(cleanText(selected.video_upload_id))}&post_id=${encodeURIComponent(cleanText(selected.post_id))}&refresh=${refresh ? '1' : '0'}`
    const data = await fetchJson(url)
    state.detail = data.detail || null
    const detailCoverUrl = preferredVideoCoverUrl(selected, state.detail)
    if (detailCoverUrl && !videoCoverBelongsToVideo(state.editCoverUrl, selected.video_upload_id)) {
      state.editCoverUrl = detailCoverUrl
    }
    renderDetail()
    setStatus('Đã tải chi tiết video.', 'success')
  } catch (error) {
    setStatus(error.message, 'error')
  }
}

// Sửa video là luồng ghi thật nên chỉ bật cho shop đủ API và luôn ghi log ở backend.
async function submitEditVideo() {
  const selected = selectedLibraryRow()
  if (!selected || !selectedShopReady()) return
  if (!canEditShopeeVideoInfo(selected)) {
    setStatus('Shopee Video API chỉ cho sửa bản nháp/chưa đăng. Video đã đăng cần xóa rồi đăng lại hoặc xử lý trong Seller Center nếu sàn cho phép.', 'warning')
    return
  }
  const captionInput = document.getElementById('videoEditCaption')
  const caption = ensureRequiredVideoHashtag(captionInput?.value || cleanText(selected.caption))
  if (captionInput && captionInput.value !== caption) captionInput.value = caption
  renderEditCaptionMeter()
  if (caption.length > SHOPEE_VIDEO_LIMITS.titleMaxChars) {
    setStatus(`Tiêu đề video đang dài ${caption.length} ký tự, vượt giới hạn ${SHOPEE_VIDEO_LIMITS.titleMaxChars} ký tự.`, 'warning')
    return
  }
  try {
    setStatus('Đang lưu thông tin video lên Shopee...', 'info')
    const coverImageUrl = videoCoverBelongsToVideo(state.editCoverUrl, selected.video_upload_id)
    const data = await fetchJson(`${API_BASE}/api/video/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: state.selectedShop,
        video_upload_id: cleanText(selected.video_upload_id),
        post_id: cleanText(selected.post_id),
        status: numberValue(selected.status),
        list_type: cleanText(selected.list_type),
        caption,
        cover_image_url: coverImageUrl,
        items: state.editItems,
        allow_duet: document.getElementById('videoAllowDuet')?.checked ? 1 : 0,
        allow_stitch: document.getElementById('videoAllowStitch')?.checked ? 1 : 0
      })
    })
    applyEditedVideoToState(selected, {
      caption,
      cover_image_url: coverImageUrl,
      items: state.editItems
    })
    if (data.detail) state.detail = data.detail
    renderLibrary()
    renderDetail()
    setStatus(data.message || 'Đã gửi lệnh sửa video lên Shopee.', 'success')
  } catch (error) {
    setStatus(error.message, 'error')
  }
}

function videoRowsForConfirm(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter(Boolean)
}

function videoDeleteRowTitle(row = {}) {
  return cleanText(row.caption) || cleanText(row.video_upload_id) || cleanText(row.post_id) || 'Video chưa có tiêu đề'
}

function videoRowDeleteId(row = {}) {
  return cleanText(row.post_id) || cleanText(row.video_upload_id) || cleanText(row.video_key) || '-'
}

function chunkVideoRows(rows = [], size = 100) {
  const chunks = []
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size))
  return chunks
}

function confirmDeleteVideosByModal(rows = [], options = {}) {
  const finalRows = videoRowsForConfirm(rows)
  if (!finalRows.length) return Promise.resolve(false)
  const badTitleCount = finalRows.filter(isBadShopeeVideoTitle).length
  const previewRows = finalRows.slice(0, 12)
  const extraCount = Math.max(0, finalRows.length - previewRows.length)
  const existing = document.getElementById('videoDeleteConfirmModal')
  if (existing) existing.remove()

  return new Promise(resolve => {
    const modal = document.createElement('div')
    modal.id = 'videoDeleteConfirmModal'
    modal.className = 'video-confirm-modal'
    modal.innerHTML = `
      <div class="video-confirm-backdrop" data-confirm-action="cancel"></div>
      <section class="video-confirm-card" role="dialog" aria-modal="true" aria-label="Xác nhận xóa video">
        <div class="video-confirm-head">
          <div>
            <strong>${escapeHtml(options.title || 'Xác nhận xóa video Shopee')}</strong>
            <span>Shop ${escapeHtml(state.selectedShop || '-')} · ${formatNumber(finalRows.length)} video${badTitleCount ? ` · ${formatNumber(badTitleCount)} tiêu đề cần xử lý` : ''}</span>
          </div>
          <button type="button" class="video-modal-close" data-confirm-action="cancel" aria-label="Đóng">×</button>
        </div>
        <div class="video-confirm-warning">
          Đây là lệnh xóa thật trên Shopee. Kiểm tra danh sách bên dưới rồi bấm xác nhận nếu đúng.
          ${finalRows.length > 100 ? `Hệ thống sẽ tự chia ${formatNumber(Math.ceil(finalRows.length / 100))} lô để tránh quá tải.` : ''}
        </div>
        <div class="video-confirm-table">
          ${previewRows.map(row => `
            <div class="video-confirm-row">
              <div>
                <strong>${escapeHtml(truncateDisplayText(videoDeleteRowTitle(row), 80))}</strong>
                <span>${escapeHtml(videoRowDeleteId(row))}</span>
              </div>
              <em>${isBadShopeeVideoTitle(row) ? 'Tiêu đề cần xử lý' : escapeHtml(cleanText(row.status_label) || cleanText(row.list_type) || 'Video')}</em>
            </div>
          `).join('')}
          ${extraCount ? `<div class="video-confirm-more">Còn ${formatNumber(extraCount)} video khác trong danh sách đã chọn.</div>` : ''}
        </div>
        <div class="video-confirm-actions">
          <button type="button" class="video-btn secondary" data-confirm-action="cancel">Hủy</button>
          <button type="button" class="video-btn danger" data-confirm-action="confirm">Xác nhận xóa</button>
        </div>
      </section>
    `
    const finish = value => {
      modal.remove()
      resolve(value)
    }
    modal.addEventListener('click', event => {
      const action = event.target?.dataset?.confirmAction
      if (action === 'cancel') finish(false)
      if (action === 'confirm') finish(true)
    })
    document.body.appendChild(modal)
  })
}

function deletePayloadRows(rows = []) {
  return rows.map(row => ({
    video_key: cleanText(row.video_key),
    video_upload_id: cleanText(row.video_upload_id),
    post_id: cleanText(row.post_id),
    list_type: cleanText(row.list_type),
    status: numberValue(row.status),
    caption: cleanText(row.caption)
  }))
}

async function deleteVideoRowsInBatches(rows = []) {
  const chunks = chunkVideoRows(rows, 100)
  let deleted = 0
  let failed = 0
  const messages = []
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]
    setVideoProgressStatus({
      title: 'Đang xóa video Shopee',
      current: index,
      total: chunks.length,
      message: `Đang gửi lô ${formatNumber(index + 1)}/${formatNumber(chunks.length)} (${formatNumber(chunk.length)} video).`,
      detail: `Đã xóa ${formatNumber(deleted)} video, lỗi ${formatNumber(failed)} video.`,
      type: 'warning'
    })
    const data = await fetchJson(`${API_BASE}/api/video/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: state.selectedShop,
        videos: deletePayloadRows(chunk),
        confirmed: true,
        refresh_after_delete: index === chunks.length - 1 ? 1 : 0,
        period_type: state.periodType,
        end_date: state.endDate
      })
    })
    deleted += numberValue(data.deleted_count)
    failed += numberValue(data.failed_count)
    if (data.message) messages.push(data.message)
  }
  return { deleted, failed, messages }
}

async function submitDeleteVideo() {
  const selected = selectedLibraryRow()
  if (!selected || !selectedShopReady()) return
  const confirmed = await confirmDeleteVideosByModal([selected], { title: 'Xác nhận xóa video này' })
  if (!confirmed) return
  try {
    state.libraryDeleting = true
    renderLibrary()
    const result = await deleteVideoRowsInBatches([selected])
    state.selectedVideoKey = ''
    state.libraryLimit = 20
    state.detail = null
    state.editItems = []
    state.editCoverUrl = ''
    await loadDashboard(false)
    setStatus(`Đã xóa ${formatNumber(result.deleted)}/1 video${result.failed ? `, lỗi ${formatNumber(result.failed)} video.` : '.'}`, result.failed ? 'warning' : 'success')
  } catch (error) {
    setStatus(error.message, 'error')
  } finally {
    state.libraryDeleting = false
    renderLibrary()
  }
}
