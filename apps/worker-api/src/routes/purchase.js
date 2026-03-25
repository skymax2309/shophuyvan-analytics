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
    
    // Gán giá trị mặc định nếu dữ liệu gửi lên bị thiếu (undefined)
    const id = data.id || null;
    const ma_van_don = data.ma_van_don || "";
    const image_url = data.image_url || "";
    const ten_san_pham = data.ten_san_pham || "Sản phẩm mới";
    const ma_hang = data.ma_hang || "";
    const sl_nhap = parseFloat(data.sl_nhap) || 0;
    const gia_nhap_te = parseFloat(data.gia_nhap_te) || 0;
    const gia_khai_thue = parseFloat(data.gia_khai_thue) || 0;
    const cong_dung = data.cong_dung || "";
    const chat_lieu = data.chat_lieu || "";
    const so_kien = parseInt(data.so_kien) || 1;
    const sl_sp_tren_kien = parseInt(data.sl_sp_tren_kien) || 1;
    const ship_noi_dia_te = parseFloat(data.ship_noi_dia_te) || 0;
    const thue_vat_percent = parseFloat(data.thue_vat_percent) || 10;
    const kich_thuoc_d = parseFloat(data.kich_thuoc_d) || 0;
    const kich_thuoc_r = parseFloat(data.kich_thuoc_r) || 0;
    const kich_thuoc_c = parseFloat(data.kich_thuoc_c) || 0;
    const trong_luong_kg = parseFloat(data.trong_luong_kg) || 0;
    const cach_tinh_vc = data.cach_tinh_vc || "TÍNH KG";
    const phi_vanchuyen_thuc = parseFloat(data.phi_vanchuyen_thuc) || 0;
    const link_nhap_hang = data.link_nhap_hang || "";

    if (id) {
      // UPDATE - Đã bổ sung các cột mới Huy yêu cầu
      const sql = `UPDATE purchase_orders SET 
        ma_van_don=?, image_url=?, ten_san_pham=?, ma_hang=?, sl_nhap=?, 
        gia_nhap_te=?, gia_khai_thue=?, cong_dung=?, chat_lieu=?, so_kien=?,
        sl_sp_tren_kien=?, ship_noi_dia_te=?, thue_vat_percent=?,
        kich_thuoc_d=?, kich_thuoc_r=?, kich_thuoc_c=?, trong_luong_kg=?,
        cach_tinh_vc=?, phi_vanchuyen_thuc=?, link_nhap_hang=? WHERE id=?`;
      await env.DB.prepare(sql).bind(
        ma_van_don, image_url, ten_san_pham, ma_hang, sl_nhap, 
        gia_nhap_te, gia_khai_thue, cong_dung, chat_lieu, so_kien,
        sl_sp_tren_kien, ship_noi_dia_te, thue_vat_percent,
        kich_thuoc_d, kich_thuoc_r, kich_thuoc_c, trong_luong_kg,
        cach_tinh_vc, phi_vanchuyen_thuc, link_nhap_hang, id
      ).run();
      return Response.json({ status: "updated" }, { headers: cors });
    } else {
      // INSERT - Đã bổ sung các cột mới Huy yêu cầu
      const sql = `INSERT INTO purchase_orders (
        ma_van_don, image_url, ten_san_pham, ma_hang, sl_nhap, 
        gia_nhap_te, gia_khai_thue, cong_dung, chat_lieu, so_kien,
        sl_sp_tren_kien, ship_noi_dia_te, thue_vat_percent,
        kich_thuoc_d, kich_thuoc_r, kich_thuoc_c, trong_luong_kg,
        cach_tinh_vc, phi_vanchuyen_thuc, link_nhap_hang
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
      await env.DB.prepare(sql).bind(
        ma_van_don, image_url, ten_san_pham, ma_hang, sl_nhap, 
        gia_nhap_te, gia_khai_thue, cong_dung, chat_lieu, so_kien,
        sl_sp_tren_kien, ship_noi_dia_te, thue_vat_percent,
        kich_thuoc_d, kich_thuoc_r, kich_thuoc_c, trong_luong_kg,
        cach_tinh_vc, phi_vanchuyen_thuc, link_nhap_hang
      ).run();
      return Response.json({ status: "created" }, { headers: cors });
    }
  }
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