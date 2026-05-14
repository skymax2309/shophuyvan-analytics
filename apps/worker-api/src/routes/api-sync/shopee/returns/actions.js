export function installApiSyncShopeeReturnsActions(core) {
  const LAZADA_REVERSE_CANCEL_SELLER_DECIDE_PATH = core.LAZADA_REVERSE_CANCEL_SELLER_DECIDE_PATH
  const SHOPEE_ORDER_HANDLE_BUYER_CANCELLATION_PATH = core.SHOPEE_ORDER_HANDLE_BUYER_CANCELLATION_PATH
  const SHOPEE_RETURNS_ACCEPT_OFFER_PATH = core.SHOPEE_RETURNS_ACCEPT_OFFER_PATH
  const SHOPEE_RETURNS_CANCEL_DISPUTE_PATH = core.SHOPEE_RETURNS_CANCEL_DISPUTE_PATH
  const SHOPEE_RETURNS_CONFIRM_PATH = core.SHOPEE_RETURNS_CONFIRM_PATH
  const SHOPEE_RETURNS_DISPUTE_PATH = core.SHOPEE_RETURNS_DISPUTE_PATH
  const SHOPEE_RETURNS_GET_AVAILABLE_SOLUTIONS_PATH = core.SHOPEE_RETURNS_GET_AVAILABLE_SOLUTIONS_PATH
  const SHOPEE_RETURNS_GET_RETURN_DETAIL_PATH = core.SHOPEE_RETURNS_GET_RETURN_DETAIL_PATH
  const SHOPEE_RETURNS_GET_RETURN_DISPUTE_REASON_PATH = core.SHOPEE_RETURNS_GET_RETURN_DISPUTE_REASON_PATH
  const SHOPEE_RETURNS_GET_RETURN_LIST_PATH = core.SHOPEE_RETURNS_GET_RETURN_LIST_PATH
  const SHOPEE_RETURNS_GET_SHIPPING_CARRIER_PATH = core.SHOPEE_RETURNS_GET_SHIPPING_CARRIER_PATH
  const SHOPEE_RETURNS_OFFER_PATH = core.SHOPEE_RETURNS_OFFER_PATH
  const SHOPEE_RETURNS_QUERY_PROOF_PATH = core.SHOPEE_RETURNS_QUERY_PROOF_PATH
  const SHOPEE_RETURNS_UPLOAD_PROOF_PATH = core.SHOPEE_RETURNS_UPLOAD_PROOF_PATH
  const SHOPEE_RETURNS_UPLOAD_SHIPPING_PROOF_PATH = core.SHOPEE_RETURNS_UPLOAD_SHIPPING_PROOF_PATH
  const adsNumber = (...args) => core.adsNumber(...args)
  const applyReturnLedgerRowsToOrders = (...args) => core.applyReturnLedgerRowsToOrders(...args)
  const buildShopeeReturnLedgerRows = core.buildShopeeReturnLedgerRows
  const callLazadaWithShop = (...args) => core.callLazadaWithShop(...args)
  const cleanReturnListRange = (...args) => core.cleanReturnListRange(...args)
  const cleanReturnPageNo = (...args) => core.cleanReturnPageNo(...args)
  const cleanText = (...args) => core.cleanText(...args)
  const ensureReturnReverseLedgerTable = core.ensureReturnReverseLedgerTable
  const ensureShopeeReturnsTable = (...args) => core.ensureShopeeReturnsTable(...args)
  const fetchShopeeJson = (...args) => core.fetchShopeeJson(...args)
  const fetchShopeeJsonPost = (...args) => core.fetchShopeeJsonPost(...args)
  const fetchShopeeReturnDetailShop = (...args) => core.fetchShopeeReturnDetailShop(...args)
  const fetchShopeeReturnListShop = (...args) => core.fetchShopeeReturnListShop(...args)
  const getApiShops = (...args) => core.getApiShops(...args)
  const getShopeeAppFromRow = core.getShopeeAppFromRow
  const returnsRangeError = (...args) => core.returnsRangeError(...args)
  const roundAds = (...args) => core.roundAds(...args)
  const saveReturnReverseLedgerRows = core.saveReturnReverseLedgerRows
  const saveShopeeReturns = (...args) => core.saveShopeeReturns(...args)
  const signShopeeUrl = (...args) => core.signShopeeUrl(...args)
  const unixToIso = (...args) => core.unixToIso(...args)

  async function fetchShopeeReturnAuxShop(env, shop, returnSn, endpoint, mode) {
    const resultBase = {
      shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
      api_shop_id: shop.api_shop_id ? String(shop.api_shop_id) : '',
      platform: 'shopee',
      ok: false,
      return_sn: returnSn,
      request_id: '',
      error: '',
      message: '',
      response: null
    }
    if (!returnSn) return { ...resultBase, error: 'missing_return_sn', message: 'Missing return_sn' }
    if (!shop.api_shop_id) return { ...resultBase, error: 'missing_shop_id', message: 'Missing Shopee shop id' }
    try {
      const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
      const buildUrl = signShopeeUrl(app, endpoint, shop.access_token, shop.api_shop_id)
      const data = await fetchShopeeJson(buildUrl, { return_sn: returnSn })
      return {
        ...resultBase,
        ok: true,
        request_id: cleanText(data?.request_id),
        message: cleanText(data?.message || data?.msg),
        response: data?.response || data || null
      }
    } catch (error) {
      return { ...resultBase, error: `${mode}_failed`, message: error?.message || String(error) }
    }
  }
  core.fetchShopeeReturnAuxShop = fetchShopeeReturnAuxShop

  async function fetchShopeeReturnAux(env, options = {}, endpoint, mode) {
    const returnSn = cleanText(options.return_sn || options.returnSn)
    if (!returnSn) return { status: 'error', mode, endpoint, error: 'missing_return_sn', message: 'Missing return_sn', shops: [], response: null }
    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 50) || 50, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const rows = []
    for (const shop of shops) {
      const row = await fetchShopeeReturnAuxShop(env, shop, returnSn, endpoint, mode)
      rows.push(row)
      if (row.ok && !options.scan_all_shops && !options.scanAllShops) break
    }
    const okRows = rows.filter(item => item.ok)
    return {
      status: 'ok',
      mode,
      endpoint,
      return_sn: returnSn,
      shop_count: rows.length,
      ok_count: okRows.length,
      shops: rows,
      response: okRows[0]?.response || null
    }
  }
  core.fetchShopeeReturnAux = fetchShopeeReturnAux

  function fetchShopeeReturnDisputeReasons(env, options = {}) {
    return fetchShopeeReturnAux(env, options, SHOPEE_RETURNS_GET_RETURN_DISPUTE_REASON_PATH, 'shopee_returns_get_return_dispute_reason')
  }
  core.fetchShopeeReturnDisputeReasons = fetchShopeeReturnDisputeReasons

  function queryShopeeReturnProof(env, options = {}) {
    return fetchShopeeReturnAux(env, options, SHOPEE_RETURNS_QUERY_PROOF_PATH, 'shopee_returns_query_proof')
  }
  core.queryShopeeReturnProof = queryShopeeReturnProof

  function fetchShopeeReturnAvailableSolutions(env, options = {}) {
    return fetchShopeeReturnAux(env, options, SHOPEE_RETURNS_GET_AVAILABLE_SOLUTIONS_PATH, 'shopee_returns_get_available_solutions')
  }
  core.fetchShopeeReturnAvailableSolutions = fetchShopeeReturnAvailableSolutions

  function fetchShopeeReturnShippingCarrier(env, options = {}) {
    return fetchShopeeReturnAux(env, options, SHOPEE_RETURNS_GET_SHIPPING_CARRIER_PATH, 'shopee_returns_get_shipping_carrier')
  }
  core.fetchShopeeReturnShippingCarrier = fetchShopeeReturnShippingCarrier

  function isConfirmedReturnMutation(options = {}) {
    const value = options.confirm_action ?? options.confirmAction ?? options.execute_return_action ?? options.executeReturnAction
    if (value === true) return true
    const text = cleanText(value).toLowerCase()
    return ['true', '1', 'yes', 'confirm', 'execute', 'i_understand'].includes(text)
  }
  core.isConfirmedReturnMutation = isConfirmedReturnMutation

  function pickReturnMutationBody(options = {}, fields = []) {
    const body = {}
    for (const field of fields) {
      const value = options[field]
      if (value === undefined || value === null || value === '') continue
      body[field] = value
    }
    return body
  }
  core.pickReturnMutationBody = pickReturnMutationBody

  async function mutateShopeeReturn(env, options = {}, endpoint, mode, fields = [], requiredFields = []) {
    const returnSn = cleanText(options.return_sn || options.returnSn)
    const shopFilter = cleanText(options.shop)
    const body = pickReturnMutationBody({ ...options, return_sn: returnSn }, fields)
    const missingFields = requiredFields.filter(field => {
      const value = body[field]
      if (Array.isArray(value)) return value.length === 0
      return value === undefined || value === null || value === ''
    })
    if (!returnSn) missingFields.unshift('return_sn')
    if (!shopFilter) {
      return {
        status: 'error',
        mode,
        endpoint,
        error: 'missing_shop',
        message: 'Mutation endpoints require shop or api_shop_id filter.',
        dry_run: true,
        sent_to_shopee: false
      }
    }
    if (missingFields.length) {
      return {
        status: 'error',
        mode,
        endpoint,
        error: 'missing_required_fields',
        message: `Missing required fields: ${[...new Set(missingFields)].join(', ')}`,
        dry_run: true,
        sent_to_shopee: false
      }
    }
    if (!isConfirmedReturnMutation(options)) {
      return {
        status: 'blocked',
        mode,
        endpoint,
        message: 'This endpoint changes Shopee return/refund state. Send confirm_action=true with an explicit shop to execute.',
        dry_run: true,
        sent_to_shopee: false,
        request_body: body
      }
    }

    const shops = await getApiShops(env, 'shopee', shopFilter, 1)
    const shop = shops[0]
    if (!shop) {
      return { status: 'error', mode, endpoint, error: 'shop_not_found', message: `No Shopee API shop matched ${shopFilter}`, dry_run: false, sent_to_shopee: false }
    }
    try {
      const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
      const buildUrl = signShopeeUrl(app, endpoint, shop.access_token, shop.api_shop_id)
      const data = await fetchShopeeJsonPost(buildUrl, {}, body)
      return {
        status: 'ok',
        mode,
        endpoint,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        return_sn: returnSn,
        sent_to_shopee: true,
        request_id: cleanText(data?.request_id),
        error: cleanText(data?.error),
        message: cleanText(data?.message || data?.msg),
        response: data?.response || data || null
      }
    } catch (error) {
      return {
        status: 'error',
        mode,
        endpoint,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        return_sn: returnSn,
        sent_to_shopee: true,
        error: `${mode}_failed`,
        message: error?.message || String(error)
      }
    }
  }
  core.mutateShopeeReturn = mutateShopeeReturn

  function confirmShopeeReturn(env, options = {}) {
    return mutateShopeeReturn(env, options, SHOPEE_RETURNS_CONFIRM_PATH, 'shopee_returns_confirm', ['return_sn'], ['return_sn'])
  }
  core.confirmShopeeReturn = confirmShopeeReturn

  function offerShopeeReturn(env, options = {}) {
    return mutateShopeeReturn(
      env,
      options,
      SHOPEE_RETURNS_OFFER_PATH,
      'shopee_returns_offer',
      ['return_sn', 'proposed_solution', 'proposed_adjusted_refund_amount'],
      ['return_sn', 'proposed_solution']
    )
  }
  core.offerShopeeReturn = offerShopeeReturn

  function acceptShopeeReturnOffer(env, options = {}) {
    return mutateShopeeReturn(env, options, SHOPEE_RETURNS_ACCEPT_OFFER_PATH, 'shopee_returns_accept_offer', ['return_sn'], ['return_sn'])
  }
  core.acceptShopeeReturnOffer = acceptShopeeReturnOffer

  function disputeShopeeReturn(env, options = {}) {
    return mutateShopeeReturn(
      env,
      options,
      SHOPEE_RETURNS_DISPUTE_PATH,
      'shopee_returns_dispute',
      ['return_sn', 'email', 'dispute_reason_id', 'image_list', 'dispute_text_reason'],
      ['return_sn', 'email', 'dispute_reason_id']
    )
  }
  core.disputeShopeeReturn = disputeShopeeReturn

  function cancelShopeeReturnDispute(env, options = {}) {
    return mutateShopeeReturn(env, options, SHOPEE_RETURNS_CANCEL_DISPUTE_PATH, 'shopee_returns_cancel_dispute', ['return_sn', 'email'], ['return_sn', 'email'])
  }
  core.cancelShopeeReturnDispute = cancelShopeeReturnDispute

  function uploadShopeeReturnProof(env, options = {}) {
    return mutateShopeeReturn(env, options, SHOPEE_RETURNS_UPLOAD_PROOF_PATH, 'shopee_returns_upload_proof', ['return_sn', 'photo', 'description'], ['return_sn'])
  }
  core.uploadShopeeReturnProof = uploadShopeeReturnProof

  function uploadShopeeReturnShippingProof(env, options = {}) {
    return mutateShopeeReturn(
      env,
      options,
      SHOPEE_RETURNS_UPLOAD_SHIPPING_PROOF_PATH,
      'shopee_returns_upload_shipping_proof',
      ['return_sn', 'reverse_logistics_carrier_id', 'reverse_logistics_carrier_name', 'tracking_number', 'image_id_list', 'remarks'],
      ['return_sn', 'reverse_logistics_carrier_id']
    )
  }
  core.uploadShopeeReturnShippingProof = uploadShopeeReturnShippingProof

  function normalizeBuyerCancellationOperation(value) {
    const text = cleanText(value).toUpperCase()
    if (['ACCEPT', 'AGREE', 'YES', 'DONG_Y', 'DONG Y'].includes(text)) return 'ACCEPT'
    if (['REJECT', 'DECLINE', 'NO', 'TU_CHOI', 'TU CHOI'].includes(text)) return 'REJECT'
    return ''
  }
  core.normalizeBuyerCancellationOperation = normalizeBuyerCancellationOperation

  function isConfirmedBuyerCancellation(options = {}) {
    const value = options.confirm_action ?? options.confirmAction ?? options.execute_order_action ?? options.executeOrderAction
    if (value === true) return true
    const text = cleanText(value).toLowerCase()
    return ['true', '1', 'yes', 'confirm', 'execute', 'i_understand'].includes(text)
  }
  core.isConfirmedBuyerCancellation = isConfirmedBuyerCancellation

  async function loadOrderDecisionRow(env, platform, orderId, shopFilter = '') {
    if (!orderId) return null
    const conds = ["LOWER(COALESCE(platform, '')) = ?", 'order_id = ?']
    const params = [platform, orderId]
    if (shopFilter) {
      conds.push("LOWER(TRIM(COALESCE(shop, ''))) = LOWER(TRIM(?))")
      params.push(shopFilter)
    }
    const row = await env.DB.prepare(`
      SELECT order_id, platform, shop, oms_status, shipping_status, tracking_number, shipping_carrier, cancel_reason
      FROM orders_v2
      WHERE ${conds.join(' AND ')}
      LIMIT 1
    `).bind(...params).first()
    return row || null
  }
  core.loadOrderDecisionRow = loadOrderDecisionRow

  function isBuyerCancellationPending(row = {}) {
    return cleanText(row.shipping_status || row.oms_status).toUpperCase() === 'IN_CANCEL'
  }
  core.isBuyerCancellationPending = isBuyerCancellationPending

  async function updateLocalBuyerCancellationDecision(env, row = {}, operation) {
    const orderId = cleanText(row.order_id)
    if (!orderId) return 0
    if (operation === 'ACCEPT') {
      const result = await env.DB.prepare(`
        UPDATE orders_v2
        SET oms_status = 'CANCELLED',
            shipping_status = 'CANCELLED',
            order_type = 'cancel',
            cancel_reason = 'Đã đồng ý yêu cầu hủy của khách',
            oms_updated_at = datetime('now', '+7 hours')
        WHERE order_id = ?
      `).bind(orderId).run()
      return result.meta?.changes || 0
    }
    const restoreShipping = cleanText(row.tracking_number) ? 'LOGISTICS_PACKAGED' : 'LOGISTICS_REQUEST_CREATED'
    const result = await env.DB.prepare(`
      UPDATE orders_v2
      SET oms_status = 'PENDING',
          shipping_status = ?,
          order_type = 'normal',
          cancel_reason = 'Đã từ chối yêu cầu hủy của khách',
          oms_updated_at = datetime('now', '+7 hours')
      WHERE order_id = ?
    `).bind(restoreShipping, orderId).run()
    return result.meta?.changes || 0
  }
  core.updateLocalBuyerCancellationDecision = updateLocalBuyerCancellationDecision

  async function handleShopeeBuyerCancellationDecision(env, options = {}, orderRow = null) {
    const orderSn = cleanText(options.order_sn || options.orderSn || options.order_id || options.orderId)
    const shopFilter = cleanText(options.shop)
    const operation = normalizeBuyerCancellationOperation(options.operation || options.decision)
    const endpoint = SHOPEE_ORDER_HANDLE_BUYER_CANCELLATION_PATH
    if (!orderSn || !operation) {
      return { status: 'error', mode: 'shopee_buyer_cancellation_decide', endpoint, error: 'missing_required_fields', message: 'Thiếu order_sn/order_id hoặc operation ACCEPT/REJECT.', sent_to_shopee: false }
    }
    if (!shopFilter) {
      return { status: 'error', mode: 'shopee_buyer_cancellation_decide', endpoint, error: 'missing_shop', message: 'Cần truyền shop để tránh xác nhận nhầm đơn.', sent_to_shopee: false }
    }
    const localRow = orderRow || await loadOrderDecisionRow(env, 'shopee', orderSn, shopFilter)
    if (isConfirmedBuyerCancellation(options) && !localRow) {
      return {
        status: 'blocked',
        mode: 'shopee_buyer_cancellation_decide',
        endpoint,
        order_id: orderSn,
        message: 'Không tìm thấy đơn IN_CANCEL trong OMS. Hãy quét lại trạng thái trước khi gửi lệnh xác nhận hủy lên Shopee.',
        sent_to_shopee: false
      }
    }
    if (localRow && !isBuyerCancellationPending(localRow)) {
      return {
        status: 'blocked',
        mode: 'shopee_buyer_cancellation_decide',
        endpoint,
        message: 'Đơn này không còn ở trạng thái IN_CANCEL trong OMS. Hãy bấm Quét trạng thái rồi xử lý lại để tránh xác nhận nhầm.',
        sent_to_shopee: false,
        local_status: { oms_status: localRow.oms_status, shipping_status: localRow.shipping_status }
      }
    }
    if (!isConfirmedBuyerCancellation(options)) {
      return {
        status: 'blocked',
        mode: 'shopee_buyer_cancellation_decide',
        endpoint,
        message: 'Thao tác này xác nhận yêu cầu hủy thật trên Shopee. Gửi confirm_action=true sau khi kiểm tra đơn.',
        dry_run: true,
        sent_to_shopee: false,
        request_body: { order_sn: orderSn, operation }
      }
    }
    const shops = await getApiShops(env, 'shopee', shopFilter, 1)
    const shop = shops[0]
    if (!shop) return { status: 'error', mode: 'shopee_buyer_cancellation_decide', endpoint, error: 'shop_not_found', message: `Không tìm thấy shop Shopee API khớp ${shopFilter}`, sent_to_shopee: false }
    try {
      const app = getShopeeAppFromRow(env, shop, shop.api_partner_id || shop.shop_name || shop.user_name)
      const buildUrl = signShopeeUrl(app, endpoint, shop.access_token, shop.api_shop_id)
      const data = await fetchShopeeJsonPost(buildUrl, {}, { order_sn: orderSn, operation })
      const localUpdated = await updateLocalBuyerCancellationDecision(env, localRow || { order_id: orderSn }, operation)
      return {
        status: 'ok',
        mode: 'shopee_buyer_cancellation_decide',
        endpoint,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        order_id: orderSn,
        operation,
        sent_to_shopee: true,
        local_updated: localUpdated,
        request_id: cleanText(data?.request_id),
        message: cleanText(data?.message || data?.msg),
        response: data?.response || data || null
      }
    } catch (error) {
      return { status: 'error', mode: 'shopee_buyer_cancellation_decide', endpoint, order_id: orderSn, operation, sent_to_shopee: true, error: 'shopee_buyer_cancellation_failed', message: error?.message || String(error) }
    }
  }
  core.handleShopeeBuyerCancellationDecision = handleShopeeBuyerCancellationDecision

  async function findLazadaCancelReverseId(env, orderId) {
    if (!orderId) return ''
    await ensureReturnReverseLedgerTable(env)
    const row = await env.DB.prepare(`
      SELECT reverse_id
      FROM marketplace_return_reverse_ledger
      WHERE LOWER(COALESCE(platform, '')) = 'lazada'
        AND order_id = ?
        AND (
          LOWER(COALESCE(ledger_kind, '')) = 'cancel'
          OR LOWER(COALESCE(request_type, '')) LIKE '%cancel%'
        )
      ORDER BY datetime(COALESCE(updated_at_bangkok, synced_at, created_at_bangkok, '1970-01-01')) DESC
      LIMIT 1
    `).bind(orderId).first()
    return cleanText(row?.reverse_id)
  }
  core.findLazadaCancelReverseId = findLazadaCancelReverseId

  async function handleLazadaBuyerCancellationDecision(env, options = {}, orderRow = null) {
    const orderId = cleanText(options.order_id || options.orderId)
    const reverseOrderId = cleanText(options.reverse_order_id || options.reverseOrderId) || await findLazadaCancelReverseId(env, orderId)
    const shopFilter = cleanText(options.shop)
    const operation = normalizeBuyerCancellationOperation(options.operation || options.decision)
    const endpoint = LAZADA_REVERSE_CANCEL_SELLER_DECIDE_PATH
    if (!orderId || !operation) return { status: 'error', mode: 'lazada_buyer_cancellation_decide', endpoint, error: 'missing_required_fields', message: 'Thiếu order_id hoặc operation ACCEPT/REJECT.', sent_to_lazada: false }
    if (!shopFilter) return { status: 'error', mode: 'lazada_buyer_cancellation_decide', endpoint, error: 'missing_shop', message: 'Cần truyền shop để tránh xác nhận nhầm đơn.', sent_to_lazada: false }
    if (!reverseOrderId) {
      return {
        status: 'blocked',
        mode: 'lazada_buyer_cancellation_decide',
        endpoint,
        order_id: orderId,
        message: 'Lazada cần reverse_order_id để xác nhận hủy. Hãy bấm đồng bộ Lazada reverse/return trước rồi xử lý lại.',
        sent_to_lazada: false
      }
    }
    const localRow = orderRow || await loadOrderDecisionRow(env, 'lazada', orderId, shopFilter)
    if (isConfirmedBuyerCancellation(options) && !localRow) {
      return {
        status: 'blocked',
        mode: 'lazada_buyer_cancellation_decide',
        endpoint,
        order_id: orderId,
        reverse_order_id: reverseOrderId,
        message: 'Không tìm thấy đơn IN_CANCEL trong OMS. Hãy đồng bộ lại đơn/reverse trước khi gửi lệnh xác nhận hủy lên Lazada.',
        sent_to_lazada: false
      }
    }
    if (localRow && !isBuyerCancellationPending(localRow)) {
      return {
        status: 'blocked',
        mode: 'lazada_buyer_cancellation_decide',
        endpoint,
        order_id: orderId,
        message: 'Đơn này không còn ở trạng thái IN_CANCEL trong OMS. Hãy bấm Quét trạng thái rồi xử lý lại để tránh xác nhận nhầm.',
        sent_to_lazada: false,
        local_status: { oms_status: localRow.oms_status, shipping_status: localRow.shipping_status }
      }
    }
    if (!isConfirmedBuyerCancellation(options)) {
      return {
        status: 'blocked',
        mode: 'lazada_buyer_cancellation_decide',
        endpoint,
        order_id: orderId,
        reverse_order_id: reverseOrderId,
        message: 'Thao tác này xác nhận yêu cầu hủy thật trên Lazada. Gửi confirm_action=true sau khi kiểm tra đơn.',
        dry_run: true,
        sent_to_lazada: false
      }
    }
    const shops = await getApiShops(env, 'lazada', shopFilter, 1)
    const shop = shops[0]
    if (!shop) return { status: 'error', mode: 'lazada_buyer_cancellation_decide', endpoint, error: 'shop_not_found', message: `Không tìm thấy shop Lazada API khớp ${shopFilter}`, sent_to_lazada: false }
    try {
      const data = await callLazadaWithShop(env, shop, endpoint, {
        reverse_order_id: reverseOrderId,
        agree_cancel: operation === 'ACCEPT' ? 'true' : 'false',
        ...(options.reason_code || options.reasonCode ? { reason_code: cleanText(options.reason_code || options.reasonCode) } : {})
      })
      const localUpdated = await updateLocalBuyerCancellationDecision(env, localRow || { order_id: orderId }, operation)
      return {
        status: 'ok',
        mode: 'lazada_buyer_cancellation_decide',
        endpoint,
        shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
        api_shop_id: String(shop.api_shop_id || ''),
        order_id: orderId,
        reverse_order_id: reverseOrderId,
        operation,
        sent_to_lazada: true,
        local_updated: localUpdated,
        request_id: cleanText(data?.request_id),
        message: cleanText(data?.message || data?.msg),
        response: data?.data || data || null
      }
    } catch (error) {
      return { status: 'error', mode: 'lazada_buyer_cancellation_decide', endpoint, order_id: orderId, reverse_order_id: reverseOrderId, operation, sent_to_lazada: true, error: 'lazada_buyer_cancellation_failed', message: error?.message || String(error) }
    }
  }
  core.handleLazadaBuyerCancellationDecision = handleLazadaBuyerCancellationDecision

  async function handleBuyerCancellationDecision(env, options = {}) {
    const platform = cleanText(options.platform).toLowerCase()
    const orderId = cleanText(options.order_id || options.orderId || options.order_sn || options.orderSn)
    if (!platform || !orderId) return { status: 'error', error: 'missing_required_fields', message: 'Thiếu platform hoặc order_id.', sent_to_marketplace: false }
    const row = await loadOrderDecisionRow(env, platform, orderId, cleanText(options.shop))
    if (platform === 'shopee') return handleShopeeBuyerCancellationDecision(env, { ...options, order_sn: orderId }, row)
    if (platform === 'lazada') return handleLazadaBuyerCancellationDecision(env, { ...options, order_id: orderId }, row)
    return {
      status: 'blocked',
      mode: 'buyer_cancellation_decide',
      platform,
      order_id: orderId,
      message: 'Sàn này chưa có endpoint xác nhận hủy khách yêu cầu trong OMS. Shop không API xử lý bằng thao tác tay có log.',
      sent_to_marketplace: false
    }
  }
  core.handleBuyerCancellationDecision = handleBuyerCancellationDecision

  function returnSyncRange(options = {}) {
    if (options.update_time_from || options.updateTimeFrom || options.create_time_from || options.createTimeFrom || options.date_from || options.dateFrom) {
      return cleanReturnListRange(options)
    }
    const hours = Math.min(Math.max(Number(options.hours || options.last_hours || options.lastHours || 24) || 24, 1), 24 * 15)
    const to = Math.floor(Date.now() / 1000)
    const from = to - hours * 3600
    return {
      time_field: 'update_time',
      date_from: '',
      date_to: '',
      create_time_from: 0,
      create_time_to: 0,
      update_time_from: from,
      update_time_to: to
    }
  }
  core.returnSyncRange = returnSyncRange

  async function syncShopeeReturns(env, options = {}) {
    await ensureShopeeReturnsTable(env)
    await ensureReturnReverseLedgerTable(env)
    const range = returnSyncRange(options)
    const rangeError = returnsRangeError(range)
    const pageSize = Math.min(Math.max(Number(options.page_size || options.pageSize || 100) || 100, 1), 100)
    const maxPages = Math.min(Math.max(Number(options.max_pages || options.maxPages || 10) || 10, 1), 50)
    const includeDetail = options.include_detail !== false && options.includeDetail !== false
    if (rangeError) {
      return {
        status: 'error',
        mode: 'shopee_returns_sync',
        error: 'invalid_returns_range',
        message: rangeError,
        saved: 0,
        fetched_returns: 0,
        closed_returns: 0,
        refund_amount: 0,
        shops: []
      }
    }

    const shopLimit = Math.min(Math.max(Number(options.shopLimit || options.shop_limit || 100) || 100, 1), 200)
    const shops = await getApiShops(env, 'shopee', options.shop, shopLimit)
    const shopResults = []
    const rowsToSave = []
    const warnings = []

    for (const shop of shops) {
      const shopRows = []
      let pages = 0
      let detailChecked = 0
      let pageNo = cleanReturnPageNo(options.page_no ?? options.pageNo)
      let more = false
      do {
        const listResult = await fetchShopeeReturnListShop(env, shop, {
          ...options,
          ...range,
          page_no: pageNo,
          page_size: pageSize
        })
        pages++
        if (!listResult.ok) {
          warnings.push({ shop: listResult.shop, endpoint: SHOPEE_RETURNS_GET_RETURN_LIST_PATH, error: listResult.error, message: listResult.message })
          shopResults.push({ ...listResult, pages, detail_checked: detailChecked, saved: 0 })
          break
        }
        for (const row of listResult.rows || []) {
          let sourceRow = row
          if (includeDetail && row.return_sn) {
            detailChecked++
            const detail = await fetchShopeeReturnDetailShop(env, shop, row.return_sn)
            if (detail.ok && detail.detail) sourceRow = detail.detail
            else warnings.push({ shop: listResult.shop, return_sn: row.return_sn, endpoint: SHOPEE_RETURNS_GET_RETURN_DETAIL_PATH, error: detail.error, message: detail.message })
          }
          shopRows.push(sourceRow)
          rowsToSave.push(sourceRow)
        }
        more = Boolean(listResult.more)
        pageNo++
      } while (more && pages < maxPages)
      if (!shopResults.some(item => item.api_shop_id === String(shop.api_shop_id || '') && item.error)) {
        shopResults.push({
          shop: shop.shop_name || shop.user_name || String(shop.api_shop_id || ''),
          api_shop_id: String(shop.api_shop_id || ''),
          platform: 'shopee',
          ok: true,
          pages,
          more,
          total_rows: shopRows.length,
          detail_checked: detailChecked,
          saved: shopRows.length
        })
      }
    }

    const saved = await saveShopeeReturns(env, rowsToSave)
    const ledgerRows = rowsToSave.flatMap(row => buildShopeeReturnLedgerRows(row))
    const ledgerSaved = await saveReturnReverseLedgerRows(env, ledgerRows)
    const ordersUpdated = await applyReturnLedgerRowsToOrders(env, ledgerRows)
    const closedRows = ledgerRows.filter(row => Number(row.is_finance_closed || 0) === 1)
    return {
      status: 'ok',
      mode: 'shopee_returns_sync',
      endpoint: SHOPEE_RETURNS_GET_RETURN_LIST_PATH,
      note: 'Sync Returns Shopee realtime vào marketplace_returns và ledger hoàn/trả dùng chung. Chỉ dòng đã đóng mới được trừ vào lợi nhuận thuần.',
      ...range,
      update_time_from_at: unixToIso(range.update_time_from),
      update_time_to_at: unixToIso(range.update_time_to),
      shop_count: shops.length,
      ok_count: shopResults.filter(item => item.ok).length,
      fetched_returns: rowsToSave.length,
      detail_checked: shopResults.reduce((sum, item) => sum + Number(item.detail_checked || 0), 0),
      saved,
      ledger_saved: ledgerSaved,
      orders_updated: ordersUpdated,
      closed_returns: new Set(closedRows.map(row => row.reverse_id).filter(Boolean)).size,
      refund_amount: roundAds(closedRows.reduce((sum, row) => sum + adsNumber(row.effective_refund_amount), 0)),
      impacted_orders: new Set(closedRows.map(row => row.order_id).filter(Boolean)).size,
      warnings,
      shops: shopResults
    }
  }
  core.syncShopeeReturns = syncShopeeReturns
}
