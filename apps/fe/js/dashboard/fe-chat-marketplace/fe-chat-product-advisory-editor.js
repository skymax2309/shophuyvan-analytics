// NEO: Frontend chat sàn - nhóm product-advisory-editor. Giữ file dưới 30KB; tính năng mới tách thành file fe-chat-* riêng.
function ensureChatProductAdvisoryModal() {
  let modal = chatEl('chatProductAdvisoryModal')

  if (modal) return modal
  modal = document.createElement('div')
  modal.id = 'chatProductAdvisoryModal'
  modal.className = 'chat-knowledge-modal'
  modal.hidden = true
  modal.innerHTML = `
    <div class="chat-quick-backdrop" onclick="closeChatProductAdvisoryModal()"></div>
    <section class="chat-knowledge-dialog" role="dialog" aria-modal="true" aria-labelledby="chatProductAdvisoryTitle">
      <div class="chat-quick-head">
        <div>
          <strong id="chatProductAdvisoryTitle">Lưu ý theo sản phẩm</strong>
          <small>Áp dụng khi hội thoại có đúng sản phẩm, SKU hoặc từ khóa đã cài.</small>
        </div>
        <button type="button" class="chat-quick-close" onclick="closeChatProductAdvisoryModal()" aria-label="Đóng">×</button>
      </div>
      <div class="chat-knowledge-grid">
        <label class="chat-field-label">Kiểu khớp
          <select id="chatAdvisoryTriggerType" class="chat-settings-input">
            <option value="keyword">Từ khóa tên sản phẩm</option>
            <option value="sku">SKU</option>
            <option value="item_id">Mã item Shopee</option>
            <option value="category">Nhóm/ngành hàng</option>
          </select>
        </label>
        <label class="chat-field-label">Giá trị khớp
          <input id="chatAdvisoryTriggerValue" class="chat-settings-input" placeholder="Ví dụ: máy hút chân không">
        </label>
        <label class="chat-field-label">Tiêu đề
          <input id="chatAdvisoryTitleInput" class="chat-settings-input" placeholder="Lưu ý túi hút chân không">
        </label>
        <label class="chat-field-label">Sản phẩm gửi kèm
          <input id="chatAdvisoryRelatedName" class="chat-settings-input" placeholder="Túi hút chân không">
        </label>
        <label class="chat-field-label">Item ID sản phẩm gửi kèm
          <input id="chatAdvisoryRelatedItemId" class="chat-settings-input" placeholder="Mã item Shopee của túi hút">
        </label>
        <label class="chat-field-label">Link sản phẩm nếu có
          <input id="chatAdvisoryRelatedUrl" class="chat-settings-input" placeholder="https://shopee.vn/product/...">
        </label>
      </div>
      <label class="chat-field-label">Nội dung bắt buộc nhắn cho khách</label>
      <textarea id="chatAdvisoryMessage" class="chat-settings-textarea" rows="7" placeholder="Dạ shop lưu ý thêm..."></textarea>
      <div class="chat-knowledge-grid">
        <label class="chat-field-label">Mức độ
          <select id="chatAdvisorySeverity" class="chat-settings-input">
            <option value="required">Bắt buộc nhắc</option>
            <option value="warning">Cảnh báo</option>
            <option value="info">Thông tin thêm</option>
          </select>
        </label>
        <label class="chat-field-label">Ưu tiên
          <input id="chatAdvisoryPriority" class="chat-settings-input" type="number" min="0" max="100" value="80">
        </label>
      </div>
      <div id="chatAdvisoryStatus" class="chat-settings-note"></div>
      <div class="chat-quick-actions">
        <button type="button" class="chat-settings-save secondary" onclick="closeChatProductAdvisoryModal()">Đóng</button>
        <button type="button" class="chat-settings-save" id="chatAdvisorySaveBtn" onclick="saveChatProductAdvisory()">Lưu lưu ý</button>
      </div>
    </section>
  `
  document.body.appendChild(modal)
  return modal
}

// UI mới cho lưu ý sản phẩm: chọn sản phẩm API trước, hệ thống tự sinh điều kiện khớp phía sau.
function ensureChatProductAdvisoryModal() {
  let modal = chatEl('chatProductAdvisoryModal')
  if (modal) return modal
  modal = document.createElement('div')
  modal.id = 'chatProductAdvisoryModal'
  modal.className = 'chat-knowledge-modal'
  modal.hidden = true
  modal.innerHTML = `
    <div class="chat-quick-backdrop" onclick="closeChatProductAdvisoryModal()"></div>
    <section class="chat-knowledge-dialog" role="dialog" aria-modal="true" aria-labelledby="chatProductAdvisoryTitle">
      <div class="chat-quick-head">
        <div>
          <strong id="chatProductAdvisoryTitle">Lưu ý theo sản phẩm</strong>
          <small>Chọn sản phẩm từ catalog API trước, sau đó nhập nội dung bắt buộc nhắn cho khách.</small>
        </div>
        <button type="button" class="chat-quick-close" onclick="closeChatProductAdvisoryModal()" aria-label="Đóng">×</button>
      </div>
      <div class="chat-advisory-modal-body">
        <div class="chat-advisory-step">
          <div class="chat-advisory-step-title">
            <b>1. Chọn sản phẩm cần nhắc lưu ý</b>
            <span>Hệ thống tự dùng item ID/SKU/tên sản phẩm để khớp, không cần gõ trigger thủ công.</span>
          </div>
          <input id="chatAdvisoryProductSearch" class="chat-settings-input" type="search" placeholder="Tìm tên sản phẩm, SKU, mã item..." oninput="filterChatAdvisoryProduct(this.value)">
          <div id="chatAdvisorySelectedProduct"></div>
          <div id="chatAdvisoryProductList" class="chat-advisory-product-list"></div>
        </div>
        <div class="chat-advisory-step">
          <div class="chat-advisory-step-title">
            <b>2. Nội dung bắt buộc nhắn cho khách</b>
            <span>Ví dụ: máy hút chân không chỉ dùng với túi hút chân không chuyên dụng.</span>
          </div>
          <label class="chat-field-label">Tiêu đề lưu ý
            <input id="chatAdvisoryTitleInput" class="chat-settings-input" placeholder="Ví dụ: Lưu ý túi hút chân không">
          </label>
          <label class="chat-field-label">Nội dung gửi cho khách
            <textarea id="chatAdvisoryMessage" class="chat-settings-textarea" rows="6" placeholder="Dạ shop lưu ý máy này chỉ sử dụng với túi hút chân không chuyên dụng..."></textarea>
          </label>
          <div class="chat-advisory-form-grid">
            <label class="chat-field-label">Mức độ
              <select id="chatAdvisorySeverity" class="chat-settings-input">
                <option value="required">Bắt buộc nhắc</option>
                <option value="warning">Cảnh báo</option>
                <option value="info">Thông tin thêm</option>
              </select>
            </label>
            <label class="chat-field-label">Ưu tiên
              <input id="chatAdvisoryPriority" class="chat-settings-input" type="number" min="0" max="100" value="80">
            </label>
          </div>
        </div>
        <div class="chat-advisory-step">
          <div class="chat-advisory-step-title">
            <b>3. Sản phẩm gửi kèm nếu cần</b>
            <span>Bấm “Gửi kèm” ở danh sách sản phẩm bên trên để chọn thẻ sản phẩm chính thức từ API.</span>
          </div>
          <div id="chatAdvisoryRelatedProduct"></div>
        </div>
        <input id="chatAdvisoryTriggerType" type="hidden">
        <input id="chatAdvisoryTriggerValue" type="hidden">
        <input id="chatAdvisoryRelatedName" type="hidden">
        <input id="chatAdvisoryRelatedItemId" type="hidden">
        <input id="chatAdvisoryRelatedUrl" type="hidden">
        <div id="chatAdvisoryStatus" class="chat-settings-note"></div>
      </div>
      <div class="chat-quick-actions">
        <button type="button" class="chat-settings-save secondary" onclick="closeChatProductAdvisoryModal()">Đóng</button>
        <button type="button" class="chat-settings-save" id="chatAdvisorySaveBtn" onclick="saveChatProductAdvisory()">Lưu lưu ý</button>
      </div>
    </section>
  `
  document.body.appendChild(modal)
  return modal
}

function resetChatAdvisoryProductState() {
  chatState.advisoryProductQuery = ''
  chatState.advisoryProductItems = []
  chatState.advisoryProductLoading = false
  chatState.advisoryProductError = ''
  chatState.advisorySelectedProduct = null
  chatState.advisoryRelatedProduct = null
  if (chatState.advisoryProductSearchTimer) {
    clearTimeout(chatState.advisoryProductSearchTimer)
    chatState.advisoryProductSearchTimer = null
  }
}

async function loadChatAdvisoryProducts(options = {}) {
  if (!chatState.activeConversation) return
  chatState.advisoryProductLoading = true
  chatState.advisoryProductError = ''
  renderChatAdvisoryProductPicker()
  const activeId = Number(chatState.activeConversation.id || chatState.activeId || 0)
  const params = new URLSearchParams()
  params.set('id', String(activeId))
  params.set('limit', '80')
  params.set('offset', '0')
  const query = String(chatState.advisoryProductQuery || '').trim()
  if (query) params.set('q', query)
  try {
    const data = await chatFetch(`/api/chat/products?${params}`)
    if (Number(chatState.activeConversation?.id || chatState.activeId || 0) !== activeId) return
    chatState.advisoryProductItems = Array.isArray(data.products) ? data.products : []
  } catch (error) {
    chatState.advisoryProductError = chatErrorMessage(error)
  } finally {
    chatState.advisoryProductLoading = false
    renderChatAdvisoryProductPicker()
  }
}

function syncChatAdvisoryHiddenInputs() {
  const selected = chatState.advisorySelectedProduct || {}
  const related = chatState.advisoryRelatedProduct || {}
  const triggerType = chatProductTriggerType(selected)
  const triggerValue = chatProductTriggerValue(selected)
  if (chatEl('chatAdvisoryTriggerType')) chatEl('chatAdvisoryTriggerType').value = selected && Object.keys(selected).length ? triggerType : ''
  if (chatEl('chatAdvisoryTriggerValue')) chatEl('chatAdvisoryTriggerValue').value = selected && Object.keys(selected).length ? triggerValue : ''
  if (chatEl('chatAdvisoryRelatedName')) chatEl('chatAdvisoryRelatedName').value = related && Object.keys(related).length ? chatProductName(related) : ''
  if (chatEl('chatAdvisoryRelatedItemId')) chatEl('chatAdvisoryRelatedItemId').value = related && Object.keys(related).length ? chatProductItemId(related) : ''
  if (chatEl('chatAdvisoryRelatedUrl')) chatEl('chatAdvisoryRelatedUrl').value = related && Object.keys(related).length ? chatProductUrl(related) : ''
}

function renderChatAdvisoryProductPicker() {
  const list = chatEl('chatAdvisoryProductList')
  const selectedBox = chatEl('chatAdvisorySelectedProduct')
  const relatedBox = chatEl('chatAdvisoryRelatedProduct')
  if (!list || !selectedBox || !relatedBox) return
  syncChatAdvisoryHiddenInputs()
  selectedBox.innerHTML = chatAdvisoryProductCard(chatState.advisorySelectedProduct, 'target')
  relatedBox.innerHTML = chatAdvisoryProductCard(chatState.advisoryRelatedProduct, 'related')
  if (!chatState.activeConversation) {
    list.innerHTML = '<div class="chat-empty">Chọn hội thoại trước để lấy catalog sản phẩm đúng shop.</div>'
    return
  }
  if (chatState.advisoryProductLoading && !chatState.advisoryProductItems.length) {
    list.innerHTML = '<div class="chat-empty">Đang tải sản phẩm API của shop...</div>'
    return
  }
  if (chatState.advisoryProductError && !chatState.advisoryProductItems.length) {
    list.innerHTML = `<div class="chat-error">Không tải được sản phẩm: ${chatEscape(chatState.advisoryProductError)}</div>`
    return
  }
  const products = chatState.advisoryProductItems || []
  if (!products.length) {
    list.innerHTML = '<div class="chat-empty">Chưa có catalog sản phẩm API cho shop này hoặc không tìm thấy sản phẩm khớp.</div>'
    return
  }
  list.innerHTML = products.map((product, index) => {
    const image = chatProductImage(product)
    const itemId = chatProductItemId(product)
    const sku = chatProductSku(product)
    const meta = [
      chatProductPriceText(product),
      sku ? `SKU: ${sku}` : '',
      itemId ? `Item: ${itemId}` : '',
      `Tồn: ${chatProductStock(product).toLocaleString('vi-VN')}`
    ].filter(Boolean).join(' · ')
    return `
      <div class="chat-advisory-product-row">
        ${image ? `<img src="${chatEscape(image)}" alt="">` : '<div class="chat-context-thumb">SP</div>'}
        <div class="chat-advisory-product-main">
          <b>${chatEscape(chatShortText(chatProductName(product), 92))}</b>
          <span>${chatEscape(meta)}</span>
        </div>
        <div class="chat-advisory-product-actions">
          <button type="button" onclick="selectChatAdvisoryProduct(${index}, 'target')">Áp dụng lưu ý</button>
          <button type="button" class="secondary" onclick="selectChatAdvisoryProduct(${index}, 'related')">Gửi kèm</button>
        </div>
      </div>
    `
  }).join('')
}

window.filterChatAdvisoryProduct = function(value) {
  chatState.advisoryProductQuery = String(value || '')
  renderChatAdvisoryProductPicker()
  if (chatState.advisoryProductSearchTimer) clearTimeout(chatState.advisoryProductSearchTimer)
  chatState.advisoryProductSearchTimer = setTimeout(() => {
    loadChatAdvisoryProducts({ reset: true }).catch(() => null)
  }, 260)
}

window.selectChatAdvisoryProduct = function(index, role = 'target') {
  const product = chatState.advisoryProductItems?.[Number(index)]
  if (!product) return
  if (role === 'related') {
    chatState.advisoryRelatedProduct = product
  } else {
    chatState.advisorySelectedProduct = product
    const titleInput = chatEl('chatAdvisoryTitleInput')
    if (titleInput && !titleInput.value.trim()) titleInput.value = `Lưu ý khi dùng ${chatProductName(product)}`
  }
  renderChatAdvisoryProductPicker()
}

window.clearChatAdvisoryRelatedProduct = function() {
  chatState.advisoryRelatedProduct = null
  renderChatAdvisoryProductPicker()
}

window.openChatProductAdvisoryModal = function(id = 0) {
  const modal = ensureChatProductAdvisoryModal()
  const item = (chatState.advisoryItems || []).find(row => Number(row.id) === Number(id)) || null
  chatState.advisoryEditId = Number(item?.id || 0)
  const conversation = chatState.activeConversation || {}
  chatEl('chatAdvisoryTriggerType').value = item?.trigger_type || 'keyword'
  chatEl('chatAdvisoryTriggerValue').value = item?.trigger_value || ''
  chatEl('chatAdvisoryTitleInput').value = item?.title || ''
  chatEl('chatAdvisoryRelatedName').value = item?.related_product_name || ''
  chatEl('chatAdvisoryRelatedItemId').value = item?.related_item_id || ''
  chatEl('chatAdvisoryRelatedUrl').value = item?.related_product_url || ''
  chatEl('chatAdvisoryMessage').value = item?.message || ''
  chatEl('chatAdvisorySeverity').value = item?.severity || 'required'
  chatEl('chatAdvisoryPriority').value = item?.priority ?? 80
  const status = chatEl('chatAdvisoryStatus')
  if (status) status.textContent = conversation.shop ? `Sẽ lưu cho shop đang chat: ${conversation.shop || conversation.shop_id}.` : 'Chưa chọn hội thoại, rule sẽ lưu dùng chung nếu thiếu shop.'
  modal.hidden = false
  document.body.classList.add('chat-knowledge-modal-open')
  setTimeout(() => chatEl('chatAdvisoryTriggerValue')?.focus(), 40)
}

window.openChatProductAdvisoryModal = function(id = 0) {
  const modal = ensureChatProductAdvisoryModal()
  const item = (chatState.advisoryItems || []).find(row => Number(row.id) === Number(id)) || null
  chatState.advisoryEditId = Number(item?.id || 0)
  const conversation = chatState.activeConversation || {}
  resetChatAdvisoryProductState()
  if (item) {
    chatState.advisorySelectedProduct = {
      product_name: item.title || item.trigger_value || 'Sản phẩm đã lưu',
      platform_item_id: item.trigger_type === 'item_id' ? item.trigger_value : '',
      item_sku: item.trigger_type === 'sku' ? item.trigger_value : '',
      product_url: item.related_product_url || '',
      platform: item.platform || conversation.platform || '',
      shop_id: item.shop_id || conversation.shop_id || ''
    }
    if (item.related_item_id || item.related_product_name || item.related_product_url) {
      chatState.advisoryRelatedProduct = {
        product_name: item.related_product_name || item.related_item_id || 'Sản phẩm gửi kèm',
        platform_item_id: item.related_item_id || '',
        product_url: item.related_product_url || '',
        platform: item.platform || conversation.platform || '',
        shop_id: item.shop_id || conversation.shop_id || ''
      }
    }
  }
  chatEl('chatAdvisoryTitleInput').value = item?.title || ''
  chatEl('chatAdvisoryMessage').value = item?.message || ''
  chatEl('chatAdvisorySeverity').value = item?.severity || 'required'
  chatEl('chatAdvisoryPriority').value = item?.priority ?? 80
  const productSearch = chatEl('chatAdvisoryProductSearch')
  if (productSearch) productSearch.value = ''
  const status = chatEl('chatAdvisoryStatus')
  if (status) status.textContent = conversation.shop ? `Sẽ lưu cho shop đang chat: ${conversation.shop || conversation.shop_id}.` : 'Chọn hội thoại trước để lấy đúng catalog sản phẩm của shop.'
  modal.hidden = false
  document.body.classList.add('chat-knowledge-modal-open')
  renderChatAdvisoryProductPicker()
  loadChatAdvisoryProducts({ reset: true }).catch(() => null)
  setTimeout(() => chatEl('chatAdvisoryProductSearch')?.focus(), 40)
}

window.closeChatProductAdvisoryModal = function() {
  const modal = chatEl('chatProductAdvisoryModal')
  if (modal) modal.hidden = true
  document.body.classList.remove('chat-knowledge-modal-open')
}

window.saveChatProductAdvisory = async function() {
  const btn = chatEl('chatAdvisorySaveBtn')
  const status = chatEl('chatAdvisoryStatus')

  const oldText = btn?.textContent || ''
  const conversation = chatState.activeConversation || {}
  const payload = {
    id: chatState.advisoryEditId || 0,
    platform: conversation.platform || '',
    shop: conversation.shop || '',
    shop_id: conversation.shop_id || '',
    trigger_type: chatEl('chatAdvisoryTriggerType')?.value || 'keyword',
    trigger_value: chatEl('chatAdvisoryTriggerValue')?.value || '',
    title: chatEl('chatAdvisoryTitleInput')?.value || '',
    message: chatEl('chatAdvisoryMessage')?.value || '',
    related_item_id: chatEl('chatAdvisoryRelatedItemId')?.value || '',
    related_product_name: chatEl('chatAdvisoryRelatedName')?.value || '',
    related_product_url: chatEl('chatAdvisoryRelatedUrl')?.value || '',
    severity: chatEl('chatAdvisorySeverity')?.value || 'required',
    priority: Number(chatEl('chatAdvisoryPriority')?.value || 80),
    status: 'active'
  }
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang lưu...'
  }
  if (status) status.textContent = 'Đang lưu lưu ý sản phẩm...'
  try {
    await chatFetch('/api/chat/product-advisories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    await window.loadChatProductAdvisories({ silent: true })
    if (chatState.activeConversation) await loadChatConversationContext(chatState.activeConversation.id).catch(() => null)
    window.closeChatProductAdvisoryModal()
    setChatGuardStatus('Đã lưu lưu ý sản phẩm.', 'ok')
  } catch (error) {
    if (status) status.textContent = `Không lưu được: ${chatErrorMessage(error)}`
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Lưu lưu ý'
    }
  }
}

window.saveChatProductAdvisory = async function() {
  const btn = chatEl('chatAdvisorySaveBtn')
  const status = chatEl('chatAdvisoryStatus')
  const oldText = btn?.textContent || ''
  const conversation = chatState.activeConversation || {}
  syncChatAdvisoryHiddenInputs()
  const selected = chatState.advisorySelectedProduct || {}
  const related = chatState.advisoryRelatedProduct || {}
  const triggerValue = chatEl('chatAdvisoryTriggerValue')?.value || ''
  const message = chatEl('chatAdvisoryMessage')?.value?.trim() || ''
  if (!triggerValue) {
    if (status) status.textContent = 'Bạn cần chọn sản phẩm áp dụng lưu ý trước khi lưu.'
    return
  }
  if (!message) {
    if (status) status.textContent = 'Bạn cần nhập nội dung lưu ý sẽ nhắn cho khách.'
    return
  }
  const payload = {
    id: chatState.advisoryEditId || 0,
    platform: conversation.platform || '',
    shop: conversation.shop || '',
    shop_id: conversation.shop_id || '',
    trigger_type: chatEl('chatAdvisoryTriggerType')?.value || chatProductTriggerType(selected),
    trigger_value: triggerValue,
    trigger_keywords: chatProductAdvisoryKeywords(selected, related),
    title: chatEl('chatAdvisoryTitleInput')?.value?.trim() || `Lưu ý khi dùng ${chatProductName(selected)}`,
    message,
    related_item_id: chatEl('chatAdvisoryRelatedItemId')?.value || '',
    related_product_name: chatEl('chatAdvisoryRelatedName')?.value || '',
    related_product_url: chatEl('chatAdvisoryRelatedUrl')?.value || '',
    severity: chatEl('chatAdvisorySeverity')?.value || 'required',
    priority: Number(chatEl('chatAdvisoryPriority')?.value || 80),
    status: 'active'
  }
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang lưu...'
  }
  if (status) status.textContent = 'Đang lưu lưu ý sản phẩm...'
  try {
    await chatFetch('/api/chat/product-advisories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    await window.loadChatProductAdvisories({ silent: true })
    if (chatState.activeConversation) await loadChatConversationContext(chatState.activeConversation.id).catch(() => null)
    window.closeChatProductAdvisoryModal()
    setChatGuardStatus('Đã lưu lưu ý sản phẩm theo sản phẩm đã chọn.', 'ok')
  } catch (error) {
    if (status) status.textContent = `Không lưu được: ${chatErrorMessage(error)}`
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Lưu lưu ý'
    }
  }
}

window.filterChatProductAdvisories = function(value) {
  chatState.advisoryQuery = String(value || '')
  renderChatSetup(chatState.setupData || {})
  const input = chatEl('chatAdvisorySearch')
  if (input) {
    input.focus()
    const end = input.value.length
    input.setSelectionRange(end, end)
  }
}

window.loadChatProductAdvisories = async function(options = {}) {
  const conversation = chatState.activeConversation || {}
  const params = new URLSearchParams()
  params.set('status', 'active')
  params.set('limit', '80')
  if (conversation.platform) params.set('platform', conversation.platform)
  if (conversation.shop || conversation.shop_id) params.set('shop', conversation.shop || conversation.shop_id)
  if (chatState.advisoryQuery) params.set('q', chatState.advisoryQuery)
  chatState.advisoryLoading = true
  renderChatSetup(chatState.setupData || {})
  try {
    const data = await chatFetch(`/api/chat/product-advisories?${params}`)
    chatState.advisoryItems = data.advisories || []
  } catch (error) {
    if (!options.silent) setChatGuardStatus(`Không tải được lưu ý sản phẩm: ${chatErrorMessage(error)}`, 'blocked')
  } finally {
    chatState.advisoryLoading = false
    renderChatSetup(chatState.setupData || {})
  }
}

window.archiveChatProductAdvisory = async function(id) {
  const item = (chatState.advisoryItems || []).find(row => Number(row.id) === Number(id))
  if (!item) return
  await chatFetch('/api/chat/product-advisories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...item, id, status: 'archived' })
  })
  await window.loadChatProductAdvisories({ silent: true })
}

window.insertChatProductAdvisory = function(index) {
  const advisory = chatMatchedAdvisories(chatState.context)[Number(index)]
  if (!advisory) return
  appendChatReplySnippet(chatAdvisoryReplyText(advisory))
  if (String(advisory.related_product_url || '').trim() && !chatSafeAdvisoryRelatedUrl(advisory)) {
    setChatGuardStatus('Đã chèn lưu ý nhưng khóa link sản phẩm gửi kèm vì không khớp đúng sàn hoặc shop hiện tại.', 'blocked')
  }
}

window.sendChatAdvisoryProductCard = async function(index, btn) {
  const advisory = chatMatchedAdvisories(chatState.context)[Number(index)]
  const resolvedProduct = chatResolveAdvisoryRelatedProduct(advisory)
  const productItemId = resolvedProduct ? chatProductItemId(resolvedProduct) : String(advisory?.related_item_id || '').trim()
  const productUrl = resolvedProduct ? chatProductUrl(resolvedProduct) : chatSafeAdvisoryRelatedUrl(advisory)
  const productName = resolvedProduct
    ? (resolvedProduct.product_name || resolvedProduct.variation_name || chatProductSku(resolvedProduct) || '')
    : (advisory?.related_product_name || '')
  if (!chatState.activeConversation || !chatAdvisoryCanAttachProduct(advisory) || !productItemId) {
    setChatGuardStatus('Không gửi thẻ sản phẩm vì chưa resolve được đúng sản phẩm của sàn và shop đang chat.', 'blocked')
    return
  }
  const oldText = btn?.textContent || ''
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang gửi...'
  }
  try {
    const data = await chatFetch('/api/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: chatState.activeConversation.id || '',
        conversation_id: chatState.activeConversation.conversation_id || '',
        platform: chatState.activeConversation.platform || '',
        shop: chatState.activeConversation.shop || '',
        content: '',
        message_type: 'product_card',
        product_item_id: productItemId,
        product_url: productUrl || '',
        related_product_name: productName
      })
    })
    await openChatConversation(chatState.activeConversation.id, { silent: true })
    setChatGuardStatus(data.sent_to_platform ? 'Đã gửi thẻ sản phẩm chính thức qua Shopee.' : (data.note || 'Đã xử lý thẻ sản phẩm.'), data.sent_to_platform ? 'ok' : 'muted')
  } catch (error) {
    setChatGuardStatus(`Không gửi được thẻ sản phẩm: ${chatErrorMessage(error)}`, 'blocked')
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Gửi thẻ SP'
    }
  }
}
