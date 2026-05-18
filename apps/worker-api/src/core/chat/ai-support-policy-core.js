export const CHAT_AI_SUPPORT_POLICY_VERSION = '2026-05-10-q01-q50'

export const CHAT_AI_SUPPORT_CONTACT_POLICY_REPLY =
  'Dạ shop hỗ trợ mình trực tiếp trên sàn. Mình nhắn giúp shop vấn đề cần hỗ trợ, shop kiểm tra và phản hồi tại đây ạ.'

export const CHAT_AI_SUPPORT_PAYMENT_POLICY_REPLY =
  'Dạ shop chỉ hỗ trợ giao dịch và thanh toán trực tiếp trên sàn. Mình thao tác ngay trên sàn giúp shop để được ghi nhận và bảo vệ quyền lợi ạ.'

export const CHAT_AI_SUPPORT_DEFAULT_BLOCKED_KEYWORDS = [
  'zalo',
  'facebook',
  'messenger',
  'telegram',
  'whatsapp',
  'momo',
  'chuyển khoản',
  'số tài khoản',
  'tài khoản ngân hàng',
  'thanh toán ngoài',
  'đặt cọc',
  'mua ngoài sàn',
  'đặt ngoài sàn',
  'link ngoài',
  'website riêng',
  'địa chỉ shop',
  'qua lấy trực tiếp'
]

export const CHAT_AI_SUPPORT_DEFAULT_FORBIDDEN_PATTERNS = [
  'zalo',
  'facebook',
  'messenger',
  'telegram',
  'whatsapp',
  'momo',
  'chuyển khoản',
  'số tài khoản',
  'tài khoản ngân hàng',
  'ngân hàng',
  'thanh toán ngoài',
  'đặt cọc',
  'giảm riêng',
  'mua ngoài sàn',
  'đặt ngoài sàn',
  'link ngoài',
  'website riêng',
  'địa chỉ shop',
  'địa chỉ cửa hàng',
  'địa chỉ kho',
  'showroom',
  'qua lấy trực tiếp',
  'đến lấy trực tiếp',
  'cam kết 100%',
  'chắc chắn dùng được',
  'không bao giờ lỗi',
  'bảo hành đổi mới ngay',
  'hoàn tiền ngay',
  'đổi mới ngay',
  'đánh giá tốt',
  'sửa đánh giá',
  'xóa đánh giá',
  '5 sao',
  'lách chính sách',
  'ghi lý do thế nào',
  'dễ được duyệt',
  'chọn lý do',
  'mã otp',
  'otp',
  'căn cước',
  'cccd',
  'cmnd',
  'tài khoản ngân hàng',
  'đấu dây trực tiếp',
  'nối nguồn',
  'sửa mạch',
  'điện đang cấp nguồn',
  'regex:\\bshopee\\b',
  'regex:\\blazada\\b',
  'regex:\\btik\\s?tok(?:\\s+shop)?\\b',
  'regex:\\bshop\\s*huy\\s*vân\\b',
  'regex:\\bshop\\s*huy\\s*van\\b',
  'regex:\\bshophuyvan\\b',
  'regex:(https?:\\/\\/|www\\.)\\S+',
  'regex:(\\+?84|0)([\\s.-]*\\d){8,10}',
  'regex:\\b\\d{2,}([\\.,]\\d{3})*\\s*(k|đ|d|vnd|vnđ)\\b'
]

export const CHAT_AI_SUPPORT_DEFAULT_REVIEW_TRIGGERS = [
  'bảo hành',
  'hoàn tiền',
  'đổi trả',
  'hủy đơn',
  'khiếu nại',
  'khách tức giận',
  'đơn giá trị cao',
  'khách hay hoàn hủy',
  'thiếu dữ liệu',
  'ngoài chính sách',
  'nghi lừa đảo',
  'đánh giá xấu',
  'giá hiện tại',
  'khuyến mãi',
  'voucher',
  'mã giảm giá',
  'phí ship',
  'phí vận chuyển',
  'đấu dây',
  'lắp điện'
]

export const CHAT_AI_SUPPORT_DEFAULT_RULE_LINES = [
  'AI chỉ được tự gửi khi câu trả lời chắc chắn an toàn theo rule chính sách sàn.',
  'Không viết đúng tên sàn cụ thể trong câu trả lời gửi khách; nếu cần thì gọi chung là "sàn".',
  'Không nhắc số điện thoại, Zalo, Facebook, website riêng, địa chỉ shop, kênh thanh toán ngoài sàn hoặc hướng khách qua lấy trực tiếp.',
  'Không cung cấp giá, khuyến mãi, voucher hoặc phí ship; chỉ hướng khách xem trực tiếp trên sàn.',
  'Không hứa chắc hoàn tiền, đổi trả hoặc bảo hành; chỉ nói shop sẽ kiểm tra theo chính sách của sàn và tình trạng đơn.',
  'Không dùng các câu tuyệt đối như cam kết 100%, chắc chắn dùng được, không bao giờ lỗi hoặc bảo hành đổi mới ngay.',
  'Không xin khách sửa, xóa, đổi hoặc để lại đánh giá; chỉ ghi nhận phản hồi và xử lý vấn đề khách báo.',
  'Không hướng dẫn khách lách chính sách hoàn, hủy, đổi trả hoặc khai báo sai sự thật.',
  'Không nhắc lại thông tin nhạy cảm khách gửi như số điện thoại, địa chỉ, OTP, tài khoản ngân hàng hoặc giấy tờ cá nhân.',
  'Không dùng thông tin nhạy cảm của khách để tự động xác minh hoặc xử lý; chỉ nhân viên đọc khi cần.',
  'Với sản phẩm điện hoặc cần lắp đặt, không hướng dẫn đấu nối chi tiết; chỉ nhắc đọc hướng dẫn sử dụng gửi kèm và nhờ kỹ thuật viên nếu không chắc.',
  `Nếu khách xin thông tin liên hệ, địa chỉ hoặc kênh ngoài sàn thì chỉ trả lời theo hướng an toàn: "${CHAT_AI_SUPPORT_CONTACT_POLICY_REPLY}"`,
  'Nếu câu trả lời bị chặn vì rủi ro chính sách dù chỉ một lần, hội thoại phải khóa AI tự động và chờ nhân viên xử lý.'
]

export const CHAT_AI_SUPPORT_SYSTEM_PROMPT = [
  'Bạn là AI Support cho shop bán hàng trên sàn. Trả lời bằng tiếng Việt có dấu, xưng hô trung tính kiểu "Dạ shop hỗ trợ mình...".',
  'Mục tiêu là tự xử lý hội thoại an toàn, nhưng chỉ được gửi khi chắc chắn không vi phạm chính sách sàn.',
  'Không dùng emoji, không dùng ký hiệu trang trí, không đoán giới tính khách.',
  'Không viết đúng tên sàn cụ thể trong phần trả lời khách; chỉ dùng chữ "sàn".',
  'Không dẫn khách ra ngoài sàn, không cung cấp địa chỉ shop, không nhắc kênh liên hệ ngoài sàn hoặc thanh toán ngoài sàn.',
  'Không tự trả lời giá, khuyến mãi, voucher hoặc phí ship; hướng khách xem trực tiếp trên sàn.',
  'Không hứa chắc hoàn tiền, đổi trả hoặc bảo hành trong mọi trường hợp.',
  'Nếu thiếu dữ liệu hoặc có rủi ro chính sách, trả về reply rỗng hoặc needs_review=true để hệ thống chặn trước gửi.',
  'Chỉ trả về JSON hợp lệ dạng {"reply":"","warnings":[],"needs_review":true}.'
].join('\n')

const PLATFORM_NAME_PATTERNS = [
  /\bshopee(?:\s+shop)?\b/gi,
  /\blazada\b/gi,
  /\btik\s?tok(?:\s+shop)?\b/gi
]

function cleanText(value) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\u00a0/g, ' ').trim()
}

export function normalizeAiSupportPolicyText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeRuleLines(value, limit = 240) {
  const source = Array.isArray(value) ? value : cleanText(value).split(/[\n;]/)
  const seen = new Set()
  const lines = []
  for (const raw of source) {
    const text = cleanText(raw).slice(0, 300)
    const key = text.toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    lines.push(text)
  }
  return lines.slice(0, limit)
}

function patternMatchesText(text, pattern) {
  const raw = cleanText(pattern)
  if (!raw) return false
  const regexBody = raw.startsWith('regex:') ? raw.slice(6) : ''
  const slashMatch = raw.match(/^\/(.+)\/([a-z]*)$/i)
  if (regexBody || slashMatch) {
    try {
      const source = regexBody || slashMatch[1]
      const flags = slashMatch?.[2] || 'iu'
      return new RegExp(source, flags.includes('i') ? flags : `${flags}i`).test(text)
    } catch {
      return false
    }
  }
  const haystack = ` ${normalizeAiSupportPolicyText(text)} `
  const needle = normalizeAiSupportPolicyText(raw)
  return Boolean(needle && haystack.includes(` ${needle} `))
}

function hasAnyTerm(normalizedText, terms = []) {
  const haystack = ` ${normalizedText} `
  return terms.find(term => {
    const needle = normalizeAiSupportPolicyText(term)
    return needle && haystack.includes(` ${needle} `)
  }) || ''
}

function buildViolation(code, detail, options = {}) {
  return {
    code,
    label: code,
    detail,
    risk_level: options.risk_level || 'high',
    source: options.source || 'chat_ai_support_policy',
    action: options.action || 'block'
  }
}

export function sanitizeAiSupportReplyText(value) {
  let text = cleanText(value)
  const replacements = []
  for (const pattern of PLATFORM_NAME_PATTERNS) {
    const before = text
    text = text.replace(pattern, 'sàn')
    if (before !== text) replacements.push('platform_name_to_san')
  }
  return {
    text,
    changed: text !== cleanText(value),
    replacements: [...new Set(replacements)]
  }
}

export function evaluateAiSupportPolicyReply(value, options = {}) {
  const originalText = cleanText(value)
  const sanitized = sanitizeAiSupportReplyText(originalText)
  const text = sanitized.text
  const normalized = normalizeAiSupportPolicyText(text)
  const violations = []
  const warnings = []

  if (!text) {
    return {
      allowed: true,
      blocked: false,
      sanitized_text: text,
      sanitized_changed: sanitized.changed,
      violations,
      warnings,
      needs_review: 0,
      lock_conversation: false
    }
  }

  if (sanitized.changed) {
    warnings.push('Hệ thống đã tự thay tên sàn cụ thể thành "sàn" trước khi kiểm tra chính sách.')
  }

  const exactPatterns = normalizeRuleLines([
    ...CHAT_AI_SUPPORT_DEFAULT_FORBIDDEN_PATTERNS,
    ...(Array.isArray(options.customForbiddenPatterns) ? options.customForbiddenPatterns : normalizeRuleLines(options.customForbiddenPatterns || []))
  ])
  for (const pattern of exactPatterns) {
    if (patternMatchesText(text, pattern)) {
      violations.push(buildViolation('forbidden_pattern', `Khớp rule chặn: ${pattern}`, { source: 'forbidden_pattern' }))
    }
  }

  const outsideContact = hasAnyTerm(normalized, [
    'zalo',
    'facebook',
    'messenger',
    'telegram',
    'whatsapp',
    'hotline',
    'so dien thoai',
    'sdt',
    'email',
    'website rieng',
    'link ngoai'
  ])
  if (outsideContact) {
    violations.push(buildViolation('outside_contact', `Có dấu hiệu dẫn khách ra kênh ngoài sàn: ${outsideContact}.`))
  }

  const outsidePayment = hasAnyTerm(normalized, [
    'chuyen khoan',
    'so tai khoan',
    'tai khoan ngan hang',
    'ngan hang',
    'momo',
    'dat coc',
    'thanh toan ngoai',
    'giam rieng'
  ])
  if (outsidePayment) {
    violations.push(buildViolation('outside_payment', `Có dấu hiệu thanh toán hoặc ưu đãi ngoài sàn: ${outsidePayment}.`))
  }

  const addressPickup = hasAnyTerm(normalized, [
    'dia chi shop',
    'dia chi cua hang',
    'dia chi kho',
    'showroom',
    'qua lay truc tiep',
    'den lay truc tiep',
    'google maps'
  ])
  if (addressPickup) {
    violations.push(buildViolation('shop_address_or_pickup', `Có dấu hiệu cung cấp địa chỉ hoặc hướng qua lấy trực tiếp: ${addressPickup}.`))
  }

  const pricePromo = hasAnyTerm(normalized, [
    'gia hien tai',
    'gia san pham',
    'gia ban',
    'bao nhieu tien',
    'khuyen mai',
    'voucher',
    'ma giam gia',
    'phi ship',
    'phi van chuyen',
    'giam gia'
  ])
  if (pricePromo) {
    violations.push(buildViolation('price_promo_shipping', `AI không được tự trả lời giá, khuyến mãi, voucher hoặc phí ship: ${pricePromo}.`))
  }

  const absoluteClaim = hasAnyTerm(normalized, [
    'cam ket 100',
    'chac chan dung duoc',
    'khong bao gio loi',
    'bao hanh doi moi ngay',
    'hoan tien ngay',
    'doi moi ngay'
  ])
  if (absoluteClaim) {
    violations.push(buildViolation('absolute_claim', `Có câu khẳng định tuyệt đối không được phép dùng: ${absoluteClaim}.`))
  }

  const refundPromise = hasAnyTerm(normalized, [
    'se hoan tien',
    'duoc hoan tien',
    'se doi tra',
    'duoc doi tra',
    'bao hanh doi moi',
    'shop hoan tien',
    'shop doi moi'
  ])
  if (refundPromise) {
    violations.push(buildViolation('refund_return_warranty_promise', `AI không được hứa chắc hoàn tiền, đổi trả hoặc bảo hành: ${refundPromise}.`))
  }

  const reviewManipulation = hasAnyTerm(normalized, [
    'danh gia tot',
    '5 sao',
    'sua danh gia',
    'xoa danh gia',
    'doi danh gia',
    'de lai danh gia'
  ])
  if (reviewManipulation) {
    violations.push(buildViolation('review_manipulation', `Không được tác động đến đánh giá của khách: ${reviewManipulation}.`))
  }

  const policyBypass = hasAnyTerm(normalized, [
    'lach chinh sach',
    'ghi ly do the nao',
    'ly do de duyet',
    'chon ly do',
    'khai bao sai',
    'ghi sao cho co loi'
  ])
  if (policyBypass) {
    violations.push(buildViolation('policy_bypass', `Không được hướng dẫn lách chính sách hoặc khai báo sai: ${policyBypass}.`))
  }

  const sensitiveEcho = hasAnyTerm(normalized, [
    'ma otp',
    'otp',
    'can cuoc',
    'cccd',
    'cmnd',
    'tai khoan ngan hang'
  ])
  if (sensitiveEcho) {
    violations.push(buildViolation('sensitive_data_echo', `Không được nhắc lại hoặc dùng thông tin nhạy cảm: ${sensitiveEcho}.`))
  }

  const electricalDetail = hasAnyTerm(normalized, [
    'dau day truc tiep',
    'noi nguon',
    'sua mach',
    'dien dang cap nguon',
    'day l',
    'day n',
    '220v'
  ])
  if (electricalDetail) {
    violations.push(buildViolation('dangerous_installation_detail', `Không được hướng dẫn đấu nối điện hoặc sửa mạch chi tiết: ${electricalDetail}.`))
  }

  for (const trigger of normalizeRuleLines(options.customReviewTriggers || CHAT_AI_SUPPORT_DEFAULT_REVIEW_TRIGGERS)) {
    if (patternMatchesText(text, trigger)) {
      warnings.push(`Nội dung nhạy cảm cần kiểm tra: ${trigger}`)
    }
  }

  const deduped = []
  const seen = new Set()
  for (const violation of violations) {
    const key = `${violation.code}|${violation.detail}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(violation)
  }

  return {
    allowed: deduped.length === 0,
    blocked: deduped.length > 0,
    sanitized_text: text,
    sanitized_changed: sanitized.changed,
    violations: deduped,
    warnings: [...new Set(warnings)].slice(0, 20),
    needs_review: deduped.length || warnings.length ? 1 : 0,
    lock_conversation: deduped.length > 0
  }
}
