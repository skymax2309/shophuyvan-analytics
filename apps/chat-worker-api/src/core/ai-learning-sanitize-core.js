import { cleanText } from './message-normalize.js'

const PLACEHOLDERS = {
  phone: '[số điện thoại]',
  email: '[email]',
  link: '[liên kết]',
  code: '[mã đơn hoặc vận đơn]',
  address: '[địa chỉ]',
  customer_name: '[tên khách]',
  customer_id: '[mã khách]'
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function replaceTracked(text, pattern, placeholder, type, redactions) {
  return text.replace(pattern, (match) => {
    if (cleanText(match) === placeholder) return match
    redactions.push(type)
    return placeholder
  })
}

function replacePrivateValues(text, values = [], redactions = []) {
  let output = text
  for (const item of values) {
    const value = cleanText(item.value ?? item)
    if (value.length < 3) continue
    const type = cleanText(item.type) || 'customer_name'
    const placeholder = PLACEHOLDERS[type] || PLACEHOLDERS.customer_name
    output = replaceTracked(output, new RegExp(escapeRegExp(value), 'giu'), placeholder, type, redactions)
  }
  return output
}

function compactPlaceholders(text = '') {
  return cleanText(text)
    .replace(/(\[[^\]]+\])(?:\s*,?\s*\1)+/giu, '$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
}

function protectKnownPlaceholders(text = '') {
  const pairs = []
  let output = text
  Object.values(PLACEHOLDERS).forEach((placeholder, index) => {
    const token = `\uE000${index}\uE000`
    pairs.push([token, placeholder])
    output = output.replace(new RegExp(escapeRegExp(placeholder), 'giu'), token)
  })
  return {
    text: output,
    restore(value = '') {
      return pairs.reduce((current, [token, placeholder]) => current.replace(new RegExp(escapeRegExp(token), 'g'), placeholder), value)
    }
  }
}

export function sanitizeApprovedLearningText(value, options = {}) {
  const redactions = []
  const protectedText = protectKnownPlaceholders(cleanText(value))
  let text = protectedText.text
  text = replacePrivateValues(text, options.private_values, redactions)
  text = replaceTracked(text, /(?:\+?\s*84|0084|0)(?:[\s().-]*\d){8,10}/giu, PLACEHOLDERS.phone, 'phone', redactions)
  text = replaceTracked(text, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, PLACEHOLDERS.email, 'email', redactions)
  text = replaceTracked(text, /(?:https?:\/\/|www\.)[^\s<>()]+/giu, PLACEHOLDERS.link, 'link', redactions)
  text = replaceTracked(
    text,
    /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com\.vn|com|vn|net|org|io|me|shop|store|online|site|xyz|info|biz|co|app|dev|cloud)\b(?:\/[^\s<>()]*)?/giu,
    PLACEHOLDERS.link,
    'link',
    redactions
  )
  text = replaceTracked(text, /\b(?=[A-Z0-9_-]{10,}\b)(?=[A-Z0-9_-]*\d)(?=[A-Z0-9_-]*[A-Z])[A-Z0-9][A-Z0-9_-]{9,}\b/giu, PLACEHOLDERS.code, 'code', redactions)
  text = replaceTracked(
    text,
    /(?:địa chỉ|nhận tại|giao tới|giao đến)\s*[:\-]?\s*[^.;\n]+/giu,
    PLACEHOLDERS.address,
    'address',
    redactions
  )
  text = replaceTracked(
    text,
    /\b\d{1,5}(?:[/-]\d{1,5})?\s+[^,.;\n]{3,},\s*[^,.;\n]{2,}/giu,
    PLACEHOLDERS.address,
    'address',
    redactions
  )
  const sanitized = compactPlaceholders(protectedText.restore(text))
  return {
    text: sanitized,
    pii_redacted_count: redactions.length,
    redactions: [...new Set(redactions)]
  }
}

export function sanitizeApprovedLearningPair(input = {}) {
  const privateValues = Array.isArray(input.private_values) ? input.private_values : []
  const question = sanitizeApprovedLearningText(input.question, { private_values: privateValues })
  const answer = sanitizeApprovedLearningText(input.answer, { private_values: privateValues })
  if (!question.text || !answer.text) {
    return {
      ok: false,
      error: 'question_answer_required',
      question: question.text,
      answer: answer.text,
      pii_redacted_count: question.pii_redacted_count + answer.pii_redacted_count,
      redactions: [...new Set([...question.redactions, ...answer.redactions])]
    }
  }
  return {
    ok: true,
    question: question.text,
    answer: answer.text,
    pii_redacted_count: question.pii_redacted_count + answer.pii_redacted_count,
    redactions: [...new Set([...question.redactions, ...answer.redactions])]
  }
}
