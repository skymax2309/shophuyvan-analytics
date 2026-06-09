const DEFAULT_TIMEOUT_MS = 10000
const DEFAULT_CORE_API_BASE = 'https://huyvan-worker-api.nghiemchihuy.workers.dev'
const ZALO_HELPER_DEFAULT_TIMEOUT_MS = 120000
const ZALO_HELPER_PORTS = [8794, 8795, 8796, 8797, 8798, 8799]

export function chatApiBase() {
  return (window.SHOPHUYVAN_CHAT_API_BASE || 'https://shophuyvan-chat-api.zacha030596.workers.dev').replace(/\/+$/, '')
}

export function coreApiBase() {
  return (window.SHOPHUYVAN_CORE_API_BASE || DEFAULT_CORE_API_BASE).replace(/\/+$/, '')
}

export function localHelperBase() {
  return (window.SHOPHUYVAN_LOCAL_HELPER_BASE || 'http://127.0.0.1:8765').replace(/\/+$/, '')
}

export function zaloHelperBase() {
  return (window.SHOPHUYVAN_ZALO_HELPER_BASE || window.SHOPHUYVAN_ZALO_HELPER_DISCOVERED_BASE || 'http://127.0.0.1:8794').replace(/\/+$/, '')
}

function uniqueBases(values = []) {
  const seen = new Set()
  return values
    .map(value => String(value || '').trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .filter(value => {
      if (seen.has(value)) return false
      seen.add(value)
      return true
    })
}

function zaloHelperCandidateBases() {
  return uniqueBases([
    window.SHOPHUYVAN_ZALO_HELPER_BASE,
    window.SHOPHUYVAN_ZALO_HELPER_DISCOVERED_BASE,
    ...ZALO_HELPER_PORTS.map(port => `http://127.0.0.1:${port}`)
  ])
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function shouldRetry(error) {
  return error?.name === 'AbortError' || !error?.status
}

async function fetchJson(path, options = {}) {
  const headers = new Headers(options.headers || {})
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetch(`${options.base || chatApiBase()}${path}`, {
      ...options,
      headers,
      cache: 'no-store',
      signal: options.signal || controller.signal
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data?.ok === false) {
      if (options.allowBusinessError && data && Object.keys(data).length) return data
      const error = new Error(data.error_message || data.message || data.error || `HTTP ${response.status}`)
      error.status = response.status
      error.data = data
      throw error
    }
    return data
  } finally {
    clearTimeout(timer)
  }
}

export async function coreApi(path, options = {}) {
  try {
    return await fetchJson(path, { ...options, base: coreApiBase() })
  } catch (error) {
    if (!options.__retried && shouldRetry(error)) {
      await sleep(350)
      return coreApi(path, { ...options, __retried: true })
    }
    console.error('[core_api_error]', {
      error_code: error?.data?.error_code || error?.data?.error || 'network_error',
      error_message: readableError(error),
      path
    })
    throw error
  }
}

export async function chatApi(path, options = {}) {
  try {
    return await fetchJson(path, options)
  } catch (error) {
    if (!options.__retried && shouldRetry(error)) {
      await sleep(350)
      return chatApi(path, { ...options, __retried: true })
    }
    console.error('[chat_api_error]', {
      error_code: error?.data?.error_code || error?.data?.error || 'network_error',
      error_message: readableError(error),
      path
    })
    throw error
  }
}

export async function localHelperApi(path, options = {}) {
  try {
    return await fetchJson(path, { ...options, base: localHelperBase() })
  } catch (error) {
    if (!options.__retried && shouldRetry(error)) {
      await sleep(350)
      return localHelperApi(path, { ...options, __retried: true })
    }
    console.error('[local_helper_error]', {
      error_code: error?.data?.error_code || error?.data?.error || 'network_error',
      error_message: readableError(error),
      path
    })
    throw error
  }
}

export async function zaloHelperApi(path, options = {}) {
  let lastError = null
  for (const base of zaloHelperCandidateBases()) {
    try {
      const result = await fetchJson(path, {
        ...options,
        base,
        timeoutMs: options.timeoutMs || ZALO_HELPER_DEFAULT_TIMEOUT_MS
      })
      window.SHOPHUYVAN_ZALO_HELPER_DISCOVERED_BASE = base
      return result
    } catch (error) {
      lastError = error
      if (!shouldRetry(error)) throw error
      await sleep(200)
    }
  }
  console.error('[zalo_helper_error]', {
    error_code: lastError?.data?.error_code || lastError?.data?.error || 'network_error',
    error_message: readableError(lastError),
    path
  })
  throw lastError || new Error('zalo_helper_unreachable')
}

export function readableError(error) {
  return error?.data?.error_message || error?.data?.message || error?.message || 'Không kết nối được hệ thống chat.'
}
