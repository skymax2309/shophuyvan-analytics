import {
  detectPlatform,
  loadCostConfig,
  parseFileMeta
} from './parser/shared.js'
import { normalizeShopeeOrder } from './parser/shopee.js'
import { normalizeTiktokOrder } from './parser/tiktok.js'
import { normalizeLazadaOrder } from './parser/lazada.js'
import { buildOrdersV2, fillFirstSku, mergeOrderLines } from './parser/orders-v2.js'

export {
  buildOrdersV2,
  detectPlatform,
  fillFirstSku,
  loadCostConfig,
  mergeOrderLines,
  parseFileMeta
}

// NEO: File này chỉ điều phối parser theo sàn; logic nghiệp vụ chi tiết phải nằm trong core theo từng sàn để dễ grep và bảo trì.
export function normalizeOrder(row, meta = {}) {
  const platform = meta.platform || detectPlatform(row)
  const shop = meta.shop || 'unknown'

  if (platform === 'shopee') return normalizeShopeeOrder(row, shop)
  if (platform === 'tiktok') return normalizeTiktokOrder(row, shop)
  if (platform === 'lazada') return normalizeLazadaOrder(row, shop)
  return null
}
