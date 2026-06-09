import {
  listCustomerRiskEvents,
  listCustomerRiskProfiles,
  rebuildCustomerRiskProfiles
} from '../../core/customer/risk-core.js'
import {
  listMarketplaceCustomerContacts,
  marketplaceContactFromChatEvent,
  summarizeMarketplaceCustomerContacts,
  syncCustomerContactsFromOrders,
  upsertMarketplaceCustomerContact,
  upsertMarketplaceCustomerContactFromChat
} from '../../core/customer/contacts-core.js'

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
    if (url.pathname === '/api/customers/marketplace/chat-ingest' && request.method === 'POST') {
      const expected = String(env?.CUSTOMER_CONTACT_BRIDGE_SECRET || env?.CHAT_BRIDGE_INTERNAL_SECRET || '').trim()
      const received = String(request.headers.get('X-Chat-Bridge-Secret') || request.headers.get('X-Customer-Contact-Secret') || '').trim()
      if (!expected) {
        return Response.json({ status: 'error', error: 'customer_contact_bridge_secret_not_configured' }, { status: 503, headers: cors })
      }
      if (received !== expected) {
        return Response.json({ status: 'error', error: 'customer_contact_bridge_forbidden' }, { status: 403, headers: cors })
      }
      const body = await request.json().catch(() => ({}))
      const events = Array.isArray(body.events) ? body.events : [body.event || body.message || body]
      const results = []
      for (const event of events.slice(0, 100)) {
        const contact = marketplaceContactFromChatEvent(event)
        const result = await upsertMarketplaceCustomerContactFromChat(env, event)
        results.push({ ...result, contact_key: result.contact_key || contact.contact_key })
      }
      return Response.json({
        status: 'ok',
        scanned_events: events.length,
        upserted: results.filter(item => item.status === 'ok').length,
        skipped: results.filter(item => item.status === 'skipped').length,
        results
      }, { headers: cors })
    }

    if (url.pathname === '/api/customers/marketplace/rebuild' && request.method === 'POST') {
      let body = {}
      try {
        body = await request.json()
      } catch {
        body = {}
      }
      return Response.json(await syncCustomerContactsFromOrders(env, { ...requestOptions(request), ...body }), { headers: cors })
    }

    if (url.pathname === '/api/customers/marketplace/upsert' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}))
      return Response.json(await upsertMarketplaceCustomerContact(env, body), { headers: cors })
    }

    if (url.pathname === '/api/customers/marketplace/summary' && request.method === 'GET') {
      return Response.json(await summarizeMarketplaceCustomerContacts(env, requestOptions(request)), { headers: cors })
    }

    if (url.pathname === '/api/customers/marketplace' && request.method === 'GET') {
      return Response.json(await listMarketplaceCustomerContacts(env, requestOptions(request)), { headers: cors })
    }

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
