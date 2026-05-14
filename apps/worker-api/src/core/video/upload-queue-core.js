import {
  cleanVideoText,
  compactJson,
  ensureVideoAnalyticsTables,
  numberValue,
  parseJsonText
} from './analytics-schema-core.js'

export async function saveMarketplaceVideoActionLog(env, payload = {}) {
  await ensureVideoAnalyticsTables(env)
  await env.DB.prepare(`
    INSERT INTO marketplace_video_action_logs (
      platform, shop, api_shop_id, action_type, action_status, request_payload, result_payload, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'))
  `).bind(
    cleanVideoText(payload.platform).toLowerCase(),
    cleanVideoText(payload.shop),
    cleanVideoText(payload.api_shop_id),
    cleanVideoText(payload.action_type),
    cleanVideoText(payload.action_status),
    compactJson(payload.request_payload || {}),
    compactJson(payload.result_payload || {}),
    cleanVideoText(payload.note)
  ).run()
}

export function newVideoUploadQueueId() {
  const randomPart = globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `vup_${String(randomPart).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}`
}

export function normalizeVideoUploadQueueRow(row = {}, options = {}) {
  if (!row) return null
  return {
    id: numberValue(row.id),
    queue_id: cleanVideoText(row.queue_id),
    platform: cleanVideoText(row.platform),
    shop: cleanVideoText(row.shop),
    api_shop_id: cleanVideoText(row.api_shop_id),
    api_user_id: cleanVideoText(row.api_user_id),
    status: cleanVideoText(row.status || 'queued'),
    scheduled_at: cleanVideoText(row.scheduled_at),
    r2_key: cleanVideoText(row.r2_key),
    file_name: cleanVideoText(row.file_name),
    file_size: numberValue(row.file_size),
    file_type: cleanVideoText(row.file_type),
    duration_seconds: numberValue(row.duration_seconds),
    caption: cleanVideoText(row.caption),
    item_rows: parseJsonText(row.item_ids_json, []),
    allow_duet: numberValue(row.allow_duet) ? 1 : 0,
    allow_stitch: numberValue(row.allow_stitch) ? 1 : 0,
    cover_image_url: cleanVideoText(row.cover_image_url),
    attempts: numberValue(row.attempts),
    max_attempts: numberValue(row.max_attempts || 1),
    last_error: cleanVideoText(row.last_error),
    result_payload: options.includeResult ? parseJsonText(row.result_payload, {}) : {},
    source: cleanVideoText(row.source),
    started_at: cleanVideoText(row.started_at),
    finished_at: cleanVideoText(row.finished_at),
    created_at: cleanVideoText(row.created_at),
    updated_at: cleanVideoText(row.updated_at)
  }
}

export async function createMarketplaceVideoUploadQueue(env, payload = {}) {
  await ensureVideoAnalyticsTables(env)
  const queueId = cleanVideoText(payload.queue_id) || newVideoUploadQueueId()
  await env.DB.prepare(`
    INSERT INTO marketplace_video_upload_queue (
      queue_id, platform, shop, api_shop_id, api_user_id, status, scheduled_at,
      r2_key, file_name, file_size, file_type, duration_seconds, caption,
      item_ids_json, allow_duet, allow_stitch, cover_image_url, attempts,
      max_attempts, last_error, result_payload, source, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '', '{}', ?,
      datetime('now', '+7 hours'), datetime('now', '+7 hours')
    )
  `).bind(
    queueId,
    cleanVideoText(payload.platform || 'shopee').toLowerCase(),
    cleanVideoText(payload.shop),
    cleanVideoText(payload.api_shop_id),
    cleanVideoText(payload.api_user_id),
    cleanVideoText(payload.scheduled_at),
    cleanVideoText(payload.r2_key),
    cleanVideoText(payload.file_name),
    numberValue(payload.file_size),
    cleanVideoText(payload.file_type),
    numberValue(payload.duration_seconds),
    cleanVideoText(payload.caption),
    compactJson(payload.item_rows || []),
    numberValue(payload.allow_duet ?? 1) ? 1 : 0,
    numberValue(payload.allow_stitch ?? 1) ? 1 : 0,
    cleanVideoText(payload.cover_image_url),
    Math.max(1, numberValue(payload.max_attempts || 1)),
    cleanVideoText(payload.source || 'dashboard_video')
  ).run()
  return getMarketplaceVideoUploadQueueJob(env, queueId)
}

export async function getMarketplaceVideoUploadQueueJob(env, queueIdOrId, options = {}) {
  await ensureVideoAnalyticsTables(env)
  const id = Number(queueIdOrId)
  const queueId = cleanVideoText(queueIdOrId)
  const row = await env.DB.prepare(`
    SELECT *
    FROM marketplace_video_upload_queue
    WHERE id = ? OR queue_id = ?
    LIMIT 1
  `).bind(Number.isFinite(id) ? id : 0, queueId).first()
  return normalizeVideoUploadQueueRow(row, { includeResult: options.includeResult !== false })
}

export async function listMarketplaceVideoUploadQueue(env, options = {}) {
  await ensureVideoAnalyticsTables(env)
  const platform = cleanVideoText(options.platform || 'shopee').toLowerCase()
  const shop = cleanVideoText(options.shop)
  const status = cleanVideoText(options.status || 'all')
  const limit = Math.min(Math.max(Number(options.limit || 30) || 30, 1), 100)
  const args = [platform]
  let sql = `
    SELECT *
    FROM marketplace_video_upload_queue
    WHERE platform = ?
  `
  if (shop) {
    sql += ' AND shop = ?'
    args.push(shop)
  }
  if (status && status !== 'all') {
    sql += ' AND status = ?'
    args.push(status)
  }
  sql += `
    ORDER BY
      CASE status
        WHEN 'processing' THEN 0
        WHEN 'queued' THEN 1
        WHEN 'browser_upload_required' THEN 2
        WHEN 'browser_opening' THEN 3
        WHEN 'browser_uploading' THEN 4
        WHEN 'browser_preview_ready' THEN 5
        WHEN 'browser_login_required' THEN 6
        WHEN 'browser_error' THEN 7
        WHEN 'error' THEN 8
        WHEN 'done' THEN 9
        WHEN 'browser_posted' THEN 10
        WHEN 'cancelled' THEN 11
        ELSE 12
      END,
      scheduled_at ASC,
      id DESC
    LIMIT ?
  `
  args.push(limit)
  const { results } = await env.DB.prepare(sql).bind(...args).all()
  const rows = (results || []).map(row => normalizeVideoUploadQueueRow(row, {
    includeResult: options.includeResult === true
  }))
  const summary = {
    queued: rows.filter(row => row.status === 'queued').length,
    processing: rows.filter(row => row.status === 'processing').length,
    browser_upload_required: rows.filter(row => row.status === 'browser_upload_required').length,
    browser_preview_ready: rows.filter(row => row.status === 'browser_preview_ready').length,
    browser_error: rows.filter(row => row.status === 'browser_error').length,
    browser_posted: rows.filter(row => row.status === 'browser_posted').length,
    done: rows.filter(row => row.status === 'done').length,
    error: rows.filter(row => row.status === 'error').length,
    cancelled: rows.filter(row => row.status === 'cancelled').length
  }
  return { rows, summary }
}

export async function updateMarketplaceVideoUploadQueueJob(env, queueIdOrId, update = {}) {
  await ensureVideoAnalyticsTables(env)
  const current = await getMarketplaceVideoUploadQueueJob(env, queueIdOrId, { includeResult: true })
  if (!current) return null
  const nextStatus = cleanVideoText(update.status ?? current.status)
  const nextAttempts = Number.isFinite(Number(update.attempts)) ? Number(update.attempts) : current.attempts
  const nextError = cleanVideoText(update.last_error ?? current.last_error)
  const nextResult = update.result_payload !== undefined ? update.result_payload : current.result_payload
  const nextStartedAt = cleanVideoText(update.started_at ?? current.started_at)
  const nextFinishedAt = cleanVideoText(update.finished_at ?? current.finished_at)
  await env.DB.prepare(`
    UPDATE marketplace_video_upload_queue
    SET status = ?,
        attempts = ?,
        last_error = ?,
        result_payload = ?,
        started_at = ?,
        finished_at = ?,
        updated_at = datetime('now', '+7 hours')
    WHERE id = ?
  `).bind(
    nextStatus,
    nextAttempts,
    nextError,
    compactJson(nextResult || {}),
    nextStartedAt,
    nextFinishedAt,
    current.id
  ).run()
  return getMarketplaceVideoUploadQueueJob(env, current.id, { includeResult: true })
}

export async function claimDueMarketplaceVideoUploadJobs(env, options = {}) {
  await ensureVideoAnalyticsTables(env)
  const platform = cleanVideoText(options.platform || 'shopee').toLowerCase()
  const limit = Math.min(Math.max(Number(options.limit || 1) || 1, 1), 5)
  const { results } = await env.DB.prepare(`
    SELECT *
    FROM marketplace_video_upload_queue
    WHERE platform = ?
      AND status = 'queued'
      AND scheduled_at <= datetime('now', '+7 hours')
      AND attempts < max_attempts
    ORDER BY scheduled_at ASC, id ASC
    LIMIT ?
  `).bind(platform, limit).all()
  const claimed = []
  for (const row of results || []) {
    const attempts = numberValue(row.attempts) + 1
    await env.DB.prepare(`
      UPDATE marketplace_video_upload_queue
      SET status = 'processing',
          attempts = ?,
          started_at = datetime('now', '+7 hours'),
          updated_at = datetime('now', '+7 hours')
      WHERE id = ? AND status = 'queued'
    `).bind(attempts, row.id).run()
    const job = await getMarketplaceVideoUploadQueueJob(env, row.id, { includeResult: true })
    if (job?.status === 'processing') claimed.push(job)
  }
  return claimed
}
