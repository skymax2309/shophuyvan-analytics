(function () {
  async function readApiError(res) {
    try {
      const data = await res.json();
      return data?.error || data?.message || JSON.stringify(data);
    } catch {
      return await res.text();
    }
  }

  async function findExactInternalSku(sku) {
    const res = await fetch(API + "/api/products?search=" + encodeURIComponent(sku));
    const data = await res.json().catch(() => ({}));
    const rows = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
    return rows.find(row => String(row.sku || "").trim().toLowerCase() === String(sku || "").trim().toLowerCase()) || null;
  }

  async function mapVariationToSku(variationId, sku) {
    const res = await fetch(API + "/api/sync-variations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: variationId,
        internal_sku: sku,
        mapped_items: JSON.stringify([{ sku, qty: 1 }])
      })
    });
    if (!res.ok) throw new Error("SKU đã có trong kho nhưng không map được: " + await readApiError(res));
  }

  window.copyToInternalSku = async function (id) {
    const v = (window.allVariations || []).find(item => item.id == id);
    if (!v) return;

    const defaultSku = (v.platform_sku && String(v.platform_sku).trim() !== "null" && String(v.platform_sku).trim() !== "")
      ? String(v.platform_sku).trim()
      : ("SKU_" + String(v.platform || "").toUpperCase() + "_" + v.id);
    const newSku = prompt("Xác nhận mã SKU Nội Bộ sẽ tạo mới hoặc nối vào kho:", defaultSku);
    if (!newSku || newSku.trim() === "") return;

    const finalSku = newSku.trim();
    showToast("⏳ Đang kiểm tra SKU nội bộ và Map tự động...", false);
    try {
      let fullName = v.product_name || "";
      if (v.variation_name && String(v.variation_name).trim() !== "null" && String(v.variation_name).trim() !== "") {
        fullName += " - " + v.variation_name;
      }

      const existing = await findExactInternalSku(finalSku);
      if (!existing) {
        // NEO: Copy NB tạo SKU tham chiếu trước; tồn thật vẫn lấy từ core ShipXanh nên không đưa tồn sàn vào payload.
        const resCreate = await fetch(API + "/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sku: finalSku,
            product_name: fullName.trim() || finalSku,
            cost_invoice: 0,
            cost_real: 0,
            image_url: v.image_url || ""
          })
        });
        if (!resCreate.ok) throw new Error(await readApiError(resCreate));
      }

      await mapVariationToSku(v.id, finalSku);
      showToast(existing ? `✅ SKU đã có trong kho, đã nối Map: ${finalSku}` : `✅ Đã tạo SKU và Map thành công: ${finalSku}`);
      await loadVariations();
      if (typeof window.loadSkus === "function") window.loadSkus();
    } catch (err) {
      showToast("❌ Lỗi Copy NB: " + err.message, true);
    }
  };
})();
