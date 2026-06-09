import { mapMarketplaceOrderStatus } from './status-core.js'

function cleanText(value) {
  const text = String(value ?? '').replace(/\u00a0/g, ' ').trim()
  const lower = text.toLowerCase()
  if (!text || ['null', 'undefined', 'none', '-', '--', 'unknown', 'n/a', 'na', 'chưa rõ', 'chua ro'].includes(lower)) return ''
  return text
}

function firstPackage(order) {
  const packages = Array.isArray(order?.package_list) ? order.package_list : []
  if (packages[0] && typeof packages[0] === 'object') return packages[0]
  return {}
}

function uniqueTexts(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))]
}

export function collectShopeePackageStatus(order, pkg = firstPackage(order)) {
  // NEO: Không trộn return_status phụ của Shopee vào logistics chung; trường phụ này có thể là nhãn tham chiếu và đã từng làm đơn COMPLETED bị đếm thành Hoàn.
  return uniqueTexts([
    order?.order_status,
    order?.status,
    order?.status_description,
    order?.cancel_reason,
    order?.buyer_cancel_reason,
    pkg?.logistics_status,
    pkg?.package_status,
    pkg?.shipping_status,
    pkg?.status,
    pkg?.status_description,
    pkg?.cancel_reason
  ]).join(' ')
}

export function mapShopeeStatus(rawStatus, packageStatus = '', tracking = '') {
  return mapMarketplaceOrderStatus('shopee', rawStatus, {
    packageStatus,
    tracking
  })
}
