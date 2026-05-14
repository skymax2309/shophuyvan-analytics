const CONFIG_KEY = 'oms_non_api_bot_settings'

const DEFAULT_SETTINGS = {
  enabled: false,
  auto_start_python: true,
  order_min_minutes: 10,
  order_max_minutes: 20,
  status_min_minutes: 10,
  status_max_minutes: 20,
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
    auto_start_python: asBool(input.auto_start_python, DEFAULT_SETTINGS.auto_start_python),
    order_min_minutes: asInt(input.order_min_minutes, DEFAULT_SETTINGS.order_min_minutes, 1, 240),
    order_max_minutes: asInt(input.order_max_minutes, DEFAULT_SETTINGS.order_max_minutes, 1, 240),
    status_min_minutes: asInt(input.status_min_minutes, DEFAULT_SETTINGS.status_min_minutes, 1, 240),
    status_max_minutes: asInt(input.status_max_minutes, DEFAULT_SETTINGS.status_max_minutes, 1, 240),
    run_start_time: runStartTime,
    run_end_time: runEndTime,
    run_start_hour: hourFromTime(runStartTime, DEFAULT_SETTINGS.run_start_hour),
    run_end_hour: hourFromTime(runEndTime, DEFAULT_SETTINGS.run_end_hour),
    updated_at: input.updated_at || ''
  }

  if (settings.order_max_minutes < settings.order_min_minutes) settings.order_max_minutes = settings.order_min_minutes
  if (settings.status_max_minutes < settings.status_min_minutes) settings.status_max_minutes = settings.status_min_minutes
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
