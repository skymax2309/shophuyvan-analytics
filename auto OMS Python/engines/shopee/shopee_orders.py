import asyncio
import json
import os
import math
import re
from datetime import datetime

class ShopeeOrderScraper:
    def __init__(self, log_callback, parser):
        self.log = log_callback
        self.parser = parser

    async def scrape_new_orders(self, page, limits=None, shop_name="default"):
        if not limits:
            limits = {"new": 100, "shipping": 50, "done": 20}
            
        self.log(f"[*] Bắt đầu Tuần tra Đa Tab Shopee. Giới hạn: Mới({limits['new']}), Đang giao({limits['shipping']}), Xong({limits['done']})")
        
        # Khởi tạo "Sổ đen" Cache (Lưu các đơn đã chốt hạ để né)
        cache_file = f"cache_orders_shopee_{shop_name}.json"
        try:
            if os.path.exists(cache_file):
                with open(cache_file, "r") as f:
                    cached_final_orders = set(json.load(f))
            else:
                cached_final_orders = set()
        except:
            cached_final_orders = set()

        all_orders_data = []
        
        # Danh sách URL quét cạn các Tab (Bao gồm cả Đơn Hủy và Trả Hàng)
        tabs_to_scan = [
            {"name": "Chờ lấy hàng", "url": "https://banhang.shopee.vn/portal/sale/order?type=toship", "limit_type": "new"},
            {"name": "Đang giao", "url": "https://banhang.shopee.vn/portal/sale/order?type=shipping", "limit_type": "shipping"},
            {"name": "Đã giao", "url": "https://banhang.shopee.vn/portal/sale/order?type=completed", "limit_type": "done"},
            {"name": "Đơn Hủy", "url": "https://banhang.shopee.vn/portal/sale/order?type=cancelled", "limit_type": "done"},
            {"name": "Trả hàng", "url": "https://banhang.shopee.vn/portal/sale/returnrefundcancel", "limit_type": "done"}
        ]

        newly_completed = set()

        try:
            for tab in tabs_to_scan:
                limit_count = limits.get(tab['limit_type'], 50)
                
                # 🌟 TOÁN HỌC PHÂN TRANG (CHUẨN SHOPEE 40 ĐƠN/TRANG)
                max_pages = math.ceil(limit_count / 40)
                if max_pages <= 0: continue

                self.log(f"-------------------------------------------------")
                self.log(f"📡 Đang mở Tab: {tab['name']} (Mục tiêu {limit_count} đơn -> Quét tối đa {max_pages} trang)")
                
                await page.goto(tab['url'], timeout=60000, wait_until="domcontentloaded")
                await asyncio.sleep(5) # Chờ Shopee load khung

                # Tắt Popup quảng cáo nếu có
                try:
                    popups = await page.locator("button.eds-button--primary:has-text('Đã hiểu'), button.eds-button--primary:has-text('Later')").all()
                    for popup in popups:
                        if await popup.is_visible():
                            await popup.click()
                            await asyncio.sleep(1)
                except: pass

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

                        # Bỏ qua nếu đã có trong sổ đen (Đơn đã hoàn tất không cào lại)
                        if order_id in cached_final_orders:
                            continue

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

                        # 🌟 5. BẮT ĐÚNG THỜI GIAN ĐẶT HÀNG THỰC TẾ TRÊN GIAO DIỆN
                        order_date = ""
                        for line in lines:
                            # Shopee thường hiển thị: "31-03-2026 14:30" hoặc "31/03/2026"
                            d_match = re.search(r'(\d{2}[-/]\d{2}[-/]\d{4}(?:\s\d{2}:\d{2})?)', line)
                            if d_match:
                                try:
                                    raw_d = d_match.group(1).replace('-', '/')
                                    if len(raw_d) > 10:
                                        dt = datetime.strptime(raw_d, "%d/%m/%Y %H:%M")
                                    else:
                                        dt = datetime.strptime(raw_d, "%d/%m/%Y")
                                    # Ép về chuẩn định dạng Database: YYYY-MM-DD HH:MM:SS
                                    order_date = dt.strftime("%Y-%m-%d %H:%M:%S") 
                                except: pass
                                break

                        # 6. Lấy Tên Sản Phẩm, SKU & Số lượng
                        sku = ""
                        variation = ""
                        product_name = ""
                        qty = 1
                        
                        for idx, line in enumerate(lines):
                            if re.match(r'^x\d+$', line, re.IGNORECASE):
                                qty = int(line[1:])
                                product_name = lines[idx-2] if idx >= 2 else "Sản phẩm Shopee"
                                if idx >= 1:
                                    if "Variation" in lines[idx-1] or "Phân loại" in lines[idx-1]:
                                        variation = lines[idx-1].replace("Variation:", "").replace("Phân loại hàng:", "").strip()
                                    else:
                                        product_name = lines[idx-1]
                                        
                            if "SKU" in line.upper():
                                sku = line.split(":")[-1].strip()

                        if not product_name: product_name = "Sản phẩm Shopee"
                        
                        # Chỉ dùng thời gian cào làm phương án Backup cuối cùng nếu Web bị lỗi không hiện ngày
                        if not order_date: order_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                        # Đóng gói Đơn
                        order_obj = {
                            "order_id": order_id,
                            "order_date": order_date,
                            "buyer_name": buyer_name,
                            "total_price": total_price,
                            "tab_source": tab['name'],
                            "tracking_number": tracking_number,
                            "carrier": carrier,
                            "items": [{
                                "sku": sku,
                                "variation": variation,
                                "name": product_name,
                                "quantity": qty,
                                "image": ""
                            }]
                        }
                        
                        # Chống trùng lặp khi Shopee load lag
                        if not any(o['order_id'] == order_id for o in tab_orders):
                            tab_orders.append(order_obj)

                        if len(tab_orders) >= limit_count:
                            break # Dừng ngay khi gom đủ Target

                    self.log(f"   -> Đã nhặt được {len(tab_orders)}/{limit_count} đơn mục tiêu.")
                    
                    if len(tab_orders) >= limit_count:
                        break # Xong chỉ tiêu của Tab này
                        
                   # 7. Lật Trang (Shopee Pagination Chuẩn)
                    try:
                        next_btn = page.locator("button.eds-pagination__btn--next, button.shopee-icon-button--right, button.pagination-next").last
                        
                        # 🌟 BỌC THÉP: Kiểm tra xem nút có tồn tại trên màn hình không trước khi chạm vào
                        if await next_btn.count() > 0:
                            is_disabled = await next_btn.evaluate("el => el.disabled || el.classList.contains('eds-pagination__btn--disabled')")
                            
                            if await next_btn.is_visible() and not is_disabled:
                                self.log(f"   ➡️ Sang trang {page_num + 1}...")
                                await next_btn.click()
                                await asyncio.sleep(4)
                                page_num += 1
                            else:
                                self.log("   🛑 Đã vét sạch đến trang cuối cùng.")
                                break
                        else:
                            # Nút không tồn tại (Shopee ẩn đi vì ít đơn) -> Nghỉ luôn không chờ
                            self.log("   🛑 Không có nút chuyển trang (Chỉ có 1 trang dữ liệu).")
                            break
                    except Exception as e:
                        self.log(f"   ⚠️ Lỗi lật trang: {e}")
                        break
                
                orders_to_keep = tab_orders[:limit_count]
                self.log(f"   ✅ CHỐT: Giữ lại {len(orders_to_keep)} đơn mới nhất tại Tab '{tab['name']}'.")
                
                # Ghi danh vào Sổ Đen những đơn Đã Giao/Hủy
                for o in orders_to_keep:
                    if tab['limit_type'] == "done":
                        newly_completed.add(o['order_id'])
                        
                all_orders_data.extend(orders_to_keep)
                    
                await asyncio.sleep(2)

            # Lưu Sổ Đen
            if newly_completed:
                cached_final_orders.update(newly_completed)
                with open(cache_file, "w") as f:
                    json.dump(list(cached_final_orders), f)
                self.log(f"💾 CẬP NHẬT SỔ ĐEN: Đã ghi nhớ thêm {len(newly_completed)} đơn chốt hạ!")

            self.log(f"🎉 Hoàn tất tuần tra Shopee! Tổng gom được: {len(all_orders_data)} đơn từ các Tab.")
            return all_orders_data

        except Exception as e:
            self.log(f"❌ Lỗi khi tuần tra Shopee: {e}")
            return all_orders_data