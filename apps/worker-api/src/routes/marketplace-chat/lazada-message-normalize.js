const LAZADA_EMOJI_MAP = {
  happy: '🙂',
  veryhappy: '😄',
  smile: '🙂',
  laugh: '😄',
  confused: '😕',
  sad: '😢',
  cry: '😭',
  angry: '😠',
  surprise: '😮',
  love: '😍',
  kiss: '😘',
  blowingkiss: '😘',
  embarrassed: '☺️',
  cool: '😎',
  ok: '👌',
  thanks: '🙏'
}

function cleanText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return ''
  return String(value).replace(/\u00a0/g, ' ').trim()
}

function firstText(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.[key]
    const text = cleanText(value)
    if (text) return text
  }
  return ''
}

export function parseJsonLoose(value) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value
  let text = cleanText(value)
  if (!text) return null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = text.trim()
    if (!/^[{["]/.test(candidate)) return attempt ? text : null
    try {
      const parsed = JSON.parse(candidate)
      if (typeof parsed === 'string') {
        text = parsed
        continue
      }
      return parsed
    } catch {
      const unescaped = candidate.replace(/\\"/g, '"').replace(/\\\\n/g, '\n').replace(/\\\\r/g, '\r')
      if (unescaped === candidate) return attempt ? text : null
      text = unescaped
    }
  }
  return null
}

function decodeHtmlEntities(value = '') {
  return cleanText(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
}

function lazadaEmoji(value = '') {
  return decodeHtmlEntities(value).replace(/\[([a-z0-9_ -]+)\]/gi, (match, name) => {
    const key = cleanText(name).toLowerCase().replace(/\s+/g, '')
    return LAZADA_EMOJI_MAP[key] || match
  })
}

function linkText(label = '', url = '') {
  const safeLabel = cleanText(label) || 'Mở liên kết'
  const safeUrl = cleanText(url)
  return safeUrl ? `${safeLabel}: ${safeUrl}` : safeLabel
}

function mediaFromHtml(html = '') {
  const attachments = []
  const imagePattern = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = imagePattern.exec(html))) {
    const url = decodeHtmlEntities(match[1])
    if (!url) continue
    attachments.push({
      id: url,
      type: 'image',
      url,
      thumbnail_url: url,
      source: 'lazada_im_html'
    })
  }
  return attachments
}

function stripHtml(value = '') {
  let text = decodeHtmlEntities(value)
  text = text.replace(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis, (_all, url, label) => linkText(stripHtml(label), url))
  text = text.replace(/\bhref=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis, (_all, url, label) => linkText(stripHtml(label), url))
  text = text.replace(/<img\b[^>]*>/gi, ' ')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/p>|<\/div>|<\/li>/gi, '\n')
  text = text.replace(/<[^>]+>/g, ' ')
  return lazadaEmoji(text).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim()
}

function localizedText(value) {
  const parsed = parseJsonLoose(value)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return firstText(parsed, ['vi', 'en', 'text', 'txt', 'message', 'title', 'value', 'content'])
  }
  return cleanText(parsed || value)
}

function textFromObject(content = {}) {
  const direct = firstText(content, ['txt', 'text', 'message', 'content', 'summary', 'title', 'display_text', 'body'])
  if (direct) return localizedText(direct)
  const actionParts = []
  for (let index = 1; index <= 12; index += 1) {
    const text = localizedText(content[`action${index}Txt`])
    if (text) actionParts.push(text)
  }
  const firstAction = localizedText(content.actionTxt)
  if (firstAction) actionParts.unshift(firstAction)
  return actionParts.join(' · ')
}

function attachmentFromObject(content = {}, fallbackId = '') {
  const url = firstText(content, ['img_url', 'imgUrl', 'image_url', 'url', 'thumbnail_url', 'smallImgUrl', 'small_img_url'])
  if (!url) return []
  return [{
    id: fallbackId || url,
    type: 'image',
    url,
    thumbnail_url: firstText(content, ['smallImgUrl', 'small_img_url', 'thumbnail_url', 'thumb_url']) || url,
    source: 'lazada_im'
  }]
}

function messageLabelForUnsupported(text = '', attachments = []) {
  const cleaned = cleanText(text)
  if (!cleaned || /^\[unknown message\]$/i.test(cleaned)) {
    return attachments.length ? 'Hình ảnh từ Lazada' : 'Tin Lazada chưa hỗ trợ hiển thị'
  }
  return cleaned
}

export function normalizeLazadaMessagePayload(row = {}) {
  const parsedContent = parseJsonLoose(row.content)
  const content = parsedContent && typeof parsedContent === 'object' && !Array.isArray(parsedContent) ? parsedContent : row
  const rawText = typeof parsedContent === 'string'
    ? parsedContent
    : (parsedContent && typeof parsedContent === 'object' && !Array.isArray(parsedContent) ? textFromObject(parsedContent) : firstText(row, ['txt', 'text', 'message', 'message_text', 'content_text', 'summary', 'title']))
  const htmlSource = cleanText(typeof row.content === 'string' ? row.content : rawText)
  const attachments = [
    ...attachmentFromObject(content, firstText(row, ['message_id', 'msg_id', 'id'])),
    ...mediaFromHtml(htmlSource)
  ]
  const uniqueAttachments = [...new Map(attachments.map(item => [item.url || item.id, item])).values()]
  const text = messageLabelForUnsupported(stripHtml(rawText || htmlSource), uniqueAttachments).slice(0, 1200)
  const templateId = firstText(row, ['template_id', 'message_type', 'msg_type', 'type'])
  return {
    text,
    attachments: uniqueAttachments,
    content,
    message_type: /^\[[a-z0-9_ -]+\]$/i.test(cleanText(rawText)) ? 'emoji' : (templateId || (uniqueAttachments.length ? 'image' : 'text')),
    order_id: firstText(content, ['order_id', 'orderId']),
    product_ids: [firstText(content, ['item_id', 'itemId', 'product_id', 'productId'])].filter(Boolean)
  }
}
