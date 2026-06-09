function renderManualPlan() {
  const node = document.getElementById('videoManualPlan')
  if (!node) return
  const manualRows = state.capabilities.filter(row => Number(row.video_ready) !== 1)
  if (!manualRows.length) {
    node.innerHTML = `
      <article class="video-guide-card">
        <h3>Luồng shop không có API</h3>
        <ul>
          <li>Hiện tại tất cả shop video trong danh sách đều có thể đi luồng API hoặc đang chờ hoàn tất kết nối.</li>
        </ul>
      </article>
    `
    return
  }
  node.innerHTML = `
    <article class="video-guide-card">
      <h3>Phương án cho shop không có API</h3>
      <ol>
        <li>Lưu link video và mã SKU nội bộ theo mẫu thao tác tay, không giả lập đồng bộ API.</li>
        <li>Dùng tab <b>Kho video đóng gói</b> để xem video thực tế đã quay và gắn với đơn hàng.</li>
        <li>Khi cần đăng video, mở <a href="${SHOPEE_CREATOR_CENTER_VIDEO_UPLOAD_URL}" target="_blank" rel="noopener">Shopee Creator Center</a>, chọn đúng shop rồi upload tay có log.</li>
        <li>Mọi shop không có API đều giữ nhãn tham chiếu rõ ràng để tránh thao tác nhầm.</li>
      </ol>
    </article>
    ${manualRows.map(row => `
      <article class="video-note-card">
        <h3>${escapeHtml(cleanText(row.shop_name || row.user_name || row.api_shop_id))}</h3>
        <ul>
          <li>${escapeHtml(cleanText(row.video_operator_guide || row.operator_guide))}</li>
        </ul>
      </article>
    `).join('')}
  `
}

function renderOverview() {
  const node = document.getElementById('videoOverviewGrid')
  if (!node) return
  const overview = state.dashboard?.overview || {}
  const keyMetric = overview.key_metric || {}
  const conversion = overview.conversion || {}
  const engagement = overview.engagement || {}
  const sourceNote = state.dashboard?.overview_source === 'trend_fallback'
    ? `
      <article class="video-kpi-card warning video-kpi-note">
        <span>Nguồn số liệu</span>
        <strong>Overview API đang rỗng, hệ thống đã cộng lại từ bảng Trend theo ngày.</strong>
      </article>
    `
    : ''

  node.innerHTML = sourceNote + [
    ['Doanh thu đặt từ video', formatCurrency(keyMetric.placed_sales), 'success'],
    ['Đơn đặt từ video', formatNumber(keyMetric.placed_orders), 'success'],
    ['Lượt xem video', formatNumber(engagement.total_views), 'warning'],
    ['Lượt thích', formatNumber(engagement.total_likes), ''],
    ['Lượt bình luận', formatNumber(engagement.total_comments), ''],
    ['Người xem hiệu quả', formatNumber(keyMetric.effective_views), ''],
    ['Tỷ lệ CTR', `${numberValue(conversion.ctr).toFixed(2)}%`, ''],
    ['Người theo dõi mới', formatNumber(engagement.video_new_followers), '']
  ].map(([label, value, tone]) => `
    <article class="video-kpi-card ${tone}">
      <span>${label}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join('')
}

function renderWarnings() {
  const panel = document.getElementById('videoWarningsPanel')
  const list = document.getElementById('videoWarningsList')
  if (!panel || !list) return
  // Chỉ hiện panel khi có nội dung cảnh báo thật, tránh một khung trống làm rối màn phân tích.
  const warnings = (state.dashboard?.warnings || []).filter(item => cleanText(item?.message || item))
  panel.hidden = state.activeSubtab !== 'overview' || warnings.length === 0
  list.innerHTML = warnings.map(item => `
    <div class="video-warning-item">
      <strong>${escapeHtml(cleanText(item.shop) || 'Shop')}</strong><br>
      ${escapeHtml(cleanText(item.message))}
    </div>
  `).join('')
}

// Trend giữ dạng bảng để chạy ổn định trên mobile trước, tránh phụ thuộc thư viện biểu đồ ngoài.
function renderTrendTable() {
  const body = document.getElementById('videoTrendBody')
  if (!body) return
  const rows = state.dashboard?.trend_rows || []
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5" class="video-empty"><strong>Chưa có snapshot trend.</strong></td></tr>`
    return
  }
  body.innerHTML = rows.map(row => `
    <tr>
      <td data-label="Ngày / kỳ">${escapeHtml(cleanText(row.data_period))}</td>
      <td data-label="Lượt xem">${formatNumber(row.total_views)}</td>
      <td data-label="Lượt thích">${formatNumber(row.total_likes)}</td>
      <td data-label="Đơn đặt">${formatNumber(row.placed_orders)}</td>
      <td data-label="Doanh thu đặt">${formatCurrency(row.placed_sales)}</td>
    </tr>
  `).join('')
}

function renderAudience() {
  const grid = document.getElementById('videoAudienceGrid')
  if (!grid) return
  const groups = [
    ['Tuổi', state.dashboard?.demographics?.age || []],
    ['Giới tính', state.dashboard?.demographics?.gender || []],
    ['Khu vực', state.dashboard?.demographics?.location || []],
    ['Nhóm mua sắm', state.dashboard?.demographics?.shopping || []]
  ]
  // Bỏ các bucket Shopee trả nhãn nhưng giá trị 0 để không tạo cảm giác có dữ liệu thật.
  const groupsWithRows = groups
    .map(([label, rows]) => [label, (rows || []).filter(item => cleanText(item.label) && numberValue(item.value) > 0)])
    .filter(([, rows]) => rows.length)

  if (!groupsWithRows.length) {
    grid.classList.add('single')
    grid.innerHTML = `
      <div class="video-status-box warning video-audience-note">
        <strong>Shopee chưa trả dữ liệu người xem.</strong><br>
        Endpoint demographics hiện không có tuổi, giới tính, khu vực hoặc nhóm mua sắm cho snapshot này. Phần phân tích đang ưu tiên Trend theo ngày và Sản phẩm bán được.
      </div>
    `
    return
  }

  grid.classList.remove('single')
  grid.innerHTML = groupsWithRows.map(([label, rows]) => `
    <div class="video-chip-list">
      <div class="video-audience-group">
        <span class="video-mini-label">${label}</span>
        <div>${rows.slice(0, 8).map(item => `<span class="video-chip">${escapeHtml(item.label)} · ${formatNumber(item.value)}</span>`).join('')}</div>
      </div>
    </div>
  `).join('')
}

function renderTopVideos() {
  const node = document.getElementById('videoTopList')
  if (!node) return
  const rows = topVideoRowsForDisplay().slice(0, 20)
  if (!rows.length) {
    node.innerHTML = `<div class="video-empty"><strong>Chưa có video đạt bộ lọc ${escapeHtml(analysisMetricLabel())}.</strong></div>`
    return
  }
  const fallbackNotice = filteredAnalysisRows(videoRowsForAnalysis()).length
    ? ''
    : '<div class="video-status-box warning compact">Chưa có video đạt ngưỡng đang lọc, hệ thống đang hiện thư viện video để vẫn xem được lượt xem và thao tác chi tiết.</div>'
  node.innerHTML = `
    ${fallbackNotice}
    <div class="video-analysis-table video-analysis-video-table">
      <div class="video-analysis-head">
        <div>Video</div>
        <div>Lượt xem</div>
        <div>Đơn / doanh số</div>
        <div>Tín hiệu</div>
        <div>Thao tác</div>
      </div>
      ${rows.map(row => {
        const caption = cleanText(row.caption) || 'Video chưa có tiêu đề'
        const compactCaption = truncateDisplayText(caption)
        const coverUrl = validVideoCoverUrl(row.cover_image_url)
        return `
        <article class="video-analysis-row">
          <div class="video-main-cell" data-label="Video">
            <div class="video-thumb-wrap small">
              ${coverUrl ? `<img class="video-list-thumb" src="${escapeHtml(coverUrl)}" alt="Cover video">` : '<div class="video-list-thumb empty"></div>'}
            </div>
            <div class="video-list-copy">
              <strong class="video-title-clamp" title="${escapeHtml(caption)}">${escapeHtml(compactCaption)}</strong>
              <span class="video-mini-label">${escapeHtml(cleanText(row.video_upload_id || row.post_id || row.video_key))}</span>
            </div>
          </div>
          <div class="video-analysis-cell" data-label="Lượt xem">
            <strong>${formatNumber(row.views)}</strong>
            <span>${formatNumber(row.likes)} thích · ${formatNumber(row.comments)} bình luận</span>
          </div>
          <div class="video-analysis-cell" data-label="Đơn / doanh số">
            <strong>${formatCurrency(row.placed_sales)}</strong>
            <span>${formatNumber(row.placed_orders)} đơn đặt</span>
          </div>
          <div class="video-analysis-cell video-signal-cell" data-label="Tín hiệu">
            <span class="video-pill compact ${numberValue(row.placed_orders) > 0 ? 'success' : 'warning'}">${numberValue(row.placed_orders) > 0 ? 'Đang bán được' : 'Có view, chưa ra đơn'}</span>
          </div>
          <div class="video-analysis-cell video-row-actions" data-label="Thao tác">
            <button class="video-text-btn" type="button" data-action="select-video" data-video-key="${escapeHtml(cleanText(row.video_key))}">Xem chi tiết</button>
          </div>
        </article>
      `}).join('')}
    </div>
  `
}

function renderTopProducts() {
  const node = document.getElementById('videoTopProductList')
  if (!node) return
  const rows = filteredAnalysisRows(state.dashboard?.top_product_rows || []).slice(0, 20)
  if (!rows.length) {
    node.innerHTML = `<div class="video-empty"><strong>Chưa có sản phẩm đạt bộ lọc ${escapeHtml(analysisMetricLabel())}.</strong></div>`
    return
  }
  node.innerHTML = `
    <div class="video-analysis-table video-analysis-product-table">
      <div class="video-analysis-head">
        <div>Sản phẩm</div>
        <div>Item ID</div>
        <div>Đơn đặt</div>
        <div>Doanh số</div>
        <div>Người mua</div>
      </div>
      ${rows.map(row => `
        <article class="video-analysis-row">
          <div class="video-main-cell" data-label="Sản phẩm">
            <div class="video-thumb-wrap small product">
              ${cleanText(row.item_cover_image_url) ? `<img class="video-list-thumb" src="${escapeHtml(cleanText(row.item_cover_image_url))}" alt="Ảnh sản phẩm">` : '<div class="video-list-thumb empty"></div>'}
            </div>
            <div class="video-list-copy">
              <strong>${escapeHtml(cleanText(row.item_name) || cleanText(row.item_id))}</strong>
              <span class="video-mini-label">${formatNumber(row.confirmed_orders)} đơn xác nhận</span>
            </div>
          </div>
          <div class="video-analysis-cell" data-label="Item ID">${escapeHtml(cleanText(row.item_id))}</div>
          <div class="video-analysis-cell" data-label="Đơn đặt"><strong>${formatNumber(row.placed_orders)}</strong></div>
          <div class="video-analysis-cell" data-label="Doanh số"><strong>${formatCurrency(row.placed_sales)}</strong></div>
          <div class="video-analysis-cell" data-label="Người mua">${formatNumber(row.placed_unique_buyers)}</div>
        </article>
      `).join('')}
    </div>
  `
}
// Các insight này bám đúng yêu cầu: SKU có video, video nhiều view chưa ra đơn và video đáng ưu tiên ads/boost.
function renderInsights() {
  const node = document.getElementById('videoInsightsWrap')
  if (!node) return
  const insights = state.dashboard?.product_insights || {}
  const skuRows = (insights.sku_with_video_rows || []).slice(0, 8)
  const fallbackNoOrderRows = videoRowsForAnalysis()
    .filter(row => numberValue(row.views) > 0 && numberValue(row.placed_orders) <= 0)
    .sort((left, right) => numberValue(right.views) - numberValue(left.views))
  const noOrderRows = sortedByAnalysisMetric(insights.video_view_no_order_rows?.length ? insights.video_view_no_order_rows : fallbackNoOrderRows).slice(0, 8)
  const boostRows = sortedByAnalysisMetric(insights.video_boost_rows || []).slice(0, 8)
  node.innerHTML = `
    <div class="video-compact-table video-insight-table">
      <div class="video-compact-title">SKU đang có video</div>
      <div class="video-insight-help">Dùng để biết SKU nào đã có nội dung video, chưa phải là doanh số.</div>
      ${skuRows.length ? skuRows.map(row => `
        <div class="video-compact-row">
          <span>${escapeHtml(cleanText(row.internal_sku || row.item_id))}</span>
          <strong>${formatNumber(row.video_count)} video</strong>
          <button class="video-text-btn" type="button" data-action="set-subtab" data-target-subtab="library">Xem video</button>
        </div>
      `).join('') : '<div class="video-empty"><strong>Chưa có SKU gắn video.</strong></div>'}
    </div>
    <div class="video-compact-table video-insight-table">
      <div class="video-compact-title">Có view nhưng chưa ra đơn</div>
      <div class="video-insight-help">Dùng để kiểm video có lượt xem nhưng chưa kéo đơn, cần sửa caption/sản phẩm gắn kèm.</div>
      ${noOrderRows.length ? noOrderRows.map(row => `
        <div class="video-compact-row">
          <span>${escapeHtml(cleanText(row.caption) || cleanText(row.video_upload_id))}</span>
          <strong>${formatNumber(row.views)} view</strong>
          <button class="video-text-btn" type="button" data-action="select-video" data-video-key="${escapeHtml(cleanText(row.video_key))}">Xem chi tiết</button>
        </div>
      `).join('') : '<div class="video-empty"><strong>Chưa có dữ liệu dạng này trong snapshot hiện tại.</strong></div>'}
    </div>
    <div class="video-compact-table video-insight-table">
      <div class="video-compact-title">Nên ưu tiên Ads / boost</div>
      <div class="video-insight-help">Dùng để chọn video đã có đơn/doanh số, có thể cân nhắc đẩy ads hoặc làm lại nội dung.</div>
      ${boostRows.length ? boostRows.map(row => `
        <div class="video-compact-row">
          <span>${escapeHtml(cleanText(row.caption) || cleanText(row.video_upload_id))}</span>
          <strong>${formatCurrency(row.placed_sales)} · ${formatNumber(row.placed_orders)} đơn</strong>
          <button class="video-text-btn" type="button" data-action="select-video" data-video-key="${escapeHtml(cleanText(row.video_key))}">Xem chi tiết</button>
        </div>
      `).join('') : '<div class="video-empty"><strong>Chưa có video đủ tín hiệu để ưu tiên trong snapshot hiện tại.</strong></div>'}
    </div>
  `
}

function renderLibrary() {
  const node = document.getElementById('videoLibraryList')
  if (!node) return
  const allRows = state.dashboard?.library || []
  const finalRows = libraryRowsForDisplay()
  const visibleRows = finalRows.slice(0, Math.max(20, numberValue(state.libraryLimit) || 20))
  const performanceByKey = new Map((state.dashboard?.top_video_rows || []).map(row => [cleanText(row.video_key), row]))
  const selectedRows = selectedLibraryRows()
  const busy = Boolean(state.librarySyncing || state.libraryDeleting)
  const summary = libraryStatusSummary(allRows)
  const badTitleCount = summary.badTitle
  const denominatorMap = {
    post: summary.post,
    draft: summary.draft,
    deleted: summary.deleted,
    all: summary.active + summary.deleted
  }
  const labelMap = {
    post: 'Video đã đăng',
    draft: 'Bản nháp',
    deleted: 'Video đã xóa trong cache',
    all: 'Tất cả video'
  }
  const currentLabel = labelMap[cleanText(state.libraryStatus)] || 'Kho video'
  const denominator = denominatorMap[cleanText(state.libraryStatus)] ?? allRows.length
  const titleNode = document.getElementById('videoLibraryTitle')
  if (titleNode) titleNode.textContent = currentLabel
  const countNode = document.getElementById('videoLibraryCount')
  if (countNode) countNode.textContent = `(${formatNumber(finalRows.length)}/${formatNumber(denominator)})`
  node.innerHTML = `
    <div class="video-library-toolbar">
      <div class="video-library-filters">
        <input id="videoLibrarySearch" type="search" value="${escapeHtml(state.libraryQuery)}" placeholder="Tìm tiêu đề, video ID, sản phẩm...">
        <select id="videoLibraryStatus">
          <option value="post" ${state.libraryStatus === 'post' ? 'selected' : ''}>Đã đăng</option>
          <option value="draft" ${state.libraryStatus === 'draft' ? 'selected' : ''}>Bản nháp</option>
          <option value="deleted" ${state.libraryStatus === 'deleted' ? 'selected' : ''}>Đã xóa trong cache</option>
          <option value="all" ${state.libraryStatus === 'all' ? 'selected' : ''}>Tất cả</option>
        </select>
        <label class="video-inline-check">
          <input id="videoBadTitleOnly" type="checkbox" ${state.libraryBadTitleOnly ? 'checked' : ''}>
          Tiêu đề cần xóa (${formatNumber(badTitleCount)})
        </label>
      </div>
      <div class="video-library-actions">
        <button class="video-btn secondary" type="button" data-action="sync-full-library" ${busy ? 'disabled' : ''}>${state.librarySyncing ? 'Đang tải...' : 'Tải lại toàn bộ Shopee'}</button>
        <button class="video-btn secondary" type="button" data-action="select-filtered-library" ${finalRows.length && !busy ? '' : 'disabled'}>Chọn danh sách đang lọc</button>
        <button class="video-btn secondary" type="button" data-action="clear-library-selection" ${selectedRows.length && !busy ? '' : 'disabled'}>Bỏ chọn</button>
        <button class="video-btn danger" type="button" data-action="delete-selected-videos" ${selectedRows.length && !busy ? '' : 'disabled'}>${state.libraryDeleting ? 'Đang xóa...' : `Xóa đã chọn (${formatNumber(selectedRows.length)})`}</button>
      </div>
    </div>
    <div class="video-status-box info compact">
      Kho video đã lưu nằm ngay tại tab này. Chọn bộ lọc Đã đăng hoặc Bản nháp để lấy lại video đã đồng bộ từ Shopee.
      Đã đăng thật: ${formatNumber(summary.post)} · Bản nháp: ${formatNumber(summary.draft)} · Đã xóa trong cache: ${formatNumber(summary.deleted)} · Tiêu đề cần xử lý: ${formatNumber(summary.badTitle)}.
    </div>
    ${state.libraryBadTitleOnly ? '<div class="video-status-box warning compact">Đang lọc các video có tiêu đề “Bấm vào giỏ hàng để mua”. Hãy kiểm tra kỹ rồi mới xóa thật trên Shopee.</div>' : ''}
    ${!finalRows.length ? '<div class="video-empty"><strong>Không có video nào khớp bộ lọc hiện tại.</strong></div>' : `
    <div class="video-management-table" role="table" aria-label="Danh sách ${escapeHtml(currentLabel.toLowerCase())}">
      <div class="video-management-head" role="row">
        <div></div>
        <div>Video</div>
        <div>Thời gian đăng bài</div>
        <div>Sản phẩm liên quan</div>
        <div>Hiệu suất</div>
        <div>Thao tác</div>
      </div>
      ${visibleRows.map(row => {
    const active = cleanText(row.video_key) === cleanText(state.selectedVideoKey)
    const links = Array.isArray(row.links) ? row.links : []
    const performance = performanceByKey.get(cleanText(row.video_key)) || {}
    const viewCount = numberValue(performance.views || row.views)
    const likeCount = numberValue(performance.likes || row.likes)
    const commentCount = numberValue(performance.comments || row.comments)
    const placedOrders = numberValue(performance.placed_orders)
    const placedSales = numberValue(performance.placed_sales)
    const durationText = formatDurationMs(row.duration_ms)
    const postTime = shortDateTime(row.post_time || row.update_time || row.synced_at)
    const coverUrl = validVideoCoverUrl(row.cover_image_url)
    const videoKey = cleanText(row.video_key)
    const checked = state.librarySelectedKeys.has(videoKey)
    const badTitle = isBadShopeeVideoTitle(row)
    return `
      <article class="video-management-row ${active ? 'active' : ''} ${checked ? 'selected' : ''}" role="row">
        <div class="video-management-cell video-select-cell" data-label="Chọn">
          <input type="checkbox" data-library-select="${escapeHtml(videoKey)}" ${checked ? 'checked' : ''} aria-label="Chọn video">
        </div>
        <div class="video-management-cell video-main-cell" data-label="Video">
          <div class="video-thumb-wrap">
            ${coverUrl ? `<img class="video-list-thumb" src="${escapeHtml(coverUrl)}" alt="Cover video">` : '<div class="video-list-thumb empty"></div>'}
            ${durationText ? `<span class="video-duration">${escapeHtml(durationText)}</span>` : ''}
          </div>
          <div class="video-list-copy">
            <strong>${escapeHtml(cleanText(row.caption) || 'Video chưa có tiêu đề')}</strong>
            <div class="video-inline-metrics">
              <span>▶ ${formatNumber(viewCount)}</span>
              <span>♡ ${formatNumber(likeCount)}</span>
              <span>Bình luận ${formatNumber(commentCount)}</span>
            </div>
            <span class="video-mini-label">${escapeHtml(cleanText(row.status_label) || 'Đã đăng')}</span>
            ${badTitle ? '<span class="video-pill danger compact">Tiêu đề cần xử lý</span>' : ''}
          </div>
        </div>
        <div class="video-management-cell" data-label="Thời gian đăng bài">
          <span>${escapeHtml(postTime)}</span>
        </div>
        <div class="video-management-cell" data-label="Sản phẩm liên quan">
          ${links.length
            ? `<button class="video-text-btn" type="button" data-action="select-video" data-video-key="${escapeHtml(cleanText(row.video_key))}">${formatNumber(links.length)} Xem</button>`
            : '<span>-</span>'}
        </div>
        <div class="video-management-cell video-performance-cell" data-label="Hiệu suất">
          <span>${formatNumber(viewCount)} lượt xem</span>
          <span>${formatNumber(placedOrders)} đơn</span>
          <span>${formatCurrency(placedSales)}</span>
        </div>
        <div class="video-management-cell video-row-actions" data-label="Thao tác">
          <button class="video-text-btn" type="button" data-action="load-detail" data-video-key="${escapeHtml(cleanText(row.video_key))}" data-refresh="1">Kiểm tra hiệu suất video</button>
          <button class="video-text-btn danger" type="button" data-action="delete-video-row" data-video-key="${escapeHtml(cleanText(row.video_key))}">Xóa</button>
        </div>
      </article>
    `
  }).join('')}
    </div>
    ${visibleRows.length < finalRows.length ? `
      <div class="video-list-footer">
        <span>Đang hiển thị ${formatNumber(visibleRows.length)}/${formatNumber(finalRows.length)} video</span>
        <button class="video-text-btn" type="button" data-action="show-more-library">Xem thêm 20 video</button>
      </div>
    ` : ''}
    `}
  `
  bindLibraryControls()
}
