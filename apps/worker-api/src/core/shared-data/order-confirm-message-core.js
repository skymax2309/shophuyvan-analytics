const DEFAULT_TEMPLATE = [
  'Dạ Shop Huy Vân xác nhận đã nhận đơn {order_id} của mình.',
  'Shop sẽ chuẩn bị hàng và bàn giao đơn vị vận chuyển sớm.',
  'Mình kiểm tra giúp shop đúng sản phẩm và địa chỉ giao hàng nhé ạ.'
].join(' ')

function text(value, fallback = '') {
  const plain = String(value ?? fallback).replace(/\u00a0/g, ' ').trim()
  return plain && plain !== '[object Object]' ? plain : fallback
}

function firstItem(order = {}) {
  const items = Array.isArray(order.items) ? order.items : []
  return items[0] || {}
}

function orderId(order = {}) {
  return text(order.order_id || order.order_sn || order.platform_order_id || order.id)
}

function customerName(order = {}, target = {}) {
  return text(target.customer_name || order.customer_name || order.buyer_name || order.recipient_name || 'mình')
}

function productName(order = {}) {
  const item = firstItem(order)
  return text(item.name || item.product_name || item.item_name || item.title || item.sku || item.platform_sku)
}

function quantity(order = {}) {
  const item = firstItem(order)
  const value = item.quantity ?? item.qty ?? item.item_quantity
  return value === 0 ? '0' : text(value)
}

function replacePlaceholders(template, order = {}, target = {}) {
  const values = {
    order_id: orderId(order),
    customer_name: customerName(order, target),
    product_name: productName(order),
    quantity: quantity(order),
    shop_name: text(target.shop_display_name || order.shop_display_name || 'Shop Huy Vân')
  }
  return text(template || DEFAULT_TEMPLATE)
    .replace(/\{order_id\}/g, values.order_id)
    .replace(/\{customer_name\}/g, values.customer_name)
    .replace(/\{product_name\}/g, values.product_name)
    .replace(/\{quantity\}/g, values.quantity)
    .replace(/\{shop_name\}/g, values.shop_name)
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeOrderConfirmSettings(settings = {}) {
  return {
    enabled: settings.order_confirm_message_enabled === true || settings.order_confirm_message_enabled === 'true',
    mode: text(settings.order_confirm_message_mode || 'draft_only') === 'auto_send_when_allowed'
      ? 'auto_send_when_allowed'
      : 'draft_only',
    template: text(settings.order_confirm_message_template || DEFAULT_TEMPLATE),
    trigger_status: text(settings.order_confirm_message_trigger_status || 'new_order')
  }
}

export function buildOrderConfirmMessage(order = {}, target = {}, settings = {}) {
  const normalized = normalizeOrderConfirmSettings(settings)
  return {
    ...normalized,
    draft_text: replacePlaceholders(normalized.template, order, target),
    placeholders: ['{order_id}', '{customer_name}', '{product_name}', '{quantity}', '{shop_name}']
  }
}
