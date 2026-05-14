import { syncProductKnowledgeFromVariationPayload } from '../../core/product/product-knowledge-sync-core.js'
import { cleanProductText, ensureProductVariationWriteColumns, filterProductPayloadByStock, filterVariationPayloadByStock, getApiManagedShopKeys, getInventoryMovementAdjustments, productBooleanOption, productStockNumber } from './marketplace-preview.js'

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

export async function handleVariations(request, env, cors) {

  // GET: Lấy danh sách variations (có filter map_status, shop)
  if (request.method === 'GET') {
    const url    = new URL(request.url)
    const status = url.searchParams.get('map_status')
    const shop   = url.searchParams.get('shop')
    const platform = cleanProductText(url.searchParams.get('platform')).toLowerCase()
    const includeOutOfStock = productBooleanOption(url.searchParams.get('include_out_of_stock') ?? url.searchParams.get('includeOutOfStock'), false)
    const conds  = ['1=1']
    const params = []
    // Đã thêm alias 'v.' để query SQL hiểu rõ cột của bảng nào
    if (platform) { conds.push('LOWER(v.platform) = ?'); params.push(platform) }
    if (status) { conds.push('v.map_status = ?'); params.push(status) }
    if (shop)   { conds.push('v.shop = ?');       params.push(shop)   }
    // Mặc định chỉ hiện phân loại còn tồn để đội vận hành không bị lẫn sản phẩm rác/hết bán.
    if (!includeOutOfStock) conds.push('COALESCE(v.stock, 0) > 0')
    
    // Tối ưu chót: Ưu tiên lấy ảnh từ bảng products (SKU nội bộ chính) như yêu cầu.
    // Dùng TRIM() để loại bỏ các trường hợp chuỗi rỗng có dấu cách ẩn gây lỗi COALESCE.
    const query = `
      SELECT
        v.id, v.platform, v.shop, v.platform_item_id, v.model_id, v.product_name,
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
    const includeOutOfStock = productBooleanOption(body.include_out_of_stock ?? body.includeOutOfStock, false)
    const stockFilterStats = {
      skipped_products: 0,
      skipped_zero_stock_variations: 0
    }
    let catalogSyncResult = {
      saved_product_knowledge: 0,
      saved_product_catalog_snapshots: 0,
      warnings: []
    }
    
    // Tự động chuyển đổi định dạng từ Bot (products) sang định dạng của API (variations)
    let variations = Array.isArray(body.variations) ? body.variations.slice() : []
    if (!includeOutOfStock && variations.length) {
      const directFilter = filterVariationPayloadByStock(variations)
      variations = directFilter.variations
      stockFilterStats.skipped_zero_stock_variations += directFilter.stats.skipped_zero_stock_variations
    }
    const draftStmts = []; // 🌟 MỚI: Mảng chứa lệnh lưu nháp Bài đăng
    if (body.products) {
      const productFilter = includeOutOfStock
        ? { products: Array.isArray(body.products) ? body.products : [], stats: { skipped_products: 0, skipped_zero_stock_variations: 0 } }
        : filterProductPayloadByStock(body.products)
      stockFilterStats.skipped_products += productFilter.stats.skipped_products
      stockFilterStats.skipped_zero_stock_variations += productFilter.stats.skipped_zero_stock_variations

      catalogSyncResult = await syncProductKnowledgeFromVariationPayload(env, {
        platform: body.platform || 'shopee',
        shop: rootShop,
        shop_id: body.shop_id || body.shopId || body.api_shop_id,
        source: body.source || 'local_helper',
        products: productFilter.products
      })

      for (const p of productFilter.products) {
         // 🌟 MỚI: Giấu toàn bộ "Bài Đăng" (Mô tả, Ảnh, Video) vào app_config làm bộ nhớ tạm
         const draftKey = `draft_${body.platform || 'shopee'}_${p.item_id}`;
         const draftValue = JSON.stringify({
             platform: body.platform || 'shopee',
             shop: rootShop,
             item_id: p.item_id || '',
             title: p.product_name || '',
             description: p.description || '',
             images: p.images || [],
             video_url: p.video_url || '',
             category_id: p.category_id || '',
             brand_name: p.brand_name || '',
             item_sku: p.item_sku || '',
             weight: p.weight || '',
             dimensions: p.dimensions || null,
             attributes: p.attributes || [],
             logistics: p.logistics || [],
             raw_listing: p.raw_listing || null,
             synced_at: new Date().toISOString()
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
                // TikTok cần SKU_id khi upload file giá KM, nên giữ lại model_id từ template nếu bot có gửi lên.
                model_id: v.model_id || v.sku_id || '',
                image_url: v.variation_image || '',
               main_image: p_img || '',
               price: v.price,
               discount_price: v.discount_price || 0, // BỔ SUNG LẤY GIÁ KM TỪ PYTHON
               stock: productStockNumber(v.stock),
               target_warehouse: v.target_warehouse || body.target_warehouse || 'main' // 🌟 Bắt lấy nhãn Kho từ Python
            })
         }
      }
    }

    await ensureProductVariationWriteColumns(env)

    if (!variations.length)
      return Response.json({
        status: 'ok',
        synced: 0,
        skipped_out_of_stock: stockFilterStats.skipped_products,
        skipped_zero_stock_variations: stockFilterStats.skipped_zero_stock_variations,
        saved_product_knowledge: catalogSyncResult.saved_product_knowledge,
        saved_product_catalog_snapshots: catalogSyncResult.saved_product_catalog_snapshots,
        catalog_warnings: catalogSyncResult.warnings
      }, { headers: cors })

    // Lấy sku_alias để auto-map
    const aliasRows = await env.DB.prepare(`SELECT platform_sku, internal_sku FROM sku_alias`).all()
    const aliasMap  = {}
    for (const a of aliasRows.results) aliasMap[a.platform_sku.toLowerCase()] = a.internal_sku

    // Lấy products để fuzzy-match SKU (K159 ↔ H159)
    const prodRows = await env.DB.prepare(`SELECT sku FROM products`).all()
    const allSkus  = prodRows.results.map(p => p.sku)
    const movementAdjustments = await getInventoryMovementAdjustments(env)
    const apiManagedShopKeys = await getApiManagedShopKeys(env)

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
          const finalPlatform = (v.platform || body.platform || 'shopee').toLowerCase()
          const finalShopKey = String(finalShop || '').toLowerCase()
          const shouldUpdateInventory = body.source === 'api' ||
            body.trust_inventory === true ||
            apiManagedShopKeys.has(`${finalPlatform}|${finalShopKey}`)
          const targetWarehouse = (v.target_warehouse || body.target_warehouse || 'main') === 'sub' ? 'sub' : 'main'

          if (shouldUpdateInventory && targetWarehouse === 'sub') {
              const adjustedStock = (Number(v.stock) || 0) + (movementAdjustments[`${internalSku}|sub`] || 0)
              stmts.push(env.DB.prepare(`
                UPDATE products 
                SET stock_sub = ?, stock = IFNULL(stock_main, 0) + ? 
                WHERE sku = ?
              `).bind(adjustedStock, adjustedStock, internalSku));
          } else if (shouldUpdateInventory) {
              const adjustedStock = (Number(v.stock) || 0) + (movementAdjustments[`${internalSku}|main`] || 0)
              stmts.push(env.DB.prepare(`
                UPDATE products 
                SET stock_main = ?, stock = ? + IFNULL(stock_sub, 0) 
                WHERE sku = ?
              `).bind(adjustedStock, adjustedStock, internalSku));
          }
      }

      stmts.push(env.DB.prepare(`
        INSERT INTO product_variations
          (platform, shop, platform_item_id, model_id, product_name, variation_name,
           platform_sku, internal_sku, mapped_items, image_url, price, discount_price, stock,
           stock_source_json, warehouse_stock, channel_stock, fbl_stock, stock_source_detail,
           map_status, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?, CASE WHEN ? != '' THEN ? ELSE ? END, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(platform, shop, platform_sku) DO UPDATE SET
          model_id          = CASE WHEN excluded.model_id != '' THEN excluded.model_id ELSE product_variations.model_id END,
          product_name     = CASE WHEN excluded.product_name != '' THEN excluded.product_name ELSE product_variations.product_name END,
          variation_name   = excluded.variation_name,
          image_url        = CASE WHEN ? != '' THEN ? ELSE product_variations.image_url END,
          price            = excluded.price,
          discount_price   = excluded.discount_price,
          stock            = excluded.stock,
          stock_source_json = excluded.stock_source_json,
          warehouse_stock  = excluded.warehouse_stock,
          channel_stock    = excluded.channel_stock,
          fbl_stock        = excluded.fbl_stock,
          stock_source_detail = excluded.stock_source_detail,
          internal_sku     = CASE WHEN product_variations.map_status = 'MAPPED' THEN product_variations.internal_sku ELSE excluded.internal_sku END,
          mapped_items     = CASE WHEN product_variations.map_status = 'MAPPED' THEN product_variations.mapped_items ELSE excluded.mapped_items END,
          map_status       = CASE WHEN product_variations.map_status = 'MAPPED' THEN 'MAPPED' ELSE excluded.map_status END,
          updated_at       = datetime('now')
      `).bind(
        v.platform || 'shopee', finalShop, v.platform_item_id || '', cleanProductText(v.model_id),
        v.product_name || '', v.variation_name || '',
        pSku, internalSku, internalSku ? JSON.stringify([{sku: internalSku, qty: 1}]) : '[]', 
        v.image_url, v.image_url, v.main_image,
        v.price || 0, v.discount_price || 0, v.stock || 0,
        // Lazada có nhiều lớp tồn; lưu toàn bộ nguồn để sau này phân biệt seller/channel/FBL thay vì chỉ còn một số tổng.
        JSON.stringify(v.stock_source || { seller_stock: Number(v.stock || 0), total_stock: Number(v.stock || 0), source_detail: 'seller_quantity' }),
        Number(v.stock_source?.warehouse_stock || 0) || 0,
        Number(v.stock_source?.channel_stock || 0) || 0,
        Number(v.stock_source?.fbl_stock || 0) || 0,
        v.stock_source?.source_detail || 'seller_quantity',
        mapStatus,
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

    return Response.json({
      status: 'ok',
      synced,
      auto_mapped: autoMapped,
      skipped_out_of_stock: stockFilterStats.skipped_products,
      skipped_zero_stock_variations: stockFilterStats.skipped_zero_stock_variations,
      saved_product_knowledge: catalogSyncResult.saved_product_knowledge,
      saved_product_catalog_snapshots: catalogSyncResult.saved_product_catalog_snapshots,
      catalog_warnings: catalogSyncResult.warnings
    }, { headers: cors })
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
                    stmts.push(env.DB.prepare(`DELETE FROM sku_alias WHERE platform_sku = ?`).bind(v.platform_sku));
                    stmts.push(env.DB.prepare(`INSERT INTO sku_alias (platform_sku, internal_sku) VALUES (?, ?)`).bind(v.platform_sku, realSku));
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
                        stmts.push(env.DB.prepare(`DELETE FROM sku_alias WHERE platform_sku = ?`).bind(v.platform_sku));
                        stmts.push(env.DB.prepare(`INSERT INTO sku_alias (platform_sku, internal_sku) VALUES (?, ?)`).bind(v.platform_sku, childSku));
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
