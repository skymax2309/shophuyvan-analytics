import asyncio

class ShopeeOrderScraper:
    def __init__(self, log_callback, parser):
        self.log = log_callback
        self.parser = parser
        # Đổi link gốc sang dạng All (Chờ lấy hàng -> Tất cả) giống hệt URL trên trình duyệt của bạn
        self.target_url = "https://banhang.shopee.vn/portal/sale/order?type=toship&source=all&sort_by=ship_by_date_asc"

    async def scrape_new_orders(self, page):
        self.log(f"[*] Bắt đầu nhiệm vụ cào đơn hàng Shopee...")
        
        try:
            # 1. Đi tới trang đích
            await page.goto(self.target_url, timeout=60000, wait_until="domcontentloaded")
            await asyncio.sleep(5) # Chờ Shopee load API danh sách đơn

            # 2. Xử lý Pop-up cản đường
            try:
                popups = await page.locator("button.eds-button--primary:has-text('Đã hiểu'), button.eds-button--primary:has-text('Later')").all()
                for popup in popups:
                    if await popup.is_visible():
                        await popup.click()
                        self.log("✅ Đã tắt popup cản đường.")
                        await asyncio.sleep(1)
            except Exception:
                pass

            # [BỌC THÉP] 2.1 CLICK CHÍNH XÁC 4 BỘ LỌC THEO YÊU CẦU CỦA BẠN
            self.log("[*] Đang ép trình duyệt click 4 bộ lọc: Chờ lấy hàng -> All -> Tất cả...")
            try:
                # 1. Click Tab "Chờ lấy hàng" cho chắc cốp
                tab_toship = page.locator("div.eds-tabs__nav-tab").filter(has_text="Chờ lấy hàng")
                if await tab_toship.is_visible(): await tab_toship.click()
                await asyncio.sleep(2)
                
                # 2. Click Radio "All" (Loại đơn hàng)
                radio_all = page.locator("span.eds-radio-button__label").filter(has_text="All")
                if await radio_all.is_visible(): await radio_all.click()
                await asyncio.sleep(1)
                
                # 3 & 4. Quét và Click tất cả các Radio có chữ "Tất cả" (Dành cho Trạng thái đơn & Hạn giao hàng)
                tat_ca_radios = await page.locator("span.eds-radio-button__label").filter(has_text="Tất cả").all()
                for radio in tat_ca_radios:
                    if await radio.is_visible():
                        await radio.click()
                        await asyncio.sleep(1)
                        
                self.log("✅ Đã click xong các bộ lọc hiển thị đơn!")
                await asyncio.sleep(4) # Đợi 4 giây cho Shopee quay vòng vòng load xong danh sách đơn
            except Exception as e:
                self.log(f"⚠️ Lưu ý khi click bộ lọc: {e}")

            # 3. Cuộn trang để đảm bảo Shopee load hết ảnh/đơn bên dưới
            self.log("[*] Đang cuộn trang để tải toàn bộ đơn...")
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(2)

            # 4. Trích xuất cục HTML chứa danh sách đơn hàng
            html_content = await page.evaluate("document.body.innerHTML")
            
            # 5. Ném cho Parser mổ xẻ
            self.log("[*] Đang gửi dữ liệu cho AI bóc tách...")
            orders_data = self.parser.parse_order_list(html_content)
            
            return orders_data

        except Exception as e:
            self.log(f"❌ Lỗi khi cào đơn Shopee: {e}")
            return []
