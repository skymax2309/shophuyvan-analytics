(function () {
  const API = window.SHV_AUTH?.API || 'https://huyvan-worker-api.nghiemchihuy.workers.dev'
  const form = document.getElementById('diagnosticsForm')
  const statusEl = document.getElementById('diagnosticsStatus')
  const resultEl = document.getElementById('diagnosticsResult')
  const currentUserEl = document.getElementById('currentUser')

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function setStatus(text, type = '') {
    statusEl.textContent = text
    statusEl.className = `diag-status ${type}`.trim()
  }

  async function api(path, payload = {}) {
    const token = window.SHV_AUTH?.getToken()
    const headers = new Headers({ 'Content-Type': 'application/json' })
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      cache: 'no-store'
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.status === 'error') throw new Error(data.message || data.error || `HTTP ${res.status}`)
    return data
  }

  function badge(pass, warn = false) {
    const cls = pass ? 'pass' : warn ? 'warn' : 'fail'
    const text = pass ? 'PASS' : warn ? 'CẢNH BÁO' : 'FAIL'
    return `<span class="diag-badge ${cls}">${text}</span>`
  }

  function row(label, value) {
    return `<div class="diag-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value || 'Chưa có')}</b></div>`
  }

  function jsonBlock(data) {
    return `<pre class="diag-json">${escapeHtml(JSON.stringify(data || {}, null, 2))}</pre>`
  }

  function renderApp(title, app = {}) {
    return `
      <section class="diag-card">
        <h2>${escapeHtml(title)}</h2>
        <div class="diag-kpis">
          ${row('Client', app.client_type)}
          ${row('Base URL', app.base_url)}
          ${row('Partner ID', app.has_partner_id ? 'Đã cấu hình' : 'Chưa cấu hình')}
          ${row('Partner key', app.has_partner_key ? 'Đã cấu hình, đã mask' : 'Chưa cấu hình')}
          ${row('Access token', app.has_access_token ? 'Có token' : 'Chưa có token')}
          ${row('Refresh token', app.has_refresh_token ? 'Có refresh token' : 'Chưa có refresh token')}
        </div>
        ${app.using_legacy_db_config ? '<span class="diag-badge warn">Đang còn fallback cấu hình cũ</span>' : ''}
      </section>
    `
  }

  function renderTests(tests = []) {
    return `
      <section class="diag-card">
        <h2>Endpoint đã test</h2>
        <div class="diag-tests">
          ${tests.map(test => `
            <article class="diag-test">
              <div class="diag-test-head">
                <b>${escapeHtml(test.name)}</b>
                ${badge(Boolean(test.pass), Boolean(test.skipped))}
              </div>
              <code>${escapeHtml(test.client_type)} ${escapeHtml(test.method || 'GET')} ${escapeHtml(test.endpoint)}</code>
              <div class="diag-kpis">
                ${row('HTTP status', test.http_status || '')}
                ${row('Shopee error', test.error_code || test.error_category || '')}
                ${row('Message', test.message || '')}
                ${row('Request ID', test.request_id || '')}
                ${row('Thời gian', test.duration_ms ? `${test.duration_ms} ms` : '')}
                ${row('Response keys', (test.response_keys || []).join(', '))}
              </div>
              ${jsonBlock(test.raw_response_masked)}
            </article>
          `).join('')}
        </div>
      </section>
    `
  }

  function renderDiagnostics(data = {}) {
    const summary = data.summary || {}
    const selectedShop = data.selected_shop || {}
    resultEl.innerHTML = `
      <section class="diag-card">
        <h2>Tổng quan</h2>
        <div class="diag-kpis">
          ${row('Môi trường Shopee', data.environment?.shopee_env)}
          ${row('PASS', summary.pass_count)}
          ${row('FAIL', summary.fail_count)}
          ${row('Shop', selectedShop.shop)}
          ${row('Shop ID', selectedShop.api_shop_id)}
          ${row('Token shop', selectedShop.has_access_token ? 'Có access token' : 'Thiếu access token')}
        </div>
        ${selectedShop.config_warning ? `<span class="diag-badge warn">${escapeHtml(selectedShop.config_warning)}</span>` : ''}
        <p>${escapeHtml(data.environment?.api_access_log_hint || '')}</p>
      </section>
      ${renderApp('Ads app', data.ads_app)}
      ${renderApp('Marketplace app', data.marketplace_app)}
      ${renderApp('Chat/Customer Service app', data.chat_app)}
      <section class="diag-card">
        <h2>Redirect URL và Sensitive Data</h2>
        <div class="diag-list">
          ${(data.redirect_url_checks || []).map(item => row(`${item.client_type} redirect`, `${item.pass ? 'PASS' : 'FAIL'} - ${item.message}`)).join('')}
          ${(data.sensitive_data_impact || []).map(item => row(item.feature, item.impact)).join('')}
        </div>
      </section>
      ${renderTests(data.tests || [])}
    `
  }

  async function loadCurrentUser() {
    const current = await window.SHV_AUTH?.getCurrentUser?.()
    if (currentUserEl) currentUserEl.textContent = current ? `${current.username} - ${current.role_label || current.role}` : ''
  }

  async function runDiagnostics(event) {
    event.preventDefault()
    setStatus('Đang gọi Shopee diagnostics bằng token admin hiện tại...')
    resultEl.innerHTML = ''
    // Diagnostics chỉ gọi endpoint đọc dữ liệu để kiểm chứng app, token và quyền; thao tác ghi live vẫn bị khóa ở luồng riêng.
    const data = await api('/api/admin/shopee/diagnostics', {
      shop: document.getElementById('diagShop')?.value || '',
      item_id: document.getElementById('diagItemId')?.value || '',
      order_sn: document.getElementById('diagOrderSn')?.value || ''
    })
    renderDiagnostics(data)
    const failCount = Number(data.summary?.fail_count || 0)
    setStatus(failCount ? `Diagnostics xong, còn ${failCount.toLocaleString('vi-VN')} endpoint FAIL.` : 'Diagnostics xong, tất cả probe đều PASS.', failCount ? 'error' : '')
  }

  form.addEventListener('submit', event => {
    runDiagnostics(event).catch(error => setStatus(error.message || 'Không chạy được diagnostics.', 'error'))
  })
  loadCurrentUser().catch(() => {})
})()
