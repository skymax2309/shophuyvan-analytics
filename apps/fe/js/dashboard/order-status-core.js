(function attachOrderStatusCore(global) {
  const STATUS_META = {
    PENDING: { label: 'Chờ xử lý', tone: 'wait', icon: '•' },
    READY_TO_SHIP: { label: 'Đã xử lý / sẵn sàng giao', tone: 'ready', icon: '✓' },
    WAIT_PICKUP: { label: 'Chờ lấy hàng', tone: 'wait', icon: '•' },
    SHIPPING: { label: 'Đang giao', tone: 'ship', icon: '›' },
    COMPLETED: { label: 'Đã giao', tone: 'ok', icon: '✓' },
    CANCELLED: { label: 'Đã hủy', tone: 'bad', icon: '×' },
    RETURN: { label: 'Hoàn / trả', tone: 'bad', icon: '↩' },
    FAILED_DELIVERY: { label: 'Giao thất bại', tone: 'bad', icon: '!' },
    UNKNOWN: { label: 'Lỗi / cần kiểm tra', tone: 'bad', icon: '!' }
  }

  function clean(value) {
    return String(value ?? '').replace(/\u00a0/g, ' ').trim()
  }

  function coreCode(value) {
    if (value && typeof value === 'object') {
      return clean(
        value.order_status_core ||
        value.order_status_detail?.order_status_core ||
        value.status_parent ||
        'UNKNOWN'
      ).toUpperCase()
    }
    return clean(value).toUpperCase() || 'UNKNOWN'
  }

  function resolve(value = {}, fallback = '') {
    const code = coreCode(value)
    const meta = STATUS_META[code] || STATUS_META.UNKNOWN
    const display = value && typeof value === 'object'
      ? clean(value.display_status_vi || value.status_label_vi || value.order_status_detail?.display_status_vi)
      : ''
    // Frontend chỉ format kết quả Core; không tự dịch raw platform status nữa.
    return {
      code,
      fulfillment_status_core: value && typeof value === 'object' ? clean(value.fulfillment_status_core || value.order_status_detail?.fulfillment_status_core) : '',
      label: display || meta.label || clean(fallback) || STATUS_META.UNKNOWN.label,
      tone: meta.tone,
      icon: meta.icon
    }
  }

  global.SHV_ORDER_STATUS_CORE = {
    resolve,
    label: (value, fallback = '') => resolve(value, fallback).label,
    uiClass: value => resolve(value).tone,
    icon: value => resolve(value).icon
  }
})(window)
