function escapeHtml(str) {
    if (!str) return '—';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

window.loadShopWarehouses = async function() {
    try {
        console.log("🚀 [FRONTEND] Đang gọi API lấy danh sách Cửa hàng & Phân kho...");
        const res = await fetch(API + "/api/products/shops-warehouse-list").then(r => r.json());
        console.log("📦 [FRONTEND] Dữ liệu Server trả về:", res); // Gắn log để kiểm tra data
        
        console.log("🔎 [DEBUG] Mẫu dữ liệu đầu tiên:", res[0]);
        const tbody = document.getElementById("shop-warehouse-list");
        if (!tbody) return;
        
        if (res.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="padding:20px; text-align:center; color:#ef4444; font-weight:bold;">Chưa có dữ liệu cửa hàng trong hệ thống.</td></tr>`;
            return;
        }

        tbody.innerHTML = res.map(shop => {
            let apiStatusHtml = '';
            let btnHtml = '';
            
            if (!shop.token_expire_at) {
                apiStatusHtml = `<span style="color:#94a3b8; font-weight:600; font-size:12px;">⚪ Chưa kết nối API</span>`;
                
                // Tự động nhận diện sàn để gắn đúng link cấp quyền
                const platformLower = (shop.platform || '').toLowerCase();
                if (platformLower === 'shopee') {
                    btnHtml = `<button onclick="window.location.href = API + '/api/auth/shopee/url'" style="padding:6px 12px; border-radius:6px; border:none; background:#f97316; color:white; font-size:12px; font-weight:700; cursor:pointer; box-shadow:0 2px 4px rgba(249,115,22,0.3);">🔗 Cấp quyền</button>`;
                } else if (platformLower === 'lazada') {
                    btnHtml = `<button onclick="window.location.href = API + '/api/auth/lazada/url'" style="padding:6px 12px; border-radius:6px; border:none; background:#0ea5e9; color:white; font-size:12px; font-weight:700; cursor:pointer; box-shadow:0 2px 4px rgba(14,165,233,0.3);">🔗 Cấp quyền</button>`;
                } else {
                    btnHtml = `<button disabled style="padding:6px 12px; border-radius:6px; border:1px solid #e2e8f0; background:#f8fafc; color:#cbd5e1; font-size:12px; cursor:not-allowed;">Không hỗ trợ</button>`;
                }
            } else {
                const expireDate = new Date(shop.token_expire_at + 'Z'); 
                const now = new Date();
                
                if (expireDate > now) {
                    apiStatusHtml = `<span style="background:#dcfce7; color:#16a34a; padding:4px 8px; border-radius:6px; font-weight:700; font-size:12px;">✅ Đang hoạt động</span><div style="font-size:10px; color:#64748b; margin-top:4px;">Hết hạn: ${expireDate.toLocaleString('vi-VN')}</div>`;
                    btnHtml = `<button onclick="forceRefreshShopToken(${shop.id}, '${shop.api_shop_id}', '${shop.refresh_token}')" style="padding:6px 12px; border-radius:6px; border:1px solid #bfdbfe; background:#eff6ff; color:#2563eb; font-size:12px; font-weight:700; cursor:pointer; transition:0.2s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">🔄 Làm mới</button>`;
                } else {
                    apiStatusHtml = `<span style="background:#fee2e2; color:#dc2626; padding:4px 8px; border-radius:6px; font-weight:700; font-size:12px;">❌ Hết hạn Token</span><div style="font-size:10px; color:#ef4444; margin-top:4px;">Đã chết lúc: ${expireDate.toLocaleString('vi-VN')}</div>`;
                    btnHtml = `<button onclick="forceRefreshShopToken(${shop.id}, '${shop.api_shop_id}', '${shop.refresh_token}')" style="padding:6px 12px; border-radius:6px; border:none; background:#ef4444; color:white; font-size:12px; font-weight:700; cursor:pointer; box-shadow:0 2px 4px rgba(239,68,68,0.3);">⚡ Hồi sinh ngay</button>`;
                }
            }

            return `
            <tr style="border-bottom:1px solid #f1f5f9; transition:0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <td style="padding:12px;"><span style="background:#e2e8f0; color:#334155; font-weight:800; font-size:11px; padding:4px 8px; border-radius:6px; text-transform:uppercase;">${escapeHtml(shop.platform || shop.Platform || '(không rõ sàn)')}</span></td>
                <td style="padding:12px; font-weight:700; color:#0f172a; font-size:15px;">${escapeHtml(shop.shop_name || shop.shopName || '(không rõ tên shop)')}</td>
                <td style="padding:12px;">
                    <select onchange="updateShopWarehouse(${shop.id}, this.value)" style="padding:8px 12px; border-radius:6px; border:1px solid #cbd5e1; font-size:13px; cursor:pointer; font-weight:700; color:#1e40af; background:#eff6ff;">
                        <option value="main" ${shop.warehouse_source === 'main' || !shop.warehouse_source ? 'selected' : ''}>📦 KHO CHÍNH (Bình Tân)</option>
                        <option value="sub" ${shop.warehouse_source === 'sub' ? 'selected' : ''}>📦 KHO PHỤ</option>
                    </select>
                </td>
                <td style="padding:12px;">${apiStatusHtml}</td>
                <td style="padding:12px; text-align:right;">${btnHtml}</td>
            </tr>
        `}).join('');
    } catch (e) { showToast("❌ Lỗi tải danh sách kho!", true); }
}

// 🌟 HÀM MỚI: XỬ LÝ NÚT BẤM "HỒI SINH/LÀM MỚI TOKEN"
window.forceRefreshShopToken = async function(shopId, apiShopId, refreshToken) {
    if (!apiShopId || !refreshToken || refreshToken === 'null') {
        showToast("❌ Cửa hàng này chưa từng kết nối API. Bác cần quét mã QR cấp quyền trước!", true);
        return;
    }
    
    showToast("⏳ Đang gọi Server Shopee xin Token mới...");
    try {
        const res = await fetch(API + "/api/shops/force-refresh-token", { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify({ shop_id: shopId, api_shop_id: apiShopId, refresh_token: refreshToken }) 
        });
        const data = await res.json();
        
        if (res.ok) {
            showToast("🎉 " + data.message);
            loadShopWarehouses(); 
        } else {
            showToast("❌ Lỗi Shopee: " + data.error, true);
        }
    } catch (e) { 
        showToast("❌ Đứt cáp mạng: " + e.message, true); 
    }
}

window.updateShopWarehouse = async function(shopId, source) {
    try {
        const res = await fetch(API + "/api/products/update-shop-warehouse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop_id: shopId, warehouse_source: source }) });
        if (res.ok) showToast("✅ Đã chuyển đổi Nguồn Kho thành công!"); else showToast("❌ Lỗi khi cập nhật kho", true);
    } catch (e) { showToast("❌ Lỗi kết nối API", true); }
}