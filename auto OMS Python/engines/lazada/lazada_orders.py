import asyncio
import os
import json
import hashlib
from parsers.lazada_order_parser import LazadaOrderParser

class LazadaOrderScraper:
    def __init__(self, log_callback, parser: LazadaOrderParser):
        self.log = log_callback
        self.parser = parser
        self.base_url = "https://sellercenter.lazada.vn/apps/order/list"
        self.tabs_to_scrape = [
            {"name": "Chờ đóng gói", "url": f"{self.base_url}?status=topack"},
            {"name": "Chờ bàn giao", "url": f"{self.base_url}?status=toshiparrangeshipment"},
            {"name": "Đang giao", "url": f"{self.base_url}?status=shipping"},
            {"name": "Đã giao", "url": f"{self.base_url}?status=success"},
            {"name": "Giao thất bại", "url": f"{self.base_url}?status=failed"},
            {"name": "Đã hủy", "url": f"{self.base_url}?status=canceled"},
            {"name": "Trả hàng", "url": f"{self.base_url}?status=returned"}
        ]

    async def scrape_new_orders(self, page, shop_name=""):
        # Khởi tạo Sổ đen chuẩn hóa MD5 cho Lazada
        cache_file = f"cache_orders_lazada_{shop_name}.json"
        cached_final_orders = {}
        try:
            if os.path.exists(cache_file):
                with open(cache_file, "r") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        cached_final_orders = {str(k): str(v) for k, v in data.items() if isinstance(v, str)}
        except: pass

        newly_completed = {}
        all_orders = []
        self.log("-------------------------------------------------")
        self.log(f"🚀 [LAZADA RADAR] Khởi động chiến dịch quét đơn cho Shop: {shop_name}...")

        for tab in self.tabs_to_scrape:
            tab_name = tab["name"]
            tab_url = tab["url"]
            self.log(f"[*] Đang càn quét cứ điểm: Tab '{tab_name}'...")
            try:
                await page.goto(tab_url, timeout=60000)
                await asyncio.sleep(5) 

                try:
                    popups = await page.locator("button.next-dialog-close, button:has-text('Đóng'), button.close-btn").all()
                    for popup in popups:
                        if await popup.is_visible(): await popup.click()
                except: pass

                # --- 🌟 MỞ KHÓA BỘ LỌC NGÀY TẠO ĐƠN (Theo đúng UI bạn gửi) ---
                if tab['name'] != "Trả hàng":
                    try:
                        self.log("   ⚙️ Đang ép Lazada hiển thị 'Đơn hàng tạo mới nhất' để bắt ngày chuẩn...")
                        # Tiêm Javascript tìm ô Lọc và Click mở nó ra
                        changed = await page.evaluate('''() => {
                            let dropdowns = Array.from(document.querySelectorAll('.next-select-inner, .next-select'));
                            let target = dropdowns.find(d => d.textContent.includes('Đơn hàng tạo') || d.textContent.includes('Đã cập nhật'));
                            
                            // Nếu đang không ở chế độ "Tạo mới nhất" thì click mở Menu
                            if (target && !target.textContent.includes('Đơn hàng tạo mới nhất')) {
                                target.click(); 
                                return true;
                            }
                            return false;
                        }''')
                        
                        if changed:
                            await asyncio.sleep(1.5) # Chờ Menu thả xuống
                            # Tìm và bấm chính xác vào dòng chữ "Đơn hàng tạo mới nhất"
                            await page.evaluate('''() => {
                                let items = Array.from(document.querySelectorAll('li.next-menu-item'));
                                let option = items.find(i => i.textContent.trim() === 'Đơn hàng tạo mới nhất');
                                if (option) option.click();
                            }''')
                            self.log("   ⏳ Đã đổi bộ lọc, chờ Lazada tải lại danh sách đơn (5 giây)...")
                            await asyncio.sleep(5)
                    except Exception as e:
                        pass
                # ----------------------------------------------------------------

                # Cuộn trang để Lazada load đủ HTML
                for _ in range(3):
                    await page.mouse.wheel(0, 1500)
                    await asyncio.sleep(1.5)
                
                html_content = await page.evaluate("document.body.innerHTML")
                parsed_orders = self.parser.parse_order_list(html_content, current_tab=tab_name, shop_name=shop_name)
                
                if parsed_orders:
                    valid_orders = []
                    for order_obj in parsed_orders:
                        # --- CƠ CHẾ CHỮA LÀNH DỮ LIỆU (MD5) ---
                        hash_data = order_obj.copy()
                        del hash_data['oms_updated_at']
                        order_signature = hashlib.md5(json.dumps(hash_data, sort_keys=True).encode('utf-8')).hexdigest()

                        order_id = order_obj['order_id']
                        if order_id in cached_final_orders and cached_final_orders[order_id] == order_signature:
                            self.log(f"👁️ [ĐÃ QUÉT] {order_id} | Ngày: {order_obj['order_date']} | {order_obj['oms_status']} -> (Bỏ qua)")
                            continue
                            
                        self.log(f"🚀 [CẬP NHẬT] {order_id} | Ngày: {order_obj['order_date']} | {order_obj['oms_status']} -> (Mới/Sửa)")
                        order_obj['_signature'] = order_signature
                        valid_orders.append(order_obj)

                    self.log(f"   ✅ Đã bóc tách và lọc xong {len(valid_orders)} đơn mới tại Tab '{tab_name}'.")
                    all_orders.extend(valid_orders)
                else:
                    self.log(f"   -> Không có đơn nào ở Tab '{tab_name}'.")

            except Exception as e:
                self.log(f"   ❌ Lỗi khi quét Tab '{tab_name}': {e}")

        # Cập nhật các đơn mới vào Sổ đen
        for o in all_orders:
            if '_signature' in o:
                newly_completed[o['order_id']] = o['_signature']
                del o['_signature']
                
        if newly_completed:
            cached_final_orders.update(newly_completed)
            with open(cache_file, "w") as f:
                json.dump(cached_final_orders, f, indent=4)
            self.log(f"💾 CẬP NHẬT SỔ ĐEN LAZADA: Đã ghi nhận/cập nhật {len(newly_completed)} đơn!")
                
        self.log("-------------------------------------------------")
        self.log(f"🎉 HOÀN TẤT QUÉT LAZADA! Tổng thu hoạch: {len(all_orders)} đơn hàng.")
        return all_orders
