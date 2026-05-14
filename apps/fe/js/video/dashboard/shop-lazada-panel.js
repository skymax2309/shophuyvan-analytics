function renderCapabilitySummary() {
  const summaryNode = document.getElementById('videoCapabilitySummary')
  const rowsNode = document.getElementById('videoCapabilityRows')
  if (!summaryNode || !rowsNode) return

  const shopeeRows = state.capabilities.filter(row => cleanText(row.platform) === 'shopee')
  const lazadaRows = lazadaVideoCapabilityRows()
  const readyRows = state.capabilities.filter(row => Number(row.video_ready) === 1)
  const lazadaReadyRows = lazadaRows.filter(row => Number(row.video_ready) === 1)
  const shopeeMediaRows = shopeeRows.filter(row => Number(row.supports_shopee_media_api) === 1)
  const shopeeMediaSpaceRows = shopeeRows.filter(row => Number(row.supports_shopee_media_space_api) === 1)
  const needAuthRows = shopeeRows.filter(row => ['api_missing_app', 'api_needs_auth', 'api_missing_user_id'].includes(cleanText(row.video_sync_mode)))
  const needTestRows = shopeeRows.filter(row => cleanText(row.video_sync_mode) === 'api_needs_permission_test')
  const manualRows = state.capabilities.filter(row => Number(row.video_ready) !== 1)

  summaryNode.innerHTML = [
    ['Tổng shop video', state.capabilities.length, 'success'],
    ['Video API sẵn sàng', readyRows.length, 'success'],
    ['Shopee Media', shopeeMediaRows.length, 'success'],
    ['Shopee MediaSpace', shopeeMediaSpaceRows.length, 'success'],
    ['Lazada Media API', lazadaReadyRows.length, 'success'],
    ['Cần test quyền video', needTestRows.length, 'warning'],
    ['Cần cấu hình/kết nối', needAuthRows.length, 'warning'],
    ['Chưa sẵn sàng video', manualRows.length, 'danger']
  ].map(([label, value, tone]) => `
    <article class="video-kpi-card ${tone}">
      <span>${label}</span>
      <strong>${formatNumber(value)}</strong>
    </article>
  `).join('')

  rowsNode.innerHTML = state.capabilities.map(row => {
    const isReady = Number(row.video_ready) === 1
    const modeInfo = videoModeInfo(row)
    const badgeClass = isReady ? 'success' : modeInfo.tone
    const badgeText = modeInfo.label
    return `
      <article class="video-capability-card">
        <div class="video-capability-head">
          <div>
            <strong>${escapeHtml(cleanText(row.shop_name || row.user_name || row.api_shop_id))}</strong>
            <div class="video-card-meta">
              <span>${escapeHtml((cleanText(row.platform) || 'shop').toUpperCase())}</span>
              <span>Shop ID video: ${escapeHtml(cleanText(row.video_api_shop_id || row.api_shop_id) || 'Chưa có')}</span>
              <span>User ID video: ${escapeHtml(cleanText(row.video_api_user_id) || 'Chưa có')}</span>
              ${cleanText(row.platform) === 'shopee' ? `
                <span>Media video: ${Number(row.supports_shopee_media_api) === 1 ? 'Đã nối' : 'Chưa sẵn sàng'}</span>
                <span>MediaSpace sản phẩm: ${Number(row.supports_shopee_media_space_api) === 1 ? 'Đã nối' : 'Chưa sẵn sàng'}</span>
              ` : ''}
            </div>
          </div>
          <span class="video-pill ${badgeClass}">${escapeHtml(badgeText)}</span>
        </div>
        <div class="video-capability-meta">
          <span>${escapeHtml(cleanText(row.video_operator_guide || row.operator_guide))}</span>
          ${cleanText(row.platform) === 'shopee' ? `
            <span>${escapeHtml(cleanText(row.shopee_media_operator_guide || ''))}</span>
            <span>${escapeHtml(cleanText(row.shopee_media_space_operator_guide || ''))}</span>
          ` : ''}
        </div>
      </article>
    `
  }).join('')
}

function renderShopSelect() {
  const select = document.getElementById('videoShopSelect')
  if (!select) return
  const shopeeRows = state.capabilities.filter(row => cleanText(row.platform) === 'shopee')
  select.innerHTML = shopeeRows.map(row => {
    const label = `${cleanText(row.shop_name)} - ${videoModeInfo(row).label}`
    return `<option value="${escapeHtml(cleanText(row.shop_name))}">${escapeHtml(label)}</option>`
  }).join('')

  const requestedShop = cleanText(state.selectedShop || localStorage.getItem(VIDEO_SELECTED_SHOP_KEY))
  const hasRequestedShop = shopeeRows.some(row => cleanText(row.shop_name) === requestedShop)
  if (hasRequestedShop) {
    state.selectedShop = requestedShop
  } else if (shopeeRows.length) {
    state.selectedShop = cleanText(shopeeRows.find(row => Number(row.video_ready) === 1)?.shop_name || shopeeRows[0]?.shop_name)
  }
  if (state.selectedShop) {
    select.value = state.selectedShop
    rememberSelectedVideoShop(state.selectedShop)
  }
}

function captureLazadaVideoForm() {
  state.selectedLazadaShop = cleanText(document.getElementById('lazadaVideoShopSelect')?.value || state.selectedLazadaShop)
  state.lazadaVideoId = cleanText(document.getElementById('lazadaVideoId')?.value || state.lazadaVideoId)
  state.lazadaVideoTitle = cleanText(document.getElementById('lazadaVideoTitle')?.value || state.lazadaVideoTitle)
  state.lazadaCoverUrl = cleanText(document.getElementById('lazadaVideoCoverUrl')?.value || state.lazadaCoverUrl)
  state.lazadaVideoUsage = cleanText(document.getElementById('lazadaVideoUsage')?.value || state.lazadaVideoUsage || 'pro_main_video')
  if (state.selectedLazadaShop) rememberSelectedLazadaVideoShop(state.selectedLazadaShop)
}

function setLazadaVideoStatus(message, type = 'info') {
  const node = document.getElementById('lazadaVideoStatus')
  if (!node) return
  node.className = `video-status-box${type ? ` ${type}` : ''}`
  node.textContent = cleanText(message) || 'Sẵn sàng thao tác Lazada Media Center.'
}

function renderLazadaVideoLibrary(ready) {
  const allRows = state.lazadaLibrary || []
  const finalRows = lazadaLibraryRowsForDisplay()
  const visibleRows = finalRows.slice(0, Math.max(20, numberValue(state.lazadaLibraryLimit) || 20))
  const emptyText = allRows.length
    ? 'Không có video Lazada nào khớp bộ lọc hiện tại.'
    : 'Chưa có video Lazada trong kho D1. Hãy nhập video_id rồi bấm Tra video ID, hoặc upload video Lazada mới.'

  return `
    <section class="video-lazada-library">
      <div class="video-library-toolbar">
        <div class="video-library-filters">
          <input id="lazadaLibrarySearch" type="search" value="${escapeHtml(state.lazadaLibraryQuery)}" placeholder="Tìm video_id, tiêu đề, trạng thái...">
        </div>
        <div class="video-library-actions">
          <button id="lazadaLibraryRefreshBtn" class="video-btn secondary" type="button">Đọc kho Lazada đã lưu</button>
          <button id="lazadaVideoDetailBtn2" class="video-btn secondary" type="button"${ready ? '' : ' disabled'}>Tra lại video đang chọn</button>
        </div>
      </div>
      <div class="video-status-box compact">
        Kho này đọc từ D1/R2 sau khi OMS upload hoặc tra video_id. Lazada chưa có endpoint list toàn bộ video đồng cấp Shopee trong bộ tài liệu đã rà.
      </div>
      ${!finalRows.length ? `<div class="video-empty"><strong>${escapeHtml(emptyText)}</strong></div>` : `
      <div class="video-management-table video-lazada-table" role="table" aria-label="Kho video Lazada đã lưu">
        <div class="video-management-head" role="row">
          <div>Video</div>
          <div>Shop</div>
          <div>Trạng thái</div>
          <div>Cập nhật</div>
          <div>Thao tác</div>
        </div>
        ${visibleRows.map(row => {
          const videoId = lazadaVideoRowId(row)
          const active = videoId && videoId === cleanText(state.lazadaVideoId)
          const coverUrl = validVideoCoverUrl(row.cover_image_url)
          const tone = lazadaVideoStatusTone(row)
          return `
            <article class="video-management-row ${active ? 'active' : ''}" role="row">
              <div class="video-management-cell video-main-cell" data-label="Video">
                <div class="video-thumb-wrap">
                  ${coverUrl ? `<img class="video-list-thumb" src="${escapeHtml(coverUrl)}" alt="Cover Lazada video">` : '<div class="video-list-thumb empty"></div>'}
                </div>
                <div class="video-list-copy">
                  <strong>${escapeHtml(cleanText(row.caption) || videoId || 'Video Lazada chưa có tiêu đề')}</strong>
                  <div class="video-inline-metrics">
                    <span>ID ${escapeHtml(videoId || 'Chưa có')}</span>
                    <span>${escapeHtml(cleanText(row.list_type) || 'media')}</span>
                  </div>
                  <span class="video-mini-label">${escapeHtml(cleanText(row.status_label) || 'Chưa rõ trạng thái')}</span>
                </div>
              </div>
              <div class="video-management-cell" data-label="Shop">
                <span>${escapeHtml(cleanText(row.shop || state.selectedLazadaShop))}</span>
              </div>
              <div class="video-management-cell" data-label="Trạng thái">
                <span class="video-pill ${tone}">${escapeHtml(cleanText(row.status_label) || `Mã ${numberValue(row.status)}`)}</span>
              </div>
              <div class="video-management-cell" data-label="Cập nhật">
                <span>${escapeHtml(shortDateTime(row.update_time || row.synced_at))}</span>
              </div>
              <div class="video-management-cell video-row-actions" data-label="Thao tác">
                <button class="video-text-btn" type="button" data-action="lazada-select-video" data-video-id="${escapeHtml(videoId)}">Chọn</button>
                <button class="video-text-btn" type="button" data-action="lazada-refresh-video" data-video-id="${escapeHtml(videoId)}"${ready && videoId ? '' : ' disabled'}>Tra lại</button>
                <button class="video-text-btn danger" type="button" data-action="lazada-remove-video" data-video-id="${escapeHtml(videoId)}"${ready && videoId ? '' : ' disabled'}>Xóa</button>
              </div>
            </article>
          `
        }).join('')}
      </div>
      ${visibleRows.length < finalRows.length ? `
        <div class="video-list-footer">
          <span>Đang hiển thị ${formatNumber(visibleRows.length)}/${formatNumber(finalRows.length)} video Lazada</span>
          <button class="video-text-btn" type="button" data-action="lazada-show-more-library">Xem thêm 20 video</button>
        </div>
      ` : ''}
      `}
    </section>
  `
}

function renderLazadaVideoPanel() {
  const node = document.getElementById('lazadaVideoPanel')
  if (!node) return
  const rows = lazadaVideoCapabilityRows()
  const requestedShop = cleanText(state.selectedLazadaShop || localStorage.getItem(LAZADA_VIDEO_SELECTED_SHOP_KEY))
  const hasRequestedShop = rows.some(row => cleanText(row.shop_name || row.shop || row.user_name) === requestedShop)
  if (hasRequestedShop) {
    state.selectedLazadaShop = requestedShop
  } else if (rows.length) {
    state.selectedLazadaShop = cleanText(rows.find(row => Number(row.video_ready) === 1)?.shop_name || rows[0]?.shop_name)
  }

  if (!rows.length) {
    node.innerHTML = `
      <div class="video-empty">
        <strong>Chưa có shop Lazada trong capability matrix.</strong>
        <p>Hãy kết nối Lazada API trước, sau đó quay lại tab này để dùng Media Center video.</p>
      </div>
    `
    return
  }

  const selectedRow = selectedLazadaShopRow() || rows[0]
  const ready = Number(selectedRow?.video_ready) === 1
  const quota = state.lazadaQuota
  const detail = state.lazadaDetail?.video || state.lazadaDetail?.detail?.video || state.lazadaDetail
  const libraryHtml = renderLazadaVideoLibrary(ready)
  const quotaHtml = quota
    ? `
      <article class="video-kpi-card success">
        <span>Dung lượng còn lại</span>
        <strong>${formatFileSize(quota.remaining_size)}</strong>
      </article>
      <article class="video-kpi-card">
        <span>Đã dùng</span>
        <strong>${formatFileSize(quota.used_size)}</strong>
      </article>
      <article class="video-kpi-card">
        <span>Tổng quota</span>
        <strong>${formatFileSize(quota.capacity_size)}</strong>
      </article>
    `
    : `
      <article class="video-kpi-card warning video-kpi-note">
        <span>Quota Lazada</span>
        <strong>Chưa đọc quota Media Center.</strong>
      </article>
    `
  const detailHtml = cleanText(detail?.video_id || state.lazadaVideoId)
    ? `
      <article class="video-note-card">
        <h3>${escapeHtml(cleanText(detail?.title || state.lazadaVideoTitle || detail?.video_id || state.lazadaVideoId))}</h3>
        <ul>
          <li>Video ID: ${escapeHtml(cleanText(detail?.video_id || state.lazadaVideoId))}</li>
          <li>Trạng thái: ${escapeHtml(cleanText(detail?.state_label || detail?.status_label || detail?.state || 'Chưa có'))}</li>
          <li>Cover: ${detail?.cover_url ? `<a href="${escapeHtml(detail.cover_url)}" target="_blank" rel="noopener">Mở ảnh cover</a>` : 'Chưa có'}</li>
          <li>Video: ${detail?.video_url ? `<a href="${escapeHtml(detail.video_url)}" target="_blank" rel="noopener">Mở video</a>` : 'Chưa có URL video'}</li>
        </ul>
      </article>
    `
    : `
      <article class="video-note-card">
        <h3>Chưa có video Lazada đang chọn</h3>
        <ul>
          <li>Upload video mới hoặc nhập video_id rồi bấm Tra video.</li>
        </ul>
      </article>
    `

  node.innerHTML = `
    <div class="video-form-grid two">
      <div class="video-field">
        <label for="lazadaVideoShopSelect">Shop Lazada</label>
        <select id="lazadaVideoShopSelect">
          ${rows.map(row => {
            const shopName = cleanText(row.shop_name || row.shop || row.user_name)
            const label = `${shopName} - ${videoModeInfo(row).label}`
            return `<option value="${escapeHtml(shopName)}"${shopName === state.selectedLazadaShop ? ' selected' : ''}>${escapeHtml(label)}</option>`
          }).join('')}
        </select>
        <div class="video-field-note">${escapeHtml(cleanText(selectedRow?.video_operator_guide || selectedRow?.operator_guide))}</div>
      </div>
      <div class="video-field">
        <label>Đọc an toàn</label>
        <div class="video-actions-row">
          <button id="lazadaVideoQuotaBtn" class="video-btn" type="button"${ready ? '' : ' disabled'}>Đọc quota</button>
          <button id="lazadaVideoDetailBtn" class="video-btn secondary" type="button"${ready ? '' : ' disabled'}>Tra video ID</button>
        </div>
      </div>
      <div class="video-field">
        <label for="lazadaVideoId">Video ID Lazada</label>
        <input id="lazadaVideoId" type="text" value="${escapeHtml(state.lazadaVideoId)}" placeholder="Nhập video_id để kiểm tra trạng thái">
      </div>
      <div class="video-field">
        <label for="lazadaVideoUsage">Mục đích video</label>
        <select id="lazadaVideoUsage">
          <option value="pro_main_video"${state.lazadaVideoUsage === 'pro_main_video' ? ' selected' : ''}>Video sản phẩm</option>
          <option value="im"${state.lazadaVideoUsage === 'im' ? ' selected' : ''}>Video chat IM</option>
        </select>
      </div>
    </div>

    <div class="video-kpi-grid" style="margin-top:10px;">${quotaHtml}</div>

    <div class="video-form-grid two" style="margin-top:12px;">
      <div class="video-field">
        <label for="lazadaCoverFile">Upload ảnh cover Lazada</label>
        <input id="lazadaCoverFile" type="file" accept="image/jpeg,image/png">
        <div class="video-actions-row" style="margin-top:8px;">
          <button id="lazadaCoverUploadBtn" class="video-btn secondary" type="button"${ready ? '' : ' disabled'}>Tải ảnh cover</button>
        </div>
        <div class="video-field-note">Ảnh JPG/PNG tối đa 1 MB. OMS dùng endpoint <code>/image/upload</code>.</div>
      </div>
      <div class="video-field">
        <label for="lazadaVideoCoverUrl">URL ảnh cover</label>
        <input id="lazadaVideoCoverUrl" type="url" value="${escapeHtml(state.lazadaCoverUrl)}" placeholder="Dán URL cover hoặc upload ảnh bên trái">
      </div>
      <div class="video-field">
        <label for="lazadaVideoFile">File video Lazada</label>
        <input id="lazadaVideoFile" type="file" accept="video/mp4,video/webm,video/quicktime">
        <div class="video-field-note">Video phải nhỏ hơn 100 MB. Backend upload theo block rồi commit lên Lazada Media Center.</div>
      </div>
      <div class="video-field">
        <label for="lazadaVideoTitle">Tiêu đề video</label>
        <input id="lazadaVideoTitle" type="text" value="${escapeHtml(state.lazadaVideoTitle)}" maxlength="120" placeholder="Tiêu đề dùng khi commit video Lazada">
      </div>
      <div class="video-field">
        <label>Thao tác ghi thật</label>
        <button id="lazadaVideoUploadBtn" class="video-btn" type="button"${ready ? '' : ' disabled'}>Upload video Lazada</button>
        <div class="video-field-note warning">Lệnh này tạo media thật trong Lazada Media Center nhưng chưa tự gắn vào sản phẩm.</div>
      </div>
      <div class="video-field">
        <label>Kết quả video</label>
        ${detailHtml}
      </div>
    </div>

    ${libraryHtml}

    <div id="lazadaVideoStatus" class="video-status-box" style="margin-top:12px;">
      ${ready ? 'Sẵn sàng thao tác Lazada Media Center.' : escapeHtml(cleanText(selectedRow?.video_operator_guide || 'Shop Lazada chưa sẵn sàng API.'))}
    </div>
  `

  document.getElementById('lazadaVideoShopSelect')?.addEventListener('change', event => {
    captureLazadaVideoForm()
    state.selectedLazadaShop = cleanText(event.target.value)
    state.lazadaQuota = null
    state.lazadaDetail = null
    state.lazadaLibrary = []
    state.lazadaLibraryQuery = ''
    state.lazadaLibraryLimit = 20
    rememberSelectedLazadaVideoShop(state.selectedLazadaShop)
    renderLazadaVideoPanel()
    loadLazadaVideoLibrary(false)
  })
  document.getElementById('lazadaVideoQuotaBtn')?.addEventListener('click', readLazadaVideoQuota)
  document.getElementById('lazadaVideoDetailBtn')?.addEventListener('click', readLazadaVideoDetail)
  document.getElementById('lazadaVideoDetailBtn2')?.addEventListener('click', readLazadaVideoDetail)
  document.getElementById('lazadaLibraryRefreshBtn')?.addEventListener('click', () => loadLazadaVideoLibrary(true))
  document.getElementById('lazadaLibrarySearch')?.addEventListener('input', event => {
    const cursor = event.target.selectionStart
    state.lazadaLibraryQuery = cleanText(event.target.value)
    state.lazadaLibraryLimit = 20
    renderLazadaVideoPanel()
    const nextInput = document.getElementById('lazadaLibrarySearch')
    nextInput?.focus()
    if (typeof cursor === 'number') nextInput?.setSelectionRange(cursor, cursor)
  })
  document.getElementById('lazadaCoverUploadBtn')?.addEventListener('click', uploadLazadaCoverImage)
  document.getElementById('lazadaVideoUploadBtn')?.addEventListener('click', uploadLazadaVideo)
}

async function readLazadaVideoQuota() {
  captureLazadaVideoForm()
  if (!state.selectedLazadaShop) {
    setLazadaVideoStatus('Vui lòng chọn shop Lazada trước.', 'warning')
    return
  }
  try {
    setLazadaVideoStatus('Đang đọc quota Lazada Media Center...', 'info')
    const data = await fetchJson(`${API_BASE}/api/video/lazada/quota?shop=${encodeURIComponent(state.selectedLazadaShop)}`)
    state.lazadaQuota = data.quota || null
    renderLazadaVideoPanel()
    setLazadaVideoStatus('Đã đọc quota Lazada Media Center.', 'success')
  } catch (error) {
    setLazadaVideoStatus(error.message, 'error')
  }
}

async function loadLazadaVideoLibrary(showStatus = true) {
  captureLazadaVideoForm()
  if (!state.selectedLazadaShop) {
    if (showStatus) setLazadaVideoStatus('Vui lòng chọn shop Lazada trước khi đọc kho video.', 'warning')
    return
  }
  try {
    if (showStatus) setLazadaVideoStatus('Đang đọc kho video Lazada đã lưu trong D1...', 'info')
    const data = await fetchJson(`${API_BASE}/api/video/library?platform=lazada&shop=${encodeURIComponent(state.selectedLazadaShop)}&list_type=all&limit=300`)
    state.lazadaLibrary = Array.isArray(data.rows) ? data.rows : []
    renderLazadaVideoPanel()
    if (showStatus) setLazadaVideoStatus(`Đã đọc ${formatNumber(state.lazadaLibrary.length)} video Lazada trong kho đã lưu.`, 'success')
  } catch (error) {
    if (showStatus) setLazadaVideoStatus(error.message, 'error')
    else console.warn('Không đọc được kho video Lazada', error)
  }
}

async function readLazadaVideoDetail() {
  captureLazadaVideoForm()
  if (!state.selectedLazadaShop || !state.lazadaVideoId) {
    setLazadaVideoStatus('Vui lòng chọn shop và nhập video_id Lazada.', 'warning')
    return
  }
  try {
    setLazadaVideoStatus('Đang tra trạng thái video Lazada...', 'info')
    const data = await fetchJson(`${API_BASE}/api/video/lazada/detail?shop=${encodeURIComponent(state.selectedLazadaShop)}&video_id=${encodeURIComponent(state.lazadaVideoId)}`)
    state.lazadaDetail = data.detail || null
    await loadLazadaVideoLibrary(false)
    renderLazadaVideoPanel()
    setLazadaVideoStatus('Đã tra video Lazada và lưu cache core.', 'success')
  } catch (error) {
    setLazadaVideoStatus(error.message, 'error')
  }
}

async function uploadLazadaCoverImage() {
  captureLazadaVideoForm()
  const file = document.getElementById('lazadaCoverFile')?.files?.[0]
  if (!state.selectedLazadaShop || !file) {
    setLazadaVideoStatus('Vui lòng chọn shop và chọn file ảnh cover Lazada.', 'warning')
    return
  }
  try {
    setLazadaVideoStatus('Đang upload ảnh cover Lazada...', 'info')
    const formData = new FormData()
    formData.set('shop', state.selectedLazadaShop)
    formData.set('image', file)
    const data = await fetchJson(`${API_BASE}/api/video/lazada/image-upload`, {
      method: 'POST',
      body: formData
    })
    state.lazadaCoverUrl = cleanText(data?.result?.image_url)
    renderLazadaVideoPanel()
    setLazadaVideoStatus(state.lazadaCoverUrl ? 'Đã upload ảnh cover Lazada và điền URL vào form.' : 'Upload ảnh xong nhưng chưa thấy URL cover.', state.lazadaCoverUrl ? 'success' : 'warning')
  } catch (error) {
    setLazadaVideoStatus(error.message, 'error')
  }
}

async function uploadLazadaVideo() {
  captureLazadaVideoForm()
  const file = document.getElementById('lazadaVideoFile')?.files?.[0]
  if (!state.selectedLazadaShop || !file || !state.lazadaVideoTitle || !validVideoCoverUrl(state.lazadaCoverUrl)) {
    setLazadaVideoStatus('Vui lòng chọn shop, file video, tiêu đề và URL cover hợp lệ trước khi upload Lazada.', 'warning')
    return
  }
  try {
    setLazadaVideoStatus('Đang upload video Lazada theo block. Không đóng trang cho tới khi có video_id...', 'info')
    const formData = new FormData()
    formData.set('shop', state.selectedLazadaShop)
    formData.set('file', file)
    formData.set('title', state.lazadaVideoTitle)
    formData.set('cover_url', state.lazadaCoverUrl)
    formData.set('video_usage', state.lazadaVideoUsage || 'pro_main_video')
    const data = await fetchJson(`${API_BASE}/api/video/lazada/upload`, {
      method: 'POST',
      body: formData
    })
    const result = data.result || {}
    state.lazadaVideoId = cleanText(result.video_id || state.lazadaVideoId)
    state.lazadaDetail = result.detail || null
    await loadLazadaVideoLibrary(false)
    renderLazadaVideoPanel()
    setLazadaVideoStatus(state.lazadaVideoId ? `Đã upload video Lazada. Video ID: ${state.lazadaVideoId}` : 'Đã upload video Lazada nhưng chưa thấy video_id.', state.lazadaVideoId ? 'success' : 'warning')
  } catch (error) {
    setLazadaVideoStatus(error.message, 'error')
  }
}

async function removeLazadaVideo(videoId) {
  captureLazadaVideoForm()
  const finalVideoId = cleanText(videoId || state.lazadaVideoId)
  if (!state.selectedLazadaShop || !finalVideoId) {
    setLazadaVideoStatus('Vui lòng chọn shop và video_id Lazada trước khi xóa.', 'warning')
    return
  }
  const ready = Number(selectedLazadaShopRow()?.video_ready) === 1
  if (!ready) {
    setLazadaVideoStatus('Shop Lazada này chưa đủ điều kiện gọi Media Center API.', 'warning')
    return
  }
  const row = findLazadaLibraryRow(finalVideoId)
  const title = cleanText(row?.caption || finalVideoId)
  const confirmText = window.prompt(`Xóa video Lazada "${title}"?\nĐây là lệnh thật trên Media Center. Nhập XOA_VIDEO_LAZADA để xác nhận.`)
  if (cleanText(confirmText) !== 'XOA_VIDEO_LAZADA') return
  try {
    setLazadaVideoStatus('Đang gửi lệnh xóa video Lazada...', 'info')
    const data = await fetchJson(`${API_BASE}/api/video/lazada/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: state.selectedLazadaShop,
        video_id: finalVideoId,
        confirm_remove: 'XOA_VIDEO_LAZADA'
      })
    })
    state.lazadaVideoId = ''
    state.lazadaDetail = null
    await loadLazadaVideoLibrary(false)
    setLazadaVideoStatus(data.message || 'Đã gửi lệnh xóa video Lazada.', 'success')
  } catch (error) {
    setLazadaVideoStatus(error.message, 'error')
  }
}

// Luồng không API luôn có hướng dẫn riêng, không cho lẫn với thao tác Shopee Video thật.
