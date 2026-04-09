window.allSkus = [];
window.skuTree = [];
window._currentSkuTab = "no-price";
window.currentSkuPage = 1;
window.SKU_PER_PAGE = 30;
window.totalShopCount = 0;

window.buildSkuTree = function(flatData) {
    const tree = []; const parentMap = {};
    flatData.forEach(p => { if (p.is_parent == 1) { p.children = []; parentMap[p.sku] = p; tree.push(p); } });
    flatData.forEach(p => {
        if (p.is_parent != 1) {
            if (p.parent_sku && parentMap[p.parent_sku]) parentMap[p.parent_sku].children.push(p);
            else { p.children = []; tree.push(p); }
        }
    });
    return tree;
}

window.toggleChildRow = function(safeSku) {
    const el = document.getElementById('vars-' + safeSku);
    const icon = document.getElementById('icon-' + safeSku);
    const label = document.getElementById('toggle-label-' + safeSku);
    if (el.style.display === 'none') {
        el.style.display = 'block';
        if (icon) icon.style.transform = 'rotate(180deg)';
        if (label) label.textContent = 'Ẩn phân loại';
    } else {
        el.style.display = 'none';
        if (icon) icon.style.transform = 'rotate(0deg)';
        if (label) label.textContent = 'Xem phân loại';
    }
}

window.escapeHtml = function(unsafe) {
    return (unsafe || '').toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

window.loadSkus = async function() {
  try {
    const shops = await fetch(API + "/api/shops").then(r => r.json()).catch(() => []);
    window.totalShopCount = shops.length || 0;
    const data = await fetch(API + "/api/products").then(r => r.json());
    window.allSkus = data; window.skuTree = buildSkuTree(data); 
    const datalist = document.getElementById('all-sku-datalist');
    if (datalist) datalist.innerHTML = data.filter(s => !s.is_combo).map(s => `<option value="${escapeHtml(s.sku)}">${escapeHtml(s.sku)} - ${escapeHtml(s.product_name)}</option>`).join('');
    renderSkuTables();
  } catch (e) {
    if(document.getElementById("skuNoPriceTable")) document.getElementById("skuNoPriceTable").innerHTML = `<div style="color:#ef4444; padding:20px; text-align:center;">❌ Lỗi: ${e.message}</div>`;
  }
}

window.switchSkuTab = function(tab) {
  window._currentSkuTab = tab;
  document.querySelectorAll(".sku-tab-btn").forEach(b => { b.style.borderBottomColor = "transparent"; b.style.color = "#888"; });
  const colors = { "no-price": "#f59e0b", "has-price": "#16a34a", "missing-map": "#ea580c" };
  const btn = document.getElementById("stab-" + tab);
  if(btn) { btn.style.borderBottomColor = colors[tab] || "#4f46e5"; btn.style.color = "#333"; }
  document.querySelectorAll(".sku-list-container").forEach(el => el.style.display = "none");
  const targetTab = document.getElementById("sku-tab-" + tab);
  if (targetTab) targetTab.style.display = "block";
  window.currentSkuPage = 1; renderSkuTables();
}

window.generateRowHtml = function(p) {
    const tplParent = document.getElementById('tpl-parent-card').innerHTML;
    const tplChild = document.getElementById('tpl-child-row').innerHTML;
const safeSku = p.sku.replace(/[^a-zA-Z0-9]/g, "_");
    const validImg = p.image_url && p.image_url !== "undefined" && p.image_url.trim() !== "";
    let imgUrl = validImg ? p.image_url.trim() : "https://placehold.co/80x80?text=No+Image";
    if (imgUrl.startsWith('blob:')) imgUrl = "https://placehold.co/80x80?text=Loi+Blob";

    // === GALLERY ảnh phụ ===
    let galleryHtml = '';
    try {
        const imgs = JSON.parse(p.images || '[]');
        if (Array.isArray(imgs) && imgs.length > 0) {
            galleryHtml = imgs.map(url => {
                const safeUrl = url.startsWith('blob:') ? "https://placehold.co/40x40?text=Loi" : escapeHtml(url);
                return `<img src="${safeUrl}" onclick="event.stopPropagation(); document.getElementById('img-${p.sku}').src=this.src" title="Nhấn để đặt làm ảnh đại diện">`;
            }).join('');
        }
    } catch(e) {}

    // === VIDEO nhúng ===
    let videoHtml = '';
    const vUrl = (p.video_url || '').trim();
    if (vUrl.startsWith('blob:')) {
        videoHtml = `<div style="padding:10px; background:#fee2e2; color:#dc2626; border-radius:8px; font-size:11px; text-align:center;">Lỗi Video: Link cục bộ đã hết hạn</div>`;
    } else if (vUrl) {
        let embedUrl = '';
        const ytMatch = vUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (ytMatch) {
            embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
        } else if (vUrl.includes('shopee') || vUrl.match(/\.(mp4|webm|ogg)(\?|$)/i)) {
            videoHtml = `<div class="sku-video-wrap"><video controls preload="none" style="width:100%;max-height:160px;background:#000;border-radius:8px;"><source src="${escapeHtml(vUrl)}"></video></div>`;
        } else {
            embedUrl = vUrl; // fallback iframe
        }
        if (embedUrl) {
            videoHtml = `<div class="sku-video-wrap" style="aspect-ratio:16/9;max-height:160px;"><iframe src="${escapeHtml(embedUrl)}" allowfullscreen loading="lazy" style="width:100%;height:100%;border:none;border-radius:8px;"></iframe></div>`;
        }
    }

    // === Mô tả ===
    const descText = (p.description || '').trim() || '<span style="color:#cbd5e1;font-style:italic;">Chưa có mô tả sản phẩm</span>';

    const genBadge = (skuStr) => `<div style="font-size:10px; color:#cbd5e1; margin-top:4px;">ID: ${skuStr}</div>`;

    const totalStock = (p.stock || 0) + (p.children ? p.children.reduce((sum, c) => sum + (c.stock || 0), 0) : 0);
    let html = tplParent
        .replace(/{{safe_sku}}/g, safeSku)
        .replace(/{{sku}}/g, p.sku)
        .replace(/{{name}}/g, escapeHtml(p.product_name || "Sản phẩm"))
        .replace(/{{image}}/g, imgUrl)
        .replace(/{{mapped_badge}}/g, genBadge(p.sku, p.mapped_shops))
        .replace(/{{total_stock}}/g, totalStock)
        .replace(/{{gallery_html}}/g, galleryHtml)
        .replace(/{{video_html}}/g, videoHtml)
        .replace(/{{desc_text}}/g, descText);

    if (p.children && p.children.length > 0) {
        const childrenHtml = p.children.map(c => {
            const cValidImg = c.image_url && c.image_url !== "undefined" && c.image_url.trim() !== "";
            let cImgUrl = cValidImg ? c.image_url.trim() : "https://placehold.co/40x40?text=No+Img";
            if (cImgUrl.startsWith('blob:')) cImgUrl = "https://placehold.co/40x40?text=Loi+Blob";
            const isCombo = c.is_combo == 1;
            
            let displayInv = c.cost_invoice || 0;
            let displayReal = c.cost_real || 0;
            let displayStockMain = c.stock_main || 0;
            let displayStockSub = c.stock_sub || 0;

            // Bộ não tự động tính toán từ thành phần nếu là Combo
            if (isCombo) {
                displayInv = 0; displayReal = 0;
                let minMain = Infinity, minSub = Infinity;
                try {
                    const items = JSON.parse(c.combo_items || '[]');
                    if (items.length > 0) {
                        items.forEach(item => {
                            // Dò tìm thông tin sản phẩm thành phần
                            const comp = window.allSkus.find(s => s.sku === item.sku);
                            if (comp) {
                                // Giá = Giá 1 cái * Số lượng
                                displayInv += (comp.cost_invoice || 0) * item.qty;
                                displayReal += (comp.cost_real || 0) * item.qty;
                                // Tồn Combo = Số lượng tối đa có thể ghép
                                const pMain = Math.floor((comp.stock_main || 0) / item.qty);
                                const pSub = Math.floor((comp.stock_sub || 0) / item.qty);
                                if (pMain < minMain) minMain = pMain;
                                if (pSub < minSub) minSub = pSub;
                            } else {
                                minMain = 0; minSub = 0;
                            }
                        });
                        displayStockMain = minMain === Infinity ? 0 : minMain;
                        displayStockSub = minSub === Infinity ? 0 : minSub;
                    } else {
                        displayStockMain = 0; displayStockSub = 0;
                    }
                } catch(e) {}
            }
            
            // Khóa mõm các ô nhập liệu nếu là Combo, hiện icon ổ khóa kèm giá trị đã tính toán
            const invHtml = isCombo ? `<div style="font-size:13px; font-weight:700; color:#94a3b8; padding:4px 6px; text-align:right;" title="Tự động tính từ thành phần">🔒 ${displayInv}</div>` : `<input type="number" class="inline-edit-input right" value="${displayInv}" onblur="inlineUpdateProduct('${c.sku}', 'cost_invoice', this.value)">`;
            
            const realHtml = isCombo ? `<div style="font-size:13px; font-weight:700; color:#94a3b8; padding:4px 6px; text-align:right;" title="Tự động tính từ thành phần">🔒 ${displayReal}</div>` : `<input type="number" class="inline-edit-input right v-real" value="${displayReal}" onblur="inlineUpdateProduct('${c.sku}', 'cost_real', this.value)">`;
            
            const stockMainHtml = isCombo ? `<div style="font-size:13px; font-weight:800; color:#94a3b8; padding:4px 6px; text-align:center;" title="Tự động tính từ thành phần">🔒 ${displayStockMain}</div>` : `<input type="number" class="inline-edit-input center" value="${displayStockMain}" onblur="inlineUpdateProduct('${c.sku}', 'stock_main', this.value)">`;
            
            const stockSubHtml = isCombo ? `<div style="font-size:13px; font-weight:800; color:#94a3b8; padding:4px 6px; text-align:center;" title="Tự động tính từ thành phần">🔒 ${displayStockSub}</div>` : `<input type="number" class="inline-edit-input center" value="${displayStockSub}" onblur="inlineUpdateProduct('${c.sku}', 'stock_sub', this.value)">`;

            return tplChild.replace(/{{c_sku}}/g, c.sku)
                .replace(/{{c_name}}/g, escapeHtml(c.product_name || "Phân loại"))
                .replace(/{{c_img_url}}/g, cImgUrl)
                .replace(/{{c_raw_inv}}/g, invHtml)
                .replace(/{{c_raw_real}}/g, realHtml)
                .replace(/{{c_raw_stock_main}}/g, stockMainHtml)
                .replace(/{{c_raw_stock_sub}}/g, stockSubHtml)
                .replace(/{{c_mapped_badge}}/g, genBadge(c.sku))
                .replace(/{{c_combo_bg}}/g, isCombo ? '#f3e8ff' : '#f8fafc')
                .replace(/{{c_combo_color}}/g, isCombo ? '#7c3aed' : '#64748b')
                .replace(/{{c_combo_border}}/g, isCombo ? '#d8b4fe' : '#e2e8f0')
                .replace(/{{c_combo_text}}/g, isCombo ? 'Sửa Combo' : 'Tạo Combo');
        }).join('');
        html = html.replace(/{{children_list}}/g, childrenHtml).replace(/{{show_toggle}}/g, 'block');
    } else {
        html = html.replace(/{{children_list}}/g, '<div style="padding:12px 16px; color:#94a3b8; font-size:12px; font-style:italic;">Sản phẩm không có phân loại con</div>').replace(/{{show_toggle}}/g, 'none');
    }
    return html;
}

window.renderSkuTables = function(page = null) {
  if (page !== null) window.currentSkuPage = page;
  const kw = (document.getElementById("sku-search")?.value || "").toLowerCase().trim();
  let tree = window.skuTree || [];

  let filtered = kw ? tree.filter(p => p.sku.toLowerCase().includes(kw) || (p.product_name && p.product_name.toLowerCase().includes(kw)) || (p.children && p.children.some(c => c.sku.toLowerCase().includes(kw) || (c.product_name && c.product_name.toLowerCase().includes(kw))))) : tree;

  // Hàm tính giá thực tế (bao gồm cả Combo) để bộ lọc nhận diện đúng
  const getActualCost = (item) => {
      let inv = parseFloat(item.cost_invoice) || 0;
      let real = parseFloat(item.cost_real) || 0;
      if (item.is_combo == 1) {
          inv = 0; real = 0;
          try {
              const items = JSON.parse(item.combo_items || '[]');
              items.forEach(i => {
                  const comp = window.allSkus.find(s => s.sku === i.sku);
                  if (comp) {
                      inv += (parseFloat(comp.cost_invoice) || 0) * i.qty;
                      real += (parseFloat(comp.cost_real) || 0) * i.qty;
                  }
              });
          } catch(e) {}
      }
      return { inv, real };
  };

  const noPrice = filtered.filter(p => {
      if (p.children && p.children.length > 0) return p.children.some(c => {
          const cost = getActualCost(c);
          return cost.inv === 0 && cost.real === 0;
      });
      const cost = getActualCost(p);
      return cost.inv === 0 && cost.real === 0;
  });
  
  const hasPrice = filtered.filter(p => {
      if (p.children && p.children.length > 0) return p.children.every(c => {
          const cost = getActualCost(c);
          return cost.inv > 0 || cost.real > 0;
      });
      const cost = getActualCost(p);
      return cost.inv > 0 || cost.real > 0;
  });
  const missingMap = filtered.filter(p => (!p.mapped_shops || p.mapped_shops.split(',').length < window.totalShopCount) || (p.children && p.children.some(c => !c.mapped_shops || c.mapped_shops.split(',').length < window.totalShopCount)));
  const comboList = filtered.filter(p => p.is_combo == 1 || (p.children && p.children.some(c => c.is_combo == 1)));

  if(document.getElementById("skuCount")) document.getElementById("skuCount").textContent = tree.length;
  if(document.getElementById("skuNoPriceCount")) document.getElementById("skuNoPriceCount").textContent = noPrice.length;
  if(document.getElementById("skuHasPriceCount")) document.getElementById("skuHasPriceCount").textContent = hasPrice.length;
  if(document.getElementById("skuMissingMapCount")) document.getElementById("skuMissingMapCount").textContent = missingMap.length;
  if(document.getElementById("skuComboCount")) document.getElementById("skuComboCount").textContent = comboList.length;

  let activeList = noPrice;
  if (window._currentSkuTab === 'has-price') activeList = hasPrice;
  if (window._currentSkuTab === 'missing-map') activeList = missingMap;
  if (window._currentSkuTab === 'combo') activeList = comboList;

  const totalItems = activeList.length;
  const totalPages = Math.ceil(totalItems / window.SKU_PER_PAGE) || 1;
  if (window.currentSkuPage > totalPages) window.currentSkuPage = 1;

  const startIndex = (window.currentSkuPage - 1) * window.SKU_PER_PAGE;
  const pagedData = activeList.slice(startIndex, startIndex + window.SKU_PER_PAGE);

  // ĐÃ VÁ LỖI MẤT ĐƯỜNG DẪN TAB COMBO TẠI ĐÂY
  const containerId = window._currentSkuTab === 'combo' ? 'skuComboTable' : (window._currentSkuTab === 'has-price' ? 'skuHasPriceTable' : (window._currentSkuTab === 'missing-map' ? 'skuMissingMapTable' : 'skuNoPriceTable'));
  const container = document.getElementById(containerId);
  
  if(container) container.innerHTML = pagedData.length ? pagedData.map(generateRowHtml).join("") : `<div style="text-align:center; padding:40px; color:#888; background:white; border-radius:12px; border:1px dashed #cbd5e1;">🎉 Không có sản phẩm nào ở mục này!</div>`;
  renderSkuPagination(totalItems, totalPages);
}

window.renderSkuPagination = function(totalItems, totalPages) {
    const container = document.getElementById("skuPaginationWrap");
    if (!container) return;
    if (document.getElementById("selectAllChk")) document.getElementById("selectAllChk").checked = false;
    if (totalItems === 0 || totalPages <= 1) { container.innerHTML = ""; return; }
    container.innerHTML = `
        <button onclick="renderSkuTables(${window.currentSkuPage - 1})" ${window.currentSkuPage === 1 ? 'disabled' : ''} style="padding:8px 16px; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer; font-weight:bold; background:${window.currentSkuPage === 1 ? '#f8fafc' : 'white'}; color:${window.currentSkuPage === 1 ? '#cbd5e1' : '#333'};">‹ Trang trước</button>
        <span style="padding:8px 16px; background:#eff6ff; color:#2563eb; border-radius:8px; font-weight:bold;">Trang ${window.currentSkuPage} / ${totalPages}</span>
        <button onclick="renderSkuTables(${window.currentSkuPage + 1})" ${window.currentSkuPage === totalPages ? 'disabled' : ''} style="padding:8px 16px; border:1px solid #cbd5e1; border-radius:8px; cursor:pointer; font-weight:bold; background:${window.currentSkuPage === totalPages ? '#f8fafc' : 'white'}; color:${window.currentSkuPage === totalPages ? '#cbd5e1' : '#333'};">Trang sau ›</button>
    `;
}

// ===== HÀM DÒ MÌN: TỰ ĐỘNG CẬP NHẬT TRỰC TIẾP (INLINE SAVE) =====
window.inlineUpdateProduct = async function(sku, field, value) {
    console.log(`[Dò mìn] Đang cập nhật ${field} cho SKU: ${sku} với giá trị: ${value}`);
    
    try {
        // 1. Tìm dữ liệu gốc để giữ lại các thông tin khác
        const original = window.allSkus.find(s => s.sku === sku);
        if (!original) throw new Error("Không tìm thấy dữ liệu gốc của SKU này");

        // 2. Chuẩn bị Payload (Gói dữ liệu thực, không fallback)
        const payload = { ...original };
        payload[field] = (field.includes('cost') || field.includes('stock')) ? parseFloat(value) || 0 : value;
        
        // Tính lại tổng tồn nếu sửa kho
        if (field === 'stock_main' || field === 'stock_sub') {
            payload.stock = (parseFloat(payload.stock_main) || 0) + (parseFloat(payload.stock_sub) || 0);
        }

        // 3. Gửi lên Server
        const res = await fetch(API + '/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("Server từ chối cập nhật");
        
        console.log(`[Dò mìn] ✅ Cập nhật thành công ${field} cho ${sku}`);
        if (typeof showToast === 'function') showToast(`Đã lưu ${field} cho ${sku}`);
        
        // Cập nhật lại biến local để không bị render đè dữ liệu cũ
        original[field] = payload[field];
        if (payload.stock !== undefined) original.stock = payload.stock;

    } catch (e) {
        console.error(`[Dò mìn] ❌ Lỗi khi lưu ${field}:`, e);
        if (typeof showToast === 'function') showToast(`Lỗi: ${e.message}`, true);
    }
}