(function () {
  const API = window.SHV_API || 'https://huyvan-worker-api.nghiemchihuy.workers.dev'
  const TOKEN_KEY = 'shv_admin_token'
  const USER_KEY = 'shv_admin_user'

  const form = document.getElementById('loginForm')
  const message = document.getElementById('loginMessage')
  const usernameInput = document.getElementById('username')
  const passwordInput = document.getElementById('password')

  function setMessage(text, type = '') {
    message.textContent = text || ''
    message.className = `auth-message ${type}`.trim()
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  function nextUrl(user) {
    const params = new URLSearchParams(window.location.search)
    const next = params.get('next')
    if (next) return next
    if (user?.role === 'warehouse') return 'oms-dashboard.html'
    // CSKH vào thẳng trang chat sàn riêng để thao tác tập trung.
    if (user?.role === 'cskh') return 'chat-marketplace.html'
    // Reviewer của Shopee cần vào trang chứng minh tích hợp ngay sau khi đăng nhập.
    if (user?.role === 'reviewer') return 'shopee-review.html'
    if (user?.role === 'admin') return 'admin-users.html'
    return 'profit-dashboard.html'
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function renderExistingSession(user) {
    if (!user) return
    let panel = document.getElementById('existingSessionPanel')
    if (!panel) {
      panel = document.createElement('div')
      panel.id = 'existingSessionPanel'
      panel.className = 'existing-session-panel'
      form.parentElement.insertBefore(panel, form)
    }
    const roleLabel = user.role_label || user.role || 'user'
    panel.innerHTML = `
      <div>
        <b>${escapeHtml(user.username || '')}</b>
        <span>${escapeHtml(roleLabel)}</span>
      </div>
      <div class="existing-session-actions">
        <button type="button" class="btn btn-primary btn-small" data-action="continue">Tiếp tục</button>
        <button type="button" class="btn btn-danger btn-small" data-action="logout">Đăng xuất</button>
      </div>
    `
    panel.querySelector('[data-action="continue"]').addEventListener('click', () => {
      window.location.href = nextUrl(user)
    })
    panel.querySelector('[data-action="logout"]').addEventListener('click', logoutExistingSession)
  }

  function removeExistingSessionPanel() {
    document.getElementById('existingSessionPanel')?.remove()
  }

  async function logoutExistingSession() {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      await fetch(`${API}/api/admin/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => null)
    }
    clearSession()
    removeExistingSessionPanel()
    setMessage('Đã đăng xuất phiên hiện tại.', 'ok')
  }

  async function login(event) {
    event.preventDefault()
    const username = usernameInput.value.trim()
    const password = passwordInput.value
    if (!username || !password) {
      setMessage('Vui lòng nhập đủ tài khoản và mật khẩu.', 'error')
      return
    }

    setMessage('Đang đăng nhập...')
    const submit = form.querySelector('button[type="submit"]')
    submit.disabled = true
    try {
      const res = await fetch(`${API}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Không đăng nhập được.')
      }
      localStorage.setItem(TOKEN_KEY, data.token)
      localStorage.setItem(USER_KEY, JSON.stringify(data.user))
      setMessage('Đăng nhập thành công.', 'ok')
      window.location.href = nextUrl(data.user)
    } catch (error) {
      setMessage(error.message || 'Không đăng nhập được.', 'error')
    } finally {
      submit.disabled = false
    }
  }

  async function checkExistingSession() {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return
    try {
      const res = await fetch(`${API}/api/admin/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      })
      const data = await res.json()
      if (res.ok && data?.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(data.user))
        setMessage('Đang có phiên đăng nhập.', 'ok')
        renderExistingSession(data.user)
      }
    } catch {
      clearSession()
      removeExistingSessionPanel()
    }
  }

  form.addEventListener('submit', login)
  checkExistingSession()
})()
