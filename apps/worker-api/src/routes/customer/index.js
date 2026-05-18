import {
  listCustomerRiskEvents,
  listCustomerRiskProfiles,
  rebuildCustomerRiskProfiles
} from '../../core/customer/risk-core.js'

function requestOptions(request) {
  const url = new URL(request.url)
  return {
    platform: url.searchParams.get('platform') || '',
    shop: url.searchParams.get('shop') || '',
    level: url.searchParams.get('level') || '',
    search: url.searchParams.get('search') || '',
    limit: url.searchParams.get('limit') || '',
    risk_key: url.searchParams.get('risk_key') || ''
  }
}

export async function handleCustomerRisk(request, env, cors) {
  const url = new URL(request.url)
  try {
    if (url.pathname === '/api/customer-risk/rebuild' && request.method === 'POST') {
      let body = {}
      try {
        body = await request.json()
      } catch {
        body = {}
      }
      // Phase 1 chỉ dựng dữ liệu cảnh báo nội bộ từ D1, không gửi lệnh nào lên sàn.
      const result = await rebuildCustomerRiskProfiles(env, { ...requestOptions(request), ...body })
      return Response.json(result, { headers: cors })
    }

    if (url.pathname === '/api/customer-risk/profiles' && request.method === 'GET') {
      return Response.json(await listCustomerRiskProfiles(env, requestOptions(request)), { headers: cors })
    }

    if (url.pathname === '/api/customer-risk/events' && request.method === 'GET') {
      return Response.json(await listCustomerRiskEvents(env, requestOptions(request)), { headers: cors })
    }

    return Response.json({ error: 'customer_risk_route_not_found' }, { status: 404, headers: cors })
  } catch (error) {
    return Response.json({ status: 'error', error: error.message || String(error) }, { status: 500, headers: cors })
  }
}
