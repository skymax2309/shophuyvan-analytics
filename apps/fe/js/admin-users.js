(function () {
  const API = window.SHV_AUTH?.API || 'https://huyvan-worker-api.nghiemchihuy.workers.dev'
  let roles = {}
  let users = []

  const roleSelect = document.getElementById('role')
  const userTable = document.getElementById('usersTable')
  const createForm = document.getElementById('createUserForm')
  const message = document.getElementById('adminMessage')
  const currentUserEl = document.getElementById('currentUser')
  const roleList = document.getElementById('roleList')

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function setMessage(text, type = '') {
    message.textContent = text || ''
    message.className = `auth-message ${type}`.trim()
  }

  async function api(path, options = {}) {
    const token = window.SHV_AUTH?.getToken()
    const headers = new Headers(options.headers || {})
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    const res = await fetch(`${API}${path}`, { ...options, headers, cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${res.status}`)
    return data
  }

  function renderRoleOptions() {
    const options = Object.entries(roles)
      .map(([key, role]) => `<option value="${escapeHtml(key)}">${escapeHtml(role.label || key)}</option>`)
      .join('')
    roleSelect.innerHTML = options
  }

  function renderRoles() {
    roleList.innerHTML = Object.entries(roles).map(([key, role]) => `
      <div class="role-card">
        <b>${escapeHtml(role.label || key)}</b>
        <span>${escapeHtml(role.description || '')}</span>
        <span>Quyền: ${escapeHtml((role.permissions || []).join(', '))}</span>
      </div>
    `).join('')
  }

  function renderUsers() {
    if (!users.length) {
      userTable.innerHTML = `<tr><td colspan="5" style="color:#64748b">Chưa có tài khoản.</td></tr>`
      return
    }

    userTable.innerHTML = users.map(user => `
      <tr>
        <td>
          <b>${escapeHtml(user.username)}</b>
          <div style="color:#64748b;font-size:12px">${escapeHtml(user.id)}</div>
        </td>
        <td><span class="role-badge">${escapeHtml(user.role_label || user.role)}</span></td>
        <td>${escapeHtml(user.permissions?.join(', ') || '')}</td>
        <td>${escapeHtml(user.created_at || '')}</td>
        <td>
          <div class="table-actions">
            <select data-role-for="${escapeHtml(user.id)}">
              ${Object.entries(roles).map(([key, role]) => `
                <option value="${escapeHtml(key)}" ${key === user.role ? 'selected' : ''}>${escapeHtml(role.label || key)}</option>
              `).join('')}
            </select>
            <button class="btn btn-small btn-ghost" onclick="AdminUsers.updateRole('${escapeHtml(user.id)}')">Lưu quyền</button>
            <button class="btn btn-small btn-ghost" onclick="AdminUsers.resetPassword('${escapeHtml(user.id)}')">Đổi mật khẩu</button>
            <button class="btn btn-small btn-danger" onclick="AdminUsers.deleteUser('${escapeHtml(user.id)}')">Xóa</button>
          </div>
        </td>
      </tr>
    `).join('')
  }

  async function load() {
    setMessage('Đang tải tài khoản...')
    const current = await window.SHV_AUTH.getCurrentUser()
    if (currentUserEl) currentUserEl.textContent = current ? `${current.username} - ${current.role_label}` : ''
    const data = await api('/api/admin/users')
    roles = data.roles || {}
    users = data.users || []
    renderRoleOptions()
    renderRoles()
    renderUsers()
    setMessage(`Đã tải ${users.length} tài khoản.`, 'ok')
  }

  async function createUser(event) {
    event.preventDefault()
    const payload = {
      username: document.getElementById('username').value,
      password: document.getElementById('password').value,
      role: document.getElementById('role').value,
      license_expire_at: document.getElementById('licenseExpireAt').value
    }
    setMessage('Đang tạo tài khoản...')
    await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    createForm.reset()
    await load()
    setMessage('Đã tạo tài khoản.', 'ok')
  }

  async function updateRole(id) {
    const role = document.querySelector(`[data-role-for="${CSS.escape(id)}"]`)?.value
    if (!role) return
    await api('/api/admin/users', {
      method: 'PATCH',
      body: JSON.stringify({ id, role })
    })
    await load()
    setMessage('Đã cập nhật quyền.', 'ok')
  }

  async function resetPassword(id) {
    const password = window.prompt('Nhập mật khẩu mới, tối thiểu 10 ký tự:')
    if (!password) return
    if (password.length < 10) {
      setMessage('Mật khẩu mới phải có ít nhất 10 ký tự.', 'error')
      return
    }
    await api('/api/admin/users', {
      method: 'PATCH',
      body: JSON.stringify({ id, password })
    })
    setMessage('Đã đổi mật khẩu và thu hồi phiên đăng nhập cũ.', 'ok')
  }

  async function deleteUser(id) {
    if (!window.confirm('Xóa tài khoản này?')) return
    await api('/api/admin/users', {
      method: 'DELETE',
      body: JSON.stringify({ id })
    })
    await load()
    setMessage('Đã xóa tài khoản.', 'ok')
  }

  createForm.addEventListener('submit', event => {
    createUser(event).catch(error => setMessage(error.message || 'Lỗi tạo tài khoản.', 'error'))
  })

  window.AdminUsers = { updateRole, resetPassword, deleteUser, load }
  load().catch(error => setMessage(error.message || 'Không tải được tài khoản.', 'error'))
})()

