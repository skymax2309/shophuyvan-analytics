export async function createJob(req, env, cors) {
  const body = await req.json()

  await env.DB.prepare(`
    INSERT INTO jobs (user_id, shop_name, platform, month, year)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    body.user_id,
    body.shop_name,
    body.platform,
    body.month,
    body.year
  ).run()

  return Response.json({ status: "ok" }, { headers: cors })
}

export async function getJobs(req, env, cors) {
  const { results } = await env.DB.prepare(`
    SELECT * FROM jobs WHERE status = 'pending'
    ORDER BY created_at DESC
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