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
  REDIRECT: "https://api.shophuyvan.vn/channels/shopee/callback"
};

const LAZADA = {
  APP_KEY: "135731",
  SECRET: "UHMS2CUNhAspEYgNMYZ1ywytbHhCx1wK",
  REDIRECT: "https://api.shophuyvan.vn/channels/lazada/callback"
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
      await env.DB.prepare(`UPDATE shops SET access_token=?, refresh_token=?, token_expire_at=? WHERE api_shop_id=?`)
        .bind(data.access_token, data.refresh_token, expireAt, shop_id.toString()).run();
      return Response.redirect("https://admin.shophuyvan.vn/pages/oms-dashboard.html?api_status=success", 302);
    }
    return Response.json({ error: "Lỗi đúc Token Shopee", detail: data });
  }

  // 4. Callback Lazada: Đúc Token & Lưu Database
  if (url.pathname === "/channels/lazada/callback") {
    const code = url.searchParams.get("code");
    console.log(`[AUTH-LOG] Lazada Callback: Code=${code}`);

    const api_path = "/auth/token/create";
    const params = { app_key: LAZADA.APP_KEY, timestamp: Date.now().toString(), sign_method: "sha256", code: code };
    let signString = api_path;
    Object.keys(params).sort().forEach(k => signString += `${k}${params[k]}`);
    const sign = (await signHMAC(LAZADA.SECRET, signString)).toUpperCase();
    
    const formData = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => formData.append(k, v));
    formData.append("sign", sign);

    const res = await fetch(`https://auth.lazada.com/rest${api_path}?${formData.toString()}`, { method: "POST" });
    const data = await res.json();

    if (data.access_token) {
      const seller_id = data.country_user_info[0]?.seller_id || data.account;
      console.log(`[AUTH-LOG] Đúc Token Lazada thành công cho Seller ${seller_id}`);
      const expireAt = new Date(Date.now() + (data.expires_in * 1000)).toISOString();
      await env.DB.prepare(`UPDATE shops SET access_token=?, refresh_token=?, token_expire_at=? WHERE api_shop_id=?`)
        .bind(data.access_token, data.refresh_token, expireAt, seller_id.toString()).run();
      return Response.redirect("https://admin.shophuyvan.vn/pages/oms-dashboard.html?api_status=success", 302);
    }
    return Response.json({ error: "Lỗi đúc Token Lazada", detail: data });
  }

  return new Response("Auth Route Not Found", { status: 404 });
}