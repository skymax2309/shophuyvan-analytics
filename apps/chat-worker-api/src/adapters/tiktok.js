export function getCapabilities() {
  return { channel: 'tiktok', send_message: false, mode: 'browser_helper_required' }
}

export async function listConversations() {
  return { ok: false, error_code: 'adapter_not_implemented', error_message: 'TikTok adapter chưa được triển khai trong chat worker mới.' }
}

export async function listMessages() {
  return { ok: false, error_code: 'adapter_not_implemented', error_message: 'TikTok adapter chưa được triển khai trong chat worker mới.' }
}

export async function sendMessage() {
  return { ok: false, status: 'queued_for_browser_helper', error_code: 'browser_helper_required', error_message: 'TikTok chưa có API chat chính thức; tin đã lưu để helper trình duyệt xử lý.' }
}

export function normalizeMessage(raw = {}) {
  return { ...raw, channel: 'tiktok', source: raw.source || 'tiktok_adapter' }
}

export async function fetchAttachments() {
  return { ok: false, error_code: 'adapter_not_implemented', error_message: 'TikTok attachment adapter chưa được triển khai.' }
}
