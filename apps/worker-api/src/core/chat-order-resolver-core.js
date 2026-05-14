export const CHAT_CONVERSATION_MATCH_NONE = 'none'
export const CHAT_CONVERSATION_MATCH_HARD = 'hard'
export const CHAT_CONVERSATION_MATCH_SOFT = 'soft'

function cleanResolverText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function normalizeResolverText(value) {
  return cleanResolverText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function normalizeOrderResolverPhone(value) {
  const digits = cleanResolverText(value).replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('84') && digits.length >= 11) return `0${digits.slice(2)}`
  return digits
}

export function normalizeOrderResolverName(value) {
  return normalizeResolverText(value)
}

export function buildOrderChatSearchQuery(order = {}) {
  const orderId = cleanResolverText(order.order_id)
  const phone = normalizeOrderResolverPhone(order.customer_phone)
  const customerName = cleanResolverText(order.customer_name)
  if (customerName) return customerName
  if (phone) return phone
  return orderId
}

export function buildOrderChatPrefill(order = {}) {
  // Mẫu mặc định phải đủ trung tính để dùng chung khi mở từ OMS,
  // tránh tự suy diễn lý do như hết hàng hay đổi mẫu khi nhân viên chưa kiểm tra lại đơn.
  const orderId = cleanResolverText(order.order_id)
  const customerName = cleanResolverText(order.customer_name)
  const trackingNumber = cleanResolverText(order.tracking_number)
  const lines = [
    orderId
      ? `Dạ shop đang liên hệ lại về đơn ${orderId} của mình ạ.`
      : (customerName ? `Dạ shop đang kiểm tra lại thông tin của mình ${customerName} ạ.` : 'Dạ shop đang kiểm tra lại đơn của mình ạ.'),
    trackingNumber ? `Nếu cần đối chiếu thêm, shop đang giữ mã vận đơn ${trackingNumber}.` : '',
    'Mình đang cần shop hỗ trợ nội dung nào tiếp theo để shop xử lý ngay trong phiên chat này giúp mình nhé.'
  ].filter(Boolean)
  return lines.join(' ')
}

export function scoreSoftOrderConversationMatch(candidate = {}, order = {}) {
  // Khớp mềm ưu tiên số điện thoại trước, sau đó mới cộng điểm theo tên
  // để giảm nguy cơ mở nhầm hội thoại chỉ vì trùng hoặc gần giống tên khách.
  const candidateName = normalizeOrderResolverName(candidate.buyer_name)
  const orderName = normalizeOrderResolverName(order.customer_name)
  const candidatePhone = normalizeOrderResolverPhone(candidate.buyer_id || candidate.customer_phone || candidate.buyer_name)
  const orderPhone = normalizeOrderResolverPhone(order.customer_phone)
  const reasons = []
  let score = 0

  if (candidatePhone && orderPhone && candidatePhone === orderPhone) {
    score += 0.72
    reasons.push('Khớp số điện thoại khách')
  }

  if (candidateName && orderName) {
    if (candidateName === orderName) {
      score += 0.52
      reasons.push('Khớp đúng tên khách')
    } else if (candidateName.includes(orderName) || orderName.includes(candidateName)) {
      score += 0.28
      reasons.push('Khớp gần đúng tên khách')
    }
  }

  return {
    score,
    reasons
  }
}

export function orderConversationMatchMeta(matchType) {
  if (matchType === CHAT_CONVERSATION_MATCH_HARD) {
    return {
      match_type: CHAT_CONVERSATION_MATCH_HARD,
      match_label: 'Khớp chắc',
      match_tone: 'ok',
      warning: 'Đã mở đúng hội thoại theo mã đơn trong OMS.'
    }
  }
  if (matchType === CHAT_CONVERSATION_MATCH_SOFT) {
    return {
      match_type: CHAT_CONVERSATION_MATCH_SOFT,
      match_label: 'Khớp mềm, cần kiểm tra',
      match_tone: 'muted',
      warning: 'Đã mở hội thoại khớp mềm theo tên hoặc số điện thoại khách. Kiểm tra lại trước khi gửi.'
    }
  }
  return {
    match_type: CHAT_CONVERSATION_MATCH_NONE,
    match_label: 'Chưa tìm thấy hội thoại',
    match_tone: 'blocked',
    warning: 'Chưa tìm thấy hội thoại đã lưu khớp đơn này. Hệ thống chỉ mở danh sách lọc, không tạo chat mới giả lập.'
  }
}
