import asyncio
import re
import math
import os
import sys # <-- Thêm thư viện sys
import json
import hashlib
from datetime import datetime

# Bơm đường dẫn gốc vào bộ nhớ của Python (Lùi lại 2 cấp thư mục)
current_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.abspath(os.path.join(current_dir, '..', '..'))
if root_dir not in sys.path:
    sys.path.append(root_dir)

from parsers.tiktok_order_parser import TiktokOrderParser
class TiktokOrderScraper:
    def __init__(self, log_callback, parser: TiktokOrderParser):
        self.log = log_callback
        self.parser = parser
        # 🌟 Bọc thép: Khai báo sẵn các mốc Giới hạn (Limits) tương ứng với từng Tab
        self.tabs_to_scrape = [
            {"name": "Cần gửi", "url": "https://seller-vn.tiktok.com/order?tab=to_ship", "limit_key": "new"},
            {"name": "Đã gửi", "url": "https://seller-vn.tiktok.com/order?tab=shipped", "limit_key": "shipping"},
            {"name": "Đã hoàn tất", "url": "https://seller-vn.tiktok.com/order?tab=completed", "limit_key": "done"},
            {"name": "Đã hủy", "url": "https://seller-vn.tiktok.com/order?tab=cancellation", "limit_key": "done"},
            {"name": "Giao không thành công", "url": "https://seller-vn.tiktok.com/order?tab=fail_delivery", "limit_key": "done"}
        ]

    async def scrape_new_orders(self, page, limits=None, shop_name="", mode="all"):
        if limits is None:
            limits = {"new": 100, "shipping": 50, "done": 20}

        # Khởi tạo Sổ đen chuẩn hóa MD5 cho TikTok
        cache_file = f"cache_orders_tiktok_{shop_name}.json"
        cached_final_orders = {}
        try:
            if os.path.exists(cache_file):
                with open(cache_file, "r") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        cached_final_orders = {str(k): str(v) for k, v in data.items() if isinstance(v, str)}
        except Exception as e:
            self.log(f"⚠️ Không thể đọc Sổ đen cũ, sẽ khởi tạo mới: {e}")

        newly_completed = {}
        all_orders = []
        self.log("-------------------------------------------------")
        if mode == "new_only":
            self.log(f"🚀 [TIKTOK RADAR] Khởi động TỐC ĐỘ CAO (Chỉ quét 'Cần gửi') cho Shop: {shop_name}...")
            target_tabs = [t for t in self.tabs_to_scrape if t["name"] == "Cần gửi"]
        elif mode == "status_only":
            self.log(f"🚀 [TIKTOK RADAR] Khởi động QUÉT HÀNH TRÌNH cho Shop: {shop_name}...")
            target_tabs = [t for t in self.tabs_to_scrape if t["name"] in ["Đã gửi", "Đã hoàn tất", "Đã hủy", "Giao không thành công"]]
        else:
            self.log(f"🚀 [TIKTOK RADAR] Khởi động quét đơn dạng thẻ cho Shop: {shop_name}...")
            target_tabs = self.tabs_to_scrape

        for tab in target_tabs:
            tab_name = tab["name"]
            tab_url = tab["url"]
            limit_val = limits.get(tab["limit_key"], 50)
            
            # 🌟 TÍNH TOÁN THÔNG MINH: Ví dụ nhập 100 đơn -> Cần quét 2 trang (Vì 1 trang 50 đơn)
            max_pages = math.ceil(limit_val / 50)
            if max_pages <= 0: continue

            self.log(f"\n[*] 📍 Di chuyển đến Tab '{tab_name}' (Mục tiêu: {limit_val} đơn -> Quét tối đa {max_pages} trang)")
            try:
                # 1. Truy cập Tab
                await page.goto(tab_url, wait_until="networkidle")
                await asyncio.sleep(8) # Chờ Web load
                
                # 2. Đóng popup quảng cáo đè mặt
                try:
                    popups = await page.locator("button:has-text('Đã hiểu'), button:has-text('Đóng'), .TUXModal-close").all()
                    for popup in popups:
                        if await popup.is_visible():
                            await popup.click()
                            await asyncio.sleep(1)
                except: pass

                # 3. Phá bộ lọc (Reset Filters) - Theo Phương án 1 (Bắn tỉa tọa độ thực tế)
                try:
                    self.log("   ⚙️ Đang phá bộ lọc theo tọa độ Log...")
                    # Sử dụng XPath chính xác từ Log bác gửi để xóa lọc nhanh
                    reset_btn = page.locator('id("main") >> div >> div >> div >> div >> div >> div >> div >> div >> div >> svg').nth(2)
                    
                    if await reset_btn.is_visible():
                        await reset_btn.click()
                        self.log("   ✅ Đã click icon xóa lọc.")
                        await asyncio.sleep(3)
                    else:
                        self.log("   ℹ️ Không thấy bộ lọc nào đang bật, bỏ qua.")
                except Exception as e:
                    self.log(f"   ⚠️ Không thể phá lọc: {e}")

                # 4. Bật "Xem dạng thẻ"
                try:
                    self.log("   ⚙️ Chuyển sang 'Xem dạng thẻ'...")
                    await page.locator('span:has-text("Chế độ xem")').first.click(timeout=3000)
                    await asyncio.sleep(2)
                    await page.locator('div:has-text("Xem dạng thẻ")').first.click(timeout=3000)
                    await asyncio.sleep(3)
                except: pass

                # 5. Ép hiển thị 50 đơn/trang
                try:
                    self.log("   ⚙️ Mở rộng hiển thị 50 đơn/trang...")
                    await page.locator('.p-pagination-options, [class*="pagination"] svg, #p-select-popup-1').last.click(timeout=3000)
                    await asyncio.sleep(2)
                    await page.locator('.p-select-dropdown-menu li:nth-child(3), #p-select-popup-1 li:nth-child(3)').click(timeout=3000)
                    await asyncio.sleep(6)
                except: pass

                # 5. Bắt đầu vòng lặp Cào dữ liệu tàng hình
                page_num = 1
                tab_orders_count = 0

                while page_num <= max_pages:
                    self.log(f"   📄 Đang bóc tách dữ liệu Trang {page_num}/{max_pages}...")
                    
                    # Rút Text toàn màn hình
                    page_text = await page.evaluate("() => document.body.innerText")
                    if "ID đơn hàng:" not in page_text:
                        self.log("   ⚠️ Không tìm thấy đơn hàng nào trên trang này.")
                        break
                    
                    # Chặt Text bằng cưa máy
                    blocks = page_text.split("ID đơn hàng:")
                    for block in blocks[1:]:
                        lines = [line.strip() for line in block.split('\n') if line.strip()]
                        if not lines: continue
                        
                        # A. Lấy Mã đơn (583339185351853565)
                        id_match = re.search(r'(?<!\d)(5\d{17,18})(?!\d)', lines[0])
                        if not id_match: continue
                        order_id = id_match.group(1)

                        # B. Lấy Tên khách + Ngày giờ
                        buyer_name = "Khách hàng"
                        order_date = ""
                        for i, line in enumerate(lines):
                            # Lấy tên khách hàng
                            if "Bắt đầu trò chuyện" in line:
                                parts = line.split('Bắt đầu')
                                name_candidate = parts[0].replace('|', '').strip()
                                if name_candidate:
                                    buyer_name = name_candidate
                                elif i > 0: # Nếu bị tách dòng, tên khách thường nằm ở dòng ngay trước đó
                                    buyer_name = lines[i-1].replace('|', '').strip()
                            
                            # Lấy Ngày giờ đặt hàng (Quét độc lập, không ngắt vòng lặp sớm)
                            d_match = re.search(r'(\d{2}/\d{2}/\d{4}\s\d{2}:\d{2}:\d{2})', line)
                            if d_match and not order_date:
                                try:
                                    dt = datetime.strptime(d_match.group(1), "%d/%m/%Y %H:%M:%S")
                                    order_date = dt.strftime("%Y-%m-%d %H:%M:%S")
                                except: pass

                        # C. Lấy Đơn vị vận chuyển + Mã Vận Đơn (NEO TỪ KHÓA TIKTOK)
                        carrier = ""
                        tracking_number = ""
                        for i, line in enumerate(lines):
                            # Mỏ neo 1: Nếu thấy nhãn này, ĐVVC luôn nằm ở dòng ngay bên dưới
                            if "Vận chuyển qua nền tảng" in line:
                                if i + 1 < len(lines):
                                    carrier = lines[i+1].strip()
                                break
                            # Mỏ neo 2: Bắt trực tiếp ĐVVC nếu nó đứng trơ trọi (hoặc là Vận chuyển tiêu chuẩn)
                            elif any(c in line for c in ["Express", "Ahamove", "J&T", "Giao Hàng", "Ninja", "Viettel", "Vận chuyển tiêu chuẩn"]):
                                carrier = line.strip()
                                break

                        # D. Lấy Tổng tiền
                        total_price = "0"
                        for line in lines:
                            if "₫" in line:
                                p_match = re.search(r'([\d\.]+)\s*₫', line)
                                if p_match:
                                    total_price = p_match.group(1).replace(".", "")
                                    break

                        # E. Bóc tách Sản Phẩm / SKU / Số lượng
                        items = []
                        for i, line in enumerate(lines):
                            if "SKU người bán:" in line:
                                sku = line.split("SKU người bán:")[1].strip()
                                variation = lines[i-1] if i > 0 else ""
                                name = lines[i-2] if i > 1 else "Sản phẩm TikTok"
                                
                                qty = "1"
                                for j in range(i+1, min(i+4, len(lines))):
                                    if "×" in lines[j] or "x" in lines[j].lower() or "X" in lines[j]:
                                        q_match = re.search(r'[×xX]\s*(\d+)', lines[j])
                                        if q_match: qty = q_match.group(1)
                                        break
                                
                                items.append({
                                    "sku": sku,
                                    "variation": variation,
                                    "name": name,
                                    "quantity": qty,
                                    "image": "" # Không lấy được ảnh từ Text
                                })
                        
                        if not items:
                            items.append({"sku": "", "variation": "", "name": "Sản phẩm TikTok", "quantity": "1", "image": ""})

                        # --- QUY TẮC THÉP: KHÔNG CÓ NGÀY ĐẶT HÀNG -> BÁO LỖI ---
                        if not order_date:
                            self.log(f"❌ [LỖI DỮ LIỆU] Đơn {order_id} không tìm thấy Ngày đặt hàng!")
                            continue

                        # Xử lý Doanh thu thành số thực
                        revenue_numeric = 0.0
                        if total_price:
                            try:
                                revenue_numeric = float(re.sub(r'[^\d.]', '', str(total_price).replace('.', '')))
                            except: pass

                        # Map trạng thái chuẩn OMS (GỌI SIÊU TỪ ĐIỂN TỪ PARSER)
                        shipping_st, oms_st = self.parser._normalize_status(tab_name)

                        # ... (giữ nguyên phần code formatted_items phía trên) ...

                        # Đóng gói dữ liệu theo chuẩn Database D1
                        order_obj = {
                            "order_id": order_id,
                            "platform": "tiktok",
                            "shop": shop_name,
                            "order_date": order_date,
                            "customer_name": buyer_name,
                            "revenue": revenue_numeric,
                            "raw_revenue": revenue_numeric,
                            "status": tab_name,
                            "shipping_status": shipping_st,  # 🌟 THÊM RUỘT ĐỂ HIỆN TAB
                            "oms_status": oms_st,            # 🌟 THÊM VỎ ĐỂ PHÂN LOẠI
                            "tracking_number": tracking_number,
                            "shipping_carrier": carrier,
                            "oms_updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                            "items": formatted_items
                        }

                        # --- CƠ CHẾ CHỮA LÀNH DỮ LIỆU BẰNG CHỮ KÝ SỐ (MD5) ---
                        hash_data = order_obj.copy()
                        del hash_data['oms_updated_at']
                        order_signature = hashlib.md5(json.dumps(hash_data, sort_keys=True).encode('utf-8')).hexdigest()

                        # So sánh MD5: Lơ đi nếu dữ liệu không đổi
                        is_unchanged = False
                        if order_id in cached_final_orders:
                            existing_hash = cached_final_orders[order_id]
                            if isinstance(existing_hash, str) and existing_hash == order_signature:
                                is_unchanged = True
                        
                        if is_unchanged:
                            self.log(f"👁️ [ĐÃ QUÉT] {order_id} | Ngày: {order_date} | {oms_st} -> (Bỏ qua vì không đổi)")
                            continue

                        self.log(f"🚀 [CẬP NHẬT] {order_id} | Ngày: {order_date} | {oms_st} -> (Dữ liệu Mới/Đã sửa)")
                        
                        # Lưu chữ ký số để chốt sổ đen ở cuối Tab
                        order_obj['_signature'] = order_signature
                        all_orders.append(order_obj)
                        
                        tab_orders_count += 1
                        
                        # Dừng ngay nếu đủ Limit của Tab
                        if tab_orders_count >= limit_val:
                            break

                    if tab_orders_count >= limit_val:
                        self.log(f"   🛑 Đã cào đủ {limit_val} đơn theo yêu cầu cho Tab '{tab_name}'.")
                        break

                    # 6. Chuyển trang (Sử dụng text-is siêu chuẩn xác)
                    next_btn = page.locator(f'li.p-pagination-item:text-is("{page_num + 1}")')
                    if await next_btn.count() > 0:
                        self.log(f"   ➡️ Sang trang {page_num + 1}...")
                        await next_btn.click()
                        await asyncio.sleep(6)
                        page_num += 1
                    else:
                        arrow_next = page.locator('li[title="Next Page"], li.p-pagination-next:not(.p-pagination-disabled)')
                        if await arrow_next.count() > 0:
                            self.log(f"   ➡️ Bấm mũi tên sang trang {page_num + 1}...")
                            await arrow_next.first.click()
                            await asyncio.sleep(6)
                            page_num += 1
                        else:
                            break

            except Exception as e:
                self.log(f"   ❌ Lỗi khi quét Tab '{tab_name}': {e}")
                
        # Cập nhật các đơn mới vào Sổ đen
        for o in all_orders:
            if '_signature' in o:
                newly_completed[o['order_id']] = o['_signature']
                del o['_signature'] # Dọn dẹp trước khi gửi API
                
        if newly_completed:
            cached_final_orders.update(newly_completed)
            with open(cache_file, "w") as f:
                json.dump(cached_final_orders, f, indent=4)
            self.log(f"💾 CẬP NHẬT SỔ ĐEN TIKTOK: Đã ghi nhận/cập nhật {len(newly_completed)} đơn!")

        self.log("-------------------------------------------------")
        self.log(f"🎉 HOÀN TẤT QUÉT TIKTOK! Tổng thu hoạch: {len(all_orders)} đơn hàng.")
        return all_orders