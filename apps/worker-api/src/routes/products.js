// ════════════════════════════════════════════════════════════════════
// PRODUCTS
// ════════════════════════════════════════════════════════════════════
async function handleProducts(request, env, cors) {
  const url = new URL(request.url);

  // ==========================================
  // THÊM MỚI 1: API LẤY GIÁ KHUYẾN MÃI (/api/products/promo-prices)
  // ==========================================
  if (request.method === "GET" && url.pathname.endsWith('/promo-prices')) {
    try {
      const platform = url.searchParams.get('platform') || 'shopee';
      // Mở rộng bắt thêm user_name
      const shop = url.searchParams.get('user_name') || url.searchParams.get('shop');
      if (!shop) return Response.json({ success: false, error: "Missing shop/user_name parameter" }, { status: 400, headers: cors });
      const query = `SELECT platform_sku, discount_price FROM product_variations WHERE platform = ? AND shop = ? AND discount_price > 0`;
      const { results } = await env.DB.prepare(query).bind(platform, shop).all();
      return Response.json({ success: true, data: results }, { headers: cors });
    } catch (error) {
      return Response.json({ success: false, error: error.message }, { status: 500, headers: cors });
    }
  }

  // ==========================================
  // THÊM MỚI 2: API NHẬN GIÁ KHUYẾN MÃI (/api/products/update-promo-prices)
  // ==========================================
  if (request.method === "POST" && url.pathname.endsWith('/update-promo-prices')) {
    try {
      const body = await request.json();
      const platform = body.platform;
      // Bắt chuẩn định danh mới
      const shop = body.user_name || body.shop; 
      const items = body.items;
      if (!platform || !shop || !items || !Array.isArray(items)) {
        return Response.json({ success: false, error: "Dữ liệu không hợp lệ" }, { status: 400, headers: cors });
      }
      const statements = [];
      for (const item of items) {
        if (item.sku && item.price !== undefined) {
          statements.push(
            env.DB.prepare(`UPDATE product_variations SET discount_price = ? WHERE platform = ? AND shop = ? AND platform_sku = ?`)
            .bind(item.price, platform, shop, item.sku)
          );
        }
      }
      if (statements.length > 0) await env.DB.batch(statements);
      return Response.json({ success: true, updated: statements.length }, { headers: cors });
    } catch (error) {
      return Response.json({ success: false, error: error.message }, { status: 500, headers: cors });
    }
  }

  // ==========================================
  // CÁC API CŨ CỦA PRODUCTS GỐC
  // ==========================================
  if (request.method === "GET") {
    const search = url.searchParams.get("search");
    let cond = "";
    let params = [];
    
    // Nếu có từ khóa tìm kiếm -> Bật chế độ quét Tên và Mã SKU
    if (search) {
      cond = "WHERE p.sku LIKE ? OR p.product_name LIKE ?";
      params = [`%${search}%`, `%${search}%`];
    }

    const query = `
      SELECT p.*, 
        COALESCE(
          NULLIF(p.image_url, ''), 
          (SELECT image_url FROM product_variations v WHERE v.internal_sku = p.sku AND v.image_url != '' AND v.image_url IS NOT NULL LIMIT 1), 
          ''
        ) as image_url
      FROM products p 
      ${cond}
      ORDER BY p.sku
      LIMIT 50
    `;
    const rows = await env.DB.prepare(query).bind(...params).all();
    
    // Tối ưu bọc thép: Trả về dạng { data } cho Popup Map SKU, và dạng Mảng cho trang Quản lý Sản phẩm cũ để không bị sụp Web
    if (search) {
      return Response.json({ data: rows.results, success: true }, { headers: cors });
    }
    return Response.json(rows.results, { headers: cors });
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
      b.sku, b.product_name || "", b.cost_invoice || 0, b.cost_real || 0,
      b.is_combo || 0, b.combo_items || null, b.combo_qty || 1, b.image_url || ""
    ).run();
    return Response.json({ status: "ok" }, { headers: cors });
  }

  if (request.method === "DELETE") {
    const path = url.pathname;
    if (path.endsWith('/bulk')) {
      const { skus } = await request.json();
      if (!skus || !Array.isArray(skus) || skus.length === 0) return Response.json({ error: "No SKUs" }, { status: 400, headers: cors });
      const placeholders = skus.map(() => '?').join(',');
      await env.DB.prepare(`DELETE FROM products WHERE sku IN (${placeholders})`).bind(...skus).run();
      return Response.json({ status: "ok", count: skus.length }, { headers: cors });
    }
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
    // Đã thêm alias 'v.' để query SQL hiểu rõ cột của bảng nào
    if (status) { conds.push('v.map_status = ?'); params.push(status) }
    if (shop)   { conds.push('v.shop = ?');       params.push(shop)   }
    
    // Tối ưu chót: Ưu tiên lấy ảnh từ bảng products (SKU nội bộ chính) như yêu cầu. 
    // Dùng TRIM() để loại bỏ các trường hợp chuỗi rỗng có dấu cách ẩn gây lỗi COALESCE.
    const query = `
      SELECT 
        v.id, v.platform, v.shop, v.platform_item_id, v.product_name, 
        v.variation_name, v.platform_sku, v.internal_sku, v.price, 
        v.discount_price, v.stock, v.map_status, v.mapped_items, 
        v.created_at, v.updated_at,
        COALESCE(
          NULLIF(TRIM(v.image_url), ''),
          (SELECT NULLIF(TRIM(image_url), '') FROM products p WHERE p.sku = v.internal_sku LIMIT 1),
          (SELECT NULLIF(TRIM(image_url), '') FROM product_variations v2 WHERE v2.internal_sku = v.internal_sku AND NULLIF(TRIM(v2.image_url), '') IS NOT NULL LIMIT 1),
          ''
        ) as image_url
      FROM product_variations v 
      WHERE ${conds.join(' AND ')} 
      ORDER BY v.map_status, v.product_name
    `;
    const rows = await env.DB.prepare(query).bind(...params).all()
    return Response.json(rows.results, { headers: cors })
  }

  // POST /api/sync-variations — Bot gửi lên sau khi crawl SP Shopee
  if (request.method === 'POST') {
    const body = await request.json()
    
    // BỌC THÉP: Ưu tiên bắt user_name từ Bot đẩy lên (fallback về shop để tool cũ không chết)
    const rootShop = body.user_name || body.shop || '';
    
    // Tự động chuyển đổi định dạng từ Bot (products) sang định dạng của API (variations)
    const variations = body.variations || []
    if (body.products) {
      for (const p of body.products) {
         const p_img = p.images && p.images.length > 0 ? p.images[0] : '';
         for (const v of (p.variations || [])) {
            variations.push({
               platform: body.platform || 'shopee',
               shop: rootShop, // Ép chuẩn định danh 100%
               platform_item_id: p.item_id,
               product_name: p.product_name,
               variation_name: v.variation_name,
               platform_sku: v.sku,
               image_url: v.variation_image || '',
               main_image: p_img || '',
               price: v.price,
               discount_price: v.discount_price || 0, // BỔ SUNG LẤY GIÁ KM TỪ PYTHON
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

      const finalShop = v.user_name || v.shop || rootShop; // Chốt chặn cuối cùng cho từng biến thể

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
           platform_sku, internal_sku, mapped_items, image_url, price, discount_price, stock, map_status, updated_at)
        VALUES (?,?,?,?,?,?,?,?, CASE WHEN ? != '' THEN ? ELSE ? END, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(platform, shop, platform_sku) DO UPDATE SET
          product_name     = CASE WHEN excluded.product_name != '' THEN excluded.product_name ELSE product_variations.product_name END,
          variation_name   = excluded.variation_name,
          image_url        = CASE WHEN ? != '' THEN ? ELSE product_variations.image_url END,
          price            = excluded.price,
          discount_price   = excluded.discount_price,
          stock            = excluded.stock,
          internal_sku     = CASE WHEN product_variations.map_status = 'MAPPED' THEN product_variations.internal_sku ELSE excluded.internal_sku END,
          mapped_items     = CASE WHEN product_variations.map_status = 'MAPPED' THEN product_variations.mapped_items ELSE excluded.mapped_items END,
          map_status       = CASE WHEN product_variations.map_status = 'MAPPED' THEN 'MAPPED' ELSE excluded.map_status END,
          updated_at       = datetime('now')
      `).bind(
        v.platform || 'shopee', finalShop, v.platform_item_id || '',
        v.product_name || '', v.variation_name || '',
        pSku, internalSku, internalSku ? JSON.stringify([{sku: internalSku, qty: 1}]) : '[]', 
        v.image_url, v.image_url, v.main_image,
        v.price || 0, v.discount_price || 0, v.stock || 0, mapStatus,
        v.image_url, v.image_url
      ))
      synced++
    }

    // Batch insert theo 50
    for (let i = 0; i < stmts.length; i += 50) {
      await env.DB.batch(stmts.slice(i, i + 50))
    }

    return Response.json({ status: 'ok', synced, auto_mapped: autoMapped }, { headers: cors })
  }

  if (request.method === 'PATCH') {
    const url = new URL(request.url);
    
    // Nhánh 1: Lưu chỉnh sửa thông tin (Tên, Giá, Tồn, Ảnh)
    if (url.pathname.endsWith('/edit')) {
      const { id, variation_name, price, discount_price, stock, image_url } = await request.json();
      await env.DB.prepare(`
        UPDATE product_variations
        SET variation_name = ?, price = ?, discount_price = ?, stock = ?, image_url = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(variation_name, price, discount_price, stock, image_url, id).run();
      return Response.json({ status: 'ok' }, { headers: cors });
    }

    // Nhánh 2: Lưu map thủ công từ FE
    const body = await request.json()
    const { id, internal_sku, mapped_items, platform_sku } = body;

    // 🌟 LUỒNG QUICK MAP: Xử lý Map nóng trực tiếp từ màn hình Đơn hàng
    if (platform_sku && !id) {
        console.log(`[API QUICK MAP] Đang xử lý map: ${platform_sku} -> ${internal_sku}`);
        
// 1. Gắn map vào Biến thể
        const resVar = await env.DB.prepare(`
            UPDATE product_variations 
            SET internal_sku = ?, map_status = 'MAPPED', updated_at = datetime('now')
            WHERE platform_sku = ? OR variation_name = ?
        `).bind(internal_sku, platform_sku, platform_sku).run();
        console.log(`[API QUICK MAP] Đã update ${resVar.meta?.changes || 0} dòng trong bảng product_variations`);

        // 2. Chữa cháy: Cập nhật ngược lại toàn bộ các Đơn hàng cũ đang bị trống SKU
        const resOrder = await env.DB.prepare(`
            UPDATE order_items SET sku = ? 
            WHERE variation_name = ? OR sku = ? OR product_name = ?
        `).bind(internal_sku, platform_sku, platform_sku, platform_sku).run();
        console.log(`[API QUICK MAP] Đã update ${resOrder.meta?.changes || 0} dòng trong bảng order_items`);

        // 3. Đưa vào sổ tay bí kíp (sku_alias) để lần sau auto-map
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS sku_alias (platform_sku TEXT PRIMARY KEY, internal_sku TEXT)`).run();
        const existAlias = await env.DB.prepare(`SELECT platform_sku FROM sku_alias WHERE platform_sku = ?`).bind(platform_sku).first();
        if (existAlias) {
            await env.DB.prepare(`UPDATE sku_alias SET internal_sku = ? WHERE platform_sku = ?`).bind(internal_sku, platform_sku).run();
        } else {
            await env.DB.prepare(`INSERT INTO sku_alias (platform_sku, internal_sku) VALUES (?, ?)`).bind(platform_sku, internal_sku).run();
        }
        
        return Response.json({ status: 'ok', message: "Quick Map Success" }, { headers: cors })
    }

    // Luồng Map cũ (Dành cho trang Quản lý Sản phẩm có ID)
    if (!id || !internal_sku)
      return Response.json({ error: 'Missing id or internal_sku' }, { status: 400, headers: cors })

    await env.DB.prepare(`
          UPDATE product_variations
          SET internal_sku = ?, mapped_items = ?, map_status = 'MAPPED', updated_at = datetime('now')
          WHERE id = ?
        `).bind(internal_sku, mapped_items || '[]', id).run()

        // Đảm bảo bảng sku_alias tồn tại để Database không bị sập (Lỗi 500)
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS sku_alias (
            platform_sku TEXT PRIMARY KEY,
            internal_sku TEXT
          )
        `).run()

        // Lưu vào sku_alias để dùng cho lần sau (Dùng SELECT -> UPDATE/INSERT để tránh lỗi ON CONFLICT)
    const row = await env.DB.prepare(`SELECT platform_sku FROM product_variations WHERE id=?`).bind(id).first()
    if (row?.platform_sku) {
      const existAlias = await env.DB.prepare(`SELECT platform_sku FROM sku_alias WHERE platform_sku = ?`).bind(row.platform_sku).first()
      if (existAlias) {
        await env.DB.prepare(`UPDATE sku_alias SET internal_sku = ? WHERE platform_sku = ?`).bind(internal_sku, row.platform_sku).run()
      } else {
        await env.DB.prepare(`INSERT INTO sku_alias (platform_sku, internal_sku) VALUES (?, ?)`).bind(row.platform_sku, internal_sku).run()
      }
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