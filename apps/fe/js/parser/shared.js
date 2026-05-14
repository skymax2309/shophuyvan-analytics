export async function loadCostConfig(apiUrl) {
  try {
    const data = await fetch(`${apiUrl}/api/cost-settings`).then(response => response.json())
    window._costCfg = {}
    for (const item of data || []) window._costCfg[item.cost_key] = item.cost_value
  } catch (error) {
    console.warn('Không load được cấu hình chi phí, dùng giá trị mặc định:', error)
    window._costCfg = {}
  }
}

export function parseFileMeta(filename) {
  const name = String(filename || '').replace(/\.xlsx$/i, '')
  const parts = name.split('_')
  let platform = 'unknown'
  const shop = parts[0] || 'unknown'

  for (const part of parts) {
    const key = foldText(part)
    if (key === 'shopee') { platform = 'shopee'; break }
    if (key === 'tiktok') { platform = 'tiktok'; break }
    if (key === 'lazada') { platform = 'lazada'; break }
  }

  return { platform, shop }
}

export function detectPlatform(row) {
  if (findKey(row, 'Mã đơn hàng') !== undefined) return 'shopee'
  if (findKey(row, 'Order ID') !== undefined && findKey(row, 'SKU Subtotal After Discount') !== undefined) return 'tiktok'
  if (findKey(row, 'Order ID') !== undefined && findKey(row, 'Seller SKU') !== undefined) return 'tiktok'
  if (findKey(row, 'orderNumber') !== undefined) return 'lazada'
  return 'unknown'
}

export function cleanText(value) {
  const text = String(value ?? '').replace(/\u00a0/g, ' ').trim()
  const lower = text.toLowerCase()
  if (!text || ['null', 'undefined', 'none', '-', '--', 'unknown', 'n/a', 'na'].includes(lower)) return ''
  return text
}

export function foldText(value) {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, match => match === 'Đ' ? 'D' : 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function toMoney(value) {
  if (value === null || value === undefined) return 0
  const number = Number(String(value).replace(/[,\s]/g, ''))
  return Number.isFinite(number) ? Math.round(number) : 0
}

export function toInt(value) {
  return Math.max(1, Math.floor(toMoney(value)))
}

export function toDate(value) {
  const text = cleanText(value)
  if (!text) return ''

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slash) return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`

  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  }
  const monthText = text.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/)
  if (monthText) return `${monthText[3]}-${months[monthText[2].toLowerCase()] || '01'}-${monthText[1].padStart(2, '0')}`

  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  return ''
}

export function findKey(row, keyword) {
  if (!row || typeof row !== 'object') return undefined
  if (row[keyword] !== undefined) return row[keyword]

  const normalize = value => String(value || '').normalize('NFC')
  const target = normalize(keyword)
  for (const key of Object.keys(row)) {
    if (normalize(key) === target) return row[key]
  }

  const foldedTarget = foldText(keyword)
  for (const key of Object.keys(row)) {
    if (foldText(key) === foldedTarget) return row[key]
  }
  return undefined
}

export function hasFolded(text, keywords) {
  const folded = foldText(text)
  return keywords.some(keyword => folded.includes(keyword))
}

export function costValue(key, fallback) {
  const value = Number(window._costCfg?.[key])
  return Number.isFinite(value) ? value : fallback
}

export function tagOrderType(current, next) {
  if (current === 'return' || next === 'return') return 'return'
  if (current === 'cancel' || next === 'cancel') return 'cancel'
  return 'normal'
}
