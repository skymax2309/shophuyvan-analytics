import { resolveChatCapability, canSendLive, unavailableSendState } from './capability-core.js'
import { getConversationById } from './conversation-core.js'
import { mergeMessageIntoStore } from './message-merge.js'
import { cleanText, newChatId, normalizeChannel, nowIso } from './message-normalize.js'
import { adapterForChannel } from './send-core.js'

const DEFAULT_CORE_API_BASE = 'https://huyvan-worker-api.nghiemchihuy.workers.dev'

function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value)
    if (text) return text
  }
  return ''
}

function productItemId(product = {}, input = {}) {
  return firstText(
    input.product_item_id,
    input.item_id,
    input.platform_item_id,
    input.platform_product_id,
    product.platform_product_id,
    product.platform_item_id,
    product.item_id
  )
}

function productSku(product = {}, input = {}) {
  return firstText(input.product_sku, input.sku, product.sku, product.platform_sku)
}

function productName(product = {}, input = {}) {
  return firstText(input.product_name, product.name, product.product_name, product.variation_name, productSku(product, input), productItemId(product, input), 'sản phẩm')
}

function coreApiBase(env = {}) {
  return cleanText(env.SHOP_CORE_API_BASE || env.CORE_API_BASE || env.SHOPHUYVAN_CORE_API_BASE || DEFAULT_CORE_API_BASE).replace(/\/+$/, '')
}

async function fetchCoreJson(env, path) {
  const res = await fetch(`${coreApiBase(env)}${path}`, {
    headers: { Accept: 'application/json' },
    cf: { cacheTtl: 0, cacheEverything: false }
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    return {
      ok: false,
      status: res.status,
      error_code: cleanText(data.error_code || data.error || 'product_core_error'),
      error_message: cleanText(data.error_message || data.message || data.error || `Product Core HTTP ${res.status}`)
    }
  }
  return { ok: true, status: res.status, data }
}

function sameItem(product = {}, itemId = '') {
  const target = cleanText(itemId)
  if (!target) return false
  return [product.platform_product_id, product.platform_item_id, product.item_id]
    .map(cleanText)
    .some(value => value && value === target)
}

async function verifyProductFromCore(env, input = {}, conversation = {}) {
  const inputProduct = input.product && typeof input.product === 'object' ? input.product : {}
  const sku = productSku(inputProduct, input)
  const itemId = productItemId(inputProduct, input)
  if (sku) {
    const verified = await fetchCoreJson(env, `/api/core/products/by-sku/${encodeURIComponent(sku)}`)
    if (verified.ok && (!itemId || sameItem(verified.data.product, itemId))) return verified.data.product
    if (!itemId) return { error_code: 'product_core_not_found', error_message: verified.error_message || 'Không tìm thấy SKU trong Product Core.' }
  }
  const query = itemId || productName(inputProduct, input)
  if (!query) {
    return { error_code: 'missing_product_identity', error_message: 'Thiếu SKU hoặc item_id để kiểm tra Product Core.' }
  }
  const params = new URLSearchParams()
  params.set('q', query)
  params.set('limit', '10')
  params.set('platform', normalizeChannel(conversation.channel || input.channel || 'shopee'))
  if (conversation.shop_id || input.shop_id) params.set('shop_id', conversation.shop_id || input.shop_id)
  const searched = await fetchCoreJson(env, `/api/core/products/search?${params.toString()}`)
  if (!searched.ok) return { error_code: 'product_core_search_failed', error_message: searched.error_message }
  const products = Array.isArray(searched.data.products) ? searched.data.products : []
  const matched = itemId ? products.find(product => sameItem(product, itemId)) : products[0]
  if (!matched) {
    return { error_code: 'product_core_not_found', error_message: 'Không tìm thấy sản phẩm khớp trong Product Core.' }
  }
  return matched
}

function unsupportedReason(channel, capability = {}) {
  if (channel === 'tiktok') return 'TikTok chưa có Chat/Product Card API trong hệ thống.'
  if (channel === 'facebook') return 'Facebook chưa nối gửi thẻ sản phẩm qua Chat Worker này.'
  if (channel === 'zalo') return 'Zalo/local tool chưa hỗ trợ gửi thẻ sản phẩm tự động.'
  if (!canSendLive(capability)) return unavailableSendState(capability).error_message
  return 'Shop này chưa hỗ trợ gửi thẻ sản phẩm.'
}

function productCardSupport(env, conversation = {}, input = {}, product = {}) {
  const channel = normalizeChannel(conversation.channel || input.channel)
  const capability = resolveChatCapability(env, { ...conversation, ...input })
  const adapter = adapterForChannel(channel)
  const adapterCapabilities = adapter?.getCapabilities?.(env) || {}
  const itemId = productItemId(product, input)
  if (!['shopee', 'lazada'].includes(channel)) {
    return { supported: false, channel, capability, error_code: 'product_card_not_supported', reason: unsupportedReason(channel, capability) }
  }
  if (!canSendLive(capability)) {
    const unavailable = unavailableSendState(capability)
    return { supported: false, channel, capability, error_code: unavailable.error_code, reason: unavailable.error_message }
  }
  if (!adapter?.sendProductCard) {
    return { supported: false, channel, capability, error_code: 'adapter_not_implemented', reason: 'Adapter kênh này chưa có hàm gửi thẻ sản phẩm.' }
  }
  if (!adapterCapabilities.send_product_card) {
    return { supported: false, channel, capability, error_code: 'adapter_not_configured', reason: 'Bridge kênh này chưa cấu hình gửi thẻ sản phẩm.' }
  }
  if (!itemId) {
    return { supported: false, channel, capability, error_code: 'missing_product_item_id', reason: `Sản phẩm chưa có item_id ${channel === 'lazada' ? 'Lazada' : 'Shopee'} nên chưa gửi được thẻ sản phẩm chính thức.` }
  }
  return { supported: true, channel, capability, adapter, item_id: itemId }
}

async function markProductCardFailed(env, message, support) {
  const failed = await mergeMessageIntoStore(env, {
    ...message,
    status: 'failed',
    error_code: support.error_code || 'product_card_failed',
    error_message: support.reason || 'Không gửi được thẻ sản phẩm.',
    updated_at: nowIso()
  })
  return failed.message
}

export async function sendProductCard(env, input = {}) {
  const conversationId = cleanText(input.conversation_id || input.id)
  const conversation = conversationId ? await getConversationById(env, conversationId) : null
  if (!conversation) {
    return {
      ok: false,
      status: 'failed',
      error_code: 'conversation_not_found',
      error_message: 'Không tìm thấy hội thoại trong Chat Core để gửi thẻ sản phẩm.'
    }
  }

  const verifiedProduct = await verifyProductFromCore(env, input, conversation)
  if (verifiedProduct?.error_code) {
    return {
      ok: false,
      status: 'failed',
      error_code: verifiedProduct.error_code,
      error_message: verifiedProduct.error_message
    }
  }

  const support = productCardSupport(env, conversation, input, verifiedProduct)
  if (!support.supported) {
    return {
      ok: false,
      status: 'unsupported',
      error_code: support.error_code,
      error_message: support.reason,
      capability: support.capability,
      product: verifiedProduct
    }
  }

  if (input.dry_run === true) {
    const dryRunResult = await support.adapter.sendProductCard(env, {
      conversation,
      product: verifiedProduct,
      product_item_id: support.item_id,
      dry_run: true
    })
    return {
      ok: Boolean(dryRunResult.ok),
      dry_run: true,
      sent_to_platform: false,
      status: dryRunResult.ok ? 'dry_run' : 'failed',
      error_code: dryRunResult.error_code || '',
      error_message: dryRunResult.error_message || '',
      capability: support.capability,
      product: verifiedProduct,
      adapter: dryRunResult.raw || null
    }
  }

  const stamp = nowIso()
  const sending = {
    id: cleanText(input.id) || newChatId('msg'),
    channel: support.channel,
    shop_id: conversation.shop_id,
    conversation_id: conversation.id,
    customer_id: conversation.customer_id,
    sender_type: 'shop',
    sender_name: input.sender_name || 'Shop',
    text: `Shop gửi thẻ sản phẩm ${productName(verifiedProduct, input)}`,
    status: 'sending',
    client_temp_id: cleanText(input.client_temp_id) || newChatId('tmp'),
    product_ids: [productSku(verifiedProduct, input), support.item_id].filter(Boolean),
    source: 'product_card',
    created_at: stamp,
    updated_at: stamp
  }
  const saved = await mergeMessageIntoStore(env, sending)

  let adapterResult
  try {
    adapterResult = await support.adapter.sendProductCard(env, {
      conversation,
      product: verifiedProduct,
      product_item_id: support.item_id,
      dry_run: false
    })
  } catch (error) {
    adapterResult = { ok: false, error_code: 'adapter_exception', error_message: cleanText(error?.message || error) }
  }

  if (!adapterResult?.ok) {
    const failed = await markProductCardFailed(env, saved.message, {
      error_code: adapterResult?.error_code || 'product_card_failed',
      reason: adapterResult?.error_message || 'Không gửi được thẻ sản phẩm qua adapter.'
    })
    return {
      ok: false,
      status: 'failed',
      message: failed,
      saved_message: saved.message,
      error_code: failed.error_code,
      error_message: failed.error_message,
      capability: support.capability,
      product: verifiedProduct
    }
  }

  const sent = await mergeMessageIntoStore(env, {
    ...saved.message,
    status: 'sent',
    platform_message_id: cleanText(adapterResult.platform_message_id) || saved.message.platform_message_id,
    error_code: '',
    error_message: '',
    updated_at: nowIso()
  })
  return {
    ok: true,
    status: 'sent',
    sent_to_platform: true,
    message: sent.message,
    saved_message: saved.message,
    capability: support.capability,
    product: verifiedProduct,
    adapter: {
      channel: support.channel,
      ok: true,
      platform_message_id: cleanText(adapterResult.platform_message_id)
    }
  }
}
