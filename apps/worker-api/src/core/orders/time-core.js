const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

function cleanOrderTimeText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function pad2(value) {
  return String(Number(value || 0)).padStart(2, '0')
}

function toBangkokShiftedDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
  return new Date(date.getTime() + BANGKOK_OFFSET_MS)
}

function bangkokParts(date) {
  const shifted = toBangkokShiftedDate(date)
  if (!shifted) return null
  return {
    year: shifted.getUTCFullYear(),
    month: pad2(shifted.getUTCMonth() + 1),
    day: pad2(shifted.getUTCDate()),
    hour: pad2(shifted.getUTCHours()),
    minute: pad2(shifted.getUTCMinutes()),
    second: pad2(shifted.getUTCSeconds())
  }
}

function parseNumericTime(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return null
  return number > 1e12 ? new Date(number) : new Date(number * 1000)
}

function parseLooseDateText(value) {
  const text = cleanOrderTimeText(value)
  if (!text) return null
  if (/^\d{10,13}$/.test(text)) return parseNumericTime(text)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T00:00:00+07:00`)
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(text)) {
    return new Date(text.replace(' ', 'T') + '+07:00')
  }
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? new Date(parsed) : null
}

export function formatBangkokIso(date) {
  const parts = bangkokParts(date)
  if (!parts) return ''
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+07:00`
}

export function formatBangkokDateTime(date) {
  const parts = bangkokParts(date)
  if (!parts) return ''
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

export function formatBangkokDate(date) {
  const parts = bangkokParts(date)
  if (!parts) return ''
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function nowBangkokText() {
  return formatBangkokDateTime(new Date())
}

export function ymdToBangkokEpoch(value, endOfDay = false) {
  const text = cleanOrderTimeText(value)
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return 0
  const hour = endOfDay ? 23 : 0
  const minute = endOfDay ? 59 : 0
  const second = endOfDay ? 59 : 0
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour - 7, minute, second) / 1000)
}

export function ymdToBangkokMs(value, endOfDay = false) {
  const epoch = ymdToBangkokEpoch(value, endOfDay)
  return epoch ? epoch * 1000 : 0
}

export function unixSecondsToBangkokText(value) {
  const date = parseNumericTime(value)
  return date ? formatBangkokDateTime(date) : ''
}

export function normalizeBangkokDateTime(value) {
  if (!value && value !== 0) return ''
  if (value instanceof Date) return formatBangkokDateTime(value)
  const numeric = parseNumericTime(value)
  if (numeric) return formatBangkokDateTime(numeric)
  const parsed = parseLooseDateText(value)
  return parsed ? formatBangkokDateTime(parsed) : cleanOrderTimeText(value)
}

export function normalizeBangkokDate(value) {
  if (!value && value !== 0) return ''
  if (value instanceof Date) return formatBangkokDate(value)
  const numeric = parseNumericTime(value)
  if (numeric) return formatBangkokDate(numeric)
  const parsed = parseLooseDateText(value)
  return parsed ? formatBangkokDate(parsed) : cleanOrderTimeText(value).slice(0, 10)
}
