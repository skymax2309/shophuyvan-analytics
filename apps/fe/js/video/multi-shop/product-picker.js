// NEO: Picker sản phẩm video đa shop chỉ dùng catalog của đúng shop đang đăng, không mượn link/item shop khác.
export function createMultiShopProductPicker(context) {
  const {
    API_BASE,
    state,
    cleanText,
    escapeHtml,
    numberValue,
    formatNumber,
    fetchJson,
    setStatus,
    renderMultiShopPanel,
    readMultiShopRowsFromDom
  } = context

  function normalizeProduct(row = {}) {
    const itemId = cleanText(row.item_id || row.platform_item_id)
    if (!itemId) return null
    return {
      item_id: itemId,
      item_sku: cleanText(row.item_sku),
      matched_sku: cleanText(row.matched_sku || row.item_sku),
      matched_variation_name: cleanText(row.matched_variation_name),
      product_name: cleanText(row.product_name || row.custom_item_name || row.item_name),
      image_url: cleanText(row.image_url),
      product_url: cleanText(row.product_url),
      shop_id: cleanText(row.shop_id),
      stock: numberValue(row.stock),
      has_video: numberValue(row.has_video)
    }
  }

  function parseItemRows(itemIdsText, detailRows = []) {
    const detailById = new Map((Array.isArray(detailRows) ? detailRows : [])
      .map(normalizeProduct)
      .filter(Boolean)
      .map(item => [item.item_id, item]))
    return cleanText(itemIdsText)
      .split(/[\s,;|]+/)
      .map(itemId => cleanText(itemId))
      .filter(Boolean)
      .map(itemId => detailById.get(itemId) || { item_id: itemId })
      .slice(0, 6)
  }

  function searchState(shop) {
    const key = cleanText(shop)
    if (!state.multiShopProductSearch[key]) {
      state.multiShopProductSearch[key] = { query: '', rows: [], loading: false, error: '' }
    }
    return state.multiShopProductSearch[key]
  }

  function productUrl(product = {}) {
    const explicitUrl = cleanText(product.product_url)
    if (explicitUrl) return explicitUrl
    const itemId = cleanText(product.item_id)
    const shopId = cleanText(product.shop_id)
    if (shopId && itemId) return `https://shopee.vn/product/${encodeURIComponent(shopId)}/${encodeURIComponent(itemId)}`
    return ''
  }

  function render(row = {}, preview = null) {
    const shop = cleanText(row.shop)
    const selectedRows = parseItemRows(row.item_ids, row.item_rows || row.items || preview?.item_rows || [])
    const itemIdsText = selectedRows.map(item => item.item_id).filter(Boolean).join(', ')
    const search = searchState(shop)
    const missingText = preview?.missing_item_ids?.length
      ? `Thiếu trong catalog: ${escapeHtml(preview.missing_item_ids.join(', '))}`
      : 'Tìm theo mã SKU/tên sản phẩm, bấm Gắn để hệ thống lấy đúng item ID của shop này.'
    const selectedHtml = selectedRows.length
      ? `<div class="video-selected-products">${selectedRows.map(product => {
          const url = productUrl(product)
          const name = cleanText(product.product_name) || cleanText(product.item_sku) || product.item_id
          const sku = cleanText(product.matched_sku || product.item_sku)
          return `
            <div class="video-selected-product">
              <span>
                <strong>${escapeHtml(name)}</strong>
                <small>${escapeHtml([sku ? `SKU ${sku}` : '', `ID ${product.item_id}`].filter(Boolean).join(' · '))}</small>
              </span>
              ${url ? `<a class="video-text-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener">Mở</a>` : ''}
              <button class="video-text-btn danger" type="button" data-action="remove-multi-product" data-shop="${escapeHtml(shop)}" data-item-id="${escapeHtml(product.item_id)}">Bỏ</button>
            </div>
          `
        }).join('')}</div>`
      : '<div class="video-product-empty">Chưa gắn sản phẩm. Nhập SKU rồi bấm Tìm SKU.</div>'
    const resultHtml = search.loading
      ? '<div class="video-product-empty">Đang tìm sản phẩm trong catalog...</div>'
      : search.error
        ? `<div class="video-product-empty warning">${escapeHtml(search.error)}</div>`
        : search.rows.length
          ? `<div class="video-product-results">${search.rows.map(product => {
              const url = productUrl(product)
              const name = cleanText(product.product_name) || cleanText(product.item_sku) || product.item_id
              const sku = cleanText(product.matched_sku || product.item_sku)
              const variation = cleanText(product.matched_variation_name)
              return `
                <div class="video-product-result">
                  ${product.image_url ? `<img class="video-product-thumb" src="${escapeHtml(product.image_url)}" alt="">` : '<div class="video-product-thumb empty"></div>'}
                  <div class="video-product-info">
                    <strong>${escapeHtml(name)}</strong>
                    <span>${escapeHtml([sku ? `SKU ${sku}` : '', variation, `ID ${product.item_id}`, product.has_video ? 'Đã có video' : 'Chưa có video'].filter(Boolean).join(' · '))}</span>
                  </div>
                  <div class="video-product-actions">
                    ${url ? `<a class="video-text-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener">Mở sản phẩm</a>` : ''}
                    <button class="video-btn secondary compact" type="button" data-action="attach-multi-product" data-shop="${escapeHtml(shop)}" data-item-id="${escapeHtml(product.item_id)}">Gắn</button>
                  </div>
                </div>
              `
            }).join('')}</div>`
          : ''
    return `
      <div class="video-field video-product-picker">
        <label>Sản phẩm gắn kèm</label>
        <input data-multi-field="item_ids" type="hidden" value="${escapeHtml(itemIdsText)}">
        <div class="video-product-search-row">
          <input data-multi-field="product_search" data-shop="${escapeHtml(shop)}" type="search" value="${escapeHtml(search.query)}" placeholder="Nhập SKU/tên, ví dụ K263">
          <button class="video-btn secondary compact" type="button" data-action="search-multi-product" data-shop="${escapeHtml(shop)}">Tìm SKU</button>
        </div>
        <small>${missingText}</small>
        ${selectedHtml}
        ${resultHtml}
      </div>
    `
  }

  function updateRowProducts(shop, nextProducts) {
    const targetShop = cleanText(shop)
    readMultiShopRowsFromDom()
    state.multiShopRows = state.multiShopRows.map(row => {
      if (cleanText(row.shop) !== targetShop) return row
      const unique = []
      const seen = new Set()
      for (const product of nextProducts.map(normalizeProduct).filter(Boolean)) {
        if (seen.has(product.item_id)) continue
        seen.add(product.item_id)
        unique.push(product)
        if (unique.length >= 6) break
      }
      return {
        ...row,
        item_ids: unique.map(item => item.item_id).join(', '),
        item_rows: unique
      }
    })
    state.multiShopPreview = null
  }

  function findCandidate(shop, itemId) {
    const targetShop = cleanText(shop)
    const targetItemId = cleanText(itemId)
    const searchRows = searchState(targetShop).rows || []
    const row = state.multiShopRows.find(item => cleanText(item.shop) === targetShop) || {}
    return [...searchRows, ...(row.item_rows || [])]
      .map(normalizeProduct)
      .filter(Boolean)
      .find(product => product.item_id === targetItemId)
  }

  async function search(shop) {
    const targetShop = cleanText(shop)
    const rowNode = [...document.querySelectorAll('[data-multi-shop-row]')]
      .find(node => cleanText(node.dataset.shop) === targetShop)
    const search = searchState(targetShop)
    search.query = cleanText(rowNode?.querySelector('[data-multi-field="product_search"]')?.value || search.query)
    if (search.query.length < 2) {
      search.rows = []
      search.error = 'Nhập ít nhất 2 ký tự SKU hoặc tên sản phẩm để tìm.'
      renderMultiShopPanel()
      return
    }
    readMultiShopRowsFromDom()
    search.loading = true
    search.error = ''
    renderMultiShopPanel()
    try {
      const params = new URLSearchParams({
        platform: 'shopee',
        shop: targetShop,
        query: search.query,
        limit: '12'
      })
      const data = await fetchJson(`${API_BASE}/api/video/catalog-items?${params.toString()}`)
      search.rows = (Array.isArray(data.rows) ? data.rows : [])
        .map(normalizeProduct)
        .filter(Boolean)
      search.error = search.rows.length ? '' : 'Catalog riêng của shop này chưa có sản phẩm khớp SKU/tên. Hãy đồng bộ/nhập catalog đúng shop rồi tìm lại; hệ thống không lấy link shop khác.'
      setStatus(search.rows.length
        ? `Đã tìm thấy ${formatNumber(search.rows.length)} sản phẩm cho shop ${targetShop}.`
        : `Chưa tìm thấy sản phẩm cho shop ${targetShop}.`, search.rows.length ? 'success' : 'warning')
    } catch (error) {
      search.rows = []
      search.error = cleanText(error.message) || 'Không tìm được sản phẩm.'
      setStatus(search.error, 'error')
    } finally {
      search.loading = false
      renderMultiShopPanel()
    }
  }

  function attach(shop, itemId) {
    const targetShop = cleanText(shop)
    const product = findCandidate(targetShop, itemId)
    if (!product) {
      setStatus('Không tìm thấy sản phẩm để gắn. Hãy bấm Tìm SKU lại.', 'warning')
      return
    }
    const row = state.multiShopRows.find(item => cleanText(item.shop) === targetShop) || {}
    const current = parseItemRows(row.item_ids, row.item_rows || [])
    updateRowProducts(targetShop, [...current, product])
    renderMultiShopPanel()
    setStatus(`Đã gắn sản phẩm ${cleanText(product.matched_sku || product.item_sku || product.item_id)} cho shop ${targetShop}.`, 'success')
  }

  function remove(shop, itemId) {
    const targetShop = cleanText(shop)
    const targetItemId = cleanText(itemId)
    const row = state.multiShopRows.find(item => cleanText(item.shop) === targetShop) || {}
    const current = parseItemRows(row.item_ids, row.item_rows || [])
      .filter(product => product.item_id !== targetItemId)
    updateRowProducts(targetShop, current)
    renderMultiShopPanel()
    setStatus(`Đã bỏ gắn sản phẩm khỏi shop ${targetShop}.`, 'success')
  }

  return {
    attach,
    normalizeProduct,
    parseItemRows,
    productUrl,
    remove,
    render,
    search,
    searchState
  }
}
