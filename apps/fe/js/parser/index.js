import {
  detectPlatform,
  loadCostConfig,
  parseFileMeta
} from './shared.js'
import { normalizeShopeeOrder } from './shopee.js'
import { normalizeTiktokOrder } from './tiktok.js'
import { normalizeLazadaOrder } from './lazada.js'
import { buildOrdersV2, fillFirstSku, mergeOrderLines } from './orders-v2.js'

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
