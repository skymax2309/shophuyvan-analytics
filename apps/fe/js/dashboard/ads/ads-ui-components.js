function adsDebugValue(value) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function adsActionOk(result = {}) {
  return result.ok === true || (result.status === 'ok' && result.verified === true)
}

function adsShowToast(message, type = 'info') {
  let host = document.getElementById('adsToastHost')
  if (!host) {
    host = document.createElement('div')
    host.id = 'adsToastHost'
    host.className = 'ads-toast-host'
    document.body.appendChild(host)
  }
  const toast = document.createElement('div')
  toast.className = `ads-toast ads-toast-${type}`
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status')
  toast.textContent = message || ''
  host.appendChild(toast)
  setTimeout(() => toast.remove(), 5200)
}

function adsConfirmAction(options = {}) {
  const title = options.title || 'Xác nhận thao tác'
  const message = options.message || ''
  const details = Array.isArray(options.details) ? options.details.filter(Boolean) : []
  const confirmText = options.confirmText || 'Xác nhận'
  const cancelText = options.cancelText || 'Hủy'
  const danger = options.danger === true
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'ads-confirm-overlay'
    overlay.setAttribute('role', 'presentation')
    overlay.innerHTML = `
      <section class="ads-confirm-sheet" role="dialog" aria-modal="true" aria-labelledby="adsConfirmTitle">
        <header>
          <b id="adsConfirmTitle">${adsEscape(title)}</b>
          <button type="button" class="secondary" data-cancel aria-label="Đóng">×</button>
        </header>
        ${message ? `<p>${adsEscape(message)}</p>` : ''}
        ${details.length ? `<dl>${details.map(item => `<div><dt>${adsEscape(item.label || '')}</dt><dd>${adsEscape(item.value || '')}</dd></div>`).join('')}</dl>` : ''}
        <footer>
          <button type="button" class="secondary" data-cancel>${adsEscape(cancelText)}</button>
          <button type="button" class="${danger ? 'danger' : ''}" data-confirm>${adsEscape(confirmText)}</button>
        </footer>
      </section>
    `
    const close = value => {
      overlay.remove()
      resolve(value)
    }
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('[data-cancel]')) close(false)
      if (event.target.closest('[data-confirm]')) close(true)
    })
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') close(false)
    })
    document.body.appendChild(overlay)
    overlay.querySelector('[data-confirm]')?.focus()
  })
}

function adsConfirmShopeeAction(options = {}) {
  const details = [
    options.action ? { label: 'Action', value: options.action } : null,
    options.shop ? { label: 'Shop', value: options.shop } : null,
    options.objectId ? { label: 'Object ID', value: options.objectId } : null,
    options.module ? { label: 'Module', value: options.module } : null,
    options.endpoint ? { label: 'Endpoint', value: options.endpoint } : null,
    options.count ? { label: 'Số dòng', value: options.count } : null
  ].filter(Boolean)
  return adsConfirmAction({
    title: options.title || 'Xác nhận thao tác Shopee',
    message: options.message || 'Lệnh này gửi thật lên Shopee và chỉ hiển thị thành công khi refetch verify đúng trạng thái.',
    danger: options.danger !== false,
    confirmText: options.confirmText || 'Gửi lên Shopee',
    details
  })
}

function adsApiResultPanel(result = {}, options = {}) {
  const ok = adsActionOk(result)
  const title = options.title || (ok ? 'Đã verify từ Shopee' : 'Shopee chưa xác nhận thay đổi')
  const endpoint = result.endpoint || result.verify_result?.endpoint || ''
  const requestId = result.request_id || result.verify_result?.request_id || result.verify_result?.detail_request_id || ''
  const objectId = result.object_id || result.campaign_id || result.top_picks_id || ''
  const message = result.message || result.error || ''
  return `
    <div class="ads-api-panel ${ok ? 'verified' : 'failed'}">
      <div class="ads-api-panel-head">
        <b>${adsEscape(title)}</b>
        <span>${ok ? 'Verified' : 'Failed'}</span>
      </div>
      <dl class="ads-api-debug-grid">
        <div><dt>Endpoint</dt><dd>${adsEscape(endpoint || 'Chưa có')}</dd></div>
        <div><dt>Action</dt><dd>${adsEscape(result.action || options.action || '')}</dd></div>
        <div><dt>Shop</dt><dd>${adsEscape(result.shop || result.shop_id || '')}</dd></div>
        <div><dt>Object ID</dt><dd>${adsEscape(objectId || '')}</dd></div>
        <div><dt>Request ID</dt><dd>${adsEscape(requestId || '')}</dd></div>
        <div><dt>Trạng thái</dt><dd>${adsEscape(result.status || '')}</dd></div>
      </dl>
      ${message ? `<p class="ads-api-message">${adsEscape(message)}</p>` : ''}
      <details class="ads-api-details">
        <summary>Payload / response đã che secret</summary>
        <pre>${adsEscape(adsDebugValue({
          payload: result.payload_preview || result.request_payload || result.payload,
          response: result.raw_response || result.response,
          error: result.raw_error || result.error_code,
          verify: result.verify_result || null
        }))}</pre>
      </details>
      <button type="button" class="secondary" onclick='navigator.clipboard?.writeText(${JSON.stringify(adsDebugValue(result))}); adsShowToast("Đã copy debug info", "ok")'>Copy debug info</button>
    </div>
  `
}

function adsSetApiResult(target, result = {}, options = {}) {
  const el = typeof target === 'string' ? adsEl(target) : target
  if (!el) return
  el.innerHTML = adsApiResultPanel(result, options)
  adsShowToast(result.message || options.title || '', adsActionOk(result) ? 'ok' : 'error')
}
