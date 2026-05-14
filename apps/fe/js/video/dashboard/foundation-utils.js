
const API_BASE = window.SHV_AUTH?.API || 'https://huyvan-worker-api.nghiemchihuy.workers.dev'
const VIDEO_SELECTED_SHOP_KEY = 'shv_video_selected_shop'
const LAZADA_VIDEO_SELECTED_SHOP_KEY = 'shv_lazada_video_selected_shop'
const initialVideoParams = new URLSearchParams(window.location.search)
const SHOPEE_VIDEO_LIMITS = Object.freeze({
  titleMaxChars: 118,
  displayTitleChars: 92,
  minDurationSeconds: 1,
  maxDurationSeconds: 180
})
const VIDEO_REQUIRED_HASHTAG = '#shophuyvan'
const VIDEO_DUPLICATE_HIGH_SCORE = 70
const VIDEO_DUPLICATE_MEDIUM_SCORE = 45
const SHOPEE_CREATOR_CENTER_VIDEO_UPLOAD_URL = 'https://banhang.shopee.vn/creator-center/video-upload/upload'
const VIDEO_LOCAL_HELPER_URL = 'http://127.0.0.1:8765'

const state = {
  activeTab: 'center',
  activeSubtab: cleanText(initialVideoParams.get('view') || 'library'),
  capabilities: [],
  selectedShop: cleanText(initialVideoParams.get('shop') || initialVideoParams.get('apiShop') || localStorage.getItem(VIDEO_SELECTED_SHOP_KEY)),
  selectedLazadaShop: cleanText(initialVideoParams.get('lazadaShop') || initialVideoParams.get('shopLazada') || (initialVideoParams.get('view') === 'lazada' ? initialVideoParams.get('shop') : '') || localStorage.getItem(LAZADA_VIDEO_SELECTED_SHOP_KEY)),
  periodType: 'Last7d',
  endDate: defaultEndDate(),
  analysisSort: cleanText(localStorage.getItem('shv_video_analysis_sort') || 'sales'),
  analysisMin: numberValue(localStorage.getItem('shv_video_analysis_min') || 0),
  publishMode: cleanText(localStorage.getItem('shv_video_publish_mode') || 'schedule'),
  dashboard: null,
  selectedVideoKey: '',
  libraryLimit: 20,
  libraryQuery: '',
  libraryStatus: 'post',
  libraryBadTitleOnly: false,
  librarySelectedKeys: new Set(),
  detail: null,
  editItems: [],
  uploadItems: [],
  scheduleItems: [],
  uploadQueue: [],
  multiShopRows: [],
  multiShopPreview: null,
  multiCampaignKey: '',
  multiCampaignName: '',
  multiDefaultScheduledAt: '',
  multiShopFile: null,
  multiShopFileMeta: null,
  multiShopFileMetaError: '',
  multiShopProductSearch: {},
  multiShopLoading: false,
  uploadFileMeta: null,
  uploadFileMetaError: '',
  aiTitleSuggestions: [],
  aiTitleProvider: '',
  aiTitleLoading: false,
  editTitleSuggestions: [],
  editTitleProvider: '',
  editTitleLoading: false,
  editCoverUrl: '',
  lazadaVideoId: '',
  lazadaVideoTitle: '',
  lazadaCoverUrl: '',
  lazadaVideoUsage: 'pro_main_video',
  lazadaQuota: null,
  lazadaDetail: null,
  lazadaLibrary: [],
  lazadaLibraryQuery: '',
  lazadaLibraryLimit: 20,
  librarySyncing: false,
  libraryDeleting: false,
  editSearchTimer: null,
  uploadSearchTimer: null,
  scheduleSearchTimer: null
}

// Chuẩn hóa dữ liệu văn bản để UI không bị dính giá trị rỗng giả như null/undefined.
function cleanText(value) {
  return String(value ?? '').trim()
}

const PACKING_SCAN_FIELD_HINTS = new Set([
  'orderid',
  'ordersn',
  'orderno',
  'ordernumber',
  'trackingnumber',
  'trackingno',
  'waybill',
  'waybillno',
  'logisticsno',
  'shippingcode',
  'packagenumber',
  'packageno'
])

function isPackingScanToken(value) {
  const token = cleanText(value).replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9._-]+$/g, '')
  if (!token || token.length < 6 || token.length > 50) return false
  if (!/[0-9]/.test(token)) return false
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(token)) return false
  return !/^(HTTPS?|WWW|SELLER|SHOPEE|LAZADA|TIKTOK|ORDER|TRACKING|WAYBILL|NUMBER)$/i.test(token)
}

function addPackingScanCandidate(list, seen, value) {
  const token = cleanText(value).replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9._-]+$/g, '')
  if (!isPackingScanToken(token)) return
  const key = token.toUpperCase()
  if (seen.has(key)) return
  seen.add(key)
  list.push(token)
}

function normalizePackingScanInput(rawValue) {
  const raw = cleanText(rawValue)
  if (!raw) return { raw: '', code: '', candidates: [] }
  const seen = new Set()
  const candidates = []
  const texts = [raw]
  try {
    const decoded = decodeURIComponent(raw)
    if (decoded && decoded !== raw) texts.push(decoded)
  } catch {}

  texts.forEach(text => {
    try {
      const parsedUrl = /^https?:\/\//i.test(text) ? new URL(text) : null
      if (parsedUrl) {
        for (const [key, value] of parsedUrl.searchParams.entries()) {
          if (PACKING_SCAN_FIELD_HINTS.has(cleanText(key).replace(/[^a-z0-9]/gi, '').toLowerCase())) addPackingScanCandidate(candidates, seen, value)
        }
        parsedUrl.pathname.split(/[\/\s]+/).forEach(part => addPackingScanCandidate(candidates, seen, part))
      }
    } catch {}

    try {
      const params = new URLSearchParams(text.replace(/^[?#]/, ''))
      for (const [key, value] of params.entries()) {
        if (PACKING_SCAN_FIELD_HINTS.has(cleanText(key).replace(/[^a-z0-9]/gi, '').toLowerCase())) addPackingScanCandidate(candidates, seen, value)
      }
    } catch {}

    if (/^[\[{]/.test(text.trim())) {
      try {
        const parsed = JSON.parse(text)
        Object.entries(parsed || {}).forEach(([key, value]) => {
          if (PACKING_SCAN_FIELD_HINTS.has(cleanText(key).replace(/[^a-z0-9]/gi, '').toLowerCase())) addPackingScanCandidate(candidates, seen, value)
        })
      } catch {}
    }

    // Dashboard video cũng nhận QR/URL từ tem, nên rút về mã đơn hoặc mã vận đơn trước khi gọi API.
    const keyedPattern = /(?:order|tracking|waybill|logistics|package|shipping)[_\-\s]*(?:id|sn|no|number|code)?\s*[:=]\s*["']?([A-Za-z0-9._-]{6,50})/gi
    for (const match of text.matchAll(keyedPattern)) addPackingScanCandidate(candidates, seen, match[1])
    addPackingScanCandidate(candidates, seen, text)
    for (const match of text.matchAll(/[A-Za-z0-9][A-Za-z0-9._-]{5,49}/g)) addPackingScanCandidate(candidates, seen, match[0])
  })

  return { raw, code: candidates[0] || raw, candidates }
}

function validVideoCoverUrl(value) {
  const text = cleanText(value)
  const lower = text.toLowerCase()
  if (!text || lower === '0' || lower === 'null' || lower === 'undefined' || /^\d+$/.test(text)) return ''
  return /^https?:\/\//i.test(text) ? text : ''
}

function videoCoverBelongsToVideo(value, videoUploadId = '') {
  const cover = validVideoCoverUrl(value)
  const currentVideoId = cleanText(videoUploadId)
  if (!cover) return ''
  if (!currentVideoId) return cover
  return cover.includes(currentVideoId) ? cover : ''
}

function firstVideoCoverUrlForVideo(rows = [], videoUploadId = '') {
  return (Array.isArray(rows) ? rows : [])
    .map(row => videoCoverBelongsToVideo(row, videoUploadId))
    .find(Boolean) || ''
}

function preferredVideoCoverUrl(video = {}, detail = state.detail) {
  const videoUploadId = cleanText(video?.video_upload_id)
  return firstVideoCoverUrlForVideo(detail?.cover_list, videoUploadId) ||
    videoCoverBelongsToVideo(video?.cover_image_url, videoUploadId)
}

function canUseVideoLocalHelper() {
  const host = window.location.hostname
  return window.location.protocol === 'file:'
    || host === 'localhost'
    || host === '127.0.0.1'
    || host === '[::1]'
    || host === 'shophuyvan-analytics.nghiemchihuy.workers.dev'
}

async function videoLocalHelperFetch(path, body = {}) {
  if (!canUseVideoLocalHelper()) {
    throw new Error('Trình duyệt đang chặn gọi helper local. Hãy mở OMS bằng domain chính hoặc localhost.')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(10000, Number(body.process_timeout || 300) * 1000))
  try {
    const response = await fetch(`${VIDEO_LOCAL_HELPER_URL}${path}`, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data?.ok === false) {
      throw new Error(cleanText(data?.message || data?.error) || `Helper local lỗi ${response.status}`)
    }
    return data
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Helper local phản hồi quá lâu hoặc trình duyệt chặn kết nối localhost.')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function rememberSelectedVideoShop(shopName) {
  const finalShop = cleanText(shopName)
  if (!finalShop) return
  localStorage.setItem(VIDEO_SELECTED_SHOP_KEY, finalShop)
  const params = new URLSearchParams(window.location.search)
  params.set('shop', finalShop)
  window.history.replaceState({}, document.title, `${window.location.pathname}?${params.toString()}`)
}

function rememberSelectedLazadaVideoShop(shopName) {
  const finalShop = cleanText(shopName)
  if (!finalShop) return
  localStorage.setItem(LAZADA_VIDEO_SELECTED_SHOP_KEY, finalShop)
  const params = new URLSearchParams(window.location.search)
  params.set('lazadaShop', finalShop)
  if (state.activeSubtab === 'lazada') params.set('view', 'lazada')
  window.history.replaceState({}, document.title, `${window.location.pathname}?${params.toString()}`)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function numberValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function defaultEndDate() {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  return date.toISOString().slice(0, 10)
}

function formatNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(numberValue(value))
}

function formatCurrency(value) {
  return `${formatNumber(value)}đ`
}

function shortDateTime(value) {
  const text = cleanText(value)
  if (!text) return 'Chưa có'
  if (/^\d+$/.test(text)) {
    const rawNumber = Number(text)
    const time = rawNumber > 1000000000000 ? rawNumber : rawNumber * 1000
    const numericDate = new Date(time)
    if (!Number.isNaN(numericDate.getTime())) {
      return numericDate.toLocaleString('vi-VN', { hour12: false })
    }
  }
  const normalized = text.includes('T') ? text : text.replace(' ', 'T')
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return text
  return date.toLocaleString('vi-VN', { hour12: false })
}

function defaultScheduleDateTimeLocal(minutes = 30) {
  const date = new Date(Date.now() + minutes * 60 * 1000)
  date.setSeconds(0, 0)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function formatFileSize(bytes) {
  const size = numberValue(bytes)
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${formatNumber(size)} B`
}

function formatDurationMs(value) {
  const seconds = Math.max(0, Math.round(numberValue(value) / 1000))
  if (!seconds) return ''
  const minutes = Math.floor(seconds / 60)
  const remain = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`
}

function formatDurationSeconds(value) {
  const seconds = Math.max(0, Math.round(numberValue(value)))
  const minutes = Math.floor(seconds / 60)
  const remain = seconds % 60
  return minutes ? `${minutes} phút ${remain} giây` : `${remain} giây`
}

function truncateDisplayText(value, maxLength = SHOPEE_VIDEO_LIMITS.displayTitleChars) {
  const text = cleanText(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`
}

function uploadCaptionValue() {
  return cleanText(document.getElementById('videoUploadCaption')?.value || '')
}

function editCaptionValue() {
  return cleanText(document.getElementById('videoEditCaption')?.value || '')
}

function uploadDurationValue() {
  return Math.round(numberValue(document.getElementById('videoUploadDuration')?.value || 0))
}

function normalizeCompareText(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/#shophuyvan/g, ' ')
    .replace(/#[a-z0-9_]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compareTokens(value) {
  const stopWords = new Set(['cho', 'voi', 'cua', 'theo', 'nhanh', 'hang', 'shop', 'mua', 'ngay', 'sieu', 'video', 'san', 'pham'])
  return normalizeCompareText(value)
    .split(' ')
    .filter(token => token.length >= 3 && !stopWords.has(token))
}

function tokenSimilarity(leftValue, rightValue) {
  const left = new Set(compareTokens(leftValue))
  const right = new Set(compareTokens(rightValue))
  if (!left.size || !right.size) return 0
  let intersection = 0
  left.forEach(token => {
    if (right.has(token)) intersection += 1
  })
  const union = new Set([...left, ...right]).size || 1
  return intersection / union
}

function hasRequiredVideoHashtag(value) {
  return /(^|\s)#shophuyvan(\s|$)/i.test(cleanText(value))
}

function ensureRequiredVideoHashtag(value) {
  const text = cleanText(value)
  if (hasRequiredVideoHashtag(text)) return text.slice(0, SHOPEE_VIDEO_LIMITS.titleMaxChars)
  const maxBaseLength = Math.max(0, SHOPEE_VIDEO_LIMITS.titleMaxChars - VIDEO_REQUIRED_HASHTAG.length - 1)
  const base = text.replace(/#shophuyvan/ig, '').replace(/\s+/g, ' ').trim().slice(0, maxBaseLength).trim()
  return `${base} ${VIDEO_REQUIRED_HASHTAG}`.trim()
}

function newCampaignVideoKey(fileName = '') {
  const base = cleanText(fileName).replace(/\.[a-z0-9]+$/i, '') || `chien-dich-${new Date().toISOString().slice(0, 10)}`
  return `vcmp_${base}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    .replace(/-$/g, '')
}

function shopeeVideoCapabilityRows() {
  return state.capabilities.filter(row => cleanText(row.platform) === 'shopee')
}

function lazadaVideoCapabilityRows() {
  return state.capabilities.filter(row => cleanText(row.platform) === 'lazada')
}

function selectedLazadaShopRow() {
  return lazadaVideoCapabilityRows().find(row => cleanText(row.shop_name || row.shop || row.user_name) === cleanText(state.selectedLazadaShop)) || null
}

function lazadaVideoRowId(row = {}) {
  return cleanText(row.video_upload_id || row.post_id || row.video_key)
}

function lazadaVideoStatusTone(row = {}) {
  const status = numberValue(row.status)
  if (status === 300) return 'success'
  if (status === 200) return 'warning'
  if (status === 400 || status >= 600) return 'danger'
  return 'muted'
}

function findLazadaLibraryRow(videoId) {
  const target = cleanText(videoId)
  return (state.lazadaLibrary || []).find(row => {
    const rowId = lazadaVideoRowId(row)
    return rowId === target || cleanText(row.video_key) === target
  }) || null
}

function lazadaLibraryRowsForDisplay() {
  const query = normalizeCompareText(state.lazadaLibraryQuery)
  return (state.lazadaLibrary || []).filter(row => {
    if (!query) return true
    const haystack = normalizeCompareText([
      row.caption,
      row.video_key,
      row.video_upload_id,
      row.post_id,
      row.status_label,
      row.shop
    ].join(' '))
    return haystack.includes(query)
  })
}

function selectLazadaVideoRow(row = {}) {
  const videoId = lazadaVideoRowId(row)
  if (!videoId) return
  state.lazadaVideoId = videoId
  state.lazadaVideoTitle = cleanText(row.caption || state.lazadaVideoTitle)
  state.lazadaCoverUrl = validVideoCoverUrl(row.cover_image_url) || state.lazadaCoverUrl
  state.lazadaDetail = {
    video: {
      video_id: videoId,
      title: cleanText(row.caption),
      state_label: cleanText(row.status_label),
      cover_url: cleanText(row.cover_image_url),
      video_url: cleanText(row.video_url)
    }
  }
}
