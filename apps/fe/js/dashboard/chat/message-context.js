function text(value, fallback = '') {
  return String(value ?? fallback).trim()
}

function unique(values = []) {
  const seen = new Set()
  const result = []
  for (const value of values.map(item => text(item)).filter(Boolean)) {
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : [value]
    } catch {
      return [value]
    }
  }
  return value == null ? [] : [value]
}

function messageBody(message = {}) {
  return text(message.text || message.content || message.message || message.last_message_text)
}

function messageAttachments(message = {}) {
  return [
    ...asArray(message.attachments),
    ...asArray(message.media_items)
  ].filter(item => item && typeof item === 'object')
}

function orderFromText(value = '') {
  const source = text(value)
  const direct = source.match(/\[(?:Đơn hàng|Don hang)\]\s*([A-Z0-9-]+)/iu)
  if (direct?.[1]) return direct[1]
  const plain = source.match(/(?:Đơn\s*hàng|Don\s*hang)\s*[:#-]?\s*([A-Z0-9-]{8,})/iu)
  if (plain?.[1]) return plain[1]
  const labelled = source.match(/(?:Mã\s*đơn|Ma\s*don|Order)\s*[:#-]?\s*([A-Z0-9-]{8,})/iu)
  return labelled?.[1] || ''
}

function orderFromAttachment(attachment = {}) {
  const direct = text(attachment.order_id || attachment.order_sn || attachment.platform_order_id)
  if (direct) return direct
  const type = text(attachment.type).toLowerCase()
  const label = text(attachment.name || attachment.title || attachment.text || attachment.content)
  if (type === 'order' || /đơn\s*hàng|don\s*hang|order/i.test(label)) {
    return orderFromText(label) || text(label.match(/\b[A-Z0-9-]{8,}\b/i)?.[0])
  }
  return ''
}

function productFromText(value = '') {
  const source = text(value)
  const direct = source.match(/\[(?:Sản phẩm|San pham|Product)\]\s*([0-9]+)/iu)
  if (direct?.[1]) return direct[1]
  const labelled = source.match(/(?:item_id|product_id|mã\s*sản\s*phẩm|ma\s*san\s*pham)\s*[:#-]?\s*([0-9]+)/iu)
  return labelled?.[1] || ''
}

function productFromAttachment(attachment = {}) {
  return text(
    attachment.product_id ||
    attachment.platform_product_id ||
    attachment.platform_item_id ||
    attachment.item_id ||
    productFromText(attachment.name || attachment.title || attachment.text || attachment.content)
  )
}

export function orderIdFromMessage(message = {}) {
  return text(
    message.order_id ||
    message.order_sn ||
    message.platform_order_id ||
    message.order?.order_sn ||
    message.order?.id ||
    orderFromText(messageBody(message)) ||
    messageAttachments(message).map(orderFromAttachment).find(Boolean)
  )
}

export function productIdsFromMessage(message = {}) {
  return unique([
    ...asArray(message.product_ids),
    message.product_id,
    message.platform_product_id,
    message.platform_item_id,
    message.item_id,
    productFromText(messageBody(message)),
    ...messageAttachments(message).map(productFromAttachment)
  ])
}

export function extractOrderIdsFromMessages(messages = []) {
  return unique(messages.map(orderIdFromMessage))
}

export function extractProductIdsFromMessages(messages = []) {
  return unique(messages.flatMap(productIdsFromMessage))
}

export function orderMatchesMessage(order = {}, message = {}) {
  const orderId = orderIdFromMessage(message)
  if (!orderId) return false
  const candidates = [
    order.order_sn,
    order.order_id,
    order.id,
    order.platform_order_id,
    order.platform_order_sn
  ].map(item => text(item).toLowerCase())
  return candidates.includes(orderId.toLowerCase())
}

export function productMatchesMessage(product = {}, message = {}) {
  const ids = productIdsFromMessage(message).map(item => item.toLowerCase())
  if (!ids.length) return false
  const candidates = [
    product.platform_item_id,
    product.platform_product_id,
    product.item_id,
    product.product_id,
    product.id,
    product.sku,
    product.platform_sku
  ].map(item => text(item).toLowerCase())
  return candidates.some(item => item && ids.includes(item))
}

export function attachmentUrl(attachment = {}) {
  return text(attachment.url || attachment.image_url || attachment.video_url || attachment.thumbnail_url || attachment.thumb_url)
}

export function attachmentType(attachment = {}) {
  const type = text(attachment.type || attachment.mime_type || attachment.content_type).toLowerCase()
  const url = attachmentUrl(attachment).toLowerCase()
  if (type.includes('video') || /\.(mp4|webm|mov)(\?|$)/i.test(url)) return 'video'
  if (type.includes('image') || /\.(png|jpe?g|gif|webp|bmp|avif)(\?|$)/i.test(url) || url.includes('/file/') || url.includes('shopee')) return 'image'
  return 'file'
}
