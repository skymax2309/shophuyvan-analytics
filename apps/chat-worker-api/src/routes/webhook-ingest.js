import { saveConversation } from '../core/conversation-core.js'
import { cleanText, normalizeChatConversation, normalizeChatMessage, nowIso } from '../core/message-normalize.js'
import { mergeMessageIntoStore } from '../core/message-merge.js'
import { adapterForChannel } from '../core/send-core.js'
import { notifyNewChatMessages } from '../core/push-notification-core.js'
import { triggerImmediateSync } from '../core/sync-core.js'
import { broadcastToWebSocket } from '../realtime/ws-server.js'
import { sendJson } from './settings.js'

function hexToBytes(value = '') {
  const text = cleanText(value).replace(/^sha256=/i, '').replace(/\s+/g, '')
  if (!/^[a-f0-9]+$/i.test(text) || text.length % 2 !== 0) return null
  const bytes = new Uint8Array(text.length / 2)
  for (let index = 0; index < text.length; index += 2) {
    bytes[index / 2] = Number.parseInt(text.slice(index, index + 2), 16)
  }
  return bytes
}

function base64ToBytes(value = '') {
  try {
    const normalized = cleanText(value).replace(/^sha256=/i, '')
    const binary = atob(normalized)
    return Uint8Array.from(binary, character => character.charCodeAt(0))
  } catch {
    return null
  }
}

function signatureBytes(value = '') {
  return hexToBytes(value) || base64ToBytes(value)
}

async function verifyWebhookSignature(rawBody, signature, secret) {
  const keyText = cleanText(secret)
  const received = signatureBytes(signature)
  if (!keyText || !received?.length) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keyText),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  return crypto.subtle.verify('HMAC', key, received, new TextEncoder().encode(rawBody))
}

function webhookSecret(env, channel) {
  if (channel === 'shopee') return env?.SHOPEE_WEBHOOK_SECRET
  if (channel === 'lazada') return env?.LAZADA_WEBHOOK_SECRET
  return ''
}

function webhookSignature(request, channel) {
  if (channel === 'shopee') return request.headers.get('X-Shopee-Signature') || ''
  if (channel === 'lazada') return request.headers.get('X-Lazada-Hmac-Sha256') || ''
  return ''
}

async function persistWebhookPayload(env, channel, rawBody, request) {
  const adapter = adapterForChannel(channel)
  if (!adapter?.normalizeWebhookPayload) {
    return { ok: false, error_code: 'webhook_adapter_not_implemented', error_message: `Kênh ${channel} chưa có normalizeWebhookPayload.` }
  }
  const normalized = adapter.normalizeWebhookPayload(rawBody, env, {
    channel,
    ip: request.headers.get('CF-Connecting-IP') || ''
  }) || {}
  const conversations = Array.isArray(normalized.conversations) ? normalized.conversations : []
  const messages = Array.isArray(normalized.messages) ? normalized.messages : []
  const newMessages = []
  const stamp = nowIso()

  for (const rawConversation of conversations) {
    await saveConversation(env, normalizeChatConversation({
      ...rawConversation,
      channel,
      shop_chat_mode: 'api',
      sync_capability: 'webhook',
      last_synced_at: stamp,
      last_success_at: stamp,
      updated_at: stamp
    }))
  }

  for (const rawMessage of messages) {
    const result = await mergeMessageIntoStore(env, normalizeChatMessage({
      ...rawMessage,
      channel,
      status: 'synced',
      source: `${channel}_webhook`,
      updated_at: stamp
    }))
    if (result.action === 'created') {
      newMessages.push(result.message)
      await broadcastToWebSocket(env, result.message)
    }
  }
  const push = await notifyNewChatMessages(env, newMessages).catch(error => ({
    ok: false,
    error_code: 'chat_push_failed',
    error_message: error?.message || String(error)
  }))
  return { ok: true, processed: messages.length, push_notifications: push }
}

export async function handleWebhookIngestRoute(request, env, ctx, channelValue) {
  const channel = cleanText(channelValue).toLowerCase()
  if (request.method !== 'POST') return sendJson({ ok: false, error_code: 'method_not_allowed', error_message: 'Chỉ hỗ trợ POST webhook.' }, 405)
  if (!['shopee', 'lazada'].includes(channel)) {
    return sendJson({ ok: false, error_code: 'webhook_channel_not_supported', error_message: 'Webhook chỉ hỗ trợ Shopee hoặc Lazada.' }, 404)
  }

  const rawBody = await request.text()
  const verified = await verifyWebhookSignature(rawBody, webhookSignature(request, channel), webhookSecret(env, channel)).catch(() => false)
  if (!verified) {
    console.error(JSON.stringify({ error_code: 'webhook_auth_failed', channel }))
    return sendJson({ ok: false, error_code: 'webhook_auth_failed', error_message: 'Chữ ký webhook không hợp lệ.' }, 401)
  }

  let processed = 0
  const shopIds = new Set()
  try {
    const adapter = adapterForChannel(channel)
    const preview = adapter?.normalizeWebhookPayload?.(rawBody, env, { channel }) || {}
    processed = Array.isArray(preview.messages) ? preview.messages.length : 0
    for (const item of [...(preview.conversations || []), ...(preview.messages || [])]) {
      const shopId = cleanText(item?.shop_id || item?.shop)
      if (shopId) shopIds.add(shopId)
    }
  } catch {
    processed = 0
  }

  const job = persistWebhookPayload(env, channel, rawBody, request)
    .catch(error => console.error(JSON.stringify({
      error_code: 'webhook_ingest_failed',
      channel,
      error_message: String(error?.message || error)
    })))
  const immediateSyncJob = job.then(() => Promise.allSettled([...shopIds].map(shopId =>
    triggerImmediateSync(env, channel, shopId, { limit: 20 })
  ))).catch(error => console.error(JSON.stringify({
    error_code: 'webhook_immediate_sync_failed',
    channel,
    error_message: String(error?.message || error)
  })))
  if (ctx?.waitUntil) {
    ctx.waitUntil(job)
    if (shopIds.size > 0) ctx.waitUntil(immediateSyncJob)
  } else {
    await job
    if (shopIds.size > 0) await immediateSyncJob
  }

  return sendJson({ ok: true, processed, immediate_sync_shops: shopIds.size })
}
