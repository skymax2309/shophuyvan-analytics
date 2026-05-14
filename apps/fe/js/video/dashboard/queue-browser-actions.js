async function syncFullVideoLibrary() {
  if (!selectedShopReady()) {
    setStatus(selectedShopGuide() || 'Shop này chưa đủ điều kiện tải lại toàn bộ Shopee Video.', 'warning')
    return
  }
  state.librarySelectedKeys.clear()
  state.libraryLimit = 20
  state.librarySyncing = true
  renderLibrary()
  try {
    let startPage = 1
    let rounds = 0
    let totalSaved = 0
    let totalSavedPost = 0
    let totalSavedDraft = 0
    let totalPost = 0
    let totalScanned = 0
    let totalPostDraftSkipped = 0
    let totalDraftScanned = 0
    let totalDraft = 0
    let totalPages = 0
    let lastPostScan = {}
    let stoppedWithMore = false
    const warnings = []
    while (rounds < 40) {
      const listScope = startPage === 1 ? 'all' : 'post'
      setVideoProgressStatus({
        title: 'Đang tải lại thư viện Shopee',
        current: totalPost ? totalScanned : 0,
        total: totalPost,
        valueText: `Trang ${formatNumber(startPage)}-${formatNumber(startPage + 4)}`,
        message: `Đang quét trang ${formatNumber(startPage)}-${formatNumber(startPage + 4)}. Đã lưu/cập nhật ${formatNumber(totalSaved)} dòng.`,
        detail: totalPost ? `Đã quét khoảng ${formatNumber(totalScanned)}/${formatNumber(totalPost)} video đã đăng.` : 'Đang lấy tổng số video từ Shopee...',
        type: 'info'
      })
      const data = await fetchJson(`${API_BASE}/api/video/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: state.selectedShop,
          period_type: state.periodType,
          end_date: state.endDate,
          sync_all: 1,
          library_only: 1,
          list_scope: listScope,
          start_page: startPage,
          max_pages: 5
        })
      })
      const shopResult = data.shops?.[0] || {}
      const postScan = shopResult.library_scan?.post || {}
      const draftScan = shopResult.library_scan?.draft || {}
      totalSaved += numberValue(shopResult.saved_library)
      totalSavedPost += numberValue(shopResult.saved_post_library)
      totalSavedDraft += numberValue(shopResult.saved_draft_library)
      totalPost = Math.max(totalPost, numberValue(postScan.total_count))
      totalDraft = Math.max(totalDraft, numberValue(draftScan.total_count))
      totalScanned += numberValue(postScan.saved_rows || postScan.rows)
      totalPostDraftSkipped += numberValue(postScan.draft_rows_skipped)
      totalDraftScanned += numberValue(draftScan.rows)
      totalPages += numberValue(postScan.pages) + numberValue(draftScan.pages)
      lastPostScan = postScan
      // Backend báo partial cho mỗi cụm 5 trang; frontend đang quét tiếp nên chỉ giữ cảnh báo nghiệp vụ thật.
      warnings.push(...(Array.isArray(shopResult.warnings) ? shopResult.warnings : []).filter(warning => cleanText(warning?.stage) !== 'get_video_list_post_partial'))
      const activeWarnings = uniqueVideoWarnings(warnings)
      setVideoProgressStatus({
        title: 'Đang tải lại thư viện Shopee',
        current: totalPost ? Math.min(totalScanned, totalPost) : totalScanned,
        total: totalPost,
        valueText: `${formatNumber(totalScanned)} video`,
        message: `Đã quét xong trang ${formatNumber(startPage)}-${formatNumber(startPage + numberValue(postScan.pages || 1) - 1)}. Đã lưu/cập nhật ${formatNumber(totalSaved)} dòng.`,
        detail: `${totalPages ? `Đã gọi ${formatNumber(totalPages)} trang. ` : ''}Đã đăng thật: ${formatNumber(totalScanned)}${totalPost ? `/${formatNumber(Math.max(totalPost - totalPostDraftSkipped, 0))}` : ''}; nháp: ${formatNumber(totalDraftScanned)}${totalDraft ? `/${formatNumber(totalDraft)}` : ''}. ${postScan.has_more ? `Còn dữ liệu, tiếp tục từ trang ${formatNumber(postScan.next_page)}.` : 'Shopee báo đã hết trang video đã đăng.'}`,
        type: activeWarnings.length ? 'warning' : 'info'
      })
      if (!postScan.has_more || !postScan.next_page || postScan.next_page <= startPage) {
        stoppedWithMore = Boolean(postScan.has_more)
        break
      }
      startPage = numberValue(postScan.next_page)
      rounds += 1
    }
    await loadDashboard(false)
    if ((totalPost && totalScanned < totalPost) || stoppedWithMore || (rounds >= 40 && lastPostScan.has_more)) {
      warnings.push({ stage: 'get_video_list_post_incomplete', message: 'Chưa quét hết video đã đăng Shopee; bấm Tải lại toàn bộ Shopee để quét tiếp các trang cũ.' })
    }
    const finalWarnings = uniqueVideoWarnings(warnings)
    const displayTotalPost = totalPost ? Math.max(totalPost - totalPostDraftSkipped, 0) : 0
    const displayScanned = displayTotalPost ? Math.min(totalScanned, displayTotalPost) : totalScanned
    const warningText = finalWarnings.length
      ? ` Có ${formatNumber(finalWarnings.length)} cảnh báo: ${finalWarnings.slice(0, 2).map(w => cleanText(w.message || w.stage)).filter(Boolean).join('; ')}`
      : ''
    const saveDetailText = totalSavedPost || totalSavedDraft
      ? ` Lưu/cập nhật: ${formatNumber(totalSavedPost)} đã đăng, ${formatNumber(totalSavedDraft)} nháp.`
      : ` Lưu/cập nhật ${formatNumber(totalSaved)} dòng.`
    setStatus(`Đã tải lại thư viện Shopee và lưu trong tab Video đã đăng/Bản nháp. Đã quét ${formatNumber(displayScanned)}${displayTotalPost ? `/${formatNumber(displayTotalPost)}` : ''} video đã đăng thật, ${formatNumber(totalDraftScanned)}${totalDraft ? `/${formatNumber(totalDraft)}` : ''} bản nháp.${saveDetailText}${warningText}`, finalWarnings.length ? 'warning' : 'success')
  } catch (error) {
    setStatus(error.message, 'error')
  } finally {
    state.librarySyncing = false
    renderLibrary()
  }
}

async function submitBulkDeleteVideos() {
  const rows = selectedLibraryRows()
  if (!rows.length) {
    setStatus('Chưa chọn video nào để xóa.', 'warning')
    return
  }
  if (!selectedShopReady()) {
    setStatus(selectedShopGuide() || 'Shop này chưa đủ điều kiện xóa video bằng Shopee API.', 'warning')
    return
  }
  const confirmed = await confirmDeleteVideosByModal(rows, { title: 'Xác nhận xóa danh sách đã chọn' })
  if (!confirmed) return
  try {
    state.libraryDeleting = true
    renderLibrary()
    const data = await deleteVideoRowsInBatches(rows)
    state.librarySelectedKeys.clear()
    state.selectedVideoKey = ''
    state.detail = null
    state.editItems = []
    state.editCoverUrl = ''
    await loadDashboard(false)
    setStatus(`Đã xóa ${formatNumber(data.deleted)}/${formatNumber(rows.length)} video${data.failed ? `, lỗi ${formatNumber(data.failed)} video cần kiểm tra lại.` : '.'}`, data.failed ? 'warning' : 'success')
  } catch (error) {
    setStatus(error.message, 'error')
  } finally {
    state.libraryDeleting = false
    renderLibrary()
  }
}

async function submitPublishVideo() {
  if (state.publishMode === 'now') {
    await submitUploadVideo()
    return
  }
  if (!selectedShopReady()) return
  const file = document.getElementById('videoUploadFile')?.files?.[0]
  const scheduledAt = cleanText(document.getElementById('videoPublishAt')?.value)
  const confirmed = document.getElementById('videoPublishConfirm')?.checked
  if (!file) {
    setStatus('Vui lòng chọn file video trước khi tạo lịch.', 'warning')
    return
  }
  if (!validateUploadFormBeforeSubmit()) return
  if (!scheduledAt) {
    setStatus('Vui lòng chọn giờ đăng theo Việt Nam.', 'warning')
    return
  }
  if (!confirmed) {
    setStatus('Cần tick xác nhận đã kiểm tra preview trước khi tạo lịch upload.', 'warning')
    return
  }
  try {
    setStatus(`Đang tạo lịch upload video cho shop ${state.selectedShop}...`, 'info')
    const formData = new FormData()
    formData.set('shop', state.selectedShop)
    formData.set('file', file)
    formData.set('scheduled_at', scheduledAt)
    formData.set('duration_seconds', cleanText(document.getElementById('videoUploadDuration')?.value || '30'))
    formData.set('caption', cleanText(document.getElementById('videoUploadCaption')?.value || ''))
    formData.set('item_ids_json', JSON.stringify(state.uploadItems))
    formData.set('allow_duet', '1')
    formData.set('allow_stitch', '1')
    const response = await fetch(`${API_BASE}/api/video/upload-queue`, {
      method: 'POST',
      body: formData
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data?.status === 'error') {
      throw new Error(cleanText(data?.message || data?.error) || `Lỗi HTTP ${response.status}`)
    }
    state.uploadItems = []
    setStatus(data.message || 'Đã tạo lịch upload video.', 'success')
    renderUploadPanel()
    await loadUploadQueue()
  } catch (error) {
    setStatus(error.message, 'error')
  }
}

async function submitUploadVideo() {
  if (!selectedShopReady()) return
  const file = document.getElementById('videoUploadFile')?.files?.[0]
  if (!file) {
    setStatus('Vui lòng chọn file video trước khi tải lên.', 'warning')
    return
  }
  if (!validateUploadFormBeforeSubmit()) return
  try {
    setStatus(`Đang tải video mới lên Shopee cho shop ${state.selectedShop}...`, 'info')
    const formData = new FormData()
    formData.set('shop', state.selectedShop)
    formData.set('file', file)
    formData.set('duration_seconds', cleanText(document.getElementById('videoUploadDuration')?.value || '30'))
    formData.set('caption', cleanText(document.getElementById('videoUploadCaption')?.value || ''))
    formData.set('item_ids_json', JSON.stringify(state.uploadItems))
    const response = await fetch(`${API_BASE}/api/video/upload`, {
      method: 'POST',
      body: formData
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data?.status === 'error') {
      throw new Error(cleanText(data?.message || data?.error) || `Lỗi HTTP ${response.status}`)
    }
    state.uploadItems = []
    state.selectedVideoKey = cleanText(data.video_upload_id)
    setStatus('Đã tải và đăng video mới lên Shopee.', 'success')
    await loadDashboard(true)
    if (state.selectedVideoKey) await loadDetail(true)
  } catch (error) {
    setStatus(error.message, 'error')
  }
}

async function loadUploadQueue() {
  if (!state.selectedShop) return
  try {
    const data = await fetchJson(`${API_BASE}/api/video/upload-queue?platform=shopee&shop=${encodeURIComponent(state.selectedShop)}&limit=40`)
    state.uploadQueue = Array.isArray(data.rows) ? data.rows : []
    renderQueueList()
  } catch (error) {
    setStatus(error.message, 'error')
  }
}

function readMultiCampaignMeta() {
  const file = document.getElementById('videoMultiShopFile')?.files?.[0] || state.multiShopFile
  const campaignKey = cleanText(document.getElementById('videoCampaignKey')?.value || state.multiCampaignKey || newCampaignVideoKey(file?.name || ''))
  const campaignName = cleanText(document.getElementById('videoCampaignName')?.value || state.multiCampaignName || campaignKey)
  const defaultScheduledAt = cleanText(document.getElementById('videoMultiDefaultAt')?.value || state.multiDefaultScheduledAt || multiShopDefaultAt())
  const durationSeconds = Math.round(numberValue(document.getElementById('videoMultiDuration')?.value || state.multiShopFileMeta?.durationSeconds || 0))
  state.multiCampaignKey = campaignKey
  state.multiCampaignName = campaignName
  state.multiDefaultScheduledAt = defaultScheduledAt
  return { file, campaignKey, campaignName, defaultScheduledAt, durationSeconds }
}

function validateMultiCampaignMeta(requireFile = false) {
  const meta = readMultiCampaignMeta()
  if (requireFile && !meta.file) {
    setStatus('Chưa chọn file video gốc cho chiến dịch đa shop.', 'warning')
    return null
  }
  if (requireFile && state.multiShopFileMetaError) {
    setStatus('Chưa đọc được thời lượng thật từ file video gốc, nên hệ thống chưa cho tạo chiến dịch để tránh video vượt giới hạn Shopee.', 'warning')
    return null
  }
  if (requireFile && !state.multiShopFileMeta?.durationSeconds) {
    setStatus('Chưa đọc được thời lượng thật từ file video gốc, nên hệ thống chưa cho tạo chiến dịch để tránh video vượt giới hạn Shopee.', 'warning')
    return null
  }
  if (meta.durationSeconds < SHOPEE_VIDEO_LIMITS.minDurationSeconds || meta.durationSeconds > SHOPEE_VIDEO_LIMITS.maxDurationSeconds) {
    setStatus(`Thời lượng video phải nằm trong khoảng ${SHOPEE_VIDEO_LIMITS.minDurationSeconds}-${SHOPEE_VIDEO_LIMITS.maxDurationSeconds} giây.`, 'warning')
    return null
  }
  if (requireFile && state.multiShopFileMeta?.durationSeconds && state.multiShopFileMeta.durationSeconds !== meta.durationSeconds) {
    setStatus('Thời lượng đang lệch với metadata file gốc. Hãy để hệ thống dùng thời lượng thật trước khi tạo chiến dịch.', 'warning')
    return null
  }
  const rows = multiShopPayloadRows()
  if (!rows.some(row => row.enabled)) {
    setStatus('Chưa chọn shop nào trong chiến dịch đa shop.', 'warning')
    return null
  }
  return { ...meta, rows }
}

async function previewMultiShopCampaign() {
  const meta = validateMultiCampaignMeta(false)
  if (!meta) return
  try {
    state.multiShopLoading = true
    setStatus('Đang kiểm tra chiến dịch video đa shop...', 'info')
    const data = await fetchJson(`${API_BASE}/api/video/multi-shop/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign_video_key: meta.campaignKey,
        campaign_name: meta.campaignName,
        file_name: meta.file?.name || meta.campaignKey,
        duration_seconds: meta.durationSeconds,
        default_scheduled_at: meta.defaultScheduledAt,
        shop_configs: meta.rows
      })
    })
    state.multiShopPreview = data
    state.multiShopRows = meta.rows.map(row => ({
      ...row,
      caption: cleanText((data.rows || []).find(previewRow => cleanText(previewRow.shop) === cleanText(row.shop))?.caption || row.caption),
      item_ids: row.item_ids,
      item_rows: parseMultiShopItemRows(row.item_ids, row.items),
      scheduled_at: row.scheduled_at || meta.defaultScheduledAt
    }))
    renderMultiShopPanel()
    setStatus(`Đã kiểm tra chiến dịch: ${formatNumber(data.summary?.ready || 0)} shop tạo lịch API, ${formatNumber(data.summary?.manual_upload || 0)} shop cần Chrome local.`, 'success')
  } catch (error) {
    setStatus(error.message, 'error')
  } finally {
    state.multiShopLoading = false
  }
}

async function queueMultiShopCampaign() {
  const meta = validateMultiCampaignMeta(true)
  if (!meta) return
  await previewMultiShopCampaign()
  const readyCount = numberValue(state.multiShopPreview?.summary?.ready)
  const manualCount = numberValue(state.multiShopPreview?.summary?.manual_upload)
  if (!readyCount && !manualCount) {
    setStatus('Chưa có shop nào đủ điều kiện tạo lịch API hoặc job Chrome local. Hãy xử lý tiêu đề, sản phẩm và cảnh báo trùng video trước.', 'warning')
    return
  }
  if (!window.confirm(`Tạo chiến dịch video cho ${formatNumber(readyCount)} shop API và ${formatNumber(manualCount)} shop Chrome local?`)) return
  // Mở sẵn tab rỗng từ chính thao tác bấm nút để Chrome không chặn popup khi upload file xong mới có queue_id.
  let helperPopup = null
  if (manualCount && isProductionFrontend()) {
    helperPopup = window.open('', '_blank')
    if (helperPopup) {
      helperPopup.document.write('<meta charset="utf-8"><title>Đang mở Chrome local</title><p>Đang tạo job video, vui lòng chờ vài giây...</p>')
    }
  }
  try {
    setStatus('Đang lưu file gốc vào R2, tạo queue cho shop API và tạo job Chrome local cho shop chưa API...', 'info')
    const formData = new FormData()
    formData.set('file', meta.file)
    formData.set('campaign_video_key', meta.campaignKey)
    formData.set('campaign_name', meta.campaignName)
    formData.set('duration_seconds', String(meta.durationSeconds))
    formData.set('default_scheduled_at', meta.defaultScheduledAt)
    formData.set('shop_configs_json', JSON.stringify(meta.rows))
    const response = await fetch(`${API_BASE}/api/video/multi-shop/queue`, {
      method: 'POST',
      body: formData
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.status === 'error') throw new Error(cleanText(data.message || data.error) || `Lỗi HTTP ${response.status}`)
    state.multiShopPreview = data.preview || state.multiShopPreview
    setStatus(data.message || 'Đã tạo lịch đăng video đa shop.', 'success')
    renderMultiShopPanel()
    await loadUploadQueue()
    const firstManualRow = Array.isArray(data.manual_rows) ? data.manual_rows.find(row => cleanText(row.queue_id)) : null
    if (firstManualRow?.queue_id) {
      await openBrowserVideoUpload(firstManualRow.queue_id, helperPopup)
    } else if (helperPopup && !helperPopup.closed) {
      helperPopup.close()
    }
  } catch (error) {
    if (helperPopup && !helperPopup.closed) helperPopup.close()
    setStatus(error.message, 'error')
  }
}

async function suggestMultiShopTitle(shopName) {
  const rows = multiShopPayloadRows()
  const row = rows.find(item => cleanText(item.shop) === cleanText(shopName))
  if (!row) return
  try {
    setStatus(`Đang dùng AI viết tiêu đề cho shop ${shopName}...`, 'info')
    const data = await fetchJson(`${API_BASE}/api/video/title-suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: shopName,
        caption: row.caption || cleanText(document.getElementById('videoCampaignName')?.value),
        max_chars: SHOPEE_VIDEO_LIMITS.titleMaxChars,
        items: row.items
      })
    })
    const title = cleanText(data.suggestions?.[0])
    if (!title) {
      setStatus('AI chưa tạo được tiêu đề phù hợp cho shop này.', 'warning')
      return
    }
    const node = document.querySelector(`[data-multi-shop-row][data-shop="${CSS.escape(shopName)}"] [data-multi-field="caption"]`)
    if (node) node.value = title
    readMultiShopRowsFromDom()
    setStatus(`Đã đưa gợi ý AI vào tiêu đề của shop ${shopName}.`, 'success')
  } catch (error) {
    setStatus(error.message, 'error')
  }
}

async function submitScheduleVideo() {
  if (!selectedShopReady()) return
  const file = document.getElementById('videoScheduleFile')?.files?.[0]
  const scheduledAt = cleanText(document.getElementById('videoScheduleAt')?.value)
  const confirmed = document.getElementById('videoScheduleConfirm')?.checked
  if (!file) {
    setStatus('Vui lòng chọn file video trước khi tạo lịch.', 'warning')
    return
  }
  if (!scheduledAt) {
    setStatus('Vui lòng chọn giờ đăng theo Việt Nam.', 'warning')
    return
  }
  if (!confirmed) {
    setStatus('Cần tick xác nhận đã kiểm tra preview trước khi tạo lịch upload.', 'warning')
    return
  }
  try {
    setStatus(`Đang tạo lịch upload video cho shop ${state.selectedShop}...`, 'info')
    const formData = new FormData()
    formData.set('shop', state.selectedShop)
    formData.set('file', file)
    formData.set('scheduled_at', scheduledAt)
    formData.set('duration_seconds', cleanText(document.getElementById('videoScheduleDuration')?.value || '30'))
    formData.set('caption', cleanText(document.getElementById('videoScheduleCaption')?.value || ''))
    formData.set('item_ids_json', JSON.stringify(state.scheduleItems))
    formData.set('allow_duet', '1')
    formData.set('allow_stitch', '1')
    const response = await fetch(`${API_BASE}/api/video/upload-queue`, {
      method: 'POST',
      body: formData
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data?.status === 'error') {
      throw new Error(cleanText(data?.message || data?.error) || `Lỗi HTTP ${response.status}`)
    }
    state.scheduleItems = []
    setStatus(data.message || 'Đã tạo lịch upload video.', 'success')
    renderAutomationPanel()
    await loadUploadQueue()
  } catch (error) {
    setStatus(error.message, 'error')
  }
}

async function dryRunUploadQueue() {
  if (!state.selectedShop) return
  try {
    const data = await fetchJson(`${API_BASE}/api/video/upload-queue/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dry_run: 1,
        shop: state.selectedShop,
        limit: 20
      })
    })
    setStatus(`Kiểm tra an toàn: có ${formatNumber(data.selected_jobs || 0)} job đã đến hạn cho shop ${state.selectedShop}. Chưa đăng thật.`, 'success')
  } catch (error) {
    setStatus(error.message, 'error')
  }
}

async function cancelUploadQueue(queueId) {
  const id = cleanText(queueId)
  if (!id) return
  if (!window.confirm(`Hủy lịch upload video ${id}?`)) return
  try {
    await fetchJson(`${API_BASE}/api/video/upload-queue/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queue_id: id,
        reason: 'Người vận hành hủy từ dashboard video'
      })
    })
    setStatus('Đã hủy lịch upload video.', 'success')
    await loadUploadQueue()
  } catch (error) {
    setStatus(error.message, 'error')
  }
}

function isProductionFrontend() {
  return window.location.protocol === 'https:' && window.location.hostname === 'shophuyvan-analytics.nghiemchihuy.workers.dev'
}

function buildVideoUploadHelperUrl(queueId, row) {
  return `${VIDEO_LOCAL_HELPER_URL}/video-upload-preview?queue_id=${encodeURIComponent(queueId)}&shop=${encodeURIComponent(row.shop)}&api=${encodeURIComponent(API_BASE)}`
}

async function openBrowserVideoUpload(queueId, helperPopup = null) {
  const id = cleanText(queueId)
  const row = state.uploadQueue.find(item => cleanText(item.queue_id) === id)
  if (!id || !row) return false
  const helperUrl = buildVideoUploadHelperUrl(id, row)
  if (isProductionFrontend()) {
    if (helperPopup && !helperPopup.closed) {
      helperPopup.location.href = helperUrl
    } else {
      window.open(helperUrl, '_blank', 'noopener')
    }
    setStatus('Đã mở tab helper local để chạy job Chrome. Nếu Shopee yêu cầu đăng nhập, hãy đăng nhập trong cửa sổ Chrome vừa mở rồi bấm lại Mở Chrome.', 'warning')
    setTimeout(loadUploadQueue, 12000)
    return true
  }
  await callVideoLocalHelper(id, row)
  return true
}

async function callVideoLocalHelper(queueId, row) {
  const data = await videoLocalHelperFetch('/video-upload-preview', {
    queue_id: queueId,
    platform: 'shopee',
    shop: row.shop,
    api: API_BASE,
    file_name: row.file_name,
    caption: row.caption,
    item_rows: Array.isArray(row.item_rows) ? row.item_rows : [],
    scheduled_at: row.scheduled_at,
    process_timeout: 420
  })
  const result = data.result || data
  const message = cleanText(result.message || data.message)
  const tone = cleanText(result.status) === 'browser_preview_ready' ? 'success' : 'warning'
  setStatus(message || 'Đã mở Chrome local và dừng ở màn preview. Kiểm tra rồi tự bấm đăng trên Seller Center.', tone)
  await loadUploadQueue()
}

async function startBrowserVideoUpload(queueId) {
  const id = cleanText(queueId)
  if (!id) return
  const row = state.uploadQueue.find(item => cleanText(item.queue_id) === id)
  if (!row) {
    setStatus('Không tìm thấy job Chrome local trong log hiện tại.', 'warning')
    return
  }
  const helperUrl = buildVideoUploadHelperUrl(id, row)
  try {
    setStatus(`Đang gọi helper local mở Shopee Creator Center cho shop ${row.shop}...`, 'info')
    await openBrowserVideoUpload(id)
  } catch (error) {
    if (/failed to fetch|load failed|network/i.test(cleanText(error.message))) {
      window.open(helperUrl, '_blank', 'noopener')
      setStatus('Chrome đang chặn gọi helper local bằng fetch. Hệ thống đã mở tab helper local để chạy job; chờ vài giây rồi bấm Làm mới log.', 'warning')
      setTimeout(loadUploadQueue, 12000)
      return
    }
    setStatus(`Không mở được Chrome local: ${cleanText(error.message)}. Có thể mở trực tiếp: ${helperUrl}`, 'error')
  }
}

async function markBrowserVideoPosted(queueId) {
  const id = cleanText(queueId)
  if (!id) return
  if (!window.confirm(`Đánh dấu job ${id} là đã đăng tay trên Shopee?`)) return
  try {
    await fetchJson(`${API_BASE}/api/video/upload-queue/browser-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queue_id: id,
        status: 'browser_posted',
        message: 'Người vận hành xác nhận đã bấm đăng tay trên Seller Center.',
        result_payload: {
          operator_confirmed_posted: 1
        }
      })
    })
    setStatus('Đã đánh dấu video đã đăng tay cho shop chưa API.', 'success')
    await loadUploadQueue()
  } catch (error) {
    setStatus(error.message, 'error')
  }
}

// Kho video đóng gói là nguồn tham chiếu chung cho shop không có API video.
