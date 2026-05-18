import { callShopeeApiWithAutoRefresh } from './auth.js'

export const SHOPEE_FLASH_SALE_ENDPOINTS = {
  list: '/api/v2/shop_flash_sale/get_shop_flash_sale_list',
  detail: '/api/v2/shop_flash_sale/get_shop_flash_sale',
  items: '/api/v2/shop_flash_sale/get_shop_flash_sale_items',
  timeSlot: '/api/v2/shop_flash_sale/get_time_slot_id',
  itemCriteria: '/api/v2/shop_flash_sale/get_item_criteria',
  create: '/api/v2/shop_flash_sale/create_shop_flash_sale',
  update: '/api/v2/shop_flash_sale/update_shop_flash_sale',
  delete: '/api/v2/shop_flash_sale/delete_shop_flash_sale',
  addItems: '/api/v2/shop_flash_sale/add_shop_flash_sale_items',
  updateItems: '/api/v2/shop_flash_sale/update_shop_flash_sale_items',
  deleteItems: '/api/v2/shop_flash_sale/delete_shop_flash_sale_items'
}

export function validateShopeeFlashSalePayload(action, payload = {}) {
  const errors = []
  if (action === 'create' && !payload.timeslot_id) errors.push('timeslot_id is required from get_time_slot_id')
  if (['update', 'delete', 'add_items', 'update_items', 'delete_items'].includes(action) && !payload.flash_sale_id) {
    errors.push('flash_sale_id is required')
  }
  if (['add_items', 'update_items', 'delete_items'].includes(action) && !Array.isArray(payload.item_list)) {
    errors.push('item_list is required')
  }
  return errors
}

export function getShopeeFlashSaleClient(env, options = {}) {
  const base = { env, clientType: 'marketplace_client', ...options }
  return {
    list: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_FLASH_SALE_ENDPOINTS.list, params }),
    detail: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_FLASH_SALE_ENDPOINTS.detail, params }),
    items: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_FLASH_SALE_ENDPOINTS.items, params }),
    timeSlot: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_FLASH_SALE_ENDPOINTS.timeSlot, params }),
    create: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_FLASH_SALE_ENDPOINTS.create, method: 'POST', body }),
    update: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_FLASH_SALE_ENDPOINTS.update, method: 'POST', body }),
    delete: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_FLASH_SALE_ENDPOINTS.delete, method: 'POST', body })
  }
}
