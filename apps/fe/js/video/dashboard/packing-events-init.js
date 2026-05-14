function packingQuantityText(data) {
  const summary = data?.item_summary || {}
  const order = data?.order || {}
  const totalQty = Number(summary.total_qty || order.total_qty || 0)
  const skuCount = Number(summary.sku_count || order.sku_count || 0)
  if (!data?.found) return cleanText(data?.advice || 'Không tìm thấy đơn trong OMS.')
  if (totalQty > 0) return `Đơn này có ${totalQty} sản phẩm${skuCount > 1 ? `, ${skuCount} mã hàng` : ''}.`
  return 'Đơn này chưa có dữ liệu sản phẩm trong OMS.'
}

function speakPackingQuantity(data) {
  const message = cleanText(data?.speech_text || packingQuantityText(data))
  if (!message || !('speechSynthesis' in window)) return
  try {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(message)
    utterance.lang = 'vi-VN'
    utterance.rate = 1.02
    utterance.pitch = 1
    utterance.volume = 1
    window.speechSynthesis.speak(utterance)
  } catch {}
}

function renderPackingScanStatus(data, tone = '') {
  const box = document.getElementById('packingScanStatus')
  if (!box) return
  const label = data?.label || {}
  const order = data?.order || {}
  const quantityText = packingQuantityText(data)
  const latestVideo = data?.latest_video || null
  const evidence = data?.evidence || {}
  const videoUrl = latestVideo?.video_url ? `${API_BASE}/api/file/${encodeURIComponent(cleanText(latestVideo.video_url))}` : ''
  const labelUrl = label.valid && order.order_id ? `${API_BASE}/api/label/${encodeURIComponent(cleanText(order.order_id))}.pdf` : ''
  const statusClass = tone || (data?.found && label.valid ? 'success' : data?.found ? 'warning' : 'error')
  box.className = `video-status-box compact ${statusClass}`.trim()
  box.innerHTML = `
    <strong>${data?.found ? `Đơn ${escapeHtml(order.order_id || '')}` : 'Chưa tìm thấy đơn trong OMS'}</strong><br>
    ${data?.found ? `${escapeHtml(order.platform || '')} · ${escapeHtml(order.shop || '')} · ${escapeHtml(order.shipping_status || order.oms_status || 'Chưa rõ trạng thái')}` : escapeHtml(data?.advice || 'Cần đồng bộ/import đơn trước khi chốt kho.')}<br>
    Sản phẩm: ${escapeHtml(quantityText)}<br>
    Tem: ${label.valid ? 'hợp lệ' : `chưa hợp lệ${label.error ? ` (${escapeHtml(label.error)})` : ''}`} ·
    Video: ${latestVideo ? `đã có lúc ${escapeHtml(shortDateTime(latestVideo.created_at))}` : 'chưa có'}<br>
    ${order.is_return_refund ? `Khiếu nại hoàn/trả: ${evidence.complaint_ready ? 'có video để tải lên sàn' : 'thiếu video đóng gói'}` : 'Đóng gói thường: dùng để kiểm tra tem và video nội bộ.'}
    ${(videoUrl || labelUrl) ? `<div class="video-inline-actions">${videoUrl ? `<a class="video-link-btn" href="${videoUrl}" download="video-${escapeHtml(cleanText(order.order_id || 'dong-goi'))}">Tải video khiếu nại</a>` : ''}${labelUrl ? `<a class="video-link-btn secondary" href="${labelUrl}" target="_blank" rel="noopener">Mở tem</a>` : ''}</div>` : ''}
  `
}

async function verifyPackingScan() {
  const input = document.getElementById('packingSearchInput')
  const scan = normalizePackingScanInput(input?.value || '')
  const query = scan.code
  if (!query) {
    renderPackingScanStatus({ found: false, advice: 'Chưa nhập mã đơn hoặc mã vận đơn.' }, 'warning')
    return null
  }
  if (input && scan.raw && scan.raw !== query) input.value = query
  try {
    const data = await fetchJson(`${API_BASE}/api/cctv/scan-order?code=${encodeURIComponent(query)}`)
    renderPackingScanStatus(data)
    speakPackingQuantity(data)
    return data
  } catch (error) {
    renderPackingScanStatus({ found: false, advice: error.message }, 'error')
    return null
  }
}

async function loadPackingVideos() {
  const query = cleanText(document.getElementById('packingSearchInput')?.value || '')
  const list = document.getElementById('packingVideoList')
  if (!list) return
  list.innerHTML = `<div class="video-empty"><strong>Đang tải kho video đóng gói...</strong></div>`
  try {
    const data = await fetchJson(`${API_BASE}/api/cctv/videos?search=${encodeURIComponent(query)}`)
    const rows = Array.isArray(data) ? data : []
    if (!rows.length) {
      list.innerHTML = `<div class="video-empty"><strong>Không tìm thấy video đóng gói phù hợp.</strong></div>`
      return
    }
    list.innerHTML = rows.map(row => {
      const fileUrl = `${API_BASE}/api/file/${encodeURIComponent(cleanText(row.video_url))}`
      return `
        <article class="video-packing-card">
          <strong>Mã đơn: ${escapeHtml(cleanText(row.order_id))}</strong>
          <span class="video-mini-label">Quét lúc: ${escapeHtml(shortDateTime(row.created_at))}</span>
          <span class="video-mini-label">${escapeHtml(cleanText(row.platform || ''))}${row.shop ? ` · ${escapeHtml(cleanText(row.shop))}` : ''}${row.shipping_status ? ` · ${escapeHtml(cleanText(row.shipping_status))}` : ''}</span>
          <span class="video-mini-label">Tem: ${row.label_storage_key && !row.label_error ? 'đã có' : 'chưa rõ/chưa hợp lệ'}</span>
          <span class="video-mini-label">Bằng chứng khiếu nại: dùng video này nếu đơn bị trả hàng/hoàn tiền.</span>
          <video controls preload="metadata">
            <source src="${fileUrl}" type="${cleanText(row.video_url).toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4'}">
          </video>
          <a class="video-link-btn" href="${fileUrl}" download="video-${escapeHtml(cleanText(row.order_id))}">Tải video</a>
        </article>
      `
    }).join('')
  } catch (error) {
    list.innerHTML = `<div class="video-status-box error">${escapeHtml(error.message)}</div>`
  }
}

function attachEvents() {
  document.querySelectorAll('[data-video-tab]').forEach(button => {
    button.addEventListener('click', () => {
      state.activeTab = cleanText(button.dataset.videoTab)
      renderTabState()
      if (state.activeTab === 'packing') loadPackingVideos()
    })
  })
  document.querySelectorAll('[data-video-subtab]').forEach(button => {
    button.addEventListener('click', () => {
      setVideoSubtab(button.dataset.videoSubtab)
    })
  })

  document.getElementById('videoShopSelect')?.addEventListener('change', event => {
    state.selectedShop = cleanText(event.target.value)
    rememberSelectedVideoShop(state.selectedShop)
    state.selectedVideoKey = ''
    state.detail = null
    state.editItems = []
    state.uploadItems = []
    state.scheduleItems = []
    state.uploadQueue = []
    state.multiShopPreview = null
    state.editCoverUrl = ''
    state.editTitleSuggestions = []
    state.editTitleProvider = ''
    state.editTitleLoading = false
    state.librarySelectedKeys.clear()
    state.libraryQuery = ''
    state.libraryBadTitleOnly = false
    renderUploadPanel()
    renderMultiShopPanel()
    renderAutomationPanel()
    loadDashboard(false).then(loadUploadQueue)
  })

  document.getElementById('videoPeriodType')?.addEventListener('change', event => {
    state.periodType = cleanText(event.target.value) || 'Last7d'
  })

  document.getElementById('videoEndDate')?.addEventListener('change', event => {
    state.endDate = cleanText(event.target.value) || defaultEndDate()
  })

  document.getElementById('videoAnalysisSort')?.addEventListener('change', event => {
    state.analysisSort = cleanText(event.target.value) || 'sales'
    localStorage.setItem('shv_video_analysis_sort', state.analysisSort)
    renderTopVideos()
    renderTopProducts()
    renderInsights()
  })

  document.getElementById('videoAnalysisMin')?.addEventListener('input', event => {
    state.analysisMin = numberValue(event.target.value)
    localStorage.setItem('shv_video_analysis_min', String(state.analysisMin))
    renderTopVideos()
    renderTopProducts()
  })

  document.getElementById('videoSyncBtn')?.addEventListener('click', () => loadDashboard(true))
  document.getElementById('videoRefreshBtn')?.addEventListener('click', () => loadDashboard(false))
  document.getElementById('packingVerifyBtn')?.addEventListener('click', verifyPackingScan)
  document.getElementById('packingSearchBtn')?.addEventListener('click', loadPackingVideos)
  document.getElementById('packingSearchInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') verifyPackingScan().then(loadPackingVideos)
  })

  document.addEventListener('click', event => {
    const actionNode = event.target.closest('[data-action]')
    if (!actionNode) return
    const action = cleanText(actionNode.dataset.action)
    if (action === 'set-subtab') {
      setVideoSubtab(actionNode.dataset.targetSubtab)
      return
    }
    if (action === 'select-video') {
      state.selectedVideoKey = cleanText(actionNode.dataset.videoKey)
      const selected = selectedLibraryRow()
      state.detail = selected?.detail_cache || null
      state.editItems = Array.isArray(selected?.links) ? selected.links.map(link => ({
        item_id: cleanText(link.item_id),
        custom_item_name: cleanText(link.custom_item_name),
        product_name: cleanText(link.product_name || link.item_name)
      })) : []
      state.editCoverUrl = preferredVideoCoverUrl(selected, state.detail)
      state.editTitleSuggestions = []
      state.editTitleProvider = ''
      state.editTitleLoading = false
      renderLibrary()
      renderDetail()
      setVideoSubtab('detail')
      return
    }
    if (action === 'show-more-library') {
      state.libraryLimit += 20
      renderLibrary()
      return
    }
    if (action === 'lazada-show-more-library') {
      state.lazadaLibraryLimit += 20
      renderLazadaVideoPanel()
      return
    }
    if (action === 'lazada-select-video') {
      const row = findLazadaLibraryRow(actionNode.dataset.videoId)
      if (row) selectLazadaVideoRow(row)
      renderLazadaVideoPanel()
      setLazadaVideoStatus('Đã chọn video Lazada trong kho đã lưu.', 'success')
      return
    }
    if (action === 'lazada-refresh-video') {
      const videoId = cleanText(actionNode.dataset.videoId)
      if (videoId) state.lazadaVideoId = videoId
      readLazadaVideoDetail()
      return
    }
    if (action === 'lazada-remove-video') {
      removeLazadaVideo(actionNode.dataset.videoId)
      return
    }
    if (action === 'sync-full-library') {
      syncFullVideoLibrary()
      return
    }
    if (action === 'select-filtered-library') {
      libraryRowsForDisplay().forEach(row => {
        const key = cleanText(row.video_key)
        if (key) state.librarySelectedKeys.add(key)
      })
      renderLibrary()
      return
    }
    if (action === 'clear-library-selection') {
      state.librarySelectedKeys.clear()
      renderLibrary()
      return
    }
    if (action === 'delete-selected-videos') {
      submitBulkDeleteVideos()
      return
    }
    if (action === 'load-detail') {
      state.selectedVideoKey = cleanText(actionNode.dataset.videoKey || state.selectedVideoKey)
      const selected = selectedLibraryRow()
      state.detail = selected?.detail_cache || null
      state.editItems = Array.isArray(selected?.links) ? selected.links.map(link => ({
        item_id: cleanText(link.item_id),
        custom_item_name: cleanText(link.custom_item_name),
        product_name: cleanText(link.product_name || link.item_name)
      })) : []
      state.editCoverUrl = preferredVideoCoverUrl(selected, state.detail)
      state.editTitleSuggestions = []
      state.editTitleProvider = ''
      state.editTitleLoading = false
      renderLibrary()
      renderDetail()
      setVideoSubtab('detail')
      loadDetail(cleanText(actionNode.dataset.refresh) === '1')
      return
    }
    if (action === 'delete-video-row') {
      state.selectedVideoKey = cleanText(actionNode.dataset.videoKey || state.selectedVideoKey)
      const selected = selectedLibraryRow()
      state.detail = selected?.detail_cache || null
      state.editItems = Array.isArray(selected?.links) ? selected.links.map(link => ({
        item_id: cleanText(link.item_id),
        custom_item_name: cleanText(link.custom_item_name),
        product_name: cleanText(link.product_name || link.item_name)
      })) : []
      submitDeleteVideo()
      return
    }
    if (action === 'choose-cover') {
      chooseCover(actionNode.dataset.coverUrl)
      return
    }
    if (action === 'add-linked-item') {
      addLinkedItem(cleanText(actionNode.dataset.mode), actionNode.dataset.item)
      return
    }
    if (action === 'remove-linked-item') {
      removeLinkedItem(cleanText(actionNode.dataset.mode), cleanText(actionNode.dataset.itemId))
      return
    }
    if (action === 'suggest-video-title') {
      requestAiVideoTitleSuggestions()
      return
    }
    if (action === 'use-ai-video-title') {
      applyAiVideoTitle(actionNode.dataset.titleIndex)
      return
    }
    if (action === 'suggest-edit-video-title') {
      requestAiEditTitleSuggestions()
      return
    }
    if (action === 'use-ai-edit-video-title') {
      applyAiEditTitle(actionNode.dataset.titleIndex)
      return
    }
    if (action === 'suggest-multi-shop-title') {
      suggestMultiShopTitle(actionNode.dataset.shop)
      return
    }
    if (action === 'search-multi-product') {
      searchMultiShopProduct(actionNode.dataset.shop)
      return
    }
    if (action === 'attach-multi-product') {
      attachMultiShopProduct(actionNode.dataset.shop, actionNode.dataset.itemId)
      return
    }
    if (action === 'remove-multi-product') {
      removeMultiShopProduct(actionNode.dataset.shop, actionNode.dataset.itemId)
      return
    }
    if (action === 'apply-multi-default-time') {
      const value = cleanText(document.getElementById('videoMultiDefaultAt')?.value || multiShopDefaultAt())
      document.querySelectorAll('[data-multi-field="scheduled_at"]').forEach(input => { input.value = value })
      state.multiDefaultScheduledAt = value
      readMultiShopRowsFromDom()
      setStatus('Đã áp dụng giờ đăng mặc định cho tất cả shop trong chiến dịch.', 'success')
      return
    }
    if (action === 'copy-multi-manual') {
      copyTextToClipboard(actionNode.dataset.manualText, 'Đã copy nội dung đăng tay cho shop chưa có API.')
      return
    }
    if (action === 'cancel-video-queue') {
      cancelUploadQueue(actionNode.dataset.queueId)
      return
    }
    if (action === 'start-browser-video-upload') {
      startBrowserVideoUpload(actionNode.dataset.queueId)
      return
    }
    if (action === 'mark-browser-video-posted') {
      markBrowserVideoPosted(actionNode.dataset.queueId)
    }
  })
}

let videoDashboardStarted = false

async function init() {
  if (videoDashboardStarted) return
  videoDashboardStarted = true
  document.getElementById('videoPeriodType').value = state.periodType
  document.getElementById('videoEndDate').value = state.endDate
  const analysisSort = document.getElementById('videoAnalysisSort')
  if (analysisSort) analysisSort.value = state.analysisSort
  const analysisMin = document.getElementById('videoAnalysisMin')
  if (analysisMin) analysisMin.value = state.analysisMin ? String(state.analysisMin) : ''
  renderTabState()
  attachEvents()
  await loadCapabilities()
}

// Module video được tách nhiều chunk; nếu chunk cuối tải sau DOMContentLoaded thì vẫn phải gắn sự kiện tab ngay.
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
