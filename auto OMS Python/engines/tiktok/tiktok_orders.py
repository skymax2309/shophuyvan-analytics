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

                # 3.5 [TUYỆT CHIÊU] Rà chuột ép TikTok nhả dữ liệu ẩn
                self.log("   -> Đang rà chuột lôi Tên SP và SKU ẩn ra ánh sáng...")
                await page.evaluate('''async () => {
                    let rows = document.querySelectorAll('.arco-table-tr, tbody tr');
                    for(let row of rows) {
                        // Tìm cái ô chứa hình ảnh / chữ "x mặt hàng"
                        let cell = row.querySelector('td:nth-child(3), td:nth-child(4)'); 
                        if(!cell) continue;

                        // Đưa chuột vào để gọi Popup hiện lên
                        cell.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}));
                        cell.dispatchEvent(new MouseEvent('mouseenter', {bubbles: true}));
                        await new Promise(r => setTimeout(r, 400)); // Chờ 0.4s cho popup nảy ra

                        // Tìm Popup vừa nảy ra và lấy sạch ruột của nó
                        let popovers = document.querySelectorAll('.arco-popover-content, .arco-tooltip-content');
                        if(popovers.length > 0) {
                            let lastPop = popovers[popovers.length - 1];
                            // Nhét giấu cục HTML này vào chính dòng đơn hàng để Python đọc
                            let div = document.createElement('div');
                            div.className = 'huyvan-injected-data';
                            div.style.display = 'none';
                            div.innerHTML = lastPop.innerHTML; 
                            row.appendChild(div);
                        }

                        // Rút chuột ra để đóng Popup
                        cell.dispatchEvent(new MouseEvent('mouseout', {bubbles: true}));
                        cell.dispatchEvent(new MouseEvent('mouseleave', {bubbles: true}));
                    }
                }''')
                await asyncio.sleep(1)

                # 4. Lấy cục HTML (Đã được bơm thêm dữ liệu) ném cho Parser
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