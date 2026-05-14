function toggleSidebar() {
      document.getElementById('sidebar').classList.toggle('open')
      document.getElementById('sidebarOverlay').classList.toggle('show')
    }

    function adsPadDatePart(value) {
      return String(value).padStart(2, '0')
    }

    function adsFormatDate(date) {
      return `${date.getFullYear()}-${adsPadDatePart(date.getMonth() + 1)}-${adsPadDatePart(date.getDate())}`
    }

    function adsFormatMonthValue(date) {
      return `${date.getFullYear()}-${adsPadDatePart(date.getMonth() + 1)}`
    }

    function adsMonthLabel(value) {
      const [year, month] = String(value || '').split('-').map(Number)
      if (!year || !month) return 'Chọn tháng'
      return `Tháng ${month}/${year}`
    }

    function adsMonthRange(value) {
      const [year, month] = String(value || '').split('-').map(Number)
      if (!year || !month) return null
      const now = new Date()
      const first = new Date(year, month - 1, 1)
      const last = new Date(year, month, 0)
      const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
      return {
        from: adsFormatDate(first),
        to: adsFormatDate(isCurrentMonth ? now : last)
      }
    }

    function populateAdsMonthSelect() {
      const select = document.getElementById('adsMonthSelect')
      if (!select || select.options.length > 1) return
      const now = new Date()
      for (let i = 0; i < 18; i += 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const value = adsFormatMonthValue(date)
        const option = document.createElement('option')
        option.value = value
        option.textContent = i === 0 ? `${adsMonthLabel(value)} - tháng này` : adsMonthLabel(value)
        select.appendChild(option)
      }
    }

    function syncAdsMonthSelectWithRange() {
      const from = document.getElementById('filterFrom')?.value || ''
      const to = document.getElementById('filterTo')?.value || ''
      const select = document.getElementById('adsMonthSelect')
      if (!select || !from || !to || from.slice(0, 7) !== to.slice(0, 7)) return
      select.value = from.slice(0, 7)
    }

    function updateAdsDateRangeHint() {
      const from = document.getElementById('filterFrom')?.value || ''
      const to = document.getElementById('filterTo')?.value || ''
      const hint = document.getElementById('adsDateRangeHint')
      if (hint) hint.textContent = from && to
        ? `Đang xem ADS từ ${from} đến ${to}. Nút kéo tháng sẽ dùng tháng đang chọn ở ô "Chọn tháng".`
        : 'Chọn khoảng ngày hoặc chọn tháng để xem/kéo lại ADS.'
    }

    function setAdsDatePresetActive(key = '') {
      document.querySelectorAll('[data-date-preset]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.datePreset === key)
      })
    }

    function setAdsQuickDateRange(key) {
      if (typeof applyPreset === 'function') applyPreset(key)
      setAdsDatePresetActive(key)
      syncAdsMonthSelectWithRange()
      updateAdsDateRangeHint()
      if (typeof loadAdsDashboard === 'function') loadAdsDashboard()
    }

    function setAdsMonthFromSelect() {
      const select = document.getElementById('adsMonthSelect')
      const range = adsMonthRange(select?.value || '')
      if (!range) return
      document.getElementById('filterFrom').value = range.from
      document.getElementById('filterTo').value = range.to
      setAdsDatePresetActive('')
      updateAdsDateRangeHint()
      if (typeof loadAdsDashboard === 'function') loadAdsDashboard()
    }

    function setAdsMonth() {
      populateAdsMonthSelect()
      const select = document.getElementById('adsMonthSelect')
      if (select) select.value = adsFormatMonthValue(new Date())
      setAdsMonthFromSelect()
    }

    function onAdsDateInputChanged() {
      setAdsDatePresetActive('')
      syncAdsMonthSelectWithRange()
      updateAdsDateRangeHint()
      if (typeof loadAdsDashboard === 'function') loadAdsDashboard()
    }

    function setAdsYear() {
      const year = new Date().getFullYear()
      document.getElementById('filterFrom').value = `${year}-01-01`
      document.getElementById('filterTo').value = `${year}-12-31`
      setAdsDatePresetActive('')
      updateAdsDateRangeHint()
      if (typeof loadAdsDashboard === 'function') loadAdsDashboard()
    }

    function resetAdsDateRange() {
      if (typeof applyPreset === 'function') applyPreset('last7')
      setAdsDatePresetActive('last7')
      syncAdsMonthSelectWithRange()
      updateAdsDateRangeHint()
      if (typeof loadAdsDashboard === 'function') loadAdsDashboard()
    }

    window.addEventListener('DOMContentLoaded', () => {
      // Khởi động ADS bằng dữ liệu 7 ngày để giảm tải API nhưng vẫn đủ bối cảnh tối ưu.
      populateAdsMonthSelect()
      if (typeof applyPreset === 'function') applyPreset('last7')
      setAdsDatePresetActive('last7')
      syncAdsMonthSelectWithRange()
      updateAdsDateRangeHint()
      if (typeof loadAds === 'function') loadAds()
    })
