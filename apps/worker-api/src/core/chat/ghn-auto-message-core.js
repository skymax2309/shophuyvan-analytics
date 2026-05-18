export const GHN_NOTICE_MESSAGE_TYPE = 'ghn_notice'

export const GHN_NOTICE_DEFAULT_TEMPLATE = `Shop chào anh/chị ạ. Đơn hàng của mình đang được phân cho Giao Hàng Nhanh, nhưng bên vận chuyển chưa qua shop lấy hàng nên có thể bị chậm giao.

Anh/chị vui lòng vào Đơn hàng, chọn không tiếp tục đơn hiện tại và đặt lại đơn mới giúp shop ạ. Shop rất xin lỗi vì sự bất tiện này. Mong anh/chị thông cảm giúp shop ạ!`

function cleanText(value = '') {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

export function normalizeGhnCarrierText(value = '') {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
}

export function isGhnCarrier(value = '') {
  const text = normalizeGhnCarrierText(value)
  return Boolean(text === 'ghn' || text.includes('giao hang nhanh') || text.includes('giaohangnhanh') || text.includes('ghn express'))
}

export function validateGhnTemplate(template = GHN_NOTICE_DEFAULT_TEMPLATE) {
  const text = cleanText(template)
  const normalized = normalizeGhnCarrierText(text)
  if (!text.includes('không tiếp tục đơn hiện tại')) {
    return { ok: false, error: 'missing_required_phrase', message: 'Mẫu GHN phải giữ cụm "không tiếp tục đơn hiện tại".' }
  }
  if (normalized.includes('huy don')) {
    return { ok: false, error: 'banned_cancel_phrase', message: 'Mẫu GHN không được dùng cụm hủy đơn/huỷ đơn.' }
  }
  return { ok: true }
}

export function renderGhnNoticeMessage(order = {}, template = GHN_NOTICE_DEFAULT_TEMPLATE) {
  const safeTemplate = cleanText(template) || GHN_NOTICE_DEFAULT_TEMPLATE
  return safeTemplate
    .replace(/\{\{buyer_name\}\}/g, cleanText(order.customer_name || order.buyer_username || ''))
    .replace(/\{\{order_sn\}\}/g, cleanText(order.order_id || order.order_sn))
    .replace(/\{\{carrier\}\}/g, cleanText(order.shipping_carrier || 'Giao Hàng Nhanh'))
    .replace(/\{\{tracking_number\}\}/g, cleanText(order.tracking_number))
    .replace(/\s+\n/g, '\n')
    .replace(/\{\{[^}]+\}\}/g, '')
    .trim()
}

export function isGhnAutoOrderEligible(order = {}) {
  const statusText = normalizeGhnCarrierText([
    order.oms_status,
    order.shipping_status,
    order.order_status,
    order.order_type,
    order.cancel_reason
  ].join(' '))
  if (!isGhnCarrier(order.shipping_carrier)) return { ok: false, reason: 'not_ghn' }
  if (/(completed|delivered|finish|done|cancel|return|refund|failed|that bai|hoan|tra hang|huy)/.test(statusText)) {
    return { ok: false, reason: 'unsafe_order_status' }
  }
  return { ok: true, reason: '' }
}
