// NEO: Backend worker chat sàn - nhóm shopee-sync-canonical. Giữ file dưới 30KB; tính năng mới tách thành file worker-chat-* riêng.
// Gi? th? t? khai b?o g?c v? nhi?u h?m d?ng ch?o qua endpoint chat.
async function syncShopeeChatShop(env, shop, options = {}) {
  const diagnostic = options.diagnostic === true
  const attempts = []
  const requestedLimit = Math.min(Math.max(Number(options.limit || 20) || 20, 1), 100)
  const conversationLimit = options.active_only ? Math.min(requestedLimit, 10) : Math.min(requestedLimit, 20)
  const base = {
    platform: 'shopee',
    shop: shop.shop_name || shop.user_name || shop.api_shop_id,
    shop_id: cleanText(shop.api_shop_id)
  }
  const targetBuyerText = cleanText(options.buyer_name || options.buyer_id || options.target_buyer_name || options.target_buyer_id)
  const targetBuyerKey = normalizeKeywordText(targetBuyerText)
  if (!shop.access_token || !shop.api_shop_id) {
    return { ...base, status: 'skipped', reason: 'Shop chưa có token/API shop id', pulled_messages: 0, attempts }
  }

  const conversationPaths = [
    '/api/v2/sellerchat/get_conversation_list'
  ]
  const messagePaths = [
    '/api/v2/sellerchat/get_message'
  ]

  let conversationRows = []
  let conversationIds = []
  if (
    options.active_only
    && options.conversation_id
    && !targetBuyerKey
    && !isAutomationConversationId(options.conversation_id)
    && !isChatTestConversation(options.conversation_id)
  ) {
    conversationIds = [cleanText(options.conversation_id)]
  } else {
    for (const path of conversationPaths) {
      const result = await callShopeeChatPath(env, shop, path, {
        direction: 'latest',
        type: 'all',
        page_size: conversationLimit,
      }).catch(error => ({ ok: false, status: 0, data: { error: 'fetch_failed', message: error.message } }))
      attempts.push({ path, ...compactApiError(result.data), http_status: result.status })
      if (!result.ok) continue
      const rows = firstPreferredObjectArray(result.data, [
        ['response', 'conversation_list'],
        ['response', 'conversations'],
        ['conversation_list'],
        ['conversations'],
        ['data', 'conversation_list'],
        ['data', 'conversations']
      ], ['conversation_list', 'conversations', 'list', 'items'])
      conversationRows = rows
      for (const row of rows || []) {
        const metadata = normalizeShopeeApiConversation(row, base)
        if (metadata) await saveApiChatConversationMetadata(env, metadata).catch(() => null)
      }
      const rowsForMessages = targetBuyerKey
        ? (rows || []).filter(row => {
          const metadata = normalizeShopeeApiConversation(row, base)
          const rowBuyerKey = normalizeKeywordText(metadata?.buyer_name || metadata?.buyer_id)
          return rowBuyerKey && rowBuyerKey === targetBuyerKey
        })
        : rows
      conversationIds = rowsForMessages.map(row => firstText(row, [
        ['conversation_id'], ['conversationId'], ['conversationid'], ['chat_id'], ['session_id']
      ])).filter(id => id && !isChatTestConversation(id))
      if (conversationIds.length) break
    }
  }

  if (!options.active_only && options.conversation_id && !isChatTestConversation(options.conversation_id)) {
    conversationIds.unshift(cleanText(options.conversation_id))
  }
  conversationIds = [...new Set(conversationIds)].slice(0, conversationLimit)

  let pulledMessages = 0
  let workingMessagePath = ''
  await mapWithConcurrency(conversationIds, options.active_only ? 1 : 4, async conversationId => {
    const conversationRow = conversationRows.find(row => cleanText(row?.conversation_id || row?.conversationId || row?.conversationid || row?.chat_id || row?.session_id) === cleanText(conversationId)) || {}
    const messageFallback = {
      ...base,
      conversation_id: conversationId,
      buyer_id: firstText(conversationRow, [['to_id'], ['buyer_id'], ['user_id']]),
      buyer_name: firstText(conversationRow, [['to_name'], ['buyer_name'], ['user_name']])
    }
    for (const path of messagePaths) {
      const result = await callShopeeChatPath(env, shop, path, {
        conversation_id: conversationId,
        page_size: options.active_only ? Math.min(Math.max(Number(options.limit || 5) || 5, 1), 20) : 20,
        offset: ''
      }).catch(error => ({ ok: false, status: 0, data: { error: 'fetch_failed', message: error.message } }))
      attempts.push(diagnostic ? { path, conversation_id: conversationId, ...compactApiError(result.data), http_status: result.status } : { path, conversation_id: conversationId, ...compactApiError(result.data), http_status: result.status })
      if (!result.ok) continue
      const rows = firstPreferredObjectArray(result.data, [
        ['response', 'message_list'],
        ['response', 'messages'],
        ['message_list'],
        ['messages'],
        ['data', 'message_list'],
        ['data', 'messages']
      ], ['message_list', 'messages', 'list', 'items'])
      let saved = 0
      for (const row of rows) {
        const message = normalizeApiChatMessage(row, messageFallback)
        if (!message) continue
        if (await saveApiChatMessage(env, message)) saved++
      }
      pulledMessages += saved
      workingMessagePath = path
      break
    }
  })

  const lastError = attempts.filter(item => item.error || item.message).slice(-1)[0] || null
  return {
    ...base,
    status: pulledMessages ? 'ok' : (conversationIds.length ? 'no_messages' : 'no_conversation'),
    pulled_conversations: conversationIds.length,
    pulled_messages: pulledMessages,
    working_message_path: workingMessagePath,
    last_error: lastError,
    attempts: diagnostic ? attempts : attempts.slice(-6)
  }
}

function normalizeChatShopAlias(value) {
  return cleanText(value).toLowerCase()
}

function chatShopAliasKey(platform, value) {
  const alias = normalizeChatShopAlias(value)
  if (!alias) return ''
  return `${cleanText(platform).toLowerCase()}|${alias}`
}

function isGenericChatShopName(name, platform = '', apiId = '') {
  const value = normalizeChatShopAlias(name)
  const id = normalizeChatShopAlias(apiId)
  const marketplace = normalizeChatShopAlias(platform)
  if (!value) return true
  if (id && (value === id || value === `${marketplace} ${id}` || value === `${marketplace}-${id}`)) return true
  return /^(shopee|lazada|tiktok)\s*[-#]?\s*\d+$/i.test(value)
}

function chatShopNameScore(name, platform = '', apiId = '') {
  const value = cleanText(name)
  if (!value) return -1000
  let score = 0
  if (!isGenericChatShopName(value, platform, apiId)) score += 100
  if (/[a-zA-Z]/.test(value)) score += 20
  if (/\d/.test(value)) score += 5
  if (normalizeChatShopAlias(value) === normalizeChatShopAlias(apiId)) score -= 80
  return score
}

function addCanonicalShopAlias(item, value, aliasToKey) {
  const alias = cleanText(value)
  if (!alias) return
  item.aliases.add(alias)
  const key = chatShopAliasKey(item.platform, alias)
  if (key) aliasToKey.set(key, item.canonical_shop_key)
}

function canonicalShopKeyForRecord(row) {
  const platform = cleanText(row.platform).toLowerCase()
  const apiId = cleanText(row.api_shop_id || row.shop_id)
  if (apiId) return `${platform}|id:${apiId}`
  const name = cleanText(row.shop_name || row.user_name || row.shop)
  return `${platform}|name:${normalizeChatShopAlias(name) || cleanText(row.id)}`
}

async function loadCanonicalChatShops(env) {
  const { results: rows } = await env.DB.prepare(`
    SELECT id, shop_name, platform, user_name, api_shop_id, access_token, chat_access_token,
           CASE WHEN access_token IS NOT NULL AND access_token != '' THEN 1 ELSE 0 END AS has_access_token,
           CASE WHEN chat_access_token IS NOT NULL AND chat_access_token != '' THEN 1 ELSE 0 END AS has_chat_access_token,
           token_expire_at, chat_token_expire_at, api_connected_at, api_refresh_expire_at, chat_api_connected_at, chat_api_refresh_expire_at
    FROM shops
    ORDER BY platform, shop_name
  `).all()
  const map = new Map()
  const aliasToKey = new Map()

  for (const raw of rows || []) {
    const platform = cleanText(raw.platform).toLowerCase()
    if (!platform) continue
    const apiId = cleanText(raw.api_shop_id)
    const key = canonicalShopKeyForRecord({ ...raw, platform })
    let item = map.get(key)
    if (!item) {
      item = {
        id: raw.id,
        source_ids: [],
        canonical_shop_key: key,
        platform,
        shop_name: '',
        user_name: '',
        api_shop_id: apiId,
        has_access_token: 0,
        has_chat_access_token: 0,
        token_expire_at: '',
        chat_token_expire_at: '',
        api_connected_at: '',
        api_refresh_expire_at: '',
        chat_api_connected_at: '',
        chat_api_refresh_expire_at: '',
        aliases: new Set(),
        duplicate_count: 0,
        _name_score: -1000
      }
      map.set(key, item)
    }
    item.source_ids.push(raw.id)
    item.duplicate_count += 1
    item.api_shop_id = item.api_shop_id || apiId
    item.has_access_token = item.has_access_token || Number(raw.has_access_token || 0)
    item.has_chat_access_token = item.has_chat_access_token || Number(raw.has_chat_access_token || 0)
    item.token_expire_at = item.token_expire_at || cleanText(raw.token_expire_at)
    item.chat_token_expire_at = item.chat_token_expire_at || cleanText(raw.chat_token_expire_at)
    item.api_connected_at = item.api_connected_at || cleanText(raw.api_connected_at)
    item.api_refresh_expire_at = item.api_refresh_expire_at || cleanText(raw.api_refresh_expire_at)
    item.chat_api_connected_at = item.chat_api_connected_at || cleanText(raw.chat_api_connected_at)
    item.chat_api_refresh_expire_at = item.chat_api_refresh_expire_at || cleanText(raw.chat_api_refresh_expire_at)

    for (const candidate of [raw.user_name, raw.shop_name, raw.api_shop_id]) {
      const score = chatShopNameScore(candidate, platform, item.api_shop_id)
      if (score > item._name_score) {
        item._name_score = score
        item.shop_name = cleanText(candidate)
      }
    }
    item.user_name = item.shop_name
    addCanonicalShopAlias(item, raw.shop_name, aliasToKey)
    addCanonicalShopAlias(item, raw.user_name, aliasToKey)
    addCanonicalShopAlias(item, raw.api_shop_id, aliasToKey)
  }

  const items = [...map.values()].map(item => {
    if (!item.shop_name) item.shop_name = item.api_shop_id || item.aliases.values().next().value || 'Shop'
    addCanonicalShopAlias(item, item.shop_name, aliasToKey)
    const { _name_score, aliases, access_token, ...cleanItem } = item
    return {
      ...cleanItem,
      aliases: [...aliases],
      display_name: cleanItem.shop_name
    }
  }).sort((a, b) => `${a.platform}|${a.shop_name}`.localeCompare(`${b.platform}|${b.shop_name}`))

  return { items, aliasToKey, byKey: new Map(items.map(item => [item.canonical_shop_key, item])) }
}

function canonicalChatShopKeyForValues(platform, shop, shopId, aliasToKey) {
  return aliasToKey.get(chatShopAliasKey(platform, shopId))
    || aliasToKey.get(chatShopAliasKey(platform, shop))
    || (cleanText(shopId) ? `${cleanText(platform).toLowerCase()}|id:${cleanText(shopId)}` : '')
    || (cleanText(shop) ? `${cleanText(platform).toLowerCase()}|name:${normalizeChatShopAlias(shop)}` : '')
}

function canonicalizeChatConversationRow(row, aliasToKey, byKey) {
  const key = canonicalChatShopKeyForValues(row.platform, row.shop, row.shop_id, aliasToKey)
  const shop = byKey.get(key)
  const displayName = shop?.display_name || shop?.shop_name || cleanText(row.shop || row.shop_id)
  const normalizedShopId = cleanText(row.shop_id || shop?.api_shop_id)
  const shopTransport = shop ? resolveChatTransportForShop(shop) : null
  const storedTransport = cleanText(row.transport)
  const effectiveTransport = shopTransport?.transport === CHAT_TRANSPORT_API
    ? CHAT_TRANSPORT_API
    : (storedTransport || cleanText(shopTransport?.transport))
  const effectiveScanMode = shopTransport?.transport === CHAT_TRANSPORT_API
    ? 'api_direct'
    : cleanText(row.scan_mode)
  const normalizedIdentityKey = preferredChatIdentityKey({
    ...row,
    shop: displayName,
    shop_id: normalizedShopId
  })
  return {
    ...row,
    canonical_conversation_id: cleanText(row.canonical_conversation_id || row.conversation_id),
    shop: displayName,
    shop_display_name: displayName,
    shop_id: normalizedShopId,
    identity_key: normalizedIdentityKey || cleanText(row.identity_key),
    transport: effectiveTransport,
    scan_mode: effectiveScanMode,
    canonical_shop_key: key,
    shop_aliases: shop?.aliases || []
  }
}

function chatConversationEpoch(value) {
  const raw = cleanText(value)
  if (!raw) return 0
  const numeric = Number(raw)
  if (Number.isFinite(numeric)) {
    if (numeric > 1000000000000) return Math.floor(numeric)
    if (numeric > 1000000000) return Math.floor(numeric * 1000)
  }
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

Object.assign(globalThis, {
  syncShopeeChatShop,
  normalizeChatShopAlias,
  chatShopAliasKey,
  isGenericChatShopName,
  chatShopNameScore,
  addCanonicalShopAlias,
  canonicalShopKeyForRecord,
  loadCanonicalChatShops,
  canonicalChatShopKeyForValues,
  canonicalizeChatConversationRow,
  chatConversationEpoch
})
