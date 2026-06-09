import { cleanText, safeJsonParse } from './message-normalize.js'

function stableHash(value) {
  let hash = 0
  const text = cleanText(value)
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0
  }
  return Math.abs(hash).toString(36)
}

function stableAttachmentReference(item = {}) {
  const value = cleanText(item.r2_key || item.storage_key || item.key || item.url || item.thumbnail_url || item.thumb_url)
  if (!value) return cleanText(item.name || item.filename)
  if (value.startsWith('data:')) return `data:${value.length}:${stableHash(value)}`
  try {
    const parsed = new URL(value)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return value.split('?')[0].split('#')[0]
  }
}

export function zaloSemanticAttachmentsKey(value) {
  const raw = Array.isArray(value) ? value : safeJsonParse(value, [])
  return (Array.isArray(raw) ? raw : [])
    .filter(Boolean)
    .slice(0, 12)
    .map(item => [
      cleanText(item.type || item.kind || 'file').toLowerCase(),
      cleanText(item.mime_type || item.mimeType || item.type_mime).toLowerCase(),
      Math.max(Number(item.size || 0) || 0, 0),
      stableAttachmentReference(item)
    ].join(':'))
    .sort()
    .join('|')
}

function zaloLocalVisibleTime(message = {}) {
  const platformMessageId = cleanText(message.platform_message_id)
  if (!platformMessageId.startsWith('zalo_local_')) return ''
  const match = platformMessageId.match(/_(\d{1,2})[:_](\d{2})_[^_]+$/)
  if (!match) return ''
  return `${String(match[1]).padStart(2, '0')}:${match[2]}`
}

function zaloLegacyContentKey(message = {}) {
  return [
    cleanText(message.conversation_id),
    cleanText(message.text).replace(/\s+/g, ' '),
    zaloSemanticAttachmentsKey(message.attachments)
  ].join('|')
}

function zaloStableAliasScore(message = {}) {
  const platformMessageId = cleanText(message.platform_message_id)
  if (/(\d{1,2})[\/_-](\d{1,2})[\/_-](\d{4})/.test(platformMessageId)) return 3
  if (platformMessageId.includes('_date_unknown_')) return 1
  return 2
}

function explicitZaloDateKey(message = {}) {
  const match = cleanText(message.platform_message_id).match(/(\d{1,2})[\/_-](\d{1,2})[\/_-](\d{4})/)
  if (!match) return ''
  return `${String(match[1]).padStart(2, '0')}/${String(match[2]).padStart(2, '0')}/${match[3]}`
}

function isZaloLocalBrowserMessage(message = {}) {
  return cleanText(message.channel).toLowerCase() === 'zalo' &&
    cleanText(message.source).toLowerCase() === 'zalo_local_browser'
}

export function compactLegacyZaloBrowserAliases(messages = []) {
  const aliasGroups = new Map()
  const noTimeGroups = new Map()
  const timedContentKeys = new Set()
  const kept = new Set()
  for (const message of messages) {
    if (!isZaloLocalBrowserMessage(message)) {
      kept.add(message)
      continue
    }
    const contentKey = zaloLegacyContentKey(message)
    const visibleTime = zaloLocalVisibleTime(message)
    if (!visibleTime) {
      if (!noTimeGroups.has(contentKey)) noTimeGroups.set(contentKey, [])
      noTimeGroups.get(contentKey).push(message)
      continue
    }
    timedContentKeys.add(contentKey)
    const groupKey = `${contentKey}|${visibleTime}`
    if (!aliasGroups.has(groupKey)) aliasGroups.set(groupKey, [])
    aliasGroups.get(groupKey).push(message)
  }

  for (const group of aliasGroups.values()) {
    const explicitByDate = new Map()
    for (const message of group) {
      const explicitDate = explicitZaloDateKey(message)
      if (!explicitDate) continue
      const current = explicitByDate.get(explicitDate)
      if (!current || zaloStableAliasScore(message) > zaloStableAliasScore(current)) {
        explicitByDate.set(explicitDate, message)
      }
    }
    if (explicitByDate.size) {
      for (const message of explicitByDate.values()) kept.add(message)
      continue
    }
    let best = null
    for (const message of group) {
      if (!best || zaloStableAliasScore(message) > zaloStableAliasScore(best)) best = message
    }
    if (best) kept.add(best)
  }

  for (const [contentKey, group] of noTimeGroups.entries()) {
    if (timedContentKeys.has(contentKey)) continue
    let best = null
    for (const message of group) {
      if (!best || zaloStableAliasScore(message) > zaloStableAliasScore(best)) best = message
    }
    if (best) kept.add(best)
  }

  return messages.filter(message => kept.has(message))
}
