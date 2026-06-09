import assert from 'node:assert/strict'
import { buildAiReplyContext, extractOrderCodes, extractProductQueries, formatAiReplyContext } from '../apps/chat-worker-api/src/core/ai-context-core.js'

const messages = [
  {
    id: 'msg_1',
    sender_type: 'customer',
    text: 'Shop kiểm tra giúp mã đơn 260525BY4BCTM7 và SKU HV999K241300S còn hàng không?',
    order_id: '',
    product_ids: []
  }
]

assert.deepEqual(extractOrderCodes(messages), ['260525BY4BCTM7'])
assert.equal(extractProductQueries(messages).includes('HV999K241300S'), true)

const env = {
  SHOP_CORE_API_BASE: 'https://core.local',
  CORE_FETCH: async url => {
    const parsed = new URL(url)
    if (parsed.pathname === '/api/core/orders/260525BY4BCTM7') {
      return Response.json({
        ok: true,
        order: {
          order_id: '260525BY4BCTM7',
          display_status_vi: 'Đang giao',
          tracking_number: 'SPXVN123',
          carrier: 'SPX Express',
          payment_method: 'Ví sàn',
          items: [{
            sku: 'HV999K241300S',
            product_name: 'Bộ mạch test',
            variation_name: 'K241300S',
            quantity: 1,
            price: { value: 99000 },
            cost: { value: 1000 }
          }]
        }
      })
    }
    if (parsed.pathname === '/api/core/orders/by-conversation/conv_1') {
      assert.equal(parsed.searchParams.get('platform'), 'shopee')
      return Response.json({
        ok: true,
        orders: [],
        match_state: 'matched_order_core'
      })
    }
    if (parsed.pathname === '/api/core/products/by-sku/HV999K241300S') {
      return Response.json({
        ok: true,
        product: {
          sku: 'HV999K241300S',
          platform_sku: 'HV999K241300S',
          name: 'Bộ mạch test',
          variation_name: 'K241300S',
          price: { value: 0 },
          stock: { value: 0 },
          cost: { value: 1000 },
          source: 'Product Master Core',
          confidence: 'confirmed'
        }
      })
    }
    if (parsed.pathname === '/api/core/products/search') {
      return Response.json({
        ok: true,
        products: [{
          sku: 'HV999K241300S',
          platform_sku: 'HV999K241300S',
          name: 'Bộ mạch test',
          variation_name: 'K241300S',
          price: { value: 99000 },
          stock: { value: 12 },
          cost: { value: 1000 },
          source: 'Product Master Core',
          confidence: 'confirmed'
        }]
      })
    }
    return Response.json({ ok: false, error: 'unexpected_path' }, { status: 404 })
  }
}

const context = await buildAiReplyContext(env, {
  conversation: { id: 'conv_1', channel: 'shopee', shop_id: 'chihuy1984' },
  messages,
  input: {}
})
assert.equal(context.orders.length, 1)
assert.equal(context.products.length, 1)
assert.equal(context.orders[0].status, 'Đang giao')
assert.equal(context.products[0].price, '0đ')
assert.equal(context.products[0].stock, '0 tồn')
assert.equal('cost' in context.products[0], false)
assert.equal(context.simple_intent.intent, 'order_status_simple')
assert.equal(context.simple_intent.simple, true)

const promptContext = formatAiReplyContext(context)
assert.equal(promptContext.includes('Dữ liệu Core đã kiểm'), true)
assert.equal(promptContext.includes('260525BY4BCTM7'), true)
assert.equal(promptContext.includes('HV999K241300S'), true)
assert.equal(promptContext.includes('cost'), false)

const risky = await buildAiReplyContext(env, {
  conversation: { id: 'conv_1', channel: 'shopee', shop_id: 'chihuy1984' },
  messages: [{ sender_type: 'customer', text: 'Tôi muốn hoàn tiền và đánh giá xấu' }],
  input: {}
})
assert.equal(risky.risk_flags.includes('complaint_or_refund'), true)
assert.equal(risky.simple_intent.simple, false)

const contextByConversationOnly = await buildAiReplyContext(env, {
  conversation: { id: 'conv_1', channel: 'shopee', shop_id: 'chihuy1984' },
  messages: [{ sender_type: 'customer', text: 'Shop kiểm tra giúp đơn này tới đâu rồi?' }],
  input: {}
})
assert.equal(contextByConversationOnly.warnings.includes('Chưa thấy mã đơn rõ ràng trong hội thoại.'), true)

console.log('chat AI context guard passed')
