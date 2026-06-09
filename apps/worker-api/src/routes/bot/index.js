const CONFIG_KEY = 'oms_non_api_bot_settings'

const DEFAULT_SETTINGS = {
  enabled: false,
  auto_order_enabled: true,
  auto_status_enabled: true,
  auto_detail_enabled: true,
  auto_finance_enabled: true,
  auto_label_enabled: true,
  auto_customer_enabled: true,
  auto_chat_enabled: true,
  auto_start_python: true,
  order_confirm_message_enabled: false,
  order_confirm_message_mode: 'draft_only',
  order_confirm_message_trigger_status: 'new_order',
  order_confirm_message_template: 'Dạ Shop Huy Vân xác nhận đã nhận đơn {order_id} của mình. Shop sẽ chuẩn bị hàng và bàn giao đơn vị vận chuyển sớm. Mình kiểm tra giúp shop đúng sản phẩm và địa chỉ giao hàng nhé ạ.',
  order_min_minutes: 10,
  order_max_minutes: 20,
  status_min_minutes: 10,
  status_max_minutes: 20,
  detail_min_minutes: 30,
  detail_max_minutes: 60,
  finance_min_minutes: 60,
  finance_max_minutes: 120,
  label_min_minutes: 30,
  label_max_minutes: 90,
  customer_min_minutes: 60,
  customer_max_minutes: 180,
  chat_min_minutes: 10,
  chat_max_minutes: 20,
  run_start_time: '05:00',
  run_end_time: '23:00',
  run_start_hour: 5,
  run_end_hour: 23,
  updated_at: ''
}

function asBool(value, fallback) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true
  if (value === false || value === 0 || value === '0' || value === 'false') return false
  return fallback
}

function asInt(value, fallback, min, max) {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number)) return fallback
  return Math.min(Math.max(number, min), max)
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function timeFromHour(hour, fallback) {
  const value = asInt(hour, fallback, 0, 23)
  return `${pad2(value)}:00`
}

function asTime(value, fallback, legacyHour) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{1,2}):(\d{2})$/)
  if (match) {
    const hour = Number.parseInt(match[1], 10)
    const minute = Number.parseInt(match[2], 10)
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${pad2(hour)}:${pad2(minute)}`
    }
  }

  const numericHour = Number.parseInt(value, 10)
  if (Number.isFinite(numericHour)) return timeFromHour(numericHour, Number.parseInt(fallback, 10) || 0)
  if (legacyHour !== undefined && legacyHour !== null) return timeFromHour(legacyHour, Number.parseInt(fallback, 10) || 0)
  return fallback
}

function hourFromTime(value, fallback) {
  const text = asTime(value, `${pad2(fallback)}:00`)
  return Number.parseInt(text.slice(0, 2), 10)
}

function normalizeSettings(input = {}) {
  const runStartTime = asTime(input.run_start_time, DEFAULT_SETTINGS.run_start_time, input.run_start_hour)
  const runEndTime = asTime(input.run_end_time, DEFAULT_SETTINGS.run_end_time, input.run_end_hour)
  const settings = {
    enabled: asBool(input.enabled, DEFAULT_SETTINGS.enabled),
    auto_order_enabled: asBool(input.auto_order_enabled, DEFAULT_SETTINGS.auto_order_enabled),
    auto_status_enabled: asBool(input.auto_status_enabled, DEFAULT_SETTINGS.auto_status_enabled),
    auto_detail_enabled: asBool(input.auto_detail_enabled, DEFAULT_SETTINGS.auto_detail_enabled),
    auto_finance_enabled: asBool(input.auto_finance_enabled, DEFAULT_SETTINGS.auto_finance_enabled),
    auto_label_enabled: asBool(input.auto_label_enabled, DEFAULT_SETTINGS.auto_label_enabled),
    auto_customer_enabled: asBool(input.auto_customer_enabled, DEFAULT_SETTINGS.auto_customer_enabled),
    auto_chat_enabled: asBool(input.auto_chat_enabled, DEFAULT_SETTINGS.auto_chat_enabled),
    auto_start_python: asBool(input.auto_start_python, DEFAULT_SETTINGS.auto_start_python),
    order_confirm_message_enabled: asBool(input.order_confirm_message_enabled, DEFAULT_SETTINGS.order_confirm_message_enabled),
    order_confirm_message_mode: ['draft_only', 'auto_send_when_allowed'].includes(String(input.order_confirm_message_mode || '')) ? input.order_confirm_message_mode : DEFAULT_SETTINGS.order_confirm_message_mode,
    order_confirm_message_trigger_status: String(input.order_confirm_message_trigger_status || DEFAULT_SETTINGS.order_confirm_message_trigger_status).trim() || DEFAULT_SETTINGS.order_confirm_message_trigger_status,
    order_confirm_message_template: String(input.order_confirm_message_template || DEFAULT_SETTINGS.order_confirm_message_template).trim() || DEFAULT_SETTINGS.order_confirm_message_template,
    order_min_minutes: asInt(input.order_min_minutes, DEFAULT_SETTINGS.order_min_minutes, 1, 240),
    order_max_minutes: asInt(input.order_max_minutes, DEFAULT_SETTINGS.order_max_minutes, 1, 240),
    status_min_minutes: asInt(input.status_min_minutes, DEFAULT_SETTINGS.status_min_minutes, 1, 240),
    status_max_minutes: asInt(input.status_max_minutes, DEFAULT_SETTINGS.status_max_minutes, 1, 240),
    detail_min_minutes: asInt(input.detail_min_minutes, DEFAULT_SETTINGS.detail_min_minutes, 1, 240),
    detail_max_minutes: asInt(input.detail_max_minutes, DEFAULT_SETTINGS.detail_max_minutes, 1, 240),
    finance_min_minutes: asInt(input.finance_min_minutes, DEFAULT_SETTINGS.finance_min_minutes, 1, 240),
    finance_max_minutes: asInt(input.finance_max_minutes, DEFAULT_SETTINGS.finance_max_minutes, 1, 240),
    label_min_minutes: asInt(input.label_min_minutes, DEFAULT_SETTINGS.label_min_minutes, 1, 240),
    label_max_minutes: asInt(input.label_max_minutes, DEFAULT_SETTINGS.label_max_minutes, 1, 240),
    customer_min_minutes: asInt(input.customer_min_minutes, DEFAULT_SETTINGS.customer_min_minutes, 1, 240),
    customer_max_minutes: asInt(input.customer_max_minutes, DEFAULT_SETTINGS.customer_max_minutes, 1, 240),
    chat_min_minutes: asInt(input.chat_min_minutes, DEFAULT_SETTINGS.chat_min_minutes, 1, 240),
    chat_max_minutes: asInt(input.chat_max_minutes, DEFAULT_SETTINGS.chat_max_minutes, 1, 240),
    run_start_time: runStartTime,
    run_end_time: runEndTime,
    run_start_hour: hourFromTime(runStartTime, DEFAULT_SETTINGS.run_start_hour),
    run_end_hour: hourFromTime(runEndTime, DEFAULT_SETTINGS.run_end_hour),
    updated_at: input.updated_at || ''
  }

  if (settings.order_max_minutes < settings.order_min_minutes) settings.order_max_minutes = settings.order_min_minutes
  if (settings.status_max_minutes < settings.status_min_minutes) settings.status_max_minutes = settings.status_min_minutes
  if (settings.detail_max_minutes < settings.detail_min_minutes) settings.detail_max_minutes = settings.detail_min_minutes
  if (settings.finance_max_minutes < settings.finance_min_minutes) settings.finance_max_minutes = settings.finance_min_minutes
  if (settings.label_max_minutes < settings.label_min_minutes) settings.label_max_minutes = settings.label_min_minutes
  if (settings.customer_max_minutes < settings.customer_min_minutes) settings.customer_max_minutes = settings.customer_min_minutes
  if (settings.chat_max_minutes < settings.chat_min_minutes) settings.chat_max_minutes = settings.chat_min_minutes
  return settings
}

async function ensureConfigTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)`).run()
}

async function readSettings(env) {
  await ensureConfigTable(env)
  const row = await env.DB.prepare(`SELECT value FROM app_config WHERE key = ?`).bind(CONFIG_KEY).first()
  if (!row?.value) return { ...DEFAULT_SETTINGS }
  try {
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(row.value) })
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function readBotSettings(env) {
  return readSettings(env)
}

async function writeSettings(env, settings) {
  await ensureConfigTable(env)
  const payload = {
    ...normalizeSettings(settings),
    updated_at: new Date().toISOString()
  }
  await env.DB.prepare(`
    INSERT INTO app_config (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).bind(CONFIG_KEY, JSON.stringify(payload)).run()
  return payload
}

export async function handleBotSettings(request, env, cors) {
  if (request.method === 'GET') {
    return Response.json(await readSettings(env), { headers: cors })
  }

  if (request.method === 'POST') {
    const current = await readSettings(env)
    const body = await request.json().catch(() => ({}))
    const saved = await writeSettings(env, { ...current, ...body })
    return Response.json(saved, { headers: cors })
  }

  return new Response('Method not allowed', { status: 405, headers: cors })
}
