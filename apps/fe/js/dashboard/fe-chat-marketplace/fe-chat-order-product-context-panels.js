// NEO: Frontend chat sàn - nhóm order-product-context-panels. Giữ file dưới 30KB; tính năng mới tách thành file fe-chat-* riêng.
function renderChatOrderItems(items = []) {
  if (!items.length) return '<div class="chat-context-muted">Chưa có dòng sản phẩm trong đơn.</div>'
  const cleanOrderItemText = value => String(value || '')
    .replace(/\s*\/\/\s*NEO:[^\r\n]*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return items.slice(0, 4).map(item => `
    <div class="chat-context-item">
      ${item.image_url ? `<img src="${chatEscape(item.image_url)}" alt="">` : '<div class="chat-context-thumb">SP</div>'}
      <div>
        <div class="chat-context-name">${chatEscape(chatShortText(cleanOrderItemText(item.product_name) || item.sku || 'Sản phẩm'))}</div>

        <div class="chat-context-meta">SKU: ${chatEscape(item.sku || 'chưa có')} · SL: ${Number(item.qty || 0).toLocaleString('vi-VN')}</div>
      </div>
    </div>
  `).join('')
}

function chatOrderMainStatus(order = {}) {
  return order.oms_status || order.status || order.order_status || ''
}

function chatOrderShippingStatus(order = {}) {
  return order.shipping_status || order.logistics_status || order.delivery_status || order.oms_status || ''
}

function chatNormalizeOrderStatus(value) {
  if (window.SHV_ORDER_STATUS_CORE?.normalize) return window.SHV_ORDER_STATUS_CORE.normalize(value)
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
}

function chatOrderStatusLabel(value, fallback = 'Đang xử lý') {
  if (window.SHV_ORDER_STATUS_CORE?.label) return window.SHV_ORDER_STATUS_CORE.label(value, fallback)
  const raw = String(value || '').trim()
  if (!raw) return fallback
  const text = chatNormalizeOrderStatus(raw)
  // Gom mã trạng thái từ Shopee/TikTok/Lazada về tiếng Việt để CSKH nhìn được ngay.
  if (/RETURN|REFUND|TRA HANG|HOAN/.test(text)) return 'Đang hoàn/trả hàng'
  if (/CANCEL|HUY/.test(text)) return 'Đã hủy'
  if (/COMPLETED|DELIVERED|RECEIVED|GIAO THANH CONG|DA GIAO/.test(text)) return 'Đã giao thành công'
  if (/SHIPPED|SHIPPING|TO_CONFIRM_RECEIVE|DANG GIAO|VAN CHUYEN|IN_TRANSIT/.test(text)) return 'Đang giao'
  if (/READY_TO_SHIP|PICKUP|AWAITING_SHIPMENT|LOGISTICS_REQUEST|LOGISTICS_PENDING|PACKAGED|CHO LAY HANG/.test(text)) return 'Chờ lấy hàng'
  if (/UNPAID|PENDING_PAYMENT|CHO THANH TOAN/.test(text)) return 'Chờ thanh toán'
  if (/PENDING|PROCESS|CONFIRM|WAIT|NEW|CHO XU LY|DANG XU LY/.test(text)) return 'Đang xử lý'
  return raw
}

function chatOrderStatusClass(value) {
  if (window.SHV_ORDER_STATUS_CORE?.uiClass) return window.SHV_ORDER_STATUS_CORE.uiClass(value)
  const text = chatNormalizeOrderStatus(value)
  if (/COMPLETED|DELIVERED|RECEIVED|DA GIAO|GIAO THANH CONG/.test(text)) return 'ok'
  if (/CANCEL|RETURN|REFUND|FAILED|HUY|HOAN|TRA/.test(text)) return 'bad'
  if (/SHIPPED|SHIPPING|PICKUP|LOGISTICS|READY|DANG GIAO|DA LAY|VAN CHUYEN|IN_TRANSIT/.test(text)) return 'ship'
  return 'wait'
}

function chatOrderLogisticsKey(order = {}) {
  return String(order.order_id || order.order_sn || '').trim()
}

function chatOrderLogisticsTime(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const asNumber = Number(raw)
  if (Number.isFinite(asNumber) && asNumber > 0) return chatTime(asNumber)
  return chatTime(raw)
}

function chatFirstText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function chatCollectTrackingEvents(raw) {
  const root = raw?.response || raw?.data || raw || {}
  const events = []
  const seen = new Set()
  const visit = item => {
    if (!item) return
    if (Array.isArray(item)) {
      item.forEach(visit)
      return
    }
    if (typeof item !== 'object') return
    const description = chatFirstText(
      item.description,
      item.message,
      item.content,
      item.detail,
      item.update_description,
      item.status_description,
      item.logistics_status,
      item.status
    )
    const status = chatFirstText(
      item.status,
      item.logistics_status,
      item.status_code,
      item.status_description,
      item.description
    )
    const location = chatFirstText(item.location, item.station, item.city, item.state, item.province)
    const timeValue = chatFirstText(
      item.update_time,
      item.event_time,
      item.time,
      item.ctime,
      item.create_time,
      item.logistics_create_time
    )
    if (description || status || location || timeValue) {
      const key = [timeValue, status, description, location].join('|')
      if (!seen.has(key)) {
        seen.add(key)
        events.push({
          label: chatOrderStatusLabel(status || description, status || 'Cập nhật vận chuyển'),
          description: description || status || 'Cập nhật vận chuyển',
          location,
          time: chatOrderLogisticsTime(timeValue),
          raw_time: timeValue,
          done: true
        })
      }
    }
    for (const key of ['tracking_info', 'tracking_info_list', 'tracking_list', 'tracking_detail', 'details', 'events', 'logistics_info', 'logistics_info_list', 'list', 'items']) {
      if (Array.isArray(item[key])) visit(item[key])
    }
  }
  visit(root)
  return events
    .sort((a, b) => {
      const ta = Number(a.raw_time || 0)
      const tb = Number(b.raw_time || 0)
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta
      return String(b.time || '').localeCompare(String(a.time || ''))
    })
    .slice(0, 8)
}

function chatLocalLogisticsSteps(order = {}) {
  const mainStatus = chatOrderMainStatus(order)
  const shippingStatus = chatOrderShippingStatus(order)
  const normalized = chatNormalizeOrderStatus(`${shippingStatus} ${mainStatus}`)
  const hasTracking = Boolean(String(order.tracking_number || '').trim())
  const isDelivered = /COMPLETED|DELIVERED|RECEIVED|DA GIAO|GIAO THANH CONG/.test(normalized)
  const isShipping = isDelivered || /SHIPPED|SHIPPING|IN_TRANSIT|DANG GIAO|VAN CHUYEN|DA LAY|PICKED|PICKUP_DONE/.test(normalized)
  const isReturn = /RETURN|REFUND|HOAN|TRA/.test(normalized)
  const isCancelled = /CANCEL|HUY/.test(normalized)
  const isPacked = hasTracking || isShipping || isDelivered || /READY|PICKUP|LOGISTICS|PACKAGED|CHO LAY/.test(normalized)
  const steps = [
    {
      label: 'Tạo đơn',
      description: order.order_date ? `Đơn tạo lúc ${chatTime(order.order_date)}` : 'Đơn đã có trong OMS.',
      time: chatTime(order.order_date || order.created_at),
      done: true
    },
    {
      label: hasTracking ? 'Có mã vận đơn' : 'Chưa có mã vận đơn',
      description: hasTracking
        ? `${order.shipping_carrier || 'Đơn vị vận chuyển'} · ${order.tracking_number}`
        : 'OMS chưa có tracking, cần đồng bộ đơn hoặc kiểm tra trên sàn.',
      time: '',
      done: hasTracking
    },
    {
      label: isShipping || isDelivered ? 'Đã lấy hàng / đang vận chuyển' : 'Chờ lấy hàng',
      description: chatOrderStatusLabel(shippingStatus || mainStatus, 'Chưa cập nhật vận chuyển'),
      time: '',
      done: isShipping || isDelivered || isPacked
    }
  ]
  if (isDelivered) {
    steps.push({ label: 'Đã giao thành công', description: 'Đơn đã hoàn tất theo trạng thái OMS.', time: '', done: true })
  } else if (isReturn) {
    steps.push({ label: 'Đang hoàn/trả', description: 'Đơn có tín hiệu hoàn/trả, cần kiểm tra tab Hoàn hàng nếu khách hỏi thêm.', time: '', done: true })
  } else if (isCancelled) {
    steps.push({ label: 'Đã hủy', description: 'Đơn đã hủy theo trạng thái OMS.', time: '', done: true })
  } else {
    steps.push({ label: 'Chưa giao xong', description: 'Chưa thấy trạng thái giao thành công trong OMS.', time: '', done: false })
  }
  return steps
}

function buildChatOrderLogisticsFallback(order = {}, options = {}) {
  const statusLabel = chatOrderStatusLabel(chatOrderShippingStatus(order) || chatOrderMainStatus(order), 'chưa cập nhật')
  const tracking = String(order.tracking_number || '').trim()
  const carrier = String(order.shipping_carrier || '').trim()
  const orderId = chatOrderLogisticsKey(order)
  const latestLine = `${statusLabel}${carrier ? ` qua ${carrier}` : ''}${tracking ? `, mã vận đơn ${tracking}` : ''}`
  return {
    status: options.status || 'local',
    source: options.source || 'OMS đã lưu',
    live_checked: false,
    order_id: orderId,
    status_label: statusLabel,
    latest_text: latestLine,
    latest_time: '',
    reply_text: `Dạ shop kiểm tra đơn ${orderId}: hiện đơn đang ${latestLine}. Dữ liệu này lấy từ OMS đã đồng bộ gần nhất, shop sẽ tiếp tục theo dõi và báo mình nếu sàn cập nhật thêm ạ.`,
    steps: chatLocalLogisticsSteps(order),
    error: options.error || ''
  }
}

function buildChatOrderLogisticsFromLive(order = {}, response = {}) {
  const raw = response?.response || response
  const events = chatCollectTrackingEvents(raw)
  const fallback = buildChatOrderLogisticsFallback(order, { source: 'OMS + API vận chuyển' })
  const latest = events[0] || null
  const liveTracking = chatFirstText(
    raw?.response?.tracking_number,
    raw?.response?.tracking_no,
    raw?.tracking_number,
    raw?.tracking_no
  )
  const tracking = liveTracking || order.tracking_number || ''
  const carrier = chatFirstText(raw?.response?.shipping_carrier, raw?.response?.logistics_channel_name, raw?.shipping_carrier, raw?.carrier, order.shipping_carrier)
  const latestText = latest
    ? [latest.description, latest.location].filter(Boolean).join(' · ')
    : fallback.latest_text
  return {
    ...fallback,
    status: 'ok',
    source: 'Shopee logistics API',
    live_checked: true,
    latest_text: latestText,
    latest_time: latest?.time || '',
    steps: events.length ? events : fallback.steps,
    reply_text: [
      `Dạ shop kiểm tra đơn ${chatOrderLogisticsKey(order)}:`,
      latestText ? `cập nhật mới nhất là ${latestText}.` : `trạng thái hiện tại ${fallback.status_label}.`,
      tracking ? `Mã vận đơn ${tracking}.` : '',
      carrier ? `Đơn vị vận chuyển ${carrier}.` : '',
      latest?.time ? `Thời gian cập nhật ${latest.time}.` : '',
      'Shop sẽ tiếp tục theo dõi giúp mình ạ.'
    ].filter(Boolean).join(' ')
  }
}

function renderChatOrderLogistics(order = {}) {
  const orderId = chatOrderLogisticsKey(order)
  if (!orderId) return ''
  const orderArg = chatEscape(JSON.stringify(orderId))
  const state = chatState.orderLogisticsById.get(orderId)
  if (chatState.orderLogisticsLoadingId === orderId) {
    return '<div class="chat-order-logistics loading">Đang kiểm tra hành trình vận chuyển...</div>'
  }
  if (!state) return ''
  const steps = Array.isArray(state.steps) ? state.steps : []
  return `
    <div class="chat-order-logistics ${state.error ? 'warn' : ''}">
      <div class="chat-order-logistics-head">
        <div>
          <b>${chatEscape(state.live_checked ? 'Hành trình vận chuyển' : 'Hành trình từ OMS')}</b>
          <span>${chatEscape(state.source || 'OMS đã lưu')}${state.latest_time ? ` · ${chatEscape(state.latest_time)}` : ''}</span>
        </div>
        <button type="button" onclick="insertChatOrderLogisticsSnippet(${orderArg})">Chèn hành trình</button>
      </div>
      ${state.error ? `<div class="chat-order-logistics-error">${chatEscape(state.error)}</div>` : ''}
      <div class="chat-order-logistics-latest">${chatEscape(state.latest_text || state.status_label || 'Chưa có cập nhật mới.')}</div>
      <div class="chat-order-logistics-steps">
        ${steps.map(step => `
          <div class="chat-order-logistics-step ${step.done ? 'done' : ''}">
            <i></i>
            <div>
              <b>${chatEscape(step.label || 'Cập nhật')}</b>
              <span>${chatEscape(step.description || '')}</span>
              ${step.time ? `<small>${chatEscape(step.time)}</small>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `
}

function renderChatOrdersPanel(context) {
  if (!chatState.activeConversation) return '<div class="chat-empty">Chọn hội thoại để xem đơn hàng liên quan.</div>'
  if (!context) return '<div class="chat-empty">Đang tải đơn hàng...</div>'
  const hardOrders = Array.isArray(context.orders) ? context.orders : []
  const softOrders = Array.isArray(context.soft_orders) ? context.soft_orders : []
  const referenceOrders = Array.isArray(context.reference_orders) ? context.reference_orders : []
  const panelOrders = [...hardOrders, ...softOrders]
  const referenceNotice = referenceOrders.length
    ? `<div class="chat-context-note">Đã ẩn ${referenceOrders.length.toLocaleString('vi-VN')} đơn tham chiếu cùng shop vì chưa khớp chắc với khách trong hội thoại. Bấm Đồng bộ đơn hàng hoặc yêu cầu khách gửi mã đơn trước khi trả lời trạng thái.</div>`
    : ''
  if (!panelOrders.length) {
    return `${referenceNotice}<div class="chat-empty">Chưa khớp được đơn hàng chính xác với hội thoại này.</div>`
  }
  const visibleSoftOrders = softOrders.slice(0, 3)
  const hiddenSoftCount = Math.max(0, softOrders.length - visibleSoftOrders.length)
  const renderOrderCard = (order, index) => {
    const mainStatus = chatOrderMainStatus(order)
    const shippingStatus = chatOrderShippingStatus(order)
    const statusClass = chatOrderStatusClass(shippingStatus || mainStatus)
    const displayStatus = chatOrderStatusLabel(shippingStatus || mainStatus, 'Chưa cập nhật')
    const mainStatusLabel = chatOrderStatusLabel(mainStatus, displayStatus)
    const matchTone = String(order.match_tone || (order.match_type === 'soft' ? 'warn' : 'api')).trim()
    const matchLabel = String(order.match_label || (order.match_type === 'soft' ? 'Đơn khớp mềm, cần kiểm tra' : 'Đơn khớp chắc')).trim()
    const matchReason = String(order.match_reason || '').trim()
    return `
      <div class="chat-context-card chat-order-card ${order.match_type === 'soft' ? 'soft-match' : 'hard-match'}" data-chat-order-id="${chatEscape(order.order_id || '')}">
        <div class="chat-context-head">
          <div>
            <div class="chat-context-title">Đơn ${chatEscape(order.order_id || 'chưa rõ mã')}</div>
            <div class="chat-context-meta">${chatEscape(chatTime(order.order_date || order.created_at))} | ${chatEscape(order.platform || '')} | ${chatEscape(order.shop || '')}</div>
          </div>
          <span class="chat-pill ${matchTone}">${chatEscape(matchLabel)}</span>
        </div>
        ${matchReason ? `<div class="chat-context-muted">${chatEscape(matchReason)}</div>` : ''}
        <div class="chat-order-status ${statusClass}">
          <span>Trạng thái đơn hàng</span>
          <b>${chatEscape(displayStatus)}</b>
        </div>
        <div class="chat-context-grid">
          <span>Thanh toán</span><b>${chatEscape(chatMoney(order.revenue || order.net_revenue))}</b>
          <span>Đơn vị vận chuyển</span><b>${chatEscape(order.shipping_carrier || 'Chưa rõ')}</b>
          <span>Mã vận đơn</span><b>${chatEscape(order.tracking_number || 'Chưa có')}</b>
          <span>Trạng thái OMS</span><b>${chatEscape(mainStatusLabel)}</b>
        </div>
        <div class="chat-context-items">${renderChatOrderItems(order.items || [])}</div>
        ${renderChatOrderLogistics(order)}
        <div class="chat-context-actions">
          <button type="button" onclick="loadChatOrderLogistics(${index})">Theo dõi vận chuyển</button>
          <button type="button" onclick="insertChatOrderSnippet(${index})">Chèn trạng thái đơn</button>
        </div>
      </div>
    `
  }
  return `
    ${hardOrders.length ? `<div class="chat-context-section-title">Đơn khớp chắc</div>${hardOrders.map((order, index) => renderOrderCard(order, index)).join('')}` : ''}
    ${visibleSoftOrders.length ? `<div class="chat-context-section-title warn">Đơn khớp mềm, cần kiểm tra</div>${visibleSoftOrders.map((order, index) => renderOrderCard(order, hardOrders.length + index)).join('')}` : ''}
    ${hiddenSoftCount ? `<div class="chat-context-note">Đã ẩn thêm ${hiddenSoftCount.toLocaleString('vi-VN')} đơn khớp mềm để tránh nhầm khi trả lời khách.</div>` : ''}
    ${referenceNotice}
  `
}

function renderChatProductsPanel(context) {
  if (!chatState.activeConversation) return '<div class="chat-empty">Chọn hội thoại để xem sản phẩm của shop.</div>'
  if (!context) return '<div class="chat-empty">Đang tải sản phẩm...</div>'
  const baseProducts = chatBaseProductRows(context)
  const products = chatDisplayProductRows(context)
  const summary = context.product_catalog_summary || {}
  const query = String(chatState.productPanelQuery || '').trim()
  const syncState = chatProductSyncCapability(chatState.activeConversation)
  const toolbarHtml = `
    <div class="chat-context-tools">
      <div class="chat-context-toolbar">
        <input
          id="chatProductSearchInline"
          type="search"
          value="${chatEscape(query)}"
          placeholder="Tìm tên sản phẩm, SKU, mã item..."
          autocomplete="off"
          oninput="filterChatProductPanel(this.value)"
        >
        <button
          type="button"
          onclick="syncChatProductsForConversation()"
          ${chatState.productPanelSyncing || !syncState.canSync ? 'disabled' : ''}
        >${chatState.productPanelSyncing ? 'Đang đồng bộ...' : 'Đồng bộ sản phẩm'}</button>
      </div>
      <div class="chat-context-muted">Tìm trong catalog API của đúng shop đang chat. Khi dữ liệu cũ hoặc thiếu, bấm Đồng bộ sản phẩm để nạp lại từ API thật.</div>
    </div>
  `
  const summaryHtml = summary.loaded_from_api ? `
    <div class="chat-context-note">
      AI đã nạp ${Number(summary.total_products || baseProducts.length).toLocaleString('vi-VN')} sản phẩm API · ${Number(summary.total_variations || 0).toLocaleString('vi-VN')} phân loại · ${Number(summary.in_stock_products || 0).toLocaleString('vi-VN')} sản phẩm còn hàng
    </div>
  ` : ''
  const searchSummaryHtml = query ? `
    <div class="chat-context-note strong">
      ${chatState.productPanelLoading
        ? 'Đang tìm trong toàn bộ catalog API của shop...'
        : `${Number(products.length || 0).toLocaleString('vi-VN')}/${Number(chatState.productPanelMatched || products.length || 0).toLocaleString('vi-VN')} sản phẩm khớp · ${Number(chatState.productPanelTotal || summary.total_products || baseProducts.length || 0).toLocaleString('vi-VN')} sản phẩm API`}
    </div>
  ` : ''
  const syncStatusHtml = chatState.productPanelSyncStatus
    ? `<div class="chat-context-note strong">${chatEscape(chatState.productPanelSyncStatus)}</div>`
    : ''
  const errorHtml = chatState.productPanelError
    ? `<div class="chat-context-note">Không tải được kết quả tìm kiếm: ${chatEscape(chatState.productPanelError)}</div>`
    : ''
  const capabilityHtml = !syncState.canSync

    ? `<div class="chat-context-note">${chatEscape(syncState.reason)}</div>`
    : ''
  if (!baseProducts.length && !query) {
    return `
      ${toolbarHtml}
      ${syncStatusHtml}
      ${capabilityHtml}
      <div class="chat-empty">Chưa có catalog sản phẩm API cho shop này. Bấm Đồng bộ sản phẩm để nạp dữ liệu thật cho hội thoại đang chat.</div>
    `
  }
  if (query && !products.length && chatState.productPanelLoading) {
    return `
      ${toolbarHtml}
      ${summaryHtml}
      ${searchSummaryHtml}
      ${syncStatusHtml}
      ${capabilityHtml}
      <div class="chat-empty">Đang tìm sản phẩm trong catalog API...</div>
    `
  }
  if (query && !products.length) {
    return `
      ${toolbarHtml}
      ${summaryHtml}
      ${searchSummaryHtml}
      ${syncStatusHtml}
      ${capabilityHtml}
      ${errorHtml}
      <div class="chat-empty">Không tìm thấy sản phẩm khớp từ khóa.</div>
    `
  }
  return `
    ${toolbarHtml}
    ${summaryHtml}
    ${searchSummaryHtml}
    ${syncStatusHtml}
    ${capabilityHtml}
    ${errorHtml}
    ${products.map((product, index) => {
      const variations = Array.isArray(product.variations) ? product.variations : []
      const imageUrl = (Array.isArray(product.images) ? product.images[0] : '') || product.image_url || variations.find(item => item.image_url)?.image_url || ''
      const sku = product.item_sku || product.platform_sku || product.internal_sku || variations.find(item => item.sku)?.sku || ''
      const url = chatProductUrl(product)
      const priceMin = Number(product.price_min || product.discount_price || product.price || 0)
      const priceMax = Number(product.price_max || priceMin || 0)
      const priceText = priceMin && priceMax && priceMax !== priceMin ? `${chatMoney(priceMin)} - ${chatMoney(priceMax)}` : chatMoney(priceMin)
      const stock = Number(product.stock_total ?? product.stock ?? 0)
      const description = chatShortText(product.description || product.variation_name || '', 110)
      const itemId = chatProductItemId(product)
      return `
        <div class="chat-product-row">
          ${imageUrl ? `<img src="${chatEscape(imageUrl)}" alt="">` : '<div class="chat-context-thumb">SP</div>'}
          <div class="chat-product-main">
            <div class="chat-context-name">${chatEscape(chatShortText(product.product_name || product.variation_name || sku || 'Sản phẩm', 76))}</div>
            <div class="chat-context-meta">${chatEscape(description || product.brand_name || '')}</div>
            ${itemId ? `<div class="chat-context-meta">Item Shopee: ${chatEscape(itemId)}</div>` : ''}
            <div class="chat-product-meta">
              <span>${chatEscape(priceText)}</span>
              <span>SKU: ${chatEscape(sku || 'chưa có')}</span>
              <span>Tồn: ${stock.toLocaleString('vi-VN')}</span>
            </div>
          </div>
          <button type="button" onclick="sendChatProductCardFromPanel(${index}, this)">Chèn thẻ SP</button>
        </div>
      `
    }).join('')}
  `
}
