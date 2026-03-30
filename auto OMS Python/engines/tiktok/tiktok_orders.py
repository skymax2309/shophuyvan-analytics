import asyncio
from parsers.tiktok_order_parser import TiktokOrderParser

class TiktokOrderScraper:
    def __init__(self, log_callback, parser: TiktokOrderParser):
        self.log = log_callback
        self.parser = parser
        # Danh sách các Tab cần quét và URL tương ứng lấy từ file log của bác
        self.tabs_to_scrape = [
            {"name": "Cần gửi", "url": "https://seller-vn.tiktok.com/order?tab=to_ship"},
            {"name": "Đã gửi", "url": "https://seller-vn.tiktok.com/order?tab=shipped"},
            {"name": "Đã hoàn tất", "url": "https://seller-vn.tiktok.com/order?tab=completed"},
            {"name": "Đã hủy", "url": "https://seller-vn.tiktok.com/order?tab=cancellation"},
            {"name": "Giao không thành công", "url": "https://seller-vn.tiktok.com/order?tab=fail_delivery"}
        ]

    async def scrape_new_orders(self, page):
        all_orders = []
        
        self.log("-------------------------------------------------")
        self.log("🚀 [TIKTOK RADAR] Khởi động chiến dịch quét đơn hàng...")

        for tab in self.tabs_to_scrape:
            tab_name = tab["name"]
            tab_url = tab["url"]
            
            self.log(f"[*] Đang di chuyển đến cứ điểm: Tab '{tab_name}'...")
            try:
                # 1. Truy cập URL của Tab
                await page.goto(tab_url, timeout=60000)
                await asyncio.sleep(5) # Chờ Web load xong khung sườn
                
                # 2. Xử lý popup nếu có (TikTok hay có thông báo đè lên)
                try:
                    popups = await page.locator("button:has-text('Đã hiểu'), button:has-text('Đóng'), .TUXModal-close").all()
                    for popup in popups:
                        if await popup.is_visible():
                            await popup.click()
                            await asyncio.sleep(1)
                except:
                    pass

                # 3. Cuộn trang để tải hết dữ liệu (TikTok dùng lazy load)
                self.log(f"   -> Đang cuộn trang để vét cạn đơn hàng...")
                for _ in range(3):
                    await page.mouse.wheel(0, 2000)
                    await asyncio.sleep(2)
                
                # 4. Lấy cục HTML ném cho Parser mổ xẻ
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
        self.log(f"🎉 HOÀN TẤT QUÉT TIKTOK! Tổng thu hoạch: {len(all_orders)} đơn hàng.")
        return all_orders