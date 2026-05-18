import assert from 'node:assert/strict'
import { signWebhookPayload, verifyWebhookSignature } from '../apps/worker-api/src/core/external/security-core.js'

const baseUrl = process.env.ECOMMERCE_API_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:8787'
const apiKey = process.env.ECOMMERCE_API_KEY || process.env.API_KEY_FOR_FACEBOOK_CRM || ''
const testSku = process.env.TEST_SKU || ''
const runWriteTests = process.env.RUN_EXTERNAL_WRITE_TESTS === 'true'
const skipHttpTests = process.env.SKIP_HTTP_TESTS === 'true'

async function request(path, options = {}) {
  const headers = {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  return { response, json }
}

function requireApiKey() {
  if (!apiKey) throw new Error('Thiếu ECOMMERCE_API_KEY hoặc API_KEY_FOR_FACEBOOK_CRM để test API thành công.')
}

async function testAuthGuards() {
  const missing = await fetch(`${baseUrl}/api/external/products?limit=1`)
  const missingJson = await missing.json()
  assert.equal(missingJson.success, false)
  assert.ok(['UNAUTHORIZED', 'FORBIDDEN'].includes(missingJson.error.code))

  const wrong = await fetch(`${baseUrl}/api/external/products?limit=1`, {
    headers: { Authorization: 'Bearer wrong-key' }
  })
  const wrongJson = await wrong.json()
  assert.equal(wrongJson.success, false)
  assert.ok(['UNAUTHORIZED', 'FORBIDDEN'].includes(wrongJson.error.code))
  console.log('auth guards: ok')
}

async function pickSku() {
  if (testSku) return testSku
  const { response, json } = await request('/api/external/products?limit=1')
  assert.equal(response.status, 200)
  assert.equal(json.success, true)
  const sku = json.data?.[0]?.sku
  if (!sku) throw new Error('Không có SKU nào để chạy test tiếp.')
  return sku
}

async function testReadAndInventory() {
  requireApiKey()
  const sku = await pickSku()

  let result = await request(`/api/external/products/sku/${encodeURIComponent(sku)}`)
  assert.equal(result.response.status, 200)
  assert.equal(result.json.success, true)

  result = await request(`/api/external/products/sku/${encodeURIComponent(sku)}/price`)
  assert.equal(result.response.status, 200)
  assert.equal(result.json.success, true)

  result = await request('/api/external/inventory/check', {
    method: 'POST',
    body: { sku, quantity: 1 }
  })
  assert.equal(result.response.status, 200)
  assert.equal(result.json.success, true)

  result = await request('/api/external/inventory/check', {
    method: 'POST',
    body: { sku, quantity: 999999999 }
  })
  assert.equal(result.response.status, 200)
  assert.equal(result.json.success, true)
  assert.equal(result.json.data.canSell, false)
  console.log('read + inventory: ok')
  return sku
}

async function testReserveCancel(sku) {
  const key = `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const reserve = await request('/api/external/inventory/reserve', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: {
      sku,
      quantity: 1,
      source: 'facebook_crm',
      sourceConversationId: key,
      sourceCustomerId: 'manual-test',
      expiresInMinutes: 15,
      note: 'Manual API test giữ hàng rồi hủy'
    }
  })
  assert.equal(reserve.response.status, 200)
  assert.equal(reserve.json.success, true)
  const reservationId = reserve.json.data.reservationId

  const duplicate = await request('/api/external/inventory/reserve', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: {
      sku,
      quantity: 1,
      source: 'facebook_crm',
      sourceConversationId: key,
      sourceCustomerId: 'manual-test',
      expiresInMinutes: 15
    }
  })
  assert.equal(duplicate.response.status, 200)
  assert.equal(duplicate.json.data.reservationId, reservationId)

  const cancel = await request(`/api/external/inventory/reservations/${encodeURIComponent(reservationId)}/cancel`, {
    method: 'POST',
    body: { reason: 'Manual test cleanup' }
  })
  assert.equal(cancel.response.status, 200)
  assert.equal(cancel.json.success, true)
  assert.equal(cancel.json.data.status, 'cancelled')
  console.log('reserve idempotency + cancel: ok')
}

async function testWriteFlow(sku) {
  const sourceOrderId = `fbcrm_manual_${Date.now()}`
  const create = await request('/api/external/orders/from-facebook', {
    method: 'POST',
    body: {
      source: 'facebook_crm',
      sourceOrderId,
      sourceConversationId: `conv_${sourceOrderId}`,
      sourcePageId: 'manual_page',
      customer: {
        name: 'Khách test API',
        phone: '0900000000',
        facebookId: `fb_${sourceOrderId}`,
        address: 'Hà Nội'
      },
      items: [{ sku, quantity: 1, price: 0, currentPrice: 0 }],
      shipping: {
        address: 'Hà Nội',
        province: 'Hà Nội',
        district: 'Cầu Giấy',
        ward: 'Dịch Vọng',
        shippingFee: 0
      },
      payment: { method: 'cod', status: 'unpaid' },
      note: 'Manual write test'
    }
  })
  assert.equal(create.response.status, 200)
  assert.equal(create.json.success, true)

  const duplicate = await request('/api/external/orders/from-facebook', {
    method: 'POST',
    body: {
      source: 'facebook_crm',
      sourceOrderId,
      customer: { name: 'Khách test API' },
      items: [{ sku, quantity: 1 }]
    }
  })
  assert.equal(duplicate.response.status, 200)
  assert.equal(duplicate.json.success, true)
  assert.equal(duplicate.json.data.idempotent, true)
  console.log('create order + duplicate sourceOrderId: ok')
}

async function testWebhookSignature() {
  const secret = 'manual_webhook_secret'
  const rawBody = JSON.stringify({ event: 'inventory.updated', data: { sku: 'SP001' } })
  const signature = await signWebhookPayload(secret, rawBody)
  assert.equal(await verifyWebhookSignature(secret, rawBody, signature), true)
  assert.equal(await verifyWebhookSignature(secret, rawBody, 'sha256=bad'), false)
  console.log('webhook signature: ok')
}

await testWebhookSignature()
if (skipHttpTests) {
  console.log('http tests: skipped')
  process.exit(0)
}
await testAuthGuards()

if (apiKey) {
  const sku = await testReadAndInventory()
  await testReserveCancel(sku)
  if (runWriteTests) await testWriteFlow(sku)
  else console.log('write flow: skipped (set RUN_EXTERNAL_WRITE_TESTS=true để tạo đơn/trừ tồn)')
} else {
  console.log('authenticated API tests: skipped vì chưa có API key')
}
