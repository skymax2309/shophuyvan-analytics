export function installDiscountsShopeeDiscountsActions(core) {
  const DISCOUNT_CONFIRM_TEXT = core.DISCOUNT_CONFIRM_TEXT
  const DISCOUNT_STOCK_RULE_CONFIRM = core.DISCOUNT_STOCK_RULE_CONFIRM
  const SHOPEE_DISCOUNT_MUTATIONS = core.SHOPEE_DISCOUNT_MUTATIONS
  const cleanText = (...args) => core.cleanText(...args)
  const compactJson = (...args) => core.compactJson(...args)
  const discountInternalRule = (...args) => core.discountInternalRule(...args)
  const ensureShopeeDiscountTables = (...args) => core.ensureShopeeDiscountTables(...args)
  const fetchShopeeJsonPost = (...args) => core.fetchShopeeJsonPost(...args)
  const getApiShops = core.getApiShops
  const getShopeeAppFromRow = core.getShopeeAppFromRow
  const isStockRuleDiscountConfirmed = (...args) => core.isStockRuleDiscountConfirmed(...args)
  const shopeeDiscountPayload = (...args) => core.shopeeDiscountPayload(...args)
  const signShopeeUrl = (...args) => core.signShopeeUrl(...args)

  async function saveDiscountAction(env, row) {
    await ensureShopeeDiscountTables(env)
    await env.DB.prepare(`
      INSERT INTO marketplace_discount_actions (
        platform, shop, api_shop_id, action, payload, dry_run, sent_to_shopee, response, created_at
      )
      VALUES ('shopee',?,?,?,?,?,?,?,datetime('now', '+7 hours'))
    `).bind(
      row.shop || '', row.api_shop_id || '', row.action || '', compactJson(row.payload || {}, 30000),
      row.dry_run ? 1 : 0, row.sent_to_shopee ? 1 : 0, compactJson(row.response || {}, 30000)
    ).run()
  }
  core.saveDiscountAction = saveDiscountAction

  async function executeShopeeDiscountAction(env, options = {}) {
    const action = cleanText(options.action).toLowerCase()
    const endpoint = SHOPEE_DISCOUNT_MUTATIONS[action]
    const shopFilter = cleanText(options.shop)
    const payload = options.payload && typeof options.payload === 'object' ? options.payload : {}
    const clientRule = options.clientRule && typeof options.clientRule === 'object' ? options.clientRule : {}
    const dryRun = !(options.execute === true || String(options.execute).toLowerCase() === 'true')
    const manualConfirmed = cleanText(options.confirm) === DISCOUNT_CONFIRM_TEXT
    const internalRule = Object.keys(discountInternalRule(payload)).length ? discountInternalRule(payload) : clientRule
    const stockRuleConfirmed = isStockRuleDiscountConfirmed(action, { _internal_rule: internalRule }, options.confirm)
    const confirmed = manualConfirmed || stockRuleConfirmed
    const confirmationMode = stockRuleConfirmed ? 'stock_threshold_price_rule' : (manualConfirmed ? 'manual_text' : '')

    if (!endpoint) {
      return { status: 'error', mode: 'shopee_discount_action', error: 'invalid_action', allowed_actions: Object.keys(SHOPEE_DISCOUNT_MUTATIONS), dry_run: true, sent_to_shopee: false }
    }
    if (!shopFilter) {
      return { status: 'error', mode: 'shopee_discount_action', error: 'missing_shop', message: 'shop is required', dry_run: true, sent_to_shopee: false }
    }
    if (dryRun || !confirmed) {
      const needsConfirmation = !dryRun && !confirmed
      const result = {
        status: 'ok',
        mode: 'shopee_discount_action',
        endpoint,
        action,
        shop: shopFilter,
        payload,
        internal_rule: internalRule,
        dry_run: true,
        sent_to_shopee: false,
        confirmation_required: needsConfirmation
          ? (cleanText(internalRule.mode) === 'stock_threshold_price_rule' ? DISCOUNT_STOCK_RULE_CONFIRM : DISCOUNT_CONFIRM_TEXT)
          : '',
        message: needsConfirmation
          ? 'Chưa gửi lên Shopee vì lệnh thật thiếu xác nhận hợp lệ.'
          : 'Lệnh thử chỉ lưu payload để kiểm tra, chưa tạo/sửa/dừng chương trình giảm giá trên Shopee.'
      }
      await saveDiscountAction(env, result)
      return result
    }

    const shops = await getApiShops(env, 'shopee', shopFilter, 1)
    const shop = shops[0]
    if (!shop) {
      return { status: 'error', mode: 'shopee_discount_action', endpoint, action, shop: shopFilter, error: 'shop_not_found', dry_run: false, sent_to_shopee: false }
    }
    const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
    const buildUrl = signShopeeUrl(app, endpoint, shop.access_token, shop.api_shop_id)
    const payloadForShopee = shopeeDiscountPayload(payload)
    const response = await fetchShopeeJsonPost(buildUrl, payloadForShopee)
    const result = {
      status: 'ok',
      mode: 'shopee_discount_action',
      endpoint,
      action,
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: String(shop.api_shop_id || ''),
      payload: payloadForShopee,
      internal_rule: internalRule,
      confirmation_mode: confirmationMode,
      dry_run: false,
      sent_to_shopee: true,
      response
    }
    await saveDiscountAction(env, result)
    return result
  }
  core.executeShopeeDiscountAction = executeShopeeDiscountAction
}
