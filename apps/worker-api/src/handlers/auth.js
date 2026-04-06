// apps/worker-api/src/handlers/auth.js

// Hàm băm bảo mật chữ ký HMAC-SHA256 chuẩn Cloudflare Worker
async function signHMAC(keyStr, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(keyStr), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Cấu hình cố định
const SHOPEE = {
  PID: 2013730,
  KEY: "shpk66746e4845745341714d6b63656a5a6c7049524b7444486c4a686c4d4a4m",
  REDIRECT: "https://huyvan-worker-api.nghiemchihuy.workers.dev/channels/shopee/callback"
};

const LAZADA = {
  APP_KEY: "135731",
  SECRET: "UHMS2CUNhAspEYgNMYZ1ywytbHhCx1wK",
  REDIRECT: "https://huyvan-worker-api.nghiemchihuy.workers.dev/channels/lazada/callback"
};

export async function handleAuth(request, env, url) {
  console.log(`[AUTH-LOG] Đang xử lý route: ${url.pathname}`);

  // 1. Tạo Link Ủy Quyền Shopee
  if (url.pathname === "/api/auth/shopee/url") {
    const path = "/api/v2/shop/auth_partner";
    const ts = Math.floor(Date.now() / 1000);
    const sign = await signHMAC(SHOPEE.KEY, `${SHOPEE.PID}${path}${ts}`);
    return Response.redirect(`https://partner.shopeemobile.com${path}?partner_id=${SHOPEE.PID}&timestamp=${ts}&sign=${sign}&redirect=${encodeURIComponent(SHOPEE.REDIRECT)}`, 302);
  }

  // 2. Tạo Link Ủy Quyền Lazada
  if (url.pathname === "/api/auth/lazada/url") {
    return Response.redirect(`https://auth.lazada.com/oauth/authorize?response_type=code&force_auth=true&redirect_uri=${encodeURIComponent(LAZADA.REDIRECT)}&client_id=${LAZADA.APP_KEY}`, 302);
  }

  // 3. Callback Shopee: Đúc Token & Lưu Database
  if (url.pathname === "/channels/shopee/callback") {
    const code = url.searchParams.get("code");
    const shop_id = url.searchParams.get("shop_id");
    console.log(`[AUTH-LOG] Shopee Callback: Code=${code}, ShopID=${shop_id}`);

    const path = "/api/v2/auth/token/get";
    const ts = Math.floor(Date.now() / 1000);
    const sign = await signHMAC(SHOPEE.KEY, `${SHOPEE.PID}${path}${ts}`);

    const res = await fetch(`https://partner.shopeemobile.com${path}?partner_id=${SHOPEE.PID}&timestamp=${ts}&sign=${sign}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, shop_id: parseInt(shop_id), partner_id: SHOPEE.PID })
    });
    const data = await res.json();

    if (data.access_token) {
      console.log(`[AUTH-LOG] Đúc Token Shopee thành công cho Shop ${shop_id}`);
      const expireAt = new Date(Date.now() + (data.expire_in * 1000)).toISOString();
      
      const exist = await env.DB.prepare("SELECT id FROM shops WHERE api_shop_id = ? OR user_name = ?").bind(shop_id.toString(), shop_id.toString()).first();
      if (exist) {
        await env.DB.prepare(`UPDATE shops SET api_shop_id=?, access_token=?, refresh_token=?, token_expire_at=? WHERE id=?`)
          .bind(shop_id.toString(), data.access_token, data.refresh_token, expireAt, exist.id).run();
      } else {
        await env.DB.prepare(`INSERT INTO shops (shop_name, platform, user_name, api_shop_id, access_token, refresh_token, token_expire_at) VALUES (?, 'shopee', ?, ?, ?, ?, ?)`)
          .bind(`Shopee ${shop_id}`, shop_id.toString(), shop_id.toString(), data.access_token, data.refresh_token, expireAt).run();
      }
      return Response.redirect("https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/oms-dashboard.html?api_status=success", 302);
    }
    return Response.json({ error: "Lỗi đúc Token Shopee", detail: data });
  }

  // 4. Callback Lazada: Đúc Token & Lưu Database (Bản Bọc Thép Gắn Log)
  if (url.pathname === "/channels/lazada/callback") {
    try {
      const code = url.searchParams.get("code");
      console.log(`[AUTH-LOG] Bắt đầu xử lý Lazada Callback. Code: ${code}`);

      if (!code) {
        console.error("[AUTH-LOG] Lazada không trả về Code!");
        return new Response("Thiếu mã Code từ Lazada", { status: 400 });
      }

      const api_path = "/auth/token/create";
      const params = { app_key: LAZADA.APP_KEY, timestamp: Date.now().toString(), sign_method: "sha256", code: code };
      
      let signString = api_path;
      Object.keys(params).sort().forEach(k => signString += `${k}${params[k]}`);
      const sign = (await signHMAC(LAZADA.SECRET, signString)).toUpperCase();
      
      const formData = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => formData.append(k, v));
      formData.append("sign", sign);

      console.log("[AUTH-LOG] Đang gọi API Lazada đúc Token...");
      const res = await fetch(`https://auth.lazada.com/rest${api_path}?${formData.toString()}`, { method: "POST" });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[AUTH-LOG] Lazada Server từ chối Request (HTTP ${res.status}): ${errorText}`);
        return new Response(`Lỗi kết nối Lazada: ${errorText}`, { status: 500 });
      }

      const data = await res.json();
      console.log("[AUTH-LOG] Kết quả phản hồi từ Lazada:", JSON.stringify(data));

if (data.access_token) {
        const seller_id = data.country_user_info[0]?.seller_id || data.account;
        const account_email = data.account; // Email Lazada dùng đăng nhập
        console.log(`[AUTH-LOG] Đúc thành công! SellerID: ${seller_id}, Email: ${account_email}`);
        
        const expireAt = new Date(Date.now() + (data.expires_in * 1000)).toISOString();
        console.log("[AUTH-LOG] Đang cập nhật Database D1 (Thuật toán Upsert)...");
        
        // Dò mìn xem có Shop nào khớp ID hoặc Email (user_name) chưa
        const exist = await env.DB.prepare("SELECT id FROM shops WHERE api_shop_id = ? OR user_name = ?").bind(seller_id.toString(), account_email).first();
        
        if (exist) {
          await env.DB.prepare(`UPDATE shops SET api_shop_id=?, access_token=?, refresh_token=?, token_expire_at=? WHERE id=?`)
            .bind(seller_id.toString(), data.access_token, data.refresh_token, expireAt, exist.id).run();
          console.log("[AUTH-LOG] Đã UPDATE shop có sẵn và vá lỗ hổng api_shop_id.");
        } else {
          await env.DB.prepare(`INSERT INTO shops (shop_name, platform, user_name, api_shop_id, access_token, refresh_token, token_expire_at) VALUES (?, 'lazada', ?, ?, ?, ?, ?)`)
            .bind(`Lazada ${account_email}`, account_email, seller_id.toString(), data.access_token, data.refresh_token, expireAt).run();
          console.log("[AUTH-LOG] Đã INSERT tạo shop Lazada mới hoàn toàn.");
        }
        
        return Response.redirect("https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/oms-dashboard.html?api_status=success", 302);
      } else {
        console.error("[AUTH-LOG] Lazada trả về thành công nhưng không có access_token!", data);
        return Response.json({ error: "Lazada không cấp Token", detail: data });
      }
    } catch (err) {
      console.error("[AUTH-LOG] CRITICAL ERROR (Sập luồng Lazada):", err.stack);
      return new Response(`Lỗi Server Nội Bộ: ${err.message}`, { status: 500 });
    }
  }

  return new Response("Auth Route Not Found", { status: 404 });
}