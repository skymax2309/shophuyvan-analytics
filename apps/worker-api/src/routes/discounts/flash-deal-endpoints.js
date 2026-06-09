import { assertShopeeLiveWriteAllowed, callShopeeApi } from '../../features/shopee/api/baseClient.js'

export const FLASH_DEAL_ENDPOINTS = {
  timeslots: '/api/v2/shop_flash_sale/get_time_slot_id',
  list: '/api/v2/shop_flash_sale/get_shop_flash_sale_list',
  itemCriteria: '/api/v2/shop_flash_sale/get_item_criteria',
  create: '/api/v2/shop_flash_sale/create_shop_flash_sale',
  delete: '/api/v2/shop_flash_sale/delete_shop_flash_sale',
  addItems: '/api/v2/shop_flash_sale/add_shop_flash_sale_items',
  updateItems: '/api/v2/shop_flash_sale/update_shop_flash_sale_items',
  deleteItems: '/api/v2/shop_flash_sale/delete_shop_flash_sale_items',
  getItems: '/api/v2/shop_flash_sale/get_shop_flash_sale_items'
}

const SHOPEE_FLASH_ITEM_LIMIT_SAFE = 20

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function numericId(value) {
  const text = cleanText(value)
  if (!/^\d+$/.test(text)) return text
  const number = Number(text)
  return Number.isSafeInteger(number) ? number : text
}

function buildShopFlashSaleItems(items = []) {
  const grouped = new Map()
  for (const item of (Array.isArray(items) ? items : [])) {
    const row = item && typeof item === 'object' ? item : { item_id: item }
    const itemId = numericId(row.item_id || row.platform_item_id)
    const modelId = cleanText(row.model_id) ? numericId(row.model_id) : null
    const stock = Number(row.stock ?? row.promotion_stock ?? row.quantity ?? row.item_stock ?? 0) || 0
    const promoPrice = Number(row.flash_sale_price ?? row.flash_price ?? row.item_promotion_price ?? row.input_promo_price ?? row.promotion_price ?? 0) || 0
    if (!cleanText(itemId) || stock <= 0 || promoPrice <= 0) continue
    const entry = grouped.get(String(itemId)) || { item_id: itemId, purchase_limit: Number(row.purchase_limit || 0) || 0, models: [] }
    if (modelId) {
      delete entry.item_input_promo_price
      delete entry.item_stock
      entry.models.push({
        model_id: modelId,
        input_promo_price: promoPrice,
        stock
      })
    } else if (!entry.models.length) {
      const currentPrice = Number(entry.item_input_promo_price || 0)
      const nextPrice = currentPrice > 0 ? Math.min(currentPrice, promoPrice) : promoPrice
      entry.item_input_promo_price = promoPrice
      entry.item_stock = Math.max(Number(entry.item_stock || 0), stock)
      entry.item_input_promo_price = nextPrice
    }
    grouped.set(String(itemId), entry)
  }
  const normalized = Array.from(grouped.values()).map((entry) => {
    if (Array.isArray(entry.models) && entry.models.length) {
      const dedup = new Map()
      for (const model of entry.models) {
        const key = String(model.model_id || '')
        if (!key) continue
        const prev = dedup.get(key)
        if (!prev || Number(model.input_promo_price || 0) < Number(prev.input_promo_price || 0)) {
          dedup.set(key, {
            model_id: model.model_id,
            input_promo_price: Number(model.input_promo_price || 0),
            stock: Math.max(1, Number(model.stock || 0))
          })
        }
      }
      return {
        item_id: entry.item_id,
        purchase_limit: Number(entry.purchase_limit || 0) || 0,
        models: Array.from(dedup.values())
      }
    }
    return {
      item_id: entry.item_id,
      purchase_limit: Number(entry.purchase_limit || 0) || 0,
      item_input_promo_price: Number(entry.item_input_promo_price || 0),
      item_stock: Math.max(1, Number(entry.item_stock || 0))
    }
  })
  return normalized.filter((entry) => {
    if (Array.isArray(entry.models) && entry.models.length) return true
    return Number(entry.item_input_promo_price || 0) > 0 && Number(entry.item_stock || 0) > 0
  })
}

function countPayloadUnits(items = []) {
  return (Array.isArray(items) ? items : []).reduce((sum, entry) => {
    if (Array.isArray(entry?.models) && entry.models.length) return sum + entry.models.length
    return sum + 1
  }, 0)
}

function trimPayloadItemsByUnits(items = [], maxUnits = 0) {
  let remaining = Math.max(0, Number(maxUnits) || 0)
  if (remaining <= 0) return []
  const trimmed = []
  for (const entry of (Array.isArray(items) ? items : [])) {
    if (remaining <= 0) break
    if (Array.isArray(entry?.models) && entry.models.length) {
      const take = entry.models.slice(0, remaining)
      if (take.length) {
        trimmed.push({
          ...entry,
          models: take
        })
        remaining -= take.length
      }
      continue
    }
    trimmed.push(entry)
    remaining -= 1
  }
  return trimmed
}

function normalizeFailedItems(result = {}) {
  const response = result.response || result.raw_response?.response || result.raw_response || {}
  const rows = response.failed_items || response.fail_items || []
  return Array.isArray(rows) ? rows : []
}

function normalizeFlashItemsFromResponse(result = {}) {
  const response = result.response || result.raw_response?.response || result.raw_response || {}
  if (Array.isArray(response)) return response
  const itemList = Array.isArray(response.item_list) ? response.item_list : []
  const flatItems = Array.isArray(response.item_info) ? response.item_info : []
  const models = Array.isArray(response.models) ? response.models : []
  return itemList.length ? itemList : [...flatItems, ...models]
}

function buildExistingFlashItemIndex(items = []) {
  const keySet = new Set()
  for (const row of (Array.isArray(items) ? items : [])) {
    const itemId = cleanText(row?.item_id)
    if (!itemId) continue
    const modelId = cleanText(row?.model_id)
    if (modelId) {
      keySet.add(`${itemId}#${modelId}`)
      continue
    }
    const models = Array.isArray(row?.models) ? row.models : []
    if (models.length) {
      for (const model of models) {
        const childModelId = cleanText(model?.model_id)
        if (childModelId) keySet.add(`${itemId}#${childModelId}`)
      }
    } else {
      keySet.add(`${itemId}#`)
    }
  }
  return keySet
}

function filterExistingFlashItems(payloadItems = [], existingKeySet = new Set()) {
  const result = []
  for (const item of (Array.isArray(payloadItems) ? payloadItems : [])) {
    const itemId = cleanText(item?.item_id)
    if (!itemId) continue
    if (Array.isArray(item?.models) && item.models.length) {
      const models = item.models.filter((model) => !existingKeySet.has(`${itemId}#${cleanText(model?.model_id)}`))
      if (models.length) {
        result.push({
          ...item,
          models
        })
      }
      continue
    }
    if (existingKeySet.has(`${itemId}#`)) continue
    result.push(item)
  }
  return result
}

async function shopeeApiCall(env, options = {}) {
  return callShopeeApi(env, {
    clientType: 'marketplace_client',
    shopId: cleanText(options.shopId),
    accessToken: cleanText(options.token),
    shopRow: options.shopRow || {},
    path: options.path,
    method: options.method || 'GET',
    params: options.params || {},
    body: options.body || {}
  })
}

export function assertFlashDealLiveWriteAllowed(env) {
  return assertShopeeLiveWriteAllowed(env, 'marketplace_client')
}

export async function getFlashDealTimeSlots(env, shopId, token, params = {}, shopRow = {}) {
  const now = Math.floor(Date.now() / 1000)
  const safeStart = now + 120
  const startCandidate = Number(params.start_time || params.start || safeStart)
  const startTime = Number.isFinite(startCandidate) && startCandidate > 0 ? Math.floor(startCandidate) : safeStart
  const endCandidate = Number(params.end_time || params.end || (startTime + 7 * 24 * 60 * 60))
  const endTime = Number.isFinite(endCandidate) && endCandidate > startTime
    ? Math.floor(endCandidate)
    : (startTime + 7 * 24 * 60 * 60)
  return shopeeApiCall(env, {
    shopId,
    token,
    shopRow,
    path: FLASH_DEAL_ENDPOINTS.timeslots,
    method: 'GET',
    params: {
      start_time: startTime,
      end_time: endTime
    }
  })
}

export async function getFlashDealItemCriteria(env, shopId, token, params = {}, shopRow = {}) {
  return shopeeApiCall(env, {
    shopId,
    token,
    shopRow,
    path: FLASH_DEAL_ENDPOINTS.itemCriteria,
    method: 'GET',
    params: params || {}
  })
}

function isFlashSaleAlreadyExists(error) {
  const mappedMessage = cleanText(error?.shopee?.message || '').toLowerCase()
  const mappedCode = cleanText(error?.shopee?.code || error?.shopee?.error || '').toLowerCase()
  const plainMessage = cleanText(error?.message || '').toLowerCase()
  return mappedMessage.includes('already exist')
    || plainMessage.includes('already exist')
    || mappedCode.includes('already_exist')
}

async function findExistingFlashSaleId(env, shopId, token, timeslotId, shopRow = {}) {
  const result = await shopeeApiCall(env, {
    shopId,
    token,
    shopRow,
    path: FLASH_DEAL_ENDPOINTS.list,
    method: 'GET',
    params: {
      type: 1,
      offset: 0,
      limit: 100
    }
  })
  const list = result?.response?.flash_sale_list || result?.raw_response?.response?.flash_sale_list || []
  const hit = (Array.isArray(list) ? list : []).find((row) => String(row?.timeslot_id || '') === String(timeslotId || ''))
  return numericId(hit?.flash_sale_id || '')
}

export async function addFlashDealItems(env, shopId, token, timeslotId, items = [], shopRow = {}) {
  let payloadItems = buildShopFlashSaleItems(items)
  if (!payloadItems.length) {
    throw Object.assign(new Error('Khong co SKU hop le de day Flash Sale.'), {
      shopee: {
        category: 'invalid_payload',
        code: 'empty_item_payload',
        message: 'Khong co SKU hop le (gia/ton) de gui len Shopee Flash Sale.'
      }
    })
  }
  let createResult = null
  let createdNewFlashSale = false
  let flashSaleId = await findExistingFlashSaleId(env, shopId, token, numericId(timeslotId), shopRow)
  if (!cleanText(flashSaleId)) {
    try {
      createResult = await shopeeApiCall(env, {
        shopId,
        token,
        shopRow,
        path: FLASH_DEAL_ENDPOINTS.create,
        method: 'POST',
        body: { timeslot_id: numericId(timeslotId) }
      })
      flashSaleId = numericId(
        createResult?.response?.flash_sale_id ||
        createResult?.raw_response?.response?.flash_sale_id ||
        createResult?.response?.id
      )
      createdNewFlashSale = true
    } catch (error) {
      if (!isFlashSaleAlreadyExists(error)) throw error
      flashSaleId = await findExistingFlashSaleId(env, shopId, token, numericId(timeslotId), shopRow)
      createResult = { reused_existing_flash_sale: true }
    }
  } else {
    createResult = { reused_existing_flash_sale: true }
  }
  if (!cleanText(flashSaleId)) {
    throw Object.assign(new Error('Khong lay duoc flash_sale_id tu Shopee sau khi tao Flash Sale.'), {
      shopee: {
        category: 'invalid_payload',
        code: 'missing_flash_sale_id',
        message: 'Shopee khong tra flash_sale_id hop le.',
        raw_response: createResult?.raw_response || {}
      }
    })
  }

  let existingUnitCount = 0
  try {
    const existingResult = await getFlashDealItems(env, shopId, token, flashSaleId, shopRow)
    const existingItems = normalizeFlashItemsFromResponse(existingResult)
    const existingKeySet = buildExistingFlashItemIndex(existingItems)
    existingUnitCount = existingKeySet.size
    payloadItems = filterExistingFlashItems(payloadItems, existingKeySet)
  } catch {
    // Skip duplicate pre-filter when readback is temporarily unavailable.
  }

  const platformRemainingUnits = Math.max(0, SHOPEE_FLASH_ITEM_LIMIT_SAFE - existingUnitCount)
  if (platformRemainingUnits <= 0) {
    throw Object.assign(new Error('Flash Sale nay da dat gioi han SKU/model toi da cua Shopee.'), {
      shopee: {
        category: 'invalid_payload',
        code: 'flash_sale_item_limit_reached',
        message: `Flash Sale da dat gioi han ${SHOPEE_FLASH_ITEM_LIMIT_SAFE} SKU/model cua Shopee.`,
        flash_sale_id: flashSaleId,
        created_new_flash_sale: createdNewFlashSale,
        create_result: createResult?.raw_response || {},
        existing_units: existingUnitCount,
        safe_limit_units: SHOPEE_FLASH_ITEM_LIMIT_SAFE
      }
    })
  }
  payloadItems = trimPayloadItemsByUnits(payloadItems, platformRemainingUnits)

  if (!payloadItems.length) {
    throw Object.assign(new Error('Tat ca SKU/model da ton tai trong Flash Sale nay.'), {
      shopee: {
        category: 'invalid_payload',
        code: 'all_items_already_exist',
        message: 'Tat ca SKU/model da ton tai trong Flash Sale, khong can them moi.',
        flash_sale_id: flashSaleId,
        created_new_flash_sale: createdNewFlashSale,
        create_result: createResult?.raw_response || {},
        existing_units: existingUnitCount,
        safe_limit_units: SHOPEE_FLASH_ITEM_LIMIT_SAFE
      }
    })
  }

  let addResult
  try {
    addResult = await shopeeApiCall(env, {
      shopId,
      token,
      shopRow,
      path: FLASH_DEAL_ENDPOINTS.addItems,
      method: 'POST',
      body: {
        flash_sale_id: flashSaleId,
        items: payloadItems,
        item_list: payloadItems
      }
    })
  } catch (error) {
    const wrapped = error instanceof Error
      ? error
      : new Error(cleanText(error?.message || 'Shopee khong xac nhan duoc thao tac add item Flash Sale.'))
    const mapped = wrapped?.shopee && typeof wrapped.shopee === 'object' ? { ...wrapped.shopee } : {}
    mapped.flash_sale_id = mapped.flash_sale_id || flashSaleId
    mapped.created_new_flash_sale = mapped.created_new_flash_sale ?? createdNewFlashSale
    mapped.create_result = mapped.create_result || createResult?.raw_response || {}
    mapped.existing_units = mapped.existing_units ?? existingUnitCount
    mapped.safe_limit_units = mapped.safe_limit_units ?? SHOPEE_FLASH_ITEM_LIMIT_SAFE
    wrapped.shopee = mapped
    throw wrapped
  }
  const payloadUnitCount = countPayloadUnits(payloadItems)
  const failedItems = normalizeFailedItems(addResult)
  const failedCount = failedItems.length
  const acceptedUnits = Math.max(0, payloadUnitCount - failedCount)
  if (acceptedUnits <= 0) {
    throw Object.assign(new Error('Shopee khong nhan SKU nao vao Flash Sale.'), {
      shopee: {
        category: 'invalid_payload',
        code: 'no_items_added',
        message: 'Shopee da tu choi toan bo SKU trong dot day Flash Sale.',
        raw_response: addResult?.raw_response || {},
        failed_items: failedItems,
        flash_sale_id: flashSaleId,
        created_new_flash_sale: createdNewFlashSale,
        create_result: createResult?.raw_response || {}
      }
    })
  }
  return {
    ...addResult,
    flash_sale_id: flashSaleId,
    created_new_flash_sale: createdNewFlashSale,
    create_result: createResult?.raw_response || {},
    existing_units: existingUnitCount,
    safe_limit_units: SHOPEE_FLASH_ITEM_LIMIT_SAFE,
    payload_units: payloadUnitCount,
    failed_units: failedCount,
    accepted_units: acceptedUnits,
    failed_items: failedItems
  }
}

export async function deleteFlashDeal(env, shopId, token, flashSaleId, shopRow = {}) {
  const normalizedId = numericId(flashSaleId)
  if (!cleanText(normalizedId)) {
    throw Object.assign(new Error('Khong co flash_sale_id hop le de xoa Flash Sale.'), {
      shopee: {
        category: 'invalid_payload',
        code: 'missing_flash_sale_id',
        message: 'Can flash_sale_id hop le de xoa Flash Sale.'
      }
    })
  }
  return shopeeApiCall(env, {
    shopId,
    token,
    shopRow,
    path: FLASH_DEAL_ENDPOINTS.delete,
    method: 'POST',
    body: { flash_sale_id: normalizedId }
  })
}

async function resolveFlashSaleId(env, shopId, token, flashSaleIdOrTimeslotId, shopRow = {}) {
  const candidate = cleanText(flashSaleIdOrTimeslotId)
  if (!candidate) return ''
  const resolved = await findExistingFlashSaleId(env, shopId, token, candidate, shopRow)
  if (cleanText(resolved)) return numericId(resolved)
  return numericId(candidate)
}

export async function updateFlashDealItems(env, shopId, token, flashSaleIdOrTimeslotId, items = [], shopRow = {}) {
  const payloadItems = buildShopFlashSaleItems(items)
  if (!payloadItems.length) {
    throw Object.assign(new Error('Khong co SKU hop le de cap nhat Flash Sale.'), {
      shopee: {
        category: 'invalid_payload',
        code: 'empty_item_payload',
        message: 'Khong co SKU hop le (gia/ton) de cap nhat Shopee Flash Sale.'
      }
    })
  }
  const flashSaleId = await resolveFlashSaleId(env, shopId, token, flashSaleIdOrTimeslotId, shopRow)
  if (!cleanText(flashSaleId)) {
    throw Object.assign(new Error('Khong resolve duoc flash_sale_id cho update Flash Deal.'), {
      shopee: {
        category: 'invalid_payload',
        code: 'missing_flash_sale_id',
        message: 'Can flash_sale_id hoac timeslot_id hop le de update.'
      }
    })
  }
  return shopeeApiCall(env, {
    shopId,
    token,
    shopRow,
    path: FLASH_DEAL_ENDPOINTS.updateItems,
    method: 'POST',
    body: { flash_sale_id: flashSaleId, items: payloadItems, item_list: payloadItems }
  })
}

export async function deleteFlashDealItems(env, shopId, token, flashSaleIdOrTimeslotId, itemIds = [], shopRow = {}) {
  const flashSaleId = await resolveFlashSaleId(env, shopId, token, flashSaleIdOrTimeslotId, shopRow)
  if (!cleanText(flashSaleId)) {
    throw Object.assign(new Error('Khong resolve duoc flash_sale_id cho delete Flash Deal.'), {
      shopee: {
        category: 'invalid_payload',
        code: 'missing_flash_sale_id',
        message: 'Can flash_sale_id hoac timeslot_id hop le de xoa item.'
      }
    })
  }
  return shopeeApiCall(env, {
    shopId,
    token,
    shopRow,
    path: FLASH_DEAL_ENDPOINTS.deleteItems,
    method: 'POST',
    body: { flash_sale_id: flashSaleId, item_id_list: (Array.isArray(itemIds) ? itemIds : []).map(numericId).filter(Boolean) }
  })
}

export async function getFlashDealItems(env, shopId, token, flashSaleId, shopRow = {}) {
  return shopeeApiCall(env, {
    shopId,
    token,
    shopRow,
    path: FLASH_DEAL_ENDPOINTS.getItems,
    method: 'GET',
    params: { flash_sale_id: numericId(flashSaleId), offset: 0, limit: 100 }
  })
}

function publicError(error) {
  const mapped = error?.shopee || {}
  return {
    status: 'error',
    category: mapped.category || 'shopee_api_error',
    code: mapped.code || mapped.error || '',
    message: mapped.message || error?.message || 'Shopee chưa xác nhận thao tác Flash Sale.',
    request_id: mapped.request_id || ''
  }
}

function normalizeSlotRows(result = {}) {
  const response = result.response || result.raw_response?.response || result.raw_response || {}
  if (Array.isArray(response)) return response
  return response.time_slot_list || response.timeslot_list || response.slot_list || response.slots || []
}

function normalizeFlashItems(result = {}) {
  const response = result.response || result.raw_response?.response || result.raw_response || {}
  if (Array.isArray(response)) return response
  const itemList = Array.isArray(response.item_list) ? response.item_list : []
  const flatItems = Array.isArray(response.item_info) ? response.item_info : []
  const models = Array.isArray(response.models) ? response.models : []
  return itemList.length ? itemList : [...flatItems, ...models]
}

export function installDiscountsFlashDealEndpoints(core) {
  const oldHandleDiscounts = core.handleDiscounts
  const getApiShops = core.getApiShops
  const getAdminUserFromRequest = core.getAdminUserFromRequest
  const isPromotionApplyAdmin = typeof core.isPromotionApplyAdmin === 'function'
    ? (...args) => core.isPromotionApplyAdmin(...args)
    : (user) => user?.role === 'admin'
  const json = (...args) => core.json(...args)

  async function loadShop(env, shopName) {
    const shops = await getApiShops(env, 'shopee', cleanText(shopName), 1)
    return shops?.[0] || null
  }

  core.handleDiscounts = async function handleFlashDealEndpoints(request, env, cors) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    if (url.pathname === '/api/discounts/flash-deal/timeslots') {
      const requestedShop = url.searchParams.get('shop')
      const shop = await loadShop(env, requestedShop)
      if (!shop) return json({ status: 'error', message: 'Không tìm thấy shop Shopee API.' }, cors, 404)
      try {
        const result = await getFlashDealTimeSlots(env, shop.api_shop_id, shop.access_token, {
          start_time: url.searchParams.get('start_time'),
          end_time: url.searchParams.get('end_time')
        }, shop)
        return json({
          status: 'ok',
          shop: shop.shop_name || shop.user_name || requestedShop,
          timeslots: normalizeSlotRows(result),
          request_id: result.request_id || ''
        }, cors)
      } catch (error) {
        return json(publicError(error), cors, 400)
      }
    }

    if (url.pathname === '/api/discounts/flash-deal/items/add') {
      if (request.method !== 'POST') return json({ status: 'error', message: 'Phuong thuc khong ho tro.' }, cors, 405)
      const user = await getAdminUserFromRequest(request, env)
      if (!isPromotionApplyAdmin(user)) {
        return json({ status: 'error', error: 'admin_required', message: 'Chi tai khoan admin duoc day Flash Sale that len san.' }, cors, 403)
      }
      const body = await request.json().catch(() => ({}))
      const guard = assertFlashDealLiveWriteAllowed(env)
      if (guard) return json({ ...guard, live_write_sent: false }, cors, 403)
      const shop = await loadShop(env, body.shop || body.shop_id)
      if (!shop) return json({ status: 'error', message: 'Không tìm thấy shop Shopee API.' }, cors, 404)
      try {
        const result = await addFlashDealItems(env, shop.api_shop_id, shop.access_token, body.timeslot_id, body.items || body.item_list || [], shop)
        return json({ status: 'ok', live_write_sent: true, result }, cors)
      } catch (error) {
        return json({ ...publicError(error), live_write_sent: false }, cors, 400)
      }
    }

    if (url.pathname === '/api/discounts/flash-deal/items') {
      const shop = await loadShop(env, url.searchParams.get('shop'))
      if (!shop) return json({ status: 'error', message: 'Không tìm thấy shop Shopee API.' }, cors, 404)
      try {
        const rawFlashSaleId = cleanText(url.searchParams.get('flash_sale_id'))
        const rawTimeslotId = cleanText(url.searchParams.get('timeslot_id'))
        let flashSaleId = rawFlashSaleId
        if (!flashSaleId && rawTimeslotId) {
          flashSaleId = await findExistingFlashSaleId(env, shop.api_shop_id, shop.access_token, rawTimeslotId, shop)
        }
        if (!cleanText(flashSaleId)) {
          return json({
            status: 'error',
            category: 'invalid_payload',
            code: 'missing_flash_sale_id',
            message: 'Can flash_sale_id hop le (hoac timeslot_id co the resolve).'
          }, cors, 400)
        }
        const result = await getFlashDealItems(env, shop.api_shop_id, shop.access_token, flashSaleId, shop)
        return json({
          status: 'ok',
          shop: shop.shop_name || shop.user_name || url.searchParams.get('shop'),
          flash_sale_id: flashSaleId,
          items: normalizeFlashItems(result),
          request_id: result.request_id || ''
        }, cors)
      } catch (error) {
        return json(publicError(error), cors, 400)
      }
    }

    return oldHandleDiscounts(request, env, cors)
  }
}
