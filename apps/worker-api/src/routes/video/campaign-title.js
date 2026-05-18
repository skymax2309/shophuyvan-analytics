import { listMarketplaceShopCapabilities } from '../../core/marketplace/shop-capability-core.js'
import { ensureVideoAnalyticsTables, readMarketplaceVideoLibrary } from '../../core/video/analytics-core.js'
import { listVideoCatalogProducts } from '../../core/video/catalog-core.js'
import { loadShopeeVideoShop } from './lazada-media.js'
import { canUseShopeeVideoApi, shopeeVideoIdentityWarning } from './shared-api-client.js'
import { cleanVideoText, json, normalizeVideoCapability, numberValue, parseJsonText, SHOPEE_CREATOR_CENTER_VIDEO_UPLOAD_URL, SHOPEE_VIDEO_MAX_DURATION_SECONDS, SHOPEE_VIDEO_MIN_DURATION_SECONDS, SHOPEE_VIDEO_REQUIRED_HASHTAG, SHOPEE_VIDEO_TITLE_MAX_CHARS, VIDEO_DUPLICATE_MEDIUM_SCORE } from './shared-base.js'
import { createHash } from 'node:crypto'

export function bufferMd5Hex(buffer) {
  // Dùng MD5 theo đúng flow upload video từng phần của Shopee.
  // Chấp nhận cả ArrayBuffer lẫn Uint8Array để tránh phụ thuộc vào Buffer ở các nơi gọi.
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  return createHash('md5').update(bytes).digest('hex')
}

export function localDateTimeText(offsetMinutes = 0) {
  return new Date(Date.now() + (7 * 60 + offsetMinutes) * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ')
}

export function normalizeLocalDateTimeText(value) {
  const text = cleanVideoText(value).replace('T', ' ')
  const match = text.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return ''
  return `${match[1]} ${match[2]}:${match[3]}:${match[4] || '00'}`
}

export function safeVideoFileName(value) {
  const text = cleanVideoText(value || 'video.mp4')
  const safe = text.replace(/[\\/:*?"<>|#%{}~&]/g, '-').replace(/\s+/g, '-').slice(0, 120)
  return safe || 'video.mp4'
}

export function newVideoQueueId() {
  const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `vup_${String(randomPart).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}`
}

export function buildVideoQueueR2Key(queueId, fileName) {
  const datePart = localDateTimeText().slice(0, 10).replace(/-/g, '')
  return `video-upload-queue/${datePart}/${cleanVideoText(queueId)}/${safeVideoFileName(fileName)}`
}

export function normalizeCampaignVideoKey(value, fileName = '') {
  const base = cleanVideoText(value) ||
    cleanVideoText(fileName).replace(/\.[a-z0-9]+$/i, '') ||
    `campaign-${Date.now()}`
  const normalizedBase = base.replace(/^vcmp[_-]*/i, '')
  return `vcmp_${normalizedBase}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^vcmp-vcmp-/i, 'vcmp-')
    .slice(0, 80)
    .replace(/-$/g, '')
}

export function buildVideoCampaignR2Key(campaignVideoKey, fileName) {
  const datePart = localDateTimeText().slice(0, 10).replace(/-/g, '')
  return `video-upload-campaign/${datePart}/${cleanVideoText(campaignVideoKey)}/${safeVideoFileName(fileName)}`
}

export function parseVideoItemRows(value) {
  const rows = parseJsonText(cleanVideoText(value), [])
  return Array.isArray(rows) ? rows.slice(0, 6) : []
}

export function validateVideoUploadDuration(value) {
  const durationSeconds = Math.round(numberValue(value))
  if (durationSeconds < SHOPEE_VIDEO_MIN_DURATION_SECONDS || durationSeconds > SHOPEE_VIDEO_MAX_DURATION_SECONDS) {
    throw new Error(`Shopee Video yêu cầu video dài từ ${SHOPEE_VIDEO_MIN_DURATION_SECONDS} đến ${SHOPEE_VIDEO_MAX_DURATION_SECONDS} giây.`)
  }
  return durationSeconds
}

export function stripJsonFence(text) {
  return String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim()
}

export function clampVideoTitle(value, maxChars = SHOPEE_VIDEO_TITLE_MAX_CHARS) {
  const max = Math.min(Math.max(Math.round(numberValue(maxChars)) || SHOPEE_VIDEO_TITLE_MAX_CHARS, 40), SHOPEE_VIDEO_TITLE_MAX_CHARS)
  return cleanVideoText(value)
    .replace(/\s+/g, ' ')
    .slice(0, max)
    .trim()
}

export function normalizeTitleMatchText(value) {
  return cleanVideoText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function videoTitleAnchor(body = {}) {
  const items = Array.isArray(body.items) ? body.items : []
  const firstProduct = cleanVideoText(items[0]?.product_name || items[0]?.item_name || items[0]?.item_sku || items[0]?.item_id)
  const caption = cleanVideoText(body.caption)
  const source = firstProduct || caption
  const anchor = source.split(/[,\n.;|#]/)[0]
  return clampVideoTitle(anchor, 48)
}

export function videoTitleMatchesAnchor(title, anchor) {
  const anchorTokens = normalizeTitleMatchText(anchor)
    .split(' ')
    .filter(token => token.length >= 3 && !['cho', 'voi', 'cua', 'theo', 'nhanh', 'hang'].includes(token))
    .slice(0, 4)
  if (!anchorTokens.length) return true
  const titleText = normalizeTitleMatchText(title)
  const matched = anchorTokens.filter(token => titleText.includes(token)).length
  return titleText.includes(anchorTokens[0]) && matched >= Math.min(2, anchorTokens.length)
}

export function normalizeVideoHashtag(value) {
  const tokens = normalizeTitleMatchText(value)
    .split(' ')
    .filter(token => token.length >= 3 && !['cho', 'voi', 'cua', 'theo', 'nhanh', 'hang', 'shop', 'video'].includes(token))
    .slice(0, 4)
  if (!tokens.length) return ''
  return `#${tokens.join('')}`.slice(0, 32)
}

export function buildVideoTitleHashtags(body = {}, anchor = '') {
  const tags = [SHOPEE_VIDEO_REQUIRED_HASHTAG]
  const itemRows = Array.isArray(body.items) ? body.items : []
  const productText = cleanVideoText(itemRows[0]?.product_name || itemRows[0]?.item_name || itemRows[0]?.item_sku)
  const productTag = normalizeVideoHashtag(anchor || productText || body.caption)
  if (productTag && productTag.toLowerCase() !== SHOPEE_VIDEO_REQUIRED_HASHTAG) tags.push(productTag)
  return [...new Set(tags.map(tag => tag.toLowerCase()))].slice(0, 2)
}

export function ensureVideoTitleHashtags(title, maxChars = SHOPEE_VIDEO_TITLE_MAX_CHARS, hashtags = [SHOPEE_VIDEO_REQUIRED_HASHTAG]) {
  const uniqueTags = [...new Set([SHOPEE_VIDEO_REQUIRED_HASHTAG, ...hashtags].map(tag => cleanVideoText(tag).toLowerCase()).filter(Boolean))]
  let cleanTitle = cleanVideoText(title)
    .replace(/#[a-zA-Z0-9_À-ỹ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const suffix = ` ${uniqueTags.join(' ')}`
  const maxBaseLength = Math.max(0, maxChars - suffix.length)
  const wasTruncated = cleanTitle.length > maxBaseLength
  cleanTitle = cleanTitle.slice(0, maxBaseLength).trim()
  const lastSpace = cleanTitle.lastIndexOf(' ')
  if (lastSpace > Math.floor(maxBaseLength * 0.65)) cleanTitle = cleanTitle.slice(0, lastSpace).trim()
  const weakEndingWords = new Set(['đa', 'vệ', 'sinh', 'hư'])
  let previousTitle = ''
  while (previousTitle !== cleanTitle) {
    previousTitle = cleanTitle
    cleanTitle = cleanTitle.replace(/\s+([^\s]+)$/u, (match, word) => weakEndingWords.has(cleanVideoText(word).toLowerCase()) ? '' : match).trim()
    cleanTitle = cleanTitle.replace(/[,\-:;]+$/g, '').replace(/\s+(không|luôn|và|với|cho|để|cực|siêu|combo|dễ|cao|mọi|lắp|hiệu|an|chống|theo|tiện|chi)$/iu, '').trim()
  }
  if (wasTruncated && cleanTitle && !/[.!?]$/.test(cleanTitle)) cleanTitle = `${cleanTitle}.`
  return clampVideoTitle(`${cleanTitle}${suffix}`.trim(), maxChars)
}

export function compareVideoTokens(value) {
  const stopWords = new Set(['cho', 'voi', 'cua', 'theo', 'nhanh', 'hang', 'shop', 'mua', 'ngay', 'sieu', 'video', 'san', 'pham'])
  return normalizeTitleMatchText(value)
    .replace(/shophuyvan/g, ' ')
    .split(' ')
    .filter(token => token.length >= 3 && !stopWords.has(token))
}

export function videoTokenSimilarity(leftValue, rightValue) {
  const left = new Set(compareVideoTokens(leftValue))
  const right = new Set(compareVideoTokens(rightValue))
  if (!left.size || !right.size) return 0
  let matched = 0
  for (const token of left) {
    if (right.has(token)) matched += 1
  }
  return matched / (new Set([...left, ...right]).size || 1)
}

export function normalizeCampaignItemRows(value) {
  if (Array.isArray(value)) {
    return value.map(item => ({
      item_id: cleanVideoText(item.item_id || item.itemId || item.platform_item_id || item),
      item_sku: cleanVideoText(item.item_sku || item.matched_sku || item.sku),
      matched_sku: cleanVideoText(item.matched_sku || item.item_sku || item.sku),
      product_name: cleanVideoText(item.product_name || item.item_name || item.item_sku),
      custom_item_name: cleanVideoText(item.custom_item_name || item.customItemName)
    })).filter(item => item.item_id).slice(0, 6)
  }
  return cleanVideoText(value)
    .split(/[\s,;|]+/)
    .map(itemId => ({ item_id: cleanVideoText(itemId) }))
    .filter(item => item.item_id)
    .slice(0, 6)
}

export function parseCampaignShopConfigs(value) {
  const rows = parseJsonText(value, value)
  const list = Array.isArray(rows?.shop_configs) ? rows.shop_configs : (Array.isArray(rows) ? rows : [])
  return list.map(row => {
    const hashtags = Array.isArray(row.hashtags)
      ? row.hashtags
      : cleanVideoText(row.hashtags || row.hashtag)
        .split(/[\s,;|]+/)
        .filter(Boolean)
    return {
      shop: cleanVideoText(row.shop || row.shop_name),
      enabled: Number(row.enabled ?? 1) === 1 || row.enabled === true,
      caption: cleanVideoText(row.caption || row.title),
      hashtags,
      scheduled_at: normalizeLocalDateTimeText(row.scheduled_at || row.scheduledAt),
      item_rows: normalizeCampaignItemRows(row.item_rows || row.items || row.item_ids || row.itemIds),
      allow_duplicate: Number(row.allow_duplicate ?? row.allowDuplicate ?? 0) === 1 || row.allow_duplicate === true,
      allow_duet: Number(row.allow_duet ?? row.allowDuet ?? 1) ? 1 : 0,
      allow_stitch: Number(row.allow_stitch ?? row.allowStitch ?? 1) ? 1 : 0
    }
  }).filter(row => row.shop)
}

export async function validateCampaignCatalogItems(env, shopName, itemRows = []) {
  const normalized = []
  const missing = []
  for (const item of itemRows) {
    const itemId = cleanVideoText(item.item_id)
    if (!itemId) continue
    const catalogRows = await listVideoCatalogProducts(env, {
      platform: 'shopee',
      shop: shopName,
      query: itemId,
      limit: 10,
    })
    const catalog = catalogRows.find(row => cleanVideoText(row.item_id) === itemId)
    if (!catalog) {
      missing.push(itemId)
      continue
    }
    normalized.push({
      item_id: itemId,
      item_sku: cleanVideoText(item.item_sku || catalog.item_sku),
      matched_sku: cleanVideoText(item.matched_sku || catalog.matched_sku || catalog.item_sku),
      product_name: cleanVideoText(item.product_name || catalog.product_name),
      custom_item_name: cleanVideoText(item.custom_item_name)
    })
  }
  return { normalized, missing }
}

export function topCampaignDuplicate(libraryRows = [], caption = '', itemRows = []) {
  const draftItemIds = new Set(itemRows.map(item => cleanVideoText(item.item_id)).filter(Boolean))
  const draftText = [caption, itemRows.map(item => cleanVideoText(item.product_name || item.item_id)).join(' ')].filter(Boolean).join(' ')
  return (libraryRows || [])
    .map(row => {
      const links = Array.isArray(row.links) ? row.links : []
      const rowText = [row.caption, links.map(link => cleanVideoText(link.product_name || link.item_name || link.item_id)).join(' ')].filter(Boolean).join(' ')
      const textScore = Math.round(videoTokenSimilarity(draftText, rowText) * 82)
      const rowItemIds = new Set(links.map(link => cleanVideoText(link.item_id)).filter(Boolean))
      let itemOverlap = 0
      draftItemIds.forEach(itemId => {
        if (rowItemIds.has(itemId)) itemOverlap += 1
      })
      const itemScore = draftItemIds.size ? Math.round((itemOverlap / draftItemIds.size) * 18) : 0
      return {
        video_key: cleanVideoText(row.video_key),
        video_upload_id: cleanVideoText(row.video_upload_id),
        post_id: cleanVideoText(row.post_id),
        caption: cleanVideoText(row.caption),
        views: numberValue(row.views),
        likes: numberValue(row.likes),
        duplicate_score: Math.min(100, textScore + itemScore)
      }
    })
    .filter(row => row.duplicate_score >= 30)
    .sort((left, right) => right.duplicate_score - left.duplicate_score)[0] || null
}

export async function latestCampaignQueue(env, campaignVideoKey, shopName) {
  const source = `dashboard_video_multi_shop:${cleanVideoText(campaignVideoKey)}`
  const row = await env.DB.prepare(`
    SELECT *
    FROM marketplace_video_upload_queue
    WHERE platform = 'shopee'
      AND shop = ?
      AND source = ?
    ORDER BY id DESC
    LIMIT 1
  `).bind(shopName, source).first()
  return row || null
}

export function campaignStatus(row = {}) {
  if (row.queue_status === 'done') return { code: 'posted', label: 'Đã đăng', can_queue: false, tone: 'success' }
  if (row.queue_status === 'browser_posted') return { code: 'browser_posted', label: 'Đã đăng tay', can_queue: false, tone: 'success' }
  if (row.queue_status === 'browser_preview_ready') return { code: 'browser_preview_ready', label: 'Đã mở preview Chrome', can_queue: false, can_manual: true, tone: 'success' }
  if (row.queue_status === 'browser_opening' || row.queue_status === 'browser_uploading') return { code: row.queue_status, label: 'Chrome local đang thao tác', can_queue: false, can_manual: true, tone: 'warning' }
  if (row.queue_status === 'browser_login_required') return { code: 'browser_login_required', label: 'Cần đăng nhập Seller Center', can_queue: false, can_manual: true, tone: 'warning' }
  if (row.queue_status === 'browser_error') return { code: 'browser_error', label: 'Chrome local lỗi', can_queue: false, can_manual: true, tone: 'danger' }
  if (row.queue_status === 'browser_upload_required') return { code: 'browser_upload_required', label: 'Chờ Chrome local', can_queue: false, can_manual: true, tone: 'warning' }
  if (row.queue_status === 'queued' || row.queue_status === 'processing') return { code: 'queued', label: 'Đang chờ lịch', can_queue: false, tone: 'warning' }
  if (row.queue_status === 'error') return { code: 'upload_error', label: 'Đăng lỗi', can_queue: true, tone: 'danger' }
  if (!row.enabled) return { code: 'disabled', label: 'Chưa chọn', can_queue: false, tone: 'muted' }
  if (!cleanVideoText(row.caption)) return { code: 'missing_caption', label: 'Chưa có tiêu đề', can_queue: false, tone: 'warning' }
  if (!row.item_rows?.length) return { code: 'missing_product', label: 'Chưa gắn sản phẩm', can_queue: false, tone: 'warning' }
  if (row.missing_item_ids?.length) return { code: 'missing_product', label: 'Sản phẩm không có trong shop', can_queue: false, tone: 'danger' }
  if (row.duplicate?.duplicate_score >= VIDEO_DUPLICATE_MEDIUM_SCORE && !row.allow_duplicate) {
    return { code: 'similar_video', label: 'Có video gần giống', can_queue: false, tone: 'warning' }
  }
  if (!row.video_ready) return { code: 'manual_upload', label: 'Tạo job Chrome local', can_queue: false, can_manual: true, tone: 'warning' }
  return { code: 'ready', label: 'Chờ đăng', can_queue: true, tone: 'success' }
}

export async function buildVideoMultiShopPreview(env, input = {}) {
  await ensureVideoAnalyticsTables(env)
  const campaignVideoKey = normalizeCampaignVideoKey(input.campaign_video_key || input.campaignVideoKey, input.file_name)
  const campaignName = cleanVideoText(input.campaign_name || input.campaignName || campaignVideoKey)
  const defaultScheduledAt = normalizeLocalDateTimeText(input.scheduled_at || input.default_scheduled_at || input.defaultScheduledAt) || localDateTimeText(30)
  const configs = parseCampaignShopConfigs(input.shop_configs || input.rows || input.configs || [])
  const shops = await listMarketplaceShopCapabilities(env, {
    platform: 'shopee',
    includeSecrets: true,
    limit: 300
  })
  const shopMap = new Map((shops || []).map(row => [cleanVideoText(row.shop_name || row.shop || row.user_name), row]))
  const rows = []

  for (const config of configs) {
    const shop = shopMap.get(config.shop) || await loadShopeeVideoShop(env, config.shop)
    const videoReady = canUseShopeeVideoApi(shop || {}) ? 1 : 0
    const identityWarning = shop ? shopeeVideoIdentityWarning(shop) : 'Không tìm thấy shop Shopee API.'
    // NEO: Preview video đa shop luôn kiểm catalog đúng shop; shop chưa API cũng không được mượn item/link shop khác.
    const { normalized: itemRows, missing: missingItemIds } = await validateCampaignCatalogItems(env, config.shop, config.item_rows)
    const hashtags = buildVideoTitleHashtags({ caption: config.caption, items: itemRows }, videoTitleAnchor({ caption: config.caption, items: itemRows }))
      .concat(config.hashtags)
    const caption = cleanVideoText(config.caption)
      ? ensureVideoTitleHashtags(config.caption, SHOPEE_VIDEO_TITLE_MAX_CHARS, hashtags)
      : ''
    const library = await readMarketplaceVideoLibrary(env, {
      platform: 'shopee',
      shop: config.shop,
      limit: 200
    })
    const duplicate = topCampaignDuplicate(library.rows || [], caption, itemRows)
    const queued = await latestCampaignQueue(env, campaignVideoKey, config.shop)
    const row = {
      campaign_video_key: campaignVideoKey,
      campaign_name: campaignName,
      shop: config.shop,
      enabled: config.enabled ? 1 : 0,
      video_ready: videoReady,
      video_sync_mode: normalizeVideoCapability(shop || { platform: 'shopee' }).video_sync_mode,
      api_message: videoReady ? 'Đủ điều kiện Shopee Video API.' : cleanVideoText(identityWarning || normalizeVideoCapability(shop || { platform: 'shopee' }).video_operator_guide),
      caption,
      scheduled_at: config.scheduled_at || defaultScheduledAt,
      item_rows: itemRows,
      missing_item_ids: missingItemIds,
      allow_duplicate: config.allow_duplicate ? 1 : 0,
      allow_duet: config.allow_duet,
      allow_stitch: config.allow_stitch,
      duplicate,
      queue_id: cleanVideoText(queued?.queue_id),
      queue_status: cleanVideoText(queued?.status),
      queue_error: cleanVideoText(queued?.last_error),
      manual_upload_url: SHOPEE_CREATOR_CENTER_VIDEO_UPLOAD_URL
    }
    const status = campaignStatus(row)
    rows.push({
      ...row,
      status_code: status.code,
      status_label: status.label,
      can_queue: status.can_queue ? 1 : 0,
      can_manual: status.can_manual ? 1 : 0,
      manual_required: status.code === 'manual_upload' ? 1 : 0,
      status_tone: status.tone
    })
  }

  return {
    campaign_video_key: campaignVideoKey,
    campaign_name: campaignName,
    default_scheduled_at: defaultScheduledAt,
    rows,
    summary: {
      total: rows.length,
      ready: rows.filter(row => row.can_queue).length,
      missing_api: rows.filter(row => row.enabled && !row.video_ready).length,
      manual_upload: rows.filter(row => ['manual_upload', 'browser_upload_required', 'browser_opening', 'browser_uploading', 'browser_preview_ready', 'browser_login_required', 'browser_error'].includes(row.status_code)).length,
      browser_upload: rows.filter(row => ['browser_upload_required', 'browser_opening', 'browser_uploading', 'browser_preview_ready', 'browser_login_required', 'browser_error'].includes(row.status_code)).length,
      similar_video: rows.filter(row => row.status_code === 'similar_video').length,
      queued: rows.filter(row => row.status_code === 'queued').length,
      posted: rows.filter(row => row.status_code === 'posted').length,
      error: rows.filter(row => row.status_code === 'upload_error').length
    }
  }
}

export function getGeminiVideoTitleKeys(env) {
  return [
    env.GEMINI_VIDEO_API_KEY,
    env.GEMINI_API_KEY_1,
    env.GEMINI_API_KEY_2,
    env.GEMINI_API_KEY_3,
    env.GEMINI_API_KEY_4,
    env.GEMINI_API_KEY_5
  ].filter(Boolean)
}

export function normalizeVideoTitleSuggestions(value, maxChars = SHOPEE_VIDEO_TITLE_MAX_CHARS, options = {}) {
  const raw = parseJsonText(value, value)
  const list = Array.isArray(raw?.suggestions) ? raw.suggestions : (Array.isArray(raw) ? raw : [])
  const seen = new Set()
  const normalized = []
  const anchor = cleanVideoText(options.anchor)
  const hashtags = Array.isArray(options.hashtags) && options.hashtags.length ? options.hashtags : [SHOPEE_VIDEO_REQUIRED_HASHTAG]
  for (const item of list) {
    let title = clampVideoTitle(item?.title || item, maxChars)
      .replace(/(zalo|số điện thoại|phone|hotline|inbox riêng|liên hệ riêng)/gi, '')
      .replace(/(100%|vĩnh viễn|tuyệt đối|cam kết|triệt để)/gi, '')
      .replace(/luôn thơm mát/gi, 'dễ chịu hơn')
      .replace(/\s+/g, ' ')
      .trim()
    if (anchor && !videoTitleMatchesAnchor(title, anchor)) continue
    title = ensureVideoTitleHashtags(title, maxChars, hashtags)
    const key = title.toLowerCase()
    if (!title || seen.has(key)) continue
    seen.add(key)
    normalized.push(title)
    if (normalized.length >= 5) break
  }
  return normalized
}

export function buildFallbackVideoTitleSuggestions(body = {}) {
  const items = Array.isArray(body.items) ? body.items : []
  const firstProduct = cleanVideoText(items[0]?.product_name || items[0]?.item_name || items[0]?.item_sku || items[0]?.item_id)
  const fileName = cleanVideoText(body.file_name).replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ')
  const anchor = videoTitleAnchor(body)
  const hashtags = buildVideoTitleHashtags(body, anchor)
  const base = clampVideoTitle(anchor || firstProduct || body.caption || fileName || 'Sản phẩm nổi bật hôm nay', 70)
  return normalizeVideoTitleSuggestions([
    `${base} - xem nhanh để chọn đúng mẫu`,
    `${base} dễ dùng, phù hợp nhu cầu hằng ngày`,
    `Xem thực tế ${base} trước khi mua`,
    `${base}: điểm đáng chú ý cho khách cần mua ngay`
  ], SHOPEE_VIDEO_TITLE_MAX_CHARS, { anchor, hashtags })
}

export async function requestGeminiVideoTitleSuggestions(env, body, fallbackSuggestions) {
  const keys = getGeminiVideoTitleKeys(env)
  if (!keys.length) {
    return { provider: 'local-fallback', fallback_reason: 'missing_gemini_key', suggestions: fallbackSuggestions }
  }
  const maxChars = Math.min(Math.max(Math.round(numberValue(body.max_chars)) || SHOPEE_VIDEO_TITLE_MAX_CHARS, 40), SHOPEE_VIDEO_TITLE_MAX_CHARS)
  const anchor = videoTitleAnchor(body)
  const hashtags = buildVideoTitleHashtags(body, anchor)
  const compactItems = (Array.isArray(body.items) ? body.items : []).slice(0, 6).map(item => ({
    item_id: cleanVideoText(item.item_id),
    product_name: cleanVideoText(item.product_name || item.item_name || item.item_sku)
  }))
  const prompt = [
    'Bạn là trợ lý viết tiêu đề Shopee Video bằng tiếng Việt cho shop vận hành.',
    `Hãy viết 5 tiêu đề/mô tả ngắn, toàn bộ mỗi dòng không quá ${Math.min(maxChars, 105)} ký tự tính cả hashtag.`,
    'Mục tiêu: rõ sản phẩm, có lợi ích thực tế, kích thích khách bấm xem và mua nhưng không phóng đại.',
    'Bắt buộc giữ đúng loại sản phẩm chính từ caption hoặc sản phẩm đã gắn; không tự đổi sang sản phẩm khác.',
    `Mỗi tiêu đề bắt buộc có hashtag ${SHOPEE_VIDEO_REQUIRED_HASHTAG} và thêm 1 hashtag sản phẩm phù hợp nếu còn ký tự.`,
    'Không ghi số điện thoại, Zalo, hotline, liên hệ ngoài sàn, cam kết y tế, cam kết tuyệt đối hoặc thông tin không có trong dữ liệu.',
    'Ưu tiên tiêu đề dễ quét trên mobile, không viết toàn chữ hoa, hạn chế emoji.',
    'Chỉ trả JSON đúng dạng {"suggestions":["..."]}.',
    `Dữ liệu: ${JSON.stringify({
      shop: cleanVideoText(body.shop),
      caption: cleanVideoText(body.caption),
      file_name: cleanVideoText(body.file_name),
      duration_seconds: numberValue(body.duration_seconds),
      items: compactItems
    })}`
  ].join('\n')
  let lastError = ''
  for (const key of keys) {
    try {
      const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7
          }
        })
      })
      const aiData = await aiRes.json()
      if (aiData.error) {
        lastError = cleanVideoText(aiData.error.message) || 'gemini_error'
        continue
      }
      const text = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
      const suggestions = normalizeVideoTitleSuggestions(JSON.parse(stripJsonFence(text)), maxChars, { anchor, hashtags })
      if (suggestions.length >= 3) {
        return { provider: 'gemini', suggestions: suggestions.slice(0, 5) }
      }
      lastError = 'gemini_changed_product_anchor'
    } catch (error) {
      lastError = cleanVideoText(error?.message)
    }
  }
  return {
    provider: 'local-fallback',
    fallback_reason: lastError || 'gemini_unavailable',
    suggestions: fallbackSuggestions
  }
}

export async function handleVideoTitleSuggestions(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  const maxChars = Math.min(Math.max(Math.round(numberValue(body.max_chars)) || SHOPEE_VIDEO_TITLE_MAX_CHARS, 40), SHOPEE_VIDEO_TITLE_MAX_CHARS)
  const anchor = videoTitleAnchor(body)
  const hashtags = buildVideoTitleHashtags(body, anchor)
  // Gợi ý AI chỉ tạo nội dung, không gửi lệnh ghi lên Shopee; người vận hành vẫn phải bấm Dùng rồi xem preview.
  const fallbackSuggestions = buildFallbackVideoTitleSuggestions({
    ...body,
    max_chars: maxChars
  })
  const result = await requestGeminiVideoTitleSuggestions(env, { ...body, max_chars: maxChars }, fallbackSuggestions)
  return json({
    status: 'ok',
    provider: result.provider,
    fallback_reason: result.fallback_reason || '',
    max_chars: maxChars,
    duration_limits: {
      min_seconds: SHOPEE_VIDEO_MIN_DURATION_SECONDS,
      max_seconds: SHOPEE_VIDEO_MAX_DURATION_SECONDS
    },
    title_anchor: anchor,
    required_hashtag: SHOPEE_VIDEO_REQUIRED_HASHTAG,
    suggestions: normalizeVideoTitleSuggestions(result.suggestions, maxChars, { anchor, hashtags })
  }, cors)
}
