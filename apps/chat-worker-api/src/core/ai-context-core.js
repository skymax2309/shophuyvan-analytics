import { cleanText, normalizeChannel, normalizeStringArray } from './message-normalize.js'

const DEFAULT_CORE_API_BASE = 'https://huyvan-worker-api.nghiemchihuy.workers.dev'
const CORE_TIMEOUT_MS = 4500
const ORDER_CODE_PATTERN = /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{10,24}\b/gi
const SKU_PATTERN = /\b(?=[A-Z0-9._+-]*\d)[A-Z0-9][A-Z0-9._+-]{3,48}\b/gi

function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value)
    if (text) return text
  }
  return ''
}

function uniqueLimited(values = [], limit = 5) {
  const seen = new Set()
  const output = []
  for (const value of values) {
    const text = cleanText(value)
    const key = text.toLowerCase()
    if (!text || seen.has(key)) continue
    seen.add(key)
    output.push(text)
    if (output.length >= limit) break
  }
  return output
}

function looksLikeOrderCode(value = '') {
  return /^(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{10,24}$/i.test(cleanText(value))
}

function coreApiBase(env = {}) {
  return cleanText(env.SHOP_CORE_API_BASE || env.CORE_API_BASE || env.SHOPHUYVAN_CORE_API_BASE || DEFAULT_CORE_API_BASE).replace(/\/+$/, '')
}

async function fetchCoreJson(env, path) {
  const fetcher = env.CORE_FETCH || fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort('core_context_timeout'), CORE_TIMEOUT_MS)
  try {
    const res = await fetcher(`${coreApiBase(env)}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cf: { cacheTtl: 0, cacheEverything: false }
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.ok === false) {
      return {
        ok: false,
        status: res.status,
        error_code: cleanText(data.error_code || data.error || 'core_context_read_failed'),
        error_message: cleanText(data.error_message || data.message || data.error || `Core HTTP ${res.status}`)
      }
    }
    return { ok: true, status: res.status, data }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error_code: error?.name === 'AbortError' ? 'core_context_timeout' : 'core_context_fetch_failed',
      error_message: cleanText(error?.message || error)
    }
  } finally {
    clearTimeout(timeout)
  }
}

function noAccent(value = '') {
  return cleanText(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
}

function latestCustomerText(messages = []) {
  return cleanText([...messages].reverse().find(item => item.sender_type === 'customer')?.text)
}

function latestCustomerMessage(messages = []) {
  return [...messages].reverse().find(item => item.sender_type === 'customer') || null
}

function orderCodesFromText(text = '') {
  const source = cleanText(text)
  const codes = []
  for (const match of source.matchAll(ORDER_CODE_PATTERN)) {
    const before = noAccent(source.slice(Math.max(0, match.index - 36), match.index))
    if (/(ma don|don hang|order|order id|ma van don|van don)\s*$/.test(before)) codes.push(match[0])
  }
  return codes
}

export function extractOrderCodes(messages = [], input = {}) {
  const direct = [
    input.order_id,
    input.order_sn,
    input.order_code,
    input.platform_order_id,
    input.order?.order_id,
    input.order?.order_sn
  ]
  const fromMessages = messages.flatMap(item => [
    item.order_id,
    ...orderCodesFromText(item.text)
  ])
  return uniqueLimited([...direct, ...fromMessages], 4)
}

export function extractProductQueries(messages = [], input = {}) {
  const orderCodeSet = new Set(extractOrderCodes(messages, input).map(item => item.toLowerCase()))
  const direct = [
    input.product_query,
    input.product_name,
    input.sku,
    input.product_sku,
    input.product?.sku,
    input.product?.platform_sku,
    input.product?.name
  ]
  const messageProductIds = messages.flatMap(item => normalizeStringArray(item.product_ids))
  const skuLike = messages.flatMap(item => cleanText(item.text).match(SKU_PATTERN) || [])
    .filter(value => !orderCodeSet.has(cleanText(value).toLowerCase()))
  const lastText = latestCustomerText(messages)
  const naturalQuery = lastText && lastText.length <= 120 && ![...orderCodeSet].some(code => lastText.toLowerCase().includes(code))
    ? lastText
    : ''
  return uniqueLimited([...direct, ...messageProductIds, ...skuLike, naturalQuery], 4)
}

function metaValue(value) {
  if (value && typeof value === 'object' && 'value' in value) return value.value
  return value
}

function formatMoney(value) {
  const number = Number(metaValue(value))
  if (!Number.isFinite(number) || number < 0) return ''
  return `${Math.round(number).toLocaleString('vi-VN')}đ`
}

function formatStock(value) {
  const number = Number(metaValue(value))
  if (!Number.isFinite(number)) return ''
  return `${number.toLocaleString('vi-VN')} tồn`
}

function safeOrderContext(order = {}) {
  const items = Array.isArray(order.items) ? order.items : Array.isArray(order.order_items) ? order.order_items : []
  return {
    order_id: firstText(order.order_id, order.order_sn, order.platform_order_id, order.id),
    status: firstText(order.display_status_vi, order.status_label_vi, order.order_status_core, order.fulfillment_status_core, order.marketplace_status),
    fulfillment_status_core: firstText(order.fulfillment_status_core),
    payment_method: firstText(order.payment_method, order.payment?.method),
    tracking_number: firstText(order.tracking_number, order.tracking_core?.tracking_number, order.shipping?.tracking_number, order.logistics?.tracking_number),
    carrier: firstText(order.carrier, order.tracking_core?.carrier, order.shipping?.carrier, order.logistics?.carrier, order.logistics_provider),
    customer_note: firstText(order.customer_note),
    items: items.slice(0, 5).map(item => ({
      sku: firstText(item.sku, item.platform_sku, item.seller_sku, item.internal_sku),
      name: firstText(item.product_name, item.name, item.item_name),
      variation_name: firstText(item.variation_name, item.model_name),
      quantity: firstText(item.quantity, item.qty),
      price: formatMoney(item.item_price || item.price || item.item_amount)
    })).filter(item => item.sku || item.name)
  }
}

function safeProductContext(product = {}) {
  return {
    sku: firstText(product.sku, product.platform_sku),
    platform_sku: firstText(product.platform_sku),
    platform_product_id: firstText(product.platform_product_id, product.platform_item_id),
    platform_variation_id: firstText(product.platform_variation_id, product.model_id),
    name: firstText(product.name, product.product_name),
    variation_name: firstText(product.variation_name),
    price: formatMoney(product.price),
    stock: formatStock(product.stock),
    image_url: firstText(product.image_url),
    source: firstText(product.source),
    confidence: firstText(product.confidence),
    shop_id: firstText(product.shop_id, product.shop),
    platform: firstText(product.platform)
  }
}

async function loadOrders(env, conversation = {}, messages = [], input = {}) {
  const orderCodes = extractOrderCodes(messages, input)
  const orders = []
  const warnings = []

  for (const code of orderCodes) {
    const result = await fetchCoreJson(env, `/api/core/orders/${encodeURIComponent(code)}`)
    if (result.ok && result.data?.order) orders.push(safeOrderContext(result.data.order))
    else warnings.push(`Không đọc được Order Core cho ${code}: ${result.error_code}`)
  }

  const conversationId = cleanText(conversation?.id || input.conversation_id)
  if (conversationId) {
    const params = new URLSearchParams()
    params.set('limit', '3')
    params.set('platform', normalizeChannel(conversation.channel || input.channel || 'shopee'))
    if (conversation.shop_id || input.shop_id) params.set('shop_id', conversation.shop_id || input.shop_id)
    if (conversation.customer_id || input.customer_id) params.set('customer_id', conversation.customer_id || input.customer_id)
    if (orderCodes.length) params.set('order_id', orderCodes.join(','))
    const result = await fetchCoreJson(env, `/api/core/orders/by-conversation/${encodeURIComponent(conversationId)}?${params.toString()}`)
    if (result.ok) {
      for (const order of result.data?.orders || []) orders.push(safeOrderContext(order))
      if (!result.data?.orders?.length) warnings.push(cleanText(result.data?.note || result.data?.match_state || 'Chưa nối được hội thoại với Order Core.'))
    } else {
      warnings.push(`Không đọc được Order Core theo hội thoại: ${result.error_code}`)
    }
  }

  return {
    order_codes: orderCodes,
    orders: uniqueBy(orders, order => order.order_id),
    warnings
  }
}

function looksLikeSku(value = '') {
  const text = cleanText(value)
  SKU_PATTERN.lastIndex = 0
  return text.length >= 4 && text.length <= 64 && SKU_PATTERN.test(text)
}

async function loadProducts(env, conversation = {}, messages = [], input = {}, orders = []) {
  const orderSkus = orders.flatMap(order => order.items || []).map(item => item.sku)
  const queries = uniqueLimited([...orderSkus, ...extractProductQueries(messages, input)], 5)
  const products = []
  const warnings = []

  for (const query of queries) {
    if (looksLikeSku(query)) {
      const result = await fetchCoreJson(env, `/api/core/products/by-sku/${encodeURIComponent(query)}`)
      if (result.ok && result.data?.product) products.push(safeProductContext(result.data.product))
    }
    const params = new URLSearchParams()
    params.set('q', query)
    params.set('limit', '5')
    params.set('platform', normalizeChannel(conversation.channel || input.channel || 'shopee'))
    if (conversation.shop_id || input.shop_id) params.set('shop_id', conversation.shop_id || input.shop_id)
    const result = await fetchCoreJson(env, `/api/core/products/search?${params.toString()}`)
    if (result.ok) {
      const rows = Array.isArray(result.data?.products) ? result.data.products : []
      rows.slice(0, 3).forEach(product => products.push(safeProductContext(product)))
      if (!rows.length) warnings.push(`Không tìm thấy sản phẩm khớp "${query}" trong Product Core.`)
    } else {
      warnings.push(`Không đọc được Product Core cho "${query}": ${result.error_code}`)
    }
  }

  return {
    product_queries: queries,
    products: uniqueBy(products, product => [product.platform, product.shop_id, product.sku, product.platform_product_id, product.platform_variation_id].join('|')),
    warnings
  }
}

function uniqueBy(items = [], keyFn) {
  const map = new Map()
  for (const item of items) {
    const key = cleanText(keyFn(item))
    if (key && !map.has(key)) map.set(key, item)
  }
  return [...map.values()]
}

function riskFlags(messages = [], input = {}) {
  const text = noAccent([
    latestCustomerText(messages),
    input.text,
    input.message,
    input.question
  ].join(' '))
  const flags = []
  const rules = [
    ['complaint_or_refund', /\b(khieu nai|tra hang|hoan hang|hoan tien|doi tra|huy don|danh gia xau|1 sao|mot sao|lua dao|de doa)\b/],
    ['off_platform_contact', /\b(zalo|facebook|sdt|so dien thoai|website|web|qr|ngan hang|chuyen khoan)\b/],
    ['unsafe_promise', /\b(bao hanh|boi thuong|cam ket|chac chan giao|phat|den bu)\b/]
  ]
  for (const [flag, pattern] of rules) {
    if (pattern.test(text)) flags.push(flag)
  }
  return flags
}

function classifySimpleIntent(messages = [], input = {}, context = {}) {
  const latest = latestCustomerMessage(messages)
  const normalized = noAccent([latest?.text, input.text, input.message, input.question].join(' '))
  const hasOrder = (context.orders || []).length > 0 || (context.order_codes || []).length > 0
  const hasProduct = (context.products || []).length > 0 || (context.product_queries || []).length > 0
  const orderIntent = /\b(don|don hang|ma don|order|van don|giao|ship|tracking|trang thai|toi dau|bao gio nhan|khi nao nhan)\b/.test(normalized)
  const productIntent = /\b(san pham|sp|sku|hang|con hang|het hang|gia|mau|size|kich thuoc|loai nao|tu van)\b/.test(normalized)
  const risky = /\b(khieu nai|tra hang|hoan hang|hoan tien|doi tra|huy don|bao hanh|boi thuong|den bu|danh gia|1 sao|lua dao|zalo|sdt|so dien thoai|chuyen khoan|ngan hang)\b/.test(normalized)
  if (risky) return { intent: 'needs_review', simple: false, reason: 'risk_keyword' }
  if (hasOrder && orderIntent) return { intent: 'order_status_simple', simple: true, reason: 'matched_order_core' }
  if (hasProduct && productIntent) return { intent: 'product_info_simple', simple: true, reason: 'matched_product_core' }
  return { intent: 'needs_review', simple: false, reason: hasOrder || hasProduct ? 'unclear_question' : 'missing_core_context' }
}

export async function buildAiReplyContext(env, { conversation = {}, messages = [], input = {} } = {}) {
  const orderContext = await loadOrders(env, conversation, messages, input)
  const productContext = await loadProducts(env, conversation, messages, input, orderContext.orders)
  const warnings = uniqueLimited([
    ...orderContext.warnings,
    ...productContext.warnings,
    !orderContext.order_codes.length && !orderContext.orders.length ? 'Chưa thấy mã đơn rõ ràng trong hội thoại.' : '',
    !productContext.product_queries.length && !productContext.products.length ? 'Chưa thấy SKU hoặc tên sản phẩm rõ ràng trong hội thoại.' : ''
  ], 8)
  const context = {
    source: 'chat_core_plus_worker_core',
    orders: orderContext.orders,
    products: productContext.products,
    order_codes: orderContext.order_codes,
    product_queries: productContext.product_queries,
    warnings,
    risk_flags: riskFlags(messages, input)
  }
  return {
    ...context,
    simple_intent: classifySimpleIntent(messages, input, context)
  }
}

export function formatAiReplyContext(context = {}) {
  const orderLines = (context.orders || []).slice(0, 3).map(order => {
    const parts = [
      order.order_id ? `mã ${order.order_id}` : '',
      order.status ? `trạng thái ${order.status}` : '',
      order.carrier || order.tracking_number ? `vận chuyển ${[order.carrier, order.tracking_number].filter(Boolean).join(' ')}` : '',
      order.payment_method ? `thanh toán ${order.payment_method}` : ''
    ].filter(Boolean)
    const itemText = (order.items || []).slice(0, 3).map(item => [item.quantity ? `${item.quantity}x` : '', item.name, item.variation_name, item.sku ? `SKU ${item.sku}` : '', item.price].filter(Boolean).join(' ')).join('; ')
    return `- Đơn hàng: ${parts.join(', ')}${itemText ? `. Sản phẩm trong đơn: ${itemText}` : ''}`
  })
  const productLines = (context.products || []).slice(0, 5).map(product => {
    const parts = [
      product.sku ? `SKU ${product.sku}` : '',
      product.name,
      product.variation_name,
      product.price ? `giá ${product.price}` : '',
      product.stock ? product.stock : ''
    ].filter(Boolean)
    return `- Sản phẩm: ${parts.join(', ')}`
  })
  const warningLines = (context.warnings || []).slice(0, 5).map(item => `- ${item}`)
  return [
    'Dữ liệu Core đã kiểm cho câu trả lời:',
    orderLines.length ? ['Đơn hàng:', ...orderLines].join('\n') : 'Đơn hàng: chưa có dữ liệu chắc chắn.',
    productLines.length ? ['Sản phẩm:', ...productLines].join('\n') : 'Sản phẩm: chưa có dữ liệu chắc chắn.',
    warningLines.length ? ['Dữ liệu còn thiếu:', ...warningLines].join('\n') : '',
    'Quy tắc dùng dữ liệu: chỉ trả lời theo dữ liệu Core ở trên; không tự bịa giá, tồn kho, trạng thái, ngày giao hoặc chính sách. Nếu thiếu dữ liệu thì hỏi khách mã đơn/SKU hoặc nói shop sẽ kiểm tra.'
  ].filter(Boolean).join('\n')
}
