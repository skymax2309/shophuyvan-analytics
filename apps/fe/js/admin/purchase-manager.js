    const API_URL = 'https://huyvan-worker-api.nghiemchihuy.workers.dev/api/purchase';
    const SETTINGS_URL = 'https://huyvan-worker-api.nghiemchihuy.workers.dev/api/purchase/settings'; // Thêm đường dẫn settings riêng
    let settings = { ti_gia_te: 3650, phi_vanchuyen_kg: 30000, phi_vanchuyen_khoi: 3000000, ti_gia_usd: 25000 };

    // Hàm load cài đặt từ Server khi vừa mở trang
    async function loadSettings() {
        try {
            const res = await fetch(SETTINGS_URL);
            if (res.ok) {
                const data = await res.json();
                // Chuyển mảng [{key: '...', value: ...}] thành object để dễ dùng
                data.forEach(s => {
                    if (s.key === 'ti_gia_te') settings.ti_gia_te = Number(s.value);
                    if (s.key === 'phi_vanchuyen_kg') settings.phi_vanchuyen_kg = Number(s.value);
                    if (s.key === 'phi_vanchuyen_khoi') settings.phi_vanchuyen_khoi = Number(s.value);
                    if (s.key === 'ti_gia_usd') settings.ti_gia_usd = Number(s.value);
                });
            }
        } catch (e) {
            console.error("Lỗi load settings:", e);
        }
    }
    let purchaseData = [];

    // Hàm load dữ liệu từ Server
    async function loadData() {
        try {
            await loadSettings(); // Lấy tỉ giá mới nhất trước
            const search = document.getElementById('searchInput').value;
            const res = await fetch(`${API_URL}?search=${encodeURIComponent(search)}`);
            if (res.ok) {
                purchaseData = await res.json();
                // Đảo ngược mảng để sản phẩm mới nhất (vừa thêm/nhập) luôn hiện lên dòng đầu tiên
                purchaseData.sort((a, b) => b.id - a.id);
                renderTable();
            }
        } catch (e) {
            console.error("Lỗi load data:", e);
        }
    }

    // Hàm render bảng
    function renderTable() {
        const body = document.getElementById('purchaseBody');
        body.innerHTML = purchaseData.map(item => renderRow(item)).join('');
        updateSelectedCount();
    }

// 1. Tự động tính toán logic theo yêu cầu (Đã thêm nhân với số kiện)
    function calculateShipping(item) {
        // Số kiện = SL Nhập / SL SP trên 1 kiện
        const slNhap = item.sl_nhap || 0;
        const slSpTrenKien = item.sl_sp_tren_kien || 1;
        const soKien = slNhap / slSpTrenKien;

        // Thể tích & Trọng lượng TỔNG (1 kiện x số kiện)
        const soKhoi1Kien = (item.kich_thuoc_d * item.kich_thuoc_r * item.kich_thuoc_c) / 1000000;
        const tongKhoi = soKhoi1Kien * soKien;
        const tongKg = (item.trong_luong_kg || 0) * soKien;

        const tienKhoi = tongKhoi * settings.phi_vanchuyen_khoi;
        const tienKg = tongKg * settings.phi_vanchuyen_kg;

        if (tienKg > tienKhoi) {
            return { 
                cost: tienKg, label: "TÍNH KG", badge: "badge-kg",
                formula: `${tongKg.toFixed(2)}kg x ${settings.phi_vanchuyen_kg.toLocaleString()}đ`
            };
        } else {
            return { 
                cost: tienKhoi, label: "TÍNH KHỐI", badge: "badge-khoi",
                formula: `${tongKhoi.toFixed(4)}m³ x ${settings.phi_vanchuyen_khoi.toLocaleString()}đ`
            };
        }
    }

   // 2. Render dòng dữ liệu
    function renderRow(item) {
    const shipVatTu = calculateShipping(item);
    const tiGiaTe = settings.ti_gia_te || 3650;
    
    // 1. Số Kiện & SL Sản Phẩm
    const slNhap = item.sl_nhap || 0;
    const slSpTrenKien = item.sl_sp_tren_kien || 1;
    const soKienCalculated = slNhap / slSpTrenKien;
    
    // 2. Tiền hàng + Ship nội địa (Quy ra VNĐ)
    const giaNhapTe = item.gia_nhap_te || 0;
    const shipNoiDiaTe = item.ship_noi_dia_te || 0;
    const tongTienHangVnd = slNhap * giaNhapTe * tiGiaTe; // Tổng tệ * tỉ giá
    const tienShipNoiDiaVnd = shipNoiDiaTe * tiGiaTe;
    
// 3. Tính Tiền Thuế VAT (Giá khai thuế * % Thuế * SL Nhập)
    const phanTramThue = item.thue_vat_percent || 10;
    const giaKhaiThue = item.gia_khai_thue || 0;
    const tienThueVnd = giaKhaiThue * (phanTramThue / 100) * slNhap;
    
    // 4. Tổng Giá Vốn về tay 1 SP = (Hàng + Ship NĐ + Thuế + Phí VC) / SL Nhập
    const tongChiPhiVnd = tongTienHangVnd + tienShipNoiDiaVnd + tienThueVnd + shipVatTu.cost;
    const giaVon1Sp = slNhap > 0 ? tongChiPhiVnd / slNhap : 0;

    return `
        <tr data-id="${item.id}" class="text-xs border-b border-[#262626] hover:bg-[#1a1a1a]">
            <td class="py-1 px-1.5 text-center align-middle"><input type="checkbox" class="row-check" onchange="updateSelectedCount()"></td>
            <td class="py-1 px-1.5 relative group min-w-[60px] align-middle">
                <label class="cursor-pointer block relative" title="Click để tải ảnh lên">
                    <input type="file" accept="image/*" class="hidden" onchange="uploadInlineImage(event, ${item.id})">
                    <img src="${item.image_url || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22><rect width=%2240%22 height=%2240%22 fill=%22%23334155%22/><text x=%2250%25%22 y=%2255%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2394a3b8%22 font-size=%2218%22>📦</text></svg>'}" 
                         class="w-12 h-12 object-cover rounded border border-[#333] group-hover:opacity-50 transition mx-auto">
                    <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 text-[9px] font-bold text-white pointer-events-none">Sửa</div>
                </label>
            </td>
            <td class="py-1 px-1.5 text-left min-w-[200px] align-middle">
                <div class="editable font-bold text-[#00CED1] whitespace-normal max-h-12 overflow-y-auto" contenteditable="true" onblur="updateField(${item.id}, 'ten_san_pham', this.innerText)">${item.ten_san_pham}</div>
                <div class="text-[9px] text-gray-500 mt-1 editable" contenteditable="true" onblur="updateField(${item.id}, 'ma_van_don', this.innerText)">MVĐ: ${item.ma_van_don || '...'}</div>
            </td>
            <td class="py-1 px-1.5 text-center editable text-yellow-500 align-middle" contenteditable="true" onblur="updateField(${item.id}, 'ma_hang', this.innerText)">${item.ma_hang || ''}</td>
            
            <td class="py-1 px-1.5 text-center editable font-bold text-[#00FF88] align-middle" contenteditable="true" onblur="updateNumField(${item.id}, 'sl_nhap', this.innerText)">${slNhap}</td>
            <td class="py-1 px-1.5 text-center align-middle">
                <div class="editable font-bold text-yellow-300" contenteditable="true" onblur="updateNumField(${item.id}, 'so_kien', this.innerText)">${parseFloat(soKienCalculated.toFixed(2))}</div>
                <div class="text-[8px] text-gray-400 mt-0.5 whitespace-nowrap">${slNhap} / ${slSpTrenKien} = <span class="text-white">${parseFloat(soKienCalculated.toFixed(2))}</span></div>
            </td>
            <td class="py-1 px-1.5 text-center editable text-blue-400 align-middle" contenteditable="true" onblur="updateNumField(${item.id}, 'sl_sp_tren_kien', this.innerText)">${slSpTrenKien}</td>
            <td class="py-1 px-1.5 text-center align-middle">
                <div class="editable text-orange-400 font-bold" contenteditable="true" onblur="updateNumField(${item.id}, 'gia_nhap_te', this.innerText)">${giaNhapTe}</div>
                <div class="text-[8px] text-gray-400 mt-0.5 whitespace-nowrap">¥${giaNhapTe} x ${tiGiaTe} = <span class="text-white">${(giaNhapTe * tiGiaTe).toLocaleString()}đ</span></div>
            </td>
            
            <td class="py-1 px-1.5 text-center editable text-pink-400 align-middle" contenteditable="true" onblur="updateNumField(${item.id}, 'ship_noi_dia_te', this.innerText)">${shipNoiDiaTe}</td>
            
            <td class="py-1 px-1.5 text-center editable text-gray-300 align-middle" contenteditable="true" onblur="updateNumField(${item.id}, 'gia_khai_thue', this.innerText)">${giaKhaiThue}</td>
            <td class="py-1 px-1.5 text-center editable text-red-400 align-middle" contenteditable="true" onblur="updateNumField(${item.id}, 'thue_vat_percent', this.innerText)">${phanTramThue}</td>
            <td class="py-1 px-1.5 text-center align-middle">
                <div class="font-bold text-red-500">${Math.round(tienThueVnd).toLocaleString()}đ</div>
                <div class="text-[8px] text-gray-400 mt-0.5 whitespace-nowrap">${phanTramThue}% x ${giaKhaiThue} x ${slNhap}</div>
            </td>

            <td class="py-1 px-1.5 text-center whitespace-nowrap text-[10px] align-middle">
                <span class="editable px-0.5" contenteditable="true" onblur="updateNumField(${item.id}, 'kich_thuoc_d', this.innerText)">${item.kich_thuoc_d}</span>x
                <span class="editable px-0.5" contenteditable="true" onblur="updateNumField(${item.id}, 'kich_thuoc_r', this.innerText)">${item.kich_thuoc_r}</span>x
                <span class="editable px-0.5" contenteditable="true" onblur="updateNumField(${item.id}, 'kich_thuoc_c', this.innerText)">${item.kich_thuoc_c}</span>
                <div class="text-[8px] text-gray-400 mt-0.5" title="((D*R*C)/1000000) x Số Kiện">
                    (V/10⁶) x ${parseFloat(soKienCalculated.toFixed(2))}k = <span class="text-[#00CED1]">${((item.kich_thuoc_d * item.kich_thuoc_r * item.kich_thuoc_c / 1000000) * soKienCalculated).toFixed(4)}m³</span>
                </div>
            </td>
            <td class="py-1 px-1.5 text-center align-middle">
                <div class="editable font-bold text-gray-300" contenteditable="true" onblur="updateNumField(${item.id}, 'trong_luong_kg', this.innerText)">${item.trong_luong_kg}</div>
                <div class="text-[8px] text-gray-400 mt-0.5 whitespace-nowrap" title="KG/Kiện x Số Kiện">
                    ${item.trong_luong_kg} x ${parseFloat(soKienCalculated.toFixed(2))} = <span class="text-[#FFA500]">${(item.trong_luong_kg * soKienCalculated).toFixed(2)}kg</span>
                </div>
            </td>
            
            <td class="py-1 px-1.5 text-[10px] text-left max-w-[100px] truncate align-middle">
                <div class="truncate" title="${item.cong_dung || ''}">CD: <span class="editable text-white" contenteditable="true" onblur="updateField(${item.id}, 'cong_dung', this.innerText)">${item.cong_dung || '...'}</span></div>
                <div class="truncate" title="${item.chat_lieu || ''}">CL: <span class="editable text-white" contenteditable="true" onblur="updateField(${item.id}, 'chat_lieu', this.innerText)">${item.chat_lieu || '...'}</span></div>
            </td>
            
            <td class="py-1 px-1.5 text-center align-middle">
                <a href="${item.link_nhap_hang || '#'}" target="_blank" class="text-blue-400 hover:underline text-[9px] block mb-0.5">Mở Link</a>
                <button onclick="updateLink(${item.id})" class="text-[9px] bg-[#333] px-1.5 py-0.5 rounded text-gray-400">Sửa</button>
            </td>
            
            <td class="py-1 px-1.5 text-center align-middle">
                <div class="font-bold">${Math.round(shipVatTu.cost).toLocaleString()}đ</div>
                <div class="text-[8px] text-gray-400 mt-0.5 mb-0.5 whitespace-nowrap">${shipVatTu.formula}</div>
                <span class="${shipVatTu.badge} text-[8px]">${shipVatTu.label}</span>
            </td>
            
            <td class="py-1 px-1.5 text-center align-middle">
                <div class="font-bold text-[#00FF88] text-sm">${Math.round(giaVon1Sp).toLocaleString()}đ</div>
                <div class="text-[8px] text-gray-400 mt-0.5 whitespace-nowrap" title="(Tiền Hàng + Ship NĐ + Thuế + Phí VC) / SL">
                    (${Math.round(tongTienHangVnd/1000)}k+${Math.round(tienShipNoiDiaVnd/1000)}k+${Math.round(tienThueVnd/1000)}k+${Math.round(shipVatTu.cost/1000)}k)/${slNhap}
                </div>
            </td>
            
            <td class="py-1 px-1.5 text-center align-middle">
                <button onclick="deleteRow(${item.id})" class="text-red-500 opacity-50 hover:opacity-100 p-1">🗑</button>
            </td>
        </tr>
    `;

    // 3. Logic Xuất file PDF/Excel (9 cột đầy đủ)
    function exportData(type) {
        const selectedIds = Array.from(document.querySelectorAll('.row-check:checked')).map(cb => cb.closest('tr').dataset.id);
        if (selectedIds.length === 0) return alert("Vui lòng chọn ít nhất 1 sản phẩm để xuất!");

        const dataToExport = purchaseData.filter(item => selectedIds.includes(item.id.toString()));

        if (type === 'excel') {
            const ws = XLSX.utils.json_to_sheet(dataToExport.map(i => ({
                "Mã Vận Đơn": i.ma_van_don, "Tên SP": i.ten_san_pham, "SKU": i.ma_hang,
                "SL Nhập": i.sl_nhap, "Giá Khai Thuế": i.gia_khai_thue, "Công Dụng": i.cong_dung,
                "Chất Liệu": i.chat_lieu, 
                "Số Kiện": parseFloat(((i.sl_nhap || 0) / (i.sl_sp_tren_kien || 1)).toFixed(2)), 
                "Link SP": i.link_nhap_hang || ""
            })));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "ChinhNgach");
            XLSX.writeFile(wb, `HuyVan_ChinhNgach_${new Date().toISOString().slice(0,10)}.xlsx`);
        } else {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('l', 'mm', 'a4');
            doc.text("DANH SÁCH HÀNG NHẬP CHÍNH NGẠCH - HUY VÂN", 14, 15);
            doc.autoTable({
                startY: 20,
                head: [['Mã Vận Đơn', 'Tên SP', 'SKU', 'SL', 'Giá Khai', 'Công Dụng', 'Chất Liệu', 'Số Kiện']],
                body: dataToExport.map(i => [i.ma_van_don, i.ten_san_pham, i.ma_hang, i.sl_nhap, i.gia_khai_thue, i.cong_dung, i.chat_lieu, i.so_kien]),
                theme: 'grid', headStyles: { fillStyle: '#00CED1' }
            });
            doc.save("HuyVan_ChinhNgach.pdf");
        }
    }
	
	// Hàm xử lý khi click "Chọn tất cả"
    function toggleSelectAll() {
        const isChecked = event.target.checked;
        // Tích chọn hoặc bỏ chọn tất cả các dòng
        document.querySelectorAll('.row-check').forEach(cb => cb.checked = isChecked);
        // Đồng bộ trạng thái cho cả 2 nút "Chọn tất cả" trên giao diện
        document.querySelectorAll('#selectAll').forEach(cb => cb.checked = isChecked);
        updateSelectedCount();
    }

	function updateSelectedCount() {
    const selectedCount = document.querySelectorAll('.row-check:checked').length;
    document.getElementById('selectedCount').innerText = selectedCount;
    
    // Sửa lại ID cho đúng với HTML (btnDeleteAll)
    const btnDelete = document.getElementById('btnDeleteAll');
    if (selectedCount > 0) {
        btnDelete.classList.remove('hidden');
    } else {
        btnDelete.classList.add('hidden');
    }
}

// Hàm xóa hàng loạt các mục đã tích
async function deleteSelected() {
    const selectedCheckboxes = document.querySelectorAll('.row-check:checked');
    const ids = Array.from(selectedCheckboxes).map(cb => cb.closest('tr').dataset.id);

    if (!confirm(`Huy có chắc chắn muốn xóa ${ids.length} sản phẩm đã chọn không?`)) return;

    // Sửa lại ID cho đúng với HTML (btnDeleteAll)
    const btn = document.getElementById('btnDeleteAll');
    btn.innerText = "⏳ ĐANG XÓA...";
    btn.disabled = true;

    try {
        for (const id of ids) {
            await fetch(API_URL, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: parseInt(id) })
            });
        }
        alert("✅ Đã xóa thành công các mục đã chọn!");
    } catch (e) {
        alert("❌ Có lỗi khi xóa, vui lòng kiểm tra lại.");
    } finally {
        btn.innerText = "🗑️ XÓA ĐÃ CHỌN";
        btn.disabled = false;
        loadData(); // Load lại bảng
    }
}
    // Logic Import từ file Excel "NHẬP HÀNG CHÍNH NGẠCH" của Huy
    async function importExcel(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];

        // ── FIX: Đọc theo index cột (header:1) thay vì dùng tên cột
        // Excel có hàng số ở trên → dùng raw array, bỏ 2 hàng đầu (hàng số + hàng header)
        const raw = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

        // Tìm hàng nào là header thực (chứa "Tên Sản Phẩm")
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(raw.length, 5); i++) {
            const rowStr = raw[i].join("|").toLowerCase().replace(/\s/g, "");
            if (rowStr.includes("tensanpham") || rowStr.includes("tênSảnPhẩm".toLowerCase())) {
                headerRowIdx = i;
                break;
            }
        }
        if (headerRowIdx === -1) { alert("❌ Không tìm thấy hàng tiêu đề trong Excel!"); return; }

        // Map tên cột (chuẩn hoá: bỏ space, newline, lowercase) → index
        const headers = raw[headerRowIdx];
        const colIdx = {};
        headers.forEach((h, i) => {
            const key = h.toString().replace(/[\s\n\r]/g, "").toLowerCase();
            colIdx[key] = i;
        });

        // Hàm lấy giá trị theo từ khoá (tìm key chứa kw)
        const getCol = (row, kw) => {
            for (const key in colIdx) {
                if (key.includes(kw)) {
                    const val = row[colIdx[key]];
                    return (val === undefined || val === null) ? "" : val;
                }
            }
            return "";
        };

        // Hàm parse kích thước "DÀI*RỘNG*CAO\n(12*8*5,4) CM" → { d, r, c }
        const parseDimension = (str) => {
            const nums = str.toString().replace(/,/g, ".").match(/[\d.]+/g);
            if (nums && nums.length >= 3) return { d: parseFloat(nums[0]), r: parseFloat(nums[1]), c: parseFloat(nums[2]) };
            if (nums && nums.length === 2) return { d: parseFloat(nums[0]), r: parseFloat(nums[1]), c: 0 };
            return { d: 0, r: 0, c: 0 };
        };

        // Dữ liệu bắt đầu từ hàng sau header
        const dataRows = raw.slice(headerRowIdx + 1);
        let imported = 0, skipped = 0;

        for (const row of dataRows) {
            const tenSP = getCol(row, "tensanpham").toString().trim();
            // Bỏ qua dòng trống, dòng lỗi Excel (#DIV/0!...), dòng phụ không có tên
            if (!tenSP || tenSP.startsWith("#") || tenSP.length < 2) { skipped++; continue; }

            const kichThuocRaw = getCol(row, "kichth").toString();
            const dim = parseDimension(kichThuocRaw);

            // Phân biệt TÍNH KG hay TÍNH KHỐI
            const cachTinh = getCol(row, "tiền\nkg").toString().toUpperCase().includes("KG") 
                ? "TÍNH KG" : "TÍNH KHỐI";

            const newProduct = {
                ten_san_pham:       tenSP,
                ma_van_don:         getCol(row, "mavandon").toString().trim(),
                ma_hang:            getCol(row, "mahang").toString().trim(),
                sl_nhap:            parseFloat(getCol(row, "slnhap"))    || 0,
                gia_nhap_te:        parseFloat(getCol(row, "gianhap"))   || 0,
                gia_khai_thue:      parseFloat(getCol(row, "giakhai"))   || 0,
                ship_noi_dia_te:    parseFloat(getCol(row, "shipnoi"))   || 0,
                so_kien:            parseInt(getCol(row, "sokien"))      || 1,
                sl_sp_tren_kien:    parseInt(getCol(row, "sl/kiện"))     || 1,
                trong_luong_kg:     parseFloat(getCol(row, "tongkg"))    || 0,
                thue_vat_percent:   parseFloat(getCol(row, "thuevat"))   || 10,
                phi_vanchuyen_thuc: parseFloat(getCol(row, "tổngtiềnvận")) || 0,
                cong_dung:          getCol(row, "mucdich").toString().trim(),
                chat_lieu:          getCol(row, "chatlieu").toString().trim(),
                link_nhap_hang:     getCol(row, "linksp").toString().trim(),
                kich_thuoc_d:       dim.d,
                kich_thuoc_r:       dim.r,
                kich_thuoc_c:       dim.c,
                cach_tinh_vc:       cachTinh,
                image_url:          "",  // Không lấy từ Excel, để trống
            };

            await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newProduct)
            });
            imported++;
        }
        alert(`✅ Đã import ${imported} sản phẩm! (Bỏ qua ${skipped} dòng trống/lỗi)`);
        loadData();
    };
    reader.readAsArrayBuffer(file);
    input.value = "";
}

    async function addNewRow() {
        // 1. Khai báo đầy đủ toàn bộ 20 trường dữ liệu để Database không bị lỗi thiếu trường (undefined)
        const newProduct = {
            ten_san_pham: "Sản phẩm mới",
            ma_van_don: "",
            ma_hang: "",
            sl_nhap: 1,
            gia_nhap_te: 0,
            gia_khai_thue: 0,
            ship_noi_dia_te: 0,
            so_kien: 1,
            sl_sp_tren_kien: 1,
            thue_vat_percent: 10,
            trong_luong_kg: 0,
            kich_thuoc_d: 0,
            kich_thuoc_r: 0,
            kich_thuoc_c: 0,
            cong_dung: "",
            chat_lieu: "",
            link_nhap_hang: "",
            image_url: "",
            cach_tinh_vc: "TÍNH KG",
            phi_vanchuyen_thuc: 0
        };

        try {
            // 2. Delay 300ms để đảm bảo thao tác gõ chữ ở dòng cũ kịp lưu xong vào Database trước khi thêm mới
            await new Promise(resolve => setTimeout(resolve, 300));

            const res = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newProduct)
            });
            
            if (res.ok) {
                // 3. Xóa ô tìm kiếm để đảm bảo "Sản phẩm mới" hiện ra mà không bị bộ lọc giấu đi
                document.getElementById('searchInput').value = ""; 
                // 4. Delay thêm 300ms đợi Server xử lý dứt điểm rồi mới tải lại giao diện
                setTimeout(() => loadData(), 300);
            }
        } catch (e) {
            alert("Lỗi khi thêm sản phẩm mới");
        }
    }

    // 3. Cập nhật từng ô khi Huy sửa trực tiếp (Inline Edit)
    async function updateField(id, field, value) {
        const item = purchaseData.find(i => i.id === id);
        if (!item) return;

        item[field] = value;
        
        // Tự động cập nhật lại số kiện nếu thay đổi SL nhập hoặc SL/kiện
        if (field === 'sl_nhap' || field === 'sl_sp_tren_kien') {
            item.so_kien = (item.sl_nhap || 0) / (item.sl_sp_tren_kien || 1);
        }
        
        // Tính toán lại logic vận chuyển trước khi lưu
        const calculated = calculateShipping(item);
        item.phi_vanchuyen_thuc = calculated.cost;
        item.cach_tinh_vc = calculated.label;

        try {
            await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(item)
            });
            // Cập nhật giao diện mà không cần load lại cả trang
            renderTable();
        } catch (e) {
            console.error("Lỗi cập nhật:", e);
        }
    }

    // Hàm hỗ trợ cập nhật số
    function updateNumField(id, field, value) {
        const num = parseFloat(value.replace(/,/g, '')) || 0;
        updateField(id, field, num);
    }

    // Hàm cập nhật Link Nhập Hàng
    function updateLink(id) {
        const currentLink = purchaseData.find(i => i.id === id)?.link_nhap_hang || "";
        const newLink = prompt("Nhập link sản phẩm mới:", currentLink);
        if (newLink !== null) {
            updateField(id, 'link_nhap_hang', newLink);
        }
    }

    // 4. Xóa dòng
    async function deleteRow(id) {
        if (!confirm("Huy có chắc chắn muốn xóa sản phẩm này không?")) return;
        try {
            await fetch(API_URL, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id })
            });
            loadData();
        } catch (e) {
            alert("Lỗi khi xóa");
        }
    }

    // 5. Quản lý Cài đặt Tỉ giá & Phí Ship
    function openSettings() {
        document.getElementById('set_tigia').value = settings.ti_gia_te;
        document.getElementById('set_phikg').value = settings.phi_vanchuyen_kg;
        document.getElementById('set_phikhoi').value = settings.phi_vanchuyen_khoi;
        document.getElementById('settingsModal').classList.remove('hidden');
    }

    function closeSettings() {
        document.getElementById('settingsModal').classList.add('hidden');
    }

    async function saveSettings() {
        const newSettings = [
            { key: 'ti_gia_te', value: document.getElementById('set_tigia').value },
            { key: 'phi_vanchuyen_kg', value: document.getElementById('set_phikg').value },
            { key: 'phi_vanchuyen_khoi', value: document.getElementById('set_phikhoi').value }
        ];

        for (const s of newSettings) {
            await fetch(SETTINGS_URL, { // Dùng SETTINGS_URL đã định nghĩa
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(s)
            });
        }
        
        closeSettings();
        loadData(); // Tính toán lại toàn bộ bảng theo tỉ giá mới
    }

    // Lắng nghe sự kiện tìm kiếm
    document.getElementById('searchInput').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') loadData();
    });

    // Xử lý upload ảnh trực tiếp trên dòng
    function uploadInlineImage(event, id) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            updateField(id, 'image_url', e.target.result);
        };
        reader.readAsDataURL(file);
    }

    // Khởi chạy khi trang load xong
    window.onload = loadData;