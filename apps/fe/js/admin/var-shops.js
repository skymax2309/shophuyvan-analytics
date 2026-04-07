window.loadShopWarehouses = async function() {
    try {
        console.log("🚀 [FRONTEND] Đang gọi API lấy danh sách Cửa hàng & Phân kho...");
        const res = await fetch(API + "/api/products/shops-warehouse-list").then(r => r.json());
        console.log("📦 [FRONTEND] Dữ liệu Server trả về:", res); // Gắn log để kiểm tra data
        
        const tbody = document.getElementById("shop-warehouse-list");
        if (!tbody) return;
        
        if (res.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="padding:20px; text-align:center; color:#ef4444; font-weight:bold;">Chưa có dữ liệu cửa hàng trong hệ thống.</td></tr>`;
            return;
        }

        tbody.innerHTML = res.map(shop => `
            <tr style="border-bottom:1px solid #f1f5f9; transition:0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <td style="padding:12px;"><span style="background:#e2e8f0; color:#334155; font-weight:800; font-size:11px; padding:4px 8px; border-radius:6px; text-transform:uppercase;">${escapeHtml(shop.platform)}</span></td>
                <td style="padding:12px; font-weight:700; color:#0f172a; font-size:15px;">${escapeHtml(shop.shop_name)}</td>
                <td style="padding:12px;">
                    <select onchange="updateShopWarehouse(${shop.id}, this.value)" style="padding:8px 12px; border-radius:6px; border:1px solid #cbd5e1; font-size:13px; cursor:pointer; font-weight:700; color:#1e40af; background:#eff6ff;">
                        <option value="main" ${shop.warehouse_source === 'main' || !shop.warehouse_source ? 'selected' : ''}>📦 KHO CHÍNH (Bình Tân)</option>
                        <option value="sub" ${shop.warehouse_source === 'sub' ? 'selected' : ''}>📦 KHO PHỤ</option>
                    </select>
                </td>
            </tr>
        `).join('');
    } catch (e) { showToast("❌ Lỗi tải danh sách kho!", true); }
}

window.updateShopWarehouse = async function(shopId, source) {
    try {
        const res = await fetch(API + "/api/products/update-shop-warehouse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop_id: shopId, warehouse_source: source }) });
        if (res.ok) showToast("✅ Đã chuyển đổi Nguồn Kho thành công!"); else showToast("❌ Lỗi khi cập nhật kho", true);
    } catch (e) { showToast("❌ Lỗi kết nối API", true); }
}