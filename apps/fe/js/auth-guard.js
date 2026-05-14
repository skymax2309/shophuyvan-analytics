(function () {
  const API = window.SHV_API || 'https://huyvan-worker-api.nghiemchihuy.workers.dev'
  const TOKEN_KEY = 'shv_admin_token'
  const USER_KEY = 'shv_admin_user'
  const ACCOUNT_WIDGET_ID = 'shvAccountWidget'
  const REVIEWER_READONLY_MESSAGE = 'Tài khoản reviewer chỉ được xem dữ liệu, không được tạo/sửa/xóa/đồng bộ/gửi lên sàn.'
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
  const REVIEWER_BLOCKED_SELECTORS = [
    '#btnPrepare',
    '#btnPacked',
    '#btnHandedOver',
    '#btnAcceptBuyerCancel',
    '#btnRejectBuyerCancel',
    '#btnLabelSettings',
    '#connectShopeeBtn',
    '#chkAll',
    'input[type="file"]',
    'input[type="checkbox"][onchange*="toggleAllCheck"]',
    'input[type="checkbox"][onchange*="onCheck"]',
    'input[type="checkbox"].row-check',
    'input[type="checkbox"].order-check',
    'button[onclick*="markPrepare"]',
    'button[onclick*="markPacked"]',
    'button[onclick*="markHandedOver"]',
    'button[onclick*="decideBuyerCancellation"]',
    'button[onclick*="openApiAuthModal"]',
    'button[onclick*="openLabelSettings"]',
    'button[onclick*="openBotSettings"]',
    'button[onclick*="triggerBot"]',
    'button[onclick*="syncOrders"]',
    'button[onclick*="delete"]',
    'button[onclick*="save"]',
    'button[onclick*="upload"]',
    'button[onclick*="parse"]',
    'button[onclick*="refresh"]',
    'button[onclick*="disconnect"]',
    'button[onclick*="send"]',
    'button[onclick*="window.print"]',
    'a[href*="/api/auth/"]'
  ]
  const REVIEWER_BLOCKED_GLOBALS = [
    'markPrepare',
    'markPacked',
    'markHandedOver',
    'decideBuyerCancellation',
    'openApiAuthModal',
    'openLabelSettings',
    'openBotSettings',
    'triggerBotStatus',
    'triggerBotScrape',
    'syncOrders',
    'saveShopeeApiConfig',
    'connectShopeeApi',
    'connectShopeeSelected',
    'refreshShopeeToken',
    'refreshShopeeSelected',
    'disconnectShopeeApi',
    'disconnectShopeeSelected',
    'parseInvoice',
    'saveInvoice',
    'saveCostPrice',
    'uploadReport',
    'createJob',
    'updateJob',
    'deleteJob'
  ]

  const PAGE_ROLES = {
    'profit-dashboard.html': ['admin', 'manager', 'cskh', 'reviewer'],
    // Trang ADS tách riêng nhưng vẫn dùng cùng quyền vận hành như dashboard doanh thu.
    'ads.html': ['admin', 'manager', 'cskh', 'reviewer'],
    // Trang chat sàn tách riêng vẫn dùng cùng nhóm quyền như dashboard CSKH.
    'chat-marketplace.html': ['admin', 'manager', 'cskh', 'reviewer'],
    // Trang đánh giá là luồng CSKH/API read-first; reviewer chỉ xem, admin/manager/CSKH mới thao tác.
    'reviews.html': ['admin', 'manager', 'cskh', 'reviewer'],
    // Trang cầu nối tool Zalo cũng chỉ cho nhóm vận hành truy cập.
    'chat-zalo.html': ['admin', 'manager', 'cskh', 'reviewer'],
    'shopee-review.html': ['admin', 'manager', 'reviewer'],
    'oms-dashboard.html': ['admin', 'manager', 'warehouse', 'reviewer'],
    'admin-products.html': ['admin', 'manager', 'warehouse', 'reviewer'],
    'product-detail.html': ['admin', 'manager', 'warehouse', 'reviewer'],
    'sku.html': ['admin', 'manager', 'warehouse'],
    'report-upload.html': ['admin', 'manager', 'reviewer'],
    'cost-settings.html': ['admin'],
    'admin-purchase.html': ['admin', 'manager', 'warehouse'],
    'import-sku-tool.html': ['admin', 'manager', 'warehouse'],
    'cctv_packing.html': ['admin', 'manager', 'warehouse'],
    'dashboard_video.html': ['admin', 'manager', 'warehouse', 'reviewer'],
    'admin-users.html': ['admin']
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || ''
  }

  function setSession(token, user) {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
    } catch {
      return null
    }
  }

  function loginUrl() {
    return `login.html?next=${encodeURIComponent(window.location.href)}`
  }

  function getPageName() {
    const path = window.location.pathname || ''
    const name = path.split('/').pop() || 'profit-dashboard.html'
    return name.includes('.') ? name : `${name}.html`
  }

  function isApiUrl(input) {
    const url = typeof input === 'string' ? input : input?.url || ''
    return String(url).startsWith(API)
  }

  function getRequestMethod(input, init = {}) {
    return String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase()
  }

  function getApiPath(input) {
    const raw = typeof input === 'string' ? input : input?.url || ''
    try {
      return new URL(raw, window.location.href).pathname
    } catch {
      return ''
    }
  }

  function isAuthMutationPath(path) {
    return path === '/api/admin/auth/logout' || path === '/api/admin/auth/login'
  }

  function readonlyResponse() {
    return new Response(JSON.stringify({ ok: false, error: REVIEWER_READONLY_MESSAGE }), {
      status: 403,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    })
  }

  const nativeFetch = window.fetch.bind(window)
  window.fetch = function (input, init = {}) {
    const token = getToken()
    if (!token || !isApiUrl(input)) return nativeFetch(input, init)

    const method = getRequestMethod(input, init)
    const path = getApiPath(input)
    const user = getStoredUser()
    if (user?.role === 'reviewer' && !SAFE_METHODS.has(method) && !isAuthMutationPath(path)) {
      return Promise.resolve(readonlyResponse())
    }

    const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers || {} : {}))
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
    return nativeFetch(input, { ...init, headers })
  }

  async function getCurrentUser() {
    const token = getToken()
    if (!token) return null
    const res = await nativeFetch(`${API}/api/admin/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    })
    if (!res.ok) {
      clearSession()
      return null
    }
    const data = await res.json()
    if (data?.user) setSession(token, data.user)
    return data?.user || null
  }

  function renderDenied(user, allowedRoles) {
    document.body.innerHTML = `
      <main class="auth-denied">
        <section>
          <h1>Không có quyền truy cập</h1>
          <p>Tài khoản <b>${escapeHtml(user?.username || '')}</b> đang là quyền <b>${escapeHtml(user?.role_label || user?.role || '')}</b>.</p>
          <p>Màn hình này chỉ dành cho: ${allowedRoles.map(escapeHtml).join(', ')}.</p>
          <div class="auth-denied-actions">
            <a href="profit-dashboard.html">Về dashboard</a>
            <button type="button" onclick="SHV_AUTH.logout()">Đăng xuất</button>
          </div>
        </section>
      </main>
    `
  }

  function injectAccountWidgetStyles() {
    if (document.getElementById('shv-account-widget-style')) return
    const style = document.createElement('style')
    style.id = 'shv-account-widget-style'
    style.textContent = `
      .shv-account-widget {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        max-width: 320px;
        padding: 5px 6px 5px 10px;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, .32);
        background: rgba(255, 255, 255, .88);
        color: #0f172a;
        box-shadow: 0 8px 24px rgba(15, 23, 42, .12);
        font-family: Inter, "Be Vietnam Pro", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        z-index: 2000;
      }
      .shv-account-widget .shv-account-main {
        display: grid;
        min-width: 0;
        line-height: 1.15;
      }
      .shv-account-widget .shv-account-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        font-weight: 800;
      }
      .shv-account-widget .shv-account-role {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 10px;
        font-weight: 700;
        color: #2563eb;
      }
      .shv-account-widget .shv-account-logout {
        border: 0;
        border-radius: 999px;
        padding: 6px 9px;
        background: #fee2e2;
        color: #b91c1c;
        font-size: 11px;
        font-weight: 900;
        cursor: pointer;
        white-space: nowrap;
      }
      .shv-account-widget .shv-account-logout:hover {
        background: #fecaca;
      }
      .topbar-right .shv-account-widget,
      .topbar .shv-account-widget,
      .admin-nav .shv-account-widget {
        margin-left: auto;
      }
      .sidebar-footer .shv-account-widget {
        width: 100%;
        max-width: none;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .shv-account-floating {
        position: fixed;
        top: 10px;
        right: 10px;
      }
      @media (max-width: 768px) {
        .shv-account-widget {
          max-width: 190px;
          padding-left: 8px;
        }
        .shv-account-widget .shv-account-role {
          display: none;
        }
        .shv-account-widget .shv-account-logout {
          padding: 6px 8px;
        }
      }
    `
    document.head.appendChild(style)
  }

  function accountMountPoint() {
    return document.querySelector('.topbar-right')
      || document.querySelector('.admin-nav')
      || document.querySelector('.topbar')
      || document.querySelector('.mobile-topbar')
      || document.querySelector('.sidebar-footer')
      || null
  }

  function renderAccountWidget(user) {
    if (!user || !document.body) return
    injectAccountWidgetStyles()

    const widget = document.getElementById(ACCOUNT_WIDGET_ID) || document.createElement('div')
    const roleLabel = user.role_label || user.role || 'user'
    widget.id = ACCOUNT_WIDGET_ID
    widget.className = 'shv-account-widget'
    widget.setAttribute('data-reviewer-allow', 'true')
    widget.innerHTML = `
      <div class="shv-account-main" title="${escapeHtml(user.username || '')} - ${escapeHtml(roleLabel)}">
        <span class="shv-account-name">${escapeHtml(user.username || '')}</span>
        <span class="shv-account-role">${escapeHtml(roleLabel)}</span>
      </div>
      <button class="shv-account-logout" type="button" data-reviewer-allow="true">Đăng xuất</button>
    `
    widget.querySelector('.shv-account-logout')?.addEventListener('click', event => {
      event.preventDefault()
      logout()
    })

    const mount = accountMountPoint()
    if (mount) {
      const existingLogout = mount.querySelector('button[onclick*="logout"], button[onclick*="SHV_AUTH.logout"]')
      if (existingLogout && existingLogout !== widget.querySelector('.shv-account-logout')) {
        mount.insertBefore(widget, existingLogout)
      } else if (widget.parentElement !== mount) {
        mount.appendChild(widget)
      }
      widget.classList.remove('shv-account-floating')
      return
    }

    widget.classList.add('shv-account-floating')
    if (widget.parentElement !== document.body) document.body.appendChild(widget)
  }

  function scheduleAccountWidget(user) {
    renderAccountWidget(user)
    document.addEventListener('DOMContentLoaded', () => renderAccountWidget(user), { once: true })
    window.addEventListener('load', () => renderAccountWidget(user), { once: true })
    setTimeout(() => renderAccountWidget(user), 600)
    setTimeout(() => renderAccountWidget(user), 1800)
  }

  function applyRoleVisibility(user) {
    if (!user) return
    if (user.role !== 'admin') {
      document.querySelectorAll('a[href*="admin-users"], a[href*="cost-settings"]').forEach(el => {
        el.style.display = 'none'
      })
    }
    if (user.role === 'reviewer') {
      document.querySelectorAll('button, input[type="file"]').forEach(el => {
        const text = (el.textContent || el.value || '').toLowerCase()
        const risky = /xóa|delete|cập nhật|đồng bộ|upload|parse|gửi|tạo|lưu|xuất excel|kéo đơn|auto/.test(text)
        if (risky) {
          el.disabled = true
          el.title = 'Tài khoản reviewer chỉ dùng để kiểm tra giao diện và dữ liệu đọc.'
        }
      })
    }
  }

  function scheduleRoleVisibility(user) {
    applyRoleVisibility(user)
    document.addEventListener('DOMContentLoaded', () => applyRoleVisibility(user), { once: true })
    window.addEventListener('load', () => applyRoleVisibility(user), { once: true })
    setTimeout(() => applyRoleVisibility(user), 600)
    setTimeout(() => applyRoleVisibility(user), 1800)
    setTimeout(() => applyRoleVisibility(user), 3500)
    if (user?.role === 'reviewer') {
      applyReviewerLockdown()
      document.addEventListener('DOMContentLoaded', applyReviewerLockdown, { once: true })
      window.addEventListener('load', applyReviewerLockdown, { once: true })
      setTimeout(applyReviewerLockdown, 600)
      setTimeout(applyReviewerLockdown, 1800)
      setTimeout(applyReviewerLockdown, 3500)
      observeReviewerMutations()
    }
  }

  function injectReviewerReadOnlyStyles() {
    if (document.getElementById('shv-reviewer-readonly-style')) return
    const style = document.createElement('style')
    style.id = 'shv-reviewer-readonly-style'
    style.textContent = `
      html[data-readonly-role="reviewer"] .reviewer-blocked {
        opacity: .48 !important;
        cursor: not-allowed !important;
        filter: grayscale(.25);
      }
      html[data-readonly-role="reviewer"] .reviewer-blocked * {
        pointer-events: none !important;
      }
      html[data-readonly-role="reviewer"] .reviewer-readonly-note {
        background: #fff7ed;
        border: 1px solid #fed7aa;
        color: #9a3412;
        border-radius: 8px;
        padding: 10px 12px;
        font-weight: 700;
        margin: 8px 0 12px;
      }
    `
    document.head.appendChild(style)
  }

  function shouldBlockReviewerElement(el) {
    if (!el || el.closest('[data-reviewer-allow="true"]')) return false
    if (el.closest('.mobile-menu-btn, .modal-close, .auth-denied-actions')) return false
    if (el.matches('button[onclick*="SHV_AUTH.logout"], button[data-action="logout"]')) return false
    if (el.matches('button[onclick*="closeModal"], button[onclick*="resetFilter"]')) return false
    if (el.matches('input, select, textarea') && !el.matches('input[type="file"], input[type="checkbox"][onchange*="toggleAllCheck"], input[type="checkbox"][onchange*="onCheck"], input.row-check, input.order-check, #chkAll')) {
      return false
    }
    return REVIEWER_BLOCKED_SELECTORS.some(selector => {
      try {
        return el.matches(selector) || !!el.closest(selector)
      } catch {
        return false
      }
    })
  }

  function lockReviewerControls() {
    REVIEWER_BLOCKED_SELECTORS.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        if (!shouldBlockReviewerElement(el)) return
        el.classList.add('reviewer-blocked')
        el.setAttribute('aria-disabled', 'true')
        el.title = REVIEWER_READONLY_MESSAGE
        if ('disabled' in el) el.disabled = true
        if (el.tagName === 'A') {
          el.dataset.originalHref = el.dataset.originalHref || el.getAttribute('href') || ''
          el.removeAttribute('href')
          el.setAttribute('role', 'button')
          el.setAttribute('tabindex', '-1')
        }
      })
    })
  }

  function applyReviewerLockdown() {
    document.documentElement.dataset.readonlyRole = 'reviewer'
    injectReviewerReadOnlyStyles()
    lockReviewerControls()
    installReviewerActionGuards()
  }

  function observeReviewerMutations() {
    if (window.__shvReviewerObserver) return
    window.__shvReviewerObserver = new MutationObserver(() => lockReviewerControls())
    window.__shvReviewerObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    })
  }

  function showReviewerBlockedMessage() {
    if (window.toast && typeof window.toast === 'function') {
      window.toast(REVIEWER_READONLY_MESSAGE, 'error')
      return
    }
    window.alert(REVIEWER_READONLY_MESSAGE)
  }

  function installReviewerActionGuards() {
    if (window.__shvReviewerActionGuardInstalled) return
    window.__shvReviewerActionGuardInstalled = true

    const block = () => {
      showReviewerBlockedMessage()
      return false
    }
    const wrapGlobals = () => {
      REVIEWER_BLOCKED_GLOBALS.forEach(name => {
        const fn = window[name]
        if (typeof fn !== 'function' || fn.__reviewerBlocked) return
        const wrapped = function () {
          return block()
        }
        wrapped.__reviewerBlocked = true
        wrapped.__original = fn
        window[name] = wrapped
      })
    }

    wrapGlobals()
    setTimeout(wrapGlobals, 600)
    setTimeout(wrapGlobals, 1800)
    setTimeout(wrapGlobals, 3500)

    document.addEventListener('click', event => {
      const el = event.target?.closest?.('button, a, input[type="file"], input[type="checkbox"]')
      if (!shouldBlockReviewerElement(el)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      showReviewerBlockedMessage()
    }, true)
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  async function requireAuth() {
    const page = getPageName()
    const allowedRoles = PAGE_ROLES[page]
    if (!allowedRoles) return null

    const user = await getCurrentUser()
    if (!user) {
      window.location.replace(loginUrl())
      return null
    }
    if (!allowedRoles.includes(user.role)) {
      renderDenied(user, allowedRoles)
      return null
    }
    document.documentElement.dataset.userRole = user.role
    document.documentElement.dataset.username = user.username
    scheduleAccountWidget(user)
    scheduleRoleVisibility(user)
    return user
  }

  async function logout() {
    const token = getToken()
    if (token) {
      await nativeFetch(`${API}/api/admin/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => null)
    }
    clearSession()
    window.location.href = loginUrl()
  }

  window.SHV_AUTH = {
    API,
    TOKEN_KEY,
    USER_KEY,
    getToken,
    setSession,
    clearSession,
    getStoredUser,
    getCurrentUser,
    requireAuth,
    logout,
    rolesForPage: PAGE_ROLES
  }

  if (getPageName() !== 'login.html') {
    requireAuth()
  }
})()
