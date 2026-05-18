import { getShopeeAppFromRow, signHmacHex } from '../../utils/shopee-apps.js'
import { syncApiOrders, syncApiOrderStatuses, syncApiProducts, syncShopeeReturns, syncLazadaReverseOrders } from '../api/index.js'
import { refreshOrderLabel } from '../labels/index.js'
import { recordChatWebhook } from '../marketplace-chat/index.js'
import { recordShopWebhookDiagnostic } from '../../modules/api-sync/sync-diagnostics.js'
import {
  classifyMarketplacePush,
  ensureMarketplacePushCoreTables,
  loadMarketplacePushCore,
  listMarketplacePushSyncQueue,
  markMarketplacePushSyncQueue,
  queueMarketplacePushSync,
  takeMarketplacePushSyncJobs
} from '../../core/marketplace/push-core.js'

function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: cors })
}

function textAck(cors, text = 'success') {
  return new Response(text, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  })
}

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function uniqueTexts(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))]
}

function valueAt(value, path) {
  return path.reduce((current, key) => {
    if (!current || typeof current !== 'object') return ''
    return current[key]
  }, value)
}

function firstTextFrom(body, paths) {
  for (const path of paths) {
    const value = Array.isArray(path) ? valueAt(body, path) : body[path]
    const text = cleanText(value)
    if (text) return text
  }
  return ''
}

async function ensureWebhookEventsTable(env) {
  await ensureMarketplacePushCoreTables(env)
}

async function saveWebhookEvent(env, event) {
  await ensureWebhookEventsTable(env)
  const classified = classifyMarketplacePush(event.platform, event.event_code, event.payload?.body || event.payload || {})
  await env.DB.prepare(`
    INSERT INTO marketplace_webhook_events
      (platform, shop, shop_id, event_code, event_group, action_taken, entity_id, order_id,
       status, verified, received_mode, message, payload, processed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'))
  `).bind(
    cleanText(event.platform),
    cleanText(event.shop),
    cleanText(event.shop_id),
    cleanText(classified.key || event.event_code),
    cleanText(event.event_group || classified.event_group),
    cleanText(event.action_taken || classified.action_taken),
    cleanText(event.entity_id || event.payload?.entity_id),
    cleanText(event.order_id),
    cleanText(event.status),
    event.verified ? 1 : 0,
    cleanText(event.received_mode || 'push'),
    cleanText(event.message),
    JSON.stringify(event.payload || {})
  ).run()
  await recordShopWebhookDiagnostic(env, event).catch(() => null)
}

async function readJsonBody(request) {
  const bodyText = await request.text()
  if (!cleanText(bodyText)) return { bodyText, body: {} }
  try {
    return { bodyText, body: JSON.parse(bodyText) }
  } catch (error) {
    return { bodyText, body: {}, parseError: error.message }
  }
}

function callbackChallenge(request, bodyText, body = {}) {
  const url = new URL(request.url)
  for (const key of ['echostr', 'echo', 'challenge', 'hub.challenge']) {
    const value = cleanText(url.searchParams.get(key))
    if (value) return value
  }
  for (const key of ['echostr', 'echo', 'challenge']) {
    const value = cleanText(body?.[key] || body?.data?.[key])
    if (value) return value
  }
  if (/^\s*(echostr|echo|challenge)=/i.test(bodyText || '')) {
    try {
      const params = new URLSearchParams(bodyText)
      return cleanText(params.get('echostr') || params.get('echo') || params.get('challenge'))
    } catch {}
  }
  return ''
}

function runInBackground(ctx, task) {
  const guarded = Promise.resolve(task).catch(error => {
    console.error('[WEBHOOK_BACKGROUND]', error?.message || error)
  })
  if (ctx?.waitUntil) ctx.waitUntil(guarded)
  return guarded
}

async function findApiShop(env, platform, identifiers = []) {
  const ids = uniqueTexts(identifiers)
  for (const id of ids) {
    const row = await env.DB.prepare(`
      SELECT id, shop_name, user_name, platform, api_shop_id, api_partner_id, api_partner_key,
             api_redirect_url, access_token, refresh_token
      FROM shops
      WHERE platform = ?
        AND (api_shop_id = ? OR shop_name = ? OR user_name = ? OR api_partner_id = ?)
      ORDER BY CASE WHEN access_token IS NOT NULL AND access_token != '' THEN 0 ELSE 1 END
      LIMIT 1
    `).bind(platform, id, id, id, id).first()
    if (row) return row
  }

  const { results } = await env.DB.prepare(`
    SELECT id, shop_name, user_name, platform, api_shop_id, api_partner_id, api_partner_key,
           api_redirect_url, access_token, refresh_token
    FROM shops
    WHERE platform = ?
      AND access_token IS NOT NULL AND access_token != ''
    ORDER BY shop_name
    LIMIT 2
  `).bind(platform).all()
  return results?.length === 1 ? results[0] : null
}

function shopeeIdentifiers(body) {
  return [
    body.shop_id,
    body.shopid,
    body.partner_id,
    body.data?.shop_id,
    body.data?.shopid,
    body.data?.shop_id_list?.[0],
    body.data?.shop_id_list?.join?.(','),
    body.data?.seller_id,
    body.data?.shop_name
  ]
}

function lazadaIdentifiers(body) {
  return [
    body.seller_id,
    body.sellerId,
    body.shop_id,
    body.user_id,
    body.data?.seller_id,
    body.data?.sellerId,
    body.data?.sellerIdList?.[0],
    body.data?.shop_id,
    body.data?.user_id,
    body.data?.seller_name,
    body.data?.shop_name
  ]
}

function shopeeOrderId(body) {
  return firstTextFrom(body, [
    ['data', 'order_sn'],
    ['data', 'ordersn'],
    ['data', 'order_id'],
    ['data', 'ordersn_list', 0],
    ['data', 'order_sn_list', 0],
    ['data', 'order_list', 0, 'order_sn'],
    ['data', 'package_info', 'order_sn'],
    ['data', 'package_list', 0, 'order_sn'],
    ['data', 'return_order', 'order_sn'],
    ['data', 'return', 'order_sn'],
    'order_sn',
    'ordersn',
    'order_id'
  ])
}

function shopeeEntityId(body) {
  return firstTextFrom(body, [
    ['data', 'item_id'],
    ['data', 'itemid'],
    ['data', 'product_id'],
    ['data', 'model_id'],
    ['data', 'video_id'],
    ['data', 'promotion_id'],
    ['data', 'return_sn'],
    ['data', 'booking_sn'],
    ['data', 'package_number'],
    ['data', 'package_sn'],
    'item_id',
    'product_id',
    'return_sn',
    'booking_sn',
    'package_number'
  ])
}

function lazadaOrderId(body) {
  return firstTextFrom(body, [
    ['data', 'trade_order_id'],
    ['data', 'order_id'],
    ['data', 'order_number'],
    ['data', 'orderNo'],
    ['data', 'order_item_id'],
    'trade_order_id',
    'order_id',
    'order_number',
    'orderNo'
  ])
}

function eventCode(body) {
  return cleanText(body.code ?? body.message_type ?? body.type ?? body.action ?? body.event ?? body.event_type)
}

const SHOPEE_PUSH_META = {
  1: { key: 'shop_authorization_push', group: 'authorization', action: 'log' },
  2: { key: 'shop_authorization_canceled_push', group: 'authorization', action: 'log' },
  3: { key: 'order_status_push', group: 'order', action: 'sync_order' },
  4: { key: 'order_trackingno_push', group: 'order', action: 'sync_order' },
  5: { key: 'shopee_updates', group: 'system', action: 'log' },
  7: { key: 'item_promotion_push', group: 'marketing', action: 'log' },
  8: { key: 'reserved_stock_change_push', group: 'product', action: 'sync_products' },
  9: { key: 'promotion_update_push', group: 'marketing', action: 'log' },
  10: { key: 'webchat_push', group: 'chat', action: 'log' },
  11: { key: 'video_upload_push', group: 'product', action: 'sync_products' },
  12: { key: 'open_api_authorization_expiry', group: 'authorization', action: 'log' },
  13: { key: 'brand_register_result', group: 'product', action: 'sync_products' },
  15: { key: 'shipping_document_status_push', group: 'label', action: 'sync_order_label' },
  16: { key: 'violation_item_push', group: 'product', action: 'sync_products' },
  22: { key: 'item_price_update_push', group: 'product', action: 'sync_products' },
  23: { key: 'booking_status_push', group: 'order', action: 'sync_order' },
  24: { key: 'booking_trackingno_push', group: 'order', action: 'sync_order' },
  25: { key: 'booking_shipping_document_status_push', group: 'label', action: 'sync_order_label' },
  27: { key: 'item_scheduled_publish_failed_push', group: 'product', action: 'sync_products' },
  28: { key: 'shop_penalty_update_push', group: 'system', action: 'log' },
  29: { key: 'return_updates_push', group: 'return', action: 'sync_return_order' },
  30: { key: 'package_fulfillment_status_push', group: 'order', action: 'sync_order' },
  31: { key: 'fbs_br_invoice_issued_push', group: 'fbs', action: 'log' },
  33: { key: 'fbs_br_invoice_error_push', group: 'fbs', action: 'log' },
  34: { key: 'fbs_br_block_shop_push', group: 'fbs', action: 'log' },
  35: { key: 'fbs_br_block_sku_push', group: 'fbs', action: 'sync_products' },
  36: { key: 'fbs_sellable_stock', group: 'fbs', action: 'sync_products' },
  37: { key: 'courier_delivery_binding_status_push', group: 'order', action: 'sync_order' },
  38: { key: 'video_upload_result_push', group: 'product', action: 'sync_products' },
  47: { key: 'package_info_push', group: 'order', action: 'sync_order' }
}

function shopeePushMeta(code) {
  const text = cleanText(code)
  const numeric = Number(text)
  if (Number.isFinite(numeric) && SHOPEE_PUSH_META[numeric]) {
    return { code: String(numeric), ...SHOPEE_PUSH_META[numeric] }
  }
  const found = Object.entries(SHOPEE_PUSH_META).find(([, item]) => item.key === text)
  if (found) return { code: found[0], ...found[1] }
  return { code: text, key: text || 'unknown_push', group: 'unknown', action: 'log' }
}

async function verifyShopeeWebhook(request, env, bodyText, shop) {
  const authorization = cleanText(request.headers.get('authorization') || request.headers.get('Authorization'))
  if (!authorization) return { ok: true, verified: false, message: 'Không có header Authorization, vẫn nhận để tránh mất sự kiện.' }
  const app = getShopeeAppFromRow(env, shop || {}, cleanText(shop?.api_partner_id))
  if (!app?.partnerKey) return { ok: false, verified: false, message: 'Không tìm thấy Partner Key để kiểm chữ ký Shopee.' }

  const expected = await signHmacHex(app.partnerKey, `${request.url}|${bodyText}`)
  const actual = (authorization.match(/Signature=([a-f0-9]+)/i)?.[1] || authorization.replace(/^sha256\s+/i, '')).trim().toLowerCase()
  const ok = actual === expected.toLowerCase()
  return {
    ok,
    verified: ok,
    message: ok ? 'Đã xác thực chữ ký Shopee.' : 'Sai chữ ký Shopee.'
  }
}

async function syncFromMarketplaceEvent(env, cors, options) {
  const platform = cleanText(options.platform).toLowerCase()
  const shop = cleanText(options.shop)
  const orderId = cleanText(options.order_id || options.orderId)
  const statuses = cleanText(options.statuses)
  const days = platform === 'lazada' ? 60 : 15
  const limit = platform === 'lazada' ? 40 : 80

  const imported = await syncApiOrders(env, cors, {
    platform,
    shop,
    days,
    limit,
    statuses
  })
  const synced = await syncApiOrderStatuses(env, {
    platform,
    shop,
    orderId,
    limit: orderId ? 20 : (platform === 'lazada' ? 30 : 120),
    days: platform === 'lazada' ? 120 : 60
  })
  return { imported, synced }
}

async function syncProductsFromMarketplaceEvent(env, cors, options) {
  return syncApiProducts(env, cors, {
    platform: cleanText(options.platform).toLowerCase(),
    shop: cleanText(options.shop),
    limit: options.limit || 80,
    includeOutOfStock: false
  })
}

async function syncReturnsFromMarketplaceEvent(env, options) {
  const platform = cleanText(options.platform).toLowerCase()
  const shop = cleanText(options.shop)
  const orderId = cleanText(options.order_id || options.orderId)
  const statuses = orderId
    ? await syncApiOrderStatuses(env, {
        platform,
        shop,
        orderId,
        limit: platform === 'lazada' ? 30 : 80,
        days: platform === 'lazada' ? 120 : 60
      })
    : null

  if (platform === 'shopee') {
    const returns = await syncShopeeReturns(env, {
      shop,
      hours: 48,
      page_size: 80,
      max_pages: 2,
      include_detail: true,
      time_field: 'update_time'
    })
    return { statuses, returns }
  }

  if (platform === 'lazada') {
    const reverse = await syncLazadaReverseOrders(env, {
      shop,
      days: 30,
      page_size: 80,
      max_pages: 2,
      include_detail: true,
      include_history: true,
      history_pages: 1
    })
    return { statuses, reverse }
  }

  return { statuses, skipped: 'Sàn chưa hỗ trợ đồng bộ hoàn/trả từ push.' }
}

async function runShopeePushActions(env, cors, meta, shopName, orderId) {
  const action = cleanText(meta.action)
  const result = { action, group: meta.group, key: meta.key }

  if (action === 'sync_order' || action === 'sync_order_label') {
    result.order = await syncFromMarketplaceEvent(env, cors, {
      platform: 'shopee',
      shop: shopName,
      order_id: orderId,
      statuses: 'READY_TO_SHIP,PROCESSED,SHIPPED,COMPLETED,CANCELLED,IN_CANCEL,TO_RETURN,RETURN_REFUND,FAILED_DELIVERY'
    })
  }

  if (action === 'sync_return_order') {
    result.returns = await syncReturnsFromMarketplaceEvent(env, {
      platform: 'shopee',
      shop: shopName,
      order_id: orderId
    })
  }

  if (action === 'sync_products') {
    result.products = await syncProductsFromMarketplaceEvent(env, cors, {
      platform: 'shopee',
      shop: shopName,
      limit: 80
    })
  }

  return result
}

function queueActionForPush(platform, eventCode, body, fallbackAction, orderId) {
  const classified = classifyMarketplacePush(platform, eventCode, body)
  const action = cleanText(classified.action_taken)
  return {
    ...classified,
    action_taken: (orderId && action === 'log') ? cleanText(fallbackAction || 'sync_order') : action
  }
}

async function queueWebhookSyncJob(env, event) {
  try {
    return await queueMarketplacePushSync(env, event)
  } catch (error) {
    console.error('[PUSH_SYNC_QUEUE]', error?.message || error)
    return null
  }
}

async function finishWebhookSyncJob(env, queueJob, status, result = {}, error = '') {
  if (!queueJob || queueJob.status === 'log_only') return null
  try {
    return await markMarketplacePushSyncQueue(env, queueJob.queue_key || queueJob.id, {
      status,
      result,
      last_error: error
    })
  } catch (queueError) {
    console.error('[PUSH_SYNC_QUEUE_FINISH]', queueError?.message || queueError)
    return null
  }
}

async function refreshLabelQuietly(env, cors, orderId) {
  if (!orderId) return null
  try {
    const request = new Request(`https://worker.local/api/label/${encodeURIComponent(orderId)}/refresh`, { method: 'POST' })
    const response = await refreshOrderLabel(request, env, cors, orderId)
    return await response.json().catch(() => ({ status: response.status }))
  } catch (error) {
    return { error: error.message }
  }
}

async function processShopeeWebhook(request, env, cors, bodyText, body, parseError) {
  const code = eventCode(body)
  const meta = shopeePushMeta(code)
  const orderId = shopeeOrderId(body)
  const entityId = shopeeEntityId(body)
  const shop = await findApiShop(env, 'shopee', shopeeIdentifiers(body))
  const shopName = cleanText(shop?.shop_name || shop?.user_name || shop?.api_shop_id)

  if (!cleanText(bodyText)) {
    await saveWebhookEvent(env, {
      platform: 'shopee',
      shop: shopName,
      shop_id: shop?.api_shop_id,
      event_code: 'verify',
      status: 'ok',
      verified: false,
      message: 'Shopee verify webhook không có body.',
      payload: {}
    }).catch(() => null)
    return
  }

  if (parseError) {
    await saveWebhookEvent(env, {
      platform: 'shopee',
      shop: shopName,
      shop_id: shop?.api_shop_id,
      event_code: meta.key || code || 'invalid_json',
      order_id: orderId,
      status: 'invalid_json',
      message: parseError,
      payload: { sample: bodyText.slice(0, 500) }
    }).catch(() => null)
    return
  }

  const verification = await verifyShopeeWebhook(request, env, bodyText, shop).catch(error => ({
    ok: true,
    verified: false,
    message: `Không kiểm được chữ ký: ${error.message}`
  }))

  let result = null
  let labelResult = null
  let chatResult = null
  let queueJob = null
  try {
    if (orderId && meta.action === 'log') meta.action = 'sync_order'
    const queueMeta = queueActionForPush('shopee', meta.key || code, body, meta.action, orderId)
    queueJob = await queueWebhookSyncJob(env, {
      platform: 'shopee',
      shop: shopName,
      shop_id: shop?.api_shop_id,
      event_code: meta.key || code,
      event_group: queueMeta.event_group,
      action_taken: queueMeta.action_taken,
      entity_id: entityId,
      order_id: orderId,
      payload: { body, push: meta, entity_id: entityId }
    })
    result = await runShopeePushActions(env, cors, meta, shopName, orderId)
    if (meta.group === 'chat' || meta.key === 'webchat_push') {
      const recorded = await recordChatWebhook(env, {
        platform: 'shopee',
        shop: shopName,
        shop_id: shop?.api_shop_id,
        event_code: meta.key || code,
        body
      })
      chatResult = {
        inserted: Boolean(recorded?.inserted),
        conversation_id: recorded?.message?.conversation_id || '',
        has_real_content: Boolean(recorded?.message?.has_real_content)
      }
    }
    if (meta.action === 'sync_order_label' && orderId) {
      labelResult = await refreshLabelQuietly(env, cors, orderId)
    }
    await finishWebhookSyncJob(env, queueJob, 'done', { result, label: labelResult, chat: chatResult })
    await saveWebhookEvent(env, {
      platform: 'shopee',
      shop: shopName,
      shop_id: shop?.api_shop_id,
      event_code: meta.key || code,
      order_id: orderId,
      status: verification.ok ? 'ok' : 'signature_watch',
      verified: verification.verified,
      message: `${meta.key || code}: ${verification.message}`,
      payload: { body, result, label: labelResult, chat: chatResult, push: meta, entity_id: entityId }
    })
  } catch (error) {
    await finishWebhookSyncJob(env, queueJob, 'failed', { body, push: meta }, error.message)
    await saveWebhookEvent(env, {
      platform: 'shopee',
      shop: shopName,
      shop_id: shop?.api_shop_id,
      event_code: meta.key || code,
      order_id: orderId,
      status: 'sync_error',
      verified: verification.verified,
      message: error.message,
      payload: { body, push: meta, entity_id: entityId }
    }).catch(() => null)
  }

  return
}

export async function handleShopeeMarketplaceWebhook(request, env, cors, ctx) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    const challenge = callbackChallenge(request, '', {})
    runInBackground(ctx, saveWebhookEvent(env, {
      platform: 'shopee',
      event_code: challenge ? 'verify_challenge' : 'verify',
      status: 'ok',
      message: 'Shopee verify webhook bang GET/HEAD.',
      payload: { method: request.method, challenge: Boolean(challenge) }
    }))
    return textAck(cors, challenge || 'success')
  }

  let parsed
  try {
    parsed = await readJsonBody(request)
  } catch (error) {
    runInBackground(ctx, saveWebhookEvent(env, {
      platform: 'shopee',
      event_code: 'read_error',
      status: 'body_read_error',
      message: error.message,
      payload: { method: request.method }
    }))
    return textAck(cors)
  }

  const { bodyText, body, parseError } = parsed
  const challenge = callbackChallenge(request, bodyText, body)
  runInBackground(ctx, processShopeeWebhook(request, env, cors, bodyText, body, parseError))

  return textAck(cors, challenge || 'success')
}

async function processLazadaWebhook(request, env, cors, bodyText, body, parseError) {
  const code = eventCode(body)
  const orderId = lazadaOrderId(body)
  const shop = await findApiShop(env, 'lazada', lazadaIdentifiers(body))
  const shopName = cleanText(shop?.shop_name || shop?.user_name || shop?.api_shop_id)

  if (!cleanText(bodyText)) {
    await saveWebhookEvent(env, {
      platform: 'lazada',
      shop: shopName,
      shop_id: shop?.api_shop_id,
      event_code: 'verify',
      status: 'ok',
      message: 'Lazada verify webhook không có body.',
      payload: {}
    }).catch(() => null)
    return
  }

  if (parseError) {
    await saveWebhookEvent(env, {
      platform: 'lazada',
      shop: shopName,
      shop_id: shop?.api_shop_id,
      event_code: code || 'invalid_json',
      order_id: orderId,
      status: 'invalid_json',
      message: parseError,
      payload: { sample: bodyText.slice(0, 500) }
    }).catch(() => null)
    return
  }

  let result = null
  let labelResult = null
  let chatResult = null
  let queueJob = null
  try {
    const queueMeta = queueActionForPush('lazada', code, body, '', orderId)
    queueJob = await queueWebhookSyncJob(env, {
      platform: 'lazada',
      shop: shopName,
      shop_id: shop?.api_shop_id,
      event_code: code,
      event_group: queueMeta.event_group,
      action_taken: queueMeta.action_taken,
      entity_id: firstTextFrom(body, [['data', 'item_id'], ['data', 'sku_id'], ['data', 'product_id'], ['data', 'reverse_order_id']]),
      order_id: orderId,
      payload: { body, push: queueMeta }
    })
    if (queueMeta.action_taken === 'sync_return_order') {
      result = await syncReturnsFromMarketplaceEvent(env, {
        platform: 'lazada',
        shop: shopName,
        order_id: orderId
      })
    } else if (orderId || /order|fulfillment|logistic|shipping/i.test(code)) {
      result = await syncFromMarketplaceEvent(env, cors, {
        platform: 'lazada',
        shop: shopName,
        order_id: orderId
      })
    }
    if (queueMeta.action_taken === 'sync_products') {
      result = {
        ...(result || {}),
        products: await syncProductsFromMarketplaceEvent(env, cors, {
          platform: 'lazada',
          shop: shopName,
          limit: 80
        })
      }
    }
    if (orderId && /document|label|shipping|logistic/i.test(code)) {
      labelResult = await refreshLabelQuietly(env, cors, orderId)
    }
    if (/chat|message|conversation|webchat/i.test(code)) {
      const recorded = await recordChatWebhook(env, {
        platform: 'lazada',
        shop: shopName,
        shop_id: shop?.api_shop_id,
        event_code: code,
        body
      })
      chatResult = {
        inserted: Boolean(recorded?.inserted),
        conversation_id: recorded?.message?.conversation_id || '',
        has_real_content: Boolean(recorded?.message?.has_real_content)
      }
    }
    await finishWebhookSyncJob(env, queueJob, 'done', { result, label: labelResult, chat: chatResult })
    await saveWebhookEvent(env, {
      platform: 'lazada',
      shop: shopName,
      shop_id: shop?.api_shop_id,
      event_code: code,
      order_id: orderId,
      status: 'ok',
      verified: false,
      message: 'Đã nhận webhook Lazada và đồng bộ lại dữ liệu liên quan.',
      payload: { body, result, label: labelResult, chat: chatResult }
    })
  } catch (error) {
    await finishWebhookSyncJob(env, queueJob, 'failed', { body }, error.message)
    await saveWebhookEvent(env, {
      platform: 'lazada',
      shop: shopName,
      shop_id: shop?.api_shop_id,
      event_code: code,
      order_id: orderId,
      status: 'sync_error',
      message: error.message,
      payload: body
    }).catch(() => null)
  }
}

export async function handleLazadaMarketplaceWebhook(request, env, cors, ctx) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    const challenge = callbackChallenge(request, '', {})
    runInBackground(ctx, saveWebhookEvent(env, {
      platform: 'lazada',
      event_code: challenge ? 'verify_challenge' : 'verify',
      status: 'ok',
      message: 'Lazada verify webhook bằng GET/HEAD.',
      payload: { method: request.method, challenge: Boolean(challenge) }
    }))
    return textAck(cors, challenge || 'success')
  }

  const { bodyText, body, parseError } = await readJsonBody(request)
  const challenge = callbackChallenge(request, bodyText, body)
  runInBackground(ctx, processLazadaWebhook(request, env, cors, bodyText, body, parseError))

  return textAck(cors, challenge || 'success')
}

async function executePushSyncQueueJob(env, cors, job) {
  const platform = cleanText(job.platform).toLowerCase()
  const action = cleanText(job.action_taken)
  const orderId = cleanText(job.order_id)
  const shop = cleanText(job.shop)
  const result = { action, platform, shop, order_id: orderId }

  if (!MARKETPLACE_QUEUE_EXECUTABLE_ACTIONS.has(action)) {
    return {
      status: 'skipped',
      result: { ...result, note: 'Event chỉ dùng để ghi log, không cần chạy sync incremental.' }
    }
  }

  if (action === 'sync_order' || action === 'sync_order_label') {
    result.order = await syncFromMarketplaceEvent(env, cors, {
      platform,
      shop,
      order_id: orderId,
      statuses: platform === 'shopee'
        ? 'READY_TO_SHIP,PROCESSED,SHIPPED,COMPLETED,CANCELLED,IN_CANCEL,TO_RETURN,RETURN_REFUND,FAILED_DELIVERY'
        : ''
    })
    if (action === 'sync_order_label' && orderId) {
      result.label = await refreshLabelQuietly(env, cors, orderId)
    }
  }

  if (action === 'sync_return_order') {
    result.returns = await syncReturnsFromMarketplaceEvent(env, {
      platform,
      shop,
      order_id: orderId
    })
  }

  if (action === 'sync_products') {
    result.products = await syncProductsFromMarketplaceEvent(env, cors, {
      platform,
      shop,
      limit: 80
    })
  }

  if (action === 'record_chat_signal') {
    result.note = 'Webhook chat đã được ghi trong handler; queue chỉ đánh dấu để còn retry/log vận hành.'
  }

  return { status: 'done', result }
}

const MARKETPLACE_QUEUE_EXECUTABLE_ACTIONS = new Set([
  'sync_order',
  'sync_order_label',
  'sync_return_order',
  'sync_products',
  'record_chat_signal'
])

export async function runMarketplacePushSyncQueueBatch(env, cors = {}, options = {}) {
  const jobs = await takeMarketplacePushSyncJobs(env, options)
  const results = []
  for (const job of jobs) {
    await markMarketplacePushSyncQueue(env, job.id, { status: 'processing', incrementAttempt: true })
    try {
      const executed = await executePushSyncQueueJob(env, cors, job)
      const row = await markMarketplacePushSyncQueue(env, job.id, {
        status: executed.status || 'done',
        result: executed.result || executed
      })
      results.push({ id: job.id, status: row?.status || executed.status || 'done', result: executed.result || executed })
    } catch (error) {
      await markMarketplacePushSyncQueue(env, job.id, {
        status: 'failed',
        result: { action: job.action_taken, platform: job.platform, shop: job.shop },
        last_error: error.message
      })
      results.push({ id: job.id, status: 'failed', error: error.message })
    }
  }
  return {
    status: 'ok',
    mode: 'marketplace_push_sync_queue_run',
    selected_jobs: jobs.length,
    done: results.filter(row => row.status === 'done').length,
    failed: results.filter(row => row.status === 'failed').length,
    skipped: results.filter(row => row.status === 'skipped').length,
    results
  }
}

export async function handleWebhookSyncQueue(request, env, cors) {
  const url = new URL(request.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50) || 50, 1), 100)
  if (request.method === 'GET') {
    return json(await listMarketplacePushSyncQueue(env, {
      limit,
      status: url.searchParams.get('status') || ''
    }), cors)
  }
  if (request.method !== 'POST') {
    return json({ error: 'Phương thức không được hỗ trợ.' }, cors, 405)
  }

  let body = {}
  try { body = await request.json() } catch {}
  const action = cleanText(body.action || url.searchParams.get('action') || 'run')
  if (action === 'list') {
    return json(await listMarketplacePushSyncQueue(env, { limit, status: cleanText(body.status) }), cors)
  }
  const result = await runMarketplacePushSyncQueueBatch(env, cors, {
    limit: Math.min(Math.max(Number(body.limit || body.max_jobs || limit || 3) || 3, 1), 10),
    include_failed: body.include_failed === true || body.includeFailed === true || action === 'retry_failed'
  })
  return json(result, cors)
}

export async function handleWebhookEventsStatus(request, env, cors) {
  await ensureWebhookEventsTable(env)
  const url = new URL(request.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50) || 50, 1), 100)
  if (url.searchParams.get('core') === '1' || url.searchParams.get('mode') === 'core') {
    return json(await loadMarketplacePushCore(env, {
      limit,
      includeSubscriptions: url.searchParams.get('subscriptions') === '1',
      // probe=1 chỉ gọi API đọc cấu hình push, không gửi lệnh bật/tắt event lên sàn.
      probe: url.searchParams.get('probe') === '1'
    }), cors)
  }
  const { results } = await env.DB.prepare(`
    SELECT id, platform, shop, shop_id, event_code, event_group, action_taken, entity_id,
           order_id, status, verified, received_mode, message, processed_at
    FROM marketplace_webhook_events
    ORDER BY id DESC
    LIMIT ?
  `).bind(limit).all()
  const { results: summary } = await env.DB.prepare(`
    SELECT platform, status, COUNT(*) AS total
    FROM marketplace_webhook_events
    WHERE processed_at >= datetime('now', '-7 days')
    GROUP BY platform, status
    ORDER BY platform, status
  `).all()
  return json({ status: 'ok', recent: results || [], summary: summary || [] }, cors)
}
