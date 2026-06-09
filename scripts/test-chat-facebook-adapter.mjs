import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import worker from '../apps/chat-worker-api/src/index.js'
import {
  getCapabilities,
  normalizeWebhookPayload,
  sendMessage
} from '../apps/chat-worker-api/src/adapters/facebook.js'

function facebookPayload() {
  return {
    object: 'page',
    entry: [{
      id: 'page_123',
      time: 1710000000000,
      messaging: [{
        sender: { id: 'psid_456' },
        recipient: { id: 'page_123' },
        timestamp: 1710000000123,
        message: { mid: 'mid_789', text: 'hello shop' }
      }]
    }]
  }
}

function sign(body, secret) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

async function testNormalizer() {
  const env = { FACEBOOK_PAGE_TOKENS_JSON: JSON.stringify({ page_123: 'page-token' }) }
  const normalized = normalizeWebhookPayload(JSON.stringify(facebookPayload()), env)
  assert.equal(normalized.conversations.length, 1)
  assert.equal(normalized.messages.length, 1)
  assert.equal(normalized.conversations[0].channel, 'facebook')
  assert.equal(normalized.conversations[0].shop_id, 'page_123')
  assert.equal(normalized.conversations[0].customer_id, 'psid_456')
  assert.equal(normalized.conversations[0].send_capability, 'official_api')
  assert.equal(normalized.messages[0].sender_type, 'customer')
  assert.equal(normalized.messages[0].platform_message_id, 'mid_789')
}

async function testSendMessage() {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    const body = JSON.parse(init.body)
    assert.equal(url, 'https://graph.facebook.com/v23.0/me/messages')
    assert.equal(init.headers.Authorization, 'Bearer page-token')
    assert.equal(body.recipient.id, 'psid_456')
    assert.equal(body.message.text, 'ok')
    return new Response(JSON.stringify({ recipient_id: 'psid_456', message_id: 'sent_123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }
  try {
    const result = await sendMessage({ FACEBOOK_PAGE_ACCESS_TOKEN: 'page-token' }, {
      conversation: { shop_id: 'page_123', customer_id: 'psid_456' },
      message: { shop_id: 'page_123', customer_id: 'psid_456', text: 'ok' },
      text: 'ok'
    })
    assert.equal(result.ok, true)
    assert.equal(result.platform_message_id, 'sent_123')
  } finally {
    globalThis.fetch = previousFetch
  }
}

async function testWorkerWebhookRoutes() {
  const env = {
    FACEBOOK_VERIFY_TOKEN: 'verify-token',
    FACEBOOK_APP_SECRET: 'app-secret',
    FACEBOOK_PAGE_TOKENS_JSON: JSON.stringify({ page_123: 'page-token' })
  }
  const verify = await worker.fetch(new Request('https://chat.test/api/chat/webhook/facebook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-ok'), env, {})
  assert.equal(verify.status, 200)
  assert.equal(await verify.text(), 'challenge-ok')

  const raw = JSON.stringify(facebookPayload())
  const post = await worker.fetch(new Request('https://chat.test/api/chat/webhook/facebook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': sign(raw, env.FACEBOOK_APP_SECRET)
    },
    body: raw
  }), env, {})
  const data = await post.json()
  assert.equal(post.status, 200)
  assert.equal(data.ok, true)
  assert.equal(data.processed, 1)
  assert.equal(env.__CHAT_CORE_MEMORY.messages.length, 1)
  assert.equal(env.__CHAT_CORE_MEMORY.messages[0].channel, 'facebook')
}

async function main() {
  assert.equal(getCapabilities({}).send_message, false)
  assert.equal(getCapabilities({ FACEBOOK_PAGE_ACCESS_TOKEN: 'page-token' }).send_message, true)
  await testNormalizer()
  await testSendMessage()
  await testWorkerWebhookRoutes()
  console.log('test-chat-facebook-adapter: pass')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
