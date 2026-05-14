const incomeState = {
  data: null,
  allShops: [],
  loaded: false,
  detailRows: [],
  detailCursor: '',
  billingRows: [],
  billingCursor: '',
  payoutRows: [],
  payoutCursor: '',
  walletRows: [],
  walletPageNo: 0,
  walletMore: false,
  activeSection: 'overview',
  sectionsBound: false,
  sectionLoaded: {},
  escrowRows: [],
  escrowDetailRows: [],
  feeDiscountRows: [],
  paymentMethodRows: [],
  lazadaRows: [],
  lazadaMode: '',
  reportRows: [],
  reportCheckRows: [],
  statementGenerateRows: [],
  statementRows: []
}

function incomeEl(id) {
  return document.getElementById(id)
}

function incomeEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[ch])
}

function incomeInlineString(value) {
  // Chuẩn hóa tham số đưa vào onclick để không vỡ HTML khi tên shop có ký tự đặc biệt.
  return incomeEscape(JSON.stringify(String(value ?? '')).replace(/</g, '\\u003c'))
}

function incomeReadableMessage(value) {
  const text = String(value || '').trim()
  if (/only applicable for cross boarder shop/i.test(text) || /only applicable for cross border shop/i.test(text)) {
    return 'Endpoint này chỉ áp dụng cho shop Cross Border. Shop local sẽ không có dữ liệu payout/billing CB.'
  }
  if (/no permission to current api/i.test(text)) return 'App chưa có quyền gọi API này trên Shopee.'
  if (/information you queried is not found/i.test(text)) return 'Shopee không tìm thấy dữ liệu phù hợp với bộ lọc hiện tại.'
  if (/PAYMENT_DOCUMENT_ID_NOT_FOUND/i.test(text)) return 'Không tìm thấy file theo ID này. Thường do ID chưa xử lý xong hoặc đang kiểm tra nhầm shop; hãy chọn đúng shop đã tạo ID rồi kiểm tra lại.'
  return text
}

function incomeMoney(value) {
  return Number(value || 0).toLocaleString('vi-VN') + 'đ'
}

function incomeShort(value) {
  const n = Number(value || 0)
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + ' tỷ'
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + ' tr'
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + 'k'
  return n.toLocaleString('vi-VN')
}

function incomeStatusLabel(value) {
  const key = String(value ?? '')
  if (key === '0') return 'Chờ Shopee giải ngân'
  if (key === '1') return 'Đã ghi nhận'
  if (key === '2') return 'Chờ đơn hoàn tất'
  return 'Tất cả trạng thái'
}

function incomeStatementStatusLabel(value) {
  const key = String(value ?? '')
  if (key === '0') return 'Không hợp lệ'
  if (key === '1') return 'Đang xử lý'
  if (key === '2') return 'Có thể tải'
  if (key === '3') return 'Đã tải'
  if (key === '4') return 'Tạo file lỗi'
  return 'Chưa rõ'
}

function incomeStatementTypeLabel(value) {
  return String(value ?? '1') === '2' ? 'Theo tháng' : 'Theo tuần'
}

function incomeWalletTabLabel(value) {
  const key = String(value || '')
  const labels = {
    Default: 'Mặc định',
    wallet_order_income: 'Thu nhập đơn hàng',
    wallet_adjustment_filter: 'Điều chỉnh',
    wallet_wallet_payment: 'Thanh toán ví',
    wallet_refund_from_order: 'Hoàn tiền từ đơn',
    wallet_withdrawals: 'Rút tiền',
    fast_escrow_repayment: 'Hoàn ứng nhanh',
    fast_pay: 'Thanh toán nhanh',
    seller_loan: 'Khoản vay seller',
    corporate_loan: 'Khoản vay doanh nghiệp'
  }
  return labels[key] || key || '-'
}

function incomeDateYmd(date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function lastWeekRange() {
  const today = startOfDay(new Date())
  const day = today.getDay()
  const currentMonday = new Date(today)
  currentMonday.setDate(today.getDate() - ((day + 6) % 7))
  const start = new Date(currentMonday)
  start.setDate(currentMonday.getDate() - 7)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { from: incomeDateYmd(start), to: incomeDateYmd(end) }
}

function lastMonthRange() {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const end = new Date(today.getFullYear(), today.getMonth(), 0)
  return { from: incomeDateYmd(start), to: incomeDateYmd(end) }
}

function incomeInitDetailDates() {
  const from = incomeEl('incomeDetailFrom')
  const to = incomeEl('incomeDetailTo')
  if (!from || !to || (from.value && to.value)) return
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 13)
  from.value = incomeDateYmd(start)
  to.value = incomeDateYmd(end)
}

function incomeInitWalletDates() {
  const from = incomeEl('incomeWalletFrom')
  const to = incomeEl('incomeWalletTo')
  if (!from || !to || (from.value && to.value)) return
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 14)
  from.value = incomeDateYmd(start)
  to.value = incomeDateYmd(end)
}

function incomeInitPayoutDates() {
  const from = incomeEl('incomePayoutFrom')
  const to = incomeEl('incomePayoutTo')
  if (!from || !to || (from.value && to.value)) return
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 14)
  from.value = incomeDateYmd(start)
  to.value = incomeDateYmd(end)
}

function incomeInitEscrowDates() {
  const from = incomeEl('incomeEscrowFrom')
  const to = incomeEl('incomeEscrowTo')
  if (!from || !to || (from.value && to.value)) return
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 14)
  from.value = incomeDateYmd(start)
  to.value = incomeDateYmd(end)
}

function incomeInitFeeDiscountDates() {
  const from = incomeEl('incomeFeeDiscountFrom')
  const to = incomeEl('incomeFeeDiscountTo')
  if (!from || !to || (from.value && to.value)) return
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 30)
  from.value = incomeDateYmd(start)
  to.value = incomeDateYmd(end)
}

function incomeInitLazadaDates() {
  const from = incomeEl('incomeLazadaFrom')
  const to = incomeEl('incomeLazadaTo')
  if (!from || !to || (from.value && to.value)) return
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 13)
  from.value = incomeDateYmd(start)
  to.value = incomeDateYmd(end)
}

function incomeInitReportDates() {
  const from = incomeEl('incomeReportFrom')
  const to = incomeEl('incomeReportTo')
  if (!from || !to || (from.value && to.value)) return
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 6)
  from.value = incomeDateYmd(start)
  to.value = incomeDateYmd(end)
}

function incomeInitStatementDates(force = false) {
  const from = incomeEl('incomeStatementFrom')
  const to = incomeEl('incomeStatementTo')
  if (!from || !to || (!force && from.value && to.value)) return
  const type = incomeEl('incomeStatementType')?.value || '1'
  const range = type === '2' ? lastMonthRange() : lastWeekRange()
  from.value = range.from
  to.value = range.to
}

window.incomeApplyStatementTypeDates = function() {
  incomeInitStatementDates(true)
}

function incomeFormatTime(value) {
  const raw = String(value || '')
  if (!raw) return ''
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

async function incomeFetch(path) {
  const res = await fetch(API + path, { cache: 'no-store' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || data.message || `Lỗi ${res.status}`)
  return data
}

function incomeQuery() {
  const qs = new URLSearchParams()
  const shop = incomeEl('incomeShop')?.value || ''
  const status = incomeEl('incomeStatus')?.value || ''
  if (shop) qs.set('shop', shop)
  if (status !== '') qs.set('income_status', status)
  qs.set('shop_limit', '100')
  return qs.toString()
}

function incomeDetailQuery(cursor = '') {
  incomeInitDetailDates()
  const qs = new URLSearchParams()
  const shop = incomeEl('incomeShop')?.value || ''
  const status = incomeEl('incomeDetailStatus')?.value || '2'
  const dateFrom = incomeEl('incomeDetailFrom')?.value || ''
  const dateTo = incomeEl('incomeDetailTo')?.value || ''
  const pageSize = incomeEl('incomeDetailPageSize')?.value || '30'
  if (shop) qs.set('shop', shop)
  qs.set('income_status', status)
  qs.set('date_from', dateFrom)
  qs.set('date_to', dateTo)
  qs.set('page_size', pageSize)
  qs.set('shop_limit', '100')
  if (cursor) qs.set('cursor', cursor)
  return qs.toString()
}

function incomeBillingQuery(cursor = '') {
  const qs = new URLSearchParams()
  const shop = incomeEl('incomeShop')?.value || ''
  const type = incomeEl('incomeBillingType')?.value || '1'
  const payoutIds = incomeEl('incomeBillingPayoutIds')?.value || ''
  const pageSize = incomeEl('incomeBillingPageSize')?.value || '100'
  if (shop) qs.set('shop', shop)
  qs.set('billing_transaction_info_type', type)
  qs.set('page_size', pageSize)
  qs.set('shop_limit', '100')
  if (payoutIds) qs.set('encrypted_payout_ids', payoutIds)
  if (cursor) qs.set('cursor', cursor)
  return qs.toString()
}

function incomePayoutQuery(cursor = '') {
  incomeInitPayoutDates()
  const qs = new URLSearchParams()
  const shop = incomeEl('incomeShop')?.value || ''
  const dateFrom = incomeEl('incomePayoutFrom')?.value || ''
  const dateTo = incomeEl('incomePayoutTo')?.value || ''
  const pageSize = incomeEl('incomePayoutPageSize')?.value || '10'
  if (shop) qs.set('shop', shop)
  qs.set('date_from', dateFrom)
  qs.set('date_to', dateTo)
  qs.set('page_size', pageSize)
  qs.set('shop_limit', '100')
  if (cursor) qs.set('cursor', cursor)
  return qs.toString()
}

function incomeWalletQuery(pageNo = 0) {
  incomeInitWalletDates()
  const qs = new URLSearchParams()
  const shop = incomeEl('incomeShop')?.value || ''
  const dateFrom = incomeEl('incomeWalletFrom')?.value || ''
  const dateTo = incomeEl('incomeWalletTo')?.value || ''
  const pageSize = incomeEl('incomeWalletPageSize')?.value || '40'
  const moneyFlow = incomeEl('incomeWalletMoneyFlow')?.value || ''
  const tabType = incomeEl('incomeWalletTabType')?.value || ''
  const transactionType = String(incomeEl('incomeWalletTransactionType')?.value || '').trim()
  if (shop) qs.set('shop', shop)
  qs.set('date_from', dateFrom)
  qs.set('date_to', dateTo)
  qs.set('page_no', String(Math.max(Number(pageNo || 0), 0)))
  qs.set('page_size', pageSize)
  qs.set('shop_limit', '100')
  if (moneyFlow) qs.set('money_flow', moneyFlow)
  if (tabType) qs.set('transaction_tab_type', tabType)
  if (transactionType) qs.set('transaction_type', transactionType)
  return qs.toString()
}

function incomeEscrowQuery() {
  incomeInitEscrowDates()
  const qs = new URLSearchParams()
  const shop = incomeEl('incomeShop')?.value || ''
  const dateFrom = incomeEl('incomeEscrowFrom')?.value || ''
  const dateTo = incomeEl('incomeEscrowTo')?.value || ''
  const pageSize = incomeEl('incomeEscrowPageSize')?.value || '40'
  const pageNo = incomeEl('incomeEscrowPageNo')?.value || '1'
  if (shop) qs.set('shop', shop)
  qs.set('date_from', dateFrom)
  qs.set('date_to', dateTo)
  qs.set('page_size', pageSize)
  qs.set('page_no', pageNo)
  qs.set('shop_limit', '100')
  return qs.toString()
}

function incomeEscrowDetailQuery(orderSnList = '') {
  const qs = new URLSearchParams()
  const shop = incomeEl('incomeShop')?.value || ''
  const orderSn = String(orderSnList || incomeEl('incomeEscrowOrderSn')?.value || '').trim()
  if (shop) qs.set('shop', shop)
  if (orderSn) qs.set('order_sn_list', orderSn)
  qs.set('shop_limit', shop ? '1' : '20')
  return qs.toString()
}

function incomeFeeDiscountQuery() {
  incomeInitFeeDiscountDates()
  const qs = new URLSearchParams()
  const shop = incomeEl('incomeShop')?.value || ''
  const dateFrom = incomeEl('incomeFeeDiscountFrom')?.value || ''
  const dateTo = incomeEl('incomeFeeDiscountTo')?.value || ''
  const filter = incomeEl('incomeFeeDiscountFilter')?.value || 'has_any'
  const search = String(incomeEl('incomeFeeDiscountSearch')?.value || '').trim()
  const pageSize = incomeEl('incomeFeeDiscountPageSize')?.value || '50'
  const pageNo = incomeEl('incomeFeeDiscountPageNo')?.value || '1'
  if (shop) qs.set('shop', shop)
  qs.set('date_from', dateFrom)
  qs.set('date_to', dateTo)
  qs.set('filter', filter)
  qs.set('page_size', pageSize)
  qs.set('page_no', pageNo)
  if (search) qs.set('search', search)
  return qs.toString()
}

function incomeLazadaQuery() {
  incomeInitLazadaDates()
  const qs = new URLSearchParams()
  const shop = incomeEl('incomeShop')?.value || ''
  const dateFrom = incomeEl('incomeLazadaFrom')?.value || ''
  const dateTo = incomeEl('incomeLazadaTo')?.value || ''
  const pageSize = incomeEl('incomeLazadaPageSize')?.value || '100'
  const maxPages = incomeEl('incomeLazadaMaxPages')?.value || '1'
  if (shop) qs.set('shop', shop)
  qs.set('date_from', dateFrom)
  qs.set('date_to', dateTo)
  qs.set('page_size', pageSize)
  qs.set('max_pages', maxPages)
  qs.set('shop_limit', '100')
  return qs.toString()
}

function incomeStatementQuery() {
  const qs = new URLSearchParams()
  const shop = incomeEl('incomeShop')?.value || ''
  const statementId = String(incomeEl('incomeStatementId')?.value || '').trim()
  if (shop) qs.set('shop', shop)
  if (statementId) qs.set('income_statement_id', statementId)
  qs.set('shop_limit', '100')
  return qs.toString()
}

function incomeReportQuery() {
  incomeInitReportDates()
  const qs = new URLSearchParams()
  const shop = incomeEl('incomeShop')?.value || ''
  const dateFrom = incomeEl('incomeReportFrom')?.value || ''
  const dateTo = incomeEl('incomeReportTo')?.value || ''
  if (shop) qs.set('shop', shop)
  qs.set('date_from', dateFrom)
  qs.set('date_to', dateTo)
  qs.set('shop_limit', '100')
  return qs.toString()
}

function incomeReportCheckQuery() {
  const qs = new URLSearchParams()
  const shop = incomeEl('incomeShop')?.value || ''
  const reportId = String(incomeEl('incomeReportId')?.value || '').trim()
  if (shop) qs.set('shop', shop)
  if (reportId) qs.set('income_report_id', reportId)
  qs.set('shop_limit', '100')
  return qs.toString()
}

function incomeStatementGenerateQuery() {
  incomeInitStatementDates()
  const qs = new URLSearchParams()
  const shop = incomeEl('incomeShop')?.value || ''
  const statementType = incomeEl('incomeStatementType')?.value || '1'
  const dateFrom = incomeEl('incomeStatementFrom')?.value || ''
  const dateTo = incomeEl('incomeStatementTo')?.value || ''
  if (shop) qs.set('shop', shop)
  qs.set('statement_type', statementType)
  qs.set('date_from', dateFrom)
  qs.set('date_to', dateTo)
  qs.set('shop_limit', '100')
  return qs.toString()
}
