// ===== THÔNG BÁO (TOAST) =====
function showToast(msg, isErr = false) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.style.background = isErr ? "#dc2626" : "#16a34a";
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2500);
}

// ===== QUẢN LÝ CHẾ ĐỘ FORM (GIỮ LẠI ĐỂ TƯƠNG THÍCH) =====
window.setFormMode = function(mode, skuLabel) {
    const isParent = mode === 'parent';
    const badge = document.getElementById('s_mode_badge');
    const resetBtn = document.getElementById('btnResetForm');
    const modeSkuLabel = document.getElementById('s_mode_sku_label');
    const isParentModeInput = document.getElementById('s_is_parent_mode');

    if (skuLabel) {
        if (badge) badge.style.display = 'inline-flex';
        if (modeSkuLabel) modeSkuLabel.textContent = skuLabel;
        if (resetBtn) resetBtn.style.display = 'inline-block';
    } else {
        if (badge) badge.style.display = 'none';
        if (resetBtn) resetBtn.style.display = 'none';
    }
    if (isParentModeInput) isParentModeInput.value = isParent ? '1' : '0';
}

// ===== KHỞI ĐỘNG HỆ THỐNG =====
document.addEventListener("DOMContentLoaded", () => {
    if (typeof loadSkus === 'function') {
        loadSkus();
    }
    // Mặc định trả về chế độ tạo mới (ẩn các badge sửa)
    setFormMode('single', null);
});