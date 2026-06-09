import { notificationStatus, savePushSubscription, disablePushSubscription, sendWebPushPing, sendPushToEnabledSubscribers, normalizePushPayload } from '../core/push-notification-core.js'
import { sendJson } from './settings.js'

async function readBody(request) {
  return request.json().catch(() => ({}))
}

export async function handleNotificationsRoute(request, env, params = {}) {
  if (params.status && request.method === 'GET') {
    return sendJson(await notificationStatus(env))
  }
  if (params.subscribe && request.method === 'POST') {
    const body = await readBody(request)
    const result = await savePushSubscription(env, body, { user_agent: request.headers.get('User-Agent') || '' })
    if (result.ok && body.test !== false) {
      const subscription = body.subscription || body
      const test = await sendWebPushPing(env, { id: result.subscription_id, ...subscription })
      return sendJson({ ...result, test_push: test })
    }
    return sendJson(result, result.ok === false ? 400 : 200)
  }
  if (params.unsubscribe && request.method === 'POST') {
    return sendJson(await disablePushSubscription(env, await readBody(request)))
  }
  if (params.test && request.method === 'POST') {
    const body = await readBody(request)
    const subscription = body.subscription || body
    const payload = normalizePushPayload(body.payload || {
      type: 'chat',
      title: 'Zalo · Khách test thông báo',
      body: 'ok - thông báo test có đủ tên sàn, người gửi và nội dung.',
      channel: 'zalo',
      channel_label: 'Zalo',
      sender_name: 'Khách test thông báo',
      message_text: 'ok - thông báo test có đủ tên sàn, người gửi và nội dung.',
      url: '/pages/chat-cskh.html'
    })
    if (subscription.endpoint) return sendJson(await sendWebPushPing(env, subscription, payload))
    return sendJson(await sendPushToEnabledSubscribers(env, { payload }))
  }
  return sendJson({ ok: false, error_code: 'method_not_allowed', error_message: 'Route thông báo không hỗ trợ thao tác này.' }, 405)
}
