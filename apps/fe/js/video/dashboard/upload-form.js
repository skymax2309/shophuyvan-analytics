function readVideoFileMeta(file) {
  return new Promise(resolve => {
    if (!file) {
      resolve(null)
      return
    }
    const video = document.createElement('video')
    const objectUrl = URL.createObjectURL(file)
    let finished = false
    const finish = result => {
      if (finished) return
      finished = true
      URL.revokeObjectURL(objectUrl)
      resolve(result)
    }
    video.preload = 'metadata'
    video.muted = true
    video.onloadedmetadata = () => {
      const durationSeconds = Math.round(Number.isFinite(video.duration) ? video.duration : 0)
      finish({
        name: file.name,
        size: file.size,
        type: file.type,
        durationSeconds
      })
    }
    video.onerror = () => finish({ error: 'Không đọc được thời lượng từ file này. Hãy thử file MP4/WebM/MOV khác hoặc kiểm tra lại bằng công cụ quay video.' })
    window.setTimeout(() => finish({ error: 'Quá thời gian đọc metadata video. Chưa thể xác nhận file có vượt giới hạn Shopee hay không.' }), 8000)
    video.src = objectUrl
  })
}

async function handleUploadFileChange() {
  const file = document.getElementById('videoUploadFile')?.files?.[0]
  state.uploadFileMeta = null
  state.uploadFileMetaError = ''
  if (!file) {
    renderUploadDurationStatus()
    renderPublishPreview()
    return
  }
  state.uploadFileMetaError = 'Đang đọc thời lượng thật từ file video...'
  renderUploadDurationStatus()
  const meta = await readVideoFileMeta(file)
  const currentFile = document.getElementById('videoUploadFile')?.files?.[0]
  if (!currentFile || currentFile.name !== file.name || currentFile.size !== file.size) return
  if (meta?.error) {
    state.uploadFileMeta = null
    state.uploadFileMetaError = meta.error
  } else {
    state.uploadFileMeta = meta
    state.uploadFileMetaError = ''
    if (meta?.durationSeconds) {
      const durationInput = document.getElementById('videoUploadDuration')
      if (durationInput) durationInput.value = String(meta.durationSeconds)
    }
  }
  renderUploadDurationStatus()
  renderPublishPreview()
}

async function handleMultiShopFileChange() {
  const fileInput = document.getElementById('videoMultiShopFile')
  const file = fileInput?.files?.[0]
  state.multiShopFileMeta = null
  state.multiShopFileMetaError = ''
  if (!file) {
    state.multiShopFile = null
    const statusNode = document.getElementById('videoMultiShopFileStatus')
    if (statusNode) statusNode.textContent = 'Chọn file để hệ thống đọc thời lượng trước khi tạo nhiều job.'
    return
  }
  state.multiShopFile = file
  state.multiShopFileMetaError = 'Đang đọc thời lượng thật từ file video...'
  const statusNode = document.getElementById('videoMultiShopFileStatus')
  if (statusNode) {
    statusNode.className = 'video-field-note info'
    statusNode.textContent = state.multiShopFileMetaError
  }
  const meta = await readVideoFileMeta(file)
  const currentFile = fileInput?.files?.[0]
  if (!currentFile || currentFile.name !== file.name || currentFile.size !== file.size) return
  if (meta?.error) {
    state.multiShopFileMetaError = meta.error
    if (statusNode) {
      statusNode.className = 'video-field-note warning'
      statusNode.textContent = meta.error
    }
  } else {
    state.multiShopFileMeta = meta
    // Biến lỗi chỉ giữ lỗi thật; nếu lưu thông báo thành công vào đây, guard tạo chiến dịch sẽ khóa nhầm file đã hợp lệ.
    state.multiShopFileMetaError = ''
    const successMessage = `File hợp lệ: ${formatDurationSeconds(meta.durationSeconds)}.`
    state.multiCampaignKey = cleanText(state.multiCampaignKey) || newCampaignVideoKey(file.name)
    const durationInput = document.getElementById('videoMultiDuration')
    if (durationInput) durationInput.value = String(meta.durationSeconds || 30)
    const keyInput = document.getElementById('videoCampaignKey')
    if (keyInput && !cleanText(keyInput.value)) keyInput.value = state.multiCampaignKey
    if (statusNode) {
      statusNode.className = 'video-field-note success'
      statusNode.textContent = successMessage
    }
  }
}

function validateUploadFormBeforeSubmit() {
  const captionInput = document.getElementById('videoUploadCaption')
  const ensuredCaption = ensureRequiredVideoHashtag(uploadCaptionValue())
  if (captionInput && ensuredCaption !== uploadCaptionValue()) {
    captionInput.value = ensuredCaption
    renderUploadCaptionMeter()
    renderUploadDuplicateCheck()
    renderPublishPreview()
  }
  const titleLength = ensuredCaption.length
  const duration = uploadDurationValue()
  const maxDuration = SHOPEE_VIDEO_LIMITS.maxDurationSeconds
  const minDuration = SHOPEE_VIDEO_LIMITS.minDurationSeconds
  if (titleLength > SHOPEE_VIDEO_LIMITS.titleMaxChars) {
    setStatus(`Tiêu đề video đang dài ${titleLength} ký tự, vượt giới hạn ${SHOPEE_VIDEO_LIMITS.titleMaxChars} ký tự.`, 'warning')
    return false
  }
  if (duration < minDuration || duration > maxDuration) {
    setStatus(`Thời lượng video phải nằm trong khoảng ${minDuration}-${maxDuration} giây trước khi gửi Shopee.`, 'warning')
    return false
  }
  if (state.uploadFileMeta?.durationSeconds && state.uploadFileMeta.durationSeconds !== duration) {
    setStatus('Thời lượng nhập tay đang lệch với metadata file. Hãy để hệ thống dùng thời lượng thật từ file rồi gửi lại.', 'warning')
    return false
  }
  if (state.uploadFileMetaError) {
    setStatus('Chưa đọc được thời lượng thật từ file, nên hệ thống chưa cho gửi lệnh upload để tránh video vượt giới hạn Shopee.', 'warning')
    return false
  }
  const duplicate = topDuplicateCandidate()
  if (numberValue(duplicate?.duplicate_score) >= VIDEO_DUPLICATE_HIGH_SCORE && !document.getElementById('videoDuplicateOverride')?.checked) {
    setStatus(`Video đang giống ${formatNumber(duplicate.duplicate_score)}% với video đã đăng. Hãy bấm Xem để kiểm tra hoặc tick xác nhận nếu vẫn muốn đăng lại.`, 'warning')
    return false
  }
  return true
}

async function requestAiVideoTitleSuggestions() {
  if (!state.selectedShop) return
  state.aiTitleLoading = true
  renderAiTitleSuggestions()
  try {
    const file = document.getElementById('videoUploadFile')?.files?.[0]
    const data = await fetchJson(`${API_BASE}/api/video/title-suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: state.selectedShop,
        caption: uploadCaptionValue(),
        file_name: file?.name || '',
        duration_seconds: uploadDurationValue(),
        max_chars: SHOPEE_VIDEO_LIMITS.titleMaxChars,
        items: state.uploadItems
      })
    })
    state.aiTitleSuggestions = Array.isArray(data.suggestions) ? data.suggestions : []
    state.aiTitleProvider = cleanText(data.provider)
    if (!state.aiTitleSuggestions.length) {
      setStatus('AI chưa tạo được tiêu đề phù hợp. Hãy nhập thêm tên sản phẩm hoặc gắn sản phẩm trước khi thử lại.', 'warning')
    } else {
      setStatus('Đã có gợi ý tiêu đề video. Bấm Dùng để đưa vào form.', 'success')
    }
  } catch (error) {
    state.aiTitleSuggestions = []
    state.aiTitleProvider = ''
    setStatus(error.message, 'error')
  } finally {
    state.aiTitleLoading = false
    renderAiTitleSuggestions()
  }
}

function applyAiVideoTitle(index) {
  const title = cleanText(state.aiTitleSuggestions[numberValue(index)])
  if (!title) return
  const input = document.getElementById('videoUploadCaption')
  if (input) input.value = title.slice(0, SHOPEE_VIDEO_LIMITS.titleMaxChars)
  renderUploadCaptionMeter()
  renderUploadDuplicateCheck()
  renderPublishPreview()
  setStatus('Đã đưa gợi ý AI vào tiêu đề video.', 'success')
}

async function requestAiEditTitleSuggestions() {
  const selected = selectedLibraryRow()
  if (!state.selectedShop || !selected) return
  state.editTitleLoading = true
  renderEditAiTitleSuggestions()
  try {
    const data = await fetchJson(`${API_BASE}/api/video/title-suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: state.selectedShop,
        caption: editCaptionValue() || cleanText(selected.caption),
        video_upload_id: cleanText(selected.video_upload_id),
        post_id: cleanText(selected.post_id),
        max_chars: SHOPEE_VIDEO_LIMITS.titleMaxChars,
        items: state.editItems
      })
    })
    state.editTitleSuggestions = Array.isArray(data.suggestions) ? data.suggestions : []
    state.editTitleProvider = cleanText(data.provider)
    if (!state.editTitleSuggestions.length) {
      setStatus('AI chưa tạo được tiêu đề phù hợp cho video này. Hãy gắn sản phẩm hoặc nhập mô tả rõ hơn rồi thử lại.', 'warning')
    } else {
      setStatus('Đã có gợi ý AI cho tiêu đề đang sửa. Bấm Dùng để đưa vào ô tiêu đề.', 'success')
    }
  } catch (error) {
    state.editTitleSuggestions = []
    state.editTitleProvider = ''
    setStatus(error.message, 'error')
  } finally {
    state.editTitleLoading = false
    renderEditAiTitleSuggestions()
  }
}

function applyAiEditTitle(index) {
  const title = cleanText(state.editTitleSuggestions[numberValue(index)])
  if (!title) return
  const input = document.getElementById('videoEditCaption')
  if (input) input.value = title.slice(0, SHOPEE_VIDEO_LIMITS.titleMaxChars)
  renderEditCaptionMeter()
  setStatus('Đã đưa gợi ý AI vào tiêu đề đang sửa. Kiểm tra lại rồi bấm Lưu thông tin video nếu muốn gửi lên Shopee.', 'success')
}

function renderUploadPanel() {
  const node = document.getElementById('videoUploadPanel')
  if (!node) return
  if (!state.selectedShop) {
    node.innerHTML = `<div class="video-empty"><strong>Chọn shop Shopee để đăng video.</strong></div>`
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
  state.uploadFileMeta = null
  state.uploadFileMetaError = ''
  const isSchedule = state.publishMode !== 'now'
  node.innerHTML = `
    <div class="video-compact-table video-automation-note">
      <div class="video-compact-title">Luồng đăng video</div>
      <div class="video-compact-row"><span>Shop đang thao tác</span><strong>${escapeHtml(state.selectedShop)}</strong></div>
      <div class="video-compact-row"><span>Endpoint Media</span><strong>Shopee Video đi qua Media public: init, upload part, complete, result.</strong></div>
      <div class="video-compact-row"><span>Endpoint MediaSpace</span><strong>Dùng riêng cho ảnh/video sản phẩm, đã tách route guard ở backend.</strong></div>
      <div class="video-compact-row"><span>Đăng ngay</span><strong>Gửi lệnh upload thật lên Shopee ngay sau khi bấm xác nhận.</strong></div>
      <div class="video-compact-row"><span>Hẹn giờ</span><strong>Lưu file vào R2, đến giờ cron mới upload, có log theo từng job.</strong></div>
      <div class="video-compact-row"><span>Trạng thái lịch</span><div id="videoQueueSummary" class="video-mini-grid"></div></div>
    </div>

    <div class="video-form-table">
      <div class="video-form-row wide">
        <div>
          <strong>Cách đăng</strong>
          <span>Chọn một luồng trong cùng màn này để tránh tách tab và thao tác nhầm.</span>
        </div>
        <div class="video-field">
          <label for="videoPublishMode">Chế độ đăng</label>
          <select id="videoPublishMode">
            <option value="schedule" ${isSchedule ? 'selected' : ''}>Hẹn giờ đăng</option>
            <option value="now" ${!isSchedule ? 'selected' : ''}>Đăng ngay</option>
          </select>
        </div>
      </div>
      <div class="video-form-row wide">
        <div>
          <strong>File video</strong>
          <span>Core tự lấy cover đầu tiên Shopee trả về; cần đổi cover thì sửa ở tab Chi tiết sau khi đăng.</span>
        </div>
        <div class="video-field">
          <label for="videoUploadFile">Chọn file</label>
          <input id="videoUploadFile" type="file" accept="video/mp4,video/webm,video/quicktime">
          <div id="videoUploadFileCheck" class="video-file-check">
            <span>Chọn file xong hệ thống sẽ tự đọc thời lượng thật để kiểm tra trước khi đăng.</span>
          </div>
        </div>
      </div>
      <div class="video-form-row ${isSchedule ? 'wide' : 'is-hidden'}" id="videoScheduleAtRow">
        <div>
          <strong>Giờ đăng</strong>
          <span>Theo giờ Việt Nam, sau hiện tại ít nhất 5 phút để còn kiểm tra preview.</span>
        </div>
        <div class="video-field">
          <label for="videoPublishAt">Giờ đăng theo Việt Nam</label>
          <input id="videoPublishAt" type="datetime-local" value="${defaultScheduleDateTimeLocal(30)}">
        </div>
      </div>
      <div class="video-form-row">
        <div>
          <strong>Thời lượng</strong>
          <span>Shopee Video API đang khóa ${SHOPEE_VIDEO_LIMITS.minDurationSeconds}-${SHOPEE_VIDEO_LIMITS.maxDurationSeconds} giây; file vượt giới hạn sẽ bị chặn trước khi gửi.</span>
        </div>
        <div class="video-field">
          <label for="videoUploadDuration">Thời lượng (giây)</label>
          <input id="videoUploadDuration" type="number" min="${SHOPEE_VIDEO_LIMITS.minDurationSeconds}" max="${SHOPEE_VIDEO_LIMITS.maxDurationSeconds}" value="30">
          <div id="videoUploadDurationStatus" class="video-field-note info"></div>
        </div>
      </div>
      <div class="video-form-row wide video-title-row">
        <div>
          <strong>Tiêu đề</strong>
          <span>Tiêu đề nên có hashtag tìm kiếm; bắt buộc giữ ${VIDEO_REQUIRED_HASHTAG} để khách tìm lại sản phẩm của shop.</span>
        </div>
        <div class="video-field">
          <div class="video-label-row">
            <label for="videoUploadCaption">Tiêu đề / mô tả</label>
            <span id="videoUploadCaptionMeter" class="video-char-meter">0/${SHOPEE_VIDEO_LIMITS.titleMaxChars} ký tự</span>
          </div>
          <div class="video-title-input-row">
            <input id="videoUploadCaption" type="text" maxlength="${SHOPEE_VIDEO_LIMITS.titleMaxChars}" placeholder="Ví dụ: Giăng bồn cầu chống mùi #shophuyvan #giangboncau">
            <button class="video-btn secondary" type="button" data-action="suggest-video-title">Gợi ý AI</button>
          </div>
          <div id="videoUploadHashtagNote" class="video-field-note warning"></div>
          <div id="videoAiTitleSuggestions" class="video-ai-suggestions"></div>
        </div>
      </div>
      <div class="video-form-row wide">
        <div>
          <strong>So sánh video đã đăng</strong>
          <span>Dựa trên tiêu đề, hashtag và sản phẩm gắn kèm để cảnh báo video giống, tránh đăng lại nội dung cũ.</span>
        </div>
        <div id="videoDuplicateCheck" class="video-duplicate-check"></div>
      </div>
      <div class="video-form-row wide">
        <div>
          <strong>Gắn sản phẩm</strong>
          <span>Chỉ chọn item có trong catalog snapshot của shop đang thao tác.</span>
        </div>
        <div class="video-field">
          <label for="videoUploadSearch">Tìm sản phẩm</label>
          <input id="videoUploadSearch" type="text" placeholder="Tìm item theo tên, SKU hoặc item ID">
        </div>
      </div>
      <div class="video-form-row wide">
        <div>
          <strong>Kết quả tìm</strong>
          <span>Bấm Thêm để đưa sản phẩm vào video.</span>
        </div>
        <div id="videoUploadSearchResults" class="video-search-results"></div>
      </div>
      <div class="video-form-row wide">
        <div>
          <strong>Sản phẩm sẽ gắn</strong>
          <span>Danh sách này được gửi cùng lệnh đăng ngay hoặc job hẹn giờ.</span>
        </div>
        <div id="videoUploadSelectedItems" class="video-selected-items"></div>
      </div>
      <div class="video-form-row wide">
        <div>
          <strong>Preview</strong>
          <span>Kiểm tra đúng shop, file, caption, sản phẩm và thời gian trước khi gửi lệnh.</span>
        </div>
        <div>
          <div id="videoPublishPreview" class="video-schedule-preview"></div>
          <label class="video-toggle video-confirm-row ${isSchedule ? '' : 'is-hidden'}" id="videoPublishConfirmRow">
            <input id="videoPublishConfirm" type="checkbox">
            Tôi đã kiểm tra đúng shop, file, caption và giờ đăng.
          </label>
        </div>
      </div>
      <div class="video-form-row action">
        <div>
          <strong>Thao tác</strong>
          <span>Đăng ngay là lệnh thật; hẹn giờ chỉ tạo job chờ cron.</span>
        </div>
        <div class="video-actions-row">
          <button class="video-btn" type="button" id="videoPublishBtn">${isSchedule ? 'Tạo lịch upload' : 'Đăng ngay'}</button>
          <button class="video-btn secondary" type="button" id="videoQueueRefreshBtn">Làm mới log</button>
          <button class="video-btn warning" type="button" id="videoQueueDryRunBtn">Kiểm tra job đến hạn</button>
        </div>
      </div>
    </div>

    <section class="video-queue-section">
      <div class="video-panel-head">
        <div>
          <h3>Log lịch upload</h3>
          <p class="video-panel-help">Chỉ hiện queue của shop đang chọn; đăng ngay không tạo dòng queue.</p>
        </div>
      </div>
      <div id="videoQueueList" class="video-queue-list"></div>
    </section>
  `
  renderSelectedItems('videoUploadSelectedItems', state.uploadItems, 'upload')
  renderUploadCaptionMeter()
  renderUploadDurationStatus()
  renderAiTitleSuggestions()
  renderUploadDuplicateCheck()
  renderPublishPreview()
  renderQueueList()
  document.getElementById('videoPublishMode')?.addEventListener('change', event => {
    state.publishMode = cleanText(event.target.value) === 'now' ? 'now' : 'schedule'
    localStorage.setItem('shv_video_publish_mode', state.publishMode)
    renderUploadPanel()
  })
  document.getElementById('videoUploadSearch')?.addEventListener('input', onUploadSearchInput)
  document.getElementById('videoUploadFile')?.addEventListener('change', handleUploadFileChange)
  document.getElementById('videoPublishAt')?.addEventListener('input', renderPublishPreview)
  document.getElementById('videoUploadDuration')?.addEventListener('input', () => {
    renderUploadDurationStatus()
    renderPublishPreview()
  })
  document.getElementById('videoUploadCaption')?.addEventListener('input', () => {
    renderUploadCaptionMeter()
    renderUploadDuplicateCheck()
    renderPublishPreview()
  })
  document.getElementById('videoPublishBtn')?.addEventListener('click', submitPublishVideo)
  document.getElementById('videoQueueRefreshBtn')?.addEventListener('click', loadUploadQueue)
  document.getElementById('videoQueueDryRunBtn')?.addEventListener('click', dryRunUploadQueue)
}
