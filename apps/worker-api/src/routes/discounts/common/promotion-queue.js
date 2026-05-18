import { redactShopeeValue } from '../../../features/shopee/logs/shopeeLogMask.js'

export function installDiscountsCommonPromotionQueue(core) {
  const DISCOUNT_STOCK_RULE_CONFIRM = core.DISCOUNT_STOCK_RULE_CONFIRM
  const PROMOTION_QUEUE_EXECUTE_CONFIRM = core.PROMOTION_QUEUE_EXECUTE_CONFIRM
  const buildPromotionStockPricePreview = core.buildPromotionStockPricePreview
  const cleanText = (...args) => core.cleanText(...args)
  const compactJson = (...args) => core.compactJson(...args)
  const ensureShopeeDiscountTables = (...args) => core.ensureShopeeDiscountTables(...args)
  const executeShopeeDiscountAction = (...args) => core.executeShopeeDiscountAction(...args)
  const getAdminUserFromRequest = core.getAdminUserFromRequest
  const getPromotionSkuDetail = (...args) => core.getPromotionSkuDetail(...args)
  const limitNumber = (...args) => core.limitNumber(...args)
  const num = (...args) => core.num(...args)
  const parseJson = (...args) => core.parseJson(...args)
  const round2 = (...args) => core.round2(...args)

  const PROMOTION_WRITE_ENDPOINTS = {
    shopee: {
      voucher: ['/api/v2/voucher/add_voucher', '/api/v2/voucher/update_voucher', '/api/v2/voucher/end_voucher', '/api/v2/voucher/delete_voucher'],
      bundle_deal: ['/api/v2/bundle_deal/add_bundle_deal', '/api/v2/bundle_deal/update_bundle_deal', '/api/v2/bundle_deal/end_bundle_deal'],
      add_on_deal: ['/api/v2/add_on_deal/add_add_on_deal', '/api/v2/add_on_deal/update_add_on_deal', '/api/v2/add_on_deal/end_add_on_deal'],
      shop_flash_sale: ['/api/v2/shop_flash_sale/create_shop_flash_sale', '/api/v2/shop_flash_sale/update_shop_flash_sale', '/api/v2/shop_flash_sale/delete_shop_flash_sale']
    },
    lazada: {
      voucher: ['/promotion/voucher/create', '/promotion/voucher/update', '/promotion/voucher/activate', '/promotion/voucher/deactivate'],
      free_shipping: ['/promotion/freeshipping/create', '/promotion/freeshipping/update', '/promotion/freeshipping/activate', '/promotion/freeshipping/deactivate'],
      flexicombo: ['/promotion/flexicombo/create', '/promotion/flexicombo/update', '/promotion/flexicombo/activate', '/promotion/flexicombo/deactivate'],
      early_bird: ['/activity/early/bird/create', '/activity/early/bird/addSkus']
    }
  }
  core.PROMOTION_WRITE_ENDPOINTS = PROMOTION_WRITE_ENDPOINTS

  async function savePromotionPreviewAction(env, row = {}) {
    await ensureShopeeDiscountTables(env)
    await env.DB.prepare(`
      INSERT INTO marketplace_discount_actions (
        platform, shop, api_shop_id, action, payload, dry_run, sent_to_shopee, response, created_at
      )
      VALUES (?,?,?,?,?,1,0,?,datetime('now', '+7 hours'))
    `).bind(
      cleanText(row.platform || 'promotion'),
      cleanText(row.shop),
      cleanText(row.api_shop_id),
      cleanText(row.action),
      compactJson(row.payload || {}, 30000),
      compactJson(row.response || {}, 30000)
    ).run()
  }
  core.savePromotionPreviewAction = savePromotionPreviewAction

  async function findPromotionItemForPreview(env, options = {}) {
    const itemId = cleanText(options.item_id || options.itemId)
    const skuId = cleanText(options.sku_id || options.skuId)
    const programId = cleanText(options.program_id || options.programId)
    if (!itemId && !skuId && !programId) return null
    const filters = []
    const params = []
    for (const [field, value] of [
      ['platform', cleanText(options.platform).toLowerCase()],
      ['module', cleanText(options.module).toLowerCase()],
      ['shop', cleanText(options.shop)],
      ['program_id', programId],
      ['item_id', itemId],
      ['sku_id', skuId]
    ]) {
      if (!value) continue
      filters.push(field === 'platform' || field === 'module' ? `LOWER(${field}) = ?` : `${field} = ?`)
      params.push(value)
    }
    if (!filters.length) return null
    return await env.DB.prepare(`
      SELECT *
      FROM marketplace_promotion_items
      WHERE ${filters.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT 1
    `).bind(...params).first()
  }
  core.findPromotionItemForPreview = findPromotionItemForPreview

  async function previewPromotionAction(env, options = {}) {
    await ensureShopeeDiscountTables(env)
    const action = cleanText(options.action || 'preview').toLowerCase()
    const inputRow = options.row && typeof options.row === 'object' ? options.row : {}
    const cachedRow = await findPromotionItemForPreview(env, options)
    const row = { ...cachedRow, ...inputRow }
    const platform = cleanText(options.platform || row.platform).toLowerCase()
    const module = cleanText(options.module || row.module || 'voucher').toLowerCase()
    const endpoints = PROMOTION_WRITE_ENDPOINTS[platform]?.[module] || []
    let payload = options.payload && typeof options.payload === 'object' ? options.payload : {}
    let stockPreview = null
    const warnings = []
    const errors = []

    if (action === 'stock_price_rule') {
      stockPreview = buildPromotionStockPricePreview({ ...row, platform, module }, {
        price_rules: options.price_rules || options.priceRules || {},
        thresholds: options.thresholds || {}
      })
      payload = stockPreview.payload
      warnings.push(...(stockPreview.warnings || []))
      errors.push(...(stockPreview.errors || []))
    }
    if (!platform) errors.push('Thiếu platform.')
    if (!module) errors.push('Thiếu module.')
    if (!endpoints.length) warnings.push('Chưa có endpoint ghi chính thức trong allowlist nội bộ cho module này.')
    if (platform === 'lazada' && module === 'early_bird') warnings.push('Early Bird là nhóm ghi giá thật, hiện chỉ cho preview và luôn khóa apply.')
    const earlyBirdPreviewOnly = platform === 'lazada' && module === 'early_bird'

    const result = {
      status: errors.length ? 'blocked' : 'ok',
      mode: 'promotion_action_preview',
      action,
      platform,
      module,
      shop: cleanText(options.shop || row.shop),
      api_shop_id: cleanText(row.api_shop_id),
      write_endpoints: endpoints,
      payload,
      stock_price_rule: stockPreview,
      warnings,
      errors,
      dry_run: true,
      apply_locked: true,
      apply_supported: !earlyBirdPreviewOnly && endpoints.length > 0,
      apply_policy: earlyBirdPreviewOnly ? 'preview_only_locked' : 'queue_required_before_apply',
      sent_to_platform: false,
      safety: 'Preview chỉ dựng payload và lưu log nội bộ. Endpoint này không gửi lệnh tạo/sửa/kích hoạt/tắt khuyến mãi thật.'
    }
    await savePromotionPreviewAction(env, {
      platform,
      shop: result.shop,
      api_shop_id: result.api_shop_id,
      action: `promotion:${module}:${action}`,
      payload,
      response: result
    })
    return result
  }
  core.previewPromotionAction = previewPromotionAction

  function isPromotionApplyAdmin(user) {
    return user?.role === 'admin'
  }
  core.isPromotionApplyAdmin = isPromotionApplyAdmin

  function promotionQueueRollbackPayload(preview = {}, skuDetail = {}) {
    const item = skuDetail.promotion_item || {}
    return {
      mode: 'rollback_plan_only',
      platform: preview.platform,
      module: preview.module,
      action: preview.action,
      program_id: item.program_id || preview.program_id || '',
      item_id: item.item_id || preview.item_id || '',
      model_id: item.model_id || preview.model_id || '',
      sku_id: item.sku_id || '',
      revert_to: {
        original_price: round2(item.original_price),
        promotion_price: round2(item.promotion_price),
        stock: Math.round(num(item.stock || item.campaign_stock)),
        status: cleanText(item.status)
      },
      note: 'Rollback này là kế hoạch nội bộ dựa trên cache trước khi apply; chưa tự gọi endpoint ghi thật.'
    }
  }
  core.promotionQueueRollbackPayload = promotionQueueRollbackPayload

  function buildPromotionQueueRisk(preview = {}, skuDetail = {}, options = {}) {
    const warnings = [...(preview.warnings || []), ...(skuDetail.warnings || [])]
    const errors = [...(preview.errors || [])]
    const profit = skuDetail.profit_check || {}
    const item = skuDetail.promotion_item || {}
    const platform = cleanText(preview.platform || item.platform).toLowerCase()
    const module = cleanText(preview.module || item.module).toLowerCase()
    const targetPrice = round2(profit.target_price || preview.stock_price_rule?.target_promotion_price || preview.payload?.target_promotion_price)
    const costBase = round2(profit.cost_base)
    const stock = Math.round(num(item.stock || item.campaign_stock))
    const minMarginPercent = Math.max(0, Number(options.minimum_margin_percent || options.minimumMarginPercent || 5) || 0)
    const guardPrice = costBase ? Math.ceil(costBase * (1 + minMarginPercent / 100)) : 0
    let needsData = false

    if (preview.status === 'blocked') errors.push('Preview đang bị chặn, không đủ điều kiện đưa vào hàng đợi apply.')
    if (platform === 'lazada' && module === 'early_bird') errors.push('Lazada Early Bird được chốt ở chế độ preview-only vì là endpoint ghi giá thật.')
    if (!preview.write_endpoints?.length) errors.push('Module chưa có endpoint ghi trong allowlist nội bộ.')
    if (!targetPrice) {
      warnings.push('Thiếu giá mục tiêu để kiểm tra lãi.')
      needsData = true
    }
    if (!costBase) {
      warnings.push('Thiếu giá vốn, hàng đợi sẽ ở trạng thái cần bổ sung dữ liệu trước khi duyệt.')
      needsData = true
    }
    if (costBase && targetPrice && targetPrice < guardPrice) {
      errors.push(`Giá mục tiêu thấp hơn sàn lãi tối thiểu ${minMarginPercent}%.`)
    }
    if (stock <= 0) warnings.push('Tồn đang bằng 0 hoặc chưa map được tồn; cần kiểm tra trước khi apply.')

    const status = errors.length ? 'blocked' : needsData ? 'needs_data' : 'queued'
    return {
      status,
      minimum_margin_percent: minMarginPercent,
      guard_price: guardPrice,
      target_price: targetPrice,
      cost_base: costBase,
      stock,
      unit_margin_after_target: round2(targetPrice - costBase),
      ads_spend_30d: round2(skuDetail.ads?.spend),
      order_revenue_30d: round2(skuDetail.orders?.revenue),
      net_after_ads_30d: round2(skuDetail.profit_check?.net_after_ads_30d),
      warnings: [...new Set(warnings.map(cleanText).filter(Boolean))],
      errors: [...new Set(errors.map(cleanText).filter(Boolean))]
    }
  }
  core.buildPromotionQueueRisk = buildPromotionQueueRisk

  function publicPromotionQueueRow(row = {}) {
    return {
      ...row,
      raw_response_masked: parseJson(row.raw_response_masked, {}),
      payload: parseJson(row.payload, {}),
      preview_response: parseJson(row.preview_response, {}),
      risk_summary: parseJson(row.risk_summary, {}),
      rollback_payload: parseJson(row.rollback_payload, {}),
      response: parseJson(row.response, {}),
      apply_locked: Boolean(num(row.apply_locked)),
      sent_to_platform: Boolean(num(row.sent_to_platform))
    }
  }
  core.publicPromotionQueueRow = publicPromotionQueueRow

  function queueClientType(platform = '') {
    const key = cleanText(platform).toLowerCase()
    if (key === 'shopee') return 'marketplace_client'
    if (key === 'lazada') return 'lazada_client'
    return key ? `${key}_client` : ''
  }

  function queueSendStatusFromRisk(status = '') {
    const key = cleanText(status).toLowerCase()
    if (key === 'needs_data') return 'needs_data'
    if (key === 'blocked' || key === 'rejected') return 'failed_validation'
    return 'ready_to_send'
  }

  function queueValidationStatusFromRisk(status = '') {
    const key = cleanText(status).toLowerCase()
    if (key === 'needs_data') return 'needs_data'
    if (key === 'blocked' || key === 'rejected') return 'failed_validation'
    return 'valid'
  }

  function promotionQueueSupportsLiveApply(row = {}) {
    const platform = cleanText(row.platform).toLowerCase()
    const module = cleanText(row.module).toLowerCase()
    return platform === 'shopee' && ['discount', 'shopee_discount'].includes(module)
  }
  core.promotionQueueSupportsLiveApply = promotionQueueSupportsLiveApply

  function promotionQueueDiscountClientRule(row = {}) {
    const preview = parseJson(row.preview_response, {})
    const stockRule = preview.stock_price_rule || {}
    const risk = parseJson(row.risk_summary, {})
    return {
      mode: 'stock_threshold_price_rule',
      target_promotion_price: round2(stockRule.target_promotion_price || risk.target_price),
      selected_rule_price: round2(stockRule.target_promotion_price || risk.target_price),
      stock: Math.round(num(stockRule.stock || risk.stock)),
      stock_tier: cleanText(stockRule.tier?.key),
      stock_tier_label: cleanText(stockRule.tier?.label),
      stock_thresholds: stockRule.thresholds || {},
      stock_price_rules: stockRule.price_rules || {}
    }
  }
  core.promotionQueueDiscountClientRule = promotionQueueDiscountClientRule

  async function createPromotionApplyQueue(env, request, options = {}) {
    await ensureShopeeDiscountTables(env)
    const user = await getAdminUserFromRequest(request, env)
    if (!isPromotionApplyAdmin(user)) {
      return { status: 'error', error: 'admin_required', message: 'Chỉ tài khoản admin được đưa promotion vào hàng đợi apply thật.' }
    }
    const preview = await previewPromotionAction(env, options)
    const targetPrice = round2(preview.stock_price_rule?.target_promotion_price || preview.payload?.target_promotion_price)
    const skuDetail = await getPromotionSkuDetail(env, {
      ...options,
      target_promotion_price: targetPrice,
      row: { ...(options.row || {}), ...(preview.stock_price_rule || {}) }
    })
    const risk = buildPromotionQueueRisk(preview, skuDetail.status === 'ok' ? skuDetail : {}, options)
    const rollbackPayload = promotionQueueRollbackPayload(preview, skuDetail.status === 'ok' ? skuDetail : {})
    const queueId = crypto.randomUUID()
    const platform = cleanText(preview.platform || options.platform).toLowerCase()
    const module = cleanText(preview.module || options.module).toLowerCase()
    const item = skuDetail.status === 'ok' ? skuDetail.promotion_item || {} : (options.row || {})
    const writeEndpoints = Array.isArray(preview.write_endpoints) ? preview.write_endpoints : []
    const sendStatus = queueSendStatusFromRisk(risk.status)
    const validationStatus = queueValidationStatusFromRisk(risk.status)
    await env.DB.prepare(`
      INSERT INTO marketplace_promotion_apply_queue (
        queue_id, platform, shop, api_shop_id, module, action, program_id,
        item_id, model_id, sku_id, sku, status, action_type, target_type,
        client_type, shopee_endpoint, validation_status, send_status,
        verify_status, error_code, error_message, raw_response_masked,
        payload, preview_response,
        risk_summary, rollback_payload, apply_locked, sent_to_platform,
        created_by, created_role, notes, response, created_at, updated_at
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,?,?,?,?,datetime('now', '+7 hours'),datetime('now', '+7 hours'))
    `).bind(
      queueId,
      platform,
      cleanText(preview.shop || options.shop),
      cleanText(preview.api_shop_id || item.api_shop_id),
      module,
      cleanText(preview.action || options.action),
      cleanText(item.program_id || options.program_id || options.programId),
      cleanText(item.item_id || options.item_id || options.itemId),
      cleanText(item.model_id || options.model_id || options.modelId),
      cleanText(item.sku_id || options.sku_id || options.skuId),
      cleanText(item.sku),
      risk.status,
      cleanText(preview.action || options.action),
      module,
      queueClientType(platform),
      cleanText(writeEndpoints[0]),
      validationStatus,
      sendStatus,
      'not_verified',
      risk.errors?.length ? 'failed_validation' : '',
      risk.errors?.[0] || '',
      compactJson({}, 2000),
      compactJson(preview.payload || {}, 30000),
      compactJson(preview, 30000),
      compactJson(risk, 30000),
      compactJson(rollbackPayload, 16000),
      cleanText(user.username),
      cleanText(user.role),
      cleanText(options.notes),
      compactJson({ sku_detail_status: skuDetail.status, sku_detail_error: skuDetail.error || '' }, 12000)
    ).run()
    const row = await env.DB.prepare(`
      SELECT *
      FROM marketplace_promotion_apply_queue
      WHERE queue_id = ?
      LIMIT 1
    `).bind(queueId).first()
    return {
      status: 'ok',
      mode: 'promotion_apply_queue_create',
      queue: publicPromotionQueueRow(row),
      sku_detail: skuDetail,
      safety: 'Đã ghi hàng đợi nội bộ. Chỉ dòng có send_status=ready_to_send mới được bấm gửi thật; chưa có dòng nào tự gửi lên sàn.'
    }
  }
  core.createPromotionApplyQueue = createPromotionApplyQueue

  async function executePromotionApplyQueue(env, request, options = {}) {
    await ensureShopeeDiscountTables(env)
    const user = await getAdminUserFromRequest(request, env)
    if (!isPromotionApplyAdmin(user)) {
      return { status: 'error', error: 'admin_required', message: 'Chỉ tài khoản admin được đẩy giá thật lên sàn.' }
    }
    if (cleanText(options.confirm) !== PROMOTION_QUEUE_EXECUTE_CONFIRM) {
      return { status: 'error', error: 'confirm_required', message: 'Thiếu xác nhận đẩy giá thật lên Shopee.' }
    }
    const queueId = cleanText(options.queue_id || options.queueId)
    if (!queueId) return { status: 'error', error: 'missing_queue_id', message: 'Thiếu queue_id.' }
    const current = await env.DB.prepare(`
      SELECT *
      FROM marketplace_promotion_apply_queue
      WHERE queue_id = ?
      LIMIT 1
    `).bind(queueId).first()
    if (!current) return { status: 'error', error: 'queue_not_found', message: 'Không tìm thấy hàng đợi.' }
    if (num(current.sent_to_platform)) {
      return { status: 'error', error: 'already_sent', message: 'Dòng này đã gửi lên sàn trước đó.', queue: publicPromotionQueueRow(current) }
    }
    const risk = parseJson(current.risk_summary, {})
    const riskErrors = Array.isArray(risk.errors) ? risk.errors.filter(Boolean) : []
    if (riskErrors.length || ['blocked', 'needs_data', 'rejected'].includes(cleanText(current.status).toLowerCase())) {
      return { status: 'error', error: 'queue_not_safe', message: 'Hàng đợi còn lỗi hoặc thiếu dữ liệu, chưa được đẩy giá thật.', queue: publicPromotionQueueRow(current) }
    }
    if (!promotionQueueSupportsLiveApply(current)) {
      return {
        status: 'error',
        error: 'adapter_not_supported',
        message: 'Hiện mới mở đẩy giá thật cho Shopee Discount qua update_discount_item. Bundle/Add-On/Flash Sale vẫn chờ adapter payload riêng.',
        queue: publicPromotionQueueRow(current)
      }
    }
    const payload = parseJson(current.payload, {})
    const clientRule = promotionQueueDiscountClientRule(current)
    try {
      await env.DB.prepare(`
        UPDATE marketplace_promotion_apply_queue
        SET send_status = 'sending',
            verify_status = 'not_verified',
            error_code = '',
            error_message = '',
            updated_at = datetime('now', '+7 hours')
        WHERE queue_id = ?
      `).bind(queueId).run()
      const actionResult = await executeShopeeDiscountAction(env, {
        action: 'update_discount_item',
        shop: current.shop,
        payload,
        clientRule,
        execute: true,
        confirm: DISCOUNT_STOCK_RULE_CONFIRM
      })
      if (actionResult.status !== 'ok' || actionResult.verified !== true) {
        const response = {
          status: 'error',
          error: 'shopee_apply_not_verified',
          message: actionResult.message || 'Shopee chưa verify thay đổi sau refetch, không đánh dấu hàng đợi là đã gửi thành công.',
          action_result: actionResult
        }
        await env.DB.prepare(`
          UPDATE marketplace_promotion_apply_queue
          SET status = 'apply_error',
              apply_locked = 0,
              send_status = ?,
              verify_status = 'verify_failed',
              error_code = 'verify_failed',
              error_message = ?,
              raw_response_masked = ?,
              response = ?,
              sent_at = CASE WHEN ? THEN datetime('now', '+7 hours') ELSE sent_at END,
              updated_at = datetime('now', '+7 hours')
          WHERE queue_id = ?
        `).bind(
          actionResult.sent_to_shopee ? 'sent_to_shopee' : 'failed_api',
          cleanText(response.message),
          compactJson(redactShopeeValue(actionResult), 30000),
          compactJson(response, 30000),
          actionResult.sent_to_shopee ? 1 : 0,
          queueId
        ).run()
        const row = await env.DB.prepare(`SELECT * FROM marketplace_promotion_apply_queue WHERE queue_id = ?`).bind(queueId).first()
        return { ...response, queue: publicPromotionQueueRow(row) }
      }
      await env.DB.prepare(`
        UPDATE marketplace_promotion_apply_queue
        SET status = 'sent_to_platform',
            apply_locked = 0,
            sent_to_platform = 1,
            send_status = 'sent_to_shopee',
            verify_status = 'verify_success',
            error_code = '',
            error_message = '',
            raw_response_masked = ?,
            applied_by = ?,
            response = ?,
            applied_at = datetime('now', '+7 hours'),
            sent_at = datetime('now', '+7 hours'),
            verified_at = datetime('now', '+7 hours'),
            updated_at = datetime('now', '+7 hours')
        WHERE queue_id = ?
      `).bind(
        compactJson(redactShopeeValue(actionResult), 30000),
        cleanText(user.username),
        compactJson(actionResult, 30000),
        queueId
      ).run()
      const row = await env.DB.prepare(`SELECT * FROM marketplace_promotion_apply_queue WHERE queue_id = ?`).bind(queueId).first()
      return {
        status: 'ok',
        mode: 'promotion_apply_queue_execute',
        queue: publicPromotionQueueRow(row),
        action_result: actionResult,
        message: 'Đã đẩy giá Shopee Discount lên sàn qua update_discount_item.'
      }
    } catch (error) {
      const response = { status: 'error', error: 'shopee_apply_failed', message: error?.message || String(error) }
      await env.DB.prepare(`
        UPDATE marketplace_promotion_apply_queue
        SET status = 'apply_error',
            send_status = ?,
            verify_status = 'not_verified',
            error_code = ?,
            error_message = ?,
            raw_response_masked = ?,
            response = ?,
            updated_at = datetime('now', '+7 hours')
        WHERE queue_id = ?
      `).bind(
        error?.shopee?.category === 'live_write_disabled' ? 'draft_local' : 'failed_api',
        cleanText(error?.shopee?.category || response.error),
        cleanText(response.message),
        compactJson(redactShopeeValue(error?.shopee || response), 12000),
        compactJson(response, 12000),
        queueId
      ).run()
      const row = await env.DB.prepare(`SELECT * FROM marketplace_promotion_apply_queue WHERE queue_id = ?`).bind(queueId).first()
      return { ...response, queue: publicPromotionQueueRow(row) }
    }
  }
  core.executePromotionApplyQueue = executePromotionApplyQueue

  async function listPromotionApplyQueue(env, options = {}) {
    await ensureShopeeDiscountTables(env)
    const filters = []
    const params = []
    for (const [field, value] of [
      ['platform', cleanText(options.platform).toLowerCase()],
      ['module', cleanText(options.module).toLowerCase()],
      ['shop', cleanText(options.shop)],
      ['status', cleanText(options.status).toLowerCase()]
    ]) {
      if (!value || value === 'all') continue
      filters.push(field === 'platform' || field === 'module' || field === 'status' ? `LOWER(${field}) = ?` : `${field} = ?`)
      params.push(value)
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    const limit = limitNumber(options.limit, 30, 1, 150)
    const { results } = await env.DB.prepare(`
      SELECT *
      FROM marketplace_promotion_apply_queue
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(...params, limit).all()
    return {
      status: 'ok',
      mode: 'promotion_apply_queue_list',
      rows: (results || []).map(publicPromotionQueueRow),
      safety: 'Danh sách hàng đợi nội bộ; dòng nào cũng chưa gửi lên sàn nếu sent_to_platform=false.'
    }
  }
  core.listPromotionApplyQueue = listPromotionApplyQueue

  async function decidePromotionApplyQueue(env, request, options = {}) {
    await ensureShopeeDiscountTables(env)
    const user = await getAdminUserFromRequest(request, env)
    if (!isPromotionApplyAdmin(user)) {
      return { status: 'error', error: 'admin_required', message: 'Chỉ tài khoản admin được duyệt hoặc từ chối hàng đợi promotion.' }
    }
    const queueId = cleanText(options.queue_id || options.queueId)
    const decision = cleanText(options.decision).toLowerCase()
    if (!queueId) return { status: 'error', error: 'missing_queue_id', message: 'Thiếu queue_id.' }
    const current = await env.DB.prepare(`
      SELECT *
      FROM marketplace_promotion_apply_queue
      WHERE queue_id = ?
      LIMIT 1
    `).bind(queueId).first()
    if (!current) return { status: 'error', error: 'queue_not_found', message: 'Không tìm thấy hàng đợi.' }
    const allowed = new Set(['approve', 'reject', 'request_data', 'mark_rollback_ready'])
    if (!allowed.has(decision)) return { status: 'error', error: 'invalid_decision', allowed_decisions: [...allowed] }
    const nextStatus = {
      approve: 'approved_waiting_execute_adapter',
      reject: 'rejected',
      request_data: 'needs_data',
      mark_rollback_ready: 'rollback_ready'
    }[decision]
    await env.DB.prepare(`
      UPDATE marketplace_promotion_apply_queue
      SET status = ?,
          approved_by = CASE WHEN ? = 'approve' THEN ? ELSE approved_by END,
          notes = COALESCE(NULLIF(?, ''), notes),
          updated_at = datetime('now', '+7 hours')
      WHERE queue_id = ?
    `).bind(nextStatus, decision, cleanText(user.username), cleanText(options.notes), queueId).run()
    const row = await env.DB.prepare(`SELECT * FROM marketplace_promotion_apply_queue WHERE queue_id = ?`).bind(queueId).first()
    return {
      status: 'ok',
      mode: 'promotion_apply_queue_decision',
      queue: publicPromotionQueueRow(row),
      safety: 'Quyết định chỉ đổi trạng thái hàng đợi. Chưa gửi lệnh ghi thật lên sàn.'
    }
  }
  core.decidePromotionApplyQueue = decidePromotionApplyQueue
}
