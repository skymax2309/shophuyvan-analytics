import asyncio
import json
import os
import math
import re
import hashlib
from datetime import datetime

class ShopeeOrderScraper:
    def __init__(self, log_callback, parser):
        self.log = log_callback
        self.parser = parser

    async def scrape_new_orders(self, page, limits=None, shop_name="default", mode="all"):
        if not limits:
            limits = {"new": 100, "shipping": 50, "done": 20}
            
        if mode == "new_only":
            self.log(f"[*] ⚡ Bắt đầu Kéo Đơn Tốc Độ Cao. Chỉ quét Tab: Chờ lấy hàng ({limits['new']} đơn)")
        else:
            self.log(f"[*] Bắt đầu Tuần tra Đa Tab Shopee. Giới hạn: Mới({limits['new']}), Đang giao({limits['shipping']}), Xong({limits['done']})")
        # Khởi tạo Sổ đen chuẩn hóa MD5
        cache_file = f"cache_orders_shopee_{shop_name}.json"
        cached_final_orders = {}
        try:
            if os.path.exists(cache_file):
                with open(cache_file, "r") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        # Chỉ giữ lại các key-value hợp lệ
                        cached_final_orders = {str(k): str(v) for k, v in data.items() if isinstance(v, str)}
        except Exception as e:
            self.log(f"⚠️ Không thể đọc Sổ đen cũ, sẽ khởi tạo mới: {e}")

        all_orders_data = []
        
        # Danh sách URL quét cạn các Tab (Tách riêng Chưa xử lý và Đã xử lý vì Shopee giấu tab)
        tabs_to_scan = [
            {"name": "Chờ lấy hàng (Chưa xử lý)", "url": "https://banhang.shopee.vn/portal/sale/order?type=toship&source=to_process", "limit_type": "new"}
        ]
        
        # Nếu chạy chế độ Tuần tra (all) thì mới quét thêm các Tab phụ
        if mode == "all":
            tabs_to_scan.extend([
                {"name": "Chờ lấy hàng (Đã xử lý)", "url": "https://banhang.shopee.vn/portal/sale/order?type=toship&source=processed", "limit_type": "new"},
                {"name": "Đang giao", "url": "https://banhang.shopee.vn/portal/sale/order?type=shipping", "limit_type": "shipping"},
                {"name": "Đã giao", "url": "https://banhang.shopee.vn/portal/sale/order?type=completed", "limit_type": "done"},
                {"name": "Hủy & Trả hàng", "url": "https://banhang.shopee.vn/portal/sale/returnrefundcancel", "limit_type": "done"}
            ])

        newly_completed = {}

        try:
            for tab in tabs_to_scan:
                limit_count = limits.get(tab['limit_type'], 50)
                
                # 🌟 TOÁN HỌC PHÂN TRANG (CHUẨN SHOPEE 40 ĐƠN/TRANG)
                max_pages = math.ceil(limit_count / 40)
                if max_pages <= 0: continue

                self.log(f"-------------------------------------------------")
                self.log(f"📡 Đang mở Tab: {tab['name']} (Mục tiêu {limit_count} đơn -> Quét tối đa {max_pages} trang)")
                
                await page.goto(tab['url'], timeout=60000, wait_until="domcontentloaded")
                
                # TĂNG DELAY THEO YÊU CẦU ĐỂ QUAN SÁT (12 Giây)
                self.log("   ⏳ Đang chờ Shopee load và nới lỏng Delay để quan sát...")
                await asyncio.sleep(12) 

                # Tắt Popup quảng cáo nếu có
                try:
                    popups = await page.locator("button.eds-button--primary:has-text('Đã hiểu'), button.eds-button--primary:has-text('Later')").all()
                    for popup in popups:
                        if await popup.is_visible():
                            await popup.click()
                            await asyncio.sleep(1)
                except: pass

                # --- MỞ KHÓA BỘ LỌC TÀNG HÌNH (Thuật toán Tọa độ Bất tử) ---
                if "Chờ lấy hàng" in tab['name'] or tab['name'] == "Hủy & Trả hàng":
                    try:
                        self.log("   ⚙️ Đang bung toàn bộ các nút 'Tất cả' đang bị ẩn...")
                        clicked_any_total = False
                        
                        # Vòng lặp bấm tuần tự từng nút (Đảm bảo Shopee load kịp từng filter)
                        for _ in range(6): 
                            clicked_this_round = await page.evaluate('''() => {
                                let btns = Array.from(document.querySelectorAll('*')).filter(el => {
                                    if (el.children.length > 0) return false; // Chỉ lấy text lá
                                    let txt = el.textContent.trim();
                                    return txt === "Tất cả" || /^Tất cả\\s*\\(\\d+\\)$/.test(txt);
                                });
                                
                                for (let btn of btns) {
                                    let rect = btn.getBoundingClientRect();
                                    // TUYỆT ĐỐI NÉ thanh Menu dọc bên trái (Tọa độ X < 240px)
                                    if (rect.left < 240 || rect.top < 40) continue; 
                                    
                                    let wrap = btn.parentElement;
                                    let classStr = (btn.className + " " + (wrap ? wrap.className : "")).toLowerCase();
                                    let isUnselected = !classStr.includes('active') && !classStr.includes('checked') && !classStr.includes('primary') && !classStr.includes('selected');
                                    
                                    if (isUnselected) {
                                        btn.click();
                                        return true; // Click 1 nút rồi thoát JS để chờ Web load dữ liệu
                                    }
                                }
                                return false; // Không còn nút nào cần bấm
                            }''')
                            
                            if clicked_this_round:
                                clicked_any_total = True
                                await asyncio.sleep(1.5) # Chờ Shopee giật load filter
                            else:
                                break # Bấm xong hết tất cả rồi thì thoát vòng lặp
                                
                        if clicked_any_total:
                            self.log("   ⏳ Đã bật Full bộ lọc 'Tất cả', chờ dữ liệu ổn định (4 giây)...")
                            await asyncio.sleep(4)
                    except Exception as e:
                        self.log(f"   ⚠️ Lỗi khi định vị bộ lọc: {e}")
                # ---------------------------------------------------

                tab_orders = []
                page_num = 1
                
                while page_num <= max_pages:
                    self.log(f"   📄 Đang bóc tách dữ liệu Trang {page_num}/{max_pages}...")
                    
                    # Cuộn trang để tải đủ ảnh và thẻ ẩn
                    for _ in range(3):
                        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                        await asyncio.sleep(1.5)

                    # 🌟 BÓC TÁCH BẰNG CƯA MÁY CHẶT TEXT
                    page_text = await page.evaluate("() => document.body.innerText")
                    if "Mã đơn hàng" not in page_text:
                        self.log("   ⚠️ Không tìm thấy đơn hàng nào trên trang này.")
                        break

                    # Cứ thấy chữ "Mã đơn hàng" là chặt thành 1 khúc
                    blocks = page_text.split("Mã đơn hàng")
                    
                    for i in range(1, len(blocks)):
                        block = blocks[i]
                        lines = [line.strip() for line in block.split('\n') if line.strip()]
                        if not lines: continue

                        # 1. Lấy Mã Đơn Hàng (14-15 chữ/số viết hoa)
                        id_match = re.search(r'([A-Z0-9]{14,15})', lines[0])
                        if not id_match: continue
                        order_id = id_match.group(1)

                        # 2. Lấy Tên Khách Hàng (Nằm ở đuôi của khúc Text ngay phía trước)
                        buyer_name = "Khách hàng"
                        prev_block = blocks[i-1]
                        prev_lines = [l.strip() for l in prev_block.split('\n') if l.strip()]
                        if prev_lines:
                            for pl in reversed(prev_lines):
                                clean_pl = pl.replace('|', '').strip()
                                if clean_pl and len(clean_pl) > 2 and "Trang chủ" not in clean_pl and "Đơn hàng" not in clean_pl:
                                    buyer_name = clean_pl
                                    break

                        # 3. Lấy Tổng Tiền
                        total_price = "0"
                        for line in lines:
                            if "₫" in line:
                                p_match = re.search(r'₫([\d\.]+)', line)
                                if p_match:
                                    total_price = p_match.group(1).replace(".", "")
                                    break

                        # 4. Lấy Đơn vị vận chuyển & Mã Vận Đơn
                        carrier = ""
                        tracking_number = ""
                        for line in lines:
                            if "Express" in line or "Giao Hàng" in line or "Ninja" in line or "Viettel" in line or "VNPost" in line or "Ahamove" in line or "BeDelivery" in line:
                                carrier = line.replace("Vận chuyển chiều giao hàng", "").replace("Vận chuyển qua nền tảng", "").replace("|", "").strip()
                                break
                                
                        for line in lines:
                            t_match = re.search(r'(SPX[A-Z0-9]+|[A-Z0-9]{10,20})', line)
                            if t_match and "Variation" not in line and "SKU" not in line and t_match.group(1) != order_id:
                                tracking_number = t_match.group(1)
                                break

                        # 🌟 5. BẮT ĐÚNG THỜI GIAN VÀ BẢO VỆ DỮ LIỆU
                        order_date = ""
                        # GIẢI MÃ NGÀY CHUẨN TỪ MÃ ĐƠN (Chân lý tuyệt đối)
                        true_date_str = ""
                        if order_id and len(order_id) >= 14:
                            try:
                                yy, mm, dd = order_id[0:2], order_id[2:4], order_id[4:6]
                                true_date_str = f"20{yy}-{mm}-{dd}"
                            except: pass

                        for line in lines:
                            d_match = re.search(r'(\d{4}[-/]\d{2}[-/]\d{2}(?:\s\d{2}:\d{2})?)|(\d{2}[-/]\d{2}[-/]\d{4}(?:\s\d{2}:\d{2})?)', line)
                            if d_match:
                                raw_d = d_match.group(0)
                                try:
                                    if re.match(r'^\d{4}', raw_d):
                                        dt = datetime.strptime(raw_d.replace('/', '-'), "%Y-%m-%d %H:%M" if len(raw_d) > 10 else "%Y-%m-%d")
                                    else:
                                        dt = datetime.strptime(raw_d.replace('-', '/'), "%d/%m/%Y %H:%M" if len(raw_d) > 10 else "%d/%m/%Y")
                                    
                                    parsed_date = dt.strftime("%Y-%m-%d")
                                    # CHỈ LẤY THỜI GIAN TRÊN GIAO DIỆN NẾU NÓ KHỚP VỚI NGÀY TRONG MÃ ĐƠN
                                    # (Tránh bắt nhầm "Hạn giao hàng" hoặc "Hạn trả hàng" của Shopee)
                                    if true_date_str and parsed_date == true_date_str:
                                        order_date = dt.strftime("%Y-%m-%d %H:%M:%S")
                                        break
                                except: pass
                        
                        # --- BACKUP: NẾU TRÊN WEB BỊ ẨN, HOẶC LÀ NGÀY ẢO, ÉP LẤY NGÀY TỪ MÃ ĐƠN ---
                        if not order_date and true_date_str:
                            order_date = f"{true_date_str} 00:00:00"
                        # 6. Lấy Tên Sản Phẩm, Phân loại, SKU & Số lượng (XUẤT KÉP DỮ LIỆU)
                        sku = ""
                        original_variation = ""
                        clean_variation = ""
                        product_name = ""
                        qty = 1
                        
                        # 6.1 Tìm mỏ neo Giá tiền (Dòng đầu tiên có chữ ₫)
                        price_idx = len(lines)
                        for idx in range(1, len(lines)):
                            if "₫" in lines[idx]:
                                price_idx = idx
                                break
                                
                        # 6.2 Gom tất cả text từ dưới Mã Đơn Hàng (index 1) đến trước Giá tiền
                        item_lines = lines[1:price_idx]
                        
                        # 6.3 Lọc và nhặt đồ trong rổ text (BỌC THÉP MÓC SKU TRONG NGOẶC)
                        for txt in item_lines:
                            txt_clean = txt.strip()
                            txt_lower = txt_clean.lower()
                            
                            # 1. Lọc thẻ rác chuẩn xác
                            if txt_lower in ["yêu thích", "yêu thích+", "mall", "xử lý bởi shopee"]: 
                                continue
                            if "mua nhiều giảm giá" in txt_lower or ("giảm" in txt_lower and "&" in txt_lower): 
                                continue
                            if "trả hàng/hoàn" in txt_lower or "thanh toán khi nhận hàng" in txt_lower: 
                                continue
                                
                            # 2. Bắt Số lượng
                            if re.match(r'^[xX×]\s*\d+$', txt_clean):
                                qty = int(re.sub(r'[^\d]', '', txt_clean))
                                continue
                                
                            # 3. Bắt Phân loại (LƯU BẢN GỐC VÀ BẢN SẠCH CẮT NGOẶC)
                            if re.search(r'^(Variation:|Phân loại hàng:|Phân loại:?)\s*', txt_clean, re.IGNORECASE):
                                original_variation = re.sub(r'^(Variation:|Phân loại hàng:|Phân loại:?)\s*', '', txt_clean, flags=re.IGNORECASE).strip()
                                sku_match = re.search(r'\[(.*?)\]', original_variation)
                                if sku_match and not sku:
                                    sku = sku_match.group(1).strip()
                                    clean_variation = re.sub(r'\[.*?\]', '', original_variation).strip()
                                else:
                                    clean_variation = original_variation
                                continue
                                
                            # 4. Bắt SKU tường minh
                            if "sku" in txt_lower:
                                sku = txt_clean.split(":")[-1].strip()
                                continue
                            elif txt_clean.startswith("[") and txt_clean.endswith("]") and not sku:
                                sku = txt_clean.strip("[]")
                                continue
                                
                            # 5. Bắt Tên sản phẩm & Móc SKU ẩn
                            if not product_name and len(txt_clean) > 8:
                                sku_match = re.search(r'\[(.*?)\]', txt_clean)
                                if sku_match and not sku:
                                    sku = sku_match.group(1).strip()
                                    product_name = re.sub(r'\[.*?\]', '', txt_clean).strip()
                                else:
                                    product_name = txt_clean
                                
                        # Chốt chặn an toàn: Ép kiểu để không bao giờ bị lỗi 'not defined'
                        if not product_name: product_name = "Sản phẩm Shopee"
                        if not original_variation: original_variation = ""
                        if not clean_variation: clean_variation = ""
                        
                        # LOG DEBUG ĐỂ KIỂM CHỨNG DỮ LIỆU
                        self.log(f"   [DEBUG_ITEM] Đơn {order_id} | Var: '{original_variation}' | SKU: '{sku}' | Qty: {qty}")

                        # --- BẺ KHÓA SHOPEE: GIẢI MÃ NGÀY TỪ ORDER ID NẾU GIAO DIỆN BỊ ẨN ---
                        if not order_date and order_id and len(order_id) >= 14:
                            try:
                                # Order ID Shopee: YYMMDD... (VD: 260402 -> 2026-04-02)
                                yy = order_id[0:2]
                                mm = order_id[2:4]
                                dd = order_id[4:6]
                                order_date = f"20{yy}-{mm}-{dd} 00:00:00"
                            except: pass

                        # Nếu sau khi bẻ khóa vẫn không có ngày thì mới chặn đứng
                        if not order_date:
                            self.log(f"❌ [LỖI DỮ LIỆU] Đơn {order_id} không có Ngày đặt hàng!")
                            continue 

                

                        # --- THỰC HIỆN CHUẨN HÓA TRẠNG THÁI (PHÂN BIỆT CHƯA XỬ LÝ / ĐÃ XỬ LÝ) ---
                        revenue_numeric = self.parser._clean_price(total_price)
                        
                        status_raw = tab['name'] 
                        oms_status = self.parser._map_oms_status(status_raw)

                        # 🌟 DÒ TÌM NÚT THAO TÁC ĐỂ PHÂN LOẠI CHÍNH XÁC TRONG TAB CHỜ LẤY HÀNG
                        if "Chờ lấy hàng" in tab['name']:
                            full_text = " ".join(lines)
                            if "Chuẩn bị hàng" in full_text or "Chưa xử lý" in tab['name']:
                                status_raw = "Chưa xử lý"
                                oms_status = "PENDING"      # Đưa vào mục: Chờ xác nhận
                            elif "In phiếu giao" in full_text or "Thông tin vận chuyển" in full_text or "Đã xử lý" in tab['name']:
                                status_raw = "Đã xử lý"
                                oms_status = "CONFIRMED"    # Đưa vào mục: Đã xác nhận

                        # --- [BỌC THÉP] TỰ MAP TAB THEO TIẾNG VIỆT CHUẨN ---
                        shipping_map = {
                            "PENDING": "Chờ xác nhận",
                            "CONFIRMED": "Chờ lấy hàng",
                            "SHIPPING": "Đang giao",
                            "COMPLETED": "Đã giao",
                            "CANCELLED_TRANSIT": "Đã hủy",
                            "RETURN_REFUND": "Hoàn hàng"
                        }
                        display_status = shipping_map.get(oms_status, "Chờ lấy hàng")

                        order_obj = {
                            "order_id": order_id,
                            "platform": "shopee",
                            "shop": shop_name,
                            "order_date": order_date,
                            "customer_name": buyer_name,
                            "revenue": revenue_numeric,
                            "raw_revenue": revenue_numeric,
                            "status": status_raw,               # Trạng thái gốc Shopee
                            "shipping_status": display_status,  # Chữ này sẽ làm sáng đèn Tab trên Web
                            "oms_status": oms_status,
                            "tracking_number": tracking_number,
                            "shipping_carrier": carrier if carrier else "SPX Express",
                            "oms_updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                            "items": [{
                                "sku": sku,
                                "variation_name": original_variation, # Bản gốc (có thể dính mã SKU ko ngoặc)
                                "clean_variation": clean_variation,   # Bản sạch (đã xóa ngoặc)
                                "product_name": product_name,
                                "qty": qty,
                                "image_url": ""
                            }]
                        }

                        # --- CƠ CHẾ CHỮA LÀNH DỮ LIỆU TỰ ĐỘNG BẰNG CHỮ KÝ SỐ ---
                        hash_data = order_obj.copy()
                        del hash_data['oms_updated_at']
                        order_signature = hashlib.md5(json.dumps(hash_data, sort_keys=True).encode('utf-8')).hexdigest()

                        # --- HIỂN THỊ LOG TOÀN BỘ ĐƠN HÀNG (Theo yêu cầu soi ngày tháng) ---
                        if order_id in cached_final_orders and cached_final_orders[order_id] == order_signature:
                            self.log(f"👁️ [ĐÃ QUÉT] {order_id} | Ngày: {order_date} | {oms_status} -> (Bỏ qua vì không đổi)")
                            continue 

                        self.log(f"🚀 [CẬP NHẬT] {order_id} | Ngày: {order_date} | {oms_status} -> (Dữ liệu Mới/Đã sửa)")
                        
                        # Chống trùng lặp khi Shopee load lag
                        if not any(o['order_id'] == order_id for o in tab_orders):
                            order_obj['_signature'] = order_signature
                            tab_orders.append(order_obj)

                        if len(tab_orders) >= limit_count:
                            break # Dừng ngay khi gom đủ Target

                    self.log(f"   -> Đã nhặt được {len(tab_orders)}/{limit_count} đơn mục tiêu.")
                    
                    if len(tab_orders) >= limit_count:
                        break # Xong chỉ tiêu của Tab này
                        
                   # 7. Lật Trang (Bơm Javascript lật trang theo đúng thao tác UI)
                    try:
                        self.log(f"   ➡️ Đang tìm nút qua trang {page_num + 1}...")
                        clicked_next = await page.evaluate('''(nextPageNum) => {
                            let pageStr = String(nextPageNum);
                            
                            // CÁCH 1: Tìm và bấm chính xác vào nút mang số trang tiếp theo (Dựa vào log UI của bạn)
                            let pageNodes = document.querySelectorAll("li.eds-pager__page, button.shopee-button-no-solid, .shopee-page-controller button");
                            for (let node of pageNodes) {
                                if (node.textContent.trim() === pageStr) {
                                    node.click();
                                    return true;
                                }
                            }
                            
                            // CÁCH 2: Backup tìm nút Mũi tên Next (Đã cập nhật class .eds-pager mới)
                            let nextBtn = document.querySelector(".eds-pager__btn--next, .eds-pagination__btn--next, .shopee-icon-button--right, button.pagination-next");
                            
                            if (!nextBtn) {
                                let svgs = Array.from(document.querySelectorAll("svg"));
                                let rightSvg = svgs.find(svg => typeof svg.className === 'string' && (svg.className.includes('angle-right') || svg.className.includes('arrow-right')));
                                if (rightSvg) nextBtn = rightSvg.closest('button');
                            }

                            if (nextBtn) {
                                let isDisabled = nextBtn.disabled || nextBtn.classList.contains('eds-pagination__btn--disabled') || nextBtn.classList.contains('eds-pager__btn--disabled') || nextBtn.getAttribute('aria-disabled') === 'true';
                                if (!isDisabled) {
                                    nextBtn.click(); 
                                    return true;
                                }
                            }
                            return false;
                        }''', page_num + 1)

                        if clicked_next:
                            self.log(f"   ✅ Đã bấm sang trang {page_num + 1}, đang chờ dữ liệu load...")
                            await asyncio.sleep(5) # Chờ load giao diện mới
                            page_num += 1
                        else:
                            self.log("   🛑 Đã vét sạch đến trang cuối cùng (Hoặc không có nút lật trang).")
                            break
                    except Exception as e:
                        self.log(f"   ⚠️ Lỗi lật trang: {e}")
                        break
                
                orders_to_keep = tab_orders[:limit_count]
                self.log(f"   ✅ CHỐT: Giữ lại {len(orders_to_keep)} đơn mới nhất tại Tab '{tab['name']}'.")
                
                # Ghi danh TẤT CẢ các đơn vào Sổ Đen kèm Chữ Ký Số để giám sát biến động
                for o in orders_to_keep:
                    if '_signature' in o:
                        newly_completed[o['order_id']] = o['_signature']
                        del o['_signature'] # Xóa đi để rổ dữ liệu gửi lên API vẫn chuẩn và sạch
                        
                all_orders_data.extend(orders_to_keep)
                    
                await asyncio.sleep(2)

            # Lưu Sổ Đen
            if newly_completed:
                cached_final_orders.update(newly_completed)
                with open(cache_file, "w") as f:
                    json.dump(cached_final_orders, f, indent=4)
                self.log(f"💾 CẬP NHẬT SỔ ĐEN THÔNG MINH: Đã ghi nhận/cập nhật {len(newly_completed)} đơn!")

            self.log(f"🎉 Hoàn tất tuần tra Shopee! Tổng gom được: {len(all_orders_data)} đơn từ các Tab.")
            return all_orders_data

        except Exception as e:
            self.log(f"❌ Lỗi khi tuần tra Shopee: {e}")
            return all_orders_data