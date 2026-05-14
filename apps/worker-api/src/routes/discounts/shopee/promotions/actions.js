export function installDiscountsShopeePromotionsActions(core) {
  const DISCOUNT_CONFIRM_TEXT = core.DISCOUNT_CONFIRM_TEXT
  const SHOPEE_PROMOTION_MUTATIONS = core.SHOPEE_PROMOTION_MUTATIONS
  const cleanText = (...args) => core.cleanText(...args)
  const compactJson = (...args) => core.compactJson(...args)
  const fetchShopeeJsonPost = (...args) => core.fetchShopeeJsonPost(...args)
  const getApiShops = core.getApiShops
  const getShopeeAppFromRow = core.getShopeeAppFromRow
  const saveDiscountAction = (...args) => core.saveDiscountAction(...args)
  const signShopeeUrl = (...args) => core.signShopeeUrl(...args)

  function normalizePromotionModule(module = '') {
    const value = cleanText(module).toLowerCase()
    if (value === 'vouchers') return 'voucher'
    if (value === 'shop_flashsale' || value === 'flash_sale') return 'shop_flash_sale'
    return value
  }

  function normalizePromotionPayload(module, action, payload = {}) {
    const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload } : {}
    const programId = cleanText(data.program_id || data.promotion_id)
    if (module === 'voucher') data.voucher_id = Number(data.voucher_id || programId || 0) || data.voucher_id || programId
    if (module === 'bundle_deal') data.bundle_deal_id = Number(data.bundle_deal_id || programId || 0) || data.bundle_deal_id || programId
    if (module === 'add_on_deal') data.add_on_deal_id = Number(data.add_on_deal_id || programId || 0) || data.add_on_deal_id || programId
    if (module === 'shop_flash_sale') data.flash_sale_id = Number(data.flash_sale_id || programId || 0) || data.flash_sale_id || programId
    delete data.program_id
    delete data.promotion_id
    if (action === 'delete' || action === 'end') {
      for (const key of Object.keys(data)) {
        if (!['voucher_id', 'bundle_deal_id', 'add_on_deal_id', 'flash_sale_id'].includes(key)) delete data[key]
      }
    }
    return data
  }

  async function executeShopeePromotionAction(env, options = {}) {
    const module = normalizePromotionModule(options.module)
    const action = cleanText(options.action).toLowerCase()
    const endpoint = SHOPEE_PROMOTION_MUTATIONS?.[module]?.[action]
    const shopFilter = cleanText(options.shop)
    const dryRun = !(options.execute === true || String(options.execute).toLowerCase() === 'true')
    const payload = normalizePromotionPayload(module, action, options.payload || {})
    const confirmed = cleanText(options.confirm) === DISCOUNT_CONFIRM_TEXT
    const resultBase = {
      status: 'ok',
      mode: 'shopee_promotion_live_action',
      module,
      action,
      endpoint,
      shop: shopFilter,
      payload,
      dry_run: true,
      sent_to_shopee: false
    }
    if (!endpoint) return { ...resultBase, status: 'error', error: 'invalid_action', allowed_actions: Object.keys(SHOPEE_PROMOTION_MUTATIONS?.[module] || {}) }
    if (!shopFilter) return { ...resultBase, status: 'error', error: 'missing_shop', message: 'shop is required' }
    if (dryRun || !confirmed) {
      const preview = {
        ...resultBase,
        confirmation_required: dryRun ? '' : DISCOUNT_CONFIRM_TEXT,
        message: dryRun
          ? 'Preview payload khuyến mãi Shopee, chưa gửi lên sàn.'
          : 'Chưa gửi lên Shopee vì thiếu xác nhận hợp lệ.'
      }
      await saveDiscountAction(env, preview)
      return preview
    }
    const shops = await getApiShops(env, 'shopee', shopFilter, 1)
    const shop = shops[0]
    if (!shop) return { ...resultBase, status: 'error', error: 'shop_not_found', dry_run: false }
    const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
    const buildUrl = signShopeeUrl(app, endpoint, shop.access_token, shop.api_shop_id)
    const response = await fetchShopeeJsonPost(buildUrl, payload)
    const result = {
      ...resultBase,
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      dry_run: false,
      sent_to_shopee: true,
      response,
      response_compact: compactJson(response, 30000)
    }
    await saveDiscountAction(env, result)
    return result
  }

  core.executeShopeePromotionAction = executeShopeePromotionAction
}
