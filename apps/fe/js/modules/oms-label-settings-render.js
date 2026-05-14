export function createLabelVaultRenderers(ctx) {
  const {
    DEFAULT_PLATFORM_MARKS,
    TEMPLATE_SECTIONS,
    TEMPLATE_VARIABLES,
    labelVaultState,
    escapeHtml,
    fmtNumber,
    fmtBytes,
    platformLabel,
    statusLabel,
    labelRefreshMode,
    rowsForStatus,
    selectedCountText,
    templateRows,
    templateBaseId,
    templateCreatedAgo,
    templateSectionById,
    normalizePlatform,
    buildLabelUrl,
    previewLabelForPlatform,
    ensureRealLabelPreview,
    getLabelSettings
  } = ctx;

  function labelTabButton(id, label) {
    const active = labelVaultState.activeTab === id ? ' active' : '';
    return `<button type="button" class="label-vault-tab${active}" data-label-tab="${id}">${label}</button>`;
  }
  
  function renderSummaryCards(summary) {
    const data = summary || {};
    return `
      <div class="label-vault-summary">
        <span>Tổng <b>${fmtNumber(data.total_labels)}</b> tem</span>
        <span>Dùng được: <b class="ok">${fmtNumber(data.ok_labels)}</b></span>
        <span>Lỗi/cần tải lại: <b class="bad">${fmtNumber(data.error_labels)}</b></span>
        <span>Cập nhật gần nhất: <b>${escapeHtml(data.latest_refreshed || 'Chưa có')}</b></span>
      </div>`;
  }
  
  function renderStatusTabs(status) {
    const tabs = [
      { id: 'all', label: 'Tất cả tem', count: labelVaultState.summary?.total_labels },
      { id: 'ok', label: 'Đã lưu', count: labelVaultState.summary?.ok_labels },
      { id: 'error', label: 'Tem lỗi', count: labelVaultState.summary?.error_labels }
    ];
    return `
      <div class="label-status-tabs">
        ${tabs.map(tab => `
          <button type="button" class="${status === tab.id ? 'active' : ''}" data-label-status-tab="${tab.id}">
            ${tab.label} <span>${fmtNumber(tab.count || 0)}</span>
          </button>`).join('')}
      </div>`;
  }
  
  function renderActionBar(status) {
    return `
      <div class="label-vault-actionbar">
        <button type="button" class="btn btn-ghost" data-label-select-page>Chọn tất cả trang này</button>
        <button type="button" class="btn btn-ghost" data-label-select-errors>Chọn tem lỗi</button>
        <button type="button" class="btn btn-ghost" data-label-clear-selected>Bỏ chọn</button>
        <button type="button" class="btn btn-primary" data-label-open-selected>In lại tem đã chọn</button>
        <button type="button" class="btn btn-ghost" data-label-refresh-selected>Tải lại từ sàn</button>
        <button type="button" class="btn btn-ghost" data-label-refresh-errors-page>Tải lại tem lỗi trang này</button>
        <button type="button" class="btn btn-ghost" data-label-tab="template">Tùy chỉnh mẫu</button>
        <span class="label-vault-selected">${selectedCountText()}</span>
        <a href="#" data-label-status-tab="${status === 'error' ? 'all' : 'error'}">${status === 'error' ? 'Xem tất cả tem' : 'Xem tem lỗi'}</a>
      </div>`;
  }
  
  function renderFilters(status) {
    return `
      <div class="label-vault-filters">
        <button type="button" class="label-icon-btn" data-label-reload="${status}" title="Làm mới">↻</button>
        <button type="button" class="label-filter-btn" data-label-apply-filter>Lọc</button>
        <select class="filter-input" id="labelVaultPlatform">
          <option value="">Tất cả sàn</option>
          <option value="shopee" ${labelVaultState.filters.platform === 'shopee' ? 'selected' : ''}>Shopee</option>
          <option value="lazada" ${labelVaultState.filters.platform === 'lazada' ? 'selected' : ''}>Lazada</option>
          <option value="tiktok" ${labelVaultState.filters.platform === 'tiktok' ? 'selected' : ''}>TikTok</option>
        </select>
        <input class="filter-input" id="labelVaultSearch" value="${escapeHtml(labelVaultState.filters.q)}" placeholder="Tìm mã đơn, shop, file tem...">
      </div>`;
  }
  
  function renderShipXanhNotice(status = 'all') {
    const text = status === 'error'
      ? 'Tem lỗi cần tải lại trước khi đóng gói lại hoặc gửi khiếu nại.'
      : 'Để in lại tem nhanh trong 90 ngày, hãy in mã vận đơn qua OMS để hệ thống lưu file tem vào kho.';
    return `
      <div class="label-vault-notice">
        <span>${escapeHtml(text)}</span>
        <button type="button" data-label-notice-close aria-label="Ẩn ghi chú">×</button>
      </div>`;
  }
  
  function renderLabelRows(rows) {
    if (labelVaultState.loading) {
      return '<div class="label-vault-empty">Đang tải kho tem...</div>';
    }
    if (!rows.length) {
      return '<div class="label-vault-empty">Không có tem phù hợp bộ lọc hiện tại.</div>';
    }
    const allVisibleChecked = rows.every(row => labelVaultState.selected.has(row.order_id));
    return `
      <div class="label-vault-table">
        <div class="label-vault-table-head">
          <label><input type="checkbox" data-label-select-visible ${allVisibleChecked ? 'checked' : ''} title="Chọn tất cả tem đang hiển thị"></label>
          <span>Đơn / file</span><span>Sàn / shop</span><span>Trạng thái</span><span>Thao tác</span>
        </div>
        ${rows.map(row => {
          const status = statusLabel(row);
          const refreshMode = labelRefreshMode(row);
          const checked = labelVaultState.selected.has(row.order_id) ? 'checked' : '';
          const rowTone = status.cls === 'danger' ? ' error' : status.cls === 'success' ? ' ok' : '';
          return `
            <div class="label-vault-row${rowTone}">
              <label><input type="checkbox" data-label-select="${escapeHtml(row.order_id)}" ${checked}></label>
              <div>
                <b>${escapeHtml(row.order_id)}</b>
                <span>${escapeHtml(row.storage_key || 'Chưa có file R2')} · ${fmtBytes(row.size_bytes)}</span>
              </div>
              <div>
                <b>${platformLabel(row.platform)}</b>
                <span>${escapeHtml(row.shop || 'Chưa rõ shop')}</span>
                <em class="label-refresh-mode ${refreshMode.cls}">${escapeHtml(refreshMode.text)}</em>
              </div>
              <div>
                <i class="label-vault-status ${status.cls}">${status.text}</i>
                <span>${escapeHtml(row.error || row.source || '')}</span>
                <span>${escapeHtml(row.refreshed_at || '')}</span>
              </div>
              <div class="label-vault-row-actions">
                <button type="button" data-label-open="${escapeHtml(row.order_id)}">Mở/In lại</button>
                <button type="button" data-label-refresh="${escapeHtml(row.order_id)}">Tải lại</button>
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }
  
  function renderWarehousePanel(status = 'all') {
    const rows = rowsForStatus(status);
    return `
      ${renderStatusTabs(status)}
      ${renderActionBar(status)}
      ${renderFilters(status)}
      ${renderSummaryCards(labelVaultState.summary)}
      ${renderShipXanhNotice(status)}
      ${labelVaultState.message ? `<div class="label-vault-alert">${escapeHtml(labelVaultState.message)}</div>` : ''}
      ${renderLabelRows(rows)}`;
  }
  
  function renderActionPanel() {
    return `
      ${renderSummaryCards(labelVaultState.summary)}
      <div class="label-vault-action-grid">
        <section>
          <h3>Tải lại / in lại theo mã đơn</h3>
          <p>Nhập nhiều mã đơn cách nhau bằng xuống dòng, dấu phẩy hoặc dấu chấm phẩy.</p>
          <textarea id="labelManualOrders" rows="8" placeholder="260508U1BFPM1V&#10;260508U10NH7G2"></textarea>
          <div class="label-vault-row-actions">
            <button type="button" class="btn btn-primary" data-label-manual-print>Mở/In lại</button>
            <button type="button" class="btn btn-ghost" data-label-manual-refresh>Tải lại từ sàn/helper</button>
          </div>
        </section>
        <section>
          <h3>Quy trình vận hành</h3>
          <ul>
            <li>Shop có API: bấm tải lại để OMS gọi endpoint tem chính thức rồi lưu vào R2.</li>
            <li>Shop chưa API: OMS tạo job <code>refresh_label</code>, Radar/local helper mở đúng Chrome shop để tải lại tem, không tự đổi trạng thái đơn.</li>
            <li>Tem lỗi cần xử lý trước khi đóng gói lại hoặc gửi khiếu nại có bằng chứng.</li>
          </ul>
        </section>
      </div>`;
  }
  
  function platformTemplateTabs() {
    return `
      <div class="label-vault-platform-tabs">
        ${Object.keys(DEFAULT_PLATFORM_MARKS).map(platform => `
          <button type="button" class="${labelVaultState.activePlatform === platform ? 'active' : ''}" data-template-platform="${platform}">
            ${platformLabel(platform)}
          </button>`).join('')}
      </div>`;
  }
  
  function renderTemplateSectionRows(settings) {
    const active = labelVaultState.activeTemplateSection || 'watermark';
    const rows = templateRows(settings);
    return `
      <div class="label-template-list">
        <div class="label-template-list-head">
          <span></span><span>Tên</span><span></span><span></span><span>Tạo lúc</span>
        </div>
        ${rows.map(section => {
          const isActive = active === section.id;
          const baseId = templateBaseId(section.id, settings);
          const enabled = baseId === 'logo'
            ? !!settings.logoDataUrl
            : baseId === 'camera'
              ? !!settings.cameraPromptEnabled
              : true;
          return `
            <div class="label-template-row ${isActive ? 'active' : ''}" data-template-row-section="${section.id}" role="button" tabindex="0">
              <button type="button" class="label-template-gear" data-template-section="${section.id}" title="Mở setting ${escapeHtml(section.name)}">⚙</button>
              <span><b>${escapeHtml(section.name)}</b><small>${escapeHtml(section.hint)}</small></span>
              <i title="${enabled ? 'Đã bật' : 'Đang tắt'}">${section.type === 'image' ? '▧' : 'ⓘ'}</i>
              <span class="label-template-row-actions">
                <button type="button" data-template-layer="${section.id}">▣ Lớp</button>
                <button type="button" data-template-copy="${section.id}" title="Sao chép mẫu">⎘</button>
                <button type="button" class="danger" data-template-delete="${section.id}" title="Ẩn mẫu">⌫</button>
              </span>
              <strong><span>${escapeHtml(section.created)}</span><em>${escapeHtml(templateCreatedAgo(section))}</em></strong>
            </div>`;
        }).join('')}
      </div>`;
  }
  
  function renderTemplateVariables() {
    return `
      <div class="label-variable-row">
        ${TEMPLATE_VARIABLES.map(variable => `<button type="button" data-template-variable="${variable}">${variable}</button>`).join('')}
      </div>`;
  }
  
  function renderTemplateEditor(settings) {
    const section = templateBaseId(labelVaultState.activeTemplateSection || 'watermark', settings);
    if (section === 'layout') {
      return `
        <div class="label-settings-section">
          <h3>Khổ in & mã vận đơn</h3>
          <div class="label-settings-grid">
            <label>
              <span>Kiểu in</span>
              <select id="labelFitMode" class="filter-input" data-template-input>
                <option value="a6" ${settings.fitMode === 'a6' ? 'selected' : ''}>Ép vừa khổ A6</option>
                <option value="keep" ${settings.fitMode === 'keep' ? 'selected' : ''}>Giữ nguyên khổ sàn</option>
              </select>
            </label>
            <label>
              <span>Rộng (mm)</span>
              <input id="labelWidthMm" type="number" min="50" max="220" step="1" class="filter-input" value="${escapeHtml(settings.widthMm)}" data-template-input>
            </label>
            <label>
              <span>Cao (mm)</span>
              <input id="labelHeightMm" type="number" min="50" max="220" step="1" class="filter-input" value="${escapeHtml(settings.heightMm)}" data-template-input>
            </label>
            <label>
              <span>Lề an toàn (mm)</span>
              <input id="labelMarginMm" type="number" min="0" max="10" step="0.5" class="filter-input" value="${escapeHtml(settings.marginMm)}" data-template-input>
            </label>
          </div>
        </div>`;
    }
    if (section === 'logo') {
      return `
        <div class="label-settings-section">
          <h3>Logo shop</h3>
          <div class="label-settings-grid">
            <label>
              <span>Chọn logo</span>
              <input id="labelLogoFile" type="file" accept="image/png,image/jpeg" class="filter-input">
            </label>
            <label>
              <span>Cỡ logo (mm)</span>
              <input id="labelLogoSizeMm" type="number" min="8" max="40" step="1" class="filter-input" value="${escapeHtml(settings.logoSizeMm)}" data-template-input>
            </label>
            <label>
              <span>Vị trí logo</span>
              <select id="labelLogoPosition" class="filter-input" data-template-input>
                ${['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(pos => `<option value="${pos}" ${settings.logoPosition === pos ? 'selected' : ''}>${pos}</option>`).join('')}
              </select>
            </label>
          </div>
          <button type="button" class="btn btn-ghost" data-label-clear-logo>Xóa logo</button>
        </div>`;
    }
    if (section === 'camera') {
      return `
        <div class="label-settings-section">
          <h3>Ký hiệu quay video</h3>
          <label class="label-check">
            <input type="checkbox" id="labelCameraPromptEnabled" ${settings.cameraPromptEnabled ? 'checked' : ''} data-template-input>
            <span>Thêm ký hiệu máy quay nhắc khách quay phim khi khui hàng</span>
          </label>
          <label>
            <span>Nội dung nhắc quay video</span>
            <textarea id="labelCameraPromptText" rows="2" class="filter-input" data-template-input>${escapeHtml(settings.cameraPromptText)}</textarea>
          </label>
          ${renderTemplateVariables()}
          <label>
            <span>Văn bản 2 / hotline</span>
            <input id="labelFooterText" class="filter-input" value="${escapeHtml(settings.footerText)}" data-template-input>
          </label>
        </div>`;
    }
    return `
      <div class="label-settings-section">
        <h3>Nội dung hiển thị trên tem</h3>
        ${platformTemplateTabs()}
        <div class="label-settings-grid label-template-checkbox-grid">
          <label class="label-check"><input type="checkbox" id="labelShowItemName" ${settings.showItemName ? 'checked' : ''} data-template-input><span>Tên mặt hàng</span></label>
          <label class="label-check"><input type="checkbox" id="labelShowProductName" ${settings.showProductName ? 'checked' : ''} data-template-input><span>Tên sản phẩm</span></label>
          <label class="label-check"><input type="checkbox" id="labelShowSku" ${settings.showSku ? 'checked' : ''} data-template-input><span>SKU</span></label>
          <label>
            <span>Size</span>
            <input id="labelItemTextSize" type="range" min="-2" max="4" step="1" class="filter-input" value="${escapeHtml(settings.itemTextSize || 0)}" data-template-input>
          </label>
        </div>
        <label class="label-check"><span>Hiển thị ghi chú của khách</span><input type="checkbox" id="labelShowCustomerNote" ${settings.showCustomerNote ? 'checked' : ''} data-template-input></label>
        <label class="label-check"><span>Hiển thị ghi chú của người bán</span><input type="checkbox" id="labelShowSellerNote" ${settings.showSellerNote ? 'checked' : ''} data-template-input></label>
        <label class="label-check"><span>Mã vận đơn</span><input type="checkbox" id="labelShowTracking" ${settings.showTracking ? 'checked' : ''} data-template-input></label>
        <label class="label-check"><span>ID đơn hàng</span><input type="checkbox" id="labelShowOrderId" ${settings.showOrderId ? 'checked' : ''} data-template-input></label>
      </div>`;
  }
  
  function logoPositionClass(position) {
    const normalized = String(position || 'top-left').toLowerCase();
    if (normalized.includes('bottom') && normalized.includes('right')) return 'bottom-right';
    if (normalized.includes('bottom')) return 'bottom-left';
    if (normalized.includes('right')) return 'top-right';
    return 'top-left';
  }
  
  function renderRealLabelPreviewOverlays(settings) {
    const overlayOn = settings.overlayEnabled !== false;
    const logo = overlayOn && settings.logoDataUrl
      ? `<img class="label-real-logo ${logoPositionClass(settings.logoPosition)}" src="${escapeHtml(settings.logoDataUrl)}" alt="Logo shop">`
      : '';
    const camera = overlayOn && settings.cameraPromptEnabled
      ? `<div class="label-real-camera"><span>REC</span><b>${escapeHtml(settings.cameraPromptText || '')}</b></div>`
      : '';
    const footer = overlayOn && settings.footerText
      ? `<div class="label-real-footer">${escapeHtml(settings.footerText)}</div>`
      : '';
    return logo || camera || footer
      ? `<div class="label-real-overlays">${logo}${camera}${footer}</div>`
      : '';
  }
  
  function renderRealLabelPreview(settings, sample, platform) {
    const labelUrl = buildLabelUrl(sample.order_id, sample);
    const frameUrl = `${labelUrl}#toolbar=0&navpanes=0&scrollbar=0`;
    return `
      <div class="label-real-preview-card">
        <div class="label-real-frame">
          <iframe src="${escapeHtml(frameUrl)}" title="Tem thật ${escapeHtml(platformLabel(platform))} ${escapeHtml(sample.order_id)}"></iframe>
          ${renderRealLabelPreviewOverlays(settings)}
        </div>
        <div class="label-real-meta">
          <b>Tem thật đang dùng</b>
          <span>${escapeHtml(platformLabel(platform))} · ${escapeHtml(sample.shop || 'Chưa rõ shop')} · ${escapeHtml(sample.order_id)}</span>
        </div>
      </div>`;
  }
  
  function renderTemplatePreview(settings = labelVaultState.previewSettings || getLabelSettings()) {
    const platform = normalizePlatform(labelVaultState.activePlatform || 'shopee');
    const sample = previewLabelForPlatform(platform);
    if (!sample) {
      if (!labelVaultState.previewLoading[platform]) ensureRealLabelPreview(platform);
      return `
        <div class="label-real-preview-card is-loading">
          <div class="label-real-empty">
            <b>${labelVaultState.previewLoading[platform] ? 'Đang lấy tem thật...' : 'Chưa có tem thật để xem trước'}</b>
            <span>${escapeHtml(labelVaultState.previewErrors[platform] || `OMS sẽ lấy tem ${platformLabel(platform)} đã lưu trong kho để preview.`)}</span>
          </div>
        </div>`;
    }
    return renderRealLabelPreview(settings, sample, platform);
  
  }
  
  function renderTemplatePanel() {
    const settings = labelVaultState.previewSettings || getLabelSettings();
    const overlayOn = settings.overlayEnabled !== false;
    const activeBase = templateSectionById(templateBaseId(labelVaultState.activeTemplateSection || 'watermark', settings)) || TEMPLATE_SECTIONS[1];
    const addLabel = activeBase.name.replace(/^Mẫu\s*/i, '').toLowerCase();
    return `
      <div class="label-template-layout">
        <section class="label-template-form">
          <div class="label-template-togglebar">
            <button type="button" class="label-template-switch ${overlayOn ? 'on' : ''}" data-template-toggle-overlay aria-pressed="${overlayOn ? 'true' : 'false'}">
              <span>${overlayOn ? 'Đã bật' : 'Đang tắt'}</span>
            </button>
            <b>Tuỳ chỉnh trang in, logo và nhắc quay video</b>
          </div>
          <div class="label-template-head">
            ${platformTemplateTabs()}
            <button type="button" class="label-template-add" data-template-copy="${labelVaultState.activeTemplateSection || 'watermark'}">＋ Thêm mẫu(${escapeHtml(addLabel)})</button>
          </div>
          <div class="label-template-workspace">
            <div>
              ${renderTemplateSectionRows(settings)}
              <div class="label-template-editor">
                ${renderTemplateEditor(settings)}
              </div>
            </div>
          </div>
        </section>
        <aside class="label-template-preview">
          <div class="label-preview-title">Xem trước</div>
          <div id="labelTemplatePreview">${renderTemplatePreview(settings)}</div>
        </aside>
      </div>`;
  }
  
  function renderLabelVaultPanel() {
    const modal = document.getElementById('labelSettingsModal');
    const panel = modal?.querySelector('#labelVaultPanel');
    if (!panel) return;
  
    if (labelVaultState.activeTab === 'errors') {
      panel.innerHTML = renderWarehousePanel('error');
    } else if (labelVaultState.activeTab === 'actions') {
      panel.innerHTML = renderActionPanel();
    } else if (labelVaultState.activeTab === 'template') {
      panel.innerHTML = renderTemplatePanel();
    } else {
      panel.innerHTML = renderWarehousePanel(labelVaultState.loadedStatus === 'ok' ? 'ok' : 'all');
    }
  }
  
  function renderModalShell(modal) {
    modal.innerHTML = `
      <div class="modal label-settings-modal label-vault-modal">
        <div class="modal-header">
          <div>
            <div class="modal-title">In phiếu sàn</div>
            <div class="label-vault-subtitle">In lại tem đã lưu, xem lịch sử và tuỳ chỉnh mẫu in theo từng sàn.</div>
          </div>
          <a class="label-vault-tip" href="#" data-label-tab="template">Mẹo</a>
          <button type="button" class="modal-close" data-label-close>×</button>
        </div>
        <div class="label-vault-tabs">
          ${labelTabButton('warehouse', 'IN ĐƠN HÀNG')}
          ${labelTabButton('actions', 'LỊCH SỬ IN')}
          ${labelTabButton('template', 'TÙY CHỈNH PHIẾU GIAO HÀNG')}
        </div>
        <div class="label-settings-body" id="labelVaultPanel"></div>
        <div class="label-settings-actions">
          <button type="button" class="btn btn-ghost" data-label-close>Đóng</button>
          <button type="button" class="btn btn-primary" data-label-save-template>Lưu mẫu in</button>
        </div>
      </div>`;
  }

  return {
    renderLabelVaultPanel,
    renderModalShell,
    renderTemplatePreview
  };
}
