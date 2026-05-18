import { callShopeeApiWithAutoRefresh } from './auth.js'

export const SHOPEE_VOUCHER_ENDPOINTS = {
  list: '/api/v2/voucher/get_voucher_list',
  detail: '/api/v2/voucher/get_voucher',
  add: '/api/v2/voucher/add_voucher',
  update: '/api/v2/voucher/update_voucher',
  delete: '/api/v2/voucher/delete_voucher',
  end: '/api/v2/voucher/end_voucher'
}

export function validateShopeeVoucherPayload(action, payload = {}) {
  const errors = []
  if (['update', 'delete', 'end'].includes(action) && !payload.voucher_id) errors.push('voucher_id is required')
  if (['add', 'update'].includes(action)) {
    if (!payload.voucher_name && !payload.voucher_code) errors.push('voucher_name or voucher_code is required')
    if (!payload.start_time) errors.push('start_time is required')
    if (!payload.end_time) errors.push('end_time is required')
  }
  return errors
}

export function getShopeeVoucherClient(env, options = {}) {
  const base = { env, clientType: 'marketplace_client', ...options }
  return {
    list: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_VOUCHER_ENDPOINTS.list, params }),
    detail: params => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_VOUCHER_ENDPOINTS.detail, params }),
    add: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_VOUCHER_ENDPOINTS.add, method: 'POST', body }),
    update: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_VOUCHER_ENDPOINTS.update, method: 'POST', body }),
    delete: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_VOUCHER_ENDPOINTS.delete, method: 'POST', body }),
    end: body => callShopeeApiWithAutoRefresh(env, { ...base, path: SHOPEE_VOUCHER_ENDPOINTS.end, method: 'POST', body })
  }
}
