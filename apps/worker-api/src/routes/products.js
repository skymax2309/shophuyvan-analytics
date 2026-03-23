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


export { handleProducts, handleCostSettings }