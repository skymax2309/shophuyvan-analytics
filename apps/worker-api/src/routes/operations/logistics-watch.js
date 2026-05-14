import { loadLogisticsWatch } from '../../core/logistics-watch-core.js'

function json(data, cors, status = 200) {
  return Response.json(data, { status, headers: cors })
}

function cleanText(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim()
}

export async function handleLogisticsWatch(request, env, cors) {
  if (request.method !== 'GET') {
    return json({ error: 'Phương thức không được hỗ trợ.' }, cors, 405)
  }
  const url = new URL(request.url)
  const result = await loadLogisticsWatch(env, {
    platform: cleanText(url.searchParams.get('platform')).toLowerCase(),
    shop: cleanText(url.searchParams.get('shop')),
    filter: cleanText(url.searchParams.get('filter')).toLowerCase(),
    limit: url.searchParams.get('limit')
  })
  return json(result, cors)
}
