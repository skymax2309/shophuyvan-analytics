function multiShopPreviewRow(shop) {
  return (state.multiShopPreview?.rows || []).find(row => cleanText(row.shop) === cleanText(shop)) || null
}

function renderMultiShopSummary() {
  const summary = state.multiShopPreview?.summary || {}
  return `
    <div class="video-mini-grid">
      <span class="video-mini-pill success">Đủ điều kiện: ${formatNumber(summary.ready || 0)}</span>
      <span class="video-mini-pill warning">Chrome local: ${formatNumber(summary.manual_upload || 0)}</span>
      <span class="video-mini-pill warning">Job Chrome: ${formatNumber(summary.browser_upload || 0)}</span>
      <span class="video-mini-pill warning">Chờ lịch: ${formatNumber(summary.queued || 0)}</span>
      <span class="video-mini-pill success">Đã đăng: ${formatNumber(summary.posted || 0)}</span>
      <span class="video-mini-pill warning">Gần giống: ${formatNumber(summary.similar_video || 0)}</span>
      <span class="video-mini-pill danger">Thiếu API: ${formatNumber(summary.missing_api || 0)}</span>
      <span class="video-mini-pill danger">Lỗi: ${formatNumber(summary.error || 0)}</span>
    </div>
  `
}

function multiShopManualCopyText(row = {}, preview = null) {
  const itemIds = cleanText(row.item_ids || preview?.item_rows?.map(item => item.item_id).join(', '))
  return [
    `Shop: ${cleanText(row.shop || preview?.shop)}`,
    `Chiến dịch: ${cleanText(state.multiCampaignName || state.multiCampaignKey || preview?.campaign_name)}`,
    `Tiêu đề: ${ensureRequiredVideoHashtag(cleanText(preview?.caption || row.caption))}`,
    `Hashtag: ${cleanText(row.hashtags || VIDEO_REQUIRED_HASHTAG)}`,
    `Sản phẩm gắn kèm: ${itemIds || 'Chưa nhập'}`,
    `Giờ đăng: ${cleanText(row.scheduled_at || preview?.scheduled_at) || 'Đăng tay khi mở Seller Center'}`,
    `Link đăng tay: ${SHOPEE_CREATOR_CENTER_VIDEO_UPLOAD_URL}`
  ].join('\n')
}

async function copyTextToClipboard(text, successMessage) {
  const finalText = cleanText(text)
  if (!finalText) return
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(finalText)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = finalText
      textarea.setAttribute('readonly', 'readonly')
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
    setStatus(successMessage || 'Đã copy nội dung.', 'success')
  } catch (error) {
    setStatus(`Không copy được nội dung. Chi tiết: ${cleanText(error.message)}`, 'error')
  }
}

function renderMultiShopPanel() {
  const node = document.getElementById('videoMultiShopPanel')
  if (!node) return
  ensureMultiShopRows()
  const rows = state.multiShopRows
  if (!rows.length) {
    node.innerHTML = `<div class="video-empty"><strong>Chưa có shop Shopee nào để tạo chiến dịch đa shop.</strong></div>`
    return
  }
  const campaignKey = cleanText(state.multiCampaignKey) || newCampaignVideoKey()
  const defaultAt = cleanText(state.multiDefaultScheduledAt) || multiShopDefaultAt()
  const fileStatus = state.multiShopFileMetaError
    ? state.multiShopFileMetaError
    : state.multiShopFile
      ? `${state.multiShopFile.name} · ${formatFileSize(state.multiShopFile.size)}${state.multiShopFileMeta?.durationSeconds ? ` · File hợp lệ: ${formatDurationSeconds(state.multiShopFileMeta.durationSeconds)}` : ''}`
      : 'Chọn file để hệ thống đọc thời lượng trước khi tạo nhiều job.'
  const fileStatusTone = state.multiShopFileMetaError ? 'warning' : (state.multiShopFile ? 'success' : 'info')
  node.innerHTML = `
    <div class="video-compact-table video-automation-note">
      <div class="video-compact-title">Luồng đăng video đa shop</div>
      <div class="video-compact-row"><span>File gốc</span><strong>Lưu R2 một lần. Shop có API tạo queue API, shop chưa API tạo job Chrome local.</strong></div>
      <div class="video-compact-row"><span>Tiêu đề</span><strong>Mỗi shop có tiêu đề/hashtag/sản phẩm/giờ đăng riêng, luôn giữ ${VIDEO_REQUIRED_HASHTAG}.</strong></div>
      <div class="video-compact-row"><span>Guard</span><strong>Kiểm API video, thời lượng, sản phẩm trong catalog, trùng video và queue đang chờ.</strong></div>
      <div class="video-compact-row"><span>Shop chưa API</span><strong>Tạo job Chrome local: tự mở Creator Center, upload file, điền tiêu đề rồi dừng ở preview.</strong></div>
      <div class="video-compact-row"><span>Tổng quan</span>${renderMultiShopSummary()}</div>
    </div>

    <section class="video-form-table video-multi-campaign-form">
      <div class="video-form-row wide">
        <div>
          <strong>Chiến dịch</strong>
          <span>Mã nhóm dùng để biết shop nào đã có, thiếu hoặc đang chờ đăng cùng một video gốc.</span>
        </div>
        <div class="video-form-grid two">
          <div class="video-field">
            <label for="videoCampaignName">Tên chiến dịch</label>
            <input id="videoCampaignName" type="text" value="${escapeHtml(cleanText(state.multiCampaignName))}" placeholder="Ví dụ: Chốt cửa inox 08/05">
          </div>
          <div class="video-field">
            <label for="videoCampaignKey">Campaign video key</label>
            <input id="videoCampaignKey" type="text" value="${escapeHtml(campaignKey)}" placeholder="vcmp_chot-cua-inox">
          </div>
        </div>
      </div>
      <div class="video-form-row wide">
        <div>
          <strong>File video gốc</strong>
          <span>Chọn một file; backend chỉ lưu file này một lần vào R2 khi tạo lịch.</span>
        </div>
        <div class="video-field">
          <label for="videoMultiShopFile">Chọn file</label>
          <input id="videoMultiShopFile" type="file" accept="video/mp4,video/webm,video/quicktime">
          <div id="videoMultiShopFileStatus" class="video-field-note ${fileStatusTone}">${escapeHtml(fileStatus)}</div>
        </div>
      </div>
      <div class="video-form-row">
        <div>
          <strong>Giờ đăng mặc định</strong>
          <span>Có thể áp dụng cùng giờ cho tất cả shop rồi sửa từng dòng nếu cần.</span>
        </div>
        <div class="video-title-input-row">
          <input id="videoMultiDefaultAt" type="datetime-local" value="${escapeHtml(defaultAt)}">
          <button class="video-btn secondary" type="button" data-action="apply-multi-default-time">Áp dụng tất cả</button>
        </div>
      </div>
      <div class="video-form-row">
        <div>
          <strong>Thời lượng</strong>
          <span>Giới hạn Shopee Video đang dùng: ${SHOPEE_VIDEO_LIMITS.minDurationSeconds}-${SHOPEE_VIDEO_LIMITS.maxDurationSeconds} giây.</span>
        </div>
        <div class="video-field">
          <label for="videoMultiDuration">Thời lượng video (giây)</label>
          <input id="videoMultiDuration" type="number" min="${SHOPEE_VIDEO_LIMITS.minDurationSeconds}" max="${SHOPEE_VIDEO_LIMITS.maxDurationSeconds}" value="${escapeHtml(cleanText(state.multiShopFileMeta?.durationSeconds || 30))}">
        </div>
      </div>
    </section>

    <section class="video-multi-shop-list">
      ${rows.map(row => {
        const preview = multiShopPreviewRow(row.shop)
        const statusTone = cleanText(preview?.status_tone || (row.video_ready ? 'success' : 'danger'))
        const statusLabel = cleanText(preview?.status_label || (row.video_ready ? 'Chưa kiểm tra' : 'Thiếu API video'))
        const duplicate = preview?.duplicate
        const manualStatuses = ['manual_upload', 'browser_upload_required', 'browser_opening', 'browser_uploading', 'browser_preview_ready', 'browser_login_required', 'browser_error']
        const isManual = manualStatuses.includes(cleanText(preview?.status_code))
        const manualText = multiShopManualCopyText(row, preview)
        return `
          <article class="video-multi-shop-row" data-multi-shop-row data-shop="${escapeHtml(row.shop)}">
            <div class="video-multi-shop-head">
              <label class="video-toggle">
                <input data-multi-field="enabled" type="checkbox" ${row.enabled ? 'checked' : ''}>
                <strong>${escapeHtml(row.shop)}</strong>
              </label>
              <span class="video-pill ${escapeHtml(statusTone)}">${escapeHtml(statusLabel)}</span>
            </div>
            <div class="video-form-grid two">
              <div class="video-field">
                <label>Tiêu đề riêng</label>
                <div class="video-title-input-row">
                  <input data-multi-field="caption" type="text" maxlength="${SHOPEE_VIDEO_LIMITS.titleMaxChars}" value="${escapeHtml(cleanText(row.caption))}" placeholder="Tiêu đề riêng cho shop này">
                  <button class="video-btn secondary" type="button" data-action="suggest-multi-shop-title" data-shop="${escapeHtml(row.shop)}">AI</button>
                </div>
              </div>
              <div class="video-field">
                <label>Hashtag riêng</label>
                <input data-multi-field="hashtags" type="text" value="${escapeHtml(cleanText(row.hashtags || VIDEO_REQUIRED_HASHTAG))}" placeholder="#shophuyvan #tenSanPham">
              </div>
              ${renderMultiShopProductPicker(row, preview)}
              <div class="video-field">
                <label>Giờ đăng</label>
                <input data-multi-field="scheduled_at" type="datetime-local" value="${escapeHtml(cleanText(row.scheduled_at || defaultAt))}">
              </div>
            </div>
            <div class="video-multi-shop-foot">
              <label class="video-toggle">
                <input data-multi-field="allow_duplicate" type="checkbox" ${row.allow_duplicate ? 'checked' : ''}>
                Vẫn cho tạo lịch nếu đã kiểm tra video gần giống.
              </label>
              <span>${duplicate ? `Video gần nhất giống ${formatNumber(duplicate.duplicate_score)}%: ${escapeHtml(truncateDisplayText(duplicate.caption || duplicate.video_upload_id, 72))}` : (preview ? escapeHtml(cleanText(preview.api_message)) : 'Bấm Kiểm tra chiến dịch trước khi tạo lịch.')}</span>
            </div>
            ${isManual ? `
              <div class="video-manual-actions">
                <strong>Shop chưa có API: dùng Chrome local, có log.</strong>
                <span>Sau khi tạo job, mở log của shop này và bấm Mở Chrome preview. Hệ thống sẽ upload file rồi dừng lại để kiểm tra trước khi tự xác nhận đăng.</span>
                <div class="video-actions-row">
                  <button class="video-btn secondary" type="button" data-action="copy-multi-manual" data-manual-text="${escapeHtml(manualText)}">Copy nội dung đăng</button>
                  <a class="video-link-btn" href="${SHOPEE_CREATOR_CENTER_VIDEO_UPLOAD_URL}" target="_blank" rel="noopener">Mở Creator Center</a>
                </div>
              </div>
            ` : ''}
          </article>
        `
      }).join('')}
    </section>

    <div class="video-actions-row video-multi-actions">
      <button class="video-btn secondary" type="button" id="videoMultiPreviewBtn">Kiểm tra chiến dịch</button>
      <button class="video-btn" type="button" id="videoMultiQueueBtn">Tạo lịch API / job Chrome</button>
      <button class="video-btn secondary" type="button" id="videoQueueRefreshBtn">Làm mới log shop đang chọn</button>
    </div>
    <section class="video-queue-section">
      <div class="video-panel-head">
        <div>
          <h3>Log lịch upload của shop đang chọn</h3>
          <p class="video-panel-help">Chiến dịch đa shop tạo queue riêng cho từng shop; log bên dưới vẫn khóa theo shop đang chọn để tránh nhầm.</p>
        </div>
      </div>
      <div id="videoQueueList" class="video-queue-list"></div>
    </section>
  `
  renderQueueList()
  document.getElementById('videoMultiShopFile')?.addEventListener('change', handleMultiShopFileChange)
  document.getElementById('videoMultiPreviewBtn')?.addEventListener('click', previewMultiShopCampaign)
  document.getElementById('videoMultiQueueBtn')?.addEventListener('click', queueMultiShopCampaign)
  document.getElementById('videoQueueRefreshBtn')?.addEventListener('click', loadUploadQueue)
  document.getElementById('videoCampaignKey')?.addEventListener('input', event => { state.multiCampaignKey = cleanText(event.target.value) })
  document.getElementById('videoCampaignName')?.addEventListener('input', event => { state.multiCampaignName = cleanText(event.target.value) })
  document.getElementById('videoMultiDefaultAt')?.addEventListener('input', event => { state.multiDefaultScheduledAt = cleanText(event.target.value) })
  document.querySelectorAll('[data-multi-field="product_search"]').forEach(input => {
    input.addEventListener('input', event => {
      const search = multiShopProductSearchState(event.target.dataset.shop)
      search.query = cleanText(event.target.value)
      search.error = ''
    })
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      searchMultiShopProduct(event.target.dataset.shop)
    })
  })
}

function renderAutomationPanel() {
  const node = document.getElementById('videoAutomationPanel')
  if (!node) return
  if (!state.selectedShop) {
    node.innerHTML = `<div class="video-empty"><strong>Chọn shop Shopee để tạo lịch upload video.</strong></div>`
    return
  }
  if (!selectedShopReady()) {
    node.innerHTML = `
      <div class="video-status-box warning">
        ${escapeHtml(selectedShopGuide() || 'Shop này chưa đủ điều kiện gọi Shopee Video API.')}
      </div>
    `
    return
  }
  node.innerHTML = `
    <div class="video-compact-table video-automation-note">
      <div class="video-compact-title">Quy trình upload theo giờ</div>
      <div class="video-compact-row"><span>Shop đang thao tác</span><strong>${escapeHtml(state.selectedShop)}</strong></div>
      <div class="video-compact-row"><span>Lưu file</span><strong>R2, tách theo từng shop</strong></div>
      <div class="video-compact-row"><span>Chạy tự động</span><strong>Cron 5 phút kiểm tra job đến giờ</strong></div>
      <div class="video-compact-row"><span>Điều kiện an toàn</span><strong>Phải xem preview và tick xác nhận</strong></div>
      <div class="video-compact-row"><span>Trạng thái queue</span><div id="videoQueueSummary" class="video-mini-grid"></div></div>
    </div>

    <section class="video-form-table video-queue-form">
      <div class="video-form-row wide">
        <div>
          <strong>File video</strong>
          <span>Video giữ trong R2 đến khi cron đăng theo lịch, không dùng chung giữa các shop.</span>
        </div>
        <div class="video-field">
          <label for="videoScheduleFile">Chọn file</label>
          <input id="videoScheduleFile" type="file" accept="video/mp4,video/webm,video/quicktime">
        </div>
      </div>
      <div class="video-form-row">
        <div>
          <strong>Giờ đăng</strong>
          <span>Theo múi giờ Việt Nam, sau hiện tại ít nhất 5 phút.</span>
        </div>
        <div class="video-field">
          <label for="videoScheduleAt">Giờ đăng theo Việt Nam</label>
          <input id="videoScheduleAt" type="datetime-local" value="${defaultScheduleDateTimeLocal(30)}">
        </div>
      </div>
      <div class="video-form-row">
        <div>
          <strong>Thời lượng</strong>
          <span>Dùng để gửi metadata cho API upload.</span>
        </div>
        <div class="video-field">
          <label for="videoScheduleDuration">Thời lượng video (giây)</label>
          <input id="videoScheduleDuration" type="number" min="1" max="180" value="30">
        </div>
      </div>
      <div class="video-form-row wide">
        <div>
          <strong>Caption</strong>
          <span>Nội dung sẽ đăng lên Shopee khi đến giờ.</span>
        </div>
        <div class="video-field">
          <label for="videoScheduleCaption">Caption / mô tả</label>
          <input id="videoScheduleCaption" type="text" placeholder="Nhập caption sẽ đăng lên Shopee">
        </div>
      </div>
      <div class="video-form-row wide">
        <div>
          <strong>Gắn sản phẩm</strong>
          <span>Tìm item trong catalog snapshot của shop đang chọn.</span>
        </div>
        <div class="video-field">
          <label for="videoScheduleSearch">Tìm sản phẩm</label>
          <input id="videoScheduleSearch" type="text" placeholder="Tìm item theo tên, SKU hoặc item ID">
        </div>
      </div>
      <div class="video-form-row wide">
        <div>
          <strong>Kết quả tìm</strong>
          <span>Bấm Thêm để đưa sản phẩm vào lịch đăng.</span>
        </div>
        <div id="videoScheduleSearchResults" class="video-search-results"></div>
      </div>
      <div class="video-form-row wide">
        <div>
          <strong>Sản phẩm sẽ gắn</strong>
          <span>Danh sách gửi cùng payload upload khi đến giờ.</span>
        </div>
        <div id="videoScheduleSelectedItems" class="video-selected-items"></div>
      </div>
      <div class="video-form-row wide">
        <div>
          <strong>Preview</strong>
          <span>Kiểm tra đúng shop, file, caption và giờ trước khi tạo lịch.</span>
        </div>
        <div>
          <div id="videoSchedulePreview" class="video-schedule-preview"></div>
          <label class="video-toggle video-confirm-row">
            <input id="videoScheduleConfirm" type="checkbox">
            Tôi đã kiểm tra đúng shop, file, caption và giờ đăng.
          </label>
        </div>
      </div>
      <div class="video-form-row action">
        <div>
          <strong>Thao tác</strong>
          <span>Log chỉ đọc queue của shop đang chọn, không nhảy sang shop khác.</span>
        </div>
        <div class="video-actions-row">
          <button class="video-btn" type="button" id="videoScheduleCreateBtn">Tạo lịch upload</button>
          <button class="video-btn secondary" type="button" id="videoQueueRefreshBtn">Làm mới log</button>
          <button class="video-btn warning" type="button" id="videoQueueDryRunBtn">Kiểm tra job đến hạn</button>
        </div>
      </div>
    </section>

    <section class="video-queue-section">
      <div class="video-panel-head">
        <div>
          <h3>Log lịch upload</h3>
          <p class="video-panel-help">Dạng bảng để nhìn nhanh giờ đăng, file, trạng thái và lỗi nếu có.</p>
        </div>
      </div>
      <div id="videoQueueList" class="video-queue-list"></div>
    </section>
  `
  renderSelectedItems('videoScheduleSelectedItems', state.scheduleItems, 'schedule')
  renderSchedulePreview()
  renderQueueList()
  document.getElementById('videoScheduleSearch')?.addEventListener('input', onScheduleSearchInput)
  document.getElementById('videoScheduleFile')?.addEventListener('change', renderSchedulePreview)
  document.getElementById('videoScheduleAt')?.addEventListener('input', renderSchedulePreview)
  document.getElementById('videoScheduleDuration')?.addEventListener('input', renderSchedulePreview)
  document.getElementById('videoScheduleCaption')?.addEventListener('input', renderSchedulePreview)
  document.getElementById('videoScheduleCreateBtn')?.addEventListener('click', submitScheduleVideo)
  document.getElementById('videoQueueRefreshBtn')?.addEventListener('click', loadUploadQueue)
  document.getElementById('videoQueueDryRunBtn')?.addEventListener('click', dryRunUploadQueue)
}

function renderSchedulePreview() {
  const node = document.getElementById('videoSchedulePreview')
  if (!node) return
  const file = document.getElementById('videoScheduleFile')?.files?.[0]
  const scheduledAt = cleanText(document.getElementById('videoScheduleAt')?.value)
  const duration = cleanText(document.getElementById('videoScheduleDuration')?.value || '30')
  const caption = cleanText(document.getElementById('videoScheduleCaption')?.value)
  node.innerHTML = `
    <div class="video-detail-table preview">
      <div class="video-detail-row"><span>Shop</span><strong>${escapeHtml(state.selectedShop || 'Chưa chọn shop')}</strong></div>
      <div class="video-detail-row"><span>File</span><strong>${escapeHtml(file ? `${file.name} · ${formatFileSize(file.size)}` : 'Chưa chọn file')}</strong></div>
      <div class="video-detail-row"><span>Giờ đăng</span><strong>${escapeHtml(scheduledAt ? scheduledAt.replace('T', ' ') : 'Chưa chọn')}</strong></div>
      <div class="video-detail-row"><span>Thời lượng</span><strong>${escapeHtml(duration)} giây</strong></div>
      <div class="video-detail-row"><span>Caption</span><strong>${escapeHtml(caption || 'Chưa nhập')}</strong></div>
      <div class="video-detail-row"><span>Sản phẩm</span><strong>${formatNumber(state.scheduleItems.length)}</strong></div>
    </div>
  `
}

function renderPublishPreview() {
  const node = document.getElementById('videoPublishPreview')
  if (!node) return
  const file = document.getElementById('videoUploadFile')?.files?.[0]
  const publishAt = cleanText(document.getElementById('videoPublishAt')?.value)
  const duration = cleanText(document.getElementById('videoUploadDuration')?.value || '30')
  const caption = cleanText(document.getElementById('videoUploadCaption')?.value)
  const modeLabel = state.publishMode === 'now' ? 'Đăng ngay' : 'Hẹn giờ'
  const duplicate = topDuplicateCandidate()
  const duplicateLabel = duplicateScoreLabel(numberValue(duplicate?.duplicate_score))
  const fileText = file
    ? `${file.name} · ${formatFileSize(file.size)}${state.uploadFileMeta?.durationSeconds ? ` · ${formatDurationSeconds(state.uploadFileMeta.durationSeconds)}` : ''}`
    : 'Chưa chọn file'
  node.innerHTML = `
    <div class="video-detail-table preview">
      <div class="video-detail-row"><span>Chế độ</span><strong>${escapeHtml(modeLabel)}</strong></div>
      <div class="video-detail-row"><span>Shop</span><strong>${escapeHtml(state.selectedShop || 'Chưa chọn shop')}</strong></div>
      <div class="video-detail-row"><span>File</span><strong>${escapeHtml(fileText)}</strong></div>
      <div class="video-detail-row ${state.publishMode === 'now' ? 'is-hidden' : ''}"><span>Giờ đăng</span><strong>${escapeHtml(publishAt ? publishAt.replace('T', ' ') : 'Chưa chọn')}</strong></div>
      <div class="video-detail-row"><span>Thời lượng</span><strong>${escapeHtml(duration)} giây</strong></div>
      <div class="video-detail-row"><span>Tiêu đề</span><strong title="${escapeHtml(caption)}">${escapeHtml(truncateDisplayText(caption || 'Chưa nhập', 80))}</strong></div>
      <div class="video-detail-row"><span>Hashtag</span><strong>${hasRequiredVideoHashtag(caption) ? `Đã có ${VIDEO_REQUIRED_HASHTAG}` : `Thiếu ${VIDEO_REQUIRED_HASHTAG}`}</strong></div>
      <div class="video-detail-row"><span>Trùng video</span><strong>${duplicate ? `${duplicateLabel.label} · giống ${formatNumber(duplicate.duplicate_score)}%` : 'Chưa thấy trùng đáng kể'}</strong></div>
      <div class="video-detail-row"><span>Giới hạn</span><strong>${SHOPEE_VIDEO_LIMITS.titleMaxChars} ký tự · ${SHOPEE_VIDEO_LIMITS.minDurationSeconds}-${SHOPEE_VIDEO_LIMITS.maxDurationSeconds} giây</strong></div>
      <div class="video-detail-row"><span>Sản phẩm</span><strong>${formatNumber(state.uploadItems.length)}</strong></div>
    </div>
  `
}

function queueErrorDisplayText(value) {
  const text = cleanText(value)
  if (!text) return ''
  if (looksLikeMojibake(text) || /[�]/.test(text)) {
    return 'Log lỗi cũ bị sai mã hóa. Vui lòng chạy lại job để lấy lỗi chuẩn tiếng Việt.'
  }
  return text
}

function renderQueueList() {
  const summaryNode = document.getElementById('videoQueueSummary')
  const listNode = document.getElementById('videoQueueList')
  const summary = state.uploadQueue.reduce((acc, row) => {
    acc[row.status] = numberValue(acc[row.status]) + 1
    return acc
  }, {})
  if (summaryNode) {
    summaryNode.innerHTML = [
      ['Chờ', summary.queued || 0, 'warning'],
      ['Đang chạy', summary.processing || 0, 'warning'],
      ['Chrome', (summary.browser_upload_required || 0) + (summary.browser_opening || 0) + (summary.browser_uploading || 0), 'warning'],
      ['Preview', summary.browser_preview_ready || 0, 'success'],
      ['Đã đăng', summary.done || 0, 'success'],
      ['Đăng tay', summary.browser_posted || 0, 'success'],
      ['Lỗi', summary.error || 0, 'danger']
    ].map(([label, value, tone]) => `<span class="video-mini-pill ${tone}">${label}: ${formatNumber(value)}</span>`).join('')
  }
  if (!listNode) return
  if (!state.uploadQueue.length) {
    listNode.innerHTML = `<div class="video-empty"><strong>Chưa có lịch upload video cho shop này.</strong></div>`
    return
  }
  listNode.innerHTML = `
    <div class="video-analysis-table video-queue-table">
      <div class="video-analysis-head">
        <div>Lịch đăng</div>
        <div>File / caption</div>
        <div>Sản phẩm</div>
        <div>Trạng thái</div>
        <div>Thao tác</div>
      </div>
      ${state.uploadQueue.map(row => {
    const status = videoQueueStatusLabel(row.status)
    const rowStatus = cleanText(row.status)
    const canCancel = ['queued', 'error', 'browser_upload_required', 'browser_login_required', 'browser_error', 'browser_preview_ready'].includes(rowStatus)
    const canOpenBrowser = ['browser_upload_required', 'browser_login_required', 'browser_error'].includes(rowStatus)
    const canMarkPosted = ['browser_preview_ready'].includes(rowStatus)
    const helperHref = `${VIDEO_LOCAL_HELPER_URL}/video-upload-preview?queue_id=${encodeURIComponent(cleanText(row.queue_id))}&shop=${encodeURIComponent(cleanText(row.shop))}&api=${encodeURIComponent(API_BASE)}`
    return `
        <article class="video-analysis-row">
          <div class="video-analysis-cell" data-label="Lịch đăng">
            <strong>${escapeHtml(shortDateTime(row.scheduled_at))}</strong>
            <span>Mã lịch: ${escapeHtml(cleanText(row.queue_id))}</span>
          </div>
          <div class="video-analysis-cell" data-label="File / caption">
            <strong>${escapeHtml(cleanText(row.caption) || cleanText(row.file_name) || row.queue_id)}</strong>
            <span>${escapeHtml(cleanText(row.file_name))} · ${formatFileSize(row.file_size)}</span>
          </div>
          <div class="video-analysis-cell" data-label="Sản phẩm">
            <strong>${formatNumber(Array.isArray(row.item_rows) ? row.item_rows.length : 0)} sản phẩm</strong>
            <span>Lần chạy: ${formatNumber(row.attempts)}/${formatNumber(row.max_attempts)}</span>
          </div>
          <div class="video-analysis-cell" data-label="Trạng thái">
            <span class="video-pill ${status.tone}">${escapeHtml(status.label)}</span>
            ${queueErrorDisplayText(row.last_error) ? `<span class="video-error-inline">${escapeHtml(queueErrorDisplayText(row.last_error))}</span>` : ''}
            ${cleanText(row.finished_at) ? `<span>Kết thúc: ${escapeHtml(shortDateTime(row.finished_at))}</span>` : ''}
          </div>
          <div class="video-analysis-cell video-row-actions" data-label="Thao tác">
            ${canOpenBrowser ? `<a class="video-text-btn" href="${escapeHtml(helperHref)}" target="_blank" rel="noopener">Mở Chrome preview</a>` : ''}
            ${canMarkPosted ? `<button class="video-text-btn" type="button" data-action="mark-browser-video-posted" data-queue-id="${escapeHtml(cleanText(row.queue_id))}">Đã đăng tay</button>` : ''}
            ${canCancel ? `<button class="video-text-btn danger" type="button" data-action="cancel-video-queue" data-queue-id="${escapeHtml(cleanText(row.queue_id))}">Hủy lịch</button>` : '<span>-</span>'}
          </div>
        </article>
    `
  }).join('')}
    </div>
  `
}
