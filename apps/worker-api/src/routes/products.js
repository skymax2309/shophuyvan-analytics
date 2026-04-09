// ════════════════════════════════════════════════════════════════════
// PRODUCTS
// ════════════════════════════════════════════════════════════════════
export async function handleProducts(request, env, cors) {
  const url = new URL(request.url);


  // ==========================================
  // THÊM MỚI 1: API LẤY GIÁ KHUYẾN MÃI (/api/products/promo-prices)
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
  // BỌC THÉP: Chỉ bắt đúng đường dẫn gốc /api/products, tuyệt đối không nuốt nhầm API khác
  if (request.method === "GET" && (url.pathname === "/api/products" || url.pathname === "/api/products/")) {
    const search = url.searchParams.get("search");
    let cond = "";
    let params = [];
    
    // Nếu có từ khóa tìm kiếm -> Bật chế độ quét Tên và Mã SKU
    if (search) {
      cond = "WHERE p.sku LIKE ? OR p.product_name LIKE ?";
      params = [`%${search}%`, `%${search}%`];
    }

// Liệt kê rõ các cột để tránh lỗi trùng lặp và loại bỏ các chuỗi rác 'undefined', 'null'
    const query = `
      SELECT p.sku, p.product_name, p.description, p.video_url, p.images, p.cost_invoice, p.cost_real, p.is_combo, p.combo_items, p.combo_qty, p.stock, p.stock_main, p.stock_sub, p.min_stock, p.is_parent, p.parent_sku,
        CASE
          WHEN p.image_url IS NOT NULL AND TRIM(p.image_url) NOT IN ('', 'undefined', 'null') THEN TRIM(p.image_url)
          ELSE COALESCE(
            (SELECT TRIM(image_url) FROM product_variations v WHERE v.internal_sku = p.sku AND TRIM(v.image_url) NOT IN ('', 'undefined', 'null') LIMIT 1),
            ''
          )
        END as image_url,
        (SELECT GROUP_CONCAT(DISTINCT shop) FROM product_variations v WHERE v.internal_sku = p.sku) as mapped_shops
      FROM products p 
      ${cond}
      ORDER BY p.sku
    `;
    const rows = await env.DB.prepare(query).bind(...params).all();
    
    // Tối ưu bọc thép: Trả về dạng { data } cho Popup Map SKU, và dạng Mảng cho trang Quản lý Sản phẩm cũ để không bị sụp Web
    if (search) {
      return Response.json({ data: rows.results, success: true }, { headers: cors });
    }
    return Response.json(rows.results, { headers: cors });
  }

// ==========================================
      // [API MỚI] Import Hàng Loạt Từ 3 File Shopee (Sales + Media + Basic)
      // ==========================================
      if (request.method === "POST" && url.pathname.endsWith("/shopee-import")) {
        const { products_data } = await request.json();
        if (!products_data || !products_data.length) return Response.json({ error: "Empty data" }, { status: 400, headers: cors });

        let imported = 0;
        const stmts = [];

        for (const p of products_data) {
            // 1. Upsert Sản phẩm Cha
            stmts.push(env.DB.prepare(`
                INSERT INTO products (sku, product_name, description, video_url, images, image_url, is_parent, stock, cost_invoice, cost_real)
                VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, 0)
                ON CONFLICT(sku) DO UPDATE SET 
                    product_name = excluded.product_name,
                    description = CASE WHEN excluded.description != '' THEN excluded.description ELSE products.description END,
                    video_url = CASE WHEN excluded.video_url != '' THEN excluded.video_url ELSE products.video_url END,
                    images = CASE WHEN excluded.images != '[]' THEN excluded.images ELSE products.images END,
                    image_url = CASE WHEN excluded.image_url != '' THEN excluded.image_url ELSE products.image_url END,
                    is_parent = 1
            `).bind(p.parent_sku, p.product_name, p.description || '', p.video_url || '', JSON.stringify(p.images || []), p.image_url || ''));

            // 2. Upsert Các Phân Loại Con
            for (const v of p.variations) {
                stmts.push(env.DB.prepare(`
                    INSERT INTO products (sku, parent_sku, product_name, image_url, stock, cost_invoice, cost_real)
                    VALUES (?, ?, ?, ?, ?, 0, 0)
                    ON CONFLICT(sku) DO UPDATE SET
                        parent_sku = excluded.parent_sku,
                        product_name = excluded.product_name,
                        image_url = CASE WHEN excluded.image_url != '' THEN excluded.image_url ELSE products.image_url END,
                        stock = excluded.stock
                `).bind(v.sku, p.parent_sku, v.variation_name, v.image_url || '', v.stock || 0));
            }
            imported++;
        }

        // Chạy Batch
        for (let i = 0; i < stmts.length; i += 40) {
            await env.DB.batch(stmts.slice(i, i + 40));
        }

        return Response.json({ status: "ok", imported }, { headers: cors });
      }

      // ==========================================
      // [API MỚI] Gộp và Tách Sản Phẩm Cha
      // ==========================================
      if (request.method === "POST" && url.pathname.endsWith("/group-parent")) {
        const { parent_sku, parent_name, child_skus } = await request.json();
        await env.DB.prepare(`INSERT INTO products (sku, product_name, is_parent, stock, cost_invoice, cost_real) VALUES (?, ?, 1, 0, 0, 0) ON CONFLICT(sku) DO UPDATE SET is_parent = 1`).bind(parent_sku, parent_name || parent_sku).run();
        const placeholders = child_skus.map(() => '?').join(',');
        await env.DB.prepare(`UPDATE products SET parent_sku = ? WHERE sku IN (${placeholders})`).bind(parent_sku, ...child_skus).run();
        return Response.json({ status: "ok" }, { headers: cors });
      }
      
      if (request.method === "POST" && url.pathname.endsWith("/ungroup-parent")) {
        const { child_skus } = await request.json();
        const placeholders = child_skus.map(() => '?').join(',');
        await env.DB.prepare(`UPDATE products SET parent_sku = NULL WHERE sku IN (${placeholders})`).bind(...child_skus).run();
        return Response.json({ status: "ok" }, { headers: cors });
      }

 // ==========================================
      // [API MỚI] IMPORT EXCEL (Cập nhật Data hàng loạt)
      // ==========================================
      if (request.method === "POST" && url.pathname.endsWith("/bulk-import")) {
        try {
            let bodyData;
            try { bodyData = await request.json(); } catch(err) { return Response.json({ error: "Lỗi giải mã JSON từ Client" }, { status: 400, headers: cors }); }
            
            const { items } = bodyData;
            if (!items || !items.length) return Response.json({ error: "Dữ liệu trống" }, { status: 400, headers: cors });

            console.log("🗄️ [API IMPORT EXCEL] Bắt đầu Ghi Đè", items.length, "sản phẩm...");
            const stmts = [];

            for (const p of items) {
stmts.push(env.DB.prepare(`
                    INSERT INTO products (sku, product_name, parent_sku, description, video_url, cost_invoice, cost_real, is_combo, combo_items, image_url, stock, stock_main, stock_sub, min_stock)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(sku) DO UPDATE SET 
                        product_name = CASE WHEN excluded.product_name != '' THEN excluded.product_name ELSE products.product_name END,
                        parent_sku = CASE WHEN excluded.parent_sku IS NOT NULL THEN excluded.parent_sku ELSE products.parent_sku END,
                        description = CASE WHEN excluded.description != '' THEN excluded.description ELSE products.description END,
                        video_url = CASE WHEN excluded.video_url != '' THEN excluded.video_url ELSE products.video_url END,
                        cost_invoice = excluded.cost_invoice,
                        cost_real = excluded.cost_real,
                        is_combo = excluded.is_combo,
                        combo_items = CASE WHEN excluded.combo_items IS NOT NULL THEN excluded.combo_items ELSE products.combo_items END,
                        image_url = CASE WHEN excluded.image_url != '' THEN excluded.image_url ELSE products.image_url END,
                        stock = excluded.stock,
                        stock_main = excluded.stock_main,
                        stock_sub = excluded.stock_sub,
                        min_stock = excluded.min_stock
                `).bind(
                    String(p.sku), 
                    p.product_name ? String(p.product_name) : "", 
                    p.parent_sku ? String(p.parent_sku) : null, 
                    p.description ? String(p.description) : "", 
                    p.video_url ? String(p.video_url) : "", 
                    Number(p.cost_invoice) || 0, 
                    Number(p.cost_real) || 0, 
                    Number(p.is_combo) || 0, 
                    p.combo_items ? String(p.combo_items) : null, 
                    p.image_url ? String(p.image_url) : "", 
                    Number(p.stock) || 0, 
                    Number(p.stock_main) || 0, 
                    Number(p.stock_sub) || 0, 
                    Number(p.min_stock) || 5
                ));
            }

            // Chạy Batch an toàn
            for (let i = 0; i < stmts.length; i += 50) {
                await env.DB.batch(stmts.slice(i, i + 50));
            }

            return Response.json({ status: "ok", imported: items.length }, { headers: cors });
        } catch (e) {
            console.error("Lỗi Import Excel:", e.message);
            return Response.json({ error: e.message }, { status: 500, headers: cors });
        }
      }

// ==========================================
  // API POST GỐC (Lưu 1 sản phẩm thủ công)
  // ==========================================
if (request.method === "POST" && !url.pathname.includes("/shopee-import") && !url.pathname.includes("/group-parent") && !url.pathname.includes("/ungroup-parent") && !url.pathname.includes("/bulk-import")) {
    const b = await request.json();
    console.log("🗄️ [API PRODUCTS POST DÒ MÌN] Đang lưu SKU:", b.sku, "| Giá Vốn HĐ:", b.cost_invoice, "| Giá Thực:", b.cost_real);
    
    // 🌟 CHỐT CHẶN: Ưu tiên lấy variation_name làm tên phân loại, nếu rỗng thì mới lấy product_name
    const finalName = b.variation_name || b.product_name || "";

    await env.DB.prepare(`
      INSERT INTO products (sku, product_name, parent_sku, is_parent, description, video_url, images, cost_invoice, cost_real, is_combo, combo_items, combo_qty, image_url, stock, stock_main, stock_sub, min_stock)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sku) DO UPDATE SET
        product_name = excluded.product_name,
        parent_sku = excluded.parent_sku,
        is_parent = excluded.is_parent,
        description = CASE WHEN excluded.description != '' THEN excluded.description ELSE products.description END,
        video_url = CASE WHEN excluded.video_url != '' THEN excluded.video_url ELSE products.video_url END,
        images = CASE WHEN excluded.images != '[]' THEN excluded.images ELSE products.images END,
        cost_invoice = excluded.cost_invoice,
        cost_real = excluded.cost_real,
        is_combo = excluded.is_combo,
        combo_items = excluded.combo_items,
        combo_qty = excluded.combo_qty,
        image_url = CASE WHEN excluded.image_url != '' THEN excluded.image_url ELSE products.image_url END,
        stock = excluded.stock,
        stock_main = excluded.stock_main,
        stock_sub = excluded.stock_sub,
        min_stock = excluded.min_stock
    `).bind(
      b.sku, finalName, b.parent_sku || null, b.is_parent || 0,
      b.description || "", b.video_url || "", b.images || "[]", 
      b.cost_invoice || 0, b.cost_real || 0,
      b.is_combo || 0, b.combo_items || null, b.combo_qty || 1, b.image_url || "",
      b.stock !== undefined ? b.stock : 0, 
      b.stock_main !== undefined ? b.stock_main : 0,
      b.stock_sub !== undefined ? b.stock_sub : 0,
      b.min_stock !== undefined ? b.min_stock : 5
    ).run();
    return Response.json({ status: "ok" }, { headers: cors });
  }
  if (request.method === "DELETE") {
    const path = url.pathname;
    const stmts = [];
    
    if (path.endsWith('/bulk')) {
      const { skus } = await request.json();
      if (!skus || !Array.isArray(skus) || skus.length === 0) return Response.json({ error: "No SKUs" }, { status: 400, headers: cors });
      
      const placeholders = skus.map(() => '?').join(',');
      // 1. Xóa trong danh mục sản phẩm
      stmts.push(env.DB.prepare(`DELETE FROM products WHERE sku IN (${placeholders})`).bind(...skus));
      // 2. Gỡ Map trong bảng đa sàn (Về trạng thái UNMAPPED)
      stmts.push(env.DB.prepare(`UPDATE product_variations SET internal_sku = NULL, mapped_items = '[]', map_status = 'UNMAPPED' WHERE internal_sku IN (${placeholders})`).bind(...skus));
      // 3. Xóa trong sổ tay tự động map (sku_alias)
      stmts.push(env.DB.prepare(`DELETE FROM sku_alias WHERE internal_sku IN (${placeholders})`).bind(...skus));
      
      await env.DB.batch(stmts);
      return Response.json({ status: "ok", count: skus.length }, { headers: cors });
    }

    const sku = decodeURIComponent(path.split('/').pop());
    // 1. Xóa sản phẩm gốc
    stmts.push(env.DB.prepare(`DELETE FROM products WHERE sku = ?`).bind(sku));
    // 2. Giải phóng các biến thể đang map vào SKU này
    stmts.push(env.DB.prepare(`UPDATE product_variations SET internal_sku = NULL, mapped_items = '[]', map_status = 'UNMAPPED' WHERE internal_sku = ?`).bind(sku));
    // 3. Xóa alias để không bị auto-map lại mã cũ
    stmts.push(env.DB.prepare(`DELETE FROM sku_alias WHERE internal_sku = ?`).bind(sku));
    
    await env.DB.batch(stmts);
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
export async function handleCostSettings(request, env, cors) {

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
export async function handleVariations(request, env, cors) {

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
  if (request.method === 'POST' && !request.url.includes('action=copy-to-warehouse')) {
    const body = await request.json()
    
    // BỌC THÉP: Ưu tiên bắt user_name từ Bot đẩy lên (fallback về shop để tool cũ không chết)
    const rootShop = body.user_name || body.shop || '';
    
    // Tự động chuyển đổi định dạng từ Bot (products) sang định dạng của API (variations)
    const variations = body.variations || []
    const draftStmts = []; // 🌟 MỚI: Mảng chứa lệnh lưu nháp Bài đăng
    if (body.products) {
      for (const p of body.products) {
         // 🌟 MỚI: Giấu toàn bộ "Bài Đăng" (Mô tả, Ảnh, Video) vào app_config làm bộ nhớ tạm
         const draftKey = `draft_${body.platform || 'shopee'}_${p.item_id}`;
         const draftValue = JSON.stringify({
             description: p.description || '',
             images: p.images || [],
             video_url: p.video_url || ''
         });
         draftStmts.push(env.DB.prepare(`
             INSERT INTO app_config (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value
         `).bind(draftKey, draftValue));

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
               stock: v.stock,
               target_warehouse: v.target_warehouse || body.target_warehouse || 'main' // 🌟 Bắt lấy nhãn Kho từ Python
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

// 🌟 LỆNH TỪ ADMIN: TUYỆT ĐỐI KHÔNG TỰ ĐẺ MÃ SKU ĐỂ TRÁNH RÁC DATABASE!
      // Nếu mã lạ (Không tìm thấy internalSku), hệ thống sẽ ngó lơ việc cập nhật Tồn Kho
      // và ném nó vào danh sách UNMAPPED để con người review thủ công trên Web.

      if (internalSku) {
          autoMapped++;
          
          // 🌟 ĐỒNG BỘ TỒN KHO VÀO ĐÚNG CỘT KHO ĐÍCH
          if (v.target_warehouse === 'sub') {
              stmts.push(env.DB.prepare(`
                UPDATE products 
                SET stock_sub = ?, stock = IFNULL(stock_main, 0) + ? 
                WHERE sku = ?
              `).bind(v.stock || 0, v.stock || 0, internalSku));
          } else {
              stmts.push(env.DB.prepare(`
                UPDATE products 
                SET stock_main = ?, stock = ? + IFNULL(stock_sub, 0) 
                WHERE sku = ?
              `).bind(v.stock || 0, v.stock || 0, internalSku));
          }
      }

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
    
    // 🌟 MỚI: Chạy lệnh lưu nháp Bài đăng
    if (draftStmts.length > 0) {
        for (let i = 0; i < draftStmts.length; i += 50) {
            await env.DB.batch(draftStmts.slice(i, i + 50));
        }
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
    if (!id)
      return Response.json({ error: 'Missing id' }, { status: 400, headers: cors })

    // Lấy trạng thái và SKU muốn update từ Frontend (nếu rỗng thì gán mặc định)
    const targetStatus = body.map_status || 'MAPPED';
    const targetSku = internal_sku || '';

    await env.DB.prepare(`
          UPDATE product_variations
          SET internal_sku = ?, mapped_items = ?, map_status = ?, updated_at = datetime('now')
          WHERE id = ?
        `).bind(targetSku, mapped_items || '[]', targetStatus, id).run()

        // Đảm bảo bảng sku_alias tồn tại để Database không bị sập (Lỗi 500)
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS sku_alias (
            platform_sku TEXT PRIMARY KEY,
            internal_sku TEXT
          )
        `).run()

    // Cập nhật Sổ tay Auto-map (sku_alias)
    const row = await env.DB.prepare(`SELECT platform_sku FROM product_variations WHERE id=?`).bind(id).first()
    if (row?.platform_sku) {
        if (targetStatus === 'UNMAPPED') {
            // Nếu là thao tác "Hủy Map", XÓA luôn dòng liên kết trong sổ tay để bot không tự động Map lại
            await env.DB.prepare(`DELETE FROM sku_alias WHERE platform_sku = ?`).bind(row.platform_sku).run();
        } else if (targetSku !== '') {
            // Nếu Map bình thường thì lưu/cập nhật vào sổ tay
            const existAlias = await env.DB.prepare(`SELECT platform_sku FROM sku_alias WHERE platform_sku = ?`).bind(row.platform_sku).first()
            if (existAlias) {
                await env.DB.prepare(`UPDATE sku_alias SET internal_sku = ? WHERE platform_sku = ?`).bind(targetSku, row.platform_sku).run()
            } else {
                await env.DB.prepare(`INSERT INTO sku_alias (platform_sku, internal_sku) VALUES (?, ?)`).bind(row.platform_sku, targetSku).run()
            }
        }
    }

    return Response.json({ status: 'ok' }, { headers: cors })
  }

  // ==========================================
  // 🌟 [SHIPXANH CLONE] API SAO CHÉP VỀ KHO (Tạo Bài Đăng Gốc & Phân Loại)
  // ==========================================
  if (request.method === 'POST' && request.url.includes('action=copy-to-warehouse')) {
    try {
        const { ids } = await request.json();
        if (!ids || !ids.length) return Response.json({ error: 'Không có ID nào được chọn' }, { status: 400, headers: cors });

        console.log(`[API COPY TO WAREHOUSE] Bắt đầu tạo Bài Đăng cho ${ids.length} phân loại...`);

        const placeholders = ids.map(() => '?').join(',');
        const query = `SELECT * FROM product_variations WHERE id IN (${placeholders}) AND map_status = 'UNMAPPED'`;
        const variations = await env.DB.prepare(query).bind(...ids).all();

        let copied = 0;
        const stmts = [];
        
        // 1. Gom nhóm các Phân loại lại theo Bài Đăng (platform_item_id)
        const parentGroups = {};
        for (const v of variations.results) {
            if (!parentGroups[v.platform_item_id]) {
                parentGroups[v.platform_item_id] = {
                    platform: v.platform,
                    product_name: v.product_name,
                    image_url: v.image_url,
                    variations: []
                };
            }
            parentGroups[v.platform_item_id].variations.push(v);
        }

        // 2. Móc dữ liệu DRAFT (Mô tả, Ảnh, Video) từ bộ nhớ tạm ra
        const draftKeys = Object.keys(parentGroups).map(id => `draft_${parentGroups[id].platform}_${id}`);
        let draftData = {};
        if (draftKeys.length > 0) {
            const draftPlaceholders = draftKeys.map(() => '?').join(',');
            const drafts = await env.DB.prepare(`SELECT key, value FROM app_config WHERE key IN (${draftPlaceholders})`).bind(...draftKeys).all();
            drafts.results.forEach(d => { draftData[d.key] = JSON.parse(d.value); });
        }

        // 3. Tiến hành Khai sinh Bài Đăng & Móc nối Phân Loại
        for (const item_id in parentGroups) {
            const group = parentGroups[item_id];
            const draftKey = `draft_${group.platform}_${item_id}`;
            const draft = draftData[draftKey] || { description: '', images: [], video_url: '', parent_sku: '' };
            
            // 🌟 TRƯỜNG HỢP 1: NẾU SẢN PHẨM CHỈ CÓ 1 PHÂN LOẠI (MẶC ĐỊNH)
            // -> KHÔNG LÀM CHA CON GÌ HẾT, LƯU LUÔN LÀ 1 SẢN PHẨM ĐƠN ĐỘC LẬP BẰNG ĐÚNG MÃ SKU ĐÓ
            if (group.variations.length === 1 && (!group.variations[0].variation_name || group.variations[0].variation_name === 'Mặc định')) {
                const v = group.variations[0];
                // Ưu tiên SKU của Phân loại (nếu có), không có thì lấy SKU Cha (nếu có), kẹt lắm mới lấy ID để khỏi sập data
                const realSku = (v.platform_sku && v.platform_sku.trim() !== '') ? v.platform_sku.toUpperCase() : (draft.parent_sku ? draft.parent_sku.toUpperCase() : `SP_${item_id}`);
                
                stmts.push(env.DB.prepare(`
                    INSERT INTO products (sku, product_name, is_parent, description, images, video_url, image_url, stock, cost_invoice, cost_real)
                    VALUES (?, ?, 0, ?, ?, ?, ?, ?, 0, 0)
                    ON CONFLICT(sku) DO UPDATE SET stock = excluded.stock
                `).bind(
                    realSku, group.product_name, draft.description, 
                    JSON.stringify(draft.images), draft.video_url, 
                    group.image_url || (draft.images[0] || ''), v.stock || 0
                ));

                stmts.push(env.DB.prepare(`UPDATE product_variations SET internal_sku = ?, map_status = 'MAPPED', updated_at = datetime('now') WHERE id = ?`).bind(realSku, v.id));
                
                if (v.platform_sku && v.platform_sku.trim() !== '') {
                    stmts.push(env.DB.prepare(`INSERT INTO sku_alias (platform_sku, internal_sku) VALUES (?, ?) ON CONFLICT(platform_sku) DO UPDATE SET internal_sku = excluded.internal_sku`).bind(v.platform_sku, realSku));
                }
                copied++;
            } 
            // 🌟 TRƯỜNG HỢP 2: NẾU SẢN PHẨM CÓ TỪ 2 PHÂN LOẠI TRỞ LÊN
            // -> LẤY ĐÚNG MÃ SP GỐC CỦA SHOPEE LÀM CHA, NẾU TRỐNG THÌ LẤY MÃ PHÂN LOẠI ĐẦU TIÊN CẮT ĐUÔI
            else {
                let parentSku = draft.parent_sku ? draft.parent_sku.toUpperCase() : '';
                if (!parentSku) {
                    const firstChildSku = group.variations[0].platform_sku || '';
                    parentSku = firstChildSku.includes('-') ? firstChildSku.split('-')[0] : (firstChildSku || `P_${item_id}`);
                }

                stmts.push(env.DB.prepare(`
                    INSERT INTO products (sku, product_name, is_parent, description, images, video_url, image_url, stock, cost_invoice, cost_real)
                    VALUES (?, ?, 1, ?, ?, ?, ?, 0, 0, 0)
                    ON CONFLICT(sku) DO NOTHING
                `).bind(
                    parentSku, group.product_name, draft.description, 
                    JSON.stringify(draft.images), draft.video_url, 
                    group.image_url || (draft.images[0] || '')
                ));

                for (const v of group.variations) {
                    const childSku = (v.platform_sku && v.platform_sku.trim() !== '') ? v.platform_sku.toUpperCase() : `S_${v.id}`;
                    
                    stmts.push(env.DB.prepare(`
                        INSERT INTO products (sku, product_name, parent_sku, image_url, stock, cost_invoice, cost_real)
                        VALUES (?, ?, ?, ?, ?, 0, 0)
                        ON CONFLICT(sku) DO UPDATE SET parent_sku = excluded.parent_sku, stock = excluded.stock
                    `).bind(
                        childSku, v.variation_name || group.product_name, parentSku, v.image_url || '', v.stock || 0
                    ));

                    stmts.push(env.DB.prepare(`UPDATE product_variations SET internal_sku = ?, map_status = 'MAPPED', updated_at = datetime('now') WHERE id = ?`).bind(childSku, v.id));
                    
                    if (v.platform_sku && v.platform_sku.trim() !== '') {
                        stmts.push(env.DB.prepare(`INSERT INTO sku_alias (platform_sku, internal_sku) VALUES (?, ?) ON CONFLICT(platform_sku) DO UPDATE SET internal_sku = excluded.internal_sku`).bind(v.platform_sku, childSku));
                    }
                    copied++;
                }
            }
        }

        // Chạy Batch an toàn
        if (stmts.length > 0) {
            for (let i = 0; i < stmts.length; i += 40) { await env.DB.batch(stmts.slice(i, i + 40)); }
        }
        return Response.json({ status: 'ok', copied }, { headers: cors });
    } catch (error) {
        console.error("Lỗi Copy to Warehouse:", error.message);
        return Response.json({ success: false, error: error.message }, { status: 500, headers: cors });
    }
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

