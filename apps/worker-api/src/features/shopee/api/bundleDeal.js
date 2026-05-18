import { callShopeeApiWithAutoRefresh } from './auth.js'

export const SHOPEE_BUNDLE_DEAL_ENDPOINTS = {
  list: '/api/v2/bundle_deal/get_bundle_deal_list',
  detail: '/api/v2/bundle_deal/get_bundle_deal',
  items: '/api/v2/bundle_deal/get_bundle_deal_item',
  add: '/api/v2/bundle_deal/add_bundle_deal',
  update: '/api/v2/bundle_deal/update_bundle_deal',
  delete: '/api/v2/bundle_deal/delete_bundle_deal',
  end: '/api/v2/bundle_deal/end_bundle_deal',
  addItem: '/api/v2/bundle_deal/add_bundle_deal_item',
  updateItem: '/api/v2/bundle_deal/update_bundle_deal_item',
  deleteItem: '/api/v2/bundle_deal/delete_bundle_deal_item'
}

export function validateShopeeBundlePayload(action, payload = {}) {
  const errors = []
  if (['update', 'delete', 'end', 'add_item', 'update_item', 'delete_item'].includes(action) && !payload.bundle_deal_id) {
    errors.push('bundle_deal_id is required')
  }
  if (['add_item', 'update_item', 'delete_item'].includes(action) && !Array.isArray(payload.item_list)) {
    errors.push('item_list is required')
  }
  return errors
}

export function getShopeeBundleDealClient(env, options = {}) {
  const base = { env, clientType: 'marketplace_client', ...options }
  return {
    list: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_BUNDLE_DEAL_ENDPOINTS.list, params }),
    detail: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_BUNDLE_DEAL_ENDPOINTS.detail, params }),
    items: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_BUNDLE_DEAL_ENDPOINTS.items, params }),
    add: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_BUNDLE_DEAL_ENDPOINTS.add, method: 'POST', body }),
    update: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_BUNDLE_DEAL_ENDPOINTS.update, method: 'POST', body }),
    delete: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_BUNDLE_DEAL_ENDPOINTS.delete, method: 'POST', body }),
    end: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_BUNDLE_DEAL_ENDPOINTS.end, method: 'POST', body })
  }
}
