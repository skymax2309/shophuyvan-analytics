const ZALO_TOOL_URL_KEY = 'shv_zalo_tool_url'
const ZALO_DEFAULT_URL = 'http://127.0.0.1:8794'
const ZALO_CANDIDATE_URLS = ['http://127.0.0.1:8794', 'http://127.0.0.1:8795', 'http://127.0.0.1:8796']

function zaloEl(id) {
  return document.getElementById(id)
}

function zaloToolUrl() {
  return String(localStorage.getItem(ZALO_TOOL_URL_KEY) || '').trim()
}

function setZaloStatus(text, kind = 'muted') {
  const box = zaloEl('zaloBridgeStatus')
  if (!box) return
  box.className = `zalo-bridge-status ${kind}`.trim()
  box.textContent = text || ''
}

function canEmbedZaloTool(url) {
  const pageProtocol = String(window.location.protocol || '')
  if (pageProtocol !== 'https:') return true
  return String(url || '').toLowerCase().startsWith('https://')
}

async function probeZaloTool(url) {
  const base = String(url || '').replace(/\/+$/, '')
  if (!base) return { status: 'offline', message: 'Thiếu URL tool Zalo.' }

  try {
    // Ưu tiên xác thực đúng API của tool Zalo.
    const apiRes = await fetch(`${base}/api/accounts`, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store'
    })
    if (apiRes.ok) {
      const data = await apiRes.json().catch(() => null)
      if (Array.isArray(data?.accounts)) {
        return {
          status: 'verified',
          message: `Đã xác thực đúng Zalo tool (${data.accounts.length.toLocaleString('vi-VN')} tài khoản).`
        }
      }
      return {
        status: 'reachable_unverified',
        message: 'URL có phản hồi nhưng dữ liệu /api/accounts không đúng schema Zalo.'
      }
    }
    return {
      status: 'reachable_unverified',
      message: `URL có phản hồi nhưng /api/accounts trả về HTTP ${apiRes.status}.`
    }
  } catch {
    try {
      // Fallback: chỉ xác nhận URL có mở, KHÔNG coi là đã kết nối đúng Zalo.
      await fetch(`${base}/`, { method: 'GET', mode: 'no-cors', cache: 'no-store' })
      return {
        status: 'reachable_unverified',
        message: 'URL đang mở nhưng chưa xác thực được API Zalo. Có thể đang trỏ nhầm app local khác hoặc tool Zalo chưa bật CORS.'
      }
    } catch {
      return { status: 'offline', message: `Chưa kết nối được URL ${base}.` }
    }
  }
}

function renderZaloEmbed(url) {
  const frameWrap = zaloEl('zaloFrameWrap')
  const frame = zaloEl('zaloFrame')
  const note = zaloEl('zaloEmbedNote')
  if (!frameWrap || !frame || !note) return

  if (!canEmbedZaloTool(url)) {
    frameWrap.hidden = true
    note.hidden = false
    note.textContent = 'Trang HTTPS không thể nhúng URL HTTP do chặn mixed-content. Dùng nút "Mở Zalo tool".'
    return
  }

  frameWrap.hidden = false
  note.hidden = true
  frame.src = url
}

async function refreshZaloBridge() {
  const input = zaloEl('zaloToolUrl')
  const url = String(input?.value || '').trim() || ZALO_DEFAULT_URL
  localStorage.setItem(ZALO_TOOL_URL_KEY, url)
  renderZaloEmbed(url)
  setZaloStatus('Đang kiểm tra kết nối Zalo tool...', 'muted')
  const probe = await probeZaloTool(url)
  if (probe.status === 'verified') {
    setZaloStatus(`${probe.message} URL: ${url}`, 'ok')
  } else if (probe.status === 'reachable_unverified') {
    setZaloStatus(`${probe.message} URL: ${url}. Tool chuẩn của bạn đang ở E:\\tool zalo.`, 'warn')
  } else {
    setZaloStatus(`${probe.message} Hãy mở tool trong E:\\tool zalo rồi bấm kiểm tra lại.`, 'blocked')
  }
}

async function resolveInitialZaloUrl() {
  const saved = zaloToolUrl()
  if (saved) return saved
  for (const candidate of ZALO_CANDIDATE_URLS) {
    const probe = await probeZaloTool(candidate)
    if (probe.status === 'verified') return candidate
  }
  return ZALO_DEFAULT_URL
}

window.openZaloTool = function() {
  const url = String(zaloEl('zaloToolUrl')?.value || '').trim() || ZALO_DEFAULT_URL
  localStorage.setItem(ZALO_TOOL_URL_KEY, url)
  window.open(url, '_blank', 'noopener,noreferrer')
}

window.saveZaloToolUrl = function() {
  refreshZaloBridge().catch(() => null)
}

window.addEventListener('DOMContentLoaded', () => {
  const input = zaloEl('zaloToolUrl')
  resolveInitialZaloUrl()
    .then(url => {
      if (input) input.value = url
      localStorage.setItem(ZALO_TOOL_URL_KEY, url)
      return refreshZaloBridge()
    })
    .catch(() => {
      if (input && !input.value) input.value = ZALO_DEFAULT_URL
      refreshZaloBridge().catch(() => null)
    })
})
