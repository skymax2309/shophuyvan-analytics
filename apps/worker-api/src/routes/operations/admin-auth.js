const SESSION_DAYS = 7
const HASH_ITERATIONS = 6000

const ROLE_DEFINITIONS = {
  admin: {
    label: 'Quản trị cao nhất',
    description: 'Toàn quyền cấu hình hệ thống, API, tài khoản và dữ liệu.',
    permissions: ['*']
  },
  manager: {
    label: 'Quản lý vận hành',
    description: 'Xem dashboard, đồng bộ dữ liệu, quản lý sản phẩm, đơn hàng và báo cáo.',
    permissions: [
      'dashboard.read',
      'orders.read',
      'orders.sync',
      'products.read',
      'products.write',
      'reports.read',
      'reports.write',
      'chat.read',
      'chat.reply'
    ]
  },
  warehouse: {
    label: 'Thủ kho',
    description: 'Xử lý đơn, đóng gói, tem vận đơn, tồn kho và sản phẩm.',
    permissions: [
      'orders.read',
      'orders.fulfill',
      'products.read',
      'warehouse.read',
      'warehouse.write'
    ]
  },
  cskh: {
    label: 'Chăm sóc khách hàng',
    description: 'Xem đơn liên quan và trả lời khách hàng.',
    permissions: [
      'chat.read',
      'chat.reply',
      'orders.read',
      'products.read'
    ]
  },
  reviewer: {
    label: 'Shopee reviewer',
    description: 'Tài khoản kiểm duyệt: chỉ xem các màn hình chứng minh app/API, không cấp quyền quản trị.',
    permissions: [
      'dashboard.read',
      'orders.read',
      'products.read',
      'reports.read',
      'chat.read',
      'ads.read',
      'income.read'
    ]
  }
}

function json(data, status = 200, cors = {}) {
  return Response.json(data, {
    status,
    headers: {
      ...cors,
      'Cache-Control': 'no-store'
    }
  })
}

function badRequest(message, cors) {
  return json({ ok: false, error: message }, 400, cors)
}

function unauthorized(cors) {
  return json({ ok: false, error: 'Chưa đăng nhập hoặc phiên đã hết hạn.' }, 401, cors)
}

function forbidden(cors) {
  return json({ ok: false, error: 'Tài khoản không có quyền thao tác mục này.' }, 403, cors)
}

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase()
  return ROLE_DEFINITIONS[value] ? value : 'reviewer'
}

function sanitizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

function sanitizeUser(row) {
  if (!row) return null
  const role = normalizeRole(row.role)
  return {
    id: row.id,
    username: row.username,
    role,
    role_label: ROLE_DEFINITIONS[role].label,
    permissions: ROLE_DEFINITIONS[role].permissions,
    license_expire_at: row.license_expire_at || '',
    created_at: row.created_at || ''
  }
}

function hasPermission(user, permission) {
  if (!user) return false
  const role = normalizeRole(user.role)
  const permissions = ROLE_DEFINITIONS[role]?.permissions || []
  return permissions.includes('*') || permissions.includes(permission)
}

function randomBytes(length) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

function base64UrlEncode(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64UrlDecode(value) {
  const padded = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  const normalized = padded.padEnd(Math.ceil(padded.length / 4) * 4, '=')
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function sha256Text(value) {
  const bytes = new TextEncoder().encode(String(value || ''))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return base64UrlEncode(new Uint8Array(hash))
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = await iterativeSha256(password, salt, HASH_ITERATIONS)
  return `sha256i$${HASH_ITERATIONS}$${base64UrlEncode(salt)}$${base64UrlEncode(hash)}`
}

async function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split('$')
  if (parts.length !== 4) return false
  const iterations = Number.parseInt(parts[1], 10)
  if (!Number.isFinite(iterations) || iterations < 1000) return false
  const salt = base64UrlDecode(parts[2])
  const expected = base64UrlDecode(parts[3])
  if (parts[0] === 'sha256i') {
    const actual = await iterativeSha256(password, salt, iterations)
    return timingSafeEqual(actual, expected)
  }
  if (parts[0] === 'pbkdf2') {
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(String(password || '')),
        'PBKDF2',
        false,
        ['deriveBits']
      )
      const bits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt,
          iterations,
          hash: 'SHA-256'
        },
        key,
        expected.length * 8
      )
      return timingSafeEqual(new Uint8Array(bits), expected)
    } catch {
      return false
    }
  }
  return false
}

async function iterativeSha256(password, salt, iterations) {
  const passwordBytes = new TextEncoder().encode(String(password || ''))
  let input = new Uint8Array(salt.length + passwordBytes.length)
  input.set(salt, 0)
  input.set(passwordBytes, salt.length)
  let digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input))
  for (let i = 1; i < iterations; i++) {
    input = new Uint8Array(digest.length + salt.length + passwordBytes.length)
    input.set(digest, 0)
    input.set(salt, digest.length)
    input.set(passwordBytes, digest.length + salt.length)
    digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input))
  }
  return digest
}

async function ensureAuthTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      license_expire_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_agent TEXT DEFAULT '',
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `).run()
}

function sessionTokenFromRequest(request) {
  const auth = request.headers.get('Authorization') || ''
  const match = auth.match(/^Bearer\s+(.+)$/i)
  if (match) return match[1].trim()
  return request.headers.get('X-Admin-Session') || ''
}

export async function getAdminUserFromRequest(request, env) {
  await ensureAuthTables(env)
  const token = sessionTokenFromRequest(request)
  if (!token) return null
  const tokenHash = await sha256Text(token)
  const row = await env.DB.prepare(`
    SELECT users.id, users.username, users.role, users.license_expire_at, users.created_at
    FROM app_sessions
    JOIN users ON users.id = app_sessions.user_id
    WHERE app_sessions.token_hash = ?
      AND datetime(app_sessions.expires_at) > datetime('now')
    LIMIT 1
  `).bind(tokenHash).first()
  if (!row) return null
  await env.DB.prepare(`
    UPDATE app_sessions
    SET last_seen_at = datetime('now')
    WHERE token_hash = ?
  `).bind(tokenHash).run()
  return sanitizeUser(row)
}

export async function requireAdminPermission(request, env, permission) {
  const user = await getAdminUserFromRequest(request, env)
  if (!hasPermission(user, permission)) return { user: null, allowed: false }
  return { user, allowed: true }
}

async function createSession(request, env, userId) {
  const token = base64UrlEncode(randomBytes(32))
  const tokenHash = await sha256Text(token)
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const userAgent = (request.headers.get('User-Agent') || '').slice(0, 240)
  await env.DB.prepare(`
    INSERT INTO app_sessions (token_hash, user_id, expires_at, user_agent)
    VALUES (?, ?, ?, ?)
  `).bind(tokenHash, userId, expiresAt, userAgent).run()
  return { token, expires_at: expiresAt }
}

async function login(request, env, cors) {
  const body = await request.json().catch(() => ({}))
  const username = sanitizeUsername(body.username)
  const password = String(body.password || '')
  if (!username || !password) return badRequest('Thiếu tài khoản hoặc mật khẩu.', cors)

  await ensureAuthTables(env)
  const row = await env.DB.prepare(`
    SELECT id, username, password_hash, role, license_expire_at, created_at
    FROM users
    WHERE lower(username) = ?
    LIMIT 1
  `).bind(username).first()
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return json({ ok: false, error: 'Sai tài khoản hoặc mật khẩu.' }, 401, cors)
  }

  const session = await createSession(request, env, row.id)
  return json({
    ok: true,
    token: session.token,
    expires_at: session.expires_at,
    user: sanitizeUser(row),
    roles: ROLE_DEFINITIONS
  }, 200, cors)
}

async function logout(request, env, cors) {
  await ensureAuthTables(env)
  const token = sessionTokenFromRequest(request)
  if (token) {
    const tokenHash = await sha256Text(token)
    await env.DB.prepare(`DELETE FROM app_sessions WHERE token_hash = ?`).bind(tokenHash).run()
  }
  return json({ ok: true }, 200, cors)
}

async function me(request, env, cors) {
  const user = await getAdminUserFromRequest(request, env)
  if (!user) return unauthorized(cors)
  return json({ ok: true, user, roles: ROLE_DEFINITIONS }, 200, cors)
}

async function listUsers(request, env, cors) {
  const currentUser = await getAdminUserFromRequest(request, env)
  if (!hasPermission(currentUser, '*')) return forbidden(cors)

  const { results } = await env.DB.prepare(`
    SELECT id, username, role, license_expire_at, created_at
    FROM users
    ORDER BY created_at DESC, username ASC
  `).all()
  return json({ ok: true, users: results.map(sanitizeUser), roles: ROLE_DEFINITIONS }, 200, cors)
}

async function createUser(request, env, cors) {
  const currentUser = await getAdminUserFromRequest(request, env)
  if (!hasPermission(currentUser, '*')) return forbidden(cors)

  const body = await request.json().catch(() => ({}))
  const username = sanitizeUsername(body.username)
  const password = String(body.password || '')
  const role = normalizeRole(body.role)
  const licenseExpireAt = String(body.license_expire_at || '').trim() || null
  if (!username || username.length < 3) return badRequest('Username phải có ít nhất 3 ký tự.', cors)
  if (!password || password.length < 10) return badRequest('Mật khẩu phải có ít nhất 10 ký tự.', cors)

  const id = crypto.randomUUID()
  const passwordHash = await hashPassword(password)
  try {
    await env.DB.prepare(`
      INSERT INTO users (id, username, password_hash, role, license_expire_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, username, passwordHash, role, licenseExpireAt).run()
  } catch (error) {
    if (String(error?.message || '').includes('UNIQUE')) return badRequest('Username đã tồn tại.', cors)
    throw error
  }

  const created = await env.DB.prepare(`
    SELECT id, username, role, license_expire_at, created_at FROM users WHERE id = ?
  `).bind(id).first()
  return json({ ok: true, user: sanitizeUser(created) }, 201, cors)
}

async function updateUser(request, env, cors) {
  const currentUser = await getAdminUserFromRequest(request, env)
  if (!hasPermission(currentUser, '*')) return forbidden(cors)

  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '').trim()
  if (!id) return badRequest('Thiếu user id.', cors)

  const existing = await env.DB.prepare(`
    SELECT id, username, role, license_expire_at, created_at FROM users WHERE id = ?
  `).bind(id).first()
  if (!existing) return json({ ok: false, error: 'Không tìm thấy tài khoản.' }, 404, cors)

  const role = body.role !== undefined ? normalizeRole(body.role) : normalizeRole(existing.role)
  const licenseExpireAt = body.license_expire_at !== undefined
    ? (String(body.license_expire_at || '').trim() || null)
    : (existing.license_expire_at || null)

  await env.DB.prepare(`
    UPDATE users
    SET role = ?, license_expire_at = ?
    WHERE id = ?
  `).bind(role, licenseExpireAt, id).run()

  if (body.password) {
    const password = String(body.password || '')
    if (password.length < 10) return badRequest('Mật khẩu mới phải có ít nhất 10 ký tự.', cors)
    const passwordHash = await hashPassword(password)
    await env.DB.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(passwordHash, id).run()
    await env.DB.prepare(`DELETE FROM app_sessions WHERE user_id = ?`).bind(id).run()
  }

  const updated = await env.DB.prepare(`
    SELECT id, username, role, license_expire_at, created_at FROM users WHERE id = ?
  `).bind(id).first()
  return json({ ok: true, user: sanitizeUser(updated) }, 200, cors)
}

async function deleteUser(request, env, cors) {
  const currentUser = await getAdminUserFromRequest(request, env)
  if (!hasPermission(currentUser, '*')) return forbidden(cors)

  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '').trim()
  if (!id) return badRequest('Thiếu user id.', cors)
  if (currentUser.id === id) return badRequest('Không thể tự xóa tài khoản đang đăng nhập.', cors)

  await env.DB.prepare(`DELETE FROM app_sessions WHERE user_id = ?`).bind(id).run()
  await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(id).run()
  return json({ ok: true }, 200, cors)
}

export async function handleAdminAuth(request, env, url, cors) {
  await ensureAuthTables(env)

  if (url.pathname === '/api/admin/auth/login' && request.method === 'POST') {
    return login(request, env, cors)
  }
  if (url.pathname === '/api/admin/auth/logout' && request.method === 'POST') {
    return logout(request, env, cors)
  }
  if (url.pathname === '/api/admin/auth/me' && request.method === 'GET') {
    return me(request, env, cors)
  }
  if (url.pathname === '/api/admin/roles' && request.method === 'GET') {
    return json({ ok: true, roles: ROLE_DEFINITIONS }, 200, cors)
  }
  if (url.pathname === '/api/admin/users' && request.method === 'GET') {
    return listUsers(request, env, cors)
  }
  if (url.pathname === '/api/admin/users' && request.method === 'POST') {
    return createUser(request, env, cors)
  }
  if (url.pathname === '/api/admin/users' && request.method === 'PATCH') {
    return updateUser(request, env, cors)
  }
  if (url.pathname === '/api/admin/users' && request.method === 'DELETE') {
    return deleteUser(request, env, cors)
  }

  return json({ ok: false, error: 'Admin route not found.' }, 404, cors)
}
