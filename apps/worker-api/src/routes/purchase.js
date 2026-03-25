// worker-api/src/routes/purchase.js

// 1. Lấy danh sách sản phẩm nhập hàng & Cài đặt tỉ giá
export async function handlePurchase(request, env, cors) {
  const url = new URL(request.url);
  
  // Lấy Cài đặt (Tỉ giá, Phí ship)
  if (request.method === "GET" && url.pathname === "/api/purchase/settings") {
    const { results } = await env.DB.prepare("SELECT * FROM settings_import").all();
    return Response.json(results, { headers: cors });
  }

  // Cập nhật Cài đặt
  if (request.method === "POST" && url.pathname === "/api/purchase/settings") {
    const { key, value } = await request.json();
    await env.DB.prepare("UPDATE settings_import SET value = ?, updated_at = datetime('now','+7 hours') WHERE key = ?")
      .bind(value, key).run();
    return Response.json({ status: "ok" }, { headers: cors });
  }

  // Lấy danh sách Sản phẩm Nhập hàng
  if (request.method === "GET") {
    const search = url.searchParams.get("search") || "";
    let query = "SELECT * FROM purchase_orders";
    let params = [];
    
    if (search) {
      query += " WHERE ten_san_pham LIKE ? OR ma_hang LIKE ? OR ma_van_don LIKE ?";
      params = [`%${search}%`, `%${search}%`, `%${search}%`];
    }
    
    query += " ORDER BY created_at DESC";
    const { results } = await env.DB.prepare(query).bind(...params).all();
    return Response.json(results, { headers: cors });
  }

  // Thêm hoặc Cập nhật Sản phẩm
  if (request.method === "POST") {
    const data = await request.json();
    const { 
      id, ma_van_don, image_url, ten_san_pham, ma_hang, sl_nhap, 
      gia_nhap_te, gia_khai_thue, cong_dung, chat_lieu, so_kien,
      kich_thuoc_d, kich_thuoc_r, kich_thuoc_c, trong_luong_kg,
      cach_tinh_vc, phi_vanchuyen_thuc 
    } = data;

    if (id) {
      // UPDATE
      const sql = `UPDATE purchase_orders SET 
        ma_van_don=?, image_url=?, ten_san_pham=?, ma_hang=?, sl_nhap=?, 
        gia_nhap_te=?, gia_khai_thue=?, cong_dung=?, chat_lieu=?, so_kien=?,
        kich_thuoc_d=?, kich_thuoc_r=?, kich_thuoc_c=?, trong_luong_kg=?,
        cach_tinh_vc=?, phi_vanchuyen_thuc=? WHERE id=?`;
      await env.DB.prepare(sql).bind(
        ma_van_don, image_url, ten_san_pham, ma_hang, sl_nhap, 
        gia_nhap_te, gia_khai_thue, cong_dung, chat_lieu, so_kien,
        kich_thuoc_d, kich_thuoc_r, kich_thuoc_c, trong_luong_kg,
        cach_tinh_vc, phi_vanchuyen_thuc, id
      ).run();
      return Response.json({ status: "updated" }, { headers: cors });
    } else {
      // INSERT
      const sql = `INSERT INTO purchase_orders (
        ma_van_don, image_url, ten_san_pham, ma_hang, sl_nhap, 
        gia_nhap_te, gia_khai_thue, cong_dung, chat_lieu, so_kien,
        kich_thuoc_d, kich_thuoc_r, kich_thuoc_c, trong_luong_kg,
        cach_tinh_vc, phi_vanchuyen_thuc
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
      await env.DB.prepare(sql).bind(
        ma_van_don, image_url, ten_san_pham, ma_hang, sl_nhap, 
        gia_nhap_te, gia_khai_thue, cong_dung, chat_lieu, so_kien,
        kich_thuoc_d, kich_thuoc_r, kich_thuoc_c, trong_luong_kg,
        cach_tinh_vc, phi_vanchuyen_thuc
      ).run();
      return Response.json({ status: "created" }, { headers: cors });
    }
  }

  // Xóa sản phẩm
  if (request.method === "DELETE") {
    const { id } = await request.json();
    await env.DB.prepare("DELETE FROM purchase_orders WHERE id = ?").bind(id).run();
    return Response.json({ status: "deleted" }, { headers: cors });
  }
}