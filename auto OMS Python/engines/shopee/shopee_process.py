import asyncio
import requests

class ShopeeOrderProcessor:
    def __init__(self, log_callback):
        self.log = log_callback
        self.api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api"

    async def process_confirmed_orders(self, page, shop_name):
        self.log(f"[*] Bắt đầu quy trình CHUẨN BỊ HÀNG cho shop: {shop_name}")

        # 1. Gọi API lấy danh sách đơn Đã Xác Nhận (CONFIRMED)
        try:
            self.log("[*] Đang tải danh sách đơn 'Đã xác nhận' từ Server...")
            res = requests.get(f"{self.api_url}/orders?oms_status=CONFIRMED&platform=shopee&shop={shop_name}&limit=5")
            if res.status_code == 200:
                data = res.json()
                orders = data.get("data", [])
            else:
                self.log(f"❌ Lỗi API Server: {res.text}")
                return
        except Exception as e:
            self.log(f"❌ Lỗi kết nối Server: {e}")
            return

        if not orders:
            self.log("✅ Không có đơn hàng nào cần chuẩn bị (Tab 'Đã xác nhận' đang trống).")
            return

        self.log(f"🎯 Tìm thấy {len(orders)} đơn hàng chờ xử lý. Khởi động Shopee...")

        # 2. Truy cập thẳng vào trang Tất cả đơn
        target_url = "https://banhang.shopee.vn/portal/sale/order?type=toship&source=all"
        await page.goto(target_url, timeout=60000, wait_until="domcontentloaded")
        await asyncio.sleep(5)

        # Tắt popup cản đường
        try:
            popups = await page.locator("button.eds-button--primary:has-text('Đã hiểu'), button.eds-button--primary:has-text('Later')").all()
            for popup in popups:
                if await popup.is_visible(): await popup.click()
        except: pass

        # 3. Tiến hành DÒ MÌN đơn đầu tiên
        for order in orders:
            order_id = order['order_id']
            self.log(f"------------------------------------")
            self.log(f"[*] Đang xử lý Mã đơn: {order_id}")

            try:
                # Gõ mã đơn vào ô tìm kiếm
                search_input = page.locator("input[placeholder*='Input Order/booking ID']")
                await search_input.fill("")
                await search_input.fill(order_id)
                await page.keyboard.press("Enter")
                await asyncio.sleep(3)

                # Tìm và click nút Chuẩn bị hàng
                prep_btn = page.locator("button.eds-button--primary", has_text="Chuẩn bị hàng")
                
                if await prep_btn.is_visible():
                    await prep_btn.click()
                    self.log(f"[+] Đã click 'Chuẩn bị hàng' cho đơn {order_id}!")
                    
                    self.log("[+] Đang chờ Popup Xác nhận tải lên...")
                    await asyncio.sleep(2)
                    
                    # Bơm thao tác click "Thời gian lấy hàng" nếu Shopee bắt chọn
                    try:
                        time_slot = page.locator("div.hovered")
                        if await time_slot.is_visible():
                            await time_slot.click()
                            await asyncio.sleep(1)
                    except: pass

                    # Bấm nút Xác nhận chuẩn bị hàng
                    confirm_btn = page.locator("button.eds-button--primary:has-text('Xác nhận')")
                    if await confirm_btn.is_visible():
                        await confirm_btn.click()
                        self.log(f"✅ Đã xác nhận chuẩn bị hàng thành công cho đơn {order_id}!")
                        
                        # Bắn API cập nhật Web OMS sang Đang đóng gói (PACKING)
                        try:
                            res = requests.patch(f"{self.api_url}/orders/{order_id}/oms-status", json={"oms_status": "PACKING"})
                            if res.status_code == 200:
                                self.log(f"🔄 Đã đồng bộ trạng thái về Web OMS thành 'Đang đóng gói'.")
                        except Exception as e:
                            self.log(f"⚠️ Lỗi cập nhật API OMS: {e}")
                            
                        await asyncio.sleep(2) # Nghỉ nhịp trước khi sang đơn tiếp theo
                    else:
                        self.log(f"⚠️ Không tìm thấy nút Xác nhận cho đơn {order_id}.")

                else:
                    self.log(f"⚠️ Không tìm thấy nút 'Chuẩn bị hàng'. Đơn này có thể đã bị hủy hoặc đã xử lý.")
                    
            except Exception as e:
                self.log(f"❌ Bị kẹt khi xử lý đơn {order_id}: {e}")
                break

        self.log("[*] Phiên chạy thử kết thúc.")
