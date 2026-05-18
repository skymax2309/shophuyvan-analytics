import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const baseUrl = process.env.SHOPHUYVAN_API_BASE || 'https://huyvan-worker-api.nghiemchihuy.workers.dev'
const shop = process.env.SHOPEE_AUDIT_SHOP || ''
const live = process.env.SHOPEE_LIVE_TEST === '1' || process.argv.includes('--live')
const allowlist = (process.env.SHOPEE_LIVE_ALLOWLIST || '').split(',').map(item => item.trim()).filter(Boolean)

const dryChecks = [
  { module: 'Discount', endpoint: '/api/discounts/shopee/action', body: { action: 'update_discount_item', shop, payload: { discount_id: 'DRY_RUN_REQUIRED', item_list: [] }, execute: false } },
  { module: 'Voucher', endpoint: '/api/discounts/shopee/promotion-action', body: { module: 'voucher', action: 'delete', shop, payload: { voucher_id: 'DRY_RUN_REQUIRED' }, execute: false } },
  { module: 'Bundle', endpoint: '/api/discounts/shopee/promotion-action', body: { module: 'bundle_deal', action: 'delete', shop, payload: { bundle_deal_id: 'DRY_RUN_REQUIRED' }, execute: false } },
  { module: 'Add-On', endpoint: '/api/discounts/shopee/promotion-action', body: { module: 'add_on_deal', action: 'delete', shop, payload: { add_on_deal_id: 'DRY_RUN_REQUIRED' }, execute: false } },
  { module: 'Flash Sale', endpoint: '/api/discounts/shopee/promotion-action', body: { module: 'shop_flash_sale', action: 'add', shop, payload: { timeslot_id: 'DRY_RUN_REQUIRED', item_list: [] }, execute: false } },
  { module: 'ADS Manual Product Ads', endpoint: '/api/ads/shopee/manual-product-ads/edit', body: { shop, campaign_id: 'DRY_RUN_REQUIRED', edit_action: 'pause', apply: false } },
  { module: 'TopPicks', endpoint: '/api/top-picks/shopee/action', body: { action: 'update', shop, payload: { top_picks_id: 'DRY_RUN_REQUIRED', item_id_list: [] }, execute: false } }
]

const codeAuditRows = [
  {
    module: 'Discount',
    read: '`/api/v2/discount/get_discount_list`, `/api/v2/discount/get_discount`',
    write: '`add_discount`, `add_discount_item`, `update_discount`, `update_discount_item`, `delete_discount`, `delete_discount_item`, `end_discount`',
    code: 'Route `/api/discounts/shopee/action` trả kết quả thống nhất, che secret, giữ request_id/error_list và refetch detail sau mutation.',
    success: '`verified=true` sau khi refetch đúng `discount_id`, đúng `item_id/model_id` và đúng giá hoặc trạng thái.'
  },
  {
    module: 'Voucher',
    read: '`/api/v2/voucher/get_voucher_list`, `/api/v2/voucher/get_voucher`',
    write: '`add_voucher`, `update_voucher`, `delete_voucher`, `end_voucher`',
    code: '`/api/discounts/shopee/promotion-action` không báo thành công nếu Shopee từ chối hoặc refetch không xác nhận.',
    success: 'Refetch detail/list xác nhận object mất hoặc trạng thái đổi đúng.'
  },
  {
    module: 'Bundle Deal',
    read: '`/api/v2/bundle_deal/get_bundle_deal_list`, `/api/v2/bundle_deal/get_bundle_deal`, `/api/v2/bundle_deal/get_bundle_deal_item`',
    write: '`add/update/delete/end_bundle_deal`, `add/update/delete_bundle_deal_item`',
    code: 'Có guard chung, payload được preview trước và sau mutation refetch detail/list.',
    success: 'Refetch xác nhận tồn tại/mất/trạng thái đúng theo action.'
  },
  {
    module: 'Add-On Deal',
    read: '`/api/v2/add_on_deal/get_add_on_deal_list`, `/api/v2/add_on_deal/get_add_on_deal`, main/sub item endpoints',
    write: '`add/update/delete/end_add_on_deal`, main/sub item mutation endpoints',
    code: 'Có guard chung, không còn success dựa trên cache.',
    success: 'Refetch xác nhận đúng object/trạng thái.'
  },
  {
    module: 'Flash Sale',
    read: '`/api/v2/shop_flash_sale/get_shop_flash_sale_list`, `/get_shop_flash_sale`, `/get_shop_flash_sale_items`, `/get_time_slot_id`',
    write: '`create_shop_flash_sale`, `update_shop_flash_sale`, `delete_shop_flash_sale`, item mutation endpoints',
    code: 'Backend chặn create nếu thiếu `timeslot_id`; UI ghi rõ start/end chỉ để đối chiếu.',
    success: 'Refetch Flash Sale xác nhận object/trạng thái; create phải có `timeslot_id` thật từ Shopee.'
  },
  {
    module: 'ADS Manual Product Ads',
    read: '`/api/v2/ads/get_product_level_campaign_setting_info`',
    write: '`/api/v2/ads/edit_manual_product_ads`',
    code: 'Endpoint edit campaign sau POST bắt buộc refetch setting info và so status/budget/ROAS target.',
    success: '`verified=true` khi campaign status/budget/ROAS target sau refetch khớp action.'
  },
  {
    module: 'TopPicks',
    read: '`/api/v2/top_picks/get_top_picks_list`',
    write: '`/api/v2/top_picks/add_top_picks`, `/update_top_picks`, `/delete_top_picks`',
    code: '`/api/top-picks/shopee/action` có preview/confirm/refetch list verify.',
    success: 'Refetch `get_top_picks_list` xác nhận bộ TopPicks đổi/xóa đúng.'
  }
]

function redact(value) {
  if (Array.isArray(value)) return value.map(redact)
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const [key, item] of Object.entries(value)) {
    out[key] = /token|secret|partner_key|sign|cookie|authorization/i.test(key) ? '***' : redact(item)
  }
  return out
}

async function callJson(check) {
  if (!shop) return { status: 'skipped', message: 'Set SHOPEE_AUDIT_SHOP to call the running API.' }
  const res = await fetch(`${baseUrl}${check.endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(check.body)
  })
  const text = await res.text()
  let data = {}
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw_text: text } }
  return { http_status: res.status, ...redact(data) }
}

const rows = []
for (const check of dryChecks) {
  const result = await callJson(check).catch(error => ({ status: 'error', message: error?.message || String(error) }))
  rows.push({ ...check, result })
}

const report = [
  '# Shopee Live API Audit',
  '',
  `- Generated: ${new Date().toISOString()}`,
  `- API base: ${baseUrl}`,
  `- Shop filter: ${shop || 'not provided'}`,
  `- Live mutation mode: ${live ? 'enabled' : 'disabled'}`,
  `- Allowlist: ${allowlist.length ? allowlist.join(', ') : 'not provided'}`,
  '',
  live && !allowlist.length
    ? '> Live mode was requested but no SHOPEE_LIVE_ALLOWLIST was provided, so this script refuses to mutate anything.'
    : '> Dry-run checks never mutate Shopee. Live mutation must be implemented per object allowlist before use.',
  '',
  '## Code Audit 2026-05-15',
  '',
  '| Module | Shopee endpoint đọc | Shopee endpoint ghi | Trạng thái code | Điều kiện hiện thành công |',
  '| --- | --- | --- | --- | --- |',
  ...codeAuditRows.map(row => `| ${row.module} | ${row.read} | ${row.write} | ${row.code} | ${row.success} |`),
  '',
  '## Live Test Status',
  '',
  '- Chưa chạy mutation live nếu thiếu `SHOPEE_AUDIT_SHOP` và allowlist object an toàn.',
  '- Không module nào được ghi là "đã kết nối Shopee thật" nếu chưa có live response + `request_id` + refetch verify.',
  '- Để chạy live an toàn: đặt `SHOPEE_AUDIT_SHOP`, cung cấp `SHOPEE_LIVE_ALLOWLIST`, đặt `SHOPEE_LIVE_TEST=1`, rồi chạy `npm run shopee:test:live` trong `apps/worker-api`.',
  '',
  '| Module | Endpoint | Action | HTTP | Status | Verified | Request ID | Message |',
  '| --- | --- | --- | ---: | --- | --- | --- | --- |',
  ...rows.map(row => {
    const result = row.result || {}
    return `| ${row.module} | \`${row.endpoint}\` | \`${row.body.action || row.body.edit_action || ''}\` | ${result.http_status || ''} | ${result.status || result.error || ''} | ${result.verified === true ? 'yes' : 'no'} | ${result.request_id || ''} | ${(result.message || '').replace(/\|/g, '/')} |`
  }),
  '',
  '## Raw Results',
  '',
  '```json',
  JSON.stringify(rows.map(row => ({ module: row.module, endpoint: row.endpoint, body: redact(row.body), result: row.result })), null, 2),
  '```',
  ''
].join('\n')

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const outPath = path.resolve(scriptDir, '..', 'docs', 'shopee-live-api-audit.md')
fs.writeFileSync(outPath, report, 'utf8')
console.log(`Wrote ${outPath}`)
