export function installDiscountsCommonPromotionBrowser(core) {
  const cleanText = (...args) => core.cleanText(...args)
  const ensureShopeeDiscountTables = (...args) => core.ensureShopeeDiscountTables(...args)
  const num = (...args) => core.num(...args)
  const parseJson = (...args) => core.parseJson(...args)
  const round2 = (...args) => core.round2(...args)

  function limitNumber(value, fallback = 50, min = 1, max = 200) {
    return Math.min(Math.max(Number(value || fallback) || fallback, min), max)
  }
  core.limitNumber = limitNumber

  function filterList(value = '') {
    return cleanText(value).split(',').map(item => cleanText(item).toLowerCase()).filter(Boolean)
  }
  core.filterList = filterList

  const EXPIRED_PROMOTION_STATUSES = ['expired', 'ended', 'finish', 'finished', 'deleted', 'end']

  function addPromotionStatusFilter(filters, params, status, column = 'status', endTimeColumn = 'end_time') {
    const normalized = moduleKey(status || 'not_expired')
    const nowSec = Math.floor(Date.now() / 1000)
    const notEndedByTime = endTimeColumn ? ` AND (COALESCE(CAST(${endTimeColumn} AS INTEGER), 0) = 0 OR CAST(${endTimeColumn} AS INTEGER) >= ?)` : ''
    const endedByTime = endTimeColumn ? ` OR (COALESCE(CAST(${endTimeColumn} AS INTEGER), 0) > 0 AND CAST(${endTimeColumn} AS INTEGER) < ?)` : ''
    if (!normalized || normalized === 'all' || normalized === 'not_expired' || normalized === 'active_current') {
      filters.push(`LOWER(COALESCE(${column}, '')) NOT IN (${EXPIRED_PROMOTION_STATUSES.map(() => '?').join(',')})${notEndedByTime}`)
      params.push(...EXPIRED_PROMOTION_STATUSES)
      if (endTimeColumn) params.push(nowSec)
      return
    }
    if (normalized === 'expired' || normalized === 'ended') {
      filters.push(`(LOWER(COALESCE(${column}, '')) IN (${EXPIRED_PROMOTION_STATUSES.map(() => '?').join(',')})${endedByTime})`)
      params.push(...EXPIRED_PROMOTION_STATUSES)
      if (endTimeColumn) params.push(nowSec)
      return
    }
    filters.push(`LOWER(${column}) = ?`)
    params.push(normalized)
  }

  function queryFilters(options = {}, alias = '') {
    const filters = []
    const params = []
    const prefix = alias ? `${alias}.` : ''
    const platform = cleanText(options.platform).toLowerCase()
    const module = cleanText(options.module).toLowerCase()
    const shop = cleanText(options.shop)
    const status = cleanText(options.status).toLowerCase()
    if (platform) {
      filters.push(`LOWER(${prefix}platform) = ?`)
      params.push(platform)
    }
    if (module) {
      filters.push(`LOWER(${prefix}module) = ?`)
      params.push(module)
    }
    if (shop) {
      filters.push(`${prefix}shop = ?`)
      params.push(shop)
    }
    if (status && status !== 'all') {
      filters.push(`LOWER(${prefix}status) = ?`)
      params.push(status)
    }
    return { where: filters.length ? `WHERE ${filters.join(' AND ')}` : '', params }
  }
  core.queryFilters = queryFilters

  async function listPromotionPrograms(env, options = {}) {
    await ensureShopeeDiscountTables(env)
    const { where, params } = queryFilters(options, 'p')
    const limit = limitNumber(options.limit, 50, 1, 300)
    const offset = Math.max(0, Number(options.offset || 0) || 0)
    const { results } = await env.DB.prepare(`
      SELECT p.*,
             COUNT(i.id) AS cached_items
      FROM marketplace_promotion_programs p
      LEFT JOIN marketplace_promotion_items i
        ON i.platform = p.platform
       AND i.api_shop_id = p.api_shop_id
       AND i.module = p.module
       AND i.program_id = p.program_id
      ${where}
      GROUP BY p.id
      ORDER BY p.updated_at DESC, p.start_time DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all()
    return {
      status: 'ok',
      mode: 'promotion_program_list',
      source: 'marketplace_promotion_programs / marketplace_promotion_items',
      filters: {
        platform: cleanText(options.platform),
        module: cleanText(options.module),
        shop: cleanText(options.shop),
        status: cleanText(options.status || 'all'),
        limit,
        offset
      },
      rows: (results || []).map(row => ({
        ...row,
        cached_items: Math.round(num(row.cached_items)),
        budget: round2(row.budget),
        used_budget: round2(row.used_budget),
        item_count: Math.round(num(row.item_count)),
        raw_data: undefined,
        detail_raw_data: undefined
      }))
    }
  }
  core.listPromotionPrograms = listPromotionPrograms

  async function getPromotionProgramDetail(env, options = {}) {
    await ensureShopeeDiscountTables(env)
    const programId = cleanText(options.program_id || options.programId)
    if (!programId) return { status: 'error', error: 'missing_program_id', message: 'Thiếu program_id.' }
    const filters = ['program_id = ?']
    const params = [programId]
    for (const [field, value] of [
      ['platform', cleanText(options.platform).toLowerCase()],
      ['module', cleanText(options.module).toLowerCase()],
      ['shop', cleanText(options.shop)]
    ]) {
      if (!value) continue
      filters.push(field === 'shop' ? 'shop = ?' : `LOWER(${field}) = ?`)
      params.push(value)
    }
    const program = await env.DB.prepare(`
      SELECT * FROM marketplace_promotion_programs
      WHERE ${filters.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT 1
    `).bind(...params).first()
    if (!program) return { status: 'error', error: 'program_not_found', message: 'Không tìm thấy chương trình trong cache.' }
    const { results: items } = await env.DB.prepare(`
      SELECT *
      FROM marketplace_promotion_items
      WHERE platform = ?
        AND api_shop_id = ?
        AND module = ?
        AND program_id = ?
      ORDER BY item_role, item_name, sku, item_id
      LIMIT ?
    `).bind(program.platform, program.api_shop_id, program.module, program.program_id, limitNumber(options.item_limit || options.limit, 120, 1, 500)).all()
    return {
      status: 'ok',
      mode: 'promotion_program_detail',
      program: {
        ...program,
        budget: round2(program.budget),
        used_budget: round2(program.used_budget),
        item_count: Math.round(num(program.item_count)),
        raw: parseJson(program.raw_data, {}),
        detail: parseJson(program.detail_raw_data, {}),
        raw_data: undefined,
        detail_raw_data: undefined
      },
      items: (items || []).map(item => ({
        ...item,
        original_price: round2(item.original_price),
        promotion_price: round2(item.promotion_price),
        stock: Math.round(num(item.stock)),
        campaign_stock: Math.round(num(item.campaign_stock)),
        raw: parseJson(item.raw_data, {}),
        raw_data: undefined
      })),
      safety: 'Chỉ đọc cache D1. Không gọi endpoint ghi thật.'
    }
  }
  core.getPromotionProgramDetail = getPromotionProgramDetail

  async function listPromotionVouchers(env, options = {}) {
    await ensureShopeeDiscountTables(env)
    const filters = []
    const params = []
    const platform = cleanText(options.platform).toLowerCase()
    const shop = cleanText(options.shop)
    const status = cleanText(options.status).toLowerCase()
    if (platform) {
      filters.push('LOWER(platform) = ?')
      params.push(platform)
    }
    if (shop) {
      filters.push('shop = ?')
      params.push(shop)
    }
    if (status && status !== 'all') {
      filters.push('LOWER(status) = ?')
      params.push(status)
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    const limit = limitNumber(options.limit, 50, 1, 300)
    const { results } = await env.DB.prepare(`
      SELECT *
      FROM marketplace_vouchers
      ${where}
      ORDER BY updated_at DESC, start_time DESC
      LIMIT ?
    `).bind(...params, limit).all()
    return {
      status: 'ok',
      mode: 'promotion_voucher_list',
      source: 'marketplace_vouchers',
      rows: (results || []).map(row => ({
        ...row,
        item_ids: parseJson(row.item_ids_json, []),
        raw_data: undefined,
        detail_raw_data: undefined
      }))
    }
  }
  core.listPromotionVouchers = listPromotionVouchers

  function moduleKey(value = '') {
    return cleanText(value).toLowerCase().replace(/[\s-]+/g, '_')
  }

  function userStatus(value = '') {
    const status = moduleKey(value)
    if (['ongoing', 'active', 'enabled', 'running'].includes(status)) return 'Đang chạy'
    if (['upcoming', 'pending'].includes(status)) return 'Sắp chạy'
    if (['expired', 'ended', 'finish', 'finished', 'deleted'].includes(status)) return 'Đã kết thúc'
    if (['paused', 'suspended', 'disabled'].includes(status)) return 'Đã tạm dừng'
    return status ? cleanText(value) : 'Chưa rõ'
  }

  function timestampText(value) {
    const n = Number(value || 0)
    if (!n) return ''
    try {
      return new Date(n * 1000).toISOString()
    } catch {
      return ''
    }
  }

  function promotionCapability(platform, module, action = 'view') {
    const key = moduleKey(module)
    const platformKey = moduleKey(platform)
    const shopeeWrite = platformKey === 'shopee' && ['discount', 'voucher', 'bundle_deal', 'add_on_deal', 'shop_flash_sale'].includes(key)
    const lazadaWrite = platformKey === 'lazada' && ['seller_voucher', 'voucher', 'free_shipping', 'flexicombo'].includes(key)
    if (action === 'view' || action === 'sync') {
      return {
        action,
        allowed: true,
        user_status: 'Có thể đồng bộ',
        requires_preview: false,
        requires_admin_confirm: false,
        requires_readback: false
      }
    }
    if (shopeeWrite) {
      return {
        action,
        allowed: key === 'discount',
        user_status: key === 'discount' ? 'Có thể chỉnh tự động' : 'Cần kiểm quyền trước khi ghi',
        requires_preview: true,
        requires_admin_confirm: true,
        requires_readback: true
      }
    }
    if (lazadaWrite) {
      return {
        action,
        allowed: false,
        user_status: 'Chỉ xem dữ liệu',
        requires_preview: true,
        requires_admin_confirm: true,
        requires_readback: true
      }
    }
    return {
      action,
      allowed: false,
      user_status: 'Chỉ xem dữ liệu',
      requires_preview: true,
      requires_admin_confirm: true,
      requires_readback: true
    }
  }

  function normalizeDiscountProgram(row = {}) {
    return {
      platform: cleanText(row.platform || 'shopee'),
      shop: cleanText(row.shop),
      promotion_type: 'discount',
      promotion_id: cleanText(row.discount_id),
      promotion_name: cleanText(row.discount_name || `Discount ${row.discount_id || ''}`),
      status: cleanText(row.status),
      status_label: userStatus(row.status),
      start_time: timestampText(row.start_time),
      end_time: timestampText(row.end_time),
      item_count: Math.round(num(row.item_count)),
      last_synced_at: cleanText(row.synced_at || row.updated_at)
    }
  }

  function normalizeDiscountItem(row = {}) {
    return {
      platform: cleanText(row.platform || 'shopee'),
      shop: cleanText(row.shop),
      promotion_type: 'discount',
      promotion_id: cleanText(row.discount_id),
      item_id: cleanText(row.item_id),
      model_id: cleanText(row.model_id),
      sku_id: cleanText(row.model_id || row.item_id),
      seller_sku: cleanText(row.model_name || row.item_name),
      product_name: cleanText(row.item_name || row.discount_name),
      original_price: round2(row.original_price),
      promotion_price: round2(row.promotion_price),
      discount_percent: round2(row.discount_percent),
      stock: Math.round(num(row.promotion_stock || row.normal_stock)),
      status: cleanText(row.status),
      status_label: userStatus(row.status),
      last_synced_at: cleanText(row.synced_at || row.updated_at),
      action_status: promotionCapability('shopee', 'discount', 'update_item').user_status
    }
  }

  function normalizeVoucher(row = {}) {
    const platform = cleanText(row.platform)
    return {
      platform,
      shop: cleanText(row.shop),
      promotion_type: platform === 'lazada' ? 'lazada_voucher' : 'shopee_voucher',
      promotion_id: cleanText(row.voucher_id),
      promotion_name: cleanText(row.voucher_name || row.voucher_code || `Voucher ${row.voucher_id || ''}`),
      status: cleanText(row.status),
      status_label: userStatus(row.status),
      start_time: timestampText(row.start_time),
      end_time: timestampText(row.end_time),
      current_usage: Math.round(num(row.current_usage)),
      usage_quantity: Math.round(num(row.usage_quantity)),
      discount_amount: round2(row.discount_amount),
      percentage: round2(row.percentage),
      min_basket_price: round2(row.min_basket_price),
      item_count: Array.isArray(parseJson(row.item_ids_json, [])) ? parseJson(row.item_ids_json, []).length : 0,
      last_synced_at: cleanText(row.synced_at || row.updated_at),
      action_status: promotionCapability(platform, platform === 'lazada' ? 'voucher' : 'voucher', 'update').user_status
    }
  }

  function normalizeProgram(row = {}) {
    return {
      platform: cleanText(row.platform),
      shop: cleanText(row.shop),
      promotion_type: cleanText(row.module),
      promotion_id: cleanText(row.program_id),
      promotion_name: cleanText(row.program_name || `${row.module || 'Chương trình'} ${row.program_id || ''}`),
      status: cleanText(row.status),
      status_label: userStatus(row.status),
      start_time: timestampText(row.start_time),
      end_time: timestampText(row.end_time),
      budget: round2(row.budget),
      used_budget: round2(row.used_budget),
      item_count: Math.round(num(row.item_count || row.cached_items)),
      last_synced_at: cleanText(row.synced_at || row.updated_at),
      action_status: promotionCapability(row.platform, row.module, 'update').user_status
    }
  }

  function normalizeProgramItem(row = {}) {
    return {
      platform: cleanText(row.platform),
      shop: cleanText(row.shop),
      promotion_type: cleanText(row.module),
      promotion_id: cleanText(row.program_id),
      item_id: cleanText(row.item_id),
      model_id: cleanText(row.model_id),
      sku_id: cleanText(row.sku_id || row.sku),
      seller_sku: cleanText(row.sku),
      product_name: cleanText(row.item_name || row.program_name),
      original_price: round2(row.original_price),
      promotion_price: round2(row.promotion_price),
      discount_percent: row.original_price ? round2((1 - (num(row.promotion_price) / Math.max(num(row.original_price), 1))) * 100) : 0,
      stock: Math.round(num(row.stock || row.campaign_stock)),
      status: cleanText(row.status),
      status_label: userStatus(row.status),
      item_role: cleanText(row.item_role),
      last_synced_at: cleanText(row.synced_at || row.updated_at),
      action_status: promotionCapability(row.platform, row.module, 'update_item').user_status
    }
  }

  async function getPromotionModuleReadModel(env, options = {}) {
    await ensureShopeeDiscountTables(env)
    const platform = cleanText(options.platform).toLowerCase()
    const module = moduleKey(options.module)
    const shop = cleanText(options.shop)
    const status = cleanText(options.status || 'not_expired').toLowerCase()
    const limit = limitNumber(options.limit, 80, 1, 300)

    function moduleFilters(alias = '', includeEndTime = true) {
      const filters = []
      const params = []
      const prefix = alias ? `${alias}.` : ''
      if (platform) {
        filters.push(`LOWER(${prefix}platform) = ?`)
        params.push(platform)
      }
      if (shop) {
        filters.push(`${prefix}shop = ?`)
        params.push(shop)
      }
      addPromotionStatusFilter(filters, params, status, `${prefix}status`, includeEndTime ? `${prefix}end_time` : '')
      return { filters, params }
    }

    if (module === 'discount') {
      const { filters, params } = moduleFilters()
      const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
      const { results: programs } = await env.DB.prepare(`
        SELECT * FROM marketplace_discounts
        ${where}
        ORDER BY updated_at DESC, start_time DESC
        LIMIT ?
      `).bind(...params, limit).all()
      const itemFilter = moduleFilters('', false)
      const itemWhere = itemFilter.filters.length ? `WHERE ${itemFilter.filters.join(' AND ')}` : ''
      const { results: items } = await env.DB.prepare(`
        SELECT * FROM marketplace_discount_items
        ${itemWhere}
        ORDER BY updated_at DESC, discount_name, item_name
        LIMIT ?
      `).bind(...itemFilter.params, limit).all()
      return {
        status: 'ok',
        module,
        platform: platform || 'shopee',
        programs: (programs || []).map(normalizeDiscountProgram),
        items: (items || []).map(normalizeDiscountItem),
        capabilities: [promotionCapability('shopee', 'discount', 'update_item'), promotionCapability('shopee', 'discount', 'sync')]
      }
    }

    if (module === 'voucher' || module === 'seller_voucher') {
      const { filters, params } = moduleFilters()
      const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
      const { results } = await env.DB.prepare(`
        SELECT * FROM marketplace_vouchers
        ${where}
        ORDER BY updated_at DESC, start_time DESC
        LIMIT ?
      `).bind(...params, limit).all()
      const rows = (results || []).map(normalizeVoucher)
      return {
        status: 'ok',
        module,
        platform,
        programs: rows,
        items: rows.map(row => ({ ...row, product_name: row.promotion_name, seller_sku: row.promotion_id, action_status: row.action_status })),
        capabilities: [promotionCapability(platform, 'voucher', 'update'), promotionCapability(platform, 'voucher', 'sync')]
      }
    }

    const programFilter = moduleFilters('p')
    const filters = [...programFilter.filters]
    const params = [...programFilter.params]
    if (module) {
      filters.push('LOWER(p.module) = ?')
      params.push(module)
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    const { results: programs } = await env.DB.prepare(`
      SELECT p.*, COUNT(i.id) AS cached_items
      FROM marketplace_promotion_programs p
      LEFT JOIN marketplace_promotion_items i
        ON i.platform = p.platform
       AND i.api_shop_id = p.api_shop_id
       AND i.module = p.module
       AND i.program_id = p.program_id
      ${where}
      GROUP BY p.id
      ORDER BY p.updated_at DESC, p.start_time DESC
      LIMIT ?
    `).bind(...params, limit).all()
    const itemFilters = [...programFilter.filters]
    const itemParams = [...programFilter.params]
    if (module) {
      itemFilters.push('LOWER(p.module) = ?')
      itemParams.push(module)
    }
    const itemWhere = itemFilters.length ? `WHERE ${itemFilters.join(' AND ')}` : ''
    const { results: items } = await env.DB.prepare(`
      SELECT i.*
      FROM marketplace_promotion_items i
      INNER JOIN marketplace_promotion_programs p
        ON p.platform = i.platform
       AND p.api_shop_id = i.api_shop_id
       AND p.module = i.module
       AND p.program_id = i.program_id
      ${itemWhere}
      ORDER BY i.updated_at DESC, i.program_name, i.item_name
      LIMIT ?
    `).bind(...itemParams, limit).all()
    return {
      status: 'ok',
      module,
      platform,
      programs: (programs || []).map(normalizeProgram),
      items: (items || []).map(normalizeProgramItem),
      capabilities: [promotionCapability(platform, module, 'update'), promotionCapability(platform, module, 'sync')]
    }
  }
  core.getPromotionModuleReadModel = getPromotionModuleReadModel
}
