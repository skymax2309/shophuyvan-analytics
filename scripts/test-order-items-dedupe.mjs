import assert from 'node:assert/strict'

import { cleanupDuplicateOrderItemsForOrders } from '../apps/worker-api/src/routes/orders/order-items-dedupe.js'
import {
  dedupeIncomingItemsByOrder,
  orderItemExactKey
} from '../apps/worker-api/src/routes/orders/status-workflow.js'

function orderItemDbExactKey(row) {
  return [
    row.order_id || '',
    row.sku || '',
    row.variation_name || '',
    row.product_name || '',
    row.image_url || '',
    Number(row.qty || 0),
    Number(row.revenue_line || 0),
    Number(row.cost_real || 0),
    Number(row.cost_invoice || 0),
    Number(row.original_price || 0),
    Number(row.sale_price || 0),
    Number(row.current_price || 0),
    row.price_source || '',
    row.reservation_id || ''
  ].join('|')
}

function countDuplicateRows(rows, orderIds) {
  const counts = new Map()
  for (const row of rows.filter(row => orderIds.includes(row.order_id))) {
    const key = orderItemDbExactKey(row)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  let duplicateGroups = 0
  let duplicateExtraRows = 0
  for (const count of counts.values()) {
    if (count > 1) {
      duplicateGroups += 1
      duplicateExtraRows += count - 1
    }
  }
  return { duplicate_groups: duplicateGroups, duplicate_extra_rows: duplicateExtraRows }
}

function createFakeD1(rows) {
  return {
    prepare() {
      return {
        bind(...orderIds) {
          return {
            async first() {
              return countDuplicateRows(rows, orderIds)
            },
            async run() {
              const grouped = new Map()
              for (const row of rows.filter(row => orderIds.includes(row.order_id))) {
                const key = orderItemDbExactKey(row)
                const current = grouped.get(key) || []
                current.push(row)
                grouped.set(key, current)
              }
              const deleteIds = new Set()
              for (const groupRows of grouped.values()) {
                if (groupRows.length <= 1) continue
                const sorted = [...groupRows].sort((a, b) => Number(b.id) - Number(a.id))
                for (const duplicate of sorted.slice(1)) deleteIds.add(duplicate.id)
              }
              const before = rows.length
              for (let i = rows.length - 1; i >= 0; i -= 1) {
                if (deleteIds.has(rows[i].id)) rows.splice(i, 1)
              }
              return { meta: { changes: before - rows.length } }
            }
          }
        }
      }
    }
  }
}

const duplicatedShopeeItem = {
  order_id: '260513AQWNMEUS',
  sku: '1_DUI_DEN_428A_K64',
  variation_name: '1 Đui Đèn 428A K64',
  product_name: 'Đui Đèn Thông Minh E27',
  image_url: 'https://cf.shopee.vn/file/sample',
  qty: 1,
  revenue_line: 69000,
  cost_real: 25000,
  cost_invoice: 23000
}

const deduped = dedupeIncomingItemsByOrder([
  duplicatedShopeeItem,
  { ...duplicatedShopeeItem },
  { ...duplicatedShopeeItem }
], [{ order_id: '260513AQWNMEUS', revenue: 69000 }])

assert.equal(deduped.length, 1)
assert.equal(deduped[0].revenue_line, 69000)
assert.equal(deduped[0].qty, 1)

const sameSkuDifferentLines = dedupeIncomingItemsByOrder([
  {
    order_id: '2605102FQYD1TW',
    sku: 'DAYVOISENTOTK231',
    variation_name: 'Dây Vòi Sen 1.5M TỐT',
    product_name: 'Dây Vòi Hoa Sen Dạng Lò Xo Inox 304',
    qty: 1,
    revenue_line: 59000,
    cost_real: 20000,
    cost_invoice: 16000
  },
  {
    order_id: '2605102FQYD1TW',
    sku: 'DAYVOISENTOTK231',
    variation_name: 'Dây Vòi Sen Tốt',
    product_name: 'Dây Vòi Hoa Sen Cao Cấp 2 Đầu',
    qty: 2,
    revenue_line: 158000,
    cost_real: 48000,
    cost_invoice: 40000
  }
], [{ order_id: '2605102FQYD1TW', revenue: 268320 }])

assert.equal(sameSkuDifferentLines.length, 2)
assert.notEqual(orderItemExactKey(sameSkuDifferentLines[0]), orderItemExactKey(sameSkuDifferentLines[1]))

const dbRows = [
  { id: 10, order_id: '260513AQWNMEUS', sku: '1_DUI_DEN_428A_K64', variation_name: '1 Đui Đèn 428A K64', product_name: 'Đui Đèn Thông Minh E27', image_url: 'https://cf.shopee.vn/file/sample', qty: 1, revenue_line: 69000, cost_real: 25000, cost_invoice: 23000 },
  { id: 11, order_id: '260513AQWNMEUS', sku: '1_DUI_DEN_428A_K64', variation_name: '1 Đui Đèn 428A K64', product_name: 'Đui Đèn Thông Minh E27', image_url: 'https://cf.shopee.vn/file/sample', qty: 1, revenue_line: 69000, cost_real: 25000, cost_invoice: 23000 },
  { id: 12, order_id: '260513AQWNMEUS', sku: '1_DUI_DEN_428A_K64', variation_name: '2 Đui Đèn 428A K64', product_name: 'Đui Đèn Thông Minh E27', image_url: 'https://cf.shopee.vn/file/sample', qty: 2, revenue_line: 138000, cost_real: 50000, cost_invoice: 46000 },
  { id: 13, order_id: '2605102FQYD1TW', sku: 'DAYVOISENTOTK231', variation_name: 'Dây Vòi Sen Tốt', product_name: 'Dây Vòi Hoa Sen Cao Cấp 2 Đầu', qty: 2, revenue_line: 158000, cost_real: 48000, cost_invoice: 40000 }
]

const cleanupResult = await cleanupDuplicateOrderItemsForOrders({ DB: createFakeD1(dbRows) }, ['260513AQWNMEUS'])
assert.deepEqual(cleanupResult, {
  checked_orders: 1,
  duplicate_groups_before: 1,
  duplicate_extra_rows_before: 1,
  deleted_rows: 1,
  duplicate_groups_after: 0,
  duplicate_extra_rows_after: 0
})
assert.deepEqual(dbRows.map(row => row.id), [11, 12, 13])

console.log('order item duplicate guard tests passed')
