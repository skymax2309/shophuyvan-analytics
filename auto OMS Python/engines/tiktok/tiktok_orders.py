import asyncio
import re
import math
from datetime import datetime
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

    async def scrape_new_orders(self, page, limits=None, shop_name=""):
        if limits is None:
            limits = {"new": 100, "shipping": 50, "done": 20}

        all_orders = []
        self.log("-------------------------------------------------")
        self.log(f"🚀 [TIKTOK RADAR] Khởi động quét đơn dạng thẻ cho Shop: {shop_name}...")

        for tab in self.tabs_to_scrape:
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

                # 3. Bật "Xem dạng thẻ"
                try:
                    self.log("   ⚙️ Chuyển sang 'Xem dạng thẻ'...")
                    await page.locator('span:has-text("Chế độ xem")').first.click(timeout=3000)
                    await asyncio.sleep(2)
                    await page.locator('div:has-text("Xem dạng thẻ")').first.click(timeout=3000)
                    await asyncio.sleep(3)
                except: pass

                # 4. Ép hiển thị 50 đơn/trang
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

                        # C. Lấy Đơn vị vận chuyển + Mã Vận Đơn
                        carrier = ""
                        tracking_number = ""
                        for line in lines:
                            if "Vận chuyển qua nền tảng" in line or "Express" in line or "Ahamove" in line:
                                carrier_raw = line.replace("Vận chuyển qua nền tảng", "").replace("|", "").strip()
                                if "," in carrier_raw:
                                    c_parts = carrier_raw.split(",")
                                    carrier = c_parts[0].strip()
                                    tracking_number = c_parts[1].strip()
                                else:
                                    carrier = carrier_raw
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

                        # Đóng gói 1 đơn
                        all_orders.append({
                            "order_id": order_id,
                            "order_date": order_date,
                            "buyer_name": buyer_name,
                            "total_price": total_price,
                            "tab_source": tab_name,
                            "tracking_number": tracking_number,
                            "carrier": carrier,
                            "items": items
                        })
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
                
        self.log("-------------------------------------------------")
        self.log(f"🎉 HOÀN TẤT QUÉT TIKTOK! Tổng thu hoạch: {len(all_orders)} đơn hàng.")
        return all_orders