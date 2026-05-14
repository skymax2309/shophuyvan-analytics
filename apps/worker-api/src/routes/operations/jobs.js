export async function createJob(req, env, cors) {
  const body = await req.json()

  // Chèn thêm trường scheduled_at (nếu có)
  const { lastRowId } = await env.DB.prepare(`
    INSERT INTO jobs (user_id, shop_name, platform, month, year, status, scheduled_at, task_type, from_date, to_date, payload)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
  `).bind(
    body.user_id || 'admin',
    body.shop_name || 'ALL',
    body.platform || 'ALL',
    body.month || new Date().getMonth() + 1,
    body.year || new Date().getFullYear(),
    body.scheduled_at || null,
    body.task_type || 'all',
    body.from_date || null,
    body.to_date   || null,
    body.payload   || null
  ).run()

  return Response.json({ status: "ok", id: lastRowId }, { headers: cors })
}

export async function getJobs(req, env, cors) {
  const url = new URL(req.url)
  const mode = url.searchParams.get("mode")

  // Nếu gọi từ Dashboard để xem tiến độ (lấy tất cả job gần đây)
  if (mode === "monitor") {
    const { results } = await env.DB.prepare(`
      SELECT * FROM jobs ORDER BY created_at DESC LIMIT 50
    `).all()
    return Response.json(results, { headers: cors })
  }

  // Nếu Bot gọi để lấy lệnh chạy (Chỉ lấy job đến giờ hẹn)
  const { results } = await env.DB.prepare(`
    SELECT * FROM jobs
    WHERE status = 'pending'
      -- scheduled_at được nhập từ ô datetime-local trên web theo giờ Việt Nam, nên so với now +7 để bot không chạy trễ 7 tiếng.
      AND (scheduled_at IS NULL OR scheduled_at = '' OR datetime(scheduled_at) <= datetime('now', '+7 hours'))
    ORDER BY created_at ASC
  `).all()

  return Response.json(results, { headers: cors })
}

export async function updateJob(req, env, cors, id) {
  const body = await req.json()
  const logText = body.log_text || body.error || body.message || null

  await env.DB.prepare(`
    UPDATE jobs SET
      status       = ?,
      file_url     = ?,
      log_text     = ?,
      completed_at = CASE WHEN ? IN ('completed','failed') THEN datetime('now') ELSE completed_at END,
      started_at   = CASE WHEN ? IN ('running','processing') THEN datetime('now') ELSE started_at END
    WHERE id = ?
  `).bind(
    body.status,
    body.file_url  || null,
    logText,
    body.status,
    body.status,
    id
  ).run()

  return Response.json({ status: "ok" }, { headers: cors })
}

export async function deleteJob(req, env, cors, id) {
  await env.DB.prepare(`DELETE FROM jobs WHERE id = ?`).bind(id).run()
  return Response.json({ status: "ok" }, { headers: cors })
}
