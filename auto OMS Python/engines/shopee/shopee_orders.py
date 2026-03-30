import asyncio

class ShopeeOrderScraper:
    def __init__(self, log_callback, parser):
        self.log = log_callback
        self.parser = parser

    async def scrape_new_orders(self, page):
        self.log(f"[*] Bắt đầu nhiệm vụ Tuần tra Đa Tab Shopee...")
        all_orders_data = []
        
        # Danh sách 4 Tab cốt lõi để theo dõi vòng đời đơn hàng
        tabs_to_scan = [
            {"name": "Chờ lấy hàng", "url": "https://banhang.shopee.vn/portal/sale/order?type=toship&source=all&sort_by=ship_by_date_asc"},
            {"name": "Đang giao", "url": "https://banhang.shopee.vn/portal/sale/order?type=shipping"},
            {"name": "Đã giao", "url": "https://banhang.shopee.vn/portal/sale/order?type=completed"},
            {"name": "Đã hủy", "url": "https://banhang.shopee.vn/portal/sale/returnrefundcancel"}
        ]

        try:
            for tab in tabs_to_scan:
                self.log(f"-------------------------------------------------")
                self.log(f"📡 Đang mở Tab: {tab['name']}...")
                await page.goto(tab['url'], timeout=60000, wait_until="domcontentloaded")
                await asyncio.sleep(5) # Chờ API load

                # 1. Tắt Popup
                try:
                    popups = await page.locator("button.eds-button--primary:has-text('Đã hiểu'), button.eds-button--primary:has-text('Later')").all()
                    for popup in popups:
                        if await popup.is_visible():
                            await popup.click()
                            await asyncio.sleep(1)
                except Exception:
                    pass

                # 2. Xử lý Click bộ lọc tùy theo Tab
                if tab['name'] == "Chờ lấy hàng":
                    self.log("[*] Đang ép trình duyệt click bộ lọc cho Tab Chờ lấy hàng...")
                    try:
                        tab_toship = page.locator("div.eds-tabs__nav-tab").filter(has_text="Chờ lấy hàng")
                        if await tab_toship.is_visible(): await tab_toship.click()
                        await asyncio.sleep(2)
                        
                        radio_all = page.locator("span.eds-radio-button__label").filter(has_text="All")
                        if await radio_all.is_visible(): await radio_all.click()
                        await asyncio.sleep(1)
                        
                        tat_ca_radios = await page.locator("span.eds-radio-button__label").filter(has_text="Tất cả").all()
                        for radio in tat_ca_radios:
                            if await radio.is_visible():
                                await radio.click()
                                await asyncio.sleep(1)
                        await asyncio.sleep(4) 
                    except Exception as e:
                        self.log(f"⚠️ Lưu ý khi click bộ lọc: {e}")
                        
                elif tab['name'] == "Đã hủy":
                    self.log("[*] Đang ép trình duyệt click Tab 'Đơn Hủy' và 'Tất cả'...")
                    try:
                        # Click sub-tab Đơn Hủy
                        tab_don_huy = page.locator("div.eds-tabs__nav-tab").filter(has_text="Đơn Hủy")
                        if await tab_don_huy.is_visible(): await tab_don_huy.click()
                        await asyncio.sleep(2)
                        
                        # Click sub-tab Tất cả (của phần Đơn Hủy) - Khắc phục Strict Mode
                        tab_tat_ca = page.locator("div.eds-tabs__nav-tab").filter(has_text="Tất cả").last
                        if await tab_tat_ca.is_visible(): await tab_tat_ca.click()
                        await asyncio.sleep(3)
                    except Exception as e:
                        self.log(f"⚠️ Lưu ý khi click bộ lọc Đã hủy: {e}")

                # 3. Cuộn trang 4 lần & Lấy HTML
                self.log(f"[*] Đang cuộn trang {tab['name']} nhiều lần để tải toàn bộ đơn...")
                for _ in range(4):
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    await asyncio.sleep(2)
                await asyncio.sleep(3)

                html_content = await page.evaluate("document.body.innerHTML")
                
                # 4. Bóc tách và Gắn nhãn Tab
                self.log(f"[*] Bóc tách dữ liệu Tab {tab['name']}...")
                orders_data = self.parser.parse_order_list(html_content)
                
                if orders_data:
                    for o in orders_data:
                        o['tab_source'] = tab['name'] # Gắn nhãn để Sync gửi Server
                    all_orders_data.extend(orders_data)
                    
                await asyncio.sleep(2) # Thở một chút trước khi sang Tab mới

            self.log(f"🎉 Hoàn tất tuần tra! Tổng gom được: {len(all_orders_data)} đơn từ các Tab.")
            return all_orders_data

        except Exception as e:
            self.log(f"❌ Lỗi khi tuần tra Shopee: {e}")
            return all_orders_data
