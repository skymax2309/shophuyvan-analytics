import { API } from '../oms-dashboard/oms-api.js'
import { showToast } from '../utils/helpers.js'

let advancedState = null
let advancedModulesState = null
let shopeeShopSnapshotState = null

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function jsArg(value = '') {
  return JSON.stringify(String(value ?? ''))
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function ensureAdvancedStyles() {
  if (document.getElementById('omsApiAdvancedStyles')) return
  const style = document.createElement('style')
  style.id = 'omsApiAdvancedStyles'
  style.textContent = `
    .api-advanced-modal {
      width: min(1120px, calc(100vw - 16px));
      max-height: 94vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .api-advanced-body {
      overflow: auto;
      padding: 10px;
      display: grid;
      gap: 12px;
    }
    .api-advanced-top {
      display: grid;
      gap: 12px;
    }
    .api-advanced-kpis,
    .api-feature-grid,
    .api-permission-grid,
    .api-workspace-grid,
    .api-shop-grid,
    .api-module-grid,
    .api-signal-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .api-kpi,
    .api-feature,
    .api-permission,
    .api-workspace,
    .api-shop,
    .api-module,
    .api-signal,
    .api-webhook-box {
      border: 1px solid var(--border);
      background: rgba(15, 23, 42, .34);
      border-radius: 8px;
      padding: 10px;
      min-width: 0;
    }
    .api-kpi-label,
    .api-feature-meta,
    .api-permission-meta,
    .api-workspace-meta,
    .api-shop-meta,
    .api-module-meta,
    .api-signal-meta,
    .api-webhook-label {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.4;
    }
    .api-kpi-value {
      font-size: 20px;
      font-weight: 800;
      margin-top: 4px;
      color: var(--text);
    }
    .api-section-title {
      font-size: 14px;
      font-weight: 800;
      color: var(--text);
      margin: 2px 0 0;
    }
    .api-feature-head,
    .api-permission-head,
    .api-workspace-head,
    .api-shop-head,
    .api-module-head,
    .api-signal-head,
    .api-webhook-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      min-width: 0;
    }
    .api-feature-title,
    .api-permission-title,
    .api-workspace-title,
    .api-shop-title,
    .api-module-title,
    .api-signal-title {
      font-size: 13px;
      font-weight: 800;
      color: var(--text);
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .api-feature-summary,
    .api-permission-summary,
    .api-workspace-summary,
    .api-module-summary,
    .api-signal-detail {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
      margin-top: 7px;
    }
    .api-workspace {
      display: grid;
      gap: 10px;
    }
    .api-workspace-metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .api-workspace-metric {
      border: 1px solid rgba(148, 163, 184, .16);
      background: rgba(2, 6, 23, .24);
      border-radius: 6px;
      padding: 8px;
      min-width: 0;
    }
    .api-workspace-value {
      color: var(--text);
      font-weight: 900;
      font-size: 15px;
      margin-top: 4px;
      overflow-wrap: anywhere;
    }
    .api-workspace-value.ok { color: #22c55e; }
    .api-workspace-value.warning { color: #facc15; }
    .api-workspace-rows {
      display: grid;
      gap: 7px;
    }
    .api-workspace-row {
      border: 1px solid rgba(148, 163, 184, .16);
      background: rgba(2, 6, 23, .18);
      border-radius: 6px;
      padding: 8px;
      min-width: 0;
    }
    .api-workspace-row-title {
      color: var(--text);
      font-size: 12px;
      font-weight: 800;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .api-workspace-row-detail {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.45;
      margin-top: 4px;
      overflow-wrap: anywhere;
    }
    .api-permission-head > div {
      min-width: 0;
      flex: 1 1 220px;
    }
    .api-permission-meta {
      overflow-wrap: anywhere;
    }
    .api-permission .api-pill {
      margin-left: auto;
      max-width: 100%;
      white-space: normal;
      line-height: 1.2;
      text-align: center;
    }
    .api-module-next {
      border-top: 1px solid rgba(148, 163, 184, .16);
      margin-top: 8px;
      padding-top: 8px;
      color: var(--text);
      font-size: 12px;
      line-height: 1.45;
    }
    .api-pill {
      border-radius: 999px;
      border: 1px solid var(--border);
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 800;
      line-height: 1;
      white-space: nowrap;
      background: var(--surface2);
    }
    .api-pill.ready,
    .api-pill.ok,
    .api-pill.module_ready,
    .api-pill.module_ready_read,
    .api-pill.module_ready_prepare { color: #22c55e; border-color: rgba(34, 197, 94, .55); }
    .api-pill.partial { color: #f59e0b; border-color: rgba(245, 158, 11, .55); }
    .api-pill.needs_permission { color: #93c5fd; border-color: rgba(147, 197, 253, .55); }
    .api-pill.needs_module { color: #c4b5fd; border-color: rgba(196, 181, 253, .55); }
    .api-pill.missing,
    .api-pill.expired,
    .api-pill.refresh_expired { color: #f87171; border-color: rgba(248, 113, 113, .55); }
    .api-pill.warning { color: #facc15; border-color: rgba(250, 204, 21, .55); }
    .api-shop-actions,
    .api-module-actions {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      margin-top: 10px;
    }
    .api-action-btn {
      min-height: 38px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--surface2);
      color: var(--text);
      font-weight: 800;
      cursor: pointer;
      padding: 8px 10px;
      overflow-wrap: anywhere;
    }
    .api-action-btn.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
    }
    .api-action-btn:disabled {
      opacity: .45;
      cursor: not-allowed;
    }
    .api-webhook-url {
      margin-top: 6px;
      padding: 8px;
      border-radius: 6px;
      background: rgba(2, 6, 23, .32);
      border: 1px solid rgba(148, 163, 184, .18);
      color: var(--text);
      font-family: 'IBM Plex Mono', monospace;
      font-size: 11px;
      overflow-wrap: anywhere;
    }
    .api-events {
      display: grid;
      gap: 7px;
    }
    .api-shop-snapshot {
      margin-top: 10px;
      display: grid;
      gap: 7px;
    }
    .api-event {
      display: grid;
      gap: 3px;
      padding: 8px;
      border: 1px solid rgba(148, 163, 184, .16);
      border-radius: 6px;
      background: rgba(2, 6, 23, .22);
      font-size: 12px;
    }
    .api-event strong,
    .api-signal strong { color: var(--text); }
    .api-shop-snapshot-row {
      border: 1px solid rgba(148, 163, 184, .16);
      background: rgba(2, 6, 23, .22);
      border-radius: 6px;
      padding: 8px;
      font-size: 12px;
      line-height: 1.4;
      min-width: 0;
    }
    .api-shop-snapshot-row strong {
      color: var(--text);
      display: block;
      overflow-wrap: anywhere;
    }
    @media (min-width: 720px) {
      .api-advanced-body { padding: 16px; }
      .api-advanced-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .api-module-grid,
      .api-permission-grid,
      .api-workspace-grid,
      .api-feature-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .api-shop-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .api-shop-actions { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .api-module-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .api-signal-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (min-width: 1040px) {
      .api-module-grid,
      .api-permission-grid,
      .api-workspace-grid,
      .api-feature-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
  `
  document.head.appendChild(style)
}

function ensureAdvancedModal() {
  ensureAdvancedStyles()
  let overlay = document.getElementById('apiAdvancedModal')
  if (overlay) return overlay

  overlay = document.createElement('div')
  overlay.id = 'apiAdvancedModal'
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal api-advanced-modal">
      <div class="modal-header">
        <div>
          <div class="modal-title">Trung tâm API nâng cao</div>
          <div class="api-feature-meta">Theo dõi realtime, tem API, tồn kho, bài đăng, đối soát, hoàn/trả, chat và marketing theo từng shop.</div>
        </div>
        <button class="modal-close" type="button" onclick="closeAdvancedApiFeatures()">×</button>
      </div>
      <div id="apiAdvancedBody" class="api-advanced-body">
        <div class="empty-state"><p>Đang tải dữ liệu API...</p></div>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  return overlay
}

function statusText(status) {
  return {
    ready: 'Sẵn sàng',
    partial: 'Đã có một phần',
    needs_permission: 'Cần quyền API',
    needs_module: 'Cần module',
    module_ready: 'Đã có module',
    module_ready_read: 'Đã có dữ liệu đọc',
    module_ready_prepare: 'Đã có hàng chờ',
    module_ready_write_guard: 'Đã có guard ghi',
    partial_error: 'Có lỗi một phần',
    locked: 'Đang khóa',
    ok: 'Đang hoạt động',
    warning: 'Cần chú ý',
    missing: 'Thiếu token',
    expired: 'Hết hạn',
    refresh_expired: 'Refresh hết hạn'
  }[status] || status || 'Chưa rõ'
}

function metricToneClass(tone) {
  const text = String(tone || '').toLowerCase()
  if (['ok', 'ready', 'module_ready'].includes(text)) return 'ok'
  if (['warning', 'return', 'finance'].includes(text)) return 'warning'
  return text
}

function platformText(platform) {
  const text = String(platform || '').toLowerCase()
  if (text === 'shopee') return 'Shopee'
  if (text === 'lazada') return 'Lazada'
  if (text === 'đa sàn') return 'Đa sàn'
  return text || 'Sàn'
}

function formatMinutes(value) {
  if (value === null || value === undefined || value === '') return 'Chưa có hạn'
  const minutes = Number(value)
  if (!Number.isFinite(minutes)) return 'Chưa có hạn'
  if (minutes <= 0) return 'Đã hết hạn'
  if (minutes < 120) return `Còn ${minutes} phút`
  if (minutes < 48 * 60) return `Còn ${Math.round(minutes / 60)} giờ`
  return `Còn ${Math.round(minutes / 1440)} ngày`
}

function renderKpis(data, modulesData) {
  const counters = data?.counters || {}
  const moduleCounters = modulesData?.counters || {}
  return `
    <div class="api-advanced-kpis">
      <div class="api-kpi"><div class="api-kpi-label">Shop đang có API</div><div class="api-kpi-value">${Number(counters.api_shops || moduleCounters.api_shops || 0)}</div></div>
      <div class="api-kpi"><div class="api-kpi-label">Token cần chú ý</div><div class="api-kpi-value">${Number(counters.token_warnings || 0)}</div></div>
      <div class="api-kpi"><div class="api-kpi-label">Tem API đã lưu</div><div class="api-kpi-value">${Number(counters.labels_ready || 0)}</div></div>
      <div class="api-kpi"><div class="api-kpi-label">Đối soát phí</div><div class="api-kpi-value">${Number(counters.fee_details || moduleCounters.fee_details || 0)}</div></div>
    </div>
  `
}

function renderModuleActions(actions = []) {
  if (!actions.length) return ''
  return `
    <div class="api-module-actions">
      ${actions.map(action => {
        if (action.type === 'link') {
          return `<button class="api-action-btn" type="button" onclick="openAdvancedModuleHref(${jsArg(action.href)})">${escapeHtml(action.label)}</button>`
        }
        return `<button class="api-action-btn primary" type="button" onclick="runAdvancedModuleAction(${jsArg(action.action)},${jsArg(action.platform || '')},${jsArg(action.shop || '')})">${escapeHtml(action.label)}</button>`
      }).join('')}
    </div>
  `
}

function renderModules(modulesData) {
  const modules = modulesData?.modules || []
  if (!modules.length) {
    return `
      <div class="api-section-title">Module vận hành</div>
      <div class="api-webhook-box">Chưa tải được module vận hành. Vui lòng bấm làm mới lại Trung tâm API.</div>
    `
  }
  return `
    <div class="api-section-title">Module vận hành</div>
    <div class="api-module-grid">
      ${modules.map(module => `
        <div class="api-module">
          <div class="api-module-head">
            <div>
              <div class="api-module-meta">${escapeHtml(module.group)} · ${Number(module.count || 0).toLocaleString('vi-VN')} ${escapeHtml(module.count_label || 'mục')}</div>
              <div class="api-module-title">${escapeHtml(module.title)}</div>
            </div>
            <span class="api-pill ${escapeHtml(module.status)}">${escapeHtml(statusText(module.status))}</span>
          </div>
          <div class="api-module-summary">${escapeHtml(module.summary)}</div>
          <div class="api-module-next">${escapeHtml(module.next_step)}</div>
          ${renderModuleActions(module.actions || [])}
        </div>
      `).join('')}
    </div>
  `
}

function renderWorkspaceRows(rows = [], emptyText = 'Chưa có dữ liệu.') {
  if (!rows.length) return `<div class="api-webhook-box">${escapeHtml(emptyText)}</div>`
  return `
    <div class="api-workspace-rows">
      ${rows.slice(0, 5).map(row => `
        <div class="api-workspace-row">
          <div class="api-workspace-row-title">${escapeHtml(row.title || 'Dữ liệu')}</div>
          ${row.meta ? `<div class="api-workspace-meta">${escapeHtml(row.meta)}</div>` : ''}
          <div class="api-workspace-row-detail">${escapeHtml(row.detail || '')}</div>
          ${row.time ? `<div class="api-workspace-meta" style="margin-top:5px;">${escapeHtml(row.time)}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `
}

function renderWorkspaces(modulesData) {
  const workspaces = modulesData?.workspaces || []
  if (!workspaces.length) return ''
  return `
    <div class="api-section-title">Khu làm việc API</div>
    <div class="api-workspace-grid">
      ${workspaces.map(workspace => `
        <div class="api-workspace" id="api-workspace-${escapeHtml(workspace.id || '')}">
          <div class="api-workspace-head">
            <div>
              <div class="api-workspace-meta">${escapeHtml(workspace.group || '')}</div>
              <div class="api-workspace-title">${escapeHtml(workspace.title || '')}</div>
            </div>
            <span class="api-pill ${escapeHtml(workspace.status || 'ok')}">${escapeHtml(statusText(workspace.status || 'ok'))}</span>
          </div>
          <div class="api-workspace-summary">${escapeHtml(workspace.summary || '')}</div>
          <div class="api-workspace-metrics">
            ${(workspace.metrics || []).map(metric => `
              <div class="api-workspace-metric">
                <div class="api-workspace-meta">${escapeHtml(metric.label || '')}</div>
                <div class="api-workspace-value ${escapeHtml(metricToneClass(metric.tone))}">${escapeHtml(metric.value || '0')}</div>
              </div>
            `).join('')}
          </div>
          ${renderModuleActions(workspace.actions || [])}
          <div class="api-workspace-meta">Dữ liệu nổi bật</div>
          ${renderWorkspaceRows(workspace.breakdown || workspace.rows || [], 'Chưa có dữ liệu nổi bật cho module này.')}
          <div class="api-workspace-meta">Mới cập nhật</div>
          ${renderWorkspaceRows(workspace.rows || [], 'Chưa có dòng cập nhật mới.')}
        </div>
      `).join('')}
    </div>
  `
}

function renderSignals(modulesData) {
  const signals = modulesData?.signals || []
  return `
    <div id="api-module-signals" class="api-section-title">Tín hiệu mới từ sàn</div>
    <div class="api-signal-grid">
      ${signals.length ? signals.slice(0, 12).map(signal => `
        <div class="api-signal">
          <div class="api-signal-head">
            <div>
              <div class="api-signal-meta">${platformText(signal.platform)}${signal.shop ? ` · ${escapeHtml(signal.shop)}` : ''}</div>
              <div class="api-signal-title">${escapeHtml(signal.title)}</div>
            </div>
            <span class="api-pill ${escapeHtml(signal.status || 'ok')}">${escapeHtml(signal.status || 'ok')}</span>
          </div>
          <div class="api-signal-detail">${escapeHtml(signal.detail || '')}</div>
          <div class="api-signal-meta" style="margin-top:7px;">${escapeHtml(signal.time || 'Chưa có thời gian')}</div>
        </div>
      `).join('') : '<div class="api-webhook-box">Chưa có tín hiệu mới. Khi sàn đẩy chat, marketing, hoàn/trả, giá/tồn hoặc video, dữ liệu sẽ hiện ở đây.</div>'}
    </div>
  `
}

function renderFeatures(features = []) {
  return `
    <div class="api-section-title">Tính năng nâng cao</div>
    <div class="api-feature-grid">
      ${features.map(feature => `
        <div class="api-feature">
          <div class="api-feature-head">
            <div>
              <div class="api-feature-meta">${escapeHtml(feature.group)}</div>
              <div class="api-feature-title">${escapeHtml(feature.name)}</div>
            </div>
            <span class="api-pill ${escapeHtml(feature.status)}">${escapeHtml(statusText(feature.status))}</span>
          </div>
          <div class="api-feature-summary">${escapeHtml(feature.summary)}</div>
          <div class="api-feature-meta" style="margin-top:8px;">${escapeHtml(feature.next_step)}</div>
        </div>
      `).join('')}
    </div>
  `
}

function renderPermissionMatrix(matrix = {}) {
  const lazada = Array.isArray(matrix?.lazada) ? matrix.lazada : []
  if (!lazada.length) return ''
  return `
    <div class="api-section-title">Quyền Lazada đang bật</div>
    <div class="api-permission-grid">
      ${lazada.map(item => `
        <div class="api-permission">
          <div class="api-permission-head">
            <div>
              <div class="api-permission-meta">${escapeHtml(item.permission || '')}</div>
              <div class="api-permission-title">${escapeHtml(item.group || 'Nhóm quyền')}</div>
            </div>
            <span class="api-pill ${escapeHtml(item.status)}">${escapeHtml(statusText(item.status))}</span>
          </div>
          <div class="api-permission-summary">${escapeHtml(item.oms_usage || '')}</div>
          <div class="api-permission-meta" style="margin-top:8px;">OMS: ${escapeHtml(item.endpoint_usage || 'Chưa dùng endpoint trực tiếp')}</div>
          <div class="api-permission-meta" style="margin-top:6px;">${escapeHtml(item.next_step || '')}</div>
        </div>
      `).join('')}
    </div>
  `
}

function renderShopeeShopSnapshot(shop) {
  const snapshot = shopeeShopSnapshotState
  if (!snapshot || shop.platform !== 'shopee') return ''
  const sameShop = snapshot.shop === shop.display_name || snapshot.api_shop_id === shop.api_shop_id
  if (!sameShop) return ''

  const endpointRows = (snapshot.endpoints || []).map(row => `
    <div class="api-shop-snapshot-row">
      <strong>${escapeHtml(row.label || row.source || row.endpoint)}</strong>
      <span class="api-shop-meta">${escapeHtml(row.source || '')} · ${escapeHtml(row.status || '')}</span>
      <div class="api-shop-meta">${escapeHtml(row.summary || '')}</div>
    </div>
  `).join('')

  const guardRows = (snapshot.write_guards || []).map(row => `
    <div class="api-shop-snapshot-row">
      <strong>${escapeHtml(row.label || row.source)}</strong>
      <span class="api-shop-meta">${escapeHtml(row.source || '')} · khóa preview/xác nhận</span>
    </div>
  `).join('')

  return `
    <div class="api-shop-snapshot">
      <div class="api-shop-meta">Snapshot Shopee Shop API · ${Number(snapshot.success || 0).toLocaleString('vi-VN')} đọc được · ${Number(snapshot.failed || 0).toLocaleString('vi-VN')} lỗi</div>
      ${endpointRows || '<div class="api-shop-snapshot-row">Chưa có dòng endpoint đọc.</div>'}
      <div class="api-shop-meta">Endpoint ghi đang khóa an toàn</div>
      ${guardRows}
    </div>
  `
}

function renderShops(shops = []) {
  if (!shops.length) {
    return `
      <div id="api-shop-list" class="api-section-title">Shop API</div>
      <div class="api-webhook-box">Chưa có shop Shopee/Lazada nào trong cấu hình API.</div>
    `
  }

  return `
    <div id="api-shop-list" class="api-section-title">Shop API</div>
    <div class="api-shop-grid">
      ${shops.map(shop => {
        const disabled = shop.has_access_token ? '' : 'disabled'
        const shopeeReadButton = shop.platform === 'shopee'
          ? `<button class="api-action-btn" ${disabled} onclick="readAdvancedShopeeShopSnapshot(${jsArg(shop.display_name)})">Đọc hồ sơ shop</button>`
          : ''
        return `
          <div class="api-shop">
            <div class="api-shop-head">
              <div>
                <div class="api-shop-title">${escapeHtml(shop.display_name)}</div>
                <div class="api-shop-meta">${platformText(shop.platform)}${shop.api_shop_id ? ` · ID ${escapeHtml(shop.api_shop_id)}` : ''}</div>
              </div>
              <span class="api-pill ${escapeHtml(shop.token_status?.code || 'missing')}">${escapeHtml(shop.token_status?.text || 'Chưa rõ')}</span>
            </div>
            <div class="api-shop-meta" style="margin-top:8px;">
              Access token: ${escapeHtml(formatMinutes(shop.access_expires_in_minutes))}<br>
              Refresh token: ${escapeHtml(formatMinutes(shop.refresh_expires_in_minutes))}
            </div>
            <div class="api-shop-actions">
              <button class="api-action-btn primary" ${disabled} onclick="runAdvancedApiAction(${jsArg('sync_orders')},${jsArg(shop.platform)},${jsArg(shop.display_name)})">Kéo đơn</button>
              <button class="api-action-btn" ${disabled} onclick="runAdvancedApiAction(${jsArg('sync_status')},${jsArg(shop.platform)},${jsArg(shop.display_name)})">Cập nhật trạng thái</button>
              <button class="api-action-btn" ${disabled} onclick="runAdvancedApiAction(${jsArg('sync_products')},${jsArg(shop.platform)},${jsArg(shop.display_name)})">Đồng bộ bài đăng</button>
              ${shopeeReadButton}
            </div>
            ${renderShopeeShopSnapshot(shop)}
          </div>
        `
      }).join('')}
    </div>
  `
}

function renderWebhooks(data) {
  const callbacks = data?.callback_urls || {}
  const events = data?.webhooks?.recent || []
  return `
    <div class="api-section-title">Webhook realtime</div>
    <div class="api-webhook-box">
      <div class="api-webhook-head">
        <div>
          <div class="api-feature-title">Callback cần bật trong sàn</div>
          <div class="api-feature-meta">Shopee/Lazada sẽ đẩy sự kiện về đây để OMS kéo lại đơn, tracking, trạng thái, chat, marketing và cảnh báo bài đăng.</div>
        </div>
      </div>
      <div class="api-webhook-label" style="margin-top:10px;">Shopee</div>
      <div class="api-webhook-url">${escapeHtml(callbacks.shopee || '')}</div>
      <div class="api-webhook-label" style="margin-top:10px;">Lazada</div>
      <div class="api-webhook-url">${escapeHtml(callbacks.lazada || '')}</div>
    </div>
    <div class="api-section-title">Sự kiện webhook gần đây</div>
    <div class="api-events">
      ${events.length ? events.slice(0, 8).map(event => `
        <div class="api-event">
          <strong>${platformText(event.platform)} · ${escapeHtml(event.status || 'ok')}</strong>
          <span class="api-shop-meta">${escapeHtml(event.shop || event.shop_id || 'Chưa nhận diện shop')} · ${escapeHtml(event.order_id || event.event_code || 'Sự kiện')}</span>
          <span class="api-shop-meta">${escapeHtml(event.message || '')} ${event.processed_at ? `· ${escapeHtml(event.processed_at)}` : ''}</span>
        </div>
      `).join('') : '<div class="api-webhook-box">Chưa có webhook nào được ghi nhận.</div>'}
    </div>
  `
}

function renderAdvancedState(data, modulesData) {
  const body = document.getElementById('apiAdvancedBody')
  if (!body) return
  body.innerHTML = `
    <div class="api-advanced-top">
      ${renderKpis(data, modulesData)}
      ${renderWorkspaces(modulesData)}
      ${renderPermissionMatrix(data?.permission_matrix)}
      ${renderModules(modulesData)}
      ${renderSignals(modulesData)}
      ${renderShops(data?.shops || [])}
      ${renderWebhooks(data)}
      ${renderFeatures(data?.features || [])}
    </div>
  `
}

async function fetchJson(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...(options || {}) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
  return data
}

export async function loadAdvancedApiFeatures() {
  const body = document.getElementById('apiAdvancedBody')
  if (body) body.innerHTML = '<div class="empty-state"><p>Đang tải dữ liệu API...</p></div>'
  try {
    const features = await fetchJson(`${API}/api/advanced/features`)
    let modules = null
    try {
      modules = await fetchJson(`${API}/api/advanced/modules`)
    } catch (error) {
      modules = { status: 'error', modules: [], signals: [], error: error.message }
    }
    advancedState = features
    advancedModulesState = modules
    renderAdvancedState(advancedState, advancedModulesState)
  } catch (error) {
    if (body) body.innerHTML = `<div class="empty-state"><p>Không tải được Trung tâm API: ${escapeHtml(error.message)}</p></div>`
  }
}

export function openAdvancedApiFeatures() {
  const overlay = ensureAdvancedModal()
  overlay.classList.add('open')
  loadAdvancedApiFeatures()
}

export function closeAdvancedApiFeatures() {
  document.getElementById('apiAdvancedModal')?.classList.remove('open')
}

function openAdvancedApiFromHash() {
  if (window.location.hash !== '#api-advanced') return
  window.setTimeout(() => openAdvancedApiFeatures(), 250)
}

export function openAdvancedModuleHref(href) {
  const target = String(href || '')
  if (!target) return
  if (target.startsWith('#')) {
    document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
  window.location.href = target
}

export async function runAdvancedApiAction(action, platform, shop) {
  const text = {
    sync_orders: 'Đang kéo đơn qua API...',
    sync_status: 'Đang cập nhật trạng thái qua API...',
    sync_products: 'Đang đồng bộ bài đăng qua API...'
  }[action] || 'Đang chạy API...'
  showToast(text)

  try {
    const data = await fetchJson(`${API}/api/advanced/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, platform, shop })
    })
    showToast('Đã chạy xong thao tác API.')
    await loadAdvancedApiFeatures()
    if (typeof window.loadOrders === 'function' && action !== 'sync_products') window.loadOrders(1)
    return data
  } catch (error) {
    showToast(`Lỗi API: ${error.message}`)
    return null
  }
}

export async function readAdvancedShopeeShopSnapshot(shop) {
  showToast('Đang đọc hồ sơ, kho, thông báo và chế độ nghỉ Shopee...')
  try {
    const data = await fetchJson(`${API}/api/shops/shopee-snapshot?shop=${encodeURIComponent(shop)}`)
    // Chỉ hiển thị bản đọc tạm để đối chiếu, chưa lưu thành cấu hình chuẩn.
    shopeeShopSnapshotState = data
    renderAdvancedState(advancedState, advancedModulesState)
    showToast(data.failed ? 'Đã đọc Shopee Shop API, có một số endpoint trả lỗi quyền.' : 'Đã đọc Shopee Shop API.')
    return data
  } catch (error) {
    showToast(`Lỗi đọc Shopee Shop API: ${error.message}`)
    return null
  }
}

export async function runAdvancedModuleAction(action, platform = '', shop = '') {
  const text = {
    refresh_order_phase1: 'Đang làm mới order phase 1...',
    preview_order_phase2: 'Đang tạo preview dry-run order phase 2...',
    refresh_orders: 'Đang kéo đơn mới cho module...',
    refresh_products: 'Đang làm mới bài đăng, giá, tồn và SKU...',
    refresh_finance: 'Đang cập nhật phí và lãi thực...',
    refresh_returns: 'Đang cập nhật hoàn/trả/khiếu nại...',
    refresh_customer_care: 'Đang làm mới CSKH và hiệu suất shop...',
    refresh_marketing: 'Đang làm mới marketing, SKU và phí ads...',
    read_open_campaign_products: 'Đang đọc Shopee AMS Open Campaign...',
    sync_marketplace_reviews: 'Đang cập nhật đánh giá sản phẩm...',
    sync_lazada_review_batch: 'Đang chạy batch Lazada review nhiều cửa sổ 7 ngày...',
    repair_review_catalog_mapping: 'Đang sửa mapping review từ product catalog...',
    drain_push_queue: 'Đang chạy hàng đợi push incremental...'
  }[action] || 'Đang chạy module API...'
  showToast(text)

  try {
    const data = await fetchJson(`${API}/api/advanced/modules/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, platform, shop })
    })
    showToast(data.message || 'Đã cập nhật module.')
    await loadAdvancedApiFeatures()
    if (typeof window.loadOrders === 'function' && ['refresh_order_phase1', 'preview_order_phase2', 'refresh_orders', 'refresh_finance', 'refresh_returns', 'refresh_customer_care'].includes(action)) {
      window.loadOrders(1)
    }
    return data
  } catch (error) {
    showToast(`Lỗi module API: ${error.message}`)
    return null
  }
}

window.closeAdvancedApiFeatures = closeAdvancedApiFeatures
window.openAdvancedModuleHref = openAdvancedModuleHref
window.runAdvancedApiAction = runAdvancedApiAction
window.readAdvancedShopeeShopSnapshot = readAdvancedShopeeShopSnapshot
window.runAdvancedModuleAction = runAdvancedModuleAction

window.addEventListener('DOMContentLoaded', openAdvancedApiFromHash)
window.addEventListener('hashchange', openAdvancedApiFromHash)
openAdvancedApiFromHash()
