window.generatePublishAiVariants = async function() {
  normalizePublishUiText();
  const enabled = document.getElementById('publishAiRewriteToggle')?.checked !== false;
  const status = document.getElementById('publishAiStatus');
  const btn = document.getElementById('btnPublishAiVariants');
  if (!enabled) {
    if (status) status.textContent = 'Đang tắt AI. Bật lại nếu muốn tạo nội dung riêng theo từng shop.';
    return;
  }

  const ids = getPublishSourceFilteredIds();
  const targetShopDetails = getPublishTargetShopDetails();
  if (!ids.length) return showToast('Chưa chọn bài đăng nguồn để tạo nội dung AI.', true);
  if (!targetShopDetails.length) return showToast('Chưa chọn shop đích để AI viết nội dung theo shop.', true);

  const sourceListings = (window.currentPublishPreview?.listings?.length)
    ? window.currentPublishPreview.listings
    : buildLocalPublishListings(getPublishSourceFilteredRows());
  if (!sourceListings.length) return showToast('Chưa có preview bài đăng nguồn.', true);

  const oldText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Đang tạo...';
  }
  if (status) status.textContent = 'Đang tạo nội dung khác nhau cho từng shop đích...';

  try {
    const res = await fetch(API + '/api/products/publish-content-variants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listings: sourceListings,
        target_shop_details: targetShopDetails,
        listing_overrides: getPublishListingOverrides()
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Không tạo được nội dung AI');
    window.currentPublishAiVariants = Array.isArray(data.variants) ? data.variants : [];
    renderPublishAiVariantList(window.currentPublishAiVariants);
    const first = window.currentPublishAiVariants[0];
    if (first?.title) document.getElementById('publishTitleInput').value = first.title;
    if (first?.description) document.getElementById('publishDescInput').value = first.description;
    if (status) {
      const fallback = data.provider === 'local-fallback' ? ' Hệ thống đang dùng mẫu local vì AI key/quota chưa sẵn sàng.' : '';
      status.textContent = `Đã tạo ${window.currentPublishAiVariants.length} phiên bản nội dung theo shop đích.${fallback}`;
    }
  } catch (err) {
    window.currentPublishAiVariants = [];
    renderPublishAiVariantList([]);
    if (status) status.textContent = 'Lỗi tạo nội dung AI: ' + err.message;
    showToast('Lỗi tạo nội dung AI: ' + err.message, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText || 'Tạo nội dung AI';
    }
  }
}

function renderMultiPublishWorkspace(previewData) {
  const ids = window.currentPublishDraftIds || [];
  const allRows = getPublishCandidateRows();
  const hasPreselectedSku = Boolean(ids.length);
  renderPublishTargetShopList();
  renderPublishSourceShopList(allRows);
  const sourceRows = filterRowsBySourceSelection(allRows);
  const visibleSourceRows = filterRowsBySourceSearch(sourceRows);
  const sourceListings = buildLocalPublishListings(visibleSourceRows);
  renderPublishSelectedList(visibleSourceRows, sourceListings);
  const rows = filterRowsByListingSelection(sourceRows);
  const filteredIds = rows.map(row => Number(row.id)).filter(Number.isFinite);
  const listings = previewData?.listings?.length && filteredIds.length ? previewData.listings : buildLocalPublishListings(rows);
  const countEl = document.getElementById('multiPublishCount');
  const saveBtn = document.getElementById('btnSavePublishDraft');
  const summary = document.getElementById('publishDraftSummary');
  const sourceSummary = document.getElementById('publishSourceSummary');

  if (countEl) countEl.textContent = filteredIds.length;
  if (saveBtn) saveBtn.disabled = !filteredIds.length;
  if (summary) {
    const warningCount = previewData?.validation?.warning_count ?? listings.reduce((sum, item) => sum + (item.validation?.warnings?.length || 0), 0);
    summary.innerHTML = filteredIds.length
      ? `Đã chọn <b>${filteredIds.length}</b>${hasPreselectedSku ? '/' + ids.length : ''} SKU nguồn, gom thành <b>${listings.length}</b> bài đăng. Cảnh báo cần rà soát: <b>${warningCount}</b>.`
      : (sourceRows.length ? 'Tick bài đăng nguồn trong danh sách để xem nội dung và tạo bản nháp.' : (allRows.length ? 'Chưa chọn shop nguồn nên chưa thể tạo bản nháp.' : 'Chưa có dữ liệu bài đăng nguồn. Hãy đồng bộ SKU/bài đăng từ sàn trước.'));
  }
  if (sourceSummary) {
    sourceSummary.textContent = allRows.length
      ? 'Shop nguồn dùng để lọc nhanh. Bài đăng nguồn bên trên mới là phần cần tick để lấy tên, mô tả, ảnh và video.'
      : 'Chưa có dữ liệu bài đăng nguồn. Hãy đồng bộ SKU/bài đăng từ sàn trước.';
  }

  const first = listings[0];
  applyPublishListingToEditor(first, { includeDetails: Boolean(previewData?.listings?.length) });

  renderPublishListingPreview(listings);
  renderPublishAiVariantList();
}

window.selectPublishSourceShop = function(key) {
  if (!key || key === window.publishActiveSourceShopKey) return;
  window.publishActiveSourceShopKey = key;
  clearPublishSourceListingSelection();
  clearPublishEditorContentFields();
  window.currentPublishPreview = null;
  window.currentPublishAiVariants = [];
  const searchInput = document.getElementById('publishSourceSearchInput');
  if (searchInput) searchInput.value = '';
  window.publishSourceSearchTerm = '';
  renderMultiPublishWorkspace(null);
  window.refreshMultiPublishPreview();
}

window.onPublishSourceSearchInput = function() {
  window.publishSourceSearchTerm = document.getElementById('publishSourceSearchInput')?.value || '';
  rememberPublishSourceListingSelection();
  renderMultiPublishWorkspace(window.currentPublishPreview);
}

window.onPublishSourceListingChange = function(input) {
  const selected = getPublishSelectedSourceListingSet();
  if (input?.checked) selected.add(input.value);
  else if (input?.value) selected.delete(input.value);
  clearPublishEditorContentFields();
  window.currentPublishPreview = null;
  window.currentPublishAiVariants = [];
  window.refreshMultiPublishPreview();
}

window.refreshMultiPublishPreview = async function() {
  renderPublishTargetShopList();
  const ids = getPublishSourceFilteredIds();
  const status = document.getElementById('publishPreviewStatus');
  if (!ids.length) {
    renderMultiPublishWorkspace(null);
    if (status) status.textContent = 'Chưa chọn SKU/shop nguồn nên chưa có preview.';
    return;
  }

  if (status) status.textContent = 'Đang lấy cấu trúc bài đăng từ dữ liệu API đã đồng bộ...';
  try {
    const res = await fetch(API + '/api/products/publish-draft-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids,
        target_platforms: getPublishTargets(),
        target_shops: getPublishTargetShops(),
        target_shop_details: getPublishTargetShopDetails(),
        source_shop_details: getPublishSourceShopDetails(),
        source_listing_details: getPublishSourceListingDetails(),
        listing_overrides: getPublishListingOverrides()
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Không lấy được preview');
    window.currentPublishPreview = data;
    renderMultiPublishWorkspace(data);
    if (status) status.textContent = `Đã lấy preview: ${data.listings?.length || 0} bài đăng, ${data.items || ids.length} SKU.`;
  } catch (err) {
    window.currentPublishPreview = null;
    renderMultiPublishWorkspace(null);
    if (status) status.textContent = 'Không lấy được preview từ server, đang hiển thị dữ liệu local: ' + err.message;
  }
}

window.onPublishTargetPlatformChange = function() {
  window.currentPublishAiVariants = [];
  renderPublishTargetShopList();
  ensurePublishShopOptions().then(() => {
    renderPublishTargetShopList();
    window.refreshMultiPublishPreview();
  });
}

window.openMultiPublishDraft = function() {
  window.currentPublishDraftIds = getSelectedPublishIds();
  window.currentPublishPreview = null;
  resetPublishEditorFields();
  const modal = document.getElementById('multiPublishModal');
  if (modal) modal.style.display = 'flex';
  normalizePublishUiText();
  renderMultiPublishWorkspace(null);
  if (!window.currentPublishDraftIds.length) {
    const status = document.getElementById('publishPreviewStatus');
    if (status) status.textContent = 'Tick bài đăng nguồn ở danh sách bên trên để xem nội dung.';
  }
  ensurePublishShopOptions().then(() => {
    renderPublishTargetShopList();
    if (window.currentPublishDraftIds.length) window.refreshMultiPublishPreview();
    else renderMultiPublishWorkspace(null);
  });
}

window.closeMultiPublishDraft = function() {
  const modal = document.getElementById('multiPublishModal');
  if (modal) modal.style.display = 'none';
}

window.saveMultiPublishDraft = async function() {
  const ids = getPublishSourceFilteredIds();
  const target_platforms = getPublishTargets();
  const target_shops = getPublishTargetShops();
  const target_shop_details = getPublishTargetShopDetails();
  const source_shop_details = getPublishSourceShopDetails();
  const source_listing_details = getPublishSourceListingDetails();
  const listing_overrides = getPublishListingOverrides();
  const content_variants = getPublishContentVariantsForPayload();

  if (!ids.length) return showToast('Chưa chọn SKU hoặc shop nguồn để tạo bản nháp.', true);
  if (!target_platforms.length) return showToast('Chọn ít nhất 1 sàn cần đăng.', true);
  if (!target_shop_details.length) return showToast('Chọn ít nhất 1 shop đích để đăng lên.', true);

  const btn = document.getElementById('btnSavePublishDraft');
  const oldText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Đang tạo...';
  }

  try {
    const res = await fetch(API + '/api/products/publish-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids,
        target_platforms,
        target_shops,
        target_shop_details,
        source_shop_details,
        source_listing_details,
        listing_overrides,
        content_variants,
        title: listing_overrides.title
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Không tạo được bản nháp');
    showToast(`Đã tạo bản nháp #${data.draft_id}: ${data.listings || 1} bài đăng, ${data.items || ids.length} SKU.`);
    closeMultiPublishDraft();
  } catch (err) {
    showToast('Lỗi tạo bản nháp: ' + err.message, true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = oldText;
    }
  }
}
