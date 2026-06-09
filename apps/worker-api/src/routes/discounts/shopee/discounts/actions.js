import { assertShopeeLiveWriteAllowed } from '../../../../features/shopee/api/baseClient.js'

export function installDiscountsShopeeDiscountsActions(core) {
  const DISCOUNT_CONFIRM_TEXT = core.DISCOUNT_CONFIRM_TEXT
  const DISCOUNT_STOCK_RULE_CONFIRM = core.DISCOUNT_STOCK_RULE_CONFIRM
  const SHOPEE_DISCOUNT_MUTATIONS = core.SHOPEE_DISCOUNT_MUTATIONS
  const buildShopeeActionResult = (...args) => core.buildShopeeActionResult(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const compactJson = (...args) => core.compactJson(...args)
  const discountInternalRule = (...args) => core.discountInternalRule(...args)
  const ensureShopeeDiscountTables = (...args) => core.ensureShopeeDiscountTables(...args)
  const fetchDiscountDetailPages = (...args) => core.fetchDiscountDetailPages(...args)
  const fetchShopeeShopJsonPost = (...args) => core.fetchShopeeShopJsonPost(...args)
  const getApiShops = core.getApiShops
  const isStockRuleDiscountConfirmed = (...args) => core.isStockRuleDiscountConfirmed(...args)
  const saveDiscounts = (...args) => core.saveDiscounts(...args)
  const shopeeDiscountPayload = (...args) => core.shopeeDiscountPayload(...args)
  const shopeeResponseHasBusinessError = (...args) => core.shopeeResponseHasBusinessError(...args)

  function isShopeeDiscountLiveWriteEnabled(env) {
    return ['1', 'true', 'yes', 'on'].includes(cleanText(env?.SHOPEE_DISCOUNT_LIVE_WRITE_ENABLED).toLowerCase())
  }

  async function saveDiscountAction(env, row) {
    await ensureShopeeDiscountTables(env)
    await env.DB.prepare(`
      INSERT INTO marketplace_discount_actions (
        platform, shop, api_shop_id, action, payload, dry_run, sent_to_shopee, response, created_at
      )
      VALUES ('shopee',?,?,?,?,?,?,?,datetime('now', '+7 hours'))
    `).bind(
      row.shop || '',
      row.api_shop_id || row.shop_id || '',
      row.action || '',
      compactJson(row.payload || row.payload_preview || row.request_payload || {}, 30000),
      row.dry_run ? 1 : 0,
      row.sent_to_shopee ? 1 : 0,
      compactJson(row.response || row.raw_response || row, 30000)
    ).run()
  }
  core.saveDiscountAction = saveDiscountAction

  async function saveDiscountItemWriteback(env, base = {}, payload = {}, result = {}, verifyResult = {}) {
    if (base.action !== 'update_discount_item') return
    const targets = discountItemTargets(payload)
    if (!targets.length) return
    await ensureShopeeDiscountTables(env)
    const writeStatus = result.write_status || (result.status === 'readback_mismatch' ? 'readback_mismatch' : (result.verified ? 'success' : 'failed'))
    const syncStatus = writeStatus === 'success' ? 'synced' : writeStatus
    const rawWritePayload = compactJson(payload, 30000)
    const rawReadbackPayload = compactJson(verifyResult?.detail || verifyResult || {}, 30000)
    const rawErrorPayload = compactJson(result.raw_error || result.raw_response?.error || {}, 30000)
    for (const target of targets) {
      await env.DB.prepare(`
        UPDATE marketplace_discount_items
        SET
          promotion_price = CASE WHEN ? = 'success' AND ? > 0 THEN ? ELSE promotion_price END,
          write_status = ?,
          promotion_sync_status = ?,
          last_write_at = datetime('now', '+7 hours'),
          last_readback_at = CASE WHEN ? != '{}' THEN datetime('now', '+7 hours') ELSE last_readback_at END,
          write_source = 'shopee_open_platform',
          readback_source = CASE WHEN ? != '{}' THEN 'shopee_open_platform' ELSE readback_source END,
          raw_write_payload = ?,
          raw_readback_payload = ?,
          error_code = ?,
          error_message = ?,
          raw_error_payload = ?,
          updated_at = datetime('now', '+7 hours')
        WHERE platform = 'shopee'
          AND api_shop_id = ?
          AND discount_id = ?
          AND item_id = ?
          AND COALESCE(model_id, '') = ?
      `).bind(
        writeStatus,
        target.target_price,
        target.target_price,
        writeStatus,
        syncStatus,
        rawReadbackPayload,
        rawReadbackPayload,
        rawWritePayload,
        rawReadbackPayload,
        cleanText(result.error || result.raw_error?.error || verifyResult.reason),
        cleanText(result.message || result.raw_error?.message),
        rawErrorPayload,
        cleanText(base.api_shop_id || base.shop_id),
        cleanText(payload.discount_id),
        cleanText(target.item_id),
          cleanText(target.model_id)
      ).run()
      if (writeStatus === 'success' && target.target_price > 0) {
        await env.DB.prepare(`
          UPDATE product_variations
          SET
            discount_price = ?,
            updated_at = datetime('now', '+7 hours')
          WHERE platform = 'shopee'
            AND (shop = ? OR shop = ? OR shop = ?)
            AND platform_item_id = ?
            AND COALESCE(model_id, '') = ?
        `).bind(
          target.target_price,
          cleanText(base.shop),
          cleanText(base.shop_id),
          cleanText(base.api_shop_id),
          cleanText(target.item_id),
          cleanText(target.model_id)
        ).run()
      }
    }
  }

  function discountActionObjectId(action, payload = {}) {
    if (payload.discount_id) return cleanText(payload.discount_id)
    if (payload.item_list?.[0]?.item_id) return cleanText(payload.item_list[0].item_id)
    return cleanText(payload.discount_id || action)
  }

  function discountItemTargets(payload = {}) {
    const rows = []
    for (const item of Array.isArray(payload.item_list) ? payload.item_list : []) {
      const itemId = cleanText(item.item_id)
      const modelList = Array.isArray(item.model_list) ? item.model_list : []
      if (modelList.length) {
        for (const model of modelList) {
          rows.push({
            item_id: itemId,
            model_id: cleanText(model.model_id),
            target_price: Number(model.model_promotion_price ?? model.promotion_price ?? 0) || 0
          })
        }
      } else {
        rows.push({
          item_id: itemId,
          model_id: '',
          target_price: Number(item.item_promotion_price ?? item.promotion_price ?? 0) || 0
        })
      }
    }
    return rows
  }

  function discountValidationErrors(action, payload = {}) {
    const errors = []
    if (['update_discount_item', 'delete_discount_item', 'end_discount', 'delete_discount'].includes(action) && !cleanText(payload.discount_id)) {
      errors.push('discount_id is required')
    }
    if (['update_discount_item', 'add_discount_item', 'delete_discount_item'].includes(action) && !Array.isArray(payload.item_list)) {
      errors.push('item_list is required')
    }
    if (action === 'update_discount_item') {
      for (const [index, target] of discountItemTargets(payload).entries()) {
        if (!target.item_id) errors.push(`item_list[${index}].item_id is required`)
        if (target.target_price <= 0) errors.push(`item_list[${index}] promotion price must be greater than 0`)
      }
    }
    return errors
  }

  function verifyDiscountPriceTargets(detail, targets) {
    const items = Array.isArray(detail?.items) ? detail.items : []
    const failures = []
    for (const target of targets) {
      const row = items.find(item => cleanText(item.item_id) === target.item_id && cleanText(item.model_id) === target.model_id)
      if (!row) {
        failures.push({ ...target, reason: 'not_found_after_refetch' })
        continue
      }
      const actual = Number(row.promotion_price || 0)
      if (Math.abs(actual - target.target_price) > 0.01) {
        failures.push({ ...target, actual_price: actual, reason: 'promotion_price_mismatch' })
      }
    }
    return {
      verified: failures.length === 0,
      checked_targets: targets.length,
      failures,
      discount_status: cleanText(detail?.discount?.status)
    }
  }

  async function loadDiscountDetailForVerify(env, shop, discountId) {
    const detail = await fetchDiscountDetailPages(env, shop, discountId, 10, 50)
    if (detail?.discount?.discount_id) await saveDiscounts(env, shop, [], [detail], { fullSync: false })
    return detail
  }

  async function preflightDiscountModelMapping(env, shop, action, payload = {}) {
    if (action !== 'update_discount_item') return null
    const discountId = cleanText(payload.discount_id)
    if (!discountId) return null
    const detail = await fetchDiscountDetailPages(env, shop, discountId, 10, 50)
    const existingRows = Array.isArray(detail?.items) ? detail.items : []
    const targets = discountItemTargets(payload)
    const missingModels = []
    for (const target of targets) {
      if (target.model_id) continue
      const modelRows = existingRows.filter(row => cleanText(row.item_id) === target.item_id && cleanText(row.model_id))
      if (modelRows.length) {
        missingModels.push({
          item_id: target.item_id,
          model_count: modelRows.length,
          model_ids: modelRows.slice(0, 10).map(row => cleanText(row.model_id))
        })
      }
    }
    if (!missingModels.length) return null
    return {
      status: 'error',
      error: 'missing_model_id',
      message: 'Sản phẩm có phân loại. Cần chọn đúng model_id trước khi gọi update_discount_item để tránh đẩy sai giá.',
      verify_result: {
        endpoint: core.SHOPEE_DISCOUNT_DETAIL_PATH,
        checked_discount_id: discountId,
        missing_models: missingModels
      }
    }
  }

  async function verifyDiscountMutation(env, shop, action, payload, response) {
    const discountId = cleanText(payload.discount_id || response?.response?.discount_id)
    if (!discountId) {
      return { verified: false, reason: 'missing_discount_id_for_refetch' }
    }
    if (action === 'delete_discount') {
      try {
        const detail = await fetchDiscountDetailPages(env, shop, discountId, 1, 10)
        return {
          verified: !detail?.discount?.discount_id,
          reason: detail?.discount?.discount_id ? 'discount_still_exists_after_refetch' : '',
          discount: detail?.discount || {}
        }
      } catch (error) {
        return {
          verified: true,
          reason: 'detail_not_found_after_delete',
          refetch_error: error?.shopee || { message: error?.message || String(error) }
        }
      }
    }
    const detail = await loadDiscountDetailForVerify(env, shop, discountId)
    if (action === 'update_discount_item') {
      return {
        ...verifyDiscountPriceTargets(detail, discountItemTargets(payload)),
        detail
      }
    }
    if (action === 'end_discount') {
      const status = cleanText(detail?.discount?.status).toLowerCase()
      const endedByTime = Number(detail?.discount?.end_time || 0) > 0 && Number(detail.discount.end_time) <= Math.floor(Date.now() / 1000)
      return {
        verified: ['ended', 'expired', 'end'].includes(status) || endedByTime,
        discount_status: status,
        end_time: detail?.discount?.end_time || 0,
        reason: ['ended', 'expired', 'end'].includes(status) || endedByTime ? '' : 'discount_not_ended_after_refetch'
      }
    }
    return {
      verified: Boolean(detail?.discount?.discount_id),
      discount_status: cleanText(detail?.discount?.status),
      detail
    }
  }

  function errorResult(base, payload, error, extra = {}) {
    return buildShopeeActionResult({
      ...base,
      ...extra,
      ok: false,
      status: 'error',
      payload,
      raw_error: error?.shopee || error || { message: error?.message || String(error) }
    })
  }

  async function executeShopeeDiscountAction(env, options = {}) {
    const action = cleanText(options.action).toLowerCase()
    const endpoint = SHOPEE_DISCOUNT_MUTATIONS[action]
    const shopFilter = cleanText(options.shop)
    const payload = shopeeDiscountPayload(options.payload && typeof options.payload === 'object' ? options.payload : {})
    const clientRule = options.clientRule && typeof options.clientRule === 'object' ? options.clientRule : {}
    const dryRun = !(options.execute === true || String(options.execute).toLowerCase() === 'true')
    const manualConfirmed = cleanText(options.confirm) === DISCOUNT_CONFIRM_TEXT
    const internalRule = Object.keys(discountInternalRule(options.payload || {})).length ? discountInternalRule(options.payload || {}) : clientRule
    const stockRuleConfirmed = isStockRuleDiscountConfirmed(action, { _internal_rule: internalRule }, options.confirm)
    const confirmed = manualConfirmed || stockRuleConfirmed
    const confirmationMode = stockRuleConfirmed ? 'stock_threshold_price_rule' : (manualConfirmed ? 'manual_text' : '')
    const base = {
      mode: 'shopee_discount_action',
      endpoint,
      action,
      shop: shopFilter,
      object_id: discountActionObjectId(action, payload)
    }

    if (!endpoint) {
      return { ...base, status: 'error', error: 'invalid_action', allowed_actions: Object.keys(SHOPEE_DISCOUNT_MUTATIONS), dry_run: true, sent_to_shopee: false }
    }
    const validationErrors = discountValidationErrors(action, payload)
    if (!shopFilter) validationErrors.push('shop is required')
    if (validationErrors.length) {
      const result = buildShopeeActionResult({
        ...base,
        ok: false,
        status: 'error',
        payload,
        dry_run: true,
        message: validationErrors.join('; '),
        verify_result: { validation_errors: validationErrors }
      })
      await saveDiscountAction(env, result)
      return result
    }
    if (dryRun || !confirmed) {
      const needsConfirmation = !dryRun && !confirmed
      const result = buildShopeeActionResult({
        ...base,
        ok: false,
        status: 'preview',
        payload,
        dry_run: true,
        sent_to_shopee: false,
        message: needsConfirmation
          ? 'Chưa gửi lên Shopee vì lệnh thật thiếu xác nhận hợp lệ.'
          : 'Preview payload Discount Shopee. Chưa gọi mutation và chưa có verify refetch.',
        verify_result: {
          confirmation_required: needsConfirmation
            ? (cleanText(internalRule.mode) === 'stock_threshold_price_rule' ? DISCOUNT_STOCK_RULE_CONFIRM : DISCOUNT_CONFIRM_TEXT)
            : '',
          internal_rule: internalRule
        }
      })
      await saveDiscountAction(env, result)
      return result
    }
    const liveWriteGuard = isShopeeDiscountLiveWriteEnabled(env) ? null : assertShopeeLiveWriteAllowed(env, 'marketplace_client')
    if (liveWriteGuard) {
      const result = buildShopeeActionResult({
        ...base,
        ...liveWriteGuard,
        ok: false,
        status: 'error',
        payload,
        dry_run: true,
        sent_to_shopee: false,
        message: liveWriteGuard.message
      })
      await saveDiscountAction(env, result)
      return result
    }

    const shops = await getApiShops(env, 'shopee', shopFilter, 1)
    const shop = shops[0]
    if (!shop) {
      return errorResult(base, payload, { message: 'Không tìm thấy shop Shopee API tương ứng.', error: 'shop_not_found' })
    }
    base.shop = shop.shop_name || shop.user_name || String(shop.api_shop_id || '')
    base.api_shop_id = String(shop.api_shop_id || '')
    base.shop_id = String(shop.api_shop_id || '')

    const preflight = await preflightDiscountModelMapping(env, shop, action, payload).catch(error => ({
      status: 'error',
      error: 'preflight_refetch_failed',
      message: error?.message || String(error),
      raw_error: error?.shopee || null
    }))
    if (preflight) {
      const result = buildShopeeActionResult({
        ...base,
        ok: false,
        status: 'error',
        payload,
        raw_error: preflight.raw_error || preflight,
        message: preflight.message,
        verify_result: preflight.verify_result || preflight
      })
      await saveDiscountAction(env, result)
      return result
    }

    try {
      const response = await fetchShopeeShopJsonPost(env, shop, endpoint, payload)
      if (shopeeResponseHasBusinessError(response)) {
        const result = buildShopeeActionResult({
          ...base,
          ok: false,
          status: 'error',
          payload,
          sent_to_shopee: true,
          raw_response: response,
          message: 'Shopee từ chối một phần hoặc toàn bộ thao tác. Xem error_list trong raw_response.'
        })
        await saveDiscountItemWriteback(env, base, payload, result, { reason: 'business_error' }).catch(() => {})
        await saveDiscountAction(env, result)
        return result
      }
      const verifyResult = await verifyDiscountMutation(env, shop, action, payload, response)
      const result = buildShopeeActionResult({
        ...base,
        ok: true,
        status: verifyResult.verified ? 'ok' : 'readback_mismatch',
        write_status: verifyResult.verified ? 'success' : 'readback_mismatch',
        promotion_sync_status: verifyResult.verified ? 'synced' : 'readback_mismatch',
        write_source: 'shopee_open_platform',
        readback_source: 'shopee_open_platform',
        payload,
        confirmation_mode: confirmationMode,
        sent_to_shopee: true,
        raw_response: response,
        verified: verifyResult.verified,
        verify_result: verifyResult,
        message: verifyResult.verified
          ? 'Đã gọi Shopee Discount API thật và refetch xác nhận thay đổi.'
          : 'Shopee đã nhận request nhưng refetch chưa xác nhận thay đổi, không được xem là thành công.'
      })
      await saveDiscountItemWriteback(env, base, payload, result, verifyResult)
      await saveDiscountAction(env, result)
      return result
    } catch (error) {
      const result = errorResult(base, payload, error)
      await saveDiscountItemWriteback(env, base, payload, result, { reason: 'api_error' }).catch(() => {})
      await saveDiscountAction(env, result)
      return result
    }
  }
  core.executeShopeeDiscountAction = executeShopeeDiscountAction
}
