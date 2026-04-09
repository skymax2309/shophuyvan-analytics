export async function handleShopsWarehouse(request, env, cors) {
    const url = new URL(request.url);

    // GET — Lấy danh sách shops & cài đặt kho & TRẠNG THÁI API
    if (request.method === "GET" && url.pathname.endsWith("/shops-warehouse-list")) {
        const { results } = await env.DB.prepare(
            `SELECT id, shop_name, platform, COALESCE(warehouse_source, 'main') as warehouse_source, token_expire_at, refresh_token, api_shop_id 
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

    // 🌟 [API MỚI] BẤM NÚT LÀM MỚI TOKEN TỪ GIAO DIỆN WEB
    if (request.method === "POST" && url.pathname.endsWith("/force-refresh-token")) {
        try {
            const { shop_id, refresh_token, api_shop_id } = await request.json();
            if (!refresh_token || !api_shop_id) return Response.json({ error: "Shop chưa từng kết nối API (Thiếu Refresh Token)" }, { status: 400, headers: cors });

            // Thuật toán tạo chữ ký Shopee API (Chuẩn Auth) trực tiếp trên Cloudflare
            const partnerId = "2013730";
            const partnerKey = "shpk66746e4845745341714d6b63656a5a6c7049524b7444486c4a686c4d4a4d";
            const path = "/api/v2/auth/access_token/get";
            const timestamp = Math.floor(Date.now() / 1000);
            const baseString = partnerId + path + timestamp;
            
            const encoder = new TextEncoder();
            const key = await crypto.subtle.importKey("raw", encoder.encode(partnerKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
            const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(baseString));
            const signHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
            
            const shopeeUrl = `https://partner.shopeemobile.com${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${signHex}`;
            
            // Gọi Server Shopee xin Token mới
            const shopeeRes = await fetch(shopeeUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refresh_token, partner_id: parseInt(partnerId), shop_id: parseInt(api_shop_id) })
            });
            const shopeeData = await shopeeRes.json();

            if (shopeeData.error) return Response.json({ error: shopeeData.message || shopeeData.error }, { status: 400, headers: cors });

            // Cập nhật Database, cộng thêm 4 tiếng sự sống
            await env.DB.prepare(`
                UPDATE shops 
                SET access_token = ?, refresh_token = ?, token_expire_at = datetime('now', '+4 hours') 
                WHERE id = ?
            `).bind(shopeeData.access_token, shopeeData.refresh_token, shop_id).run();

            return Response.json({ status: "ok", message: "Đã bơm máu (Token) thành công!" }, { headers: cors });
        } catch (e) {
            return Response.json({ error: e.message }, { status: 500, headers: cors });
        }
    }
}