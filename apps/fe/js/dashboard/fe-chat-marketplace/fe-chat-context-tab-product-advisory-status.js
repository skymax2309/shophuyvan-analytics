// NEO: Frontend chat sàn - nhóm context-tab-product-advisory-status. Giữ file dưới 30KB; tính năng mới tách thành file fe-chat-* riêng.
function chatNormalizeContextTab(tab = '') {
  const key = String(tab || '').trim().toLowerCase()
  return CHAT_CONTEXT_TABS.has(key) ? key : 'orders'
}

function chatNormalizeSettingsTab(tab = '') {
  const key = String(tab || '').trim().toLowerCase()
  return CHAT_SETTINGS_TABS.has(key) ? key : 'automation'
}

function chatContextTabs() {
  const tabs = [
    ['orders', 'Đơn hàng'],
    ['products', 'Sản phẩm'],
    ['vouchers', 'Voucher']
  ]
  return `
    <div class="chat-side-tabs">
      ${tabs.map(([id, label]) => `
        <button type="button" class="${chatNormalizeContextTab(chatState.activeSideTab) === id ? 'active' : ''}" onclick="setChatSideTab('${id}')">${chatEscape(label)}</button>
      `).join('')}
    </div>
  `
}

function chatSettingsTabs() {
  const tabs = [
    ['automation', 'Tự động hóa'],
    ['ai-auto', 'AI theo shop'],
    ['rules', 'AI & Luật'],
    ['knowledge', 'Mẫu AI'],
    ['keywords', 'Từ khóa'],
    ['advisories', 'Lưu ý SP']
  ]
  return `
    <div class="chat-side-tabs chat-settings-tabs">
      ${tabs.map(([id, label]) => `
        <button type="button" class="${chatNormalizeSettingsTab(chatState.activeSettingsTab) === id ? 'active' : ''}" onclick="setChatSettingsTab('${id}')">${chatEscape(label)}</button>
      `).join('')}
    </div>
  `
}

function chatAdvisoryMatchesActiveConversation(advisory = {}, conversation = chatState.activeConversation || {}) {
  const advisoryPlatform = String(advisory.platform || '').trim().toLowerCase()
  const conversationPlatform = String(conversation.platform || '').trim().toLowerCase()
  if (advisoryPlatform && conversationPlatform && advisoryPlatform !== conversationPlatform) return false

  const advisoryShops = [advisory.shop_id, advisory.shop].map(chatNormalizeShopValue).filter(Boolean)
  if (!advisoryShops.length) return true

  const resolvedShop = chatResolveConversationShop(conversation || {})
  const conversationShops = new Set([
    conversation.shop_id,
    conversation.shop,
    conversation.shop_display_name,
    resolvedShop?.api_shop_id,
    resolvedShop?.display_name,
    resolvedShop?.shop_name,
    resolvedShop?.user_name,
    ...chatShopAliases(resolvedShop || {})
  ].map(chatNormalizeShopValue).filter(Boolean))
  if (!conversationShops.size) return true
  return advisoryShops.some((value) => conversationShops.has(value))
}

function chatProductUrlMatchesPlatform(url = '', platform = '') {
  const host = String(url || '').trim().toLowerCase()
  const key = String(platform || '').trim().toLowerCase()
  if (!host || !key) return false
  if (key === 'shopee') return host.includes('shopee.')
  if (key === 'lazada') return host.includes('lazada.')
  if (key === 'tiktok') return host.includes('tiktok.')
  return false
}

// Link sản phẩm gửi kèm chỉ được dùng khi khớp đúng sàn và shop của hội thoại hiện tại, tránh lôi link Shopee sang Lazada/TikTok.

function chatSafeAdvisoryRelatedUrl(advisory = {}, conversation = chatState.activeConversation || {}) {
  const platform = String(conversation.platform || advisory.platform || '').trim().toLowerCase()
  const resolvedProduct = chatResolveAdvisoryRelatedProduct(advisory, conversation)
  if (resolvedProduct) {
    const resolvedUrl = chatProductUrl(resolvedProduct)
    if (resolvedUrl && chatProductUrlMatchesPlatform(resolvedUrl, platform)) return resolvedUrl
  }
  const url = String(advisory.related_product_url || '').trim()
  if (!url) return ''
  if (!chatAdvisoryMatchesActiveConversation(advisory, conversation)) return ''
  if (!chatProductUrlMatchesPlatform(url, platform)) return ''
  return url
}

function chatAdvisoryCanAttachProduct(advisory = {}, conversation = chatState.activeConversation || {}) {
  if (!chatAdvisoryMatchesActiveConversation(advisory, conversation)) return false
  if (chatResolveAdvisoryRelatedProduct(advisory, conversation)) return true
  return Boolean(advisory?.related_item_id)
}

function chatAdvisoryReplyText(advisory = {}) {
  const related = advisory.related_product_name || advisory.related_item_id
  const relatedUrl = chatSafeAdvisoryRelatedUrl(advisory)
  const canAttachProduct = chatAdvisoryCanAttachProduct(advisory)
  return [
    advisory.message || '',
    relatedUrl ? `Link sản phẩm gửi kèm: ${relatedUrl}` : '',
    related && canAttachProduct ? `Shop sẽ gửi thêm sản phẩm ${related} ngay bên dưới để mình bấm xem trực tiếp ạ.` : ''
  ].filter(Boolean).join('\n\n')
}

// Luôn ưu tiên hiện link thật của sản phẩm gửi kèm để nhân viên kiểm tra nhanh, không chỉ thấy tên sản phẩm.
function renderChatAdvisoryRelatedProduct(item = {}, label = 'Sản phẩm gửi kèm') {
  const url = chatSafeAdvisoryRelatedUrl(item)
  const name = String(item.related_product_name || item.related_item_id || '').trim()
  if (url && name) {
    return `<div class="chat-context-muted">${chatEscape(label)}: <a class="chat-message-link" href="${chatEscape(url)}" target="_blank" rel="noopener" title="${chatEscape(url)}">${chatEscape(chatShortUrl(url))}</a> · ${chatEscape(name)}</div>`
  }
  if (url) {
    return `<div class="chat-context-muted">${chatEscape(label)}: <a class="chat-message-link" href="${chatEscape(url)}" target="_blank" rel="noopener" title="${chatEscape(url)}">${chatEscape(chatShortUrl(url))}</a></div>`
  }
  if (String(item.related_product_url || '').trim()) {
    return `<div class="chat-context-muted">${chatEscape(label)}: link đã khóa vì không khớp sàn hoặc shop hiện tại.</div>`
  }
  if (name) {
    return `<div class="chat-context-muted">${chatEscape(label)}: ${chatEscape(name)}</div>`
  }
  return ''
}

function chatMatchedAdvisories(context) {
  return Array.isArray(context?.product_advisories) ? context.product_advisories : []
}

function renderChatProductAdvisoriesPanel(context) {
  const matched = chatMatchedAdvisories(context)
  const items = chatState.advisoryItems || []
  const query = chatState.advisoryQuery || ''
  const matchedHtml = matched.length ? matched.map((item, index) => `
    <div class="chat-context-card compact chat-advisory-card ${item.severity === 'required' ? 'required' : ''}">
      <div class="chat-context-head">
        <div>
          <div class="chat-context-title">${chatEscape(item.title || item.trigger_value || 'Lưu ý sản phẩm')}</div>
          <div class="chat-context-meta">${chatEscape(item.match?.reason || item.trigger_type || '')} · ${chatEscape(item.severity || 'required')}</div>
        </div>
        <span class="chat-pill notice">${chatEscape(item.severity === 'required' ? 'Bắt buộc' : 'Lưu ý')}</span>
      </div>
      <div class="chat-knowledge-qa">${chatEscape(item.message || '')}</div>
      ${item.related_item_id ? renderChatAdvisoryRelatedProduct(item, 'Sản phẩm gửi kèm') : ''}
      <div class="chat-context-actions">
        <button type="button" onclick="insertChatProductAdvisory(${index})">Chèn lưu ý</button>
        ${chatAdvisoryCanAttachProduct(item) ? `<button type="button" onclick="sendChatAdvisoryProductCard(${index}, this)">Gửi thẻ SP</button>` : ''}
      </div>
    </div>
  `).join('') : '<div class="chat-empty">Chưa có lưu ý sản phẩm nào khớp với hội thoại này.</div>'

  return `
    <div class="chat-settings-card">
      <div class="chat-settings-head">
        <div>
          <div class="chat-shop-name">Lưu ý sản phẩm đang khớp</div>
          <div class="chat-shop-meta">Rule được khớp theo mã item, SKU hoặc từ khóa trong đơn hàng/thẻ sản phẩm của khách.</div>
        </div>
        <button class="chat-settings-save" type="button" onclick="openChatProductAdvisoryModal()">Thêm lưu ý</button>
      </div>
      ${matchedHtml}
    </div>
    <div class="chat-settings-card">
      <div class="chat-settings-head">
        <div>
          <div class="chat-shop-name">Danh sách lưu ý đã duyệt</div>
          <div class="chat-shop-meta">Dữ liệu này tách riêng khỏi mẫu AI để tránh AI nhắc sai sản phẩm.</div>
        </div>
        <button class="chat-settings-save secondary" type="button" onclick="loadChatProductAdvisories()">Tải lại</button>
      </div>
      <div class="chat-keyword-tools">
        <input id="chatAdvisorySearch" class="chat-settings-input" placeholder="Tìm item, SKU, từ khóa, nội dung..." value="${chatEscape(query)}" oninput="filterChatProductAdvisories(this.value)">
        <button class="chat-settings-save" type="button" onclick="loadChatProductAdvisories()">Lọc</button>
      </div>
      ${chatState.advisoryLoading ? '<div class="chat-empty">Đang tải lưu ý sản phẩm...</div>' : ''}
      ${items.length ? items.slice(0, 30).map(item => `
        <div class="chat-context-card compact chat-advisory-row">
          <div class="chat-context-head">
            <div>
              <div class="chat-context-title">${chatEscape(item.title || item.trigger_value || 'Lưu ý sản phẩm')}</div>
              <div class="chat-context-meta">${chatEscape(chatPlatformLabel(item.platform))} · ${chatEscape(item.shop || item.shop_id || 'Tất cả shop')} · ${chatEscape(item.trigger_type)}: ${chatEscape(item.trigger_value)}</div>
            </div>
            <span class="chat-pill ${item.status === 'active' ? 'api' : 'off'}">${chatEscape(item.status || 'active')}</span>
          </div>
          <div class="chat-knowledge-qa">${chatEscape(chatShortText(item.message || '', 220))}</div>
          ${renderChatAdvisoryRelatedProduct(item, 'Gửi kèm') || '<div class="chat-context-muted">Gửi kèm: không có</div>'}
          <div class="chat-context-actions">
            <button type="button" onclick="openChatProductAdvisoryModal(${Number(item.id || 0)})">Sửa</button>
            <button type="button" onclick="archiveChatProductAdvisory(${Number(item.id || 0)})">Ẩn</button>
          </div>
        </div>
      `).join('') : '<div class="chat-empty">Chưa có lưu ý sản phẩm. Bấm Thêm lưu ý để tạo rule đầu tiên.</div>'}
    </div>
  `
}

function renderChatProductAdvisoriesPanel(context) {
  const matched = chatMatchedAdvisories(context)
  const items = chatState.advisoryItems || []
  const query = chatState.advisoryQuery || ''
  const matchedHtml = matched.length ? matched.map((item, index) => `
    <div class="chat-context-card compact chat-advisory-card ${item.severity === 'required' ? 'required' : ''}">
      <div class="chat-context-head">
        <div>
          <div class="chat-context-title">${chatEscape(item.title || item.trigger_value || 'Lưu ý sản phẩm')}</div>
          <div class="chat-context-meta">Khớp: ${chatEscape(item.trigger_value || '')} · ${chatEscape(item.match?.reason || item.trigger_type || '')}</div>
        </div>
        <span class="chat-pill notice">${chatEscape(item.severity === 'required' ? 'Bắt buộc' : 'Lưu ý')}</span>
      </div>
      <div class="chat-knowledge-qa">${chatEscape(item.message || '')}</div>
      ${item.related_item_id ? renderChatAdvisoryRelatedProduct(item, 'Thẻ sản phẩm gửi kèm') : ''}
      <div class="chat-context-actions">
        <button type="button" onclick="insertChatProductAdvisory(${index})">Chèn lưu ý</button>
        ${chatAdvisoryCanAttachProduct(item) ? `<button type="button" onclick="sendChatAdvisoryProductCard(${index}, this)">Gửi thẻ SP</button>` : ''}
      </div>
    </div>
  `).join('') : '<div class="chat-empty">Chưa có lưu ý sản phẩm nào khớp với hội thoại này.</div>'

  return `
    <div class="chat-settings-card">
      <div class="chat-settings-head">
        <div>
          <div class="chat-shop-name">Lưu ý sản phẩm đang khớp</div>
          <div class="chat-shop-meta">AI sẽ chỉ nhắc khi hội thoại/đơn/thẻ chat khớp đúng sản phẩm đã chọn.</div>
        </div>
        <button class="chat-settings-save" type="button" onclick="openChatProductAdvisoryModal()">Thêm lưu ý</button>
      </div>
      ${matchedHtml}
    </div>
    <div class="chat-settings-card">
      <div class="chat-settings-head">
        <div>
          <div class="chat-shop-name">Danh sách lưu ý đã duyệt</div>
          <div class="chat-shop-meta">Mỗi lưu ý gắn với một sản phẩm cụ thể. Sửa để đổi sản phẩm hoặc nội dung nhắc khách.</div>
        </div>
        <button class="chat-settings-save secondary" type="button" onclick="loadChatProductAdvisories()">Tải lại</button>
      </div>
      <div class="chat-keyword-tools">
        <input id="chatAdvisorySearch" class="chat-settings-input" placeholder="Tìm tên sản phẩm, item, SKU, nội dung..." value="${chatEscape(query)}" oninput="filterChatProductAdvisories(this.value)">
        <button class="chat-settings-save" type="button" onclick="loadChatProductAdvisories()">Lọc</button>
      </div>
      ${chatState.advisoryLoading ? '<div class="chat-empty">Đang tải lưu ý sản phẩm...</div>' : ''}
      ${items.length ? items.slice(0, 30).map(item => `
        <div class="chat-context-card compact chat-advisory-row">
          <div class="chat-context-head">
            <div>
              <div class="chat-context-title">${chatEscape(item.title || item.trigger_value || 'Lưu ý sản phẩm')}</div>
              <div class="chat-context-meta">${chatEscape(chatPlatformLabel(item.platform))} · ${chatEscape(item.shop || item.shop_id || 'Tất cả shop')} · Sản phẩm: ${chatEscape(item.trigger_value || '')}</div>
            </div>
            <span class="chat-pill ${item.status === 'active' ? 'api' : 'off'}">${chatEscape(item.status || 'active')}</span>
          </div>
          <div class="chat-knowledge-qa">${chatEscape(chatShortText(item.message || '', 220))}</div>
          ${renderChatAdvisoryRelatedProduct(item, 'Thẻ gửi kèm') || '<div class="chat-context-muted">Thẻ gửi kèm: không có</div>'}
          <div class="chat-context-actions">
            <button type="button" onclick="openChatProductAdvisoryModal(${Number(item.id || 0)})">Sửa</button>
            <button type="button" onclick="archiveChatProductAdvisory(${Number(item.id || 0)})">Ẩn</button>
          </div>
        </div>
      `).join('') : '<div class="chat-empty">Chưa có lưu ý sản phẩm. Bấm Thêm lưu ý để chọn sản phẩm và tạo nội dung nhắc khách.</div>'}
    </div>
  `
}
