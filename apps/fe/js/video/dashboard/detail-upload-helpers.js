function bindLibraryControls() {
  document.getElementById('videoLibrarySearch')?.addEventListener('input', event => {
    const cursor = event.target.selectionStart
    state.libraryQuery = cleanText(event.target.value)
    state.libraryLimit = 20
    renderLibrary()
    const nextInput = document.getElementById('videoLibrarySearch')
    nextInput?.focus()
    if (typeof cursor === 'number') nextInput?.setSelectionRange(cursor, cursor)
  })
  document.getElementById('videoLibraryStatus')?.addEventListener('change', event => {
    state.libraryStatus = cleanText(event.target.value) || 'post'
    state.libraryLimit = 20
    renderLibrary()
  })
  document.getElementById('videoBadTitleOnly')?.addEventListener('change', event => {
    state.libraryBadTitleOnly = Boolean(event.target.checked)
    state.libraryLimit = 20
    renderLibrary()
  })
  document.querySelectorAll('[data-library-select]').forEach(input => {
    input.addEventListener('change', event => {
      const key = cleanText(event.target.dataset.librarySelect)
      if (!key) return
      if (event.target.checked) state.librarySelectedKeys.add(key)
      else state.librarySelectedKeys.delete(key)
      renderLibrary()
    })
  })
}

// Chi tiết video dùng cache từ core trước, chỉ gọi làm mới sâu khi người vận hành bấm chủ động.
function renderDetail() {
  const detailWrap = document.getElementById('videoDetailWrap')
  const productBody = document.getElementById('videoDetailProductBody')
  const audienceNode = document.getElementById('videoDetailAudience')
  const coverNode = document.getElementById('videoCoverGrid')
  if (!detailWrap || !productBody || !audienceNode || !coverNode) return

  const libraryRow = selectedLibraryRow()
  const detail = state.detail
  if (!libraryRow) {
    detailWrap.innerHTML = `<div class="video-empty"><strong>Chọn một video trong thư viện để xem chi tiết.</strong></div>`
    productBody.innerHTML = `<tr><td colspan="4" class="video-empty"><strong>Chưa có video được chọn.</strong></td></tr>`
    audienceNode.innerHTML = `<div class="video-empty"><strong>Chưa có dữ liệu tệp người xem.</strong></div>`
    coverNode.innerHTML = `<div class="video-empty"><strong>Chưa có ảnh cover.</strong></div>`
    renderEditForm()
    return
  }

  const performance = detail?.performance?.video_performance || {}
  detailWrap.innerHTML = `
    <div class="video-detail-table">
      <div class="video-detail-row main">
        <span>Video</span>
        <strong>${escapeHtml(cleanText(libraryRow.caption) || 'Video chưa có tiêu đề')}</strong>
      </div>
      <div class="video-detail-row"><span>Video ID</span><strong>${escapeHtml(cleanText(libraryRow.video_upload_id || libraryRow.post_id || libraryRow.video_key))}</strong></div>
      <div class="video-detail-row"><span>Đồng bộ lúc</span><strong>${escapeHtml(shortDateTime(detail?.synced_at || libraryRow.synced_at))}</strong></div>
      <div class="video-detail-row"><span>Lượt xem</span><strong>${formatNumber(performance.views || libraryRow.views)}</strong></div>
      <div class="video-detail-row"><span>Lượt thích</span><strong>${formatNumber(performance.likes || libraryRow.likes)}</strong></div>
      <div class="video-detail-row"><span>Đơn đặt</span><strong>${formatNumber(performance.placed_orders)}</strong></div>
      <div class="video-detail-row"><span>Doanh thu đặt</span><strong>${formatCurrency(performance.placed_sales)}</strong></div>
      <div class="video-detail-row action"><span>Thao tác</span><button class="video-text-btn" data-action="load-detail" data-video-key="${escapeHtml(cleanText(libraryRow.video_key))}" data-refresh="1">Làm mới chi tiết</button></div>
    </div>
  `

  const detailProducts = detail?.product_rows || []
  productBody.innerHTML = detailProducts.length
    ? detailProducts.map(row => `
      <tr>
        <td>${escapeHtml(cleanText(row.item_name) || cleanText(row.item_id))}</td>
        <td>${formatNumber(row.placed_orders)}</td>
        <td>${formatCurrency(row.placed_sales)}</td>
        <td>${formatNumber(row.confirmed_unique_buyers)}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="4" class="video-empty"><strong>Chưa có sản phẩm kéo đơn ở video này.</strong></td></tr>`

  const audience = detail?.audience || {}
  audienceNode.innerHTML = ['age', 'gender', 'location', 'shopping'].map(key => {
    const label = key === 'age' ? 'Tuổi' : key === 'gender' ? 'Giới tính' : key === 'location' ? 'Khu vực' : 'Mua sắm'
    const rows = Array.isArray(audience[key]) ? audience[key].slice(0, 8) : []
    return rows.length
      ? `<div class="video-audience-group"><span class="video-mini-label">${label}</span><div>${rows.map(item => `<span class="video-chip">${escapeHtml(item.label)} · ${formatNumber(item.value)}</span>`).join('')}</div></div>`
      : `<div class="video-empty"><strong>Chưa có dữ liệu ${label.toLowerCase()}.</strong></div>`
  }).join('')

  const videoUploadId = cleanText(libraryRow.video_upload_id)
  const activeCoverUrl = videoCoverBelongsToVideo(state.editCoverUrl, videoUploadId)
  const coverRows = (Array.isArray(detail?.cover_list) && detail.cover_list.length ? detail.cover_list : [libraryRow.cover_image_url])
    .map(url => videoCoverBelongsToVideo(url, videoUploadId))
    .filter(Boolean)
  coverNode.innerHTML = coverRows.length
    ? coverRows.map(url => `
      <button class="video-cover-option ${activeCoverUrl === url ? 'active' : ''}" type="button" data-action="choose-cover" data-cover-url="${escapeHtml(url)}">
        <img src="${escapeHtml(url)}" alt="Cover video">
      </button>
    `).join('')
    : `<div class="video-empty"><strong>Chưa có ảnh cover để chọn.</strong></div>`

  renderEditForm()
}

function renderEditForm() {
  const container = document.getElementById('videoEditPanel')
  if (!container) return
  const shopReady = selectedShopReady()
  const selectedVideo = selectedLibraryRow()
  if (!selectedVideo) {
    container.innerHTML = `<div class="video-empty"><strong>Chọn video để sửa tiêu đề, cover và sản phẩm liên kết.</strong></div>`
    return
  }
  if (!shopReady) {
    container.innerHTML = `
      <div class="video-status-box warning">
        ${escapeHtml(selectedShopGuide() || 'Shop này chưa đủ điều kiện gọi Shopee Video API.')}
      </div>
    `
    return
  }
  if (!canEditShopeeVideoInfo(selectedVideo)) {
    container.innerHTML = `
      <div class="video-status-box warning">
        Shopee Video API chỉ cho sửa tiêu đề, cover và sản phẩm liên kết trước khi video được đăng. Video này đã đăng hoặc không còn ở trạng thái bản nháp nên OMS khóa nút lưu để tránh gửi lệnh lỗi lên sàn.
      </div>
      <div class="video-actions-row" style="margin-top:12px;">
        <button class="video-btn danger" type="button" id="videoDeleteBtn">Xóa video</button>
      </div>
    `
    document.getElementById('videoDeleteBtn')?.addEventListener('click', submitDeleteVideo)
    return
  }
  if (!state.editItems.length) {
    state.editItems = Array.isArray(selectedVideo.links) ? selectedVideo.links.map(link => ({
      item_id: cleanText(link.item_id),
      custom_item_name: cleanText(link.custom_item_name),
      product_name: cleanText(link.product_name || link.item_name)
    })) : []
  }
  const currentCoverUrl = videoCoverBelongsToVideo(state.editCoverUrl, selectedVideo.video_upload_id)
  if (currentCoverUrl) {
    state.editCoverUrl = currentCoverUrl
  } else {
    // Khi đổi video liên tiếp, không dùng lại cover của video trước vì Shopee sẽ từ chối khi lưu.
    state.editCoverUrl = preferredVideoCoverUrl(selectedVideo, state.detail)
  }
  container.innerHTML = `
    <div class="video-field">
      <label for="videoEditCaption">Tiêu đề / mô tả video</label>
      <div class="video-label-row">
        <span class="video-ai-help">AI chỉ gợi ý nội dung, chưa gửi lệnh lên Shopee.</span>
        <span id="videoEditCaptionMeter" class="video-char-meter">0/${SHOPEE_VIDEO_LIMITS.titleMaxChars} ký tự</span>
      </div>
      <div class="video-title-input-row">
        <textarea id="videoEditCaption" maxlength="${SHOPEE_VIDEO_LIMITS.titleMaxChars}">${escapeHtml(cleanText(selectedVideo.caption))}</textarea>
        <button class="video-btn secondary" type="button" data-action="suggest-edit-video-title">Gợi ý AI</button>
      </div>
      <div id="videoEditHashtagNote" class="video-field-note warning"></div>
      <div id="videoEditAiTitleSuggestions" class="video-ai-suggestions"></div>
      <small>Bạn đang sửa trực tiếp thông tin video đã có trên Shopee. Hệ thống sẽ ghi log kết quả sau khi gửi.</small>
    </div>
    <div class="video-field">
      <label for="videoEditSearch">Liên kết sản phẩm vào video</label>
      <input id="videoEditSearch" type="text" placeholder="Tìm item theo tên, SKU hoặc item ID">
      <small>Chỉ chọn item đã có trong catalog snapshot của shop hiện tại.</small>
    </div>
    <div id="videoEditSearchResults" class="video-search-results"></div>
    <div class="video-field">
      <label>Sản phẩm đang gắn vào video</label>
      <div id="videoEditSelectedItems" class="video-selected-items"></div>
    </div>
    <div class="video-toggle-row">
      <label class="video-toggle"><input id="videoAllowDuet" type="checkbox" checked> Cho phép duet</label>
      <label class="video-toggle"><input id="videoAllowStitch" type="checkbox" checked> Cho phép stitch</label>
    </div>
    <div class="video-actions-row" style="margin-top:12px;">
      <button class="video-btn" type="button" id="videoSaveEditBtn">Lưu thông tin video</button>
      <button class="video-btn danger" type="button" id="videoDeleteBtn">Xóa video</button>
    </div>
  `

  renderSelectedItems('videoEditSelectedItems', state.editItems, 'edit')
  renderEditCaptionMeter()
  renderEditAiTitleSuggestions()
  document.getElementById('videoEditCaption')?.addEventListener('input', renderEditCaptionMeter)
  document.getElementById('videoEditSearch')?.addEventListener('input', onEditSearchInput)
  document.getElementById('videoSaveEditBtn')?.addEventListener('click', submitEditVideo)
  document.getElementById('videoDeleteBtn')?.addEventListener('click', submitDeleteVideo)
}

function renderSelectedItems(targetId, rows, mode) {
  const node = document.getElementById(targetId)
  if (!node) return
  if (!rows.length) {
    node.innerHTML = `<div class="video-empty"><strong>Chưa chọn sản phẩm nào.</strong></div>`
    return
  }
  node.innerHTML = rows.map(row => `
    <div class="video-selected-row">
      <div class="video-selected-row-head">
        <div>
          <strong>${escapeHtml(cleanText(row.product_name || row.item_name || row.item_id))}</strong>
          <span class="video-mini-label">${escapeHtml(cleanText(row.item_id))}</span>
        </div>
        <button class="video-chip-btn" type="button" data-action="remove-linked-item" data-mode="${escapeHtml(mode)}" data-item-id="${escapeHtml(cleanText(row.item_id))}">Bỏ</button>
      </div>
      ${cleanText(row.custom_item_name) ? `<span class="video-mini-label">Tên tùy chỉnh: ${escapeHtml(cleanText(row.custom_item_name))}</span>` : ''}
    </div>
  `).join('')
}

function renderUploadCaptionMeter() {
  const node = document.getElementById('videoUploadCaptionMeter')
  if (!node) return
  const count = uploadCaptionValue().length
  node.textContent = `${count}/${SHOPEE_VIDEO_LIMITS.titleMaxChars} ký tự`
  node.classList.toggle('danger', count > SHOPEE_VIDEO_LIMITS.titleMaxChars)
  const hashtagNode = document.getElementById('videoUploadHashtagNote')
  if (hashtagNode) {
    const hasHashtag = hasRequiredVideoHashtag(uploadCaptionValue())
    hashtagNode.className = `video-field-note ${hasHashtag ? 'success' : 'warning'}`
    hashtagNode.textContent = hasHashtag
      ? `Đã có hashtag bắt buộc ${VIDEO_REQUIRED_HASHTAG}.`
      : `Cần có ${VIDEO_REQUIRED_HASHTAG}; khi bấm đăng hệ thống sẽ tự thêm nếu còn thiếu.`
  }
}

function renderEditCaptionMeter() {
  const node = document.getElementById('videoEditCaptionMeter')
  if (!node) return
  const value = editCaptionValue()
  const count = value.length
  node.textContent = `${count}/${SHOPEE_VIDEO_LIMITS.titleMaxChars} ký tự`
  node.classList.toggle('danger', count > SHOPEE_VIDEO_LIMITS.titleMaxChars)
  const hashtagNode = document.getElementById('videoEditHashtagNote')
  if (hashtagNode) {
    const hasHashtag = hasRequiredVideoHashtag(value)
    hashtagNode.className = `video-field-note ${hasHashtag ? 'success' : 'warning'}`
    hashtagNode.textContent = hasHashtag
      ? `Đã có hashtag bắt buộc ${VIDEO_REQUIRED_HASHTAG}.`
      : `Khi bấm Lưu, hệ thống sẽ tự thêm ${VIDEO_REQUIRED_HASHTAG} nếu tiêu đề còn thiếu.`
  }
}

function renderUploadDurationStatus() {
  const node = document.getElementById('videoUploadDurationStatus')
  if (!node) return
  const duration = uploadDurationValue()
  const min = SHOPEE_VIDEO_LIMITS.minDurationSeconds
  const max = SHOPEE_VIDEO_LIMITS.maxDurationSeconds
  let tone = 'info'
  let message = `Giới hạn đang áp dụng: ${min}-${max} giây. Hãy chọn file để hệ thống tự đọc thời lượng thật.`
  if (state.uploadFileMetaError) {
    tone = 'warning'
    message = state.uploadFileMetaError
  } else if (state.uploadFileMeta?.durationSeconds) {
    const metaDuration = state.uploadFileMeta.durationSeconds
    tone = metaDuration > max || metaDuration < min ? 'error' : 'success'
    message = metaDuration > max
      ? `File dài ${formatDurationSeconds(metaDuration)}, vượt giới hạn ${formatDurationSeconds(max)}. Cần cắt ngắn trước khi đăng.`
      : metaDuration < min
        ? `File chỉ dài ${formatDurationSeconds(metaDuration)}, ngắn hơn giới hạn tối thiểu ${formatDurationSeconds(min)}.`
        : `File hợp lệ: ${formatDurationSeconds(metaDuration)}. Hệ thống đã đưa thời lượng thật vào form.`
  } else if (duration > max || duration < min) {
    tone = 'error'
    message = `Thời lượng phải nằm trong khoảng ${min}-${max} giây trước khi gửi Shopee.`
  }
  node.className = `video-field-note ${tone}`
  node.textContent = message
}

function renderAiTitleSuggestions() {
  const node = document.getElementById('videoAiTitleSuggestions')
  if (!node) return
  if (state.aiTitleLoading) {
    node.innerHTML = '<div class="video-empty"><strong>AI đang viết gợi ý tiêu đề...</strong></div>'
    return
  }
  if (!state.aiTitleSuggestions.length) {
    node.innerHTML = '<div class="video-ai-help">AI sẽ dựa vào caption hiện tại, tên file và sản phẩm đã gắn để gợi ý tiêu đề ngắn, dễ đọc.</div>'
    return
  }
  node.innerHTML = `
    <div class="video-ai-suggestion-head">
      <span>${state.aiTitleProvider === 'gemini' ? 'Gợi ý từ Gemini' : 'Gợi ý dự phòng trong OMS'}</span>
      <span>Tối đa ${SHOPEE_VIDEO_LIMITS.titleMaxChars} ký tự</span>
    </div>
    ${state.aiTitleSuggestions.map((title, index) => `
      <div class="video-ai-suggestion-row">
        <span>${escapeHtml(title)}</span>
        <button class="video-chip-btn" type="button" data-action="use-ai-video-title" data-title-index="${index}">Dùng</button>
      </div>
    `).join('')}
  `
}

function renderEditAiTitleSuggestions() {
  const node = document.getElementById('videoEditAiTitleSuggestions')
  if (!node) return
  if (state.editTitleLoading) {
    node.innerHTML = '<div class="video-empty"><strong>AI đang viết lại tiêu đề...</strong></div>'
    return
  }
  if (!state.editTitleSuggestions.length) {
    node.innerHTML = '<div class="video-ai-help">AI sẽ dựa vào tiêu đề hiện tại và sản phẩm đang gắn để viết lại ngắn gọn, có hashtag tìm kiếm.</div>'
    return
  }
  node.innerHTML = `
    <div class="video-ai-suggestion-head">
      <span>${state.editTitleProvider === 'gemini' ? 'Gợi ý từ Gemini' : 'Gợi ý dự phòng trong OMS'}</span>
      <span>Tối đa ${SHOPEE_VIDEO_LIMITS.titleMaxChars} ký tự</span>
    </div>
    ${state.editTitleSuggestions.map((title, index) => `
      <div class="video-ai-suggestion-row">
        <span>${escapeHtml(title)}</span>
        <button class="video-chip-btn" type="button" data-action="use-ai-edit-video-title" data-title-index="${index}">Dùng</button>
      </div>
    `).join('')}
  `
}

function renderUploadDuplicateCheck() {
  const node = document.getElementById('videoDuplicateCheck')
  if (!node) return
  const rows = uploadDuplicateCandidates()
  const draftHasText = compareTokens(uploadCaptionValue()).length >= 2 || state.uploadItems.length > 0
  if (!draftHasText) {
    node.innerHTML = '<div class="video-ai-help">Nhập tiêu đề hoặc gắn sản phẩm, hệ thống sẽ so với thư viện video đã đăng của shop này.</div>'
    return
  }
  if (!rows.length) {
    node.innerHTML = '<div class="video-field-note success">Chưa thấy video đã đăng nào giống đáng kể. Có thể tiếp tục kiểm preview.</div>'
    return
  }
  const top = rows[0]
  const topLabel = duplicateScoreLabel(top.duplicate_score)
  node.innerHTML = `
    <div class="video-field-note ${topLabel.tone === 'danger' ? 'error' : topLabel.tone}">
      ${topLabel.label}: video gần nhất giống ${formatNumber(top.duplicate_score)}%. ${topLabel.tone === 'danger' ? 'Không nên đăng lại nếu chưa đổi góc quay/nội dung.' : 'Nên kiểm tra trước khi đăng.'}
    </div>
    ${rows.slice(0, 3).map(row => {
      const label = duplicateScoreLabel(row.duplicate_score)
      return `
        <div class="video-duplicate-row ${label.tone}">
          <div>
            <strong>${escapeHtml(truncateDisplayText(cleanText(row.caption) || cleanText(row.video_upload_id) || 'Video đã đăng', 76))}</strong>
            <span>${escapeHtml(label.label)} · Giống ${formatNumber(row.duplicate_score)}% · ${formatNumber(row.views)} lượt xem · ${formatNumber(row.likes)} thích</span>
          </div>
          <button class="video-text-btn" type="button" data-action="select-video" data-video-key="${escapeHtml(cleanText(row.video_key))}">Xem</button>
        </div>
      `
    }).join('')}
    ${numberValue(top.duplicate_score) >= VIDEO_DUPLICATE_HIGH_SCORE ? `
      <label class="video-toggle video-duplicate-override">
        <input id="videoDuplicateOverride" type="checkbox">
        Tôi đã kiểm tra video giống trên và vẫn muốn đăng lại.
      </label>
    ` : ''}
  `
}
