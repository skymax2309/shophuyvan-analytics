import { API } from './oms-api.js';
// Nạp linh kiện đã chia nhỏ
import { fmt, fmtDate, showToast, copyText, closeModal } from '../utils/helpers.js';
import { initOmsNotifications } from '../modules/oms-notifications.js';
import { initLabelSettings, openLabelSettingsModal } from '../modules/oms-label-settings.js?v=label-capability-20260519c';
import { initBotSettings, openBotSettingsModal, openManualBotRunModal } from '../modules/oms-bot-settings.js?v=oms-ops-settings-20260523c';
import { openAdvancedApiFeatures as openAdvancedApiFeaturesModal } from '../modules/oms-api-advanced.js?v=review-batch-20260507';
import { initLogisticsWatch, setLogisticsOrders } from '../modules/oms-logistics-watch.js?v=oms-ops-settings-20260523c';
// BỔ SUNG CỤM MODULE POPUP NÀY
import { initModals, renderPickListModal } from '../modules/oms-modals.js?v=oms-hotfix-20260521b';
// THÊM DÒNG NÀY ĐỂ KÉO CÁC HÀM VẼ GIAO DIỆN VÀO:
import { renderShippingStatus, renderTable, renderSummary, updateBadges, renderPagination, renderCachedBadgesIfAny } from '../modules/oms-render.js?v=oms-hotfix-20260521c';

// Kích hoạt cầu nối: Báo cho Popup biết dùng hàm loadOrders để tải lại bảng
initModals(() => loadOrders(currentPage));
initBotSettings();

import { initActions } from '../modules/oms-actions.js?v=oms-toolbar-actions-20260521a';
// Kích hoạt cầu nối Hành động
initActions(
  (page) => loadOrders(page),
  () => currentPage,
  () => { document.getElementById('chkAll').checked = false; toggleAllCheck(false); },
  () => omsCache
);
initLogisticsWatch();

// ── STATE ───────────────────────────────────────────────────────────
let currentPage    = 1
let currentStatus  = 'ALL'
let currentSubStatus = '' // 🌟 Thêm biến quản lý trạng thái phụ (shipping_status)
let currentType    = ''
let currentPlatform= ''
let omsCache       = []
let totalOrders    = 0
let totalPages     = 1
let debounceTimer  = null
let allSelected    = false
let ordersLoadSeq  = 0
let ordersLoadController = null

const PAGE_SIZE_STORAGE_KEY = 'oms_page_size'
const LAST_GOOD_ORDERS_STORAGE_KEY = 'oms_last_good_orders_state'
const DEFAULT_PAGE_SIZE = 200
const MAX_PAGE_SIZE = 500
// Mặc định chỉ xem đơn hoàn gần đây để vận hành không bị ngập lịch sử cũ.
const DEFAULT_RETURN_SCOPE = '30'

function normalizePageSize(value) {
  const parsed = parseInt(value, 10)
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE
  return Math.min(Math.max(parsed, 1), MAX_PAGE_SIZE)
}

function readPageSize() {
  try {
    return normalizePageSize(localStorage.getItem(PAGE_SIZE_STORAGE_KEY) || DEFAULT_PAGE_SIZE)
  } catch {
    return DEFAULT_PAGE_SIZE
  }
}

let pageSize = readPageSize()
let lastGoodOrdersState = readStoredLastGoodOrdersState()

function readStoredLastGoodOrdersState() {
  for (const storage of [sessionStorage, localStorage]) {
    try {
      const raw = storage.getItem(LAST_GOOD_ORDERS_STORAGE_KEY)
      if (!raw) continue
      const state = JSON.parse(raw)
      if (Array.isArray(state?.data) && state.data.length) return state
    } catch {}
  }
  return null
}

function rememberLastGoodOrdersState(state) {
  if (!Array.isArray(state?.data) || !state.data.length) return
  const payload = JSON.stringify({ ...state, cachedAt: new Date().toISOString() })
  for (const storage of [sessionStorage, localStorage]) {
    try {
      storage.setItem(LAST_GOOD_ORDERS_STORAGE_KEY, payload)
    } catch {}
  }
}

function syncPageSizeSelect() {
  const select = document.getElementById('f_page_size')
  if (select && select.value !== String(pageSize)) select.value = String(pageSize)
}

function formatLocalDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getReturnScopeStartDate(scope) {
  const normalized = String(scope || DEFAULT_RETURN_SCOPE)
  if (normalized === 'all') return ''
  const days = Math.max(parseInt(normalized, 10) || 30, 1)
  const start = new Date()
  start.setDate(start.getDate() - (days - 1))
  return formatLocalDate(start)
}

function syncReturnScopeVisibility() {
  const select = document.getElementById('f_return_scope')
  if (!select) return
  select.style.display = currentStatus === 'RETURN' ? '' : 'none'
  if (!select.value) select.value = DEFAULT_RETURN_SCOPE
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function ensureOmsLoadBanner() {
  let banner = document.getElementById('omsLoadBanner')
  if (banner) return banner
  banner = document.createElement('div')
  banner.id = 'omsLoadBanner'
  banner.className = 'oms-load-banner'
  banner.style.display = 'none'
  const tableWrap = document.querySelector('.table-wrap')
  if (tableWrap?.parentNode) tableWrap.parentNode.insertBefore(banner, tableWrap)
  return banner
}

function hideOmsLoadBanner() {
  const banner = document.getElementById('omsLoadBanner')
  if (banner) banner.style.display = 'none'
}

function showOmsLoadBanner(message, detail = '') {
  const banner = ensureOmsLoadBanner()
  if (!banner) return
  window.__SHV_OMS_RETRY_PAGE = currentPage
  const detailHtml = detail ? `<small title="${escapeHtml(detail)}">${escapeHtml(detail)}</small>` : ''
  banner.innerHTML = `
    <div>
      <b>${escapeHtml(message)}</b>
      ${detailHtml}
    </div>
    <button type="button" onclick="loadOrders(window.__SHV_OMS_RETRY_PAGE || 1)">Thử lại</button>
  `
  banner.style.display = ''
}

function isAbortLikeError(error) {
  return error?.name === 'AbortError' || /abort/i.test(String(error?.message || ''))
}

async function parseOrdersResponse(response) {
  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { error: 'invalid_json', message: text.slice(0, 240) }
    }
  }
  if (!response.ok || payload?.error || payload?.status === 'error') {
    const message = payload?.message || payload?.error || `HTTP ${response.status}`
    const detail = payload?.detail || payload?.request_id || response.statusText || ''
    const error = new Error(message)
    error.detail = detail
    error.status = response.status
    throw error
  }
  return payload || {}
}

function renderOrdersFromState(state) {
  omsCache = Array.isArray(state?.data) ? state.data : []
  totalOrders = Number(state?.total || 0)
  totalPages = Math.max(Number(state?.totalPages || 1), 1)
  currentPage = Math.max(Number(state?.page || currentPage || 1), 1)
  setLogisticsOrders(omsCache)
  renderTable(omsCache)
  window.__SHV_OMS_FEE_RENDERING = false
  window.syncOmsFeePopupAfterRender?.()
  renderSummary(omsCache, totalOrders)
  renderPagination(currentPage, totalPages, totalOrders)
}

export function setPageSize(value) {
  pageSize = normalizePageSize(value)
  try {
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(pageSize))
  } catch {}
  syncPageSizeSelect()
  loadOrders(1)
}


// ── DEBOUNCE ────────────────────────────────────────────────────────
export function debounceLoad() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => loadOrders(1), 400)
}

// ── SIDEBAR SWITCH ──────────────────────────────────────────────────
export function switchStatus(s) {
  const nextStatus = s === 'SHIPPED' ? 'SHIPPING' : s
  currentStatus   = nextStatus === currentStatus && nextStatus !== 'ALL' ? 'ALL' : nextStatus
  currentSubStatus = ''
  currentType     = ''
  currentPlatform = ''
  document.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'))
  document.getElementById('tab-' + (currentStatus || 'ALL'))?.classList.add('active')
  syncReturnScopeVisibility()
  loadOrders(1)
}

export function switchType(t) {
  currentType     = t === currentType ? '' : t
  currentStatus   = 'ALL'
  currentSubStatus = ''
  currentPlatform = ''
  document.querySelectorAll('.status-tab').forEach(el => el.classList.remove('active'))
  if (currentType) document.getElementById('tab-' + t)?.classList.add('active')
  else document.getElementById('tab-ALL')?.classList.add('active')
  syncReturnScopeVisibility()
  loadOrders(1)
}

export function switchPlatform(p) {
  currentPlatform = p === currentPlatform ? '' : p
  currentStatus   = 'ALL'
  currentSubStatus = ''
  currentType     = ''
  document.querySelectorAll('.status-tab').forEach(el => el.classList.remove('active'))
  if (currentPlatform) document.getElementById('tab-' + p)?.classList.add('active')
  else document.getElementById('tab-ALL')?.classList.add('active')
  
  // 🌟 Liên hoàn cước: Lọc lại Dropdown Shop theo Sàn vừa chọn
  const platformSelect = document.getElementById('f_platform')
  if (platformSelect) platformSelect.value = currentPlatform
  setValue('f_shop', '')
  setValue('f_carrier', '')
  syncReturnScopeVisibility()
  loadCarrierOptions().then(loaded => {
    if (!loaded) filterShopDropdown(currentPlatform)
    loadOrders(1)
  })
}


// ── LOAD ORDERS ─────────────────────────────────────────────────────
export async function loadOrders(page = 1) {
  const requestSeq = ++ordersLoadSeq
  if (ordersLoadController) ordersLoadController.abort()
  ordersLoadController = new AbortController()
  currentPage = Math.max(parseInt(page, 10) || 1, 1)
  syncPageSizeSelect()
  // Giữ popup phí đang pinned qua trạng thái loading tạm; sau render mới quyết định đóng/mở.
  window.__SHV_OMS_FEE_RENDERING = true
  if (!lastGoodOrdersState?.data?.length) {
    document.getElementById('omsTable').innerHTML =
      `<tr><td colspan="9"><div class="empty-state"><div class="icon" style="font-size:28px;margin-bottom:8px">⏳</div><p>Đang tải...</p></div></td></tr>`
  }

  const params = new URLSearchParams({ page: currentPage, limit: pageSize })
  const shop     = document.getElementById('f_shop')?.value || ''
  const pltFilter= document.getElementById('f_platform')?.value || '' // Lấy giá trị Sàn
  const search   = (document.getElementById('f_search')?.value || '').trim()
  const carrier  = document.getElementById('f_carrier')?.value || ''
  const isExpress= !!document.getElementById('f_express')?.checked
  const dataStatus = document.getElementById('f_data_status')?.value || ''
  const customerRisk = document.getElementById('f_customer_risk')?.value || ''
  const returnScope = document.getElementById('f_return_scope')?.value || DEFAULT_RETURN_SCOPE
  const returnFrom = currentStatus === 'RETURN' ? getReturnScopeStartDate(returnScope) : ''

  if (dataStatus) params.set('data_status', dataStatus)
  if (customerRisk) params.set('customer_risk', customerRisk)
  if (shop)      params.set('shop', shop)
  if (search)    params.set('search', search)
  if (carrier)   params.set('carrier', carrier) // Truyền thẳng tham số carrier lên Server
  if (isExpress) params.set('express', '1')
  if (currentStatus && currentStatus !== 'ALL') params.set('oms_status', currentStatus)
  if (currentSubStatus) params.set('shipping_status', currentSubStatus) // 🌟 Gửi trạng thái phụ lên Server
  if (currentType)     params.set('order_type', currentType)
  if (returnFrom)      params.set('from', returnFrom)
  
  // Nếu chọn Sàn ở Dropdown thì ưu tiên dùng nó
  if (pltFilter) {
      params.set('platform', pltFilter)
  } else if (currentPlatform) {
      params.set('platform', currentPlatform)
  }

  try {
    const requestId = `oms-orders-${Date.now()}-${requestSeq}`
    const response = await fetch(API + '/api/orders?' + params, {
      cache: 'no-store',
      signal: ordersLoadController.signal,
      headers: {
        Accept: 'application/json',
        'X-Request-Id': requestId
      }
    })
    const res = await parseOrdersResponse(response)
    if (requestSeq !== ordersLoadSeq) return
    const nextState = {
      data: Array.isArray(res.data) ? res.data : [],
      total: res.total || 0,
      totalPages: res.totalPages || 1,
      page: currentPage,
      query: params.toString(),
      loadedAt: new Date().toISOString()
    }
    lastGoodOrdersState = nextState
    rememberLastGoodOrdersState(nextState)
    hideOmsLoadBanner()

    // Ném dữ liệu sang cho File oms-render.js vẽ; mọi số liệu vẫn đọc từ payload Core/API.
    renderOrdersFromState(nextState)
    const badgeParams = new URLSearchParams()
    if (shop) badgeParams.set('shop', shop)
    if (search) badgeParams.set('search', search)
    if (returnFrom) badgeParams.set('from', returnFrom)
    if (pltFilter || currentPlatform) badgeParams.set('platform', pltFilter || currentPlatform)
    updateBadges(badgeParams);
  } catch (e) {
    if (isAbortLikeError(e) || requestSeq !== ordersLoadSeq) return
    if (lastGoodOrdersState?.data?.length) {
      renderOrdersFromState(lastGoodOrdersState)
      renderCachedBadgesIfAny()
      showOmsLoadBanner('Không tải được danh sách đơn. Đang giữ dữ liệu lần trước.', e.detail || e.message || '')
    } else {
      window.__SHV_OMS_FEE_RENDERING = false
      document.getElementById('omsTable').innerHTML =
        `<tr><td colspan="9"><div class="empty-state"><div class="icon">❌</div><p>Không tải được danh sách đơn.</p><button type="button" class="pag-btn" onclick="loadOrders(window.__SHV_OMS_RETRY_PAGE || 1)">Thử lại</button></div></td></tr>`
      showOmsLoadBanner('Không tải được danh sách đơn.', e.detail || e.message || '')
      window.syncOmsFeePopupAfterRender?.()
    }
  } finally {
    if (requestSeq === ordersLoadSeq) {
      ordersLoadController = null
      window.__SHV_OMS_FEE_RENDERING = false
      window.syncOmsFeePopupAfterRender?.()
    }
  }
}


// ── CHECK & GET IDS ──────────────────────────────────────────────────
export function toggleAllCheck(checked) {
  document.querySelectorAll('.oms-chk').forEach(c => c.checked = checked);
  onCheck();
}

export function getChecked() {
  return [...document.querySelectorAll('.oms-chk:checked')].map(c => c.dataset.id);
}

export function onCheck() {
  const checked = getChecked()
  const n = checked.length
  const selInfo = document.getElementById('selInfo')
  if (selInfo) selInfo.innerHTML = n > 0 ? `Đã chọn <span>${n}</span> đơn` : 'Chưa chọn đơn nào'
  const has = n > 0
  ;['btnPrepare','btnPacked','btnHandedOver',
    'btnPickList','btnCancelTransit','btnFailed','btnReturn'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.disabled = !has
  })
  const selected = omsCache.filter(order => checked.includes(String(order.order_id || '')))
  const canHandleBuyerCancel = selected.length > 0 && selected.every(order => String(order.shipping_status || '').toUpperCase() === 'IN_CANCEL')
  ;['btnAcceptBuyerCancel', 'btnRejectBuyerCancel'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.disabled = !canHandleBuyerCancel
  })
}


// ── PICK LIST ────────────────────────────────────────────────────────
export function showPickList() {
  const ids = getChecked();
  if (!ids.length) return;
  const selected = omsCache.filter(o => ids.includes(o.order_id));
  
  // Ném toàn bộ dữ liệu thô sang file Modals để nó tự tính toán và vẽ Giao diện
  renderPickListModal(selected);
}



// ── SYNC (trigger Bot) ───────────────────────────────────────────────
async function syncLazadaDeep(shopName = '') {
  const shopParam = shopName ? `&shop=${shopName}` : ''

  for (let offset = 0; offset <= 280; offset += 40) {
    const data = await fetch(API + `/api/orders/sync-api-orders?platform=lazada${shopParam}&days=90&limit=40&offset=${offset}`, { method: 'POST' })
      .then(r => r.json())
      .catch(() => null)
    if (!data || Number(data.fetched || 0) < 40) break
  }

  for (let round = 0; round < 12; round++) {
    const data = await fetch(API + `/api/orders/sync-api-status?platform=lazada${shopParam}&days=90&limit=20&offset=0`, { method: 'POST' })
      .then(r => r.json())
      .catch(() => null)
    if (!data || Number(data.updated || 0) === 0 || Number(data.checked || 0) < 20) break
  }
}

async function syncReturnStatusesDeep(platform = '', shop = '') {
  const shopParam = shop ? `&shop=${encodeURIComponent(shop)}` : ''
  const selectedPlatform = String(platform || '').toLowerCase()
  const tasks = []

  if (!selectedPlatform || selectedPlatform === 'shopee') {
    tasks.push(fetch(API + `/api/returns/shopee/sync?hours=${shop ? 168 : 72}&page_size=${shop ? 80 : 40}&max_pages=${shop ? 3 : 2}&include_detail=true${shopParam}`, { method: 'POST' })
      .then(r => r.json())
      .catch(error => ({ status: 'error', platform: 'shopee', message: error.message })))
  }
  if (!selectedPlatform || selectedPlatform === 'lazada') {
    tasks.push(fetch(API + `/api/returns/lazada/sync?days=${shop ? 90 : 45}&page_size=${shop ? 80 : 40}&max_pages=${shop ? 3 : 2}&include_detail=true&include_history=true&history_pages=${shop ? 2 : 1}${shopParam}`, { method: 'POST' })
      .then(r => r.json())
      .catch(error => ({ status: 'error', platform: 'lazada', message: error.message })))
  }

  return Promise.all(tasks)
}

async function rebuildCustomerRiskCache(platform = '', shop = '') {
  const params = new URLSearchParams()
  if (platform) params.set('platform', platform)
  if (shop) params.set('shop', shop)
  // Phase 1 chỉ dựng hồ sơ cảnh báo từ dữ liệu D1, không tự chặn hoặc thao tác đơn.
  return fetch(API + '/api/customer-risk/rebuild' + (params.toString() ? `?${params}` : ''), { method: 'POST' })
    .then(r => r.json())
    .catch(error => ({ status: 'error', message: error.message }))
}

export async function refreshOrdersView() {
  const btn = document.querySelector('button[onclick="refreshOrdersView()"]')
  if (btn) btn.disabled = true
  try {
    showToast('Đang làm mới bảng đơn hiện tại...')
    await loadOrders(currentPage)
    const now = new Date().toLocaleTimeString('vi-VN')
    const lastSync = document.getElementById('lastSync')
    if (lastSync) {
      lastSync.textContent = `Làm mới lúc ${now}`
      lastSync.style.display = ''
    }
    showToast('Đã làm mới bảng đơn.')
  } finally {
    if (btn) btn.disabled = false
  }
}

// ── RESET FILTER ─────────────────────────────────────────────────────
export async function resetFilter() {
  setValue('f_platform', '')
  setValue('f_shop', '')
  setValue('f_search', '')
  setValue('f_carrier', '')
  setValue('f_shipping', '')
  setValue('f_data_status', '')
  setValue('f_customer_risk', '')
  setValue('f_return_scope', DEFAULT_RETURN_SCOPE)
  setChecked('f_express', false)
  currentStatus   = 'ALL'
  currentSubStatus = ''
  currentType     = ''
  currentPlatform = ''
  document.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'))
  document.getElementById('tab-ALL').classList.add('active')
  syncReturnScopeVisibility()
  filterShopDropdown('')
  await loadCarrierOptions()
  loadOrders(1)
}


// ── LIÊN HOÀN SÀN -> SHOP ───────────────────────────────────────────
let globalShopList = [];
let lastCarrierRequest = 0;

function setValue(id, value) {
  const el = document.getElementById(id)
  if (el) el.value = value
}

function setChecked(id, checked) {
  const el = document.getElementById(id)
  if (el) el.checked = checked
}

function normalizePlatform(platform = '') {
  return String(platform || '').trim().toLowerCase()
}

function getShopName(shop = {}) {
  return String(typeof shop === 'string' ? shop : (shop.shop_name || shop.user_name || shop.shop || shop.api_shop_id || '')).trim()
}

function renderShopDropdown(shops, selectedValue = '') {
  const sel = document.getElementById('f_shop');
  if (!sel) return;
  const uniqueShops = [...new Set((shops || []).map(getShopName).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }));
  sel.innerHTML = '<option value="">Tất cả shop</option>' + uniqueShops.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  sel.value = uniqueShops.includes(selectedValue) ? selectedValue : '';
}

export async function loadShopList() {
  const loadedFromOrders = await loadCarrierOptions();
  if (loadedFromOrders) return;

  try {
    const data = await fetch(API + '/api/shops').then(r => r.json());
    const rows = Array.isArray(data) ? data : (data.data || data.shops || []);
    globalShopList = rows;
    filterShopDropdown(document.getElementById('f_platform')?.value || '');
    await loadCarrierOptions();
  } catch {}
}

export function filterShopDropdown(platform) {
  const sel = document.getElementById('f_shop');
  if (!sel) return;
  const currentVal = sel.value;
  const selectedPlatform = normalizePlatform(platform);
  let filtered = Array.isArray(globalShopList) ? globalShopList : [];
  if (selectedPlatform) {
    filtered = filtered.filter(s => normalizePlatform(s.platform) === selectedPlatform);
  }
  renderShopDropdown(filtered, currentVal);
}

function currentFilterPlatform() {
  return normalizePlatform(document.getElementById('f_platform')?.value || currentPlatform || '')
}

function currentFilterShop() {
  return String(document.getElementById('f_shop')?.value || '').trim()
}

function renderCarrierDropdown(carriers, selectedValue = '') {
  const sel = document.getElementById('f_carrier');
  if (!sel) return;
  const uniqueCarriers = [...new Set((carriers || [])
    .map(carrier => String(carrier || '').trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }));
  sel.innerHTML = '<option value="">Tất cả ĐVVC</option>' + uniqueCarriers.map(carrier => `<option value="${escapeHtml(carrier)}">${escapeHtml(carrier)}</option>`).join('');
  sel.value = uniqueCarriers.includes(selectedValue) ? selectedValue : '';
}

export async function loadCarrierOptions() {
  const sel = document.getElementById('f_carrier');
  if (!sel) return false;
  const selectedValue = sel.value;
  const selectedShop = currentFilterShop();
  const requestId = ++lastCarrierRequest;
  const params = new URLSearchParams();
  const platform = currentFilterPlatform();
  if (platform) params.set('platform', platform);
  if (selectedShop) params.set('shop', selectedShop);

  try {
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(API + '/api/orders/filter-options' + suffix);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (requestId !== lastCarrierRequest) return false;
    if (Array.isArray(data?.shops)) {
      globalShopList = data.shops.map(shop => ({ shop_name: getShopName(shop), platform }));
      filterShopDropdown(platform);
    }
    const carriers = Array.isArray(data?.carriers) ? data.carriers : [];
    renderCarrierDropdown(carriers, selectedValue);
    return true;
  } catch {
    if (requestId === lastCarrierRequest) renderCarrierDropdown([], '');
    return false;
  }
}

export async function onPlatformFilterChange(platform) {
  const normalized = normalizePlatform(platform);
  const platformSelect = document.getElementById('f_platform');
  if (platformSelect && platformSelect.value !== normalized) platformSelect.value = normalized;
  currentPlatform = '';
  setValue('f_shop', '');
  setValue('f_carrier', '');
  const loaded = await loadCarrierOptions();
  if (!loaded) filterShopDropdown(normalized);
  loadOrders(1);
}

export async function onShopFilterChange() {
  await loadCarrierOptions();
  loadOrders(1);
}


export function openLabelSettings() {
  openLabelSettingsModal();
}

export function openBotSettings() {
  openBotSettingsModal();
}

export function openManualBotRun() {
  openManualBotRunModal();
}

export function openAdvancedApiFeatures() {
  openAdvancedApiFeaturesModal();
}

// Mở lại cổng xuất khẩu cho các file HTML gọi đến
export { fmt, fmtDate, showToast, copyText, closeModal };

// [CORE LOGIC] CHUYỂN ĐỔI TAB 2 TẦNG (TÍCH HỢP ĐỒNG BỘ DESKTOP & MOBILE)
window.switchMainTab = function(mainStatus) {
    if (mainStatus === 'SHIPPED') mainStatus = 'SHIPPING';
    console.log(`[OMS LOG] 👆 Chuyển Tab Tầng 1: ${mainStatus}`);
    currentStatus = mainStatus;
    syncReturnScopeVisibility();
    currentSubStatus = ''; // 🌟 Reset tab phụ mỗi khi chuyển tab chính

    // Dọn dẹp Menu Cây trên Desktop
    document.querySelectorAll('.sidebar-sub-menu').forEach(el => el.remove());

    // Cập nhật UI Tab Tầng 1
    document.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.getElementById('tab-' + mainStatus);
    if(activeTab) activeTab.classList.add('active');

const subConfig = {
        'PENDING': [
            { id: 'Chưa xử lý,Chưa Xử Lý,Chờ xác nhận,confirmed,ready_to_ship,READY_TO_SHIP,LOGISTICS_PENDING_ARRANGE', label: 'Chưa Xử Lý' },
            { id: 'WAITING_LABEL', label: 'Chờ Tem In' },
            { id: 'Đã xử lý,Đã Xử Lý,Chờ lấy hàng,PROCESSED,LOGISTICS_REQUEST_CREATED,đã chuẩn bị', label: 'Đã Xử Lý' },
            { id: 'LOGISTICS_PACKAGED,Đã đóng gói,Đã Đóng Gói', label: 'Đã Đóng Gói' },
            { id: 'IN_CANCEL', label: 'Khách Yêu Cầu Hủy' },
            { id: 'ADVANCE_FULFILMENT', label: 'Gói Sẵn Giao Nhanh' }
        ],
        // 🌟 Đã xóa sổ hoàn toàn menu con của SHIPPING, COMPLETED và CANCELLED cho sạch màn hình
        'RETURN': [
            { id: '', label: 'Tất Cả' },
            { id: 'RETURN_REFUND,TO_RETURN', label: 'Yêu Cầu Trả Hàng' },
            { id: 'RETURN,LOGISTICS_IN_RETURN', label: 'Đang Hoàn Về Shop' },
            { id: 'LOGISTICS_RETURNED_BY_SHIPPER,FAILED_DELIVERY,FAILED_DELIVERY_ATTEMPT', label: 'Shipper Đã Trả Hàng' },
            { id: 'LOGISTICS_RETURN_PACKAGE_RECEIVED,COMPLETED', label: 'Đã Nhận Đơn Hoàn' },
            { id: 'RETURN_COMPLAINT', label: 'Đang Khiếu Nại' },
            { id: 'lost by 3pl,LOGISTICS_LOST', label: 'Thất Lạc' },
        ]
    };

    const subBar = document.getElementById('sub-tabs-bar'); // Vùng chứa Tầng 2 trên Mobile

    if (subConfig[mainStatus]) {
        // 1. Sinh Tầng 2 dạng "Thò Thụt" cho Máy tính
        if (activeTab) {
            const subMenu = document.createElement('div');
            subMenu.className = 'sidebar-sub-menu';
            subMenu.innerHTML = subConfig[mainStatus].map((s, index) => 
                `<div class="sub-tab ${index===0?'active':''}" data-sub="${s.id}" onclick="switchSubTab('${s.id}')">
                    <span class="sub-tab-dot"></span><span class="sub-tab-label">${s.label}</span><span class="sub-badge" data-main="${mainStatus}" data-sub="${s.id}">0</span>
                 </div>`
            ).join('');
            activeTab.insertAdjacentElement('afterend', subMenu);
        }

        // 2. Sinh Tầng 2 dạng "Thanh Vuốt Ngang" cho Điện thoại
        if (subBar) {
            subBar.classList.add('has-tabs');
            subBar.style.display = '';
            subBar.innerHTML = subConfig[mainStatus].map((s, index) => 
                `<div class="sub-tab ${index===0?'active':''}" data-sub="${s.id}" onclick="switchSubTab('${s.id}')"><span class="sub-tab-label">${s.label}</span><span class="sub-badge" data-main="${mainStatus}" data-sub="${s.id}">0</span></div>`
            ).join('');
        }

        currentSubStatus = subConfig[mainStatus][0].id; // 🌟 Gán vào biến phụ, KHÔNG ĐƯỢC GHI ĐÈ biến chính
    } else {
        if (subBar) {
            subBar.classList.remove('has-tabs');
            subBar.innerHTML = '';
        }
    }

    loadOrders(1);
};

window.switchSubTab = function(subStatus) {
    console.log(`[OMS LOG] 👆 Chọn Tab con: ${subStatus}`);
    currentSubStatus = subStatus; // 🌟 Gán vào biến phụ
    // Đồng bộ highlight cho cả Desktop và Mobile cùng lúc
    document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll(`.sub-tab[data-sub="${subStatus}"]`).forEach(t => t.classList.add('active'));
    loadOrders(1);
};

window.startReturnComplaintFromRow = async function(orderId) {
  const code = String(orderId || '').trim()
  if (!code) return
  if (!confirm(`Gửi video đóng gói làm chứng cứ khiếu nại cho đơn ${code}?`)) return
  try {
    const response = await fetch(`${API}/api/returns/complaints/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, confirm_action: true })
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.error) throw new Error(data.message || data.error || 'Không gửi được khiếu nại.')
    showToast(data.message || 'Đã tạo hồ sơ khiếu nại hoàn/trả.', 'success')
    currentStatus = 'RETURN'
    currentSubStatus = 'RETURN_COMPLAINT'
    await loadOrders(1)
  } catch (error) {
    showToast(error.message || 'Không gửi được khiếu nại hoàn/trả.', 'error')
  }
}

window.refreshReturnComplaintFromRow = async function(orderId) {
  const code = String(orderId || '').trim()
  if (!code) return
  try {
    const response = await fetch(`${API}/api/returns/complaints/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.error) throw new Error(data.message || data.error || 'Không cập nhật được phản hồi khiếu nại.')
    showToast(data.message || 'Đã cập nhật phản hồi khiếu nại.', 'success')
    await loadOrders(currentPage)
  } catch (error) {
    showToast(error.message || 'Không cập nhật được phản hồi khiếu nại.', 'error')
  }
}

let liveRefreshHandle = null;
export function startLiveDashboardRefresh() {
    if (liveRefreshHandle) return;
    liveRefreshHandle = setInterval(() => {
        const hasChecked = document.querySelector('.oms-chk:checked');
        if (document.visibilityState === 'visible' && !hasChecked) {
            loadOrders(currentPage);
        }
    }, 30000);
}

// ── INIT ─────────────────────────────────────────────────────────────
function handleOrderPushMessage(message = {}) {
    if (!['order-push', 'open-order'].includes(message.type)) return;
    const data = message.data || message;
    const orderId = data.order_id || '';
    window.__omsRealtimeUpdatedIds = data.order_ids?.length ? data.order_ids : (orderId ? [orderId] : []);
    window.__omsRealtimeUpdatedAt = Date.now();
    const hasChecked = document.querySelector('.oms-chk:checked');
    if (message.type === 'open-order' && orderId) {
        setValue('f_search', orderId);
        loadOrders(1);
        return;
    }
    if (document.visibilityState === 'visible' && !hasChecked) loadOrders(currentPage);
}

if ('serviceWorker' in navigator && !window.__omsOrderPushListenerReady) {
    window.__omsOrderPushListenerReady = true;
    navigator.serviceWorker.addEventListener('message', event => handleOrderPushMessage(event.data || {}));
}

// Giữ số liệu sidebar từ cache ngay lúc hard reload, trước khi API badges trả về.
renderCachedBadgesIfAny()
loadShopList()
initLabelSettings()
initOmsNotifications({
  refreshCurrentView: () => {
    const hasChecked = document.querySelector('.oms-chk:checked');
    if (document.visibilityState === 'visible' && !hasChecked) loadOrders(currentPage);
  }
})
startLiveDashboardRefresh()
