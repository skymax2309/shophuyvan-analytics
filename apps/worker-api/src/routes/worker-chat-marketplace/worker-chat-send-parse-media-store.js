// NEO: Backend worker chat sàn - nhóm send-parse-media-store. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
async function listChatShops(env, cors) {
  await ensureChatTables(env)
  const canonical = await loadCanonicalChatShops(env)
  const { results: conversationRows } = await env.DB.prepare(`
    SELECT platform, shop, shop_id, conversation_id, unread_count,
           last_message_at
    FROM marketplace_chat_conversations
    WHERE conversation_id NOT LIKE 'CHAT_TEST%'
    ORDER BY id DESC
    LIMIT 5000
  `).all()

  const countMap = new Map()
  for (const row of conversationRows || []) {
    const key = canonicalChatShopKeyForValues(row.platform, row.shop, row.shop_id, canonical.aliasToKey)
    if (!key) continue
    const agg = countMap.get(key) || { conversations: 0, unread: 0, last_message_at: '', byConversation: new Map() }
    const conversationId = cleanText(row.conversation_id || row.id)
    const unread = Number(row.unread_count || 0)
    const previous = agg.byConversation.get(conversationId)
    if (previous) {
      const nextUnread = Math.max(previous.unread, unread)
      agg.unread += nextUnread - previous.unread
      previous.unread = nextUnread
    } else {
      agg.byConversation.set(conversationId, { unread })
      agg.conversations += 1
      agg.unread += unread
    }
    if (cleanText(row.last_message_at) > cleanText(agg.last_message_at)) agg.last_message_at = row.last_message_at
    countMap.set(key, agg)
  }

  const items = canonical.items.map(shop => {
    const count = countMap.get(shop.canonical_shop_key) || {}
    const transport = resolveChatTransportForShop(shop)
    const scanPolicy = resolveChatScanPolicy({ ...shop, transport: transport.transport })
    const capabilities = buildChatCapabilityMatrix(shop, transport)
    return {
      ...shop,
      transport: transport.transport,
      chat_transport: transport.transport,
      transport_worker: transport.worker,
      browser_required: transport.browser_required ? 1 : 0,
      api_available: transport.api_available ? 1 : 0,
      api_chat_supported: transport.api_chat_supported ? 1 : 0,
      api_token_live: transport.api_token_live ? 1 : 0,
      chat_api_status: transport.reason_code === 'api_ready' ? 'ready' : transport.reason_code,
      chat_api_note: transport.note,
      automation_status: transport.browser_required
        ? 'browser_required'
        : (transport.transport === CHAT_TRANSPORT_OFF ? transport.reason_code || 'chat_off' : 'api_ready'),
      automation_note: transport.browser_required ? `${transport.note} ${scanPolicy.note}` : transport.note,
      scan_mode: scanPolicy.mode,
      scan_policy: scanPolicy,
      capabilities,
      chat_capability_summary: capabilities.summary,
      conversations: Number(count.conversations || 0),
      unread: Number(count.unread || 0),
      last_message_at: count.last_message_at || ''
    }
  })
  const featureMatrix = buildChatCapabilitySetupSummary(items)

  return json({
    status: 'ok',
    shops: items,
    setup: {
      shopee_callback: 'https://huyvan-worker-api.nghiemchihuy.workers.dev/api/webhooks/shopee',
      lazada_callback: 'https://huyvan-worker-api.nghiemchihuy.workers.dev/api/webhooks/lazada',
      automation_ingest: 'https://huyvan-worker-api.nghiemchihuy.workers.dev/api/chat/automation-ingest',
      transport_guide: chatTransportGuide(),
      feature_matrix: featureMatrix,
      note: 'Shop có token API được tự nhận diện trong mục chat. Shopee dùng SellerChat/Webchat API có guard; Lazada đã chốt chỉ dùng IM API chính thức và không còn nhận automation local.'
    }
  }, cors)
}

async function markRead(request, env, cors) {
  await ensureChatTables(env)
  const body = await request.json().catch(() => ({}))
  const id = cleanText(body.id)
  const conversationId = cleanText(body.conversation_id)
  if (!id && !conversationId) return json({ error: 'Thiếu cuộc trò chuyện cần đánh dấu đã đọc' }, cors, 400)

  const conversation = id
    ? await env.DB.prepare(`
        SELECT id, platform, shop, shop_id, conversation_id, canonical_conversation_id, buyer_id, buyer_name, identity_key
        FROM marketplace_chat_conversations
        WHERE id = ?
        LIMIT 1
      `).bind(id).first().catch(() => null)
    : await env.DB.prepare(`
        SELECT id, platform, shop, shop_id, conversation_id, canonical_conversation_id, buyer_id, buyer_name, identity_key
        FROM marketplace_chat_conversations
        WHERE conversation_id = ?
        ORDER BY id DESC
        LIMIT 1
      `).bind(conversationId).first().catch(() => null)

  if (!conversation) {
    return json({ error: 'Không tìm thấy cuộc trò chuyện để đánh dấu đã đọc' }, cors, 404)
  }

  const remote = await markMarketplaceConversationRead(env, conversation)
  await env.DB.prepare(`
    UPDATE marketplace_chat_conversations
    SET unread_count = 0, status = 'read', updated_at = datetime('now', '+7 hours')
    WHERE id = ?
  `).bind(conversation.id).run()

  return json({
    status: 'ok',
    conversation_id: conversation.conversation_id,
    ...remote
  }, cors)
}

function chatMediaExtension(mimeType = '', name = '') {
  const cleanName = cleanText(name).toLowerCase()
  const existing = cleanName.match(/\.([a-z0-9]{2,5})$/)?.[1]
  if (existing && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'mp4', 'mov', 'm4v', 'webm'].includes(existing)) {
    return existing
  }
  const mime = cleanText(mimeType).toLowerCase()
  if (mime.includes('png')) return 'png'
  if (mime.includes('gif')) return 'gif'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('heic')) return 'heic'
  if (mime.includes('heif')) return 'heif'
  if (mime.includes('mp4')) return 'mp4'
  if (mime.includes('quicktime')) return 'mov'
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  return 'bin'
}

function sanitizeStoragePart(value, fallback = 'file') {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || fallback
}

function dataUrlToBytes(dataUrl) {
  const match = cleanText(dataUrl).match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/)
  if (!match) return null
  const mimeType = cleanText(match[1] || 'application/octet-stream')
  const isBase64 = Boolean(match[2])
  const payload = match[3] || ''
  if (!isBase64) {
    return { mimeType, bytes: new TextEncoder().encode(decodeURIComponent(payload)) }
  }
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { mimeType, bytes }
}

function bytesToBase64(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < data.length; i += chunkSize) {
    binary += String.fromCharCode(...data.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function absoluteChatMediaUrl(request, mediaItem = {}, key = 'url') {
  const raw = cleanText(mediaItem[key] || mediaItem.url || mediaItem.thumbnail_url)
  if (!raw) return ''
  try {
    return new URL(raw, request.url).toString()
  } catch {
    return raw
  }
}

async function storeChatMedia(env, file, conversation, fallback = {}) {
  if (!env.STORAGE) throw new Error('Máy chủ chưa cấu hình R2 STORAGE để lưu ảnh/video chat.')
  const mimeType = cleanText(file?.type || fallback.mime_type || fallback.mimeType || 'application/octet-stream')
  const kind = mediaKindFromMime(mimeType, fallback.type)
  if (!['image', 'video'].includes(kind)) {
    throw new Error('Chat hiện chỉ cho gửi ảnh hoặc video.')
  }
  const name = cleanText(file?.name || fallback.name || `${kind}.${chatMediaExtension(mimeType)}`)
  let bytes
  if (file?.arrayBuffer) {
    bytes = new Uint8Array(await file.arrayBuffer())
  } else if (fallback.data_url || fallback.dataUrl) {
    const decoded = dataUrlToBytes(fallback.data_url || fallback.dataUrl)
    if (!decoded) throw new Error('File media không hợp lệ.')
    bytes = decoded.bytes
  } else {
    throw new Error('Thiếu dữ liệu ảnh/video.')
  }
  const maxBytes = kind === 'video'
    ? Math.min(Math.max(Number(env.CHAT_MAX_VIDEO_MB || 80) || 80, 10), 95) * 1024 * 1024
    : Math.min(Math.max(Number(env.CHAT_MAX_IMAGE_MB || 15) || 15, 3), 30) * 1024 * 1024
  if (bytes.byteLength > maxBytes) {
    throw new Error(`${kind === 'video' ? 'Video' : 'Ảnh'} vượt quá giới hạn ${Math.round(maxBytes / 1024 / 1024)}MB.`)
  }
  const today = new Date().toISOString().slice(0, 10)
  const conversationPart = sanitizeStoragePart(conversation?.conversation_id || conversation?.id || 'chat')
  const unique = crypto.randomUUID ? crypto.randomUUID() : simpleHash(`${Date.now()}|${name}|${bytes.byteLength}`)
  const ext = chatMediaExtension(mimeType, name)
  const key = `chat-media/${today}/${conversationPart}/${unique}.${ext}`
  await env.STORAGE.put(key, bytes, {
    httpMetadata: { contentType: mimeType || 'application/octet-stream' },
    customMetadata: {
      platform: cleanText(conversation?.platform),
      shop: cleanText(conversation?.shop),
      conversation_id: cleanText(conversation?.conversation_id),
      file_name: name
    }
  })
  return {
    type: kind,
    url: `/api/chat/media?key=${encodeURIComponent(key)}`,
    thumbnail_url: kind === 'image' ? `/api/chat/media?key=${encodeURIComponent(key)}` : '',
    mime_type: mimeType,
    name,
    size: bytes.byteLength,
    storage_key: key,
    source: 'oms_upload'
  }
}

async function getChatConversationForSend(env, body) {
  const id = cleanText(body.id)
  const conversationId = cleanText(body.conversation_id)
  const platform = cleanText(body.platform).toLowerCase()
  const shop = cleanText(body.shop)
  if (id) {
    return env.DB.prepare(`SELECT * FROM marketplace_chat_conversations WHERE id = ? LIMIT 1`).bind(id).first()
  }
  if (!conversationId) return null
  return env.DB.prepare(`
    SELECT * FROM marketplace_chat_conversations
    WHERE conversation_id = ?
      AND (? = '' OR platform = ?)
      AND (? = '' OR shop = ? OR shop_id = ?)
    LIMIT 1
  `).bind(conversationId, platform, platform, shop, shop, shop).first()
}

async function refreshShopeeConversationForOfficialSend(env, conversation) {
  if (cleanText(conversation?.platform).toLowerCase() !== 'shopee') return conversation
  if (cleanText(conversation?.buyer_id)) return conversation
  const orderRefreshed = await refreshShopeeConversationBuyerFromOrder(env, conversation)
  if (cleanText(orderRefreshed?.buyer_id)) return orderRefreshed
  const buyerName = cleanText(conversation?.buyer_name)
  if (!buyerName || isGenericChatBuyerName(buyerName)) return conversation
  const shop = await loadShopeeChatShopForConversation(env, conversation)
  if (!shop) return conversation
  // Với shop Shopee có API, seed từ OMS phải thử tìm thread chính thức trước khi báo thiếu buyer_id.
  await syncShopeeChatShop(env, shop, {
    limit: 100,
    buyer_name: buyerName,
    diagnostic: false
  }).catch(() => null)
  const id = cleanText(conversation.id)
  const refreshedById = id
    ? await env.DB.prepare(`SELECT * FROM marketplace_chat_conversations WHERE id = ? LIMIT 1`).bind(id).first().catch(() => null)
    : null
  if (cleanText(refreshedById?.buyer_id)) return refreshedById
  const buyerKey = normalizeKeywordText(buyerName)
  const refreshed = await env.DB.prepare(`
    SELECT *
    FROM marketplace_chat_conversations
    WHERE lower(platform) = 'shopee'
      AND shop = ?
      AND (? = '' OR shop_id = ?)
      AND buyer_id != ''
      AND (identity_key = ? OR lower(buyer_name) = lower(?))
      AND conversation_id NOT LIKE 'automation-%'
    ORDER BY
      CASE WHEN identity_key = ? THEN 0 ELSE 1 END,
      datetime(COALESCE(NULLIF(last_message_at, ''), updated_at, created_at)) DESC,
      id DESC
    LIMIT 1
  `).bind(
    cleanText(conversation.shop),
    cleanText(conversation.shop_id),
    cleanText(conversation.shop_id),
    `shopee|id:${cleanText(conversation.shop_id)}|name:${buyerKey}`,
    buyerName
  ).first().catch(() => null)
  if (!refreshed?.buyer_id) return refreshedById || conversation
  if (id) {
    await env.DB.prepare(`
      UPDATE marketplace_chat_conversations
      SET canonical_conversation_id = ?,
          buyer_id = ?,
          buyer_name = CASE WHEN buyer_name = '' THEN ? ELSE buyer_name END,
          transport = 'api',
          scan_mode = 'api_direct',
          updated_at = datetime('now', '+7 hours')
      WHERE id = ?
    `).bind(
      cleanText(refreshed.canonical_conversation_id || refreshed.conversation_id),
      cleanText(refreshed.buyer_id),
      cleanText(refreshed.buyer_name),
      id
    ).run().catch(() => null)
  }
  return {
    ...conversation,
    canonical_conversation_id: cleanText(refreshed.canonical_conversation_id || refreshed.conversation_id),
    buyer_id: cleanText(refreshed.buyer_id),
    buyer_name: cleanText(conversation.buyer_name || refreshed.buyer_name),
    transport: 'api',
    scan_mode: 'api_direct'
  }
}

async function parseChatSendRequest(request) {
  const type = cleanText(request.headers.get('content-type')).toLowerCase()
  if (type.includes('multipart/form-data')) {
    const form = await request.formData()
    return {
      body: {
        id: form.get('id'),
        conversation_id: form.get('conversation_id'),
        platform: form.get('platform'),
        shop: form.get('shop'),
        content: form.get('content') || form.get('message') || '',
        message_type: form.get('message_type') || form.get('type') || '',
        product_item_id: form.get('product_item_id') || form.get('item_id') || '',
        product_url: form.get('product_url') || '',
        related_product_name: form.get('related_product_name') || '',
        dry_run: form.get('dry_run') === '1' || form.get('dry_run') === 'true'
      },
      files: form.getAll('files').filter(item => item && typeof item === 'object' && typeof item.arrayBuffer === 'function')
    }
  }
  const body = await request.json().catch(() => ({}))
  return {
    body,
    files: [],
    attachments: Array.isArray(body.attachments) ? body.attachments : []
  }
}

async function serveChatMedia(request, env, cors) {
  const key = cleanText(new URL(request.url).searchParams.get('key'))
  if (!key || !key.startsWith('chat-media/')) return new Response('Missing media key', { status: 400, headers: cors })
  if (!env.STORAGE) return new Response('Storage not configured', { status: 500, headers: cors })
  const object = await env.STORAGE.get(key)
  if (!object) return new Response('Media not found', { status: 404, headers: cors })
  const headers = new Headers(cors)
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream')
  headers.set('Cache-Control', 'private, max-age=86400')
  headers.set('Content-Disposition', `inline; filename="${sanitizeStoragePart(key.split('/').pop(), 'chat-media')}"`)
  return new Response(object.body, { headers })
}

Object.assign(globalThis, {
  listChatShops,
  markRead,
  chatMediaExtension,
  sanitizeStoragePart,
  dataUrlToBytes,
  bytesToBase64,
  absoluteChatMediaUrl,
  storeChatMedia,
  getChatConversationForSend,
  refreshShopeeConversationForOfficialSend,
  parseChatSendRequest,
  serveChatMedia
})
