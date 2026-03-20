export async function createJob(req, env, cors) {
  const body = await req.json()

  // Chèn thêm trường scheduled_at (nếu có)
  const { lastRowId } = await env.DB.prepare(`
    INSERT INTO jobs (user_id, shop_name, platform, month, year, status, scheduled_at, task_type)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `).bind(
    body.user_id,
    body.shop_name,
    body.platform,
    body.month,
    body.year,
    body.scheduled_at || null,
    body.task_type || 'all'
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
    AND (scheduled_at IS NULL OR replace(scheduled_at, 'T', ' ') <= datetime('now', '+7 hours'))
    ORDER BY created_at ASC
  `).all()

  return Response.json(results, { headers: cors })
}

export async function updateJob(req, env, cors, id) {
  const body = await req.json()

  await env.DB.prepare(`
    UPDATE jobs SET status = ?, file_url = ?
    WHERE id = ?
  `).bind(
    body.status,
    body.file_url || null,
    id
  ).run()

  return Response.json({ status: "ok" }, { headers: cors })
}