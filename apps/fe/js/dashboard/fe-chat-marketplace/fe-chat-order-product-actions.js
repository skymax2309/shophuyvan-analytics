// NEO: Frontend chat sàn - nhóm order-product-actions. Giữ file dưới 30KB; tính năng mới tách thành file fe-chat-* riêng.
function appendChatReplySnippet(text) {
  const box = chatEl('chatReplyText')
  if (!box || box.disabled) {
    setChatGuardStatus('Chọn hội thoại trước khi chèn nội dung trả lời.', 'blocked')
    return
  }
  const current = box.value.trim()
  box.value = current ? `${current}\n${text}` : text
  box.focus()
  window.onChatReplyInput()
}

window.insertChatOrderSnippet = function(index) {
  const order = chatOrderPanelOrders(chatState.context || {})?.[Number(index)]
  if (!order) return
  const statusText = chatOrderStatusLabel(chatOrderShippingStatus(order) || chatOrderMainStatus(order), 'chưa cập nhật')
  const lines = [
    `Dạ shop kiểm tra đơn ${order.order_id || ''}:`,
    `Trạng thái hiện tại: ${statusText}.`,
    order.tracking_number ? `Mã vận đơn: ${order.tracking_number}.` : '',
    order.shipping_carrier ? `Đơn vị vận chuyển: ${order.shipping_carrier}.` : '',
    'Shop sẽ đối chiếu lại thông tin trên sàn trước khi xác nhận thêm ạ.'
  ].filter(Boolean)
  appendChatReplySnippet(lines.join(' '))
  if (isChatMobileView()) {
    // Trên điện thoại, sau khi chọn tin từ đơn hàng phải quay về khung chat để nhân viên thấy ô gửi.
    closeChatMobileContext()
    chatState.mobileThreadVisible = Boolean(chatState.activeId)
    chatState.mobileAttachOpen = false
    syncChatMobileShell()
    setTimeout(() => chatEl('chatReplyText')?.focus(), 40)
  }
  setChatGuardStatus('Đã chèn nội dung đơn hàng vào ô trả lời. Kiểm tra lại rồi bấm Gửi.', 'muted')
}

window.loadChatOrderLogistics = async function(index) {
  const order = chatOrderPanelOrders(chatState.context || {})?.[Number(index)]
  const orderId = chatOrderLogisticsKey(order)
  if (!order || !orderId) {
    setChatGuardStatus('Chưa tìm thấy đơn hàng để kiểm tra vận chuyển.', 'blocked')
    return
  }
  chatState.orderLogisticsLoadingId = orderId
  renderChatSetup(chatState.setupData || {})
  const platform = String(order.platform || chatState.activeConversation?.platform || '').trim().toLowerCase()
  try {
    let result = null
    if (platform === 'shopee') {
      // Nút theo dõi trong chat là thao tác đọc, dùng endpoint logistics Shopee thật khi shop có API.
      const data = await chatFetch('/api/operations/shopee/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_tracking_info',
          order_sn: orderId,
          payload: { order_sn: orderId }
        }),
        timeoutMs: 18000
      })
      if (String(data?.status || '').toLowerCase() === 'ok') {
        result = buildChatOrderLogisticsFromLive(order, data.response || data)
      } else {
        result = buildChatOrderLogisticsFallback(order, {
          status: 'error',
          source: 'OMS đã lưu',
          error: chatErrorMessage(data, 'Chưa đọc được hành trình live từ Shopee API.')
        })
      }
    } else {
      result = buildChatOrderLogisticsFallback(order, {
        source: platform === 'lazada'
          ? 'OMS/Lazada đã đồng bộ'
          : platform === 'tiktok'
            ? 'OMS/TikTok đã đồng bộ'
            : 'OMS đã lưu'
      })
    }
    chatState.orderLogisticsById.set(orderId, result)
    setChatGuardStatus(result.live_checked
      ? `Đã kiểm tra hành trình vận chuyển đơn ${orderId}.`
      : `Đã mở hành trình đơn ${orderId} từ dữ liệu OMS hiện có.`, result.error ? 'muted' : 'ok')
  } catch (error) {
    chatState.orderLogisticsById.set(orderId, buildChatOrderLogisticsFallback(order, {
      status: 'error',
      source: 'OMS đã lưu',
      error: `Chưa gọi được API vận chuyển live: ${chatErrorMessage(error)}`
    }))
    setChatGuardStatus(`Chưa gọi được API vận chuyển live cho đơn ${orderId}, đang hiển thị dữ liệu OMS.`, 'muted')
  } finally {
    if (chatState.orderLogisticsLoadingId === orderId) chatState.orderLogisticsLoadingId = ''
    renderChatSetup(chatState.setupData || {})
  }
}

window.loadChatAutoReplyLogs = async function(options = {}) {
  try {
    const data = await chatFetch('/api/chat/auto-reply/logs?limit=30')
    chatState.autoReplyLogs = data.logs || []
    renderChatSetup(chatState.setupData || {})
  } catch (error) {
    if (!options.silent) setChatGuardStatus(`Không tải được log auto-reply: ${chatErrorMessage(error)}`, 'blocked')
  }
}

window.runChatAutoReplyDryRun = async function() {
  if (chatState.autoReplyRunning) return
  chatState.autoReplyRunning = true
  const status = chatEl('chatAutoReplyStatus')
  if (status) status.textContent = 'Đang chạy thử auto-reply an toàn...'
  try {
    const current = collectChatSettings()
    const data = await chatFetch('/api/chat/auto-reply/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dry_run: true,
        force: true,
        platforms: current.ai_auto_reply_platforms,
        shops: current.ai_auto_reply_shops,
        limit: current.ai_auto_reply_limit,
        hold_seconds: current.ai_auto_reply_hold_seconds,
        max_age_hours: current.ai_auto_reply_max_age_hours
      }),
      timeoutMs: 60000
    })
    await window.loadChatAutoReplyLogs({ silent: true })
    const line = `Chạy thử xong: ${Number(data.processed || 0).toLocaleString('vi-VN')} hội thoại, chế độ ${data.mode || 'dry_run'}.`
    setChatGuardStatus(line, 'ok')
    if (chatEl('chatAutoReplyStatus')) chatEl('chatAutoReplyStatus').textContent = line
  } catch (error) {
    const message = `Không chạy thử auto-reply được: ${chatErrorMessage(error)}`
    setChatGuardStatus(message, 'blocked')
    if (chatEl('chatAutoReplyStatus')) chatEl('chatAutoReplyStatus').textContent = message
  } finally {
    chatState.autoReplyRunning = false
  }
}

window.insertChatOrderLogisticsSnippet = function(orderId) {
  const target = String(orderId || '').trim()
  const state = chatState.orderLogisticsById.get(target)
  const order = chatOrderById(target)
  const fallback = order ? buildChatOrderLogisticsFallback(order) : null
  const text = state?.reply_text || fallback?.reply_text || ''
  if (!text) {
    setChatGuardStatus('Chưa có nội dung hành trình để chèn. Bấm Theo dõi vận chuyển trước.', 'blocked')
    return
  }
  appendChatReplySnippet(text)
  if (isChatMobileView()) {
    closeChatMobileContext()
    chatState.mobileThreadVisible = Boolean(chatState.activeId)
    chatState.mobileAttachOpen = false
    syncChatMobileShell()
    setTimeout(() => chatEl('chatReplyText')?.focus(), 40)
  }
  setChatGuardStatus('Đã chèn hành trình vận chuyển vào ô trả lời. Kiểm tra lại câu chữ rồi bấm Gửi.', 'muted')
}

window.openChatOrderCard = async function(orderId) {
  chatState.activeSideTab = 'orders'
  if (!chatState.context && chatState.activeId) {
    await loadChatConversationContext(chatState.activeId).catch(() => null)
  }
  renderChatSetup(chatState.setupData || {})
  const target = String(orderId || '').trim()
  const card = target ? document.querySelector(`[data-chat-order-id="${CSS.escape(target)}"]`) : null
  if (card) {
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    card.classList.add('chat-order-card-focus')
    setTimeout(() => card.classList.remove('chat-order-card-focus'), 1400)
  }
  if (isChatMobileView()) document.body.classList.add('chat-mobile-context-open')
}

async function maybeAutoSyncChatOrders(context = chatState.context || {}) {
  const syncState = chatOrderSyncCapability(chatState.activeConversation, context)
  if (!syncState.canSync || !syncState.syncRecommended || chatState.orderPanelSyncing) return
  const lastAt = Number(chatState.orderPanelAutoSyncAt.get(syncState.syncKey) || 0)
  if (lastAt && Date.now() - lastAt < 5 * 60 * 1000) return
  chatState.orderPanelAutoSyncAt.set(syncState.syncKey, Date.now())
  await window.syncChatOrdersForConversation({ quiet: true, auto: true }).catch(() => null)
}

window.syncChatOrdersForConversation = async function(options = {}) {
  const syncState = chatOrderSyncCapability(chatState.activeConversation, chatState.context || {})
  if (!syncState.canSync) {
    chatState.orderPanelSyncStatus = syncState.reason
    renderChatSetup(chatState.setupData || {})
    if (!options.quiet) setChatGuardStatus(syncState.reason, syncState.tone || 'muted')
    return { skipped: true, reason: syncState.reason }
  }
  if (chatState.orderPanelSyncing) return { skipped: true, reason: 'syncing' }
  chatState.orderPanelSyncing = true
  // Sync nền chỉ kéo đúng sàn + shop đang chat để tránh spam request và tránh lôi đơn của shop khác vào context.
  chatState.orderPanelSyncStatus = options.auto
    ? `Đang kéo nền đơn hàng ${chatPlatformLabel(syncState.platform)} · ${syncState.displayName}...`

    : `Đang đồng bộ đơn hàng ${chatPlatformLabel(syncState.platform)} · ${syncState.displayName}...`
  renderChatSetup(chatState.setupData || {})
  if (chatState.activeConversation) renderChatThread(chatState.activeConversation, chatState.messages || [])
  try {
    const data = await chatFetch('/api/advanced/features', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sync_orders',
        platform: syncState.platform,
        shop: syncState.shopValue,
        days: syncState.platform === 'lazada' ? 60 : 15,
        limit: syncState.platform === 'lazada' ? 40 : 80
      }),
      timeoutMs: 90000
    })
    const shopResult = Array.isArray(data.shops) ? data.shops[0] : data
    const fetched = Number(shopResult?.fetched || data.fetched || 0)
    const importedOrders = Number(shopResult?.imported_orders || data.imported_orders || 0)
    const importedItems = Number(shopResult?.imported_items || data.imported_items || 0)
    const warningText = Array.isArray(shopResult?.warnings) && shopResult.warnings.length
      ? ` Cảnh báo: ${shopResult.warnings.map(item => item?.message || item?.reason || '').filter(Boolean).join(' ')}`
      : ''
    chatState.orderPanelSyncStatus = `Đã đồng bộ ${fetched.toLocaleString('vi-VN')} đơn, lưu ${importedOrders.toLocaleString('vi-VN')} đơn và ${importedItems.toLocaleString('vi-VN')} dòng sản phẩm cho ${syncState.displayName}.${warningText}`.trim()
    chatState.orderPanelAutoSyncAt.set(syncState.syncKey, Date.now())
    const activeId = Number(chatState.activeConversation?.id || chatState.activeId || 0)
    if (activeId) await loadChatConversationContext(activeId)
    if (!options.quiet) setChatGuardStatus(chatState.orderPanelSyncStatus, 'ok')
    return { status: 'ok', data }
  } catch (error) {
    chatState.orderPanelSyncStatus = `Không đồng bộ được đơn hàng: ${chatErrorMessage(error)}`
    if (!options.quiet) setChatGuardStatus(chatState.orderPanelSyncStatus, 'blocked')
    return { status: 'error', error: chatErrorMessage(error) }
  } finally {
    chatState.orderPanelSyncing = false
    renderChatSetup(chatState.setupData || {})
    if (chatState.activeConversation) renderChatThread(chatState.activeConversation, chatState.messages || [])
  }
}

window.sendChatProductCardFromPanel = async function(index, btn) {
  const selectedProduct = chatDisplayProductRows(chatState.context || {})?.[Number(index)]
  if (!selectedProduct) return
  if (!chatState.activeConversation) {
    setChatGuardStatus('Chọn hội thoại trước khi gửi thẻ sản phẩm.', 'blocked')
    return
  }
  const isShopee = String(chatState.activeConversation.platform || selectedProduct.platform || '').toLowerCase() === 'shopee'
  const productItemId = chatProductItemId(selectedProduct)
  if (!isShopee || !productItemId) {
    setChatGuardStatus(isShopee
      ? 'Sản phẩm này thiếu item_id Shopee nên chưa gửi được thẻ sản phẩm chính thức. Hãy đồng bộ lại catalog đúng shop.'
      : 'Thẻ sản phẩm chính thức hiện chỉ mở cho Shopee SellerChat API; sàn khác chưa có adapter gửi thẻ.', 'blocked')
    return
  }
  const oldText = btn?.textContent || ''
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang gửi...'
  }
  try {
    const data = await chatFetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: chatState.activeConversation.id || '',
        conversation_id: chatState.activeConversation.conversation_id || '',
        platform: chatState.activeConversation.platform || '',
        shop: chatState.activeConversation.shop || '',
        content: '',
        message_type: 'product_card',
        source: 'product_card',
        product_url: chatProductUrl(selectedProduct),
        product_item_id: productItemId,
        related_product_name: selectedProduct.product_name || selectedProduct.variation_name || chatProductSku(selectedProduct) || ''
      })
    })
    await openChatConversation(chatState.activeConversation.id, { silent: true })
    setChatGuardStatus(data.sent_to_platform
      ? 'Đã gửi thẻ sản phẩm chính thức qua Shopee.'
      : (data.note || 'Đã lưu thẻ sản phẩm trong OMS, chưa xác nhận gửi lên sàn.'), data.sent_to_platform ? 'ok' : 'muted')
  } catch (error) {
    setChatGuardStatus(`Không gửi được thẻ sản phẩm: ${chatErrorMessage(error)}`, 'blocked')
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Chèn thẻ SP'
    }
  }
}

window.insertChatProductSnippet = function(index) {
  return window.sendChatProductCardFromPanel(index, null)
}

window.filterChatProductPanel = function(value) {
  chatState.productPanelQuery = String(value || '')
  chatState.productPanelError = ''
  chatState.productPanelLoadedQuery = ''
  renderChatSetup(chatState.setupData || {})
  const input = chatEl('chatProductSearchInline')
  if (input) {
    input.focus()
    const end = input.value.length
    input.setSelectionRange(end, end)
  }
  if (chatState.productPanelSearchTimer) clearTimeout(chatState.productPanelSearchTimer)
  chatState.productPanelSearchTimer = setTimeout(() => {
    loadChatProductPanelProducts().catch(() => null)
  }, 260)
}

window.syncChatProductsForConversation = async function() {
  const target = chatProductSyncCapability(chatState.activeConversation)
  if (!target.canSync) {
    chatState.productPanelSyncStatus = target.reason
    renderChatSetup(chatState.setupData || {})
    setChatGuardStatus(target.reason, target.tone || 'muted')
    return
  }
  if (chatState.productPanelSyncing) return
  chatState.productPanelSyncing = true
  chatState.productPanelSyncStatus = `Đang đồng bộ catalog ${chatPlatformLabel(target.platform)} · ${target.displayName}...`
  renderChatSetup(chatState.setupData || {})
  try {
    let page = 0
    let offset = 0
    let hasMore = true
    const totals = {
      fetched_products: 0,
      synced_products: 0,
      saved_product_knowledge: 0,
      synced_variations: 0
    }
    while (hasMore && page < 30) {
      page += 1
      chatState.productPanelSyncStatus = `Đang đồng bộ sản phẩm lượt ${page} cho ${target.displayName}...`
      renderChatSetup(chatState.setupData || {})
      const data = await chatFetch('/api/products/sync-api-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: target.platform,
          shop: target.shopValue,
          limit: 500,
          offset,
          batchLimit: 40,
          includeOutOfStock: false
        }),
        timeoutMs: 60000
      })
      totals.fetched_products += Number(data.fetched_products || 0)
      totals.synced_products += Number(data.synced_products || 0)
      totals.saved_product_knowledge += Number(data.saved_product_knowledge || 0)
      totals.synced_variations += Number(data.synced_variations || 0)
      const shopResult = Array.isArray(data.shops) ? data.shops[0] : data
      hasMore = Boolean(shopResult?.has_more || data.has_more)
      const nextOffset = Number(shopResult?.next_offset || data.next_offsets?.[0]?.next_offset || 0)
      if (!hasMore || !nextOffset || nextOffset <= offset) break
      offset = nextOffset
    }
    chatState.productPanelSyncStatus = `Đã đồng bộ ${Number(totals.synced_products || totals.saved_product_knowledge || 0).toLocaleString('vi-VN')} sản phẩm · ${Number(totals.synced_variations || 0).toLocaleString('vi-VN')} phân loại cho ${target.displayName}.`
    const activeId = Number(chatState.activeConversation?.id || chatState.activeId || 0)
    if (activeId) await loadChatConversationContext(activeId)
    if (chatProductPanelQueryText()) await loadChatProductPanelProducts()
    const productModal = chatEl('chatProductModal')
    if (productModal && !productModal.hidden) loadChatProductModalProducts({ reset: true }).catch(() => null)
    setChatGuardStatus(chatState.productPanelSyncStatus, 'ok')
  } catch (error) {
    const syncErrorMessage = `Không đồng bộ được sản phẩm: ${chatErrorMessage(error)}`
    chatState.productPanelSyncStatus = syncErrorMessage
    const activeId = Number(chatState.activeConversation?.id || chatState.activeId || 0)
    if (activeId) {
      try {
        const params = new URLSearchParams()
        params.set('id', String(activeId))
        params.set('limit', '80')
        const fallback = await chatFetch(`/api/chat/products?${params}`, { timeoutMs: 20000 })
        const fallbackProducts = Array.isArray(fallback.products) ? fallback.products : []
        if (fallbackProducts.length) {
          // Khi API đồng bộ mới lỗi mạng/token, vẫn dùng catalog OMS đã lưu đúng shop để CSKH không bị trắng panel.
          chatState.context = {
            ...(chatState.context || {}),
            product_catalog: fallbackProducts,
            product_catalog_index: fallbackProducts,
            product_catalog_summary: {
              ...(chatState.context?.product_catalog_summary || {}),
              loaded_from_api: true,
              total_products: Number(fallback.total_products || fallbackProducts.length || 0),
              prompt_index_products: fallbackProducts.length
            }
          }
          chatState.productPanelSyncStatus = `${syncErrorMessage}. Đang hiển thị catalog đã lưu trong OMS cho đúng shop.`
        }
      } catch (fallbackError) {
        chatState.productPanelError = chatErrorMessage(fallbackError)
      }
    }
    setChatGuardStatus(chatState.productPanelSyncStatus, 'blocked')
  } finally {
    chatState.productPanelSyncing = false
    renderChatSetup(chatState.setupData || {})
  }
}
