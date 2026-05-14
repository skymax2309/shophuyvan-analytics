(function attachOrderStatusCore(global) {
  const STATUS_LABELS = {
    UNPAID: 'chưa thanh toán',
    PENDING: 'chờ xử lý',
    READY_TO_SHIP: 'chờ chuẩn bị hàng',
    PROCESSED: 'đã xử lý',
    LOGISTICS_PENDING_ARRANGE: 'chờ lấy hàng',
    LOGISTICS_REQUEST_CREATED: 'đã tạo vận đơn',
    LOGISTICS_PACKAGED: 'đã đóng gói',
    SHIPPING: 'đang giao',
    SHIPPED: 'đang giao',
    TO_CONFIRM_RECEIVE: 'chờ khách nhận',
    COMPLETED: 'đã hoàn thành',
    CANCELLED: 'đã hủy',
    IN_CANCEL: 'khách yêu cầu hủy',
    TO_RETURN: 'trả hàng/hoàn tiền',
    RETURN: 'trả hàng/hoàn tiền',
    RETURN_REFUND: 'trả hàng/hoàn tiền',
    RETURN_COMPLAINT: 'đang khiếu nại hoàn/trả',
    LOGISTICS_IN_RETURN: 'đang hoàn hàng',
    LOGISTICS_RETURNED_BY_SHIPPER: 'đơn hoàn về shop',
    LOGISTICS_RETURN_PACKAGE_RECEIVED: 'shop đã nhận hàng hoàn',
    LOGISTICS_LOST: 'thất lạc hàng',
    FAILED_DELIVERY: 'giao không thành công',
    FAILED_DELIVERY_ATTEMPT: 'giao không thành công'
  }

  const KIND_LABELS = {
    new: 'đơn mới',
    failed: 'giao không thành công',
    return: 'trả hàng/hoàn tiền',
    cancelled: 'đơn hủy',
    completed: 'hoàn thành',
    shipping: 'đang giao',
    changed: 'cập nhật trạng thái'
  }

  function clean(value) {
    return String(value ?? '').replace(/\u00a0/g, ' ').trim()
  }

  function normalize(value) {
    return clean(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toUpperCase()
  }

  function statusValue(order = {}, fallback = '') {
    if (!order || typeof order !== 'object') return clean(order || fallback)
    return clean(
      order.shipping_status
      || order.logistics_status
      || order.delivery_status
      || order.oms_status
      || order.status
      || order.order_status
      || order.order_type
      || fallback
    )
  }

  function label(value, fallback = 'chưa rõ trạng thái') {
    const raw = clean(value)
    if (!raw) return fallback
    const key = normalize(raw)
    // Core trạng thái dùng chung để chat, dashboard, ADS và cron không tự dịch mỗi nơi một kiểu.
    if (STATUS_LABELS[key]) return STATUS_LABELS[key]
    if (/RETURN|REFUND|TO_RETURN|HOAN|TRA HANG/.test(key)) return 'trả hàng/hoàn tiền'
    if (/FAILED_DELIVERY|DELIVERY_FAILED|LOST|GIAO KHONG THANH CONG/.test(key)) return 'giao không thành công'
    if (/CANCEL|HUY/.test(key)) return 'đã hủy'
    if (/COMPLETED|DELIVERED|RECEIVED|DA GIAO|GIAO THANH CONG/.test(key)) return 'đã hoàn thành'
    if (/SHIPPED|SHIPPING|TO_CONFIRM_RECEIVE|IN_TRANSIT|DANG GIAO|VAN CHUYEN/.test(key)) return 'đang giao'
    if (/READY|PICKUP|LOGISTICS_REQUEST|LOGISTICS_PENDING|PACKAGED|CHO LAY HANG/.test(key)) return 'chờ lấy hàng'
    if (/UNPAID|PENDING_PAYMENT|CHO THANH TOAN/.test(key)) return 'chưa thanh toán'
    if (/PENDING|PROCESS|CONFIRM|WAIT|NEW|CHO XU LY|DANG XU LY/.test(key)) return 'chờ xử lý'
    return raw || fallback
  }

  function kind(order = {}, reason = '') {
    const key = normalize([
      reason,
      order?._push_reason,
      order?.order_type,
      order?.oms_status,
      order?.shipping_status,
      order?.logistics_status,
      order?.delivery_status,
      typeof order === 'string' ? order : ''
    ].map(clean).join(' '))
    if (/\bNEW\b/.test(key)) return 'new'
    if (/IN_CANCEL|KHACH YEU CAU HUY|YEU CAU HUY/.test(key)) return 'changed'
    if (/FAILED_DELIVERY|DELIVERY_FAILED|LOGISTICS_LOST|LOST|GIAO KHONG THANH CONG/.test(key)) return 'failed'
    if (/RETURN|REFUND|TO_RETURN|HOAN|TRA HANG/.test(key)) return 'return'
    if (/CANCEL|HUY/.test(key)) return 'cancelled'
    if (/COMPLETED|DELIVERED|RECEIVED|DA GIAO/.test(key)) return 'completed'
    if (/SHIPPING|SHIPPED|TO_CONFIRM_RECEIVE|IN_TRANSIT|DANG GIAO/.test(key)) return 'shipping'
    return 'changed'
  }

  function uiClass(value) {
    const statusKind = typeof value === 'string' ? kind(value) : kind(value || {})
    if (statusKind === 'completed') return 'ok'
    if (statusKind === 'return' || statusKind === 'cancelled' || statusKind === 'failed') return 'bad'
    if (statusKind === 'shipping') return 'ship'
    return 'wait'
  }

  global.SHV_ORDER_STATUS_CORE = {
    normalize,
    statusValue,
    label,
    kind,
    kindLabel: value => KIND_LABELS[clean(value)] || KIND_LABELS.changed,
    uiClass
  }
})(window)
