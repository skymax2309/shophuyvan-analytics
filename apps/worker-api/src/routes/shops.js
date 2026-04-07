export async function handleShopsWarehouse(request, env, cors) {
    const url = new URL(request.url);

    // GET — Lấy danh sách shops & cài đặt kho
    if (request.method === "GET" && url.pathname.endsWith("/shops-warehouse-list")) {
        const { results } = await env.DB.prepare(
            `SELECT id, shop_name, platform, COALESCE(warehouse_source, 'main') as warehouse_source 
             FROM shops ORDER BY platform, shop_name`
        ).all();
        return Response.json(results, { headers: cors });
    }

    // POST — Cập nhật kho cho shop
    if (request.method === "POST" && url.pathname.endsWith("/update-shop-warehouse")) {
        const { shop_id, warehouse_source } = await request.json();
        await env.DB.prepare(`UPDATE shops SET warehouse_source = ? WHERE id = ?`)
            .bind(warehouse_source, shop_id).run();
        return Response.json({ status: "ok" }, { headers: cors });
    }
}