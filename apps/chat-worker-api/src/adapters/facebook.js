export function getCapabilities() {
  return { channel: 'facebook', send_message: false, mode: 'adapter_not_implemented' }
}

export async function listConversations() {
  return { ok: false, error_code: 'adapter_not_implemented', error_message: 'Facebook adapter chưa được triển khai trong chat worker mới.' }
}

export async function listMessages() {
  return { ok: false, error_code: 'adapter_not_implemented', error_message: 'Facebook adapter chưa được triển khai trong chat worker mới.' }
}

export async function sendMessage() {
  return { ok: false, error_code: 'adapter_not_implemented', error_message: 'Facebook adapter chưa được triển khai trong chat worker mới.' }
}

export function normalizeMessage(raw = {}) {
  return { ...raw, channel: 'facebook', source: raw.source || 'facebook_adapter' }
}

export async function fetchAttachments() {
  return { ok: false, error_code: 'adapter_not_implemented', error_message: 'Facebook attachment adapter chưa được triển khai.' }
}
