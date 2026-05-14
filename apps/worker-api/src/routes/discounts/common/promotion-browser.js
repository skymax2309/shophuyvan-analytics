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
}
