import { assertShopeeLiveWriteAllowed } from '../../../../features/shopee/api/baseClient.js'

export function installDiscountsShopeePromotionsActions(core) {
  const DISCOUNT_CONFIRM_TEXT = core.DISCOUNT_CONFIRM_TEXT
  const SHOPEE_PROMOTION_MUTATIONS = core.SHOPEE_PROMOTION_MUTATIONS
  const buildShopeeActionResult = (...args) => core.buildShopeeActionResult(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const compactJson = (...args) => core.compactJson(...args)
  const fetchShopeeShopJsonGet = (...args) => core.fetchShopeeShopJsonGet(...args)
  const fetchShopeeShopJsonPost = (...args) => core.fetchShopeeShopJsonPost(...args)
  const getApiShops = core.getApiShops
  const saveDiscountAction = (...args) => core.saveDiscountAction(...args)
  const shopeeResponseHasBusinessError = (...args) => core.shopeeResponseHasBusinessError(...args)

  const MODULE_META = {
    voucher: {
      idKey: 'voucher_id',
      detailPath: core.SHOPEE_VOUCHER_DETAIL_PATH,
      detailParams: id => ({ voucher_id: id })
    },
    bundle_deal: {
      idKey: 'bundle_deal_id',
      detailPath: core.SHOPEE_BUNDLE_DEAL_DETAIL_PATH,
      detailParams: id => ({ bundle_deal_id: id })
    },
    add_on_deal: {
      idKey: 'add_on_deal_id',
      detailPath: core.SHOPEE_ADD_ON_DEAL_DETAIL_PATH,
      detailParams: id => ({ add_on_deal_id: id })
    },
    shop_flash_sale: {
      idKey: 'flash_sale_id',
      detailPath: core.SHOPEE_SHOP_FLASH_SALE_DETAIL_PATH,
      detailParams: id => ({ flash_sale_id: id })
    }
  }

  function normalizePromotionModule(module = '') {
    const value = cleanText(module).toLowerCase()
    if (value === 'vouchers') return 'voucher'
    if (value === 'shop_flashsale' || value === 'flash_sale') return 'shop_flash_sale'
    return value
  }

  function promotionIdFromPayload(module, payload = {}, response = {}) {
    const key = MODULE_META[module]?.idKey
    const responseBody = response?.response && typeof response.response === 'object' ? response.response : {}
    return cleanText(payload?.[key] || responseBody?.[key] || responseBody?.program_id || payload?.program_id || payload?.promotion_id)
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
        if (!['voucher_id', 'bundle_deal_id', 'add_on_deal_id', 'flash_sale_id', 'status'].includes(key)) delete data[key]
      }
      delete data.status
    }
    return data
  }

  function statusText(value = '') {
    return cleanText(value).toLowerCase()
  }

  function validatePromotionAction(module, action, payload = {}) {
    const errors = []
    const idKey = MODULE_META[module]?.idKey
    const currentStatus = statusText(payload.status || payload.time_status || payload.promotion_status)
    if (['delete', 'end', 'update'].includes(action) && !cleanText(payload[idKey])) errors.push(`${idKey} is required`)
    if (action === 'delete' && ['ongoing', 'active', 'running', 'enabled'].includes(currentStatus)) {
      errors.push('Không xóa chương trình đang chạy nếu chưa có allowlist/xác nhận riêng. Hãy dùng end nếu Shopee hỗ trợ trạng thái này.')
    }
    if (module === 'shop_flash_sale' && action === 'add' && !cleanText(payload.timeslot_id)) {
      errors.push(`create_shop_flash_sale cần timeslot_id thật từ ${core.SHOPEE_SHOP_FLASH_SALE_TIME_SLOT_PATH}; không được tự nhập start_time/end_time thay cho timeslot_id.`)
    }
    if (module === 'shop_flash_sale' && ['add_item', 'update_item'].includes(action) && !Array.isArray(payload.item_list)) {
      errors.push('item_list is required for Flash Sale item mutation')
    }
    return errors
  }

  async function fetchPromotionDetail(env, shop, module, objectId) {
    const meta = MODULE_META[module]
    if (!meta?.detailPath || !objectId) return null
    const data = await fetchShopeeShopJsonGet(env, shop, meta.detailPath, meta.detailParams(objectId))
    return {
      endpoint: meta.detailPath,
      request_id: cleanText(data?.request_id),
      response: data?.response || {},
      raw_response: data
    }
  }

  function verifyPromotionStatus(module, action, objectId, detail) {
    const response = detail?.response || {}
    const rawStatus = statusText(response.status || response.promotion_status || response.time_status || response.type)
    const endTime = Number(response.end_time || 0)
    const endedByTime = endTime > 0 && endTime <= Math.floor(Date.now() / 1000)
    if (action === 'end') {
      return {
        verified: ['ended', 'expired', 'finish', 'finished', 'deleted'].includes(rawStatus) || endedByTime,
        object_id: objectId,
        status: rawStatus,
        end_time: endTime,
        detail_endpoint: detail?.endpoint,
        detail_request_id: detail?.request_id
      }
    }
    return {
      verified: Boolean(response && Object.keys(response).length),
      object_id: objectId,
      status: rawStatus,
      detail_endpoint: detail?.endpoint,
      detail_request_id: detail?.request_id
    }
  }

  async function verifyPromotionMutation(env, shop, module, action, payload, response) {
    const objectId = promotionIdFromPayload(module, payload, response)
    if (!objectId) return { verified: false, reason: 'missing_object_id_for_refetch' }
    if (action === 'delete') {
      try {
        const detail = await fetchPromotionDetail(env, shop, module, objectId)
        return {
          verified: false,
          reason: 'object_still_exists_after_delete_refetch',
          object_id: objectId,
          detail
        }
      } catch (error) {
        return {
          verified: true,
          reason: 'detail_not_found_after_delete',
          object_id: objectId,
          refetch_error: error?.shopee || { message: error?.message || String(error) }
        }
      }
    }
    const detail = await fetchPromotionDetail(env, shop, module, objectId)
    return verifyPromotionStatus(module, action, objectId, detail)
  }

  function buildPromotionError(base, payload, error, extra = {}) {
    return buildShopeeActionResult({
      ...base,
      ...extra,
      ok: false,
      status: 'error',
      payload,
      raw_error: error?.shopee || error || { message: error?.message || String(error) }
    })
  }

  async function executeShopeePromotionAction(env, options = {}) {
    const module = normalizePromotionModule(options.module)
    const action = cleanText(options.action).toLowerCase()
    const endpoint = SHOPEE_PROMOTION_MUTATIONS?.[module]?.[action]
    const shopFilter = cleanText(options.shop)
    const dryRun = !(options.execute === true || String(options.execute).toLowerCase() === 'true')
    const rawPayload = options.payload && typeof options.payload === 'object' ? options.payload : {}
    const payload = normalizePromotionPayload(module, action, rawPayload)
    const confirmed = cleanText(options.confirm) === DISCOUNT_CONFIRM_TEXT
    const base = {
      mode: 'shopee_promotion_live_action',
      module,
      action,
      endpoint,
      shop: shopFilter,
      object_id: promotionIdFromPayload(module, payload)
    }

    if (!endpoint) {
      return { ...base, status: 'error', error: 'invalid_action', allowed_actions: Object.keys(SHOPEE_PROMOTION_MUTATIONS?.[module] || {}) }
    }
    const validationErrors = validatePromotionAction(module, action, {
      ...payload,
      status: rawPayload.status || rawPayload.time_status || rawPayload.promotion_status
    })
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
      const result = buildShopeeActionResult({
        ...base,
        ok: false,
        status: 'preview',
        payload,
        dry_run: true,
        sent_to_shopee: false,
        message: dryRun
          ? 'Preview payload khuyến mãi Shopee. Chưa gọi mutation và chưa có verify refetch.'
          : 'Chưa gửi lên Shopee vì thiếu xác nhận hợp lệ.',
        verify_result: { confirmation_required: dryRun ? '' : DISCOUNT_CONFIRM_TEXT }
      })
      await saveDiscountAction(env, result)
      return result
    }
    const liveWriteGuard = assertShopeeLiveWriteAllowed(env, 'marketplace_client')
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
    if (!shop) return buildPromotionError(base, payload, { error: 'shop_not_found', message: 'Không tìm thấy shop Shopee API tương ứng.' })
    base.shop = shop.shop_name || shop.user_name || String(shop.api_shop_id || '')
    base.shop_id = String(shop.api_shop_id || '')
    base.api_shop_id = String(shop.api_shop_id || '')

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
          message: 'Shopee từ chối một phần hoặc toàn bộ thao tác. Xem raw_response/error_list.'
        })
        await saveDiscountAction(env, result)
        return result
      }
      const verifyResult = await verifyPromotionMutation(env, shop, module, action, payload, response)
      const result = buildShopeeActionResult({
        ...base,
        object_id: verifyResult.object_id || base.object_id,
        ok: true,
        status: verifyResult.verified ? 'ok' : 'error',
        payload,
        sent_to_shopee: true,
        raw_response: response,
        verified: verifyResult.verified,
        verify_result: verifyResult,
        message: verifyResult.verified
          ? 'Đã gọi Shopee Promotion API thật và refetch xác nhận thay đổi.'
          : 'Shopee đã nhận request nhưng refetch chưa xác nhận thay đổi, không được xem là thành công.'
      })
      await saveDiscountAction(env, result)
      return result
    } catch (error) {
      const result = buildPromotionError(base, payload, error)
      await saveDiscountAction(env, result)
      return result
    }
  }

  core.executeShopeePromotionAction = executeShopeePromotionAction
}
