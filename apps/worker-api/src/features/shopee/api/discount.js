import { callShopeeApiWithAutoRefresh } from './auth.js'

export const SHOPEE_DISCOUNT_ENDPOINTS = {
  list: '/api/v2/discount/get_discount_list',
  detail: '/api/v2/discount/get_discount',
  add: '/api/v2/discount/add_discount',
  addItem: '/api/v2/discount/add_discount_item',
  update: '/api/v2/discount/update_discount',
  updateItem: '/api/v2/discount/update_discount_item',
  delete: '/api/v2/discount/delete_discount',
  deleteItem: '/api/v2/discount/delete_discount_item',
  end: '/api/v2/discount/end_discount'
}

export function validateShopeeDiscountItemPayload(payload = {}) {
  const errors = []
  if (!payload.discount_id) errors.push('discount_id is required')
  if (!Array.isArray(payload.item_list) || !payload.item_list.length) errors.push('item_list is required')
  for (const [itemIndex, item] of (payload.item_list || []).entries()) {
    if (!item.item_id) errors.push(`item_list[${itemIndex}].item_id is required`)
    for (const [modelIndex, model] of (item.model_list || []).entries()) {
      if (!model.model_id) errors.push(`item_list[${itemIndex}].model_list[${modelIndex}].model_id is required`)
      if (Number(model.model_promotion_price || model.promotion_price || 0) <= 0) {
        errors.push(`item_list[${itemIndex}].model_list[${modelIndex}].promotion_price must be greater than 0`)
      }
    }
    if (!item.model_list?.length && Number(item.item_promotion_price || item.promotion_price || 0) <= 0) {
      errors.push(`item_list[${itemIndex}].promotion_price must be greater than 0`)
    }
  }
  return errors
}

export function getShopeeDiscountClient(env, options = {}) {
  const base = { env, clientType: 'marketplace_client', ...options }
  return {
    list: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_DISCOUNT_ENDPOINTS.list, params }),
    detail: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_DISCOUNT_ENDPOINTS.detail, params }),
    add: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_DISCOUNT_ENDPOINTS.add, method: 'POST', body }),
    addItem: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_DISCOUNT_ENDPOINTS.addItem, method: 'POST', body }),
    update: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_DISCOUNT_ENDPOINTS.update, method: 'POST', body }),
    updateItem: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_DISCOUNT_ENDPOINTS.updateItem, method: 'POST', body }),
    delete: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_DISCOUNT_ENDPOINTS.delete, method: 'POST', body }),
    deleteItem: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_DISCOUNT_ENDPOINTS.deleteItem, method: 'POST', body }),
    end: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_DISCOUNT_ENDPOINTS.end, method: 'POST', body })
  }
}
