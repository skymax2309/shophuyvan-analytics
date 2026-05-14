window.currentPublishDraftIds = [];
window.currentPublishPreview = null;
window.publishShopOptions = window.publishShopOptions || [];
window.publishActiveSourceShopKey = window.publishActiveSourceShopKey || '';
window.publishSourceSearchTerm = window.publishSourceSearchTerm || '';
window.publishSelectedSourceListingKeys = window.publishSelectedSourceListingKeys instanceof Set
  ? window.publishSelectedSourceListingKeys
  : new Set(Array.isArray(window.publishSelectedSourceListingKeys) ? window.publishSelectedSourceListingKeys : []);
window.currentPublishAiVariants = window.currentPublishAiVariants || [];
let publishShopOptionsLoading = null;

function normalizePublishPlatform(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePublishShopName(value) {
  return String(value || '').trim();
}

function publishShopKey(platform, shop) {
  return `${normalizePublishPlatform(platform)}|${normalizePublishShopName(shop)}`;
}

function splitPublishShopKey(key) {
  const parts = String(key || '').split('|');
  return {
    platform: normalizePublishPlatform(parts.shift()),
    shop: parts.join('|').trim()
  };
}

function getPublishRowShop(row) {
  return normalizePublishShopName(row?.shop || row?.shop_name || row?.shopName || row?.user_name || '');
}

function getPublishShopDisplayName(shop) {
  return normalizePublishShopName(shop?.shop_name || shop?.shopName || shop?.user_name || shop?.shop || '');
}

function publishTruthy(value) {
  return value === true || value === 1 || value === '1';
}

function isPublishShopConnected(shop) {
  const platform = normalizePublishPlatform(shop?.platform || shop?.Platform);
  const hasAccess = publishTruthy(shop?.has_access_token);
  const hasRefresh = publishTruthy(shop?.has_refresh_token);
  const hasApiShop = Boolean(shop?.api_shop_id);
  if (platform === 'shopee') return hasAccess && hasRefresh && hasApiShop;
  if (platform === 'lazada') return hasAccess || hasRefresh || hasApiShop;
  return hasAccess || hasRefresh || hasApiShop;
}

function isTechnicalPublishShopRow(shop) {
  const name = String(shop?.shop_name || shop?.shopName || '').trim();
  const user = String(shop?.user_name || '').trim();
  return /^Shopee\s+\d+$/i.test(name) && /^\d+$/.test(user || name.replace(/\D/g, ''));
}

function dedupePublishShopOptions(options) {
  const map = new Map();
  options.forEach(option => {
    const platform = normalizePublishPlatform(option.platform);
    const shop = normalizePublishShopName(option.shop);
    if (!platform || !shop) return;
    const key = publishShopKey(platform, shop);
    const current = map.get(key);
    if (!current || (option.apiConnected && !current.apiConnected)) {
      map.set(key, { ...option, platform, shop, key });
    }
  });
  return [...map.values()].sort((a, b) => `${a.platform}${a.shop}`.localeCompare(`${b.platform}${b.shop}`));
}

function getPublishShopOptionsFromVariations(rows = window.allVariations || []) {
  return dedupePublishShopOptions((rows || []).map(row => ({
    platform: row.platform,
    shop: getPublishRowShop(row),
    source: 'SKU đã đồng bộ',
    apiConnected: false
  })));
}

function buildPublishShopOptions(apiRows = [], variationRows = window.allVariations || []) {
  const apiOptions = (apiRows || [])
    .filter(shop => !isTechnicalPublishShopRow(shop))
    .map(shop => {
      const connected = isPublishShopConnected(shop);
      return {
        platform: shop.platform || shop.Platform,
        shop: getPublishShopDisplayName(shop),
        source: connected ? 'Đã kết nối API' : 'Chưa kết nối API',
        apiConnected: connected
      };
    });
  return apiOptions.length ? dedupePublishShopOptions(apiOptions) : getPublishShopOptionsFromVariations(variationRows);
}

async function ensurePublishShopOptions() {
  if (window.publishShopOptions?.length) return window.publishShopOptions;
  if (Array.isArray(window.__shopApiRows) && window.__shopApiRows.length) {
    window.publishShopOptions = buildPublishShopOptions(window.__shopApiRows);
    return window.publishShopOptions;
  }
  if (publishShopOptionsLoading) return publishShopOptionsLoading;

  publishShopOptionsLoading = (async () => {
    const fallback = getPublishShopOptionsFromVariations();
    try {
      const res = await fetch(API + '/api/shops/api-configs?t=' + Date.now());
      if (!res.ok) throw new Error(await res.text());
      const rows = await res.json();
      window.__shopApiRows = Array.isArray(rows) ? rows : [];
      window.publishShopOptions = buildPublishShopOptions(window.__shopApiRows);
      if (!window.publishShopOptions.length) window.publishShopOptions = fallback;
      return window.publishShopOptions;
    } catch (err) {
      window.publishShopOptions = fallback;
      return window.publishShopOptions;
    } finally {
      publishShopOptionsLoading = null;
    }
  })();

  return publishShopOptionsLoading;
}

function getSelectedPublishIds() {
  const ids = typeof window.getSelectedVariationIds === 'function'
    ? window.getSelectedVariationIds()
    : Array.from(document.querySelectorAll('.var-checkbox:checked')).map(cb => Number(cb.dataset.id)).filter(Number.isFinite);
  return [...new Set(ids)];
}

function getPublishTargets() {
  return Array.from(document.querySelectorAll('.publish-target:checked')).map(cb => cb.value);
}

function getPublishTargetShopInputs() {
  return Array.from(document.querySelectorAll('.publish-target-shop'));
}

function getPublishTargetShopKeys() {
  return getPublishTargetShopInputs().filter(cb => cb.checked).map(cb => cb.value);
}

function getPublishTargetShopDetails() {
  return getPublishTargetShopInputs()
    .filter(cb => cb.checked)
    .map(cb => ({
      platform: normalizePublishPlatform(cb.dataset.platform),
      shop: normalizePublishShopName(cb.dataset.shop)
    }))
    .filter(item => item.platform && item.shop);
}

function getPublishTargetShops() {
  const inputs = getPublishTargetShopInputs();
  const checked = getPublishTargetShopDetails().map(item => item.shop);
  if (inputs.length) return [...new Set(checked)];
  if (checked.length) return [...new Set(checked)];
  return (document.getElementById('publishTargetShopInput')?.value || '')
    .split(/[,\n]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function getCurrentPublishRows() {
  const ids = window.currentPublishDraftIds || [];
  return (window.allVariations || []).filter(item => ids.includes(Number(item.id)));
}

function getPublishCandidateRows() {
  const selectedRows = getCurrentPublishRows();
  return selectedRows.length ? selectedRows : (window.allVariations || []);
}

function getPublishSourceShopOptions(rows = getPublishCandidateRows()) {
  const map = new Map();
  (rows || []).forEach(row => {
    const platform = normalizePublishPlatform(row.platform);
    const shop = getPublishRowShop(row);
    if (!platform || !shop) return;
    const key = publishShopKey(platform, shop);
    if (!map.has(key)) {
      map.set(key, {
        key,
        platform,
        shop,
        skuCount: 0,
        listingKeys: new Set()
      });
    }
    const option = map.get(key);
    option.skuCount += 1;
    option.listingKeys.add(getPublishRowListingKey(row));
  });
  return [...map.values()]
    .map(option => ({
      ...option,
      listingCount: option.listingKeys.size,
      source: `${option.listingKeys.size} bài đăng · ${option.skuCount} SKU`
    }))
    .sort((a, b) => `${a.platform}${a.shop}`.localeCompare(`${b.platform}${b.shop}`));
}

function getActivePublishSourceShopKey(rows = getPublishCandidateRows()) {
  const options = getPublishSourceShopOptions(rows);
  const available = new Set(options.map(option => option.key));
  if (!options.length) {
    window.publishActiveSourceShopKey = '';
    return '';
  }
  if (!window.publishActiveSourceShopKey || !available.has(window.publishActiveSourceShopKey)) {
    window.publishActiveSourceShopKey = options[0].key;
  }
  return window.publishActiveSourceShopKey;
}

function getPublishSourceShopInputs() {
  return Array.from(document.querySelectorAll('.publish-source-shop'));
}

function getPublishSourceShopKeys() {
  const key = getActivePublishSourceShopKey();
  return key ? [key] : [];
}

function getPublishSourceShopDetails() {
  const key = getActivePublishSourceShopKey();
  if (!key) return [];
  const item = splitPublishShopKey(key);
  return item.platform && item.shop ? [item] : [];
}

function filterRowsBySourceSelection(rows) {
  const key = getActivePublishSourceShopKey(rows);
  if (!key) return [];
  return rows.filter(row => key === publishShopKey(row.platform, getPublishRowShop(row)));
}

function publishListingKey(platform, shop, itemId, title = '') {
  return [
    normalizePublishPlatform(platform),
    normalizePublishShopName(shop),
    String(itemId || title || '').trim()
  ].join('|');
}

function getPublishRowListingKey(row) {
  return publishListingKey(row?.platform, getPublishRowShop(row), row?.platform_item_id || row?.product_name || row?.id);
}

function getPublishListingKey(listing) {
  return String(listing?.key || publishListingKey(
    listing?.source_platform,
    listing?.source_shop,
    listing?.source_item_id || listing?.title
  ));
}

function getPublishSourceListingInputs() {
  return Array.from(document.querySelectorAll('.publish-source-listing'));
}

function getPublishSelectedSourceListingSet() {
  if (!(window.publishSelectedSourceListingKeys instanceof Set)) {
    window.publishSelectedSourceListingKeys = new Set(Array.isArray(window.publishSelectedSourceListingKeys) ? window.publishSelectedSourceListingKeys : []);
  }
  return window.publishSelectedSourceListingKeys;
}

function rememberPublishSourceListingSelection() {
  const selected = getPublishSelectedSourceListingSet();
  getPublishSourceListingInputs().forEach(cb => {
    if (cb.checked) selected.add(cb.value);
    else selected.delete(cb.value);
  });
}

function clearPublishSourceListingSelection() {
  getPublishSelectedSourceListingSet().clear();
}

function getPublishSourceListingKeys() {
  const selected = new Set(getPublishSelectedSourceListingSet());
  getPublishSourceListingInputs().forEach(cb => {
    if (cb.checked) selected.add(cb.value);
    else selected.delete(cb.value);
  });
  return [...selected];
}

function getPublishSourceListingDetails() {
  const selected = new Set(getPublishSourceListingKeys());
  const rows = filterRowsBySourceSelection(getPublishCandidateRows()).filter(row => selected.has(getPublishRowListingKey(row)));
  const map = new Map();
  rows.forEach(row => {
    const key = getPublishRowListingKey(row);
    if (!map.has(key)) {
      map.set(key, {
        platform: normalizePublishPlatform(row.platform),
        shop: getPublishRowShop(row),
        item_id: String(row.platform_item_id || '').trim(),
        title: String(row.product_name || '').trim()
      });
    }
  });
  return [...map.values()].filter(item => item.platform && item.shop && (item.item_id || item.title));
}

function filterRowsByListingSelection(rows) {
  const selected = new Set(getPublishSourceListingKeys());
  if (!selected.size && !getPublishSourceListingInputs().length) return (window.currentPublishDraftIds || []).length ? rows : [];
  if (!selected.size) return [];
  return rows.filter(row => selected.has(getPublishRowListingKey(row)));
}

function getPublishSourceFilteredRows() {
  return filterRowsByListingSelection(filterRowsBySourceSelection(getPublishCandidateRows()));
}

function getPublishSourceFilteredIds() {
  return getPublishSourceFilteredRows()
    .map(row => Number(row.id))
    .filter(Number.isFinite);
}

function getPublishListingOverrides() {
  const images = (document.getElementById('publishImagesInput')?.value || '')
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean);
  return {
    title: document.getElementById('publishTitleInput')?.value?.trim() || '',
    description: document.getElementById('publishDescInput')?.value?.trim() || '',
    category_name: document.getElementById('publishCategoryInput')?.value?.trim() || '',
    brand_name: document.getElementById('publishBrandInput')?.value?.trim() || '',
    weight_kg: Number(document.getElementById('publishWeightInput')?.value || 0),
    length_cm: Number(document.getElementById('publishLengthInput')?.value || 0),
    width_cm: Number(document.getElementById('publishWidthInput')?.value || 0),
    height_cm: Number(document.getElementById('publishHeightInput')?.value || 0),
    video_url: document.getElementById('publishVideoInput')?.value?.trim() || '',
    attributes: parsePublishAttributesInput(document.getElementById('publishAttributesInput')?.value || ''),
    images
  };
}

const PUBLISH_EDITOR_CONTENT_FIELD_IDS = [
  'publishTitleInput', 'publishDescInput', 'publishCategoryInput', 'publishBrandInput',
  'publishWeightInput', 'publishLengthInput', 'publishWidthInput', 'publishHeightInput',
  'publishVideoInput', 'publishImagesInput', 'publishAttributesInput'
];

const PUBLISH_EDITOR_TRANSIENT_FIELD_IDS = ['publishTargetShopInput', 'publishSourceSearchInput'];

function resetPublishEditorFields() {
  [...PUBLISH_EDITOR_CONTENT_FIELD_IDS, ...PUBLISH_EDITOR_TRANSIENT_FIELD_IDS].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  window.publishActiveSourceShopKey = '';
  window.publishSourceSearchTerm = '';
  window.currentPublishAiVariants = [];
  clearPublishSourceListingSelection();
  const targetWrap = document.getElementById('publishTargetShopList');
  if (targetWrap) targetWrap.innerHTML = '<div class="publish-note">Chọn sàn để tải danh sách shop đích.</div>';
  const sourceWrap = document.getElementById('publishSourceShopList');
  const aiStatus = document.getElementById('publishAiStatus');
  if (aiStatus) aiStatus.textContent = 'AI sẽ viết khác tiêu đề/mô tả theo từng shop đích, SKU vẫn giữ nguyên.';
  const aiList = document.getElementById('publishAiVariantList');
  if (aiList) aiList.innerHTML = '';
  if (sourceWrap) sourceWrap.innerHTML = '<div class="publish-note">Tick SKU để hiện shop nguồn.</div>';
}

function normalizePublishUiText() {
  const sourceLabel = document.querySelector('.publish-source-search > span');
  if (sourceLabel) sourceLabel.textContent = 'Tìm bài đăng trong shop nguồn';
  const sourceInput = document.getElementById('publishSourceSearchInput');
  if (sourceInput) sourceInput.placeholder = 'Tìm tên sản phẩm, SKU, mã bài đăng...';
  const aiToggle = document.querySelector('.publish-ai-toggle > span');
  if (aiToggle) aiToggle.textContent = 'AI viết khác tiêu đề/mô tả cho từng shop đích, SKU giữ nguyên';
  const aiBtn = document.getElementById('btnPublishAiVariants');
  if (aiBtn) aiBtn.textContent = 'Tạo nội dung AI';
  const aiStatus = document.getElementById('publishAiStatus');
  if (aiStatus && !window.currentPublishAiVariants?.length) aiStatus.textContent = 'Chọn bài đăng nguồn và shop đích, rồi tạo nội dung AI trước khi lưu nháp.';
}

function setFieldIfEmpty(id, value) {
  setPublishFieldValue(id, value, false);
}

function setPublishFieldValue(id, value, force = false) {
  const el = document.getElementById(id);
  if (!el) return;
  const text = value === null || value === undefined ? '' : String(value);
  if (force || (!el.value && text)) el.value = text;
}

function clearPublishEditorContentFields() {
  // Khi đổi nguồn bài đăng, cần xóa dữ liệu cũ để tránh đăng nhầm media/thuộc tính của bài trước.
  PUBLISH_EDITOR_CONTENT_FIELD_IDS.forEach(id => setPublishFieldValue(id, '', true));
}

function formatPublishMoney(value) {
  const n = Number(value || 0);
  return n ? n.toLocaleString('vi-VN') + 'đ' : '-';
}

function publishImageUrl(value) {
  const url = (value || '').toString().trim();
  return url || 'https://placehold.co/80x80?text=No+Img';
}

function parsePublishJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function publishAttributeName(item) {
  if (!item || typeof item !== 'object') return String(item || '').trim();
  return String(item.attribute_name || item.name || item.display_name || item.attribute_id || item.id || '').trim();
}

function publishAttributeValue(item) {
  if (!item || typeof item !== 'object') return '';
  const raw = item.value || item.value_name || item.attribute_value || item.option || item.options || item.value_id || '';
  if (Array.isArray(raw)) return raw.map(v => typeof v === 'object' ? publishAttributeValue(v) || publishAttributeName(v) : String(v || '').trim()).filter(Boolean).join(', ');
  if (raw && typeof raw === 'object') return publishAttributeValue(raw) || publishAttributeName(raw);
  return String(raw || '').trim();
}

function normalizePublishAttributes(value) {
  const raw = parsePublishJson(value, value);
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (raw && typeof raw === 'object') {
    return Object.entries(raw).map(([name, attrValue]) => ({ name, value: attrValue }));
  }
  return String(raw || '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [name, ...valueParts] = line.split(':');
      return valueParts.length
        ? { name: name.trim(), value: valueParts.join(':').trim() }
        : { name: line, value: '' };
    });
}

function parsePublishAttributesInput(value) {
  return normalizePublishAttributes(value).filter(item => publishAttributeName(item) || publishAttributeValue(item));
}

function formatPublishAttributesForEditor(value) {
  return normalizePublishAttributes(value)
    .map(item => {
      const name = publishAttributeName(item);
      const attrValue = publishAttributeValue(item);
      if (!name && !attrValue) return '';
      return attrValue ? `${name}: ${attrValue}` : name;
    })
    .filter(Boolean)
    .join('\n');
}
