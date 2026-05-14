// Hàm hiển thị thông báo pop-up (Toast) góc màn hình
    function showToast(msg, isErr = false) {
      const t = document.getElementById("toast");
      if (!t) return;
      t.textContent = msg;
      t.style.background = isErr ? "#dc2626" : "#16a34a"; // Đỏ nếu lỗi, Xanh nếu thành công
      t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 2500);
    }

    function openShipXanhReference() {
      const url = "https://app.shipxanh.com/dashboard/stock/products";
      const ref = window.open(url, "shipxanh_reference", "noopener,noreferrer,width=1500,height=900,left=60,top=40");
      if (!ref) window.open(url, "_blank", "noopener,noreferrer");
    }

    function applyAdminProductsHash() {
      const hash = (location.hash || "").replace("#", "").split("?")[0];
      const target = ["shops", "invoice", "loss"].includes(hash) ? hash : "variations";
      if (typeof switchTab === "function") switchTab(target);
      if (hash === "shops" && typeof setShopApiView === "function") setShopApiView("overview");
      if (hash === "publish" && typeof openMultiPublishDraft === "function") {
        setTimeout(openMultiPublishDraft, 80);
      }
    }

    // Khởi chạy tải dữ liệu khi vào trang
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(applyAdminProductsHash, 0);
      try {
        const maybePromise = typeof loadVariations === "function" ? loadVariations() : null;
        if (maybePromise?.catch) maybePromise.catch(err => console.warn("loadVariations failed", err));
      } catch (err) {
        console.warn("loadVariations failed", err);
      }
    });
    window.addEventListener("hashchange", applyAdminProductsHash);
