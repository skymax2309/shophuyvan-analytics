import { chatApi, coreApi } from './api.js'
import { extractOrderIdsFromMessages, extractProductIdsFromMessages } from './message-context.js'
import { renderAll } from './render.js?v=chat-auto-send-20260603a'
import { setState, state } from './state.js?v=chat-auto-send-20260603a'
import { escapeHtml, openModal, showToast } from './toast.js'

const QUICK_REPLIES = [
  'Dạ Shop Huy Vân xin chào quý khách ạ!',
  'Dạ shop kiểm tra đơn và phản hồi mình ngay ạ.',
  'Dạ sản phẩm bên shop còn hàng, mình đặt giúp shop nhé.',
  'Dạ shop đã ghi nhận thông tin và sẽ xử lý sớm nhất ạ.',
  'Dạ mình cho shop xin mã đơn hàng để kiểm tra chính xác hơn ạ.'
]

function text(value, fallback = '') {
  if (value === 0) return '0'
  if (value === null || value === undefined) return fallback
  if (Array.isArray(value)) return value.map(item => text(item)).filter(Boolean).join(', ') || fallback
  if (typeof value === 'object') return text(value.value ?? value.text ?? value.name ?? value.label ?? value.title, fallback)
  const plain = String(value).replace(/\u00a0/g, ' ').trim()
  return plain && plain !== '[object Object]' ? plain : fallback
}

function amount(value) {
  if (value && typeof value === 'object') return amount(value.value ?? value.amount ?? value.total)
  if (value === 0) return 0
  const plain = text(value)
  if (!plain) return null
  const numeric = Number(plain.replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'))
  return Number.isFinite(numeric) ? numeric : null
}

function currency(value) {
  const number = amount(value)
  return number === null ? '' : `${number.toLocaleString('vi-VN')}đ`
}

function dateText(value) {
  const plain = text(value)
  if (!plain) return ''
  const number = Number(plain)
  const date = Number.isFinite(number) && plain.length >= 10
    ? new Date(plain.length === 10 ? number * 1000 : number)
    : new Date(plain)
  if (Number.isNaN(date.getTime())) return plain
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function activeContextPatch(patch = {}) {
  setState({ context: { ...state.context, ...patch } })
}

function conversationCoreQuery(conversation = {}, messages = state.messages) {
  const params = new URLSearchParams()
  params.set('channel', conversation.channel || 'shopee')
  if (conversation.shop_id) params.set('shop_id', conversation.shop_id)
  if (conversation.customer_id) params.set('customer_id', conversation.customer_id)
  if (conversation.platform_conversation_id) params.set('platform_conversation_id', conversation.platform_conversation_id)
  const orderIds = extractOrderIdsFromMessages(messages)
  if (orderIds.length) params.set('order_ids', orderIds.join(','))
  if (!orderIds.length && conversation.order_id) params.set('order_ids', conversation.order_id)
  return params
}

function productFromOrderItem(item = {}, order = {}) {
  return {
    source: 'order',
    order_sn: order.order_sn || order.id || '',
    sku: text(item.sku || item.platform_sku || item.model_sku || item.seller_sku),
    name: text(item.name || item.product_name || item.item_name || item.title || item.sku, 'Sản phẩm'),
    image_url: text(item.image_url || item.image || item.thumbnail_url || item.cover_url || item.main_image),
    price: item.price ?? item.sale_price ?? item.current_price ?? item.final_price ?? item.original_price ?? null,
    quantity: item.quantity ?? item.qty ?? item.item_quantity ?? null,
    stock: item.stock ?? item.available_stock ?? item.stock_info ?? null,
    variation_name: text(item.variation_name || item.model_name || item.classification || item.option_name),
    platform_product_id: text(item.platform_product_id || item.item_id || item.product_id),
    platform_item_id: text(item.platform_item_id || item.item_id || item.product_id)
  }
}

function productsFromOrders(orders = []) {
  const seen = new Set()
  const products = []
  for (const order of orders) {
    const items = Array.isArray(order.items) ? order.items : []
    for (const item of items) {
      const product = productFromOrderItem(item, order)
      const key = product.sku || product.platform_product_id || product.name
      if (!key || seen.has(key.toLowerCase())) continue
      seen.add(key.toLowerCase())
      products.push(product)
    }
  }
  return products
}

function mergeProducts(...groups) {
  const seen = new Set()
  const products = []
  for (const product of groups.flat().filter(Boolean)) {
    const key = text(product.platform_item_id || product.platform_product_id || product.item_id || product.product_id || product.sku || product.name)
    if (!key || seen.has(key.toLowerCase())) continue
    seen.add(key.toLowerCase())
    products.push(product)
  }
  return products
}

async function loadOrderContext(conversation) {
  const explicitOrderIds = extractOrderIdsFromMessages(state.messages)
  const directOrderId = text(conversation.order_id || conversation.order_sn || conversation.platform_order_id)
  if (!explicitOrderIds.length && !directOrderId) return []
  const params = conversationCoreQuery(conversation)
  const id = encodeURIComponent(conversation.id)
  const data = await coreApi(`/api/core/orders/by-conversation/${id}?${params.toString()}`, {
    allowBusinessError: true,
    timeoutMs: 15000
  })
  const orders = Array.isArray(data.orders) ? data.orders : (data.order ? [data.order] : [])
  return enrichOrdersWithTrackingDetail(orders)
}

function orderCoreId(order = {}) {
  return text(order.order_id || order.order_sn || order.platform_order_id || order.id)
}

function mergeOrderDetail(order = {}, detail = {}) {
  if (!detail || detail.ok === false) return order
  // Chỉ gộp bằng chứng read-model từ Core, không suy luận nghiệp vụ ở frontend.
  return {
    ...order,
    payment_method: text(order.payment_method) || text(detail.payment_method),
    payment_method_source: text(order.payment_method_source) || text(detail.payment_method_source),
    payment_time: text(order.payment_time) || text(detail.payment_time),
    payment_time_source: text(order.payment_time_source) || text(detail.payment_time_source),
    shipping_carrier: text(order.shipping_carrier) || text(detail.logistics_provider),
    logistics_provider: text(order.logistics_provider) || text(detail.logistics_provider),
    tracking_number: text(order.tracking_number) || text(detail.tracking_number),
    tracking_status_core: text(order.tracking_status_core) || text(detail.tracking_status_core),
    customer_note: text(order.customer_note) || text(detail.customer_note),
    customer_note_source: text(order.customer_note_source) || text(detail.customer_note_source),
    tracking_events: Array.isArray(detail.tracking_events) ? detail.tracking_events : (order.tracking_events || []),
    logistics_detail: detail
  }
}

async function loadOrderTrackingDetail(order = {}) {
  const id = orderCoreId(order)
  if (!id) return null
  return coreApi(`/api/logistics-watch/detail?order_id=${encodeURIComponent(id)}`, {
    allowBusinessError: true,
    timeoutMs: 15000
  })
}

async function enrichOrdersWithTrackingDetail(orders = []) {
  const enriched = await Promise.all(orders.slice(0, 6).map(async order => {
    const detail = await loadOrderTrackingDetail(order).catch(error => {
      console.warn('[chat_order_tracking_detail_failed]', error)
      return null
    })
    return mergeOrderDetail(order, detail)
  }))
  return [
    ...enriched,
    ...orders.slice(enriched.length)
  ]
}

async function loadProductsFromMessages(conversation) {
  const ids = extractProductIdsFromMessages(state.messages).slice(0, 8)
  if (!ids.length) return []
  const found = []
  for (const id of ids) {
    const params = new URLSearchParams({
      q: id,
      platform: conversation.channel || 'shopee',
      limit: '10'
    })
    if (conversation.shop_id) params.set('shop_id', conversation.shop_id)
    const data = await coreApi(`/api/core/products/search?${params.toString()}`, {
      allowBusinessError: true,
      timeoutMs: 15000
    })
    if (Array.isArray(data.products)) found.push(...data.products)
  }
  return mergeProducts(found)
}

async function loadVoucherContext(conversation) {
  if (String(conversation.channel || '').toLowerCase() !== 'shopee') return { supported: false, total: 0, active: 0, items: [] }
  const params = new URLSearchParams({
    platform: 'shopee',
    shop_id: conversation.shop_id || '',
    module: 'voucher',
    limit: '20'
  })
  const data = await coreApi(`/api/discounts/promotion-module-read-model?${params.toString()}`, {
    allowBusinessError: true,
    timeoutMs: 15000
  })
  const programs = Array.isArray(data.programs) ? data.programs : []
  const items = Array.isArray(data.items) ? data.items : []
  return {
    supported: true,
    total: Number(data.summary?.total_programs || programs.length || 0),
    active: Number(data.summary?.ongoing_programs || data.summary?.active || 0),
    programs,
    items
  }
}

export async function loadConversationContext(conversation = state.activeConversation) {
  if (!conversation) return
  const contextConversationId = conversation.id
  // Không để một sự kiện cũ xóa panel của hội thoại vừa được người dùng mở.
  if (state.activeId && state.activeId !== contextConversationId) return
  activeContextPatch({ loading: true, error: '', orders: [], products: [], voucher: null })
  renderAll()
  try {
    const [orders, voucher, messageProducts] = await Promise.all([
      loadOrderContext(conversation).catch(error => {
        console.warn('[chat_order_context_failed]', error)
        return []
      }),
      loadVoucherContext(conversation).catch(error => {
        console.warn('[chat_voucher_context_failed]', error)
        return null
      }),
      loadProductsFromMessages(conversation).catch(error => {
        console.warn('[chat_product_context_failed]', error)
        return []
      })
    ])
    // Bỏ kết quả tải cũ nếu nhân viên đã chuyển sang hội thoại khác.
    if (state.activeId !== contextConversationId) return
    activeContextPatch({
      loading: false,
      orders,
      products: mergeProducts(productsFromOrders(orders), messageProducts),
      voucher
    })
  } catch (error) {
    if (state.activeId !== contextConversationId) return
    activeContextPatch({ loading: false, error: error.message || 'Không tải được dữ liệu hội thoại.' })
  }
  if (state.activeId !== contextConversationId) return
  renderAll()
}

export async function searchProducts(query = state.context.productSearch) {
  const conversation = state.activeConversation
  if (!conversation) return
  activeContextPatch({ productSearch: query, productLoading: true })
  renderAll()
  try {
    const params = new URLSearchParams({
      q: text(query || conversation.customer_name || 'remote'),
      platform: conversation.channel || 'shopee',
      limit: '20'
    })
    if (conversation.shop_id) params.set('shop_id', conversation.shop_id)
    const data = await coreApi(`/api/core/products/search?${params.toString()}`, { timeoutMs: 15000 })
    activeContextPatch({
      productLoading: false,
      products: Array.isArray(data.products) ? data.products : []
    })
  } catch (error) {
    activeContextPatch({ productLoading: false })
    showToast(`Không tìm được sản phẩm: ${error.message}`, 'error')
  }
  renderAll()
}

export function quickReplies() {
  return QUICK_REPLIES
}

export function insertTextToComposer(value = '') {
  const input = document.getElementById('chatInput')
  if (!input) return
  const current = input.value.trim()
  const next = current ? `${current}\n${value}` : value
  input.value = next
  // Lưu nội dung đang soạn để render panel chi tiết không làm mất bản nháp.
  setState({ composerText: next })
  input.focus()
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, 132)}px`
}

export function insertOrderSummary(order = {}) {
  const firstItem = Array.isArray(order.items) ? order.items[0] : null
  const lines = [
    text(order.order_sn || order.platform_order_id || order.order_id) ? `Mã đơn: ${text(order.order_sn || order.platform_order_id || order.order_id)}` : '',
    text(order.display_status_vi || order.status_label_vi || order.workflow_status || order.status) ? `Trạng thái: ${text(order.display_status_vi || order.status_label_vi || order.workflow_status || order.status)}` : '',
    firstItem ? `Sản phẩm: ${text(firstItem.name || firstItem.product_name || firstItem.item_name || firstItem.title)}` : '',
    firstItem && text(firstItem.sku || firstItem.platform_sku || firstItem.model_sku) ? `SKU: ${text(firstItem.sku || firstItem.platform_sku || firstItem.model_sku)}` : '',
    currency(order.buyer_total_amount ?? order.total_amount ?? order.payment?.total) ? `Thanh toán: ${currency(order.buyer_total_amount ?? order.total_amount ?? order.payment?.total)}` : '',
    text(order.payment_method) ? `Phương thức thanh toán: ${text(order.payment_method)}` : '',
    dateText(order.payment_time) ? `Thời gian thanh toán: ${dateText(order.payment_time)}` : '',
    text(order.shipping_carrier || order.logistics_channel) ? `Vận chuyển: ${text(order.shipping_carrier || order.logistics_channel)}` : '',
    text(order.tracking_number) ? `Mã vận đơn: ${text(order.tracking_number)}` : ''
  ].filter(Boolean)
  insertTextToComposer(lines.join('\n'))
}

function timelineEventText(event = {}) {
  return text(
    event.event_text ||
    event.status_text ||
    event.status_label_vi ||
    event.title ||
    event.description ||
    event.detail ||
    event.status ||
    event.logistics_status
  )
}

function timelineEventTime(event = {}) {
  return dateText(event.event_time || event.time || event.timestamp || event.update_time || event.created_at)
}

function renderTimeline(detail = {}) {
  const events = Array.isArray(detail.tracking_events) ? detail.tracking_events : (Array.isArray(detail.events) ? detail.events : [])
  if (!events.length) {
    return `<div class="empty-state compact">${escapeHtml(detail.message || 'Chưa có timeline vận chuyển trong Tracking Core.')}</div>`
  }
  return `
    <ol class="chat-timeline">
      ${events.map(event => `
        <li>
          <time>${escapeHtml(timelineEventTime(event) || 'Chưa có thời gian')}</time>
          <strong>${escapeHtml(timelineEventText(event) || 'Cập nhật vận chuyển')}</strong>
          ${text(event.location || event.city || event.station) ? `<span>${escapeHtml(text(event.location || event.city || event.station))}</span>` : ''}
        </li>
      `).join('')}
    </ol>
  `
}

export async function openOrderTimeline(order = {}) {
  const id = orderCoreId(order)
  if (!id) return showToast('Đơn này chưa có mã để mở timeline.', 'error')
  try {
    const detail = order.logistics_detail || await loadOrderTrackingDetail(order)
    const merged = mergeOrderDetail(order, detail)
    setState({
      context: {
        ...state.context,
        orders: state.context.orders.map(item => orderCoreId(item) === id ? merged : item)
      }
    })
    renderAll()
    openModal({
      title: `Timeline vận chuyển ${id}`,
      body: `
        <div class="detail-grid order-timeline-modal">
          <div class="order-facts">
            <span>Đơn vị vận chuyển</span><strong>${escapeHtml(text(merged.shipping_carrier || merged.logistics_provider, 'Chưa có'))}</strong>
            <span>Mã vận đơn</span><strong class="mono">${escapeHtml(text(merged.tracking_number, 'Chưa có'))}</strong>
            <span>Phương thức thanh toán</span><strong>${escapeHtml(text(merged.payment_method, 'Chưa có'))}</strong>
            <span>Thời gian thanh toán</span><strong>${escapeHtml(dateText(merged.payment_time) || 'Chưa có')}</strong>
          </div>
          ${renderTimeline(detail || {})}
        </div>
      `
    })
  } catch (error) {
    showToast(`Không mở được timeline vận chuyển: ${error.message}`, 'error')
  }
}

export function insertProductSummary(product = {}) {
  const name = text(product.name || product.product_name || product.item_name || product.title || product.sku, 'Sản phẩm')
  const sku = text(product.sku || product.platform_sku || product.model_sku || product.item_sku || product.seller_sku)
  const price = product.price ?? product.sale_price ?? product.current_price ?? product.final_price
  const lines = [
    name ? `Sản phẩm: ${name}` : '',
    sku ? `SKU: ${sku}` : '',
    price != null ? `Giá: ${currency(price)}` : '',
    text(product.stock ?? product.available_stock) ? `Tồn: ${text(product.stock ?? product.available_stock)}` : ''
  ].filter(Boolean)
  insertTextToComposer(lines.join('\n'))
}

export async function previewProductCard(product = {}) {
  if (!state.activeConversation) return
  try {
    const result = await chatApi('/api/chat/product-cards/send', {
      method: 'POST',
      allowBusinessError: true,
      timeoutMs: 30000,
      body: JSON.stringify({
        conversation_id: state.activeConversation.id,
        product,
        product_sku: product.sku || product.platform_sku,
        product_item_id: product.platform_product_id || product.platform_item_id || product.item_id,
        dry_run: true
      })
    })
    showToast(result.ok ? 'Thẻ sản phẩm kiểm tra được qua bridge.' : (result.error_message || 'Chưa gửi được thẻ sản phẩm.'), result.ok ? 'ok' : 'error')
  } catch (error) {
    showToast(`Kiểm tra thẻ sản phẩm lỗi: ${error.message}`, 'error')
  }
}

export async function sendProductCard(product = {}) {
  if (!state.activeConversation) return
  try {
    const result = await chatApi('/api/chat/product-cards/send', {
      method: 'POST',
      allowBusinessError: true,
      timeoutMs: 30000,
      body: JSON.stringify({
        conversation_id: state.activeConversation.id,
        product,
        product_sku: product.sku || product.platform_sku,
        product_item_id: product.platform_product_id || product.platform_item_id || product.item_id,
        dry_run: false
      })
    })
    if (result.ok === false && result.error_code === 'product_card_not_supported' && state.activeConversation.channel === 'tiktok') {
      insertProductSummary(result.product || product)
      return showToast('Đã chèn sản phẩm vào bản nháp. TikTok cần gửi tay trên sàn.', 'ok')
    }
    if (result.ok === false) return showToast(result.error_message || 'Chưa gửi được thẻ sản phẩm.', 'error')
    showToast('Đã gửi thẻ sản phẩm.', 'ok')
  } catch (error) {
    showToast(`Gửi thẻ sản phẩm lỗi: ${error.message}`, 'error')
  }
}

export async function sendOrderCard(order = {}) {
  if (!state.activeConversation) return
  try {
    const result = await chatApi('/api/chat/order-cards/send', {
      method: 'POST',
      allowBusinessError: true,
      timeoutMs: 30000,
      body: JSON.stringify({
        conversation_id: state.activeConversation.id,
        order,
        order_id: order.order_sn || order.platform_order_id || order.order_id || order.id,
        dry_run: false
      })
    })
    if (result.ok === false) return showToast(result.error_message || 'Chưa gửi được thẻ đơn hàng.', 'error')
    showToast('Đã gửi thẻ đơn hàng.', 'ok')
  } catch (error) {
    showToast(`Gửi thẻ đơn hàng lỗi: ${error.message}`, 'error')
  }
}

