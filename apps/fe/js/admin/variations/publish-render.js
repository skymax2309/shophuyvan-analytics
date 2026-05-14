function applyPublishListingToEditor(listing, options = {}) {
  if (!listing) return;
  const force = Boolean(options.force);
  const includeDetails = Boolean(options.includeDetails);
  setPublishFieldValue('publishTitleInput', listing.title || '', force);
  if (!includeDetails) return;

  setPublishFieldValue('publishDescInput', listing.description || '', force);
  setPublishFieldValue('publishVideoInput', listing.video_url || listing.media_status?.video_url || '', force);
  setPublishFieldValue(
    'publishCategoryInput',
    listing.category?.target_category || listing.category?.source_category || listing.category?.source_category_id || '',
    force
  );
  setPublishFieldValue('publishBrandInput', listing.brand || '', force);
  setPublishFieldValue('publishImagesInput', (listing.images || []).join('\n'), force);
  setPublishFieldValue('publishAttributesInput', formatPublishAttributesForEditor(listing.attributes), force);
  setPublishFieldValue('publishWeightInput', listing.logistics?.weight_kg || '', force);
  setPublishFieldValue('publishLengthInput', listing.logistics?.length_cm || '', force);
  setPublishFieldValue('publishWidthInput', listing.logistics?.width_cm || '', force);
  setPublishFieldValue('publishHeightInput', listing.logistics?.height_cm || '', force);
}

function publishAttributeCount(value) {
  return normalizePublishAttributes(value).filter(item => publishAttributeName(item) || publishAttributeValue(item)).length;
}

function publishStatusChip(ok, label, detail = '') {
  return `<span class="publish-status-chip ${ok ? 'ok' : 'warn'}">${ok ? '✓' : '!'} ${escapeHtml(label)}${detail ? ` <small>${escapeHtml(detail)}</small>` : ''}</span>`;
}

function publishCompletenessHtml(listing) {
  const c = listing.completeness || {};
  const logistics = listing.logistics || {};
  const dimensionsOk = Boolean(logistics.length_cm && logistics.width_cm && logistics.height_cm);
  return `
    <div class="publish-completeness-grid">
      ${publishStatusChip(Boolean(c.has_description || listing.description), 'Mô tả')}
      ${publishStatusChip(Number(c.image_count || listing.images?.length || 0) > 0, 'Ảnh', `${Number(c.image_count || listing.images?.length || 0)} ảnh`)}
      ${publishStatusChip(Boolean(c.has_video || listing.video_url), 'Video')}
      ${publishStatusChip(Boolean(c.has_category || listing.category?.target_category || listing.category?.source_category), 'Ngành hàng', listing.category?.target_category || listing.category?.source_category || '')}
      ${publishStatusChip(publishAttributeCount(listing.attributes) > 0, 'Thuộc tính', `${publishAttributeCount(listing.attributes)} mục`)}
      ${publishStatusChip(Boolean(logistics.weight_kg), 'Khối lượng', logistics.weight_kg ? `${logistics.weight_kg} kg` : '')}
      ${publishStatusChip(dimensionsOk, 'Kích thước', dimensionsOk ? `${logistics.length_cm}×${logistics.width_cm}×${logistics.height_cm} cm` : '')}
    </div>
  `;
}

function publishMediaPreviewHtml(listing) {
  const images = listing.images || [];
  const videoUrl = listing.video_url || listing.media_status?.video_url || '';
  return `
    <div class="publish-listing-media">
      ${images.slice(0, 8).map(url => `<img src="${publishImageUrl(url)}" alt="">`).join('')}
      ${images.length > 8 ? `<span class="variation-chip publish-media-more">+${images.length - 8} ảnh</span>` : ''}
      ${videoUrl ? `<a class="publish-video-pill" href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener">Video đã lấy</a>` : '<span class="publish-video-pill missing">Chưa có video</span>'}
    </div>
  `;
}

function publishAttributePreviewHtml(attributes) {
  const rows = normalizePublishAttributes(attributes).slice(0, 10);
  if (!rows.length) return '<div class="publish-note publish-attribute-empty">Chưa có thuộc tính ngành hàng từ nguồn.</div>';
  return `
    <div class="publish-attribute-list">
      ${rows.map(item => `
        <div>
          <b>${escapeHtml(publishAttributeName(item) || 'Thuộc tính')}</b>
          <span>${escapeHtml(publishAttributeValue(item) || '-')}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function buildLocalPublishListings(rows) {
  const groups = new Map();
  rows.forEach(row => {
    const key = getPublishRowListingKey(row);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        source_platform: row.platform || '',
        source_shop: row.shop || '',
        source_item_id: row.platform_item_id || '',
        title: row.product_name || '',
        description: '',
        images: [],
        video_url: '',
        category: { source_category: '', target_category: '' },
        brand: '',
        attributes: [],
        logistics: { weight_kg: 0, length_cm: 0, width_cm: 0, height_cm: 0 },
        pricing: { min_price: 0, max_price: 0 },
        stock: { total: 0 },
        variations: [],
        media_status: { image_count: 0, has_video: false, video_url: '' },
        validation: { warnings: ['Preview local, đang chờ server bổ sung mô tả/ảnh/video từ API'] }
      });
    }
    const listing = groups.get(key);
    if (row.image_url && !listing.images.includes(row.image_url)) listing.images.push(row.image_url);
    const price = Number(row.discount_price || row.price || 0);
    if (price) {
      listing.pricing.min_price = listing.pricing.min_price ? Math.min(listing.pricing.min_price, price) : price;
      listing.pricing.max_price = Math.max(listing.pricing.max_price || 0, price);
    }
    listing.stock.total += Number(row.stock || 0);
    listing.variations.push({
      id: row.id,
      name: row.variation_name || 'Mặc định',
      platform_sku: row.platform_sku || '',
      internal_sku: row.internal_sku || '',
      price: Number(row.price || 0),
      discount_price: Number(row.discount_price || 0),
      stock: Number(row.stock || 0),
      map_status: row.map_status || ''
    });
    listing.media_status.image_count = listing.images.length;
  });
  return [...groups.values()];
}

function getPublishSourceSearchTerm() {
  const inputValue = document.getElementById('publishSourceSearchInput')?.value || window.publishSourceSearchTerm || '';
  window.publishSourceSearchTerm = String(inputValue || '').trim();
  return window.publishSourceSearchTerm.toLowerCase();
}

function publishSearchTextMatches(value, term) {
  if (!term) return true;
  return String(value || '').toLowerCase().includes(term);
}

function rowMatchesPublishSourceSearch(row, term) {
  if (!term) return true;
  return [
    row.product_name,
    row.variation_name,
    row.platform_sku,
    row.internal_sku,
    row.platform_item_id,
    getPublishRowShop(row),
    row.platform
  ].some(value => publishSearchTextMatches(value, term));
}

function filterRowsBySourceSearch(rows) {
  const term = getPublishSourceSearchTerm();
  if (!term) return rows;
  return rows.filter(row => rowMatchesPublishSourceSearch(row, term));
}

function renderPublishTargetShopList() {
  const wrap = document.getElementById('publishTargetShopList');
  const hidden = document.getElementById('publishTargetShopInput');
  if (!wrap) return;

  const targetPlatforms = getPublishTargets().map(normalizePublishPlatform);
  const existingInputs = getPublishTargetShopInputs();
  const hasUsableExistingInputs = existingInputs.some(cb => !cb.disabled);
  const existingByPlatform = new Set(existingInputs.map(cb => normalizePublishPlatform(cb.dataset.platform)));
  const checkedBefore = new Set(existingInputs.filter(cb => cb.checked).map(cb => cb.value));
  const sourceOptions = window.publishShopOptions?.length
    ? window.publishShopOptions
    : getPublishShopOptionsFromVariations();
  const options = sourceOptions.filter(option => targetPlatforms.includes(option.platform));

  if (!targetPlatforms.length) {
    wrap.innerHTML = '<div class="publish-note">Chọn ít nhất một sàn trước khi chọn shop đích.</div>';
    if (hidden) hidden.value = '';
    return;
  }

  if (!options.length) {
    wrap.innerHTML = '<div class="publish-note">Chưa có shop đích phù hợp. Vào “Kết nối & Đồng bộ” để thêm/kết nối shop, hoặc đồng bộ SKU trước.</div>';
    if (hidden) hidden.value = '';
    return;
  }

  wrap.innerHTML = options.map(option => {
    const canPublish = Boolean(option.apiConnected);
    const shouldCheck = canPublish && (
      checkedBefore.has(option.key) ||
      !existingInputs.length ||
      (!hasUsableExistingInputs && !checkedBefore.size) ||
      !existingByPlatform.has(option.platform)
    );
    return `
      <label class="publish-shop-option">
        <input type="checkbox"
          class="publish-target-shop"
          value="${escapeHtml(option.key)}"
          data-platform="${escapeHtml(option.platform)}"
          data-shop="${escapeHtml(option.shop)}"
          ${shouldCheck ? 'checked' : ''}
          ${canPublish ? '' : 'disabled'}
          onchange="refreshMultiPublishPreview()">
        <span>
          <strong>${escapeHtml(option.platform)}</strong>
          <em>${escapeHtml(option.shop)}</em>
          <small>${escapeHtml(option.source || 'Shop đích')}</small>
        </span>
      </label>
    `;
  }).join('');

  if (hidden) hidden.value = getPublishTargetShops().join(', ');
}

function renderPublishSourceShopList(rows) {
  const wrap = document.getElementById('publishSourceShopList');
  if (!wrap) return;
  wrap.classList.add('publish-source-shop-filter');

  const options = getPublishShopOptionsFromVariations(rows).map(option => ({
    ...option,
    source: `${rows.filter(row => publishShopKey(row.platform, getPublishRowShop(row)) === option.key).length} SKU nguồn`
  }));
  const existingInputs = getPublishSourceShopInputs();
  const existingByPlatform = new Set(existingInputs.map(cb => normalizePublishPlatform(cb.dataset.platform)));
  const checkedBefore = new Set(existingInputs.filter(cb => cb.checked).map(cb => cb.value));

  if (!rows.length) {
    wrap.innerHTML = '<div class="publish-note">Tick SKU để hiện shop nguồn lấy thông tin bài đăng.</div>';
    return;
  }

  if (!options.length) {
    wrap.innerHTML = '<div class="publish-note">Các SKU đã chọn chưa có thông tin shop nguồn.</div>';
    return;
  }

  wrap.innerHTML = options.map(option => {
    const shouldCheck = !existingInputs.length || !existingByPlatform.has(option.platform) || checkedBefore.has(option.key);
    return `
      <label class="publish-shop-option publish-source-filter-option">
        <input type="checkbox"
          class="publish-source-shop"
          value="${escapeHtml(option.key)}"
          data-platform="${escapeHtml(option.platform)}"
          data-shop="${escapeHtml(option.shop)}"
          ${shouldCheck ? 'checked' : ''}
          onchange="refreshMultiPublishPreview()">
        <span>
          <strong>${escapeHtml(option.platform)}</strong>
          <em>${escapeHtml(option.shop)}</em>
          <small>${escapeHtml(option.source)}</small>
        </span>
      </label>
    `;
  }).join('');
}

function renderPublishSourceShopList(rows) {
  const wrap = document.getElementById('publishSourceShopList');
  if (!wrap) return;
  wrap.classList.add('publish-source-shop-filter');

  const options = getPublishSourceShopOptions(rows);
  const activeKey = getActivePublishSourceShopKey(rows);

  if (!rows.length) {
    wrap.innerHTML = '<div class="publish-note">Chưa có bài đăng nguồn. Hãy đồng bộ bài đăng từ sàn trước.</div>';
    return;
  }

  if (!options.length) {
    wrap.innerHTML = '<div class="publish-note">Các SKU đang có chưa gắn được shop nguồn.</div>';
    return;
  }

  wrap.innerHTML = options.map(option => `
    <button type="button"
      class="publish-source-shop-card publish-source-shop ${option.key === activeKey ? 'active' : ''}"
      data-platform="${escapeHtml(option.platform)}"
      data-shop="${escapeHtml(option.shop)}"
      data-key="${escapeHtml(option.key)}"
      onclick="selectPublishSourceShop(this.dataset.key)">
      <strong>${escapeHtml(option.platform)}</strong>
      <span>${escapeHtml(option.shop)}</span>
      <small>${escapeHtml(option.source)}</small>
    </button>
  `).join('');
}

function renderPublishSelectedList(rows, listings) {
  const wrap = document.getElementById('publishSelectedList');
  if (!wrap) return;
  const term = getPublishSourceSearchTerm();
  if (!rows.length) {
    wrap.innerHTML = '<div class="publish-note">Chưa có bài đăng nguồn nào trong shop đang chọn.</div>';
    return;
  }
  if (!listings.length) {
    wrap.innerHTML = '<div class="publish-note">Các SKU/shop nguồn đang chọn chưa gom được bài đăng nguồn.</div>';
    return;
  }

  const existingInputs = getPublishSourceListingInputs();
  const checkedBefore = new Set(existingInputs.filter(cb => cb.checked).map(cb => cb.value));
  const selectedBefore = getPublishSelectedSourceListingSet();
  const hasPreselectedSku = Boolean((window.currentPublishDraftIds || []).length);
  wrap.innerHTML = `
    <div class="publish-source-list-title">Tick bài đăng nguồn cần lấy nội dung</div>
    ${term ? `<div class="publish-note">Đang lọc theo "${escapeHtml(window.publishSourceSearchTerm)}".</div>` : ''}
    ${listings.map(item => {
      const key = getPublishListingKey(item);
      const checked = selectedBefore.has(key) || checkedBefore.has(key) || (!selectedBefore.size && !existingInputs.length && hasPreselectedSku);
      const imageCount = Number(item.media_status?.image_count || item.images?.length || 0);
      const hasVideo = Boolean(item.media_status?.has_video || item.video_url);
      const attributeCount = publishAttributeCount(item.attributes);
      const categoryText = item.category?.target_category || item.category?.source_category || item.category?.source_category_id || '';
      return `
    <label class="publish-source-card">
      <input type="checkbox"
        class="publish-source-listing"
        value="${escapeHtml(key)}"
        data-platform="${escapeHtml(item.source_platform || '')}"
        data-shop="${escapeHtml(item.source_shop || '')}"
        data-item-id="${escapeHtml(item.source_item_id || '')}"
        data-title="${escapeHtml(item.title || '')}"
        ${checked ? 'checked' : ''}
        onchange="onPublishSourceListingChange(this)">
      <img src="${publishImageUrl(item.images?.[0])}" alt="">
      <div>
        <div class="publish-source-title">${escapeHtml(item.title || 'Sản phẩm chưa có tên')}</div>
        <div class="publish-source-meta">
          ${escapeHtml((item.source_platform || '').toUpperCase())} · ${escapeHtml(item.source_shop || '-')}<br>
          ${item.variations?.length || 0} phân loại · Tồn ${Number(item.stock?.total || 0)}<br>
          ${imageCount} ảnh${hasVideo ? ' · Có video' : ' · Chưa có video'}<br>
          ${categoryText ? `Ngành ${escapeHtml(categoryText)} · ` : ''}${attributeCount} thuộc tính
        </div>
      </div>
    </label>
      `;
    }).join('')}
    <button type="button" class="publish-jump-button" onclick="document.querySelector('.publish-editor')?.scrollIntoView({ block: 'start', behavior: 'smooth' })">
      Xem nội dung bài đăng
    </button>
  `;
}

function renderPublishListingPreview(listings) {
  const wrap = document.getElementById('publishListingEditor');
  if (!wrap) return;
  if (!listings.length) {
    wrap.innerHTML = '<div class="publish-note">Chưa có bài đăng để xem trước.</div>';
    return;
  }
  wrap.innerHTML = listings.map(listing => {
    const warnings = listing.validation?.warnings || [];
    const images = listing.images || [];
    const variants = listing.variations || [];
    const attributeCount = publishAttributeCount(listing.attributes);
    const sourceInfo = listing.source_snapshot?.has_product_knowledge
      ? `Dữ liệu API đầy đủ · cập nhật ${escapeHtml(listing.source_snapshot.knowledge_updated_at || '-')}`
      : (listing.source_snapshot?.has_app_config_draft ? 'Dữ liệu nháp từ lần đồng bộ cũ' : 'Dữ liệu local, cần đồng bộ API để đủ media/thuộc tính');
    return `
      <div class="publish-listing-card">
        <div class="publish-listing-title">${escapeHtml(listing.title || 'Bài đăng chưa có tên')}</div>
        <div class="publish-listing-meta">
          ${escapeHtml((listing.source_platform || '').toUpperCase())} · ${escapeHtml(listing.source_shop || '-')} ·
          ${variants.length} phân loại · Tồn ${Number(listing.stock?.total || 0)} ·
          Giá ${formatPublishMoney(listing.pricing?.min_price)}${listing.pricing?.max_price && listing.pricing.max_price !== listing.pricing.min_price ? ' - ' + formatPublishMoney(listing.pricing.max_price) : ''}<br>
          ${sourceInfo}
        </div>
        ${publishCompletenessHtml(listing)}
        ${warnings.length ? `<div class="publish-warning-list">${warnings.map(w => '⚠ ' + escapeHtml(w)).join('<br>')}</div>` : '<div class="publish-note" style="margin-top:8px;color:#16a34a;">Đủ dữ liệu cơ bản để rà soát trước khi đăng.</div>'}
        ${publishMediaPreviewHtml(listing)}
        <div class="publish-listing-extra">
          <div><b>Ngành hàng</b><span>${escapeHtml(listing.category?.target_category || listing.category?.source_category || listing.category?.source_category_id || 'Chưa có')}</span></div>
          <div><b>Thương hiệu</b><span>${escapeHtml(listing.brand || 'No Brand')}</span></div>
          <div><b>Thuộc tính</b><span>${attributeCount} mục</span></div>
          <div><b>Đóng gói</b><span>${escapeHtml(`${listing.logistics?.weight_kg || 0} kg · ${listing.logistics?.length_cm || 0}x${listing.logistics?.width_cm || 0}x${listing.logistics?.height_cm || 0} cm`)}</span></div>
        </div>
        ${publishAttributePreviewHtml(listing.attributes)}
        <table class="publish-variant-table">
          <thead><tr><th>Phân loại</th><th>SKU sàn</th><th>SKU kho</th><th>Giá</th><th>Tồn</th></tr></thead>
          <tbody>
            ${variants.slice(0, 20).map(v => `
              <tr>
                <td>${escapeHtml(v.name || 'Mặc định')}</td>
                <td>${escapeHtml(v.platform_sku || '-')}</td>
                <td>${escapeHtml(v.internal_sku || '-')}</td>
                <td>${formatPublishMoney(v.discount_price || v.price)}</td>
                <td>${Number(v.stock || 0)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }).join('');
}

function renderPublishAiVariantList(variants = window.currentPublishAiVariants || []) {
  const wrap = document.getElementById('publishAiVariantList');
  if (!wrap) return;
  if (!variants.length) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = variants.slice(0, 12).map(item => `
    <div class="publish-ai-variant-card">
      <strong>${escapeHtml((item.target_platform || '').toUpperCase())} · ${escapeHtml(item.target_shop || '-')}</strong>
      <span>${escapeHtml(item.title || 'Chưa có tiêu đề AI')}</span>
    </div>
  `).join('') + (variants.length > 12 ? `<div class="publish-note">Còn ${variants.length - 12} phiên bản AI khác sẽ được lưu trong bản nháp.</div>` : '');
}

function getPublishContentVariantsForPayload() {
  const enabled = document.getElementById('publishAiRewriteToggle')?.checked !== false;
  return enabled ? (window.currentPublishAiVariants || []) : [];
}
