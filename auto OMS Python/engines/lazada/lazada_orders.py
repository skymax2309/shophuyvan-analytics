import asyncio
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

    async def scrape_new_orders(self, page):
        all_orders = []
        self.log("-------------------------------------------------")
        self.log("🚀 [LAZADA RADAR] Khởi động chiến dịch quét đơn hàng...")

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

                # Cuộn trang để Lazada load đủ HTML
                for _ in range(3):
                    await page.mouse.wheel(0, 1500)
                    await asyncio.sleep(1.5)
                
                html_content = await page.evaluate("document.body.innerHTML")
                parsed_orders = self.parser.parse_order_list(html_content, current_tab=tab_name)
                
                if parsed_orders:
                    self.log(f"   ✅ Bóc tách thành công {len(parsed_orders)} đơn hàng tại Tab '{tab_name}'.")
                    all_orders.extend(parsed_orders)
                else:
                    self.log(f"   -> Không có đơn nào ở Tab '{tab_name}'.")

            except Exception as e:
                self.log(f"   ❌ Lỗi khi quét Tab '{tab_name}': {e}")
                
        self.log("-------------------------------------------------")
        self.log(f"🎉 HOÀN TẤT QUÉT LAZADA! Tổng thu hoạch: {len(all_orders)} đơn hàng.")
        return all_orders
