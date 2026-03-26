// ════════════════════════════════════════════════════════════════════
// PRODUCTS
// ════════════════════════════════════════════════════════════════════
async function handleProducts(request, env, cors) {

  if (request.method === "GET") {
    const rows = await env.DB.prepare(`
      SELECT * FROM products ORDER BY sku
    `).all()
    return Response.json(rows.results, { headers: cors })
  }

  if (request.method === "POST") {
    const b = await request.json();
    await env.DB.prepare(`
      INSERT INTO products (sku, product_name, cost_invoice, cost_real, is_combo, combo_items, combo_qty, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sku) DO UPDATE SET
        product_name = excluded.product_name,
        cost_invoice = CASE WHEN excluded.cost_invoice > 0 THEN excluded.cost_invoice ELSE products.cost_invoice END,
        cost_real = CASE WHEN excluded.cost_real > 0 THEN excluded.cost_real ELSE products.cost_real END,
        is_combo = excluded.is_combo,
        combo_items = excluded.combo_items,
        combo_qty = excluded.combo_qty,
        image_url = CASE WHEN excluded.image_url != '' THEN excluded.image_url ELSE products.image_url END
    `).bind(
      b.sku, 
      b.product_name || "", 
      b.cost_invoice || 0, 
      b.cost_real || 0,
      b.is_combo || 0, 
      b.combo_items || null, 
      b.combo_qty || 1,
      b.image_url || ""
    ).run();
    return Response.json({ status: "ok" }, { headers: cors });
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Nếu là xóa hàng loạt
    if (path.endsWith('/bulk')) {
      const { skus } = await request.json();
      if (!skus || !Array.isArray(skus) || skus.length === 0) {
        return Response.json({ error: "No SKUs" }, { status: 400, headers: cors });
      }
      const placeholders = skus.map(() => '?').join(',');
      await env.DB.prepare(`DELETE FROM products WHERE sku IN (${placeholders})`)
        .bind(...skus)
        .run();
      return Response.json({ status: "ok", count: skus.length }, { headers: cors });
    }

    // Nếu xóa 1 sản phẩm (lấy sku từ cuối url)
    const sku = path.split('/').pop();
    await env.DB.prepare(`DELETE FROM products WHERE sku = ?`).bind(sku).run();
    return Response.json({ status: "ok" }, { headers: cors });
  }
}

// ════════════════════════════════════════════════════════════════════
// COST SETTINGS
// Lưu dạng key-value: cost_key, cost_value, cost_type ('pct'|'fixed')
// Ví dụ: shopee_platform_fee / 10 / pct
//        tiktok_ads / 5 / pct
//        packaging / 3000 / fixed
// ════════════════════════════════════════════════════════════════════
async function handleCostSettings(request, env, cors) {

  if (request.method === "GET") {
    const rows = await env.DB.prepare(`
      SELECT cost_key, cost_value, cost_type, cost_name, calc_type, platform, shop
      FROM cost_settings ORDER BY cost_key
    `).all()
    return Response.json(rows.results, { headers: cors })
  }

  if (request.method === "POST") {
    const items = await request.json()
    for (const item of items) {
      await env.DB.prepare(`
        INSERT INTO cost_settings (cost_key, cost_value, cost_type, cost_name, calc_type, platform, shop)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(cost_key) DO UPDATE SET
          cost_value = excluded.cost_value,
          cost_type  = excluded.cost_type,
          cost_name  = excluded.cost_name,
          calc_type  = excluded.calc_type,
          platform   = excluded.platform,
          shop       = excluded.shop
      `).bind(
        item.cost_key,
        item.cost_value,
        item.cost_type  || "fixed",
        item.cost_name  || "",
        item.calc_type  || "per_order",
        item.platform   || "",
        item.shop       || ""
      ).run()
    }
    return Response.json({ status: "ok" }, { headers: cors })
  }
}


// ════════════════════════════════════════════════════════════════════
// PRODUCT VARIATIONS — Map SKU Shopee → Internal SKU
// ════════════════════════════════════════════════════════════════════
async function handleVariations(request, env, cors) {

  // GET: Lấy danh sách variations (có filter map_status, shop)
  if (request.method === 'GET') {
    const url    = new URL(request.url)
    const status = url.searchParams.get('map_status')
    const shop   = url.searchParams.get('shop')
    const conds  = ['1=1']
    const params = []
    if (status) { conds.push('map_status = ?'); params.push(status) }
    if (shop)   { conds.push('shop = ?');       params.push(shop)   }
    const rows = await env.DB.prepare(
      `SELECT * FROM product_variations WHERE ${conds.join(' AND ')} ORDER BY map_status, product_name`
    ).bind(...params).all()
    return Response.json(rows.results, { headers: cors })
  }

  // POST /api/sync-variations — Bot gửi lên sau khi crawl SP Shopee
  if (request.method === 'POST') {
    const body = await request.json()
    
    // Tự động chuyển đổi định dạng từ Bot (products) sang định dạng của API (variations)
    const variations = body.variations || []
    if (body.products) {
      for (const p of body.products) {
         const p_img = p.images && p.images.length > 0 ? p.images[0] : '';
         for (const v of (p.variations || [])) {
            variations.push({
               platform: body.platform || 'shopee',
               shop: body.shop || '',
               platform_item_id: p.item_id,
               product_name: p.product_name,
               variation_name: v.variation_name,
               platform_sku: v.sku,
               image_url: v.variation_image || p_img,
               price: v.price,
               stock: v.stock
            })
         }
      }
    }

    if (!variations.length)
      return Response.json({ status: 'ok', synced: 0 }, { headers: cors })

    // Lấy sku_alias để auto-map
    const aliasRows = await env.DB.prepare(`SELECT platform_sku, internal_sku FROM sku_alias`).all()
    const aliasMap  = {}
    for (const a of aliasRows.results) aliasMap[a.platform_sku.toLowerCase()] = a.internal_sku

    // Lấy products để fuzzy-match SKU (K159 ↔ H159)
    const prodRows = await env.DB.prepare(`SELECT sku FROM products`).all()
    const allSkus  = prodRows.results.map(p => p.sku)

    let synced = 0, autoMapped = 0
    const stmts = []

    for (const v of variations) {
      const pSku = (v.platform_sku || '').trim()
      if (!pSku) continue

      // Thử auto-map: 1) exact alias, 2) exact sku, 3) fuzzy (K159 ~ H159)
      let internalSku = aliasMap[pSku.toLowerCase()] || ''
      let mapStatus   = internalSku ? 'MAPPED' : 'UNMAPPED'

      if (!internalSku) {
        // Exact match với internal SKU
        const exactMatch = allSkus.find(s => s.toLowerCase() === pSku.toLowerCase())
        if (exactMatch) { internalSku = exactMatch; mapStatus = 'MAPPED' }
      }

      if (!internalSku) {
        // Fuzzy: bỏ chữ cái đầu rồi so số (K159 → 159, H159 → 159)
        const numPart = pSku.replace(/^[A-Za-z]+/, '')
        if (numPart.length >= 2) {
          const fuzzy = allSkus.find(s => s.replace(/^[A-Za-z]+/, '') === numPart)
          if (fuzzy) { internalSku = fuzzy; mapStatus = 'MAPPED' }
        }
      }

      if (internalSku) autoMapped++

      stmts.push(env.DB.prepare(`
        INSERT INTO product_variations
          (platform, shop, platform_item_id, product_name, variation_name,
           platform_sku, internal_sku, mapped_items, image_url, price, stock, map_status, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
        ON CONFLICT(platform, shop, platform_sku) DO UPDATE SET
          product_name     = CASE WHEN excluded.product_name != '' THEN excluded.product_name ELSE product_variations.product_name END,
          variation_name   = excluded.variation_name,
          image_url        = CASE WHEN excluded.image_url != '' THEN excluded.image_url ELSE product_variations.image_url END,
          price            = excluded.price,
          stock            = excluded.stock,
          internal_sku     = CASE WHEN product_variations.map_status = 'MAPPED' THEN product_variations.internal_sku ELSE excluded.internal_sku END,
          mapped_items     = CASE WHEN product_variations.map_status = 'MAPPED' THEN product_variations.mapped_items ELSE excluded.mapped_items END,
          map_status       = CASE WHEN product_variations.map_status = 'MAPPED' THEN 'MAPPED' ELSE excluded.map_status END,
          updated_at       = datetime('now')
      `).bind(
        v.platform || 'shopee', v.shop || '', v.platform_item_id || '',
        v.product_name || '', v.variation_name || '',
        pSku, internalSku, internalSku ? JSON.stringify([{sku: internalSku, qty: 1}]) : '[]', v.image_url || '',
        v.price || 0, v.stock || 0, mapStatus
      ))
      synced++
    }

    // Batch insert theo 50
    for (let i = 0; i < stmts.length; i += 50) {
      await env.DB.batch(stmts.slice(i, i + 50))
    }

    return Response.json({ status: 'ok', synced, auto_mapped: autoMapped }, { headers: cors })
  }

  // PATCH /api/sync-variations — Lưu map thủ công từ FE
  if (request.method === 'PATCH') {
    const { id, internal_sku, mapped_items } = await request.json()
    if (!id || !internal_sku)
      return Response.json({ error: 'Missing id or internal_sku' }, { status: 400, headers: cors })

    await env.DB.prepare(`
      UPDATE product_variations
      SET internal_sku = ?, mapped_items = ?, map_status = 'MAPPED', updated_at = datetime('now')
      WHERE id = ?
    `).bind(internal_sku, mapped_items || '[]', id).run()

    // Lưu vào sku_alias để dùng cho lần sau
    const row = await env.DB.prepare(`SELECT platform_sku FROM product_variations WHERE id=?`).bind(id).first()
    if (row?.platform_sku) {
      await env.DB.prepare(`
        INSERT INTO sku_alias (platform_sku, internal_sku)
        VALUES (?, ?)
        ON CONFLICT(platform_sku) DO UPDATE SET internal_sku = excluded.internal_sku
      `).bind(row.platform_sku, internal_sku).run()
    }

    return Response.json({ status: 'ok' }, { headers: cors })
  }

  // ── THÊM MỚI: XỬ LÝ DELETE CHO VARIATIONS (Xóa hàng loạt) ──
  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/bulk')) {
      const { ids } = await request.json();
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return Response.json({ error: "No IDs provided" }, { status: 400, headers: cors });
      }
      const placeholders = ids.map(() => '?').join(',');
      await env.DB.prepare(`DELETE FROM product_variations WHERE id IN (${placeholders})`)
        .bind(...ids)
        .run();
      return Response.json({ status: "ok", count: ids.length }, { headers: cors });
    }
  }
}

export { handleProducts, handleCostSettings, handleVariations }