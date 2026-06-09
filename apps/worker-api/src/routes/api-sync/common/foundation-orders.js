import { mapMarketplaceOrderStatus } from '../../../core/orders/status-core.js'

export function installApiSyncCommonFoundationOrders(core) {
  const calcProfit = core.calcProfit
  const getCostSettings = core.getCostSettings

  function json(data, cors, status = 200) {
    return Response.json(data, { status, headers: cors })
  }
  core.json = json

  function cleanText(value) {
    const text = String(value ?? '').replace(/\u00a0/g, ' ').trim()
    const lower = text.toLowerCase()
    if (!text || ['null', 'undefined', 'none', '-', '--', 'unknown', 'n/a', 'na', 'chưa rõ', 'chua ro'].includes(lower)) return ''
    return text
  }
  core.cleanText = cleanText

  function cleanCarrier(value) {
    let text = cleanText(value)
    if (!text) return ''
    text = text.replace(/^pickup\s*:\s*/i, '')
    text = text.split(',')[0].trim()
    return text
  }
  core.cleanCarrier = cleanCarrier

  function firstText(...values) {
    for (const value of values) {
      const text = cleanText(value)
      if (text) return text
    }
    return ''
  }
  core.firstText = firstText

  const FEE_DETAIL_COLUMNS = {
    fee_commission: '_fee_commission',
    fee_payment: '_fee_payment',
    fee_service: '_fee_service',
    fee_affiliate: '_fee_affiliate',
    fee_piship: '_fee_piship',
    fee_handling: '_fee_handling',
    fee_ads: '_fee_ads',
    fee_shipping: '_fee_shipping',
    tax_vat: '_tax_vat',
    tax_pit: '_tax_pit'
  }
  core.FEE_DETAIL_COLUMNS = FEE_DETAIL_COLUMNS

  function apiFeeValue(value) {
    if (value === null || value === undefined || value === '') return undefined
    const number = Number(value)
    return Number.isFinite(number) ? Math.abs(number) : undefined
  }
  core.apiFeeValue = apiFeeValue

  function apiSignedValue(value) {
    if (value === null || value === undefined || value === '') return undefined
    const number = Number(value)
    return Number.isFinite(number) ? number : undefined
  }
  core.apiSignedValue = apiSignedValue

  function pickFee(source, names) {
    if (!source || typeof source !== 'object') return undefined
    for (const name of names) {
      if (!Object.prototype.hasOwnProperty.call(source, name)) continue
      const value = apiFeeValue(source[name])
      if (value !== undefined) return value
    }
    return undefined
  }
  core.pickFee = pickFee

  function pickSignedFee(source, names) {
    if (!source || typeof source !== 'object') return undefined
    for (const name of names) {
      if (!Object.prototype.hasOwnProperty.call(source, name)) continue
      const value = apiSignedValue(source[name])
      if (value !== undefined) return value
    }
    return undefined
  }
  core.pickSignedFee = pickSignedFee

  function sumItemFees(items, names) {
    let total = 0
    let found = false
    for (const item of items || []) {
      const value = pickFee(item, names)
      if (value !== undefined) {
        total += value
        found = true
      }
    }
    return found ? total : undefined
  }
  core.sumItemFees = sumItemFees

  function preferOrderOrItems(order, items, orderNames, itemNames = orderNames) {
    const orderValue = pickFee(order, orderNames)
    if (orderValue !== undefined) return orderValue
    return sumItemFees(items, itemNames)
  }
  core.preferOrderOrItems = preferOrderOrItems

  function compactFeeDetail(detail) {
    let found = false
    let totalKnown = 0
    for (const column of Object.keys(FEE_DETAIL_COLUMNS)) {
      const value = apiFeeValue(detail[column])
      if (value !== undefined) {
        detail[column] = value
        totalKnown += value
        found = true
      } else {
        detail[column] = null
      }
    }
    const total = apiFeeValue(detail.total_fees)
    detail.total_fees = total !== undefined ? total : (found ? totalKnown : null)
    // NEO: Settlement phải giữ dấu âm/dương vì đơn trả hàng hoàn tiền có thể chỉ còn phí mất thực tế.
    const settlement = apiSignedValue(detail.settlement)
    detail.settlement = settlement !== undefined ? settlement : null
    return found ? detail : null
  }
  core.compactFeeDetail = compactFeeDetail

  function feeDetailToPayload(detail) {
    const payload = {}
    if (!detail) return payload
    let hasFee = false
    for (const [column, key] of Object.entries(FEE_DETAIL_COLUMNS)) {
      const value = apiFeeValue(detail[column])
      if (value !== undefined) {
        payload[key] = value
        hasFee = true
      }
    }
    if (hasFee) payload._fee_real = true
    return payload
  }
  core.feeDetailToPayload = feeDetailToPayload

  function shopeeAmsTimestamp(value) {
    const number = Number(value)
    if (!Number.isFinite(number) || number <= 0) return ''
    return new Date(number * 1000).toISOString()
  }
  core.shopeeAmsTimestamp = shopeeAmsTimestamp

  function normalizeShopeeOpenCampaignProduct(row = {}, shop = {}) {
    return {
      platform: 'shopee',
      shop: cleanText(shop.shop_name || shop.user_name || shop.api_shop_id),
      api_shop_id: cleanText(shop.api_shop_id),
      item_id: cleanText(row.item_id),
      item_name: cleanText(row.item_name),
      campaign_id: cleanText(row.campaign_id),
      campaign_status: cleanText(row.campaign_status),
      commission_rate: Number(row.commission_rate || 0),
      max_commission_rate_current_day: Number(row.max_commission_rate_current_day || 0),
      period_start_time: shopeeAmsTimestamp(row.period_start_time),
      period_end_time: shopeeAmsTimestamp(row.period_end_time),
      pending_terminated_time: shopeeAmsTimestamp(row.pending_terminated_time),
      commission_protection_list: Array.isArray(row.commission_protection_list) ? row.commission_protection_list : []
    }
  }
  core.normalizeShopeeOpenCampaignProduct = normalizeShopeeOpenCampaignProduct

  async function ensureOrderFeeDetailsTable(env) {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS order_fee_details (
        order_id TEXT PRIMARY KEY,
        platform TEXT,
        shop TEXT,
        source TEXT,
        fee_commission REAL,
        fee_payment REAL,
        fee_service REAL,
        fee_affiliate REAL,
        fee_piship REAL,
        fee_handling REAL,
        fee_ads REAL,
        fee_shipping REAL,
        tax_vat REAL,
        tax_pit REAL,
        total_fees REAL,
        settlement REAL,
        raw_data TEXT,
        updated_at TEXT DEFAULT (datetime('now', '+7 hours'))
      )
    `).run()
  }
  core.ensureOrderFeeDetailsTable = ensureOrderFeeDetailsTable

  async function ensureShopeeReturnsTable(env) {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS marketplace_returns (
        return_sn TEXT PRIMARY KEY,
        platform TEXT NOT NULL DEFAULT 'shopee',
        shop TEXT DEFAULT '',
        api_shop_id TEXT DEFAULT '',
        order_sn TEXT DEFAULT '',
        status TEXT DEFAULT '',
        reason TEXT DEFAULT '',
        text_reason TEXT DEFAULT '',
        reassessed_request_reason TEXT DEFAULT '',
        refund_amount REAL DEFAULT 0,
        amount_before_discount REAL DEFAULT 0,
        currency TEXT DEFAULT '',
        create_time INTEGER DEFAULT 0,
        create_time_at TEXT DEFAULT '',
        update_time INTEGER DEFAULT 0,
        update_time_at TEXT DEFAULT '',
        due_date INTEGER DEFAULT 0,
        due_date_at TEXT DEFAULT '',
        tracking_number TEXT DEFAULT '',
        needs_logistics INTEGER DEFAULT 0,
        negotiation_status TEXT DEFAULT '',
        seller_proof_status TEXT DEFAULT '',
        seller_compensation_status TEXT DEFAULT '',
        return_refund_type TEXT DEFAULT '',
        return_solution TEXT DEFAULT '',
        return_refund_request_type TEXT DEFAULT '',
        validation_type TEXT DEFAULT '',
        logistics_status TEXT DEFAULT '',
        reverse_logistic_status TEXT DEFAULT '',
        item_count INTEGER DEFAULT 0,
        items_json TEXT DEFAULT '[]',
        images_json TEXT DEFAULT '[]',
        buyer_videos_json TEXT DEFAULT '[]',
        raw_data TEXT DEFAULT '{}',
        synced_at TEXT DEFAULT (datetime('now', '+7 hours'))
      )
    `).run()
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_returns_order
      ON marketplace_returns(platform, order_sn)
    `).run()
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_returns_status
      ON marketplace_returns(platform, status, update_time)
    `).run()
  }
  core.ensureShopeeReturnsTable = ensureShopeeReturnsTable

  function compactJson(value, fallback = '[]') {
    try {
      return JSON.stringify(value ?? JSON.parse(fallback)).slice(0, 12000)
    } catch {
      return fallback
    }
  }
  core.compactJson = compactJson

  async function saveOrderFeeDetails(env, details) {
    const rows = (details || []).filter(Boolean)
    if (!rows.length) return 0
    await ensureOrderFeeDetailsTable(env)
    let saved = 0
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50)
      await env.DB.batch(chunk.map(row => env.DB.prepare(`
        INSERT INTO order_fee_details (
          order_id, platform, shop, source,
          fee_commission, fee_payment, fee_service, fee_affiliate, fee_piship,
          fee_handling, fee_ads, fee_shipping, tax_vat, tax_pit,
          total_fees, settlement, raw_data, updated_at
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now', '+7 hours'))
        ON CONFLICT(order_id) DO UPDATE SET
          platform = excluded.platform,
          shop = excluded.shop,
          source = excluded.source,
          fee_commission = excluded.fee_commission,
          fee_payment = excluded.fee_payment,
          fee_service = excluded.fee_service,
          fee_affiliate = excluded.fee_affiliate,
          fee_piship = excluded.fee_piship,
          fee_handling = excluded.fee_handling,
          fee_ads = excluded.fee_ads,
          fee_shipping = excluded.fee_shipping,
          tax_vat = excluded.tax_vat,
          tax_pit = excluded.tax_pit,
          total_fees = excluded.total_fees,
          settlement = excluded.settlement,
          raw_data = excluded.raw_data,
          updated_at = excluded.updated_at
      `).bind(
        row.order_id,
        row.platform,
        row.shop,
        row.source,
        row.fee_commission,
        row.fee_payment,
        row.fee_service,
        row.fee_affiliate,
        row.fee_piship,
        row.fee_handling,
        row.fee_ads,
        row.fee_shipping,
        row.tax_vat,
        row.tax_pit,
        row.total_fees,
        row.settlement,
        row.raw_data || null
      )))
      saved += chunk.length
    }
    return saved
  }
  core.saveOrderFeeDetails = saveOrderFeeDetails

  function firstPackage(order) {
    const packages = Array.isArray(order?.package_list) ? order.package_list : []
    if (packages[0] && typeof packages[0] === 'object') return packages[0]
    return {}
  }
  core.firstPackage = firstPackage

  function fromUnixSeconds(value) {
    const seconds = Number(value || 0)
    if (!seconds) return null
    const date = new Date((seconds + 7 * 3600) * 1000)
    const pad = n => String(n).padStart(2, '0')
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  }
  core.fromUnixSeconds = fromUnixSeconds

  function uniqueTexts(values) {
    return [...new Set(values.map(cleanText).filter(Boolean))]
  }
  core.uniqueTexts = uniqueTexts

  function collectLazadaTraceEvents(traceData) {
    const modules = Array.isArray(traceData?.result?.module) ? traceData.result.module : []
    const events = []
    for (const module of modules) {
      const packages = Array.isArray(module?.package_detail_info_list) ? module.package_detail_info_list : []
      for (const pkg of packages) {
        const details = Array.isArray(pkg?.logistic_detail_info_list) ? pkg.logistic_detail_info_list : []
        for (const item of details) events.push(item)
      }
    }
    if (!events.length) {
      const walk = value => {
        if (!value || typeof value !== 'object') return
        if (value.status_code || value.detail_type || value.title || value.description) events.push(value)
        if (Array.isArray(value)) value.forEach(walk)
        else Object.values(value).forEach(walk)
      }
      walk(traceData)
    }
    return events
  }
  core.collectLazadaTraceEvents = collectLazadaTraceEvents

  function mapLazadaTraceStatus(traceData) {
    const events = collectLazadaTraceEvents(traceData)
    if (!events.length) return null
    const texts = events.map(event => [
      event.detail_type,
      event.status_code,
      event.title,
      event.description
    ].map(cleanText).join(' ').toLowerCase())

    if (texts.some(text =>
      text.includes('delivered') ||
      text.includes('giao hàng thành công') ||
      text.includes('giao hang thanh cong') ||
      text.includes(' 1400 ')
    )) return { oms: 'COMPLETED', shipping: 'COMPLETED', type: 'normal' }

    if (texts.some(text =>
      text.includes('return') ||
      text.includes('returned') ||
      text.includes('tra hang')
    )) return { oms: 'RETURN', shipping: 'RETURN', type: 'return' }

    if (texts.some(text =>
      text.includes('failed') ||
      text.includes('delivery_failed') ||
      text.includes('giao không thành công') ||
      text.includes('giao khong thanh cong')
    )) return { oms: 'SHIPPING', shipping: 'FAILED_DELIVERY_ATTEMPT', type: 'normal', reason: 'Lazada giao khong thanh cong, cho xu ly tiep' }

    if (texts.some(text =>
      text.includes('return') ||
      text.includes('returned') ||
      text.includes('trả hàng') ||
      text.includes('tra hang')
    )) return { oms: 'RETURN', shipping: 'RETURN', type: 'return' }

    if (texts.some(text =>
      text.includes('shipped') ||
      text.includes('ship_info') ||
      text.includes('đang giao') ||
      text.includes('dang giao') ||
      text.includes('đơn vị vận chuyển') ||
      text.includes('don vi van chuyen')
    )) return { oms: 'SHIPPING', shipping: 'SHIPPED', type: 'normal' }

    return null
  }
  core.mapLazadaTraceStatus = mapLazadaTraceStatus

  function mapPlatformStatus(platform, rawStatus, carrier = '', tracking = '') {
    return mapMarketplaceOrderStatus(platform, rawStatus, { carrier, tracking })
  }
  core.mapPlatformStatus = mapPlatformStatus

  async function updateSyncedOrder(env, orderId, mapped, carrier, tracking) {
    const reason = cleanText(mapped.reason)
    const result = await env.DB.prepare(`
      UPDATE orders_v2
      SET oms_status = ?,
          shipping_status = ?,
          order_type = ?,
          cancel_reason = CASE WHEN ? != '' THEN ? ELSE cancel_reason END,
          shipping_carrier = CASE WHEN ? != '' THEN ? WHEN ? = 'LOGISTICS_PENDING_ARRANGE' THEN '' ELSE shipping_carrier END,
          tracking_number = CASE WHEN ? != '' THEN ? WHEN ? = 'LOGISTICS_PENDING_ARRANGE' THEN '' ELSE tracking_number END,
          oms_updated_at = datetime('now', '+7 hours')
      WHERE order_id = ?
        AND (
          oms_status != ?
          OR shipping_status != ?
          OR (? != '' AND COALESCE(cancel_reason, '') != ?)
          OR (? != '' AND COALESCE(shipping_carrier, '') != ?)
          OR (? != '' AND COALESCE(tracking_number, '') != ?)
          OR (? = 'LOGISTICS_PENDING_ARRANGE' AND (COALESCE(shipping_carrier, '') != '' OR COALESCE(tracking_number, '') != ''))
        )
    `).bind(
      mapped.oms,
      mapped.shipping,
      mapped.type,
      reason,
      reason,
      carrier,
      carrier,
      mapped.shipping,
      tracking,
      tracking,
      mapped.shipping,
      orderId,
      mapped.oms,
      mapped.shipping,
      reason,
      reason,
      carrier,
      carrier,
      tracking,
      tracking,
      mapped.shipping
    ).run()
    return result.meta?.changes || 0
  }
  core.updateSyncedOrder = updateSyncedOrder

  async function ensureOrderBuyerIdentityColumns(env) {
    const columns = [
      ['buyer_id', `TEXT DEFAULT ''`],
      ['buyer_username', `TEXT DEFAULT ''`]
    ]
    for (const [name, definition] of columns) {
      try {
        await env.DB.prepare(`ALTER TABLE orders_v2 ADD COLUMN ${name} ${definition}`).run()
      } catch (error) {
        const message = String(error?.message || '').toLowerCase()
        if (!message.includes('duplicate column') && !message.includes('already exists')) throw error
      }
    }
  }
  core.ensureOrderBuyerIdentityColumns = ensureOrderBuyerIdentityColumns

  async function updateSyncedOrderBuyerIdentity(env, order = {}) {
    const orderId = cleanText(order.order_sn)
    const buyerId = cleanText(order.buyer_user_id || order.buyer_id)
    const buyerUsername = cleanText(order.buyer_username || order.buyer_user_name)
    if (!orderId || (!buyerId && !buyerUsername)) return 0
    await ensureOrderBuyerIdentityColumns(env)
    const result = await env.DB.prepare(`
      UPDATE orders_v2
      SET buyer_id = CASE WHEN ? != '' THEN ? ELSE buyer_id END,
          buyer_username = CASE WHEN ? != '' THEN ? ELSE buyer_username END
      WHERE order_id = ?
    `).bind(buyerId, buyerId, buyerUsername, buyerUsername, orderId).run()
    return result.meta?.changes || 0
  }
  core.updateSyncedOrderBuyerIdentity = updateSyncedOrderBuyerIdentity

  async function loadSyncedOrderForPush(env, orderId, reason = 'changed') {
    const id = cleanText(orderId)
    if (!id) return null
    const row = await env.DB.prepare(`
      SELECT order_id, platform, shop, order_date, order_type, revenue,
             oms_status, shipping_status, shipping_carrier, tracking_number,
             oms_updated_at
      FROM orders_v2
      WHERE order_id = ?
      LIMIT 1
    `).bind(id).first()
    return row ? { ...row, _push_reason: reason } : null
  }
  core.loadSyncedOrderForPush = loadSyncedOrderForPush

  async function updateOrderFinancialsFromFeeDetail(env, orderId, feeDetail, cfg = null) {
    if (!feeDetail) return 0
    const order = await env.DB.prepare(`SELECT * FROM orders_v2 WHERE order_id = ?`).bind(orderId).first()
    if (!order) return 0
    const items = await env.DB.prepare(`SELECT cost_invoice, cost_real FROM order_items WHERE order_id = ?`).bind(orderId).all()
    const totalCostInvoice = (items.results || []).reduce((sum, item) => sum + Number(item.cost_invoice || 0), 0) || Number(order.cost_invoice || 0)
    const totalCostReal = (items.results || []).reduce((sum, item) => sum + Number(item.cost_real || 0), 0) || Number(order.cost_real || 0)
    const settings = cfg || await getCostSettings(env)
    const p = calcProfit({
      ...order,
      ...feeDetailToPayload(feeDetail),
      cost_invoice: totalCostInvoice,
      cost_real: totalCostReal,
      is_first_sku: 1,
      return_fee: order.return_fee || 0
    }, settings)
    const result = await env.DB.prepare(`
      UPDATE orders_v2
      SET fee = ?,
          profit_invoice = ?,
          profit_real = ?,
          tax_flat = ?,
          tax_income = ?,
          fee_platform = ?,
          fee_payment = ?,
          fee_affiliate = ?,
          fee_ads = ?,
          fee_piship = ?,
          fee_service = ?,
          oms_updated_at = datetime('now', '+7 hours')
      WHERE order_id = ?
    `).bind(
      p.total_fee || 0,
      p.profit_invoice || 0,
      p.profit_real || 0,
      p.tax_flat || 0,
      p.tax_income || 0,
      p.fee_platform || 0,
      p.fee_payment || 0,
      p.fee_affiliate || 0,
      p.fee_ads || 0,
      p.fee_piship || 0,
      p.fee_service || 0,
      orderId
    ).run()
    return result.meta?.changes || 0
  }
  core.updateOrderFinancialsFromFeeDetail = updateOrderFinancialsFromFeeDetail
}
