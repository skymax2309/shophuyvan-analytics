import { saveProductCatalogSnapshotsBatch } from '../product-catalog-core.js'
import { saveProductKnowledgeBatch } from '../../routes/worker-chat-marketplace-route.js'

function cleanProductText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

// NEO: Catalog riêng của shop không API được lưu từ Chrome/local helper vào cùng nguồn đọc của video picker.
export async function syncProductKnowledgeFromVariationPayload(env, input = {}) {
  const platform = cleanProductText(input.platform || 'shopee').toLowerCase()
  const shop = cleanProductText(input.shop || input.user_name)
  const shopId = cleanProductText(input.shop_id || input.shopId || input.api_shop_id)
  const products = Array.isArray(input.products) ? input.products : []
  const source = cleanProductText(input.source || 'local_helper') || 'local_helper'
  const warnings = []
  let knowledgeResult = { saved: 0, skipped: 0 }
  let snapshotResult = { saved: 0, skipped: 0 }

  if (!platform || !shop || !products.length) {
    return {
      saved_product_knowledge: 0,
      saved_product_catalog_snapshots: 0,
      warnings
    }
  }

  try {
    knowledgeResult = await saveProductKnowledgeBatch(env, {
      platform,
      shop,
      shop_id: shopId,
      source,
      products
    })
  } catch (error) {
    warnings.push({ stage: 'product_knowledge', message: cleanProductText(error?.message) })
  }

  try {
    snapshotResult = await saveProductCatalogSnapshotsBatch(env, {
      platform,
      shop,
      shop_id: shopId,
      source,
      products
    })
  } catch (error) {
    warnings.push({ stage: 'product_catalog_snapshot', message: cleanProductText(error?.message) })
  }

  return {
    saved_product_knowledge: Number(knowledgeResult.saved || 0) || 0,
    saved_product_catalog_snapshots: Number(snapshotResult.saved || 0) || 0,
    warnings
  }
}
