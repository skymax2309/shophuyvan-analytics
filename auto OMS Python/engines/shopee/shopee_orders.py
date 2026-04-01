import asyncio
import json
import os

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
        
        # Danh sách Tab bám sát đúng file log của bác
        tabs_to_scan = [
            {"name": "Chờ lấy hàng (Chưa xử lý)", "url": "https://banhang.shopee.vn/portal/sale/order?type=toship&source=to_process", "limit_type": "new"},
            {"name": "Chờ lấy hàng (Đã xử lý)", "url": "https://banhang.shopee.vn/portal/sale/order?type=toship&source=processed", "limit_type": "new"},
            {"name": "Đang giao", "url": "https://banhang.shopee.vn/portal/sale/order?type=shipping", "limit_type": "shipping"},
            {"name": "Đã giao", "url": "https://banhang.shopee.vn/portal/sale/order?type=completed", "limit_type": "done"},
            {"name": "Đơn Hủy/Trả hàng", "url": "https://banhang.shopee.vn/portal/sale/returnrefundcancel", "limit_type": "done"}
        ]

        newly_completed = set()

        try:
            for tab in tabs_to_scan:
                limit_count = limits.get(tab['limit_type'], 50)
                self.log(f"-------------------------------------------------")
                self.log(f"📡 Đang mở Tab: {tab['name']} (Chỉ quét tối đa {limit_count} đơn)...")
                
                await page.goto(tab['url'], timeout=60000, wait_until="domcontentloaded")
                await asyncio.sleep(4)

                # Tắt Popup
                try:
                    popups = await page.locator("button.eds-button--primary:has-text('Đã hiểu'), button.eds-button--primary:has-text('Later')").all()
                    for popup in popups:
                        if await popup.is_visible():
                            await popup.click()
                            await asyncio.sleep(1)
                except: pass

                # Nếu là Tab Hủy, click phụ để bung danh sách "Tất cả" (Bám sát Log Tầng 2)
                if tab['name'] == "Đơn Hủy/Trả hàng":
                    self.log("[*] Đang ép click bung danh sách 'Đơn Hủy' -> 'Tất cả'...")
                    try:
                        tab_don_huy = page.locator("div.eds-tabs__nav-tab").filter(has_text="Đơn Hủy")
                        if await tab_don_huy.is_visible(): await tab_don_huy.click()
                        await asyncio.sleep(2)
                        
                        tab_tat_ca = page.locator("div.eds-tabs__nav-tab").filter(has_text="Tất cả").last
                        if await tab_tat_ca.is_visible(): await tab_tat_ca.click()
                        await asyncio.sleep(3)
                    except Exception as e:
                        self.log(f"⚠️ Không bung được danh sách hủy: {e}")

                tab_orders = [] # Rổ đựng đơn riêng cho Tab này
                current_page = 1
                
                while len(tab_orders) < limit_count:
                    self.log(f"[*] Đang quét Trang {current_page}...")
                    
                    # Cuộn trang để ảnh/dữ liệu load hết
                    for _ in range(4):
                        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                        await asyncio.sleep(1.5)

                    html_content = await page.evaluate("document.body.innerHTML")
                    
                    self.log(f"[*] Bóc tách dữ liệu và check 'Sổ đen' trang {current_page}...")
                    page_orders = self.parser.parse_order_list(html_content, cached_ids=cached_final_orders)
                    
                    if not page_orders:
                        break # Lỗi hoặc không có đơn
                        
                    # Lọc trùng và đưa vào rổ (Do lật trang có thể Shopee tải lại đơn cũ)
                    for po in page_orders:
                        if not any(o['order_id'] == po['order_id'] for o in tab_orders):
                            po['tab_source'] = "Đã hủy" if tab['name'] == "Đơn Hủy/Trả hàng" else tab['name']
                            tab_orders.append(po)
                            
                    self.log(f"   -> Đã nhặt được tổng cộng {len(tab_orders)}/{limit_count} đơn mục tiêu.")
                    
                    if len(tab_orders) >= limit_count:
                        break # Đã đủ chỉ tiêu Limit -> Nghỉ luôn không quét nữa
                        
                    # 🚀 BẤM NÚT QUA TRANG (NEXT PAGE) ĐỂ LẤY ĐƠN VƯỢT MỐC 40
                    try:
                        # Tìm nút Next mũi tên sang phải của Shopee
                        next_btn = page.locator("button.eds-pagination__btn--next, button.shopee-icon-button--right, button.pagination-next").last
                        
                        # Kiểm tra nếu nút Next bị khóa (Disabled) -> Nghĩa là đã đến trang cuối cùng
                        is_disabled = await next_btn.evaluate("el => el.disabled || el.classList.contains('eds-pagination__btn--disabled')")
                        
                        if await next_btn.is_visible() and not is_disabled:
                            await next_btn.click()
                            self.log("   👉 Đang lật sang trang tiếp theo để vét thêm đơn...")
                            current_page += 1
                            await asyncio.sleep(4) # Chờ trang mới load hoàn toàn
                        else:
                            self.log("   🛑 Đã vét sạch đến trang cuối cùng của Tab này!")
                            break
                    except Exception as e:
                        self.log(f"   ⚠️ Không thể lật trang (Có thể chỉ có 1 trang): {e}")
                        break
                
                # Cắt chuẩn xác theo Limit yêu cầu và gom vào kho tổng
                orders_to_keep = tab_orders[:limit_count]
                self.log(f"   ✅ CHỐT: Giữ lại {len(orders_to_keep)} đơn mới nhất tại Tab {tab['name']}.")
                
                for o in orders_to_keep:
                    if tab['limit_type'] == "done":
                        newly_completed.add(o['order_id'])
                        
                all_orders_data.extend(orders_to_keep)
                    
                await asyncio.sleep(2)

            # Ghi đè sổ đen mới vào file JSON
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