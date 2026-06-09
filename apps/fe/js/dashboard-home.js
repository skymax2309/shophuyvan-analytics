(function () {
  const API = window.SHV_API || 'https://huyvan-worker-api.nghiemchihuy.workers.dev'
  const modules = [
    { title: 'Báo cáo', sub: 'Lợi nhuận', href: 'pages/profit-dashboard.html', icon: 'chart-no-axes-column-increasing', tone: 'green' },
    { title: 'Đơn bán', sub: 'OMS', href: 'pages/oms-dashboard.html', icon: 'package-check', tone: 'blue' },
    { title: 'Shop', sub: 'Sản phẩm', href: 'pages/admin-products.html', icon: 'store', tone: 'slate' },
    { title: 'Nhập hàng', sub: 'Mua hàng', href: 'pages/admin-purchase.html', icon: 'ship', tone: 'orange' },
    { title: 'Quét mã', sub: 'QR đóng gói/hủy/hoàn', href: 'pages/scan-qr.html', icon: 'scan-line', tone: 'slate' },
    { title: 'Sản phẩm', sub: 'SKU', href: 'pages/sku.html', icon: 'shopping-basket', tone: 'blue' },
    { title: 'Chat/CSKH', sub: 'Shopee', href: 'pages/chat-cskh.html', icon: 'messages-square', tone: 'green' },
    { title: 'Cài đặt Chat', sub: 'AI, thông báo', href: 'settings', icon: 'settings', tone: 'blue' },
    { title: 'ADS', sub: 'Quảng cáo', href: 'pages/ads.html', icon: 'megaphone', tone: 'orange' },
    { title: 'Trung tâm video', sub: 'Shopee/Lazada', href: 'pages/dashboard_video.html', icon: 'film', tone: 'red' },
    { title: 'Khuyến mãi sàn', sub: 'Discount, voucher, combo', href: 'pages/promotions.html', icon: 'tag', tone: 'purple' },
    { title: 'Báo cáo sàn', sub: 'Upload', href: 'pages/report-upload.html', icon: 'file-up', tone: 'slate' },
    { title: 'Import đơn', sub: 'Excel', href: 'pages/import-orders.html', icon: 'upload', tone: 'blue' },
    { title: 'Ghi hình', sub: 'CCTV đóng gói', href: 'pages/cctv_packing.html', icon: 'video', tone: 'red' },
    { title: 'Nhân viên', sub: 'Phân quyền', href: 'pages/admin-users.html', icon: 'users-round', tone: 'slate' },
  ]

  function money(value) {
    const number = Number(value || 0)
    return Number.isFinite(number) ? number : 0
  }

  function fmtMoney(value) {
    const number = money(value)
    if (Math.abs(number) >= 1000000) return `${(number / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}tr đ`
    return `${Math.round(number).toLocaleString('vi-VN')} đ`
  }

  function fmtCount(value) {
    return Number(value || 0).toLocaleString('vi-VN')
  }

  function todayIso() {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  function setText(id, value) {
    const el = document.getElementById(id)
    if (el) el.textContent = value
  }

  function updateClock() {
    const now = new Date()
    const time = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    const date = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
    setText('homeClock', `${time} - ${date}`)
  }

  function renderModules() {
    const grid = document.getElementById('homeModuleGrid')
    if (!grid) return
    grid.innerHTML = modules.map(item => `
      <a class="home-module" data-tone="${item.tone}" href="${item.href}">
        <span class="home-module-icon"><i data-lucide="${item.icon}"></i></span>
        <b>${item.title}</b>
        <small>${item.sub}</small>
      </a>
    `).join('')
    window.lucide?.createIcons?.()
  }

  function bindMenuButton() {
    document.querySelector('.home-menu')?.addEventListener('click', () => {
      document.getElementById('homeModuleGrid')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  async function loadTodaySummary() {
    const today = todayIso()
    try {
      const res = await fetch(`${API}/api/dashboard?from=${today}&to=${today}`, { cache: 'no-store' })
      const dash = await res.json()
      const fee = money(dash.total_fee || dash.finance_fee_core?.totals?.display_total)
      const costReal = money(dash.total_cost_real)
      const revenue = money(dash.total_revenue)
      const netProfit = revenue - costReal - fee - money(dash.total_tax_flat) - money(dash.total_tax_income) - money(dash.total_return_refund)
      setText('homeRevenue', fmtMoney(revenue))
      setText('homeOrderValid', fmtCount(dash.success_orders || dash.total_orders))
      setText('homeOrderShipping', fmtCount(dash.shipping_orders))
      setText('homeOrderIssue', fmtCount(money(dash.cancel_orders) + money(dash.return_orders)))
      setText('homeNetProfit', fmtMoney(netProfit))
    } catch {
      setText('homeRevenue', 'Chưa tải')
      setText('homeOrderValid', '--')
      setText('homeOrderShipping', '--')
      setText('homeOrderIssue', '--')
      setText('homeNetProfit', '--')
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateClock()
    renderModules()
    bindMenuButton()
    loadTodaySummary()
    setInterval(updateClock, 30000)
  })
})()
