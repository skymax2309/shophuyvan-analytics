import { listLazadaAdvancedInventory } from '../../core/inventory/stock-core.js'
import { ensureProductCatalogTables, getProductCatalogOverview, getProductCatalogSettings, saveProductCatalogSettings } from '../../core/products/catalog-core.js'
import { getExistingProductRow, hasManualStockDelta, previewMarketplaceListingAction, previewMarketplaceWriteAction, productStockNumber } from './marketplace-preview.js'
import { createPublishContentVariants, createPublishDraft, listPublishDrafts, previewPublishDraft } from './publish-ai.js'

export async function handleProducts(request, env, cors) {
  const url = new URL(request.url);
  await ensureProductCatalogTables(env)

  if (request.method === "POST" && url.pathname.endsWith('/publish-content-variants')) {
    return createPublishContentVariants(request, env, cors)
  }

  if (request.method === "POST" && url.pathname.endsWith('/publish-draft-preview')) {
    return previewPublishDraft(request, env, cors)
  }

  if (request.method === "POST" && url.pathname.endsWith('/publish-draft')) {
    return createPublishDraft(request, env, cors)
  }

  if (request.method === "GET" && url.pathname.endsWith('/publish-drafts')) {
    return listPublishDrafts(env, cors)
  }

  if (request.method === "GET" && url.pathname.endsWith('/catalog-settings')) {
    const settings = await getProductCatalogSettings(env)
    return Response.json({ status: 'ok', settings }, { headers: cors })
  }

  if (request.method === "POST" && url.pathname.endsWith('/catalog-settings')) {
    const body = await request.json().catch(() => ({}))
    const settings = await saveProductCatalogSettings(env, body || {})
    return Response.json({ status: 'ok', settings }, { headers: cors })
  }

  if (request.method === "GET" && url.pathname.endsWith('/catalog-overview')) {
    const limit = Number(url.searchParams.get('limit') || 12) || 12
    const overview = await getProductCatalogOverview(env, { limit })
    return Response.json(overview, { headers: cors })
  }

  if (request.method === "GET" && url.pathname.endsWith('/inventory-stock-core')) {
    const limit = Number(url.searchParams.get('limit') || 40) || 40
    const overview = await listLazadaAdvancedInventory(env, { limit })
    return Response.json({ status: 'ok', mode: 'inventory_stock_core_lazada_advanced', ...overview }, { headers: cors })
  }

  if (request.method === "POST" && url.pathname.endsWith('/catalog-write-preview')) {
    const body = await request.json().catch(() => ({}))
    const preview = await previewMarketplaceWriteAction(env, body || {})
    return Response.json(preview, { headers: cors })
  }

  if (request.method === "POST" && url.pathname.endsWith('/catalog-listing-preview')) {
    const body = await request.json().catch(() => ({}))
    const preview = await previewMarketplaceListingAction(env, body || {})
    return Response.json(preview, { headers: cors })
  }


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
    b.sku = String(b.sku || '').trim()
    b.product_name = String(b.product_name || '').trim()
    b.parent_sku = b.parent_sku ? String(b.parent_sku).trim() : null
    if (!b.sku) return Response.json({ error: "Thiếu SKU sản phẩm, hệ thống không tự tạo SKU mặc định." }, { status: 400, headers: cors })
    if (!b.product_name) return Response.json({ error: "Thiếu tên sản phẩm hoặc tên phân loại." }, { status: 400, headers: cors })
    if (b.parent_sku && b.parent_sku.toLowerCase() === b.sku.toLowerCase()) {
      return Response.json({ error: "SKU phân loại không được trùng SKU gốc." }, { status: 400, headers: cors })
    }
    const blockedNames = new Set(["tên sản phẩm mặc định", "sku mặc định", "default", "test"])
    if (blockedNames.has(b.sku.toLowerCase())) {
      return Response.json({ error: "SKU đang là dữ liệu mặc định/rác, vui lòng nhập SKU thật." }, { status: 400, headers: cors })
    }
    if (b.parent_sku && blockedNames.has(b.parent_sku.toLowerCase())) {
      return Response.json({ error: "SKU gốc đang là dữ liệu mặc định/rác, vui lòng nhập SKU thật." }, { status: 400, headers: cors })
    }
    if (blockedNames.has(b.product_name.toLowerCase())) {
      return Response.json({ error: "Tên sản phẩm đang là dữ liệu mặc định, vui lòng nhập tên thật." }, { status: 400, headers: cors })
    }
    console.log("🗄️ [API PRODUCTS POST DÒ MÌN] Đang lưu SKU:", b.sku, "| Giá Vốn HĐ:", b.cost_invoice, "| Giá Thực:", b.cost_real);
    const catalogSettings = await getProductCatalogSettings(env)
    const manualStockLocked = Number(catalogSettings.manual_internal_stock_edit_enabled || 0) !== 1
    const existingRow = await getExistingProductRow(env, b.sku)
    const mappedRow = await env.DB.prepare(`
      SELECT COUNT(1) AS total
      FROM product_variations
      WHERE internal_sku = ?
    `).bind(b.sku).first()
    // Chỉ khóa sửa tồn cho SKU đã map sang hàng sàn; sản phẩm nội bộ mới vẫn cần lưu tồn ban đầu để vận hành.
    const hasMarketplaceMapping = Number(mappedRow?.total || 0) > 0
    if (manualStockLocked && hasMarketplaceMapping && hasManualStockDelta(existingRow, b)) {
      return Response.json({
        error: "Khóa chỉnh tồn kho nội bộ đang bật vì kho thật đang tham chiếu ShipXanh. Hãy mở quyền trong core trước khi sửa tồn.",
        settings: catalogSettings
      }, { status: 409, headers: cors })
    }

    // NEO: Payload lưu tên/giá/ảnh không được tự đưa tồn kho về 0 khi core ShipXanh đang là nguồn tồn chuẩn.
    const stockValue = (key) => b[key] !== undefined ? b[key] : productStockNumber(existingRow?.[key])
    
    // Backend chỉ lưu tên FE gửi rõ ràng, không tự thay bằng "Mặc định" để tránh sinh dữ liệu rác.
    const finalName = b.product_name;

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
        is_combo = CASE WHEN excluded.is_combo != 0 THEN excluded.is_combo ELSE products.is_combo END,
        combo_items = CASE WHEN excluded.combo_items IS NOT NULL THEN excluded.combo_items ELSE products.combo_items END,
        combo_qty = CASE WHEN excluded.combo_qty != 1 THEN excluded.combo_qty ELSE products.combo_qty END,
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
      stockValue('stock'),
      stockValue('stock_main'),
      stockValue('stock_sub'),
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
