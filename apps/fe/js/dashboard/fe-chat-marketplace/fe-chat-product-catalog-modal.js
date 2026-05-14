// NEO: Frontend chat sàn - nhóm product-catalog-modal. Giữ file dưới 30KB; tính năng mới tách thành file fe-chat-* riêng.
function chatProductSource() {
  const context = chatState.context || {}
  const catalog = Array.isArray(context.product_catalog) ? context.product_catalog : []
  if (catalog.length) return catalog
  return Array.isArray(context.products) ? context.products : []
}

// Ghép thẻ sản phẩm khách gửi với catalog đã tải để tránh chỉ hiện mã item khô.
function chatProductById(itemId, shopId = '') {
  const targetItem = String(itemId || '').trim()
  const targetShop = String(shopId || '').trim()
  if (!targetItem) return null
  return chatProductSource().find(product => {
    const productItem = String(product.platform_item_id || product.item_id || product.itemid || '').trim()
    const productShop = String(product.shop_id || '').trim()
    return productItem === targetItem && (!targetShop || !productShop || productShop === targetShop)
  }) || null
}

// Advisory không dùng link lưu chết làm nguồn chuẩn; luôn cố map lại từ catalog đã sync của đúng shop/sàn đang chat.
function chatResolveAdvisoryRelatedProduct(advisory = {}, conversation = chatState.activeConversation || {}) {
  if (!chatAdvisoryMatchesActiveConversation(advisory, conversation)) return null
  const context = chatState.context || {}
  const lookupRows = [
    ...chatProductSource(),
    ...(Array.isArray(context.product_catalog_index) ? context.product_catalog_index : []),
    ...(Array.isArray(chatState.productModalProducts) ? chatState.productModalProducts : []),
    ...(Array.isArray(chatState.productModalItems) ? chatState.productModalItems : [])
  ]
  const uniqueRows = Array.from(new Map(lookupRows.map((product) => {
    const key = `${String(product.shop_id || '').trim()}::${chatProductItemId(product)}::${chatNormalizeDisplayText(product.product_name || product.variation_name || '')}`
    return [key, product]
  })).values())
  const resolvedShop = chatResolveConversationShop(conversation || {})
  const targetShop = resolvedShop?.api_shop_id || advisory.shop_id || ''
  const relatedItemId = String(advisory.related_item_id || '').trim()
  if (relatedItemId) {
    const byId = uniqueRows.find((product) => {
      const productItem = chatProductItemId(product)
      const productShop = String(product.shop_id || '').trim()
      return productItem === relatedItemId && (!targetShop || !productShop || productShop === targetShop)
    }) || null
    if (byId) return byId
  }
  const targetName = chatNormalizeDisplayText(advisory.related_product_name || '')
  if (!targetName) return null
  return uniqueRows.find((product) => {
    const candidates = [
      product.product_name,
      product.variation_name,
      chatProductSku(product),
      chatProductItemId(product)
    ].map(chatNormalizeDisplayText).filter(Boolean)
    return candidates.some((candidate) => (
      candidate === targetName
      || candidate.includes(targetName)
      || targetName.includes(candidate)
    ))
  }) || null
}

function chatProductVariations(product = {}) {
  return Array.isArray(product.variations) ? product.variations : []
}

function chatProductImage(product = {}) {
  const variations = chatProductVariations(product)
  return (Array.isArray(product.images) ? product.images[0] : '')
    || product.image_url
    || product.thumbnail_url
    || variations.find(item => item.image_url)?.image_url
    || ''
}

function chatProductSku(product = {}) {
  const variations = chatProductVariations(product)
  return product.item_sku
    || product.platform_sku
    || product.internal_sku
    || variations.find(item => item.sku)?.sku
    || ''
}

// Chuẩn hóa mã item để gửi đúng thẻ sản phẩm chính thức của sàn.
function chatProductItemId(product = {}) {
  return String(product.platform_item_id || product.item_id || product.itemid || product.product_id || '').trim()
}

function chatProductPriceText(product = {}) {
  const priceMin = Number(product.price_min || product.discount_price || product.price || 0)
  const priceMax = Number(product.price_max || priceMin || 0)
  return priceMin && priceMax && priceMax !== priceMin
    ? `${chatMoney(priceMin)} - ${chatMoney(priceMax)}`
    : chatMoney(priceMin)
}

function chatProductStock(product = {}) {
  return Number(product.stock_total ?? product.stock ?? 0)
}

function chatProductUrl(product = {}) {
  const direct = String(product.product_url || product.item_url || product.url || product.link || product.permalink || '').trim()
  if (/^https?:\/\//i.test(direct)) return direct
  const platform = String(product.platform || chatState.activeConversation?.platform || '').toLowerCase()
  const itemId = chatProductItemId(product)
  const resolvedShop = chatResolveConversationShop(chatState.activeConversation || {})
  // Ưu tiên api_shop_id đã chuẩn hóa để link Shopee luôn trỏ đúng sản phẩm thật của shop đang chat.
  const shopId = String(product.shop_id || resolvedShop?.api_shop_id || chatState.activeConversation?.shop_id || '').trim()
  if (platform === 'shopee' && shopId && itemId) {
    return `https://shopee.vn/product/${encodeURIComponent(shopId)}/${encodeURIComponent(itemId)}`
  }
  return ''
}

function chatProductName(product = {}) {
  return product.product_name || product.variation_name || chatProductSku(product) || chatProductItemId(product) || 'Sản phẩm'
}

function chatProductTriggerType(product = {}) {
  if (chatProductItemId(product)) return 'item_id'
  if (chatProductSku(product)) return 'sku'
  return 'keyword'
}

function chatProductTriggerValue(product = {}) {
  const type = chatProductTriggerType(product)
  if (type === 'item_id') return chatProductItemId(product)
  if (type === 'sku') return chatProductSku(product)
  return chatProductName(product)
}

function chatProductAdvisoryKeywords(product = {}, relatedProduct = {}) {
  const hasRelated = relatedProduct && Object.keys(relatedProduct).length
  const values = [
    chatProductName(product),
    chatProductSku(product),
    chatProductItemId(product),
    product.brand_name,
    product.description,
    hasRelated ? chatProductName(relatedProduct) : '',
    hasRelated ? chatProductSku(relatedProduct) : '',
    hasRelated ? chatProductItemId(relatedProduct) : ''
  ]
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].slice(0, 12)
}

function chatAdvisoryProductCard(product = {}, role = 'target') {
  if (!product || !Object.keys(product).length) {
    return `<div class="chat-advisory-selected muted">${role === 'related' ? 'Chưa chọn sản phẩm gửi kèm.' : 'Chưa chọn sản phẩm áp dụng lưu ý.'}</div>`
  }
  const image = chatProductImage(product)
  const itemId = chatProductItemId(product)
  const sku = chatProductSku(product)
  const meta = [
    itemId ? `Item: ${itemId}` : '',
    sku ? `SKU: ${sku}` : '',
    `Giá: ${chatProductPriceText(product)}`,
    `Tồn: ${chatProductStock(product).toLocaleString('vi-VN')}`
  ].filter(Boolean).join(' · ')
  return `
    <div class="chat-advisory-selected">
      ${image ? `<img src="${chatEscape(image)}" alt="">` : '<div class="chat-context-thumb">SP</div>'}
      <div>
        <b>${chatEscape(chatShortText(chatProductName(product), 86))}</b>
        <span>${chatEscape(meta || 'Đã chọn từ catalog API')}</span>
      </div>
      ${role === 'related' ? '<button type="button" onclick="clearChatAdvisoryRelatedProduct()">Bỏ</button>' : ''}
    </div>
  `
}

function chatProductSearchText(product = {}) {
  const variations = chatProductVariations(product)
  return [
    product.product_name,
    product.variation_name,
    product.brand_name,
    product.description,
    product.platform_item_id,
    chatProductSku(product),
    ...variations.map(item => `${item.variation_name || item.name || ''} ${item.sku || item.platform_sku || ''}`)
  ].join(' ').toLowerCase()
}

function filteredChatProducts() {
  const query = String(chatState.productQuery || '').trim().toLowerCase()
  const products = chatProductSource()
  if (!query) return products
  return products.filter(product => chatProductSearchText(product).includes(query))
}

function chatBaseProductRows(context = chatState.context || {}) {
  const catalog = Array.isArray(context.product_catalog) ? context.product_catalog : []
  if (catalog.length) return catalog
  return Array.isArray(context.products) ? context.products : []
}

function chatProductPanelQueryText() {
  return String(chatState.productPanelQuery || '').trim().toLowerCase()
}

function chatLocalFilteredProductRows(context = chatState.context || {}) {
  const query = chatProductPanelQueryText()
  const products = chatBaseProductRows(context)
  if (!query) return products
  return products.filter(product => chatProductSearchText(product).includes(query))
}

function chatDisplayProductRows(context = chatState.context || {}) {
  const query = chatProductPanelQueryText()
  if (!query) return chatBaseProductRows(context)
  // Khi đội vận hành vừa gõ tìm kiếm, ưu tiên lọc nhanh dữ liệu đang có trước để panel phản hồi ngay;
  // khi API full catalog trả về xong thì thay bằng kết quả chuẩn của đúng shop/sàn đang chat.
  if (chatState.productPanelLoadedQuery === query) return Array.isArray(chatState.productPanelItems) ? chatState.productPanelItems : []
  return chatLocalFilteredProductRows(context)
}

function resetChatProductPanelState(options = {}) {
  chatState.productPanelItems = []
  chatState.productPanelTotal = 0
  chatState.productPanelMatched = 0
  chatState.productPanelLoading = false
  chatState.productPanelError = ''
  chatState.productPanelLoadedQuery = ''
  if (!options.keepQuery) chatState.productPanelQuery = ''
  if (chatState.productPanelSearchTimer) {
    clearTimeout(chatState.productPanelSearchTimer)
    chatState.productPanelSearchTimer = null
  }
  if (!options.keepStatus) chatState.productPanelSyncStatus = ''
}

async function loadChatProductPanelProducts() {
  if (!chatState.activeConversation) return
  const query = String(chatState.productPanelQuery || '').trim()
  if (!query) {
    chatState.productPanelItems = []
    chatState.productPanelTotal = 0
    chatState.productPanelMatched = 0
    chatState.productPanelLoading = false
    chatState.productPanelError = ''
    chatState.productPanelLoadedQuery = ''
    renderChatSetup(chatState.setupData || {})
    return
  }
  const activeId = Number(chatState.activeConversation.id || chatState.activeId || 0)
  chatState.productPanelLoading = true
  chatState.productPanelError = ''
  renderChatSetup(chatState.setupData || {})
  if (chatState.activeConversation) renderChatThread(chatState.activeConversation, chatState.messages || [])
  try {
    const params = new URLSearchParams()
    params.set('id', String(activeId))
    params.set('limit', '80')
    params.set('q', query)
    const data = await chatFetch(`/api/chat/products?${params}`, { timeoutMs: 15000 })
    const activeConversationId = Number(chatState.activeConversation?.id || chatState.activeId || 0)
    if (activeConversationId !== activeId || String(chatState.productPanelQuery || '').trim() !== query) return
    chatState.productPanelItems = Array.isArray(data.products) ? data.products : []
    chatState.productPanelTotal = Number(data.total_products || 0)
    chatState.productPanelMatched = Number(data.matched_products || chatState.productPanelItems.length || 0)
    chatState.productPanelLoadedQuery = query.toLowerCase()
  } catch (error) {
    if (String(chatState.productPanelQuery || '').trim() === query) {
      chatState.productPanelError = chatErrorMessage(error)
      chatState.productPanelLoadedQuery = ''
    }
  } finally {
    if (String(chatState.productPanelQuery || '').trim() === query) {
      chatState.productPanelLoading = false
      renderChatSetup(chatState.setupData || {})
    }
  }
}

function chatProductSyncCapability(conversation = chatState.activeConversation || {}) {
  if (!conversation?.id) {
    return { canSync: false, tone: 'blocked', reason: 'Chọn hội thoại trước khi đồng bộ sản phẩm.' }
  }
  const platform = String(conversation.platform || '').trim().toLowerCase()
  if (!['shopee', 'lazada'].includes(platform)) {
    return { canSync: false, tone: 'muted', reason: 'Shop này chưa có API sản phẩm để đồng bộ ngay trong chat.' }
  }
  const shop = chatResolveConversationShop(conversation)
  if (!shop) {
    return { canSync: false, tone: 'blocked', reason: 'OMS chưa resolve được đúng shop API cho hội thoại này.' }
  }
  if (!Number(shop.has_access_token || 0)) {
    return { canSync: false, tone: 'muted', reason: 'Shop này chưa có token API sản phẩm hợp lệ.' }
  }
  return {
    canSync: true,
    platform,
    shop,
    shopValue: chatAutomationShopValue(shop),
    displayName: shop.display_name || shop.shop_name || shop.user_name || conversation.shop || conversation.shop_id || 'shop'
  }
}

function resetChatProductModalState() {
  chatState.productModalProducts = []
  chatState.productModalItems = []
  chatState.productModalTotal = 0
  chatState.productModalMatched = 0
  chatState.productModalOffset = 0
  chatState.productModalHasMore = false
  chatState.productModalLoading = false
  chatState.productModalError = ''
  if (chatState.productSearchTimer) {
    clearTimeout(chatState.productSearchTimer)
    chatState.productSearchTimer = null
  }
}

async function loadChatProductModalProducts(options = {}) {
  if (!chatState.activeConversation) return
  const reset = Boolean(options.reset)
  if (reset) {
    chatState.productModalProducts = []

    chatState.productModalItems = []
    chatState.productModalOffset = 0
    chatState.productModalHasMore = false
  }
  chatState.productModalLoading = true
  chatState.productModalError = ''
  renderChatProductModal()
  const activeId = Number(chatState.activeConversation.id || chatState.activeId || 0)
  const params = new URLSearchParams()
  params.set('id', String(activeId))
  params.set('limit', '120')
  params.set('offset', String(reset ? 0 : chatState.productModalProducts.length))
  const query = String(chatState.productQuery || '').trim()
  if (query) params.set('q', query)
  try {
    const data = await chatFetch(`/api/chat/products?${params}`)
    if (Number(chatState.activeConversation?.id || chatState.activeId || 0) !== activeId) return
    const products = Array.isArray(data.products) ? data.products : []
    chatState.productModalProducts = reset ? products : [...chatState.productModalProducts, ...products]
    chatState.productModalItems = chatState.productModalProducts
    chatState.productModalTotal = Number(data.total_products || 0)
    chatState.productModalMatched = Number(data.matched_products || products.length || 0)
    chatState.productModalOffset = chatState.productModalProducts.length
    chatState.productModalHasMore = Boolean(data.has_more)
  } catch (error) {
    chatState.productModalError = chatErrorMessage(error)
  } finally {
    chatState.productModalLoading = false
    renderChatProductModal()
  }
}

function buildChatProductMessage(product = {}) {
  const name = product.product_name || product.variation_name || chatProductSku(product) || 'sản phẩm này'
  const sku = chatProductSku(product)
  const priceText = chatProductPriceText(product)
  const stock = chatProductStock(product)
  const url = chatProductUrl(product)
  return [
    url ? `Dạ em gửi link sản phẩm để mình bấm xem trực tiếp: ${url}` : `Dạ em gửi sản phẩm ${name} để mình tham khảo trước ạ.`,
    url ? `Tên sản phẩm: ${name}.` : '',
    sku ? `SKU: ${sku}.` : '',
    priceText !== '0 đ' ? `Giá sàn đang ghi nhận: ${priceText}.` : '',
    stock > 0 ? `Tồn API: ${stock.toLocaleString('vi-VN')}.` : 'Tồn API đang hết hoặc cần shop kiểm tra lại trên sàn.',
    'Shop sẽ kiểm tra lại giá/tồn trên sàn trước khi chốt giúp mình ạ.'
  ].filter(Boolean).join(' ')
}

function appendChatProductDraft(product = {}) {
  const name = product.product_name || product.variation_name || chatProductSku(product) || 'sản phẩm này'
  const sku = chatProductSku(product)
  const priceText = chatProductPriceText(product)
  const stock = chatProductStock(product)
  const url = chatProductUrl(product)
  const lines = [
    url ? `Link sản phẩm: ${url}` : `Dạ sản phẩm ${name}`,
    url ? `Tên sản phẩm: ${name}` : '',
    sku ? `SKU ${sku}` : '',
    priceText !== '0 đ' ? `giá sàn đang ghi nhận ${priceText}` : '',
    stock > 0 ? `tồn API: ${stock.toLocaleString('vi-VN')}` : 'tồn API đang hết hoặc cần kiểm tra lại',
    'shop sẽ kiểm tra lại trên sàn trước khi chốt thông tin cho mình ạ.'
  ].filter(Boolean)
  appendChatReplySnippet(lines.join('\n'))
}

function ensureChatProductModal() {
  let modal = chatEl('chatProductModal')
  if (modal) return modal
  modal = document.createElement('div')
  modal.id = 'chatProductModal'
  modal.className = 'chat-product-modal'
  modal.hidden = true
  modal.innerHTML = `
    <div class="chat-product-backdrop" onclick="closeChatProductModal()"></div>
    <section class="chat-product-dialog" role="dialog" aria-modal="true" aria-labelledby="chatProductModalTitle">
      <div class="chat-product-head">
        <div>
          <strong id="chatProductModalTitle">Sản phẩm</strong>
          <small>Tìm trong catalog sản phẩm API của shop đang chat.</small>
        </div>
        <button type="button" class="chat-product-close" onclick="closeChatProductModal()" aria-label="Đóng">×</button>
      </div>
      <div class="chat-product-toolbar">
        <input id="chatProductSearch" type="search" placeholder="Tìm tên sản phẩm, SKU, mã item..." oninput="filterChatProductModal(this.value)">
        <div id="chatProductModalSummary" class="chat-settings-note"></div>
      </div>
      <div id="chatProductModalList" class="chat-product-modal-list"></div>
      <div id="chatProductSendStatus" class="chat-product-status muted"></div>
    </section>
  `
  document.body.appendChild(modal)
  return modal
}

function renderChatProductModal() {
  const modal = ensureChatProductModal()
  const list = chatEl('chatProductModalList')
  const summaryEl = chatEl('chatProductModalSummary')
  const status = chatEl('chatProductSendStatus')
  if (!list) return modal
  const products = chatState.productModalProducts || []
  chatState.productModalItems = products
  if (!chatState.activeConversation) {
    list.innerHTML = '<div class="chat-empty">Chọn hội thoại trước khi gửi sản phẩm.</div>'
    if (summaryEl) summaryEl.textContent = ''
    return modal
  }
  if (chatState.productModalLoading && !products.length) {
    list.innerHTML = '<div class="chat-empty">Đang tải toàn bộ catalog sản phẩm API của shop...</div>'
    if (summaryEl) summaryEl.textContent = 'Đang tải dữ liệu sản phẩm từ bảng đồng bộ API.'
    return modal
  }
  if (chatState.productModalError && !products.length) {
    list.innerHTML = `<div class="chat-error">Không tải được sản phẩm: ${chatEscape(chatState.productModalError)}</div>`
    if (summaryEl) summaryEl.textContent = ''
    return modal
  }
  const sourceTotal = Number(chatState.productModalTotal || products.length || 0)
  const matchedTotal = Number(chatState.productModalMatched || products.length || 0)
  if (summaryEl) {
    const total = sourceTotal.toLocaleString('vi-VN')
    const shown = Number(products.length || 0).toLocaleString('vi-VN')
    const matched = matchedTotal.toLocaleString('vi-VN')
    summaryEl.textContent = chatState.productQuery
      ? `${shown}/${matched} sản phẩm khớp · ${total} sản phẩm API của shop`
      : `${shown}/${total} sản phẩm API của shop`
  }
  if (!sourceTotal) {
    list.innerHTML = '<div class="chat-empty">Chưa có catalog sản phẩm API cho shop này. Cần đồng bộ sản phẩm API trước khi gửi link sản phẩm.</div>'
    if (status) status.textContent = ''
    return modal
  }
  if (!products.length) {
    list.innerHTML = '<div class="chat-empty">Không tìm thấy sản phẩm khớp từ khóa.</div>'
    return modal
  }
  const rowsHtml = products.map((product, index) => {
    const imageUrl = chatProductImage(product)
    const sku = chatProductSku(product)
    const priceText = chatProductPriceText(product)
    const stock = chatProductStock(product)
    const url = chatProductUrl(product)
    const isShopee = String(chatState.activeConversation?.platform || product.platform || '').toLowerCase() === 'shopee'
    const itemId = chatProductItemId(product)
    const canSendProduct = isShopee ? Boolean(itemId) : Boolean(url)
    const draftLabel = url ? 'Chèn link' : 'Chèn nháp'
    const sendLabel = canSendProduct ? (isShopee ? 'Gửi thẻ Shopee' : 'Gửi sản phẩm') : (isShopee ? 'Thiếu item' : 'Thiếu link')
    const description = chatShortText(product.description || product.variation_name || product.brand_name || '', 96)
    const itemCode = itemId ? `Item: ${itemId}` : ''
    return `
      <div class="chat-product-modal-row">
        ${imageUrl ? `<img src="${chatEscape(imageUrl)}" alt="">` : '<div class="chat-context-thumb">SP</div>'}
        <div class="chat-product-main">
          <div class="chat-context-name">${chatEscape(chatShortText(product.product_name || product.variation_name || sku || 'Sản phẩm', 86))}</div>
          <div class="chat-context-meta">${chatEscape(description || itemCode)}</div>
          <div class="chat-product-meta">
            <span>${chatEscape(priceText)}</span>
            <span>SKU: ${chatEscape(sku || 'chưa có')}</span>
            <span>Tồn: ${stock.toLocaleString('vi-VN')}</span>
            ${itemCode ? `<span>${chatEscape(itemCode)}</span>` : ''}
          </div>
        </div>
        <div class="chat-product-modal-actions">
          <button type="button" class="secondary" onclick="insertChatProductModalSnippet(${index})">${chatEscape(draftLabel)}</button>
          <button type="button" class="primary" onclick="sendChatProductLink(${index}, this)" ${canSendProduct ? '' : 'disabled'}>${chatEscape(sendLabel)}</button>
        </div>
      </div>
    `
  }).join('')
  const moreHtml = chatState.productModalHasMore ? `
    <div class="chat-product-load-more">
      <button type="button" onclick="loadMoreChatProductModal()" ${chatState.productModalLoading ? 'disabled' : ''}>
        ${chatState.productModalLoading ? 'Đang tải...' : 'Tải thêm sản phẩm'}
      </button>
    </div>
  ` : ''
  list.innerHTML = `${rowsHtml}${moreHtml}`
  return modal
}

window.openChatProductModal = function() {
  if (!chatState.activeConversation) {
    setChatGuardStatus('Bạn cần chọn hội thoại trước khi gửi sản phẩm.', 'blocked')
    return
  }
  closeChatMobileContext()
  chatState.productQuery = ''
  resetChatProductModalState()
  const modal = ensureChatProductModal()
  modal.hidden = false
  document.body.classList.add('chat-product-modal-open')
  const search = chatEl('chatProductSearch')
  if (search) search.value = ''
  renderChatProductModal()
  loadChatProductModalProducts({ reset: true }).catch(() => null)
  setTimeout(() => chatEl('chatProductSearch')?.focus(), 40)
}

window.closeChatProductModal = function() {
  const modal = chatEl('chatProductModal')
  if (modal) modal.hidden = true
  document.body.classList.remove('chat-product-modal-open')
}

window.filterChatProductModal = function(value) {
  chatState.productQuery = String(value || '')
  renderChatProductModal()
  if (chatState.productSearchTimer) clearTimeout(chatState.productSearchTimer)
  chatState.productSearchTimer = setTimeout(() => {
    loadChatProductModalProducts({ reset: true }).catch(() => null)
  }, 260)
}

window.loadMoreChatProductModal = function() {
  if (chatState.productModalLoading || !chatState.productModalHasMore) return
  loadChatProductModalProducts({ reset: false }).catch(() => null)
}

window.insertChatProductModalSnippet = function(index) {
  const product = chatState.productModalItems?.[Number(index)]
  if (!product) return
  appendChatProductDraft(product)
  window.closeChatProductModal()
}

window.sendChatProductLink = async function(index, btn) {
  const product = chatState.productModalItems?.[Number(index)]
  const status = chatEl('chatProductSendStatus')
  if (!chatState.activeConversation || !product) return
  const isShopee = String(chatState.activeConversation.platform || '').toLowerCase() === 'shopee'
  const productItemId = chatProductItemId(product)
  const url = chatProductUrl(product)
  if ((!isShopee && !url) || (isShopee && !productItemId)) {
    if (status) {
      status.className = 'chat-product-status blocked'
      status.textContent = isShopee
        ? 'Sản phẩm này thiếu item_id Shopee nên chưa gửi được thẻ chính thức.'
        : 'Sản phẩm này chưa có đủ dữ liệu để tạo link thật.'
    }
    return
  }
  const oldText = btn?.textContent || ''
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Đang gửi...'
  }
  if (status) {
    status.className = 'chat-product-status muted'
    status.textContent = isShopee
      ? 'Đang gửi thẻ sản phẩm chính thức qua Shopee SellerChat API...'
      : 'Đang lưu/gửi link sản phẩm vào hội thoại...'
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
        content: isShopee ? '' : buildChatProductMessage(product),
        message_type: isShopee ? 'product_card' : 'text',
        source: 'product_link',
        product_url: url,
        product_item_id: productItemId,
        related_product_name: product.product_name || product.variation_name || chatProductSku(product) || ''
      })
    })
    await openChatConversation(chatState.activeConversation.id, { silent: true })
    if (status) {
      status.className = `chat-product-status ${data.sent_to_platform ? 'ok' : 'muted'}`
      status.textContent = data.sent_to_platform
        ? (isShopee ? 'Đã gửi thẻ sản phẩm chính thức qua Shopee.' : 'Đã gửi link sản phẩm lên sàn.')
        : (data.note || 'Đã lưu sản phẩm trong OMS, chưa xác nhận gửi lên sàn.')
    }
  } catch (error) {
    if (status) {
      status.className = 'chat-product-status blocked'
      status.textContent = `Không gửi được sản phẩm: ${chatErrorMessage(error)}`
    }
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = oldText || 'Gửi sản phẩm'
    }
  }
}
