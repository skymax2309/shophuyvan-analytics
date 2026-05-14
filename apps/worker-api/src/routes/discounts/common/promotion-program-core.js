export function installDiscountsCommonPromotionProgramCore(core) {
  const cleanText = (...args) => core.cleanText(...args)
  const compactJson = (...args) => core.compactJson(...args)
  const ensureShopeeDiscountTables = (...args) => core.ensureShopeeDiscountTables(...args)
  const firstVoucherValue = (...args) => core.firstVoucherValue(...args)
  const inferVoucherStatus = (...args) => core.inferVoucherStatus(...args)
  const lazadaApiShopId = (...args) => core.lazadaApiShopId(...args)
  const lazadaShopName = (...args) => core.lazadaShopName(...args)
  const lazadaVoucherStatusParam = (...args) => core.lazadaVoucherStatusParam(...args)
  const normalizeLazadaVoucherStatus = (...args) => core.normalizeLazadaVoucherStatus(...args)
  const num = (...args) => core.num(...args)
  const round2 = (...args) => core.round2(...args)
  const voucherShopName = (...args) => core.voucherShopName(...args)

  function promotionStatusFromTime(rawStatus, startTime, endTime) {
    const text = cleanText(rawStatus).toLowerCase()
    if (['ongoing', 'upcoming', 'expired', 'suspended', 'enabled', 'disabled', 'deleted', 'rejected'].includes(text)) return text
    if (['not_start', 'not start'].includes(text)) return 'upcoming'
    if (['finish', 'finished'].includes(text)) return 'expired'
    return inferVoucherStatus('', 'all', startTime, endTime)
  }
  core.promotionStatusFromTime = promotionStatusFromTime

  function shopeeTimeStatus(value) {
    const status = cleanText(value).toLowerCase()
    if (['upcoming', 'not_start'].includes(status)) return 2
    if (status === 'ongoing') return 3
    if (['expired', 'finish', 'finished'].includes(status)) return 4
    return 1
  }
  core.shopeeTimeStatus = shopeeTimeStatus

  function shopeePromotionStatus(value) {
    const status = cleanText(value).toLowerCase()
    return ['upcoming', 'ongoing', 'expired'].includes(status) ? status : 'all'
  }
  core.shopeePromotionStatus = shopeePromotionStatus

  function shopeeFlashSaleType(value) {
    const status = cleanText(value).toLowerCase()
    if (['upcoming', 'not_start'].includes(status)) return 1
    if (status === 'ongoing') return 2
    if (['expired', 'finish', 'finished'].includes(status)) return 3
    return 0
  }
  core.shopeeFlashSaleType = shopeeFlashSaleType

  function shopeeFlashStatus(value) {
    const n = Math.round(num(value))
    if (n === 0) return 'deleted'
    if (n === 1) return 'enabled'
    if (n === 2) return 'disabled'
    if (n === 3) return 'rejected'
    return ''
  }
  core.shopeeFlashStatus = shopeeFlashStatus

  function shopeeFlashTypeStatus(value, startTime, endTime) {
    const n = Math.round(num(value))
    if (n === 1) return 'upcoming'
    if (n === 2) return 'ongoing'
    if (n === 3) return 'expired'
    return promotionStatusFromTime('', startTime, endTime)
  }
  core.shopeeFlashTypeStatus = shopeeFlashTypeStatus

  function lazadaPromotionStatus(value, row = {}) {
    return normalizeLazadaVoucherStatus(value, {
      period_start_time: firstVoucherValue(row, 'period_start_time', 'periodStartTime', 'start_time', 'startTime'),
      period_end_time: firstVoucherValue(row, 'period_end_time', 'periodEndTime', 'end_time', 'endTime')
    })
  }
  core.lazadaPromotionStatus = lazadaPromotionStatus

  function lazadaPromotionStatusParam(value) {
    return lazadaVoucherStatusParam(value)
  }
  core.lazadaPromotionStatusParam = lazadaPromotionStatusParam

  function safeProgramName(row = {}, ...keys) {
    return cleanText(firstVoucherValue(row, ...keys, 'name', 'promotion_name', 'promotionName'))
  }
  core.safeProgramName = safeProgramName

  function makePromotionProgram({ platform, shop, module, id, name, status, startTime, endTime, budget = 0, usedBudget = 0, currency = '', itemCount = 0, row = {}, detail = {}, requestId = '' }) {
    return {
      platform,
      shop: platform === 'lazada' ? lazadaShopName(shop) : voucherShopName(shop),
      api_shop_id: platform === 'lazada' ? lazadaApiShopId(shop) : String(shop.api_shop_id || ''),
      module,
      program_id: cleanText(id),
      program_name: cleanText(name),
      status: cleanText(status).toLowerCase(),
      start_time: Math.round(num(startTime)),
      end_time: Math.round(num(endTime)),
      budget: round2(budget),
      used_budget: round2(usedBudget),
      currency: cleanText(currency),
      item_count: Math.round(num(itemCount)),
      raw_data: compactJson(row, 16000),
      detail_raw_data: compactJson(detail, 26000),
      request_id: cleanText(requestId)
    }
  }
  core.makePromotionProgram = makePromotionProgram

  function makePromotionItem({ platform, shop, module, programId, programName, role = '', row = {}, itemId = '', modelId = '', skuId = '', sku = '', itemName = '', modelName = '', status = '', originalPrice = 0, promotionPrice = 0, stock = 0, campaignStock = 0, purchaseLimit = 0 }) {
    return {
      platform,
      shop: platform === 'lazada' ? lazadaShopName(shop) : voucherShopName(shop),
      api_shop_id: platform === 'lazada' ? lazadaApiShopId(shop) : String(shop.api_shop_id || ''),
      module,
      program_id: cleanText(programId),
      program_name: cleanText(programName),
      item_role: cleanText(role),
      item_id: cleanText(itemId || firstVoucherValue(row, 'item_id', 'itemId', 'product_id', 'productId')),
      model_id: cleanText(modelId || firstVoucherValue(row, 'model_id', 'modelId')),
      sku_id: cleanText(skuId || firstVoucherValue(row, 'sku_id', 'skuId', 'sku_ids', 'skuIds')),
      sku: cleanText(sku || firstVoucherValue(row, 'seller_sku', 'SellerSku', 'sku')),
      item_name: cleanText(itemName || firstVoucherValue(row, 'item_name', 'itemName', 'product_name', 'productName')),
      model_name: cleanText(modelName || firstVoucherValue(row, 'model_name', 'modelName')),
      status: cleanText(status || firstVoucherValue(row, 'status', 'item_status', 'itemStatus')).toLowerCase(),
      original_price: round2(originalPrice || firstVoucherValue(row, 'original_price', 'originalPrice')),
      promotion_price: round2(promotionPrice || firstVoucherValue(row, 'input_promotion_price', 'promotion_price_with_tax', 'promotionPrice')),
      stock: Math.round(num(stock || firstVoucherValue(row, 'stock'))),
      campaign_stock: Math.round(num(campaignStock || firstVoucherValue(row, 'campaign_stock', 'campaignStock'))),
      purchase_limit: Math.round(num(purchaseLimit || firstVoucherValue(row, 'purchase_limit', 'purchaseLimit'))),
      raw_data: compactJson(row, 18000)
    }
  }
  core.makePromotionItem = makePromotionItem

  async function savePromotionPrograms(env, programs = [], items = [], options = {}) {
    await ensureShopeeDiscountTables(env)
    const platform = cleanText(options.platform || programs?.[0]?.platform || items?.[0]?.platform).toLowerCase()
    const module = cleanText(options.module || programs?.[0]?.module || items?.[0]?.module)
    const statusScope = cleanText(options.status || 'all').toLowerCase()
    const apiShopIds = [...new Set([...(programs || []), ...(items || [])].map(row => cleanText(row.api_shop_id)).filter(Boolean))]
    if (options.fullSync !== false && platform && module) {
      for (const apiShopId of apiShopIds) {
        const scopeSql = statusScope && statusScope !== 'all' ? ' AND LOWER(status) = ?' : ''
        const params = statusScope && statusScope !== 'all' ? [platform, apiShopId, module, statusScope] : [platform, apiShopId, module]
        await env.DB.prepare(`
          UPDATE marketplace_promotion_programs
          SET is_current = 0,
              updated_at = datetime('now', '+7 hours')
          WHERE platform = ? AND api_shop_id = ? AND module = ? ${scopeSql}
        `).bind(...params).run()
      }
    }

    let savedPrograms = 0
    for (const row of programs || []) {
      if (!row.program_id) continue
      await env.DB.prepare(`
        INSERT INTO marketplace_promotion_programs (
          platform, shop, api_shop_id, module, program_id, program_name, status,
          start_time, end_time, budget, used_budget, currency, item_count, is_current,
          raw_data, detail_raw_data, request_id, synced_at, updated_at
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,datetime('now', '+7 hours'),datetime('now', '+7 hours'))
        ON CONFLICT(platform, api_shop_id, module, program_id) DO UPDATE SET
          shop = excluded.shop,
          program_name = COALESCE(NULLIF(excluded.program_name, ''), marketplace_promotion_programs.program_name),
          status = COALESCE(NULLIF(excluded.status, ''), marketplace_promotion_programs.status),
          start_time = CASE WHEN excluded.start_time > 0 THEN excluded.start_time ELSE marketplace_promotion_programs.start_time END,
          end_time = CASE WHEN excluded.end_time > 0 THEN excluded.end_time ELSE marketplace_promotion_programs.end_time END,
          budget = CASE WHEN excluded.budget > 0 THEN excluded.budget ELSE marketplace_promotion_programs.budget END,
          used_budget = excluded.used_budget,
          currency = COALESCE(NULLIF(excluded.currency, ''), marketplace_promotion_programs.currency),
          item_count = CASE WHEN excluded.item_count > 0 THEN excluded.item_count ELSE marketplace_promotion_programs.item_count END,
          is_current = 1,
          raw_data = CASE WHEN excluded.raw_data != '{}' THEN excluded.raw_data ELSE marketplace_promotion_programs.raw_data END,
          detail_raw_data = CASE WHEN excluded.detail_raw_data != '{}' THEN excluded.detail_raw_data ELSE marketplace_promotion_programs.detail_raw_data END,
          request_id = COALESCE(NULLIF(excluded.request_id, ''), marketplace_promotion_programs.request_id),
          synced_at = excluded.synced_at,
          updated_at = excluded.updated_at
      `).bind(
        row.platform, row.shop, row.api_shop_id, row.module, row.program_id,
        row.program_name, row.status, row.start_time, row.end_time, row.budget,
        row.used_budget, row.currency, row.item_count, row.raw_data,
        row.detail_raw_data, row.request_id
      ).run()
      savedPrograms++
    }

    let savedItems = 0
    for (const item of items || []) {
      if (!item.program_id || (!item.item_id && !item.sku_id && !item.model_id)) continue
      await env.DB.prepare(`
        INSERT INTO marketplace_promotion_items (
          platform, shop, api_shop_id, module, program_id, program_name, item_role,
          item_id, model_id, sku_id, sku, item_name, model_name, status,
          original_price, promotion_price, stock, campaign_stock, purchase_limit,
          raw_data, synced_at, updated_at
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now', '+7 hours'),datetime('now', '+7 hours'))
        ON CONFLICT(platform, api_shop_id, module, program_id, item_role, item_id, model_id, sku_id) DO UPDATE SET
          shop = excluded.shop,
          program_name = excluded.program_name,
          sku = COALESCE(NULLIF(excluded.sku, ''), marketplace_promotion_items.sku),
          item_name = COALESCE(NULLIF(excluded.item_name, ''), marketplace_promotion_items.item_name),
          model_name = COALESCE(NULLIF(excluded.model_name, ''), marketplace_promotion_items.model_name),
          status = COALESCE(NULLIF(excluded.status, ''), marketplace_promotion_items.status),
          original_price = CASE WHEN excluded.original_price > 0 THEN excluded.original_price ELSE marketplace_promotion_items.original_price END,
          promotion_price = CASE WHEN excluded.promotion_price > 0 THEN excluded.promotion_price ELSE marketplace_promotion_items.promotion_price END,
          stock = excluded.stock,
          campaign_stock = excluded.campaign_stock,
          purchase_limit = excluded.purchase_limit,
          raw_data = excluded.raw_data,
          synced_at = excluded.synced_at,
          updated_at = excluded.updated_at
      `).bind(
        item.platform, item.shop, item.api_shop_id, item.module, item.program_id,
        item.program_name, item.item_role, item.item_id, item.model_id, item.sku_id,
        item.sku, item.item_name, item.model_name, item.status, item.original_price,
        item.promotion_price, item.stock, item.campaign_stock, item.purchase_limit,
        item.raw_data
      ).run()
      savedItems++
    }
    return { saved_programs: savedPrograms, saved_items: savedItems }
  }
  core.savePromotionPrograms = savePromotionPrograms

  async function deletePromotionCache(env, options = {}) {
    await ensureShopeeDiscountTables(env)
    const confirm = cleanText(options.confirm)
    if (confirm !== 'DELETE_CACHE_ONLY') {
      return {
        status: 'error',
        mode: 'delete_promotion_cache',
        error: 'confirm_required',
        message: 'Thiếu xác nhận DELETE_CACHE_ONLY để xóa cache khuyến mãi.'
      }
    }
    const platform = cleanText(options.platform).toLowerCase()
    const shop = cleanText(options.shop)
    const module = cleanText(options.module)
    const voucherId = cleanText(options.voucher_id || options.voucherId)
    const programId = cleanText(options.program_id || options.programId)
    if (voucherId) {
      const result = await env.DB.prepare(`
        DELETE FROM marketplace_vouchers
        WHERE platform = ? AND shop = ? AND voucher_id = ?
      `).bind(platform, shop, voucherId).run()
      return {
        status: 'ok',
        mode: 'delete_promotion_cache',
        cache_scope: 'voucher',
        platform,
        shop,
        voucher_id: voucherId,
        deleted_vouchers: Number(result.meta?.changes || 0)
      }
    }
    if (!programId || !module) {
      return {
        status: 'error',
        mode: 'delete_promotion_cache',
        error: 'missing_program_or_module',
        message: 'Thiếu program_id hoặc module để xóa cache chương trình.'
      }
    }
    const itemResult = await env.DB.prepare(`
      DELETE FROM marketplace_promotion_items
      WHERE platform = ? AND shop = ? AND module = ? AND program_id = ?
    `).bind(platform, shop, module, programId).run()
    const programResult = await env.DB.prepare(`
      DELETE FROM marketplace_promotion_programs
      WHERE platform = ? AND shop = ? AND module = ? AND program_id = ?
    `).bind(platform, shop, module, programId).run()
    return {
      status: 'ok',
      mode: 'delete_promotion_cache',
      cache_scope: 'program',
      platform,
      shop,
      module,
      program_id: programId,
      deleted_programs: Number(programResult.meta?.changes || 0),
      deleted_items: Number(itemResult.meta?.changes || 0)
    }
  }
  core.deletePromotionCache = deletePromotionCache
}
