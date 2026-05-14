// NEO: Frontend chat sàn - nhóm settings-api-knowledge-panels. Giữ file dưới 30KB; tính năng mới tách thành file fe-chat-* riêng.
function renderChatApiShopStatusRows(shops = []) {
  if (!shops.length) return '<div class="chat-empty">Chưa có shop nào trong bảng chat core.</div>'
  return `
    <div class="chat-api-shop-list">
      ${shops.map(shop => {
        const name = shop.display_name || shop.shop_name || shop.user_name || shop.api_shop_id || 'Shop'
        const conversations = Number(shop.conversations || 0)
        const unread = Number(shop.unread || 0)
        const statusText = chatShopApiStatusText(shop)
        const docsText = chatCapabilityDocsLabel(shop)
        const note = shop.chat_api_note || ''
        const automationNote = shop.automation_note || ''
        const capabilities = shop.capabilities || {}
        const apiMode = !chatShopNeedsAutomation(shop)
        const lazadaChat = String(shop.platform || '').toLowerCase() === 'lazada' ? chatLazadaChatApiState(shop) : null
        const pillText = lazadaChat
          ? (lazadaChat.connected && !lazadaChat.accessExpired ? 'API thật · chat OK' : 'API thật · chat cần nối lại')
          : (apiMode ? 'API thật' : (String(shop.chat_transport || shop.transport || '').toLowerCase() === 'off' ? 'Tắt' : 'Chrome'))
        return `
          <div class="chat-api-shop-row chat-api-shop-row-detailed">
            <div>
              <div class="chat-context-name">${chatEscape(chatPlatformLabel(shop.platform))} · ${chatEscape(name)}</div>
              <div class="chat-context-meta">${chatEscape(statusText)} · ${chatEscape(docsText)} · ${conversations.toLocaleString('vi-VN')} hội thoại · ${unread.toLocaleString('vi-VN')} chưa đọc</div>
              ${capabilities.summary ? `<div class="chat-context-muted">${chatEscape(capabilities.summary)}</div>` : ''}
              ${note ? `<div class="chat-context-muted">${chatEscape(note)}</div>` : ''}
              ${automationNote ? `<div class="chat-context-muted">${chatEscape(automationNote)}</div>` : ''}
              <div class="chat-capability-grid">
                <div class="chat-capability-card">
                  <div class="chat-capability-title">${apiMode ? 'Shop này đang làm được' : 'Luồng fallback đang làm được'}</div>
                  ${chatCapabilityListHtml(apiMode ? capabilities.api_features : capabilities.fallback_features, apiMode ? 'Chưa có capability API nổi bật cho shop này.' : 'Chưa có capability fallback nổi bật cho shop này.')}
                </div>
                <div class="chat-capability-card">
                  <div class="chat-capability-title">${apiMode ? 'Chưa làm hoặc cần guard' : 'Điểm shop không API còn thiếu'}</div>
                  ${chatCapabilityListHtml(capabilities.pending_features, 'Chưa có ghi chú thiếu quyền hoặc hạn chế nào.')}
                </div>
                ${renderChatShopeePermissionProbeManager(shop)}
                ${renderChatLazadaChatApiManager(shop)}
              </div>
            </div>
            <span class="chat-pill ${chatCapabilityPillClass(shop)}">${pillText}</span>
          </div>
        `
      }).join('')}
    </div>
  `
}

window.testShopeeChatApiFromSettings = async function(shopId) {
  const shop = (chatState.shops || []).find(item => Number(item.id || 0) === Number(shopId))
  if (!shop?.id) {
    setChatGuardStatus('Không tìm thấy shop Shopee để test quyền Chat API.', 'blocked')
    return
  }
  const key = chatShopeeProbeKey(shop)
  chatState.shopeeChatProbeByShop[key] = { status: 'loading', summary: {}, attempts: [] }
  if (chatEl('chatAutomationSettingsModal')?.classList.contains('open')) {
    await window.openChatAutomationSettings(chatState.activeSettingsTab || 'automation')
  }
  try {
    setChatGuardStatus(`Đang test quyền Shopee Chat API cho ${shop.display_name || shop.shop_name || shop.api_shop_id}...`, 'muted')
    const data = await chatFetch('/api/chat/shopee-permission-probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: shop.api_shop_id || shop.shop_name || shop.user_name || '',
        include_invalid_write_probe: true
      }),
      timeoutMs: 70000
    })
    chatState.shopeeChatProbeByShop[key] = data
    if (chatEl('chatAutomationSettingsModal')?.classList.contains('open')) {
      await window.openChatAutomationSettings(chatState.activeSettingsTab || 'automation')
    }
    setChatGuardStatus(`Đã test quyền Shopee Chat API: ${chatProbeSummaryLabel(data.summary || {})}.`, 'ok')
  } catch (error) {
    chatState.shopeeChatProbeByShop[key] = {
      status: 'error',
      summary: { error: 1 },
      attempts: [{ stage: 'frontend', classification: 'error', message: chatErrorMessage(error) }]
    }
    if (chatEl('chatAutomationSettingsModal')?.classList.contains('open')) {
      await window.openChatAutomationSettings(chatState.activeSettingsTab || 'automation')
    }
    setChatGuardStatus(`Test quyền Shopee Chat API lỗi: ${chatErrorMessage(error)}`, 'blocked')
  }
}

window.reconnectLazadaChatApiFromSettings = function(shopId) {
  const shop = (chatState.shops || []).find(item => Number(item.id || 0) === Number(shopId))
  if (!shop?.id) {
    setChatGuardStatus('Không tìm thấy shop Lazada để kết nối lại Chat API.', 'blocked')
    return
  }
  window.location.href = API + '/api/auth/lazada/chat/url'
}

window.syncLazadaChatApiFromSettings = async function(shopId) {
  const shop = (chatState.shops || []).find(item => Number(item.id || 0) === Number(shopId))
  if (!shop?.id) {
    setChatGuardStatus('Không tìm thấy shop Lazada để đồng bộ chat.', 'blocked')
    return
  }
  const state = chatLazadaChatApiState(shop)
  if (!state.connected || state.accessExpired) {
    setChatGuardStatus('Lazada Chat API chưa sẵn sàng. Hãy kết nối lại hoặc gia hạn chat trước.', 'blocked')
    return
  }
  try {
    setChatGuardStatus('Đang đồng bộ chat Lazada từ IM API...', 'muted')
    const response = await chatFetch('/api/chat/api-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'lazada',

        shop: shop.shop_name || shop.user_name || shop.api_shop_id || '',
        days: 60,
        limit: 40
      }),
      timeoutMs: 45000
    })
    const result = Array.isArray(response.results)
      ? response.results.find(item => String(item.platform || '').toLowerCase() === 'lazada')
      : null
    const sessions = Number(result?.pulled_sessions || result?.saved_conversations || 0).toLocaleString('vi-VN')
    const messages = Number(result?.pulled_messages || result?.saved_messages || 0).toLocaleString('vi-VN')
    const successMessage = `Đã đồng bộ chat Lazada: ${sessions} hội thoại · ${messages} tin nhắn.`
    await Promise.allSettled([
      loadChatShopsInBackground(),
      loadChatConversations({ silent: true, preserveSelection: true })
    ])
    if (chatEl('chatAutomationSettingsModal')?.classList.contains('open')) {
      await window.openChatAutomationSettings(chatState.activeSettingsTab || 'automation')
    }
    setChatGuardStatus(successMessage, 'ok')
  } catch (error) {
    setChatGuardStatus(`Đồng bộ chat Lazada lỗi: ${error.message}`, 'blocked')
  }
}

window.disconnectLazadaChatApiFromSettings = async function(shopId) {
  const shop = (chatState.shops || []).find(item => Number(item.id || 0) === Number(shopId))
  if (!shop?.id) {
    setChatGuardStatus('Không tìm thấy shop Lazada để ngắt Chat API.', 'blocked')
    return
  }
  const confirmed = window.confirm(`Ngắt riêng Lazada Chat API của shop "${shop.display_name || shop.shop_name || shop.user_name || shop.id}"? API chính vẫn giữ nguyên.`)
  if (!confirmed) return
  try {
    const response = await chatFetch('/api/shops/disconnect-chat-api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop_id: shop.id }),
      timeoutMs: 20000
    })
    const successMessage = response.message || 'Đã ngắt Lazada Chat API.'
    await loadChatShopsInBackground()
    if (chatEl('chatAutomationSettingsModal')?.classList.contains('open')) {
      await window.openChatAutomationSettings(chatState.activeSettingsTab || 'automation')
    }
    setChatGuardStatus(successMessage, 'ok')
  } catch (error) {
    setChatGuardStatus(`Ngắt Lazada Chat API lỗi: ${error.message}`, 'blocked')
  }
}

function renderChatAutomationGuide(setup = {}) {
  const endpoint = setup.automation_ingest || `${API}/api/chat/automation-ingest`
  const guideItems = setup.transport_guide?.items || [
    'Shop có API: ưu tiên API, không mở Chrome tự động.',
    'Shop không API: quét ngoài để tiết kiệm tài nguyên; chỉ mở sâu khi cần xác minh khách hoặc tin mới.',
    'Hội thoại nghi trùng sẽ được gộp về một khách chính, không xóa dữ liệu gốc.'
  ]
  const matrix = setup.feature_matrix || {}
  const apiNotes = (matrix.api_shop_can || []).map(chatEscape).join(' · ') || 'chưa có ghi chú'
  const fallbackNotes = (matrix.non_api_shop_limitations || []).map(chatEscape).join(' · ') || 'chưa có ghi chú'
  return `
    <div class="chat-automation-guide">
      <div class="chat-shop-name">Luồng đồng bộ chat</div>
      <div class="chat-shop-meta">Core tự chọn API hoặc Chrome theo capability từng shop.</div>
      <div class="chat-settings-note">${guideItems.map(item => chatEscape(item)).join('<br>')}</div>
      <div class="chat-capability-summary">
        <div><b>${Number(matrix.api_ready || 0).toLocaleString('vi-VN')}</b><span>shop API thật</span></div>
        <div><b>${Number(matrix.browser_fallback || 0).toLocaleString('vi-VN')}</b><span>shop Chrome fallback Shopee/TikTok</span></div>
        <div><b>${Number(matrix.lazada_mark_read_ready || 0).toLocaleString('vi-VN')}</b><span>Lazada đọc chính thức</span></div>
        <div><b>${Number(matrix.shopee_guarded || 0).toLocaleString('vi-VN')}</b><span>Shopee đang guard</span></div>
      </div>
      <div class="chat-context-muted">Shop API đang làm được: ${apiNotes}.</div>
      <div class="chat-context-muted">Shop không API còn thiếu: ${fallbackNotes}.</div>
      <div class="chat-callback">Endpoint automation: ${chatEscape(endpoint)}</div>
      <button class="chat-settings-save secondary" type="button" onclick="warmChatAutomationBrowsers()">Mở sẵn trình duyệt shop</button>
      <button class="chat-settings-save secondary" type="button" onclick="syncChatAutomationContent()">Chạy đồng bộ automation</button>
    </div>
  `
}

function renderChatAutomationSettingsPanel(data = {}, shops = []) {
  const setup = data.setup || {}
  const apiCount = shops.filter(shop => !chatShopNeedsAutomation(shop)).length
  const fallbackCount = shops.filter(chatShopNeedsAutomation).length
  return `
    <div class="chat-settings-card">
      <div class="chat-settings-head">
        <div>
          <div class="chat-shop-name">Tự động hóa chat theo từng nhóm shop</div>
          <div class="chat-shop-meta">Shop có API đi luồng chính thức. Chrome fallback chỉ còn cho Shopee hoặc TikTok; Lazada chỉ dùng IM API chính thức.</div>
        </div>
        <span class="chat-pill ${chatState.autoAutomationEnabled ? 'api' : 'off'}">${chatState.autoAutomationEnabled ? `Bật · ${chatAutomationRangeLabel()}` : 'Đang tắt'}</span>
      </div>
      <div class="chat-capability-summary">
        <div><b>${apiCount.toLocaleString('vi-VN')}</b><span>shop API thật</span></div>
        <div><b>${fallbackCount.toLocaleString('vi-VN')}</b><span>shop Chrome fallback Shopee/TikTok</span></div>
        <div><b>${chatAutomationApiReadyShopeeAliases().length.toLocaleString('vi-VN')}</b><span>alias Shopee đã loại khỏi Chrome</span></div>
        <div><b>${Number(chatState.conversations.length || 0).toLocaleString('vi-VN')}</b><span>hội thoại đang hiển thị</span></div>
      </div>
      <div class="chat-auto-sync-summary">
        <div>
          <b>Shop có API</b>
          <span>Tự đồng bộ bằng API/polling. Không mở Chrome để tránh tách trùng hội thoại.</span>
        </div>
        <div>
          <b>Shop fallback</b>
          <span>Dùng Chrome theo lịch ngẫu nhiên, chỉ mở sâu khi helper local xác định cần quét.</span>
        </div>
      </div>
      <label class="chat-toggle-row">
        <input id="chatAutoAutomationEnabled" type="checkbox">
        <span>Tự động kéo tin nhắn cho shop fallback</span>
      </label>
      <div class="chat-automation-grid">
        <label>
          <span>Chạy ngẫu nhiên từ</span>
          <div class="chat-input-suffix">
            <input id="chatAutoAutomationMinMinutes" class="chat-settings-input" type="number" min="1" max="120" step="1">
            <span>phút</span>
          </div>
        </label>
        <label>
          <span>Đến</span>
          <div class="chat-input-suffix">
            <input id="chatAutoAutomationMaxMinutes" class="chat-settings-input" type="number" min="1" max="120" step="1">
            <span>phút</span>
          </div>
        </label>
        <label class="chat-automation-scope">
          <span>Phạm vi chạy</span>
          <input class="chat-settings-input" value="Shopee hoặc TikTok chưa có API chat chính thức" disabled>
        </label>
        <label>
          <span>Rộng Chrome</span>
          <div class="chat-input-suffix">
            <input id="chatAutomationBrowserWidth" class="chat-settings-input" type="number" min="200" max="1800" step="10">
            <span>px</span>
          </div>
        </label>
        <label>
          <span>Cao Chrome</span>
          <div class="chat-input-suffix">
            <input id="chatAutomationBrowserHeight" class="chat-settings-input" type="number" min="300" max="1200" step="10">
            <span>px</span>
          </div>
        </label>
        <label>
          <span>Vị trí trái</span>
          <div class="chat-input-suffix">
            <input id="chatAutomationBrowserLeft" class="chat-settings-input" type="number" min="0" max="4000" step="10">
            <span>px</span>
          </div>
        </label>
        <label>
          <span>Vị trí trên</span>
          <div class="chat-input-suffix">
            <input id="chatAutomationBrowserTop" class="chat-settings-input" type="number" min="0" max="2400" step="10">
            <span>px</span>
          </div>
        </label>
        <label class="chat-toggle-row">
          <input id="chatAutomationBrowserMinimized" type="checkbox">
          <span>Mở Chrome thu nhỏ</span>
        </label>
        <label class="chat-toggle-row">
          <input id="chatAutomationExpandViewport" type="checkbox">
          <span>Cho phép phóng viewport khi cần debug</span>
        </label>
      </div>
      <div class="chat-settings-actions">
        <button type="button" class="chat-settings-save secondary" id="chatWebhookSyncBtn" onclick="syncChatConversations()">Nhập webhook cũ</button>
        <button type="button" class="chat-settings-save secondary" id="chatWarmBrowserBtn" onclick="warmChatAutomationBrowsers()">Mở Chrome Shopee/TikTok</button>
        <button type="button" class="chat-settings-save secondary" id="chatAutomationSyncBtn" onclick="runChatAutomationNowFromSettings()">Chạy automation Shopee/TikTok</button>
        <button type="button" class="chat-settings-save" onclick="saveChatAutomationSettings()">Lưu cài đặt</button>
      </div>
      <div id="chatAutomationSettingsStatus" class="chat-settings-note"></div>
    </div>

    <div class="chat-settings-card">
      <div class="chat-settings-head">
        <div>
          <div class="chat-shop-name">Trạng thái từng shop</div>
          <div class="chat-shop-meta">Mỗi shop phải hiện rõ đang đi API thật hay đang fallback Chrome để bạn kiểm tra nhanh.</div>
        </div>
      </div>
      ${renderChatApiShopStatusRows(shops)}
    </div>

    <div class="chat-settings-card">
      ${renderChatAutomationGuide(setup)}
    </div>
  `
}

function renderChatSettingsSummary(data = {}) {
  const shops = Array.isArray(data.shops) && data.shops.length
    ? data.shops
    : (Array.isArray(chatState.shops) ? chatState.shops : [])
  const apiCount = shops.filter(shop => !chatShopNeedsAutomation(shop)).length
  const fallbackCount = shops.filter(chatShopNeedsAutomation).length
  const settings = currentChatSettings()
  const activeConversation = chatState.activeConversation
  const activeLabel = activeConversation
    ? `${chatPlatformLabel(activeConversation.platform)} · ${activeConversation.shop || activeConversation.shop_display_name || 'shop'}`
    : 'Chưa chọn hội thoại'
  return `
    <div class="chat-settings-summary">
      <div class="chat-settings-summary-head">
        <div>
          <div class="chat-shop-name">Cài đặt chat vận hành</div>
          <div class="chat-shop-meta">Tách riêng phần cài đặt khỏi panel hội thoại để đội CSKH kiểm tra, đổi luật và chạy automation dễ hơn.</div>
        </div>
        <span class="chat-pill ${Number(settings.ai_enabled) ? 'api' : 'off'}">${Number(settings.ai_enabled) ? 'AI bật' : 'AI tắt'}</span>
      </div>
      <div class="chat-capability-summary">
        <div><b>${apiCount.toLocaleString('vi-VN')}</b><span>shop API thật</span></div>
        <div><b>${fallbackCount.toLocaleString('vi-VN')}</b><span>shop fallback</span></div>
        <div><b>${Number((settings.blocked_keywords || []).length || 0).toLocaleString('vi-VN')}</b><span>từ khóa đang chặn</span></div>
        <div><b>${chatState.autoAutomationEnabled ? chatAutomationRangeLabel() : 'Tắt'}</b><span>chu kỳ automation</span></div>
      </div>
      <div class="chat-settings-summary-note">Hội thoại đang mở: ${chatEscape(activeLabel)}.</div>
    </div>
  `
}

function hydrateChatAutomationSettingsForm() {
  const enabled = chatEl('chatAutoAutomationEnabled')
  const min = chatEl('chatAutoAutomationMinMinutes')
  const max = chatEl('chatAutoAutomationMaxMinutes')
  const runtime = chatReadAutomationRuntimeSettings()
  if (enabled) enabled.checked = Boolean(chatState.autoAutomationEnabled)
  if (min) min.value = String(chatState.autoAutomationMinMinutes || chatState.autoAutomationMinutes || 5)
  if (max) max.value = String(chatState.autoAutomationMaxMinutes || chatState.autoAutomationMinutes || 5)
  if (chatEl('chatAutomationBrowserWidth')) chatEl('chatAutomationBrowserWidth').value = String(runtime.browser_width)
  if (chatEl('chatAutomationBrowserHeight')) chatEl('chatAutomationBrowserHeight').value = String(runtime.browser_height)
  if (chatEl('chatAutomationBrowserLeft')) chatEl('chatAutomationBrowserLeft').value = String(runtime.browser_left)
  if (chatEl('chatAutomationBrowserTop')) chatEl('chatAutomationBrowserTop').value = String(runtime.browser_top)
  if (chatEl('chatAutomationBrowserMinimized')) chatEl('chatAutomationBrowserMinimized').checked = Boolean(runtime.browser_minimized)
  if (chatEl('chatAutomationExpandViewport')) chatEl('chatAutomationExpandViewport').checked = Boolean(runtime.expand_browser_viewport)
}

function renderChatAutomationSettingsModal() {
  const modal = chatEl('chatAutomationSettingsModal')
  const body = chatEl('chatAutomationSettingsBody')
  if (!modal || !body) return
  const data = chatState.setupData || {}
  const shops = Array.isArray(data.shops) && data.shops.length
    ? data.shops
    : (Array.isArray(chatState.shops) ? chatState.shops : [])
  const settings = currentChatSettings()
  const safeTab = chatNormalizeSettingsTab(chatState.activeSettingsTab)
  chatState.activeSettingsTab = safeTab
  const panelHtml = {
    automation: renderChatAutomationSettingsPanel(data, shops),
    rules: renderChatRulesPanel(data, settings, shops),
    knowledge: renderChatKnowledgePanel(),
    keywords: renderChatKeywordsPanel(settings),
    advisories: renderChatProductAdvisoriesPanel(chatState.context)
  }[safeTab] || renderChatAutomationSettingsPanel(data, shops)
  body.innerHTML = `
    ${renderChatSettingsSummary(data)}
    ${chatSettingsTabs()}
    <div class="chat-settings-modal-panel">
      ${panelHtml}
    </div>
  `
  if (safeTab === 'automation') {
    hydrateChatAutomationSettingsForm()
    renderChatAutomationSettingsStatus()
  }
  if (chatEl('chatNotifyStatus')) {
    updateChatNotifyStatus(
      typeof Notification !== 'undefined' && Notification.permission === 'granted'
        ? 'Thiết bị này đã cấp quyền thông báo cho OMS.'
        : 'Trên iPhone: mở bằng Safari, thêm OMS vào Màn hình chính, mở từ icon rồi bật thông báo.',
      typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'ok' : 'muted'
    )
  }
}

function renderChatKnowledgePanel() {
  const items = chatState.knowledgeItems || []
  const query = chatState.knowledgeQuery || ''
  return `
    <div class="chat-settings-card">
      <div class="chat-settings-head">
        <div>
          <div class="chat-shop-name">Mẫu AI đã duyệt</div>
          <div class="chat-shop-meta">Chỉ các mẫu đã kiểm tra mới được đưa vào ngữ cảnh Gemini. Không tự học toàn bộ chat.</div>
        </div>
        <button class="chat-settings-save secondary" type="button" onclick="loadChatKnowledge()">Tải mẫu</button>
      </div>
      <div class="chat-keyword-tools">
        <input id="chatKnowledgeSearch" class="chat-settings-input" placeholder="Tìm câu hỏi, câu trả lời, nhóm..." value="${chatEscape(query)}" oninput="filterChatKnowledge(this.value)">
        <button class="chat-settings-save" type="button" onclick="loadChatKnowledge()">Lọc</button>
      </div>
      ${chatState.knowledgeLoading ? '<div class="chat-empty">Đang tải mẫu AI...</div>' : ''}
      ${items.length ? items.slice(0, 20).map(item => `
        <div class="chat-context-card compact chat-knowledge-row">
          <div class="chat-context-head">
            <div>
              <div class="chat-context-title">${chatEscape(item.category || 'CSKH chung')}</div>
              <div class="chat-context-meta">${chatEscape(chatPlatformLabel(item.platform))} · ${chatEscape(item.shop || 'Tất cả shop')} · dùng ${Number(item.usage_count || 0).toLocaleString('vi-VN')} lần</div>
            </div>
            <span class="chat-pill api">${chatEscape(item.status || 'approved')}</span>
          </div>
          <div class="chat-knowledge-qa"><b>Khách:</b> ${chatEscape(chatShortText(item.question || '', 180))}</div>
          <div class="chat-knowledge-qa"><b>Shop:</b> ${chatEscape(chatShortText(item.answer || '', 220))}</div>
          <div class="chat-context-muted">Cập nhật: ${chatEscape(chatTime(item.updated_at) || '-')}</div>
        </div>
      `).join('') : '<div class="chat-empty">Chưa có mẫu AI đã duyệt cho bộ lọc này. Trong hội thoại, bấm “Lưu mẫu AI” dưới câu trả lời của shop để thêm mẫu.</div>'}
    </div>
  `
}
