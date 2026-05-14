export function installDiscountsCommonFoundation(core) {
  const signHmacHex = core.signHmacHex

  const SHOPEE_DISCOUNT_LIST_PATH = '/api/v2/discount/get_discount_list'
  core.SHOPEE_DISCOUNT_LIST_PATH = SHOPEE_DISCOUNT_LIST_PATH

  const SHOPEE_DISCOUNT_DETAIL_PATH = '/api/v2/discount/get_discount'
  core.SHOPEE_DISCOUNT_DETAIL_PATH = SHOPEE_DISCOUNT_DETAIL_PATH

  const SHOPEE_VOUCHER_LIST_PATH = '/api/v2/voucher/get_voucher_list'
  core.SHOPEE_VOUCHER_LIST_PATH = SHOPEE_VOUCHER_LIST_PATH

  const SHOPEE_VOUCHER_DETAIL_PATH = '/api/v2/voucher/get_voucher'
  core.SHOPEE_VOUCHER_DETAIL_PATH = SHOPEE_VOUCHER_DETAIL_PATH

  const LAZADA_VOUCHER_LIST_PATH = '/promotion/vouchers/get'
  core.LAZADA_VOUCHER_LIST_PATH = LAZADA_VOUCHER_LIST_PATH

  const LAZADA_VOUCHER_DETAIL_PATH = '/promotion/voucher/get'
  core.LAZADA_VOUCHER_DETAIL_PATH = LAZADA_VOUCHER_DETAIL_PATH

  const LAZADA_VOUCHER_PRODUCTS_PATH = '/promotion/voucher/products/get'
  core.LAZADA_VOUCHER_PRODUCTS_PATH = LAZADA_VOUCHER_PRODUCTS_PATH

  const SHOPEE_BUNDLE_DEAL_LIST_PATH = '/api/v2/bundle_deal/get_bundle_deal_list'
  core.SHOPEE_BUNDLE_DEAL_LIST_PATH = SHOPEE_BUNDLE_DEAL_LIST_PATH

  const SHOPEE_BUNDLE_DEAL_DETAIL_PATH = '/api/v2/bundle_deal/get_bundle_deal'
  core.SHOPEE_BUNDLE_DEAL_DETAIL_PATH = SHOPEE_BUNDLE_DEAL_DETAIL_PATH

  const SHOPEE_BUNDLE_DEAL_ITEMS_PATH = '/api/v2/bundle_deal/get_bundle_deal_item'
  core.SHOPEE_BUNDLE_DEAL_ITEMS_PATH = SHOPEE_BUNDLE_DEAL_ITEMS_PATH

  const SHOPEE_ADD_ON_DEAL_LIST_PATH = '/api/v2/add_on_deal/get_add_on_deal_list'
  core.SHOPEE_ADD_ON_DEAL_LIST_PATH = SHOPEE_ADD_ON_DEAL_LIST_PATH

  const SHOPEE_ADD_ON_DEAL_DETAIL_PATH = '/api/v2/add_on_deal/get_add_on_deal'
  core.SHOPEE_ADD_ON_DEAL_DETAIL_PATH = SHOPEE_ADD_ON_DEAL_DETAIL_PATH

  const SHOPEE_ADD_ON_DEAL_MAIN_ITEMS_PATH = '/api/v2/add_on_deal/get_add_on_deal_main_item'
  core.SHOPEE_ADD_ON_DEAL_MAIN_ITEMS_PATH = SHOPEE_ADD_ON_DEAL_MAIN_ITEMS_PATH

  const SHOPEE_ADD_ON_DEAL_SUB_ITEMS_PATH = '/api/v2/add_on_deal/get_add_on_deal_sub_item'
  core.SHOPEE_ADD_ON_DEAL_SUB_ITEMS_PATH = SHOPEE_ADD_ON_DEAL_SUB_ITEMS_PATH

  const SHOPEE_SHOP_FLASH_SALE_LIST_PATH = '/api/v2/shop_flash_sale/get_shop_flash_sale_list'
  core.SHOPEE_SHOP_FLASH_SALE_LIST_PATH = SHOPEE_SHOP_FLASH_SALE_LIST_PATH

  const SHOPEE_SHOP_FLASH_SALE_DETAIL_PATH = '/api/v2/shop_flash_sale/get_shop_flash_sale'
  core.SHOPEE_SHOP_FLASH_SALE_DETAIL_PATH = SHOPEE_SHOP_FLASH_SALE_DETAIL_PATH

  const SHOPEE_SHOP_FLASH_SALE_ITEMS_PATH = '/api/v2/shop_flash_sale/get_shop_flash_sale_items'
  core.SHOPEE_SHOP_FLASH_SALE_ITEMS_PATH = SHOPEE_SHOP_FLASH_SALE_ITEMS_PATH

  const SHOPEE_PROMOTION_MUTATIONS = {
    voucher: {
      add: '/api/v2/voucher/add_voucher',
      update: '/api/v2/voucher/update_voucher',
      delete: '/api/v2/voucher/delete_voucher',
      end: '/api/v2/voucher/end_voucher'
    },
    bundle_deal: {
      add: '/api/v2/bundle_deal/add_bundle_deal',
      update: '/api/v2/bundle_deal/update_bundle_deal',
      delete: '/api/v2/bundle_deal/delete_bundle_deal',
      end: '/api/v2/bundle_deal/end_bundle_deal',
      add_item: '/api/v2/bundle_deal/add_bundle_deal_item',
      update_item: '/api/v2/bundle_deal/update_bundle_deal_item',
      delete_item: '/api/v2/bundle_deal/delete_bundle_deal_item'
    },
    add_on_deal: {
      add: '/api/v2/add_on_deal/add_add_on_deal',
      update: '/api/v2/add_on_deal/update_add_on_deal',
      delete: '/api/v2/add_on_deal/delete_add_on_deal',
      end: '/api/v2/add_on_deal/end_add_on_deal',
      add_main_item: '/api/v2/add_on_deal/add_add_on_deal_main_item',
      add_sub_item: '/api/v2/add_on_deal/add_add_on_deal_sub_item',
      update_main_item: '/api/v2/add_on_deal/update_add_on_deal_main_item',
      update_sub_item: '/api/v2/add_on_deal/update_add_on_deal_sub_item',
      delete_main_item: '/api/v2/add_on_deal/delete_add_on_deal_main_item',
      delete_sub_item: '/api/v2/add_on_deal/delete_add_on_deal_sub_item'
    },
    shop_flash_sale: {
      add: '/api/v2/shop_flash_sale/create_shop_flash_sale',
      update: '/api/v2/shop_flash_sale/update_shop_flash_sale',
      delete: '/api/v2/shop_flash_sale/delete_shop_flash_sale',
      add_item: '/api/v2/shop_flash_sale/add_shop_flash_sale_items',
      update_item: '/api/v2/shop_flash_sale/update_shop_flash_sale_items',
      delete_item: '/api/v2/shop_flash_sale/delete_shop_flash_sale_items'
    }
  }
  core.SHOPEE_PROMOTION_MUTATIONS = SHOPEE_PROMOTION_MUTATIONS

  const LAZADA_FREE_SHIPPING_LIST_PATH = '/promotion/freeshippings/get'
  core.LAZADA_FREE_SHIPPING_LIST_PATH = LAZADA_FREE_SHIPPING_LIST_PATH

  const LAZADA_FREE_SHIPPING_DETAIL_PATH = '/promotion/freeshipping/get'
  core.LAZADA_FREE_SHIPPING_DETAIL_PATH = LAZADA_FREE_SHIPPING_DETAIL_PATH

  const LAZADA_FREE_SHIPPING_PRODUCTS_PATH = '/promotion/freeshipping/products/get'
  core.LAZADA_FREE_SHIPPING_PRODUCTS_PATH = LAZADA_FREE_SHIPPING_PRODUCTS_PATH

  const LAZADA_FREE_SHIPPING_REGIONS_PATH = '/promotion/freeshipping/regions/get'
  core.LAZADA_FREE_SHIPPING_REGIONS_PATH = LAZADA_FREE_SHIPPING_REGIONS_PATH

  const LAZADA_FLEXICOMBO_LIST_PATH = '/promotion/flexicombo/list'
  core.LAZADA_FLEXICOMBO_LIST_PATH = LAZADA_FLEXICOMBO_LIST_PATH

  const LAZADA_FLEXICOMBO_DETAIL_PATH = '/promotion/flexicombo/details'
  core.LAZADA_FLEXICOMBO_DETAIL_PATH = LAZADA_FLEXICOMBO_DETAIL_PATH

  const LAZADA_FLEXICOMBO_PRODUCTS_PATH = '/promotion/flexicombo/products/list'
  core.LAZADA_FLEXICOMBO_PRODUCTS_PATH = LAZADA_FLEXICOMBO_PRODUCTS_PATH

  const SHOPEE_DISCOUNT_MUTATIONS = {
    add_discount: '/api/v2/discount/add_discount',
    add_discount_item: '/api/v2/discount/add_discount_item',
    update_discount: '/api/v2/discount/update_discount',
    update_discount_item: '/api/v2/discount/update_discount_item',
    end_discount: '/api/v2/discount/end_discount'
  }
  core.SHOPEE_DISCOUNT_MUTATIONS = SHOPEE_DISCOUNT_MUTATIONS

  const DISCOUNT_CONFIRM_TEXT = 'TOI_HIEU_DAY_LA_THAY_DOI_GIA_SHOPEE'
  core.DISCOUNT_CONFIRM_TEXT = DISCOUNT_CONFIRM_TEXT

  const DISCOUNT_STOCK_RULE_CONFIRM = 'APPLY_STOCK_PRICE_RULE'
  core.DISCOUNT_STOCK_RULE_CONFIRM = DISCOUNT_STOCK_RULE_CONFIRM

  const PROMOTION_QUEUE_EXECUTE_CONFIRM = 'APPLY_PROMOTION_QUEUE'
  core.PROMOTION_QUEUE_EXECUTE_CONFIRM = PROMOTION_QUEUE_EXECUTE_CONFIRM

  async function tableExists(env, table) {
    const safeTable = cleanText(table)
    if (!/^[a-zA-Z0-9_]+$/.test(safeTable)) return false
    const row = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(safeTable).first().catch(() => null)
    return Boolean(row)
  }
  core.tableExists = tableExists

  async function tableColumns(env, table) {
    const safeTable = cleanText(table)
    if (!/^[a-zA-Z0-9_]+$/.test(safeTable)) return new Set()
    try {
      const { results } = await env.DB.prepare(`PRAGMA table_info(${safeTable})`).all()
      return new Set((results || []).map(row => row.name))
    } catch {
      return new Set()
    }
  }
  core.tableColumns = tableColumns

  async function addColumnIfMissing(env, table, columnSql) {
    const safeTable = cleanText(table)
    if (!/^[a-zA-Z0-9_]+$/.test(safeTable)) return
    const columnName = cleanText(columnSql).split(/\s+/)[0]
    if (!columnName) return
    const columns = await tableColumns(env, safeTable)
    if (columns.has(columnName)) return
    try {
      await env.DB.prepare(`ALTER TABLE ${safeTable} ADD COLUMN ${columnSql}`).run()
    } catch (error) {
      if (!String(error?.message || '').toLowerCase().includes('duplicate column')) throw error
    }
  }
  core.addColumnIfMissing = addColumnIfMissing

  function json(data, cors, status = 200) {
    return Response.json(data, { status, headers: cors })
  }
  core.json = json

  function cleanText(value) {
    const text = String(value ?? '').replace(/\u00a0/g, ' ').trim()
    const lower = text.toLowerCase()
    if (!text || ['null', 'undefined', 'none', '-', '--', 'unknown', 'n/a', 'na'].includes(lower)) return ''
    return text
  }
  core.cleanText = cleanText

  function compactJson(value, limit = 30000) {
    try {
      return JSON.stringify(value ?? {}).slice(0, limit)
    } catch {
      return '{}'
    }
  }
  core.compactJson = compactJson

  function discountInternalRule(payload = {}) {
    return payload && typeof payload === 'object' && !Array.isArray(payload) && payload._internal_rule && typeof payload._internal_rule === 'object'
      ? payload._internal_rule
      : {}
  }
  core.discountInternalRule = discountInternalRule

  function shopeeDiscountPayload(payload = {}) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
    const cleanPayload = { ...payload }
    // Rule nội bộ chỉ để hệ thống kiểm tra, không gửi field ngoài tài liệu sang Shopee.
    delete cleanPayload._internal_rule
    return cleanPayload
  }
  core.shopeeDiscountPayload = shopeeDiscountPayload

  function isStockRuleDiscountConfirmed(action, payload = {}, confirm = '') {
    const rule = discountInternalRule(payload)
    const prices = rule.stock_price_rules && typeof rule.stock_price_rules === 'object' ? rule.stock_price_rules : {}
    const selectedPrice = num(rule.selected_rule_price || rule.target_promotion_price)
    const hasPriceRule = ['low_stock_price', 'medium_stock_price', 'high_stock_price'].some(key => num(prices[key]) > 0)
    return action === 'update_discount_item'
      && cleanText(confirm) === DISCOUNT_STOCK_RULE_CONFIRM
      && cleanText(rule.mode) === 'stock_threshold_price_rule'
      && selectedPrice > 0
      && hasPriceRule
  }
  core.isStockRuleDiscountConfirmed = isStockRuleDiscountConfirmed

  function num(value) {
    if (value === null || value === undefined || value === '') return 0
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0
    const n = Number(String(value).replace(/[%,$\s]/g, ''))
    return Number.isFinite(n) ? n : 0
  }
  core.num = num

  function round2(value) {
    return Math.round(num(value) * 100) / 100
  }
  core.round2 = round2

  function dateYmd(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  core.dateYmd = dateYmd

  function parseYmd(value, fallback = '') {
    const text = cleanText(value)
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback
  }
  core.parseYmd = parseYmd

  function defaultRange(days = 7) {
    const to = new Date()
    const from = new Date(to)
    from.setDate(from.getDate() - Math.max(0, Number(days || 7) - 1))
    return { from: dateYmd(from), to: dateYmd(to) }
  }
  core.defaultRange = defaultRange

  function sameShopFilterSql(shop, alias = 'shop') {
    const value = cleanText(shop)
    if (!value) return { sql: '', params: [] }
    return { sql: ` AND ${alias} = ?`, params: [value] }
  }
  core.sameShopFilterSql = sameShopFilterSql

  function signShopeeUrl(app, path, accessToken, shopId) {
    return async function(params = {}) {
      const timestamp = Math.floor(Date.now() / 1000)
      const baseString = `${app.partnerId}${path}${timestamp}${accessToken}${shopId}`
      const sign = await signHmacHex(app.partnerKey, baseString)
      const url = new URL(`https://partner.shopeemobile.com${path}`)
      url.searchParams.set('partner_id', app.partnerId)
      url.searchParams.set('timestamp', String(timestamp))
      url.searchParams.set('access_token', accessToken)
      url.searchParams.set('shop_id', String(shopId))
      url.searchParams.set('sign', sign)
      for (const [key, value] of Object.entries(params || {})) {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
      }
      return url.toString()
    }
  }
  core.signShopeeUrl = signShopeeUrl

  async function fetchShopeeJsonGet(buildUrl, params = {}) {
    const url = await buildUrl(params)
    const res = await fetch(url)
    const text = await res.text()
    let data = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      throw new Error(`Shopee API returned non-JSON, HTTP ${res.status}`)
    }
    if (!res.ok) throw new Error(data.message || data.msg || data.error || `Shopee API HTTP ${res.status}`)
    if (data.error) throw new Error(data.message || data.msg || data.error)
    return data
  }
  core.fetchShopeeJsonGet = fetchShopeeJsonGet

  async function fetchShopeeJsonPost(buildUrl, body = {}) {
    const url = await buildUrl({})
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    })
    const text = await res.text()
    let data = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      throw new Error(`Shopee API returned non-JSON, HTTP ${res.status}`)
    }
    if (!res.ok) throw new Error(data.message || data.msg || data.error || `Shopee API HTTP ${res.status}`)
    if (data.error) throw new Error(data.message || data.msg || data.error)
    return data
  }
  core.fetchShopeeJsonPost = fetchShopeeJsonPost
}
