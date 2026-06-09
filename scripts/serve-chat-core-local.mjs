import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import chatWorker from '../apps/chat-worker-api/src/index.js'
import { saveConversation } from '../apps/chat-worker-api/src/core/conversation-core.js'
import { mergeMessageIntoStore } from '../apps/chat-worker-api/src/core/message-merge.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const feRoot = path.join(repoRoot, 'apps', 'fe')
const port = Number(process.env.CHAT_CORE_LOCAL_PORT || 8789)
const sendDelayMs = Number(process.env.CHAT_CORE_SEND_DELAY_MS || 900)
const env = {}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
}

async function seedLocalData() {
  const now = new Date().toISOString()
  const shopee = await saveConversation(env, {
    id: 'conv_shopee_demo',
    channel: 'shopee',
    shop_id: 'chihuy2309',
    customer_id: 'khach_demo_shopee',
    platform_conversation_id: 'shopee-demo-001',
    last_message_text: 'Khách hỏi tình trạng đơn.',
    last_message_at: now,
    shop_chat_mode: 'api',
    send_capability: 'bridge',
    sync_capability: 'polling_api',
    status: 'open'
  })
  await mergeMessageIntoStore(env, {
    id: 'msg_shopee_customer_1',
    channel: 'shopee',
    shop_id: shopee.shop_id,
    conversation_id: shopee.id,
    customer_id: shopee.customer_id,
    sender_type: 'customer',
    sender_name: 'Khách Shopee',
    text: 'Shop kiểm tra giúp mình đơn này còn giao không ạ?',
    status: 'synced',
    platform_message_id: 'shopee-platform-1',
    created_at: now,
    updated_at: now,
    source: 'local_seed'
  })

  const internal = await saveConversation(env, {
    id: 'conv_internal_demo',
    channel: 'internal',
    shop_id: 'noi_bo',
    customer_id: 'ghi_chu_noi_bo',
    platform_conversation_id: 'internal-demo-001',
    last_message_text: 'Hội thoại nội bộ dùng kiểm tra trạng thái sent.',
    last_message_at: new Date(Date.now() - 60000).toISOString(),
    shop_chat_mode: 'manual',
    send_capability: 'manual_only',
    sync_capability: 'manual_import',
    status: 'open'
  })
  await mergeMessageIntoStore(env, {
    id: 'msg_internal_customer_1',
    channel: 'internal',
    shop_id: internal.shop_id,
    conversation_id: internal.id,
    customer_id: internal.customer_id,
    sender_type: 'customer',
    sender_name: 'Nội bộ',
    text: 'Tin nội bộ để kiểm tra gửi thành công local.',
    status: 'synced',
    platform_message_id: 'internal-platform-1',
    created_at: internal.last_message_at,
    updated_at: internal.last_message_at,
    source: 'local_seed'
  })
}

function localAuthResponse() {
  return Response.json({
    ok: true,
    user: {
      username: 'codex-local-cskh',
      role: 'cskh',
      role_label: 'CSKH'
    }
  }, { headers: { 'Cache-Control': 'no-store' } })
}

async function serveStatic(url) {
  const pathname = url.pathname === '/' ? '/pages/chat-cskh.html' : decodeURIComponent(url.pathname)
  const target = path.resolve(feRoot, pathname.replace(/^\/+/, ''))
  if (!target.startsWith(feRoot)) return new Response('Forbidden', { status: 403 })
  try {
    const body = await fs.readFile(target)
    return new Response(body, {
      headers: {
        'Content-Type': MIME[path.extname(target)] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      }
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

async function handleNodeRequest(req, res) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const body = chunks.length ? Buffer.concat(chunks) : undefined
  const url = new URL(req.url, `http://127.0.0.1:${port}`)

  let response
  if (url.pathname === '/__codex_prime') {
    const next = url.searchParams.get('next') || '/pages/chat-cskh.html'
    response = new Response(`<!doctype html><script>
      localStorage.setItem('shv_admin_token', 'local-test');
      localStorage.setItem('shv_admin_user', JSON.stringify({ username: 'codex-local-cskh', role: 'cskh', role_label: 'CSKH' }));
      location.replace(${JSON.stringify(next)});
    </script>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  } else if (url.pathname === '/api/admin/auth/me') {
    response = localAuthResponse()
  } else if (url.pathname === '/api/admin/auth/logout') {
    response = Response.json({ ok: true })
  } else if (url.pathname.startsWith('/api/chat/')) {
    if (url.pathname === '/api/chat/messages/send' && req.method === 'POST' && sendDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, sendDelayMs))
    }
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: body && body.length ? body : undefined,
      duplex: body && body.length ? 'half' : undefined
    })
    response = await chatWorker.fetch(request, env)
  } else {
    response = await serveStatic(url)
  }

  res.writeHead(response.status, Object.fromEntries(response.headers.entries()))
  const arrayBuffer = await response.arrayBuffer()
  res.end(Buffer.from(arrayBuffer))
}

await seedLocalData()

const server = http.createServer((req, res) => {
  handleNodeRequest(req, res).catch(error => {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: false, error: String(error?.message || error) }))
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Chat Core local: http://127.0.0.1:${port}/pages/chat-cskh.html`)
})
