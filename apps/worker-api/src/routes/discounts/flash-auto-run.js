import { runFlashAuto } from '../../discounts/flash-auto-engine.js'

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

function normalizeShopIds(input = []) {
  if (!Array.isArray(input)) return []
  const list = []
  for (const item of input) {
    const shopId = cleanText(
      typeof item === 'string'
        ? item
        : (item?.shop_id || item?.shop || item?.id || item?.value)
    )
    if (shopId) list.push(shopId)
  }
  return Array.from(new Set(list))
}

function isPermissionMessage(text) {
  const message = cleanText(text)
  return message.includes('api_permission_missing') || message.includes('token_scope_missing')
}

function classifyBatchResult(result = {}) {
  if (isPermissionMessage(result.message)) return 'permission_denied'
  if (result?.skipped) return 'skipped'
  if (result?.live_write_sent && result?.verified) return 'success'
  if (result?.live_write_sent) return 'submitted'
  if (Number(result?.items_submitted || 0) > 0) return 'prepared'
  return 'failed'
}

export function installDiscountsFlashAutoRun(core) {
  const oldHandleDiscounts = core.handleDiscounts
  const getAdminUserFromRequest = core.getAdminUserFromRequest
  const isPromotionApplyAdmin = typeof core.isPromotionApplyAdmin === 'function'
    ? (...args) => core.isPromotionApplyAdmin(...args)
    : (user) => user?.role === 'admin'
  const json = (...args) => core.json(...args)

  core.handleDiscounts = async function handleFlashAutoRun(request, env, cors) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    if (url.pathname === '/api/discounts/flash-auto/run') {
      if (request.method !== 'POST') return json({ status: 'error', message: 'Phuong thuc khong ho tro.' }, cors, 405)
      const user = await getAdminUserFromRequest(request, env)
      if (!isPromotionApplyAdmin(user)) {
        return json({ status: 'error', error: 'admin_required', message: 'Chi tai khoan admin duoc chay Flash Sale that len san.' }, cors, 403)
      }
      const body = await request.json().catch(() => ({}))
      const shopId = cleanText(body.shop_id || body.shop)
      const forceSubmit = Number(body.force_submit || 0) === 1 || body.force_submit === true || String(body.force_submit || '').toLowerCase() === 'true'
      if (!shopId) {
        return json({
          live_write_sent: false,
          verified: false,
          items_submitted: 0,
          message: 'Chọn shop trước khi chạy Flash Sale tự động.'
        }, cors, 400)
      }
      try {
        const result = await runFlashAuto(shopId, env.DB, env, { force_submit: forceSubmit })
        return json(result, cors, result.message?.includes('api_permission_missing') || result.message?.includes('token_scope_missing') ? 403 : 200)
      } catch (error) {
        return json({
          shop_id: shopId,
          live_write_sent: false,
          verified: false,
          items_submitted: 0,
          items_confirmed: 0,
          message: cleanText(error?.message || 'Khong the chay Flash Sale cho shop nay.')
        }, cors, 500)
      }
    }

    if (url.pathname === '/api/discounts/flash-auto/run/batch') {
      if (request.method !== 'POST') return json({ status: 'error', message: 'Phuong thuc khong ho tro.' }, cors, 405)
      const user = await getAdminUserFromRequest(request, env)
      if (!isPromotionApplyAdmin(user)) {
        return json({ status: 'error', error: 'admin_required', message: 'Chi tai khoan admin duoc chay Flash Sale hang loat that len san.' }, cors, 403)
      }
      const body = await request.json().catch(() => ({}))
      const shopIds = normalizeShopIds(body.shop_ids || body.selected_shops || body.shops)
      const forceSubmit = Number(body.force_submit || 0) === 1 || body.force_submit === true || String(body.force_submit || '').toLowerCase() === 'true'
      if (!shopIds.length) {
        return json({
          status: 'error',
          message: 'Chon it nhat mot shop truoc khi chay Flash Sale hang loat.'
        }, cors, 400)
      }
      if (shopIds.length > 100) {
        return json({
          status: 'error',
          message: 'Toi da 100 shop cho moi lan chay Flash Sale hang loat.'
        }, cors, 400)
      }

      const settled = await Promise.allSettled(
        shopIds.map((shopId) => runFlashAuto(shopId, env.DB, env, { force_submit: forceSubmit }))
      )
      const results = settled.map((entry, index) => {
        const shopId = shopIds[index]
        if (entry.status === 'fulfilled') {
          const output = entry.value || {}
          const status = classifyBatchResult(output)
          return {
            shop_id: shopId,
            status,
            ...output
          }
        }
        return {
          shop_id: shopId,
          status: 'failed',
          live_write_sent: false,
          verified: false,
          items_submitted: 0,
          items_confirmed: 0,
          message: cleanText(entry.reason?.message || 'Khong the chay Flash Sale cho shop nay.')
        }
      })

      const summary = results.reduce((acc, item) => {
        acc.total += 1
        acc[item.status] = (acc[item.status] || 0) + 1
        return acc
      }, {
        total: 0,
        success: 0,
        submitted: 0,
        prepared: 0,
        skipped: 0,
        permission_denied: 0,
        failed: 0
      })
      return json({
        status: 'ok',
        message: 'Da chay Flash Sale cho ' + summary.total + ' shop. Thanh cong ' + summary.success + ', da gui ' + summary.submitted + ', da chuan bi ' + summary.prepared + ', bo qua ' + summary.skipped + ', bi tu choi quyen ' + summary.permission_denied + ', loi ' + summary.failed + '.',
        summary,
        results
      }, cors, 200)
    }

    return oldHandleDiscounts(request, env, cors)
  }
}
