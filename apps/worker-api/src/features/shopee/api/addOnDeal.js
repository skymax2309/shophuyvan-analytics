import { callShopeeApiWithAutoRefresh } from './auth.js'

export const SHOPEE_ADD_ON_DEAL_ENDPOINTS = {
  list: '/api/v2/add_on_deal/get_add_on_deal_list',
  detail: '/api/v2/add_on_deal/get_add_on_deal',
  mainItems: '/api/v2/add_on_deal/get_add_on_deal_main_item',
  subItems: '/api/v2/add_on_deal/get_add_on_deal_sub_item',
  add: '/api/v2/add_on_deal/add_add_on_deal',
  update: '/api/v2/add_on_deal/update_add_on_deal',
  delete: '/api/v2/add_on_deal/delete_add_on_deal',
  end: '/api/v2/add_on_deal/end_add_on_deal',
  addMainItem: '/api/v2/add_on_deal/add_add_on_deal_main_item',
  addSubItem: '/api/v2/add_on_deal/add_add_on_deal_sub_item',
  updateMainItem: '/api/v2/add_on_deal/update_add_on_deal_main_item',
  updateSubItem: '/api/v2/add_on_deal/update_add_on_deal_sub_item',
  deleteMainItem: '/api/v2/add_on_deal/delete_add_on_deal_main_item',
  deleteSubItem: '/api/v2/add_on_deal/delete_add_on_deal_sub_item'
}

export function validateShopeeAddOnPayload(action, payload = {}) {
  const errors = []
  if (['update', 'delete', 'end', 'add_main_item', 'add_sub_item', 'update_main_item', 'update_sub_item', 'delete_main_item', 'delete_sub_item'].includes(action) && !payload.add_on_deal_id) {
    errors.push('add_on_deal_id is required')
  }
  if (action.includes('item') && !Array.isArray(payload.item_list)) errors.push('item_list is required')
  return errors
}

export function getShopeeAddOnDealClient(env, options = {}) {
  const base = { env, clientType: 'marketplace_client', ...options }
  return {
    list: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_ADD_ON_DEAL_ENDPOINTS.list, params }),
    detail: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_ADD_ON_DEAL_ENDPOINTS.detail, params }),
    mainItems: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_ADD_ON_DEAL_ENDPOINTS.mainItems, params }),
    subItems: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_ADD_ON_DEAL_ENDPOINTS.subItems, params }),
    add: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_ADD_ON_DEAL_ENDPOINTS.add, method: 'POST', body }),
    update: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_ADD_ON_DEAL_ENDPOINTS.update, method: 'POST', body }),
    delete: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_ADD_ON_DEAL_ENDPOINTS.delete, method: 'POST', body }),
    end: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_ADD_ON_DEAL_ENDPOINTS.end, method: 'POST', body })
  }
}
