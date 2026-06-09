import { getAdminUserFromRequest } from '../admin/index.js'
import {
  confirmPurchaseRows,
  editPurchaseBatchItem,
  ensurePurchaseCoreTables,
  getImportBatchDetail,
  getLogisticsProfileBySku,
  getPurchaseBatchRevisions,
  getPurchaseHistoryBySku,
  getPurchaseSettings,
  listImportBatches,
  listPurchaseReadModel,
  previewPurchaseRows,
  purchaseExportRows,
  upsertLogisticsProfile
} from '../../core/purchase/purchase-core.js'

function json(data, cors, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      ...cors,
      'Cache-Control': 'no-store'
    }
  })
}

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

async function requirePurchaseWriter(request, env, cors) {
  const user = await getAdminUserFromRequest(request, env)
  if (!user) {
    return json({
      ok: false,
      error: 'purchase_auth_required',
      message: 'Cần đăng nhập tài khoản admin/manager/warehouse để ghi Purchase Core.'
    }, cors, 401)
  }
  if (!['admin', 'manager', 'warehouse'].includes(user.role)) {
    return json({
      ok: false,
      error: 'purchase_permission_denied',
      message: 'Tài khoản không có quyền ghi Purchase Core.'
    }, cors, 403)
  }
  return null
}

async function readJson(request) {
  return request.json().catch(() => ({}))
}

async function updateSettings(request, env, cors) {
  const blocked = await requirePurchaseWriter(request, env, cors)
  if (blocked) return blocked
  const body = await readJson(request)
  const updates = Array.isArray(body) ? body : (Array.isArray(body.settings) ? body.settings : [body])
  await ensurePurchaseCoreTables(env)
  for (const item of updates) {
    const key = cleanText(item.key)
    if (!key) continue
    // Cài đặt là tham số đầu vào của Core; không ghi công thức cuối từ UI.
    await env.DB.prepare(`
      UPDATE settings_import
      SET value = ?, updated_at = datetime('now','+7 hours')
      WHERE key = ?
    `).bind(String(item.value ?? ''), key).run()
  }
  return json({ ok: true, status: 'updated', settings: await getPurchaseSettings(env) }, cors)
}

function requestRows(body = {}) {
  if (Array.isArray(body)) return body
  if (Array.isArray(body.rows)) return body.rows
  if (Array.isArray(body.items)) return body.items
  return []
}

export async function handlePurchase(request, env, cors) {
  const url = new URL(request.url)
  await ensurePurchaseCoreTables(env)

  if (url.pathname === '/api/purchase/settings') {
    if (request.method === 'GET') {
      const settings = await getPurchaseSettings(env)
      return json({
        ok: true,
        settings,
        rows: Object.entries(settings).map(([key, value]) => ({ key, value }))
      }, cors)
    }
    if (request.method === 'POST' || request.method === 'PATCH') return updateSettings(request, env, cors)
  }

  if (url.pathname === '/api/purchase/read-model' && request.method === 'GET') {
    const result = await listPurchaseReadModel(env, {
      search: url.searchParams.get('search') || url.searchParams.get('q'),
      category: url.searchParams.get('category'),
      supplier: url.searchParams.get('supplier'),
      date_from: url.searchParams.get('date_from'),
      date_to: url.searchParams.get('date_to'),
      cost_status: url.searchParams.get('cost_status'),
      stock_status: url.searchParams.get('stock_status'),
      logistics_status: url.searchParams.get('logistics_status'),
      limit: url.searchParams.get('limit')
    })
    return json(result, cors)
  }

  if (url.pathname === '/api/purchase/import-batches' && request.method === 'GET') {
    return json(await listImportBatches(env, {
      search: url.searchParams.get('search') || url.searchParams.get('q'),
      limit: url.searchParams.get('limit') || 100
    }), cors)
  }

  if (url.pathname === '/api/purchase/import-batch' && request.method === 'GET') {
    const batchId = url.searchParams.get('id') || url.searchParams.get('import_batch_id') || url.searchParams.get('purchase_batch_id')
    if (!cleanText(batchId)) return json({ ok: false, error: 'missing_import_batch_id' }, cors, 400)
    return json(await getImportBatchDetail(env, batchId), cors)
  }

  if (url.pathname === '/api/purchase/history' && request.method === 'GET') {
    const sku = url.searchParams.get('sku_id') || url.searchParams.get('sku') || url.searchParams.get('internal_sku')
    if (!cleanText(sku)) return json({ ok: false, error: 'missing_sku' }, cors, 400)
    return json(await getPurchaseHistoryBySku(env, sku), cors)
  }

  if (url.pathname === '/api/purchase/logistics-profile') {
    if (request.method === 'GET') {
      const sku = url.searchParams.get('sku_id') || url.searchParams.get('sku') || url.searchParams.get('internal_sku')
      if (!cleanText(sku)) return json({ ok: false, error: 'missing_sku' }, cors, 400)
      return json({ ok: true, profile: await getLogisticsProfileBySku(env, sku) }, cors)
    }
    if (request.method === 'POST' || request.method === 'PATCH') {
      const blocked = await requirePurchaseWriter(request, env, cors)
      if (blocked) return blocked
      const body = await readJson(request)
      const sku = body.sku_id || body.internal_sku || body.ma_hang
      if (!cleanText(sku)) return json({ ok: false, error: 'missing_sku' }, cors, 400)
      return json({ ok: true, profile: await upsertLogisticsProfile(env, sku, body, await getAdminUserFromRequest(request, env)) }, cors)
    }
  }

  if (url.pathname === '/api/purchase/revisions' && request.method === 'GET') {
    const id = url.searchParams.get('item_id') || url.searchParams.get('purchase_batch_item_id') || url.searchParams.get('purchase_batch_id') || url.searchParams.get('id')
    if (!cleanText(id)) return json({ ok: false, error: 'missing_revision_target' }, cors, 400)
    return json({ ok: true, revisions: await getPurchaseBatchRevisions(env, id) }, cors)
  }

  if (url.pathname === '/api/purchase/import-preview' && request.method === 'POST') {
    const body = await readJson(request)
    return json(await previewPurchaseRows(env, requestRows(body), { settings: body.settings || {} }), cors)
  }

  if (url.pathname === '/api/purchase/import-confirm' && request.method === 'POST') {
    const blocked = await requirePurchaseWriter(request, env, cors)
    if (blocked) return blocked
    const body = await readJson(request)
    return json(await confirmPurchaseRows(env, requestRows(body), {
      settings: body.settings || {},
      import_batch: body.import_batch || body.batch || {},
      update_logistics_profile: Boolean(body.update_logistics_profile),
      user: await getAdminUserFromRequest(request, env)
    }), cors)
  }

  if (url.pathname === '/api/purchase/manual-preview' && request.method === 'POST') {
    const body = await readJson(request)
    return json(await previewPurchaseRows(env, [body], { settings: body.settings || {} }), cors)
  }

  if (url.pathname === '/api/purchase/manual-confirm' && request.method === 'POST') {
    const blocked = await requirePurchaseWriter(request, env, cors)
    if (blocked) return blocked
    const body = await readJson(request)
    return json(await confirmPurchaseRows(env, [body], {
      settings: body.settings || {},
      import_batch: body.import_batch || body.batch || {},
      update_logistics_profile: Boolean(body.update_logistics_profile),
      user: await getAdminUserFromRequest(request, env)
    }), cors)
  }

  if (url.pathname === '/api/purchase/batch-item-edit' && request.method === 'PATCH') {
    const blocked = await requirePurchaseWriter(request, env, cors)
    if (blocked) return blocked
    const body = await readJson(request)
    const itemId = body.purchase_batch_item_id || body.item_id || body.id
    if (!cleanText(itemId)) return json({ ok: false, error: 'missing_purchase_batch_item_id' }, cors, 400)
    return json(await editPurchaseBatchItem(env, itemId, body.patch || body, await getAdminUserFromRequest(request, env)), cors)
  }

  if (url.pathname === '/api/purchase/export' && request.method === 'GET') {
    const result = await listPurchaseReadModel(env, {
      search: url.searchParams.get('search') || url.searchParams.get('q'),
      category: url.searchParams.get('category'),
      supplier: url.searchParams.get('supplier'),
      date_from: url.searchParams.get('date_from'),
      date_to: url.searchParams.get('date_to'),
      cost_status: url.searchParams.get('cost_status'),
      stock_status: url.searchParams.get('stock_status'),
      logistics_status: url.searchParams.get('logistics_status'),
      limit: url.searchParams.get('limit') || 500
    })
    return json({
      ok: true,
      source: 'warehouse_purchase_core',
      rows: purchaseExportRows(result.products || [])
    }, cors)
  }

  // Giữ endpoint cũ ở chế độ đọc tương thích, nhưng dữ liệu trả về đi qua read-model mới.
  if (url.pathname === '/api/purchase' && request.method === 'GET') {
    const result = await listPurchaseReadModel(env, {
      search: url.searchParams.get('search'),
      limit: url.searchParams.get('limit') || 200
    })
    return json(result.products || [], cors)
  }

  return json({
    ok: false,
    error: 'purchase_route_not_found',
    message: 'Route Purchase Core chưa hỗ trợ thao tác này.'
  }, cors, 404)
}
