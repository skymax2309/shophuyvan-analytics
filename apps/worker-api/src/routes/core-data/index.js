import {
  getCoreOrder,
  getCoreOrdersByConversation,
} from '../../core/shared-data/core-data-core.js'
import { getCoreProductBySku, searchCoreProducts } from '../../core/products/core-product-read-core.js'
import { getCoreShopSummary, listCoreShops } from '../../core/shared-data/shop-core-data.js'
import { buildOrderConfirmMessage } from '../../core/shared-data/order-confirm-message-core.js'
import { resolveCoreOrderChatTarget } from '../../core/shared-data/order-chat-target-core.js'
import { readBotSettings } from '../bot/index.js'

function json(data, cors, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      ...cors,
      'Cache-Control': 'no-store'
    }
  })
}

function cleanPathPart(value) {
  return decodeURIComponent(String(value || '')).replace(/\u00a0/g, ' ').trim()
}

export async function handleCoreData(request, env, cors) {
  const url = new URL(request.url)
  if (request.method !== 'GET') {
    return json({ ok: false, error: 'Core Data hiện chỉ mở endpoint đọc an toàn.' }, cors, 405)
  }

  if (url.pathname === '/api/core/health') {
    return json({
      ok: true,
      mode: 'shop_order_product_core_read',
      scope: 'shopee_first',
      endpoints: [
        '/api/core/shops',
        '/api/core/shops/:shopId/summary',
        '/api/core/orders/:orderId',
        '/api/core/orders/:orderId/chat-target',
        '/api/core/orders/:orderId/chat-confirmation-template',
        '/api/core/orders/by-conversation/:conversationId',
        '/api/core/products/search',
        '/api/core/products/by-sku/:sku'
      ]
    }, cors)
  }

  if (url.pathname === '/api/core/shops') {
    const shops = await listCoreShops(env, {
      platform: url.searchParams.get('platform') || 'shopee',
      shop: url.searchParams.get('shop') || url.searchParams.get('search'),
      limit: url.searchParams.get('limit')
    })
    return json({ ok: true, source: 'Shop Core', shops }, cors)
  }

  const shopSummaryMatch = url.pathname.match(/^\/api\/core\/shops\/([^/]+)\/summary$/)
  if (shopSummaryMatch) {
    const shop = await getCoreShopSummary(env, cleanPathPart(shopSummaryMatch[1]), {
      platform: url.searchParams.get('platform') || 'shopee'
    })
    if (!shop) return json({ ok: false, error: 'Không tìm thấy shop trong Shop Core.' }, cors, 404)
    return json({ ok: true, source: 'Shop Core', shop }, cors)
  }

  const conversationMatch = url.pathname.match(/^\/api\/core\/orders\/by-conversation\/([^/]+)$/)
  if (conversationMatch) {
    const result = await getCoreOrdersByConversation(env, cleanPathPart(conversationMatch[1]), url.searchParams)
    return json({ ok: true, ...result }, cors)
  }

  const orderChatTargetMatch = url.pathname.match(/^\/api\/core\/orders\/([^/]+)\/chat-target$/)
  if (orderChatTargetMatch) {
    const chatTarget = await resolveCoreOrderChatTarget(env, cleanPathPart(orderChatTargetMatch[1]))
    if (!chatTarget) return json({ ok: false, error: 'Không tìm thấy đơn trong Order Core.' }, cors, 404)
    return json({ ok: true, source: 'Order Core + Shop Core', chat_target: chatTarget }, cors)
  }

  const orderConfirmMessageMatch = url.pathname.match(/^\/api\/core\/orders\/([^/]+)\/chat-confirmation-template$/)
  if (orderConfirmMessageMatch) {
    const orderId = cleanPathPart(orderConfirmMessageMatch[1])
    const [order, chatTarget, settings] = await Promise.all([
      getCoreOrder(env, orderId),
      resolveCoreOrderChatTarget(env, orderId),
      readBotSettings(env)
    ])
    if (!order || !chatTarget) return json({ ok: false, error: 'Không tìm thấy đơn trong Order Core.' }, cors, 404)
    const message = buildOrderConfirmMessage(order, chatTarget, settings)
    return json({
      ok: true,
      source: 'Order Core + Bot Settings',
      enabled: message.enabled,
      mode: message.mode,
      trigger_status: message.trigger_status,
      template: message.template,
      draft_text: message.draft_text,
      placeholders: message.placeholders,
      chat_target: chatTarget,
      order
    }, cors)
  }

  const orderMatch = url.pathname.match(/^\/api\/core\/orders\/([^/]+)$/)
  if (orderMatch) {
    const order = await getCoreOrder(env, cleanPathPart(orderMatch[1]))
    if (!order) return json({ ok: false, error: 'Không tìm thấy đơn trong Order Core.' }, cors, 404)
    return json({ ok: true, source: 'Order Core', order }, cors)
  }

  if (url.pathname === '/api/core/products/search' || url.pathname === '/api/core/products') {
    const result = await searchCoreProducts(env, {
      query: url.searchParams.get('q') || url.searchParams.get('search') || url.searchParams.get('sku'),
      platform: url.searchParams.get('platform') || 'shopee',
      shop_id: url.searchParams.get('shop_id') || url.searchParams.get('shop'),
      limit: url.searchParams.get('limit')
    })
    return json({ ok: true, ...result }, cors)
  }

  const skuMatch = url.pathname.match(/^\/api\/core\/products\/by-sku\/([^/]+)$/)
  if (skuMatch) {
    const product = await getCoreProductBySku(env, cleanPathPart(skuMatch[1]))
    if (!product) return json({ ok: false, error: 'Không tìm thấy SKU trong Product Master.' }, cors, 404)
    return json({ ok: true, source: 'Product Master Core', product }, cors)
  }

  return json({ ok: false, error: 'Endpoint Core Data chưa được hỗ trợ.' }, cors, 404)
}
