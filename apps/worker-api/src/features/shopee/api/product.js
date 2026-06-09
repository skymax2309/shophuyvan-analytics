import { callShopeeApiWithAutoRefresh } from './auth.js'

export const SHOPEE_PRODUCT_ENDPOINTS = {
  shop_info: '/api/v2/shop/get_shop_info',
  item_list: '/api/v2/product/get_item_list',
  item_base_info: '/api/v2/product/get_item_base_info',
  item_extra_info: '/api/v2/product/get_item_extra_info',
  model_list: '/api/v2/product/get_model_list',
  search_item: '/api/v2/product/search_item',
  update_price: '/api/v2/product/update_price',
  update_stock: '/api/v2/product/update_stock'
}

export function getShopeeProductClient(env, options = {}) {
  const base = { env, clientType: 'marketplace_client', ...options }
  return {
    getShopInfo: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_PRODUCT_ENDPOINTS.shop_info, params }),
    getItemList: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_PRODUCT_ENDPOINTS.item_list, params }),
    getItemBaseInfo: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_PRODUCT_ENDPOINTS.item_base_info, params }),
    getItemExtraInfo: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_PRODUCT_ENDPOINTS.item_extra_info, params }),
    getModelList: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_PRODUCT_ENDPOINTS.model_list, params }),
    searchItem: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_PRODUCT_ENDPOINTS.search_item, params }),
    updatePrice: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_PRODUCT_ENDPOINTS.update_price, method: 'POST', body }),
    updateStock: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_PRODUCT_ENDPOINTS.update_stock, method: 'POST', body })
  }
}
