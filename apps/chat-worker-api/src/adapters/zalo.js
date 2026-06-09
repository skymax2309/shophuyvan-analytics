export function getCapabilities() {
  return { channel: 'zalo', send_message: false, mode: 'adapter_not_implemented' }
}

export async function listConversations() {
  return { ok: false, error_code: 'adapter_not_implemented', error_message: 'Zalo adapter chưa được triển khai trong chat worker mới.' }
}

export async function listMessages() {
  return { ok: false, error_code: 'adapter_not_implemented', error_message: 'Zalo adapter chưa được triển khai trong chat worker mới.' }
}

export async function sendMessage() {
  return { ok: false, error_code: 'adapter_not_implemented', error_message: 'Zalo adapter chưa được triển khai trong chat worker mới.' }
}

export function normalizeMessage(raw = {}) {
  return { ...raw, channel: 'zalo', source: raw.source || 'zalo_adapter' }
}

export async function fetchAttachments() {
  return { ok: false, error_code: 'adapter_not_implemented', error_message: 'Zalo attachment adapter chưa được triển khai.' }
}
