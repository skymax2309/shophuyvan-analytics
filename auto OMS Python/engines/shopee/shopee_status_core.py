import asyncio
import requests
from parsers.shopee_order_parser import ShopeeOrderParser

class ShopeeStatusCore:
    def __init__(self, log_callback):
        self.log = log_callback
        # Khởi tạo lại máy cào bọc thép để xài ké
        self.parser = ShopeeOrderParser(log_callback)
        # API Kéo đơn từ Server
        self.api_get = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/orders"
        # API Cập nhật ngược lại Server
        self.api_update = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"

    async def scan_and_update(self, page, shop_name):
        self.log("-------------------------------------------------")
        self.log(f"🔍 [STATUS CORE] Đang kéo danh sách đơn 'Đang giao' của {shop_name} từ Server...")
        
        try:
            # 1. Gọi API xin Server danh sách TẤT CẢ các đơn đang trong luồng xử lý
            orders = []
            # Bao gồm: Chờ xử lý, Đã xử lý, Đã đóng gói, Đang giao
            statuses_to_check = ["LOGISTICS_PENDING_ARRANGE", "LOGISTICS_REQUEST_CREATED", "LOGISTICS_PACKAGED", "SHIPPED"]
            for st in statuses_to_check:
                res = requests.get(f"{self.api_get}?oms_status={st}&shop={shop_name}&limit=50")
                if res.status_code == 200:
                    orders.extend(res.json().get("data", []))
                    
            if not orders:
                self.log("✅ Server báo: Shop này không có đơn treo (Chờ lấy/Đang giao) nào cần kiểm tra!")
                return
                
            self.log(f"🎯 Nhận lệnh từ Server: Check {len(orders)} đơn hàng đang treo. Mở kho vũ khí Shopee...")
            
            # 2. Mở Tab Tất Cả của Shopee
            await page.goto("https://banhang.shopee.vn/portal/sale/order?type=all&source=all", timeout=60000)
            await asyncio.sleep(5)
            
            # Tắt popup nếu có
            try:
                popups = await page.locator("button.eds-button--primary:has-text('Đã hiểu'), button.eds-button--primary:has-text('Later')").all()
                for popup in popups:
                    if await popup.is_visible():
                        await popup.click()
                        await asyncio.sleep(1)
            except:
                pass

            # 3. Vòng lặp bắn tỉa từng mã vận đơn
            updated_count = 0
            for order in orders:
                o_id = order.get("order_id")
                self.log(f"[*] Đang tra cứu số phận của mã: {o_id} ...")
                
                try:
                    # 3.1 Điền mã đơn vào ô tìm kiếm
                    input_el = page.get_by_placeholder("Nhập Mã đơn hàng")
                    await input_el.click()
                    await input_el.fill("") # Xóa mìn cũ
                    await input_el.fill(o_id)
                    
                    # 3.2 Bấm nút Áp dụng
                    btn_apply = page.locator("button.eds-button--primary").filter(has_text="Áp dụng")
                    if await btn_apply.is_visible():
                        await btn_apply.click()
                    else:
                        await page.keyboard.press("Enter")
                        
                    await asyncio.sleep(3) # Chờ Shopee nôn kết quả ra
                    
                    # 3.3 Dùng lại Máy cào bọc thép (Tái sử dụng code)
                    html = await page.evaluate("document.body.innerHTML")
                    parsed = self.parser.parse_order_list(html)
                    
                    if parsed:
                        shopee_data = parsed[0]
                        shopee_status = shopee_data.get("status", "")
                        
                        # 🌟 DÙNG LUÔN KẾT QUẢ TỪ SIÊU TỪ ĐIỂN CỦA PARSER, KHÔNG TỰ ĐOÁN NỮA!
                        new_oms = shopee_data.get("oms_status")
                        shopee_status = shopee_data.get("shipping_status") # Lấy mã chuẩn đã gọt dũa
                        
                        # Cập nhật order_type tự động dựa trên oms_status
                        order_type = "normal"
                        if new_oms in ["CANCELLED", "LOGISTICS_IN_RETURN", "FAILED_DELIVERY"]:
                            order_type = "cancel"
                        elif new_oms == "RETURN":
                            order_type = "return"
                            
                        # 3.4 Báo cáo Server: GỬI khi đổi trạng thái HOẶC có thêm mã vận đơn mới!
                        new_tracking = shopee_data.get("tracking_number", "")
                        new_carrier = shopee_data.get("carrier", "")
                        
                        if new_oms:
                            is_status_changed = (new_oms != order.get("oms_status")) or (shopee_status != order.get("shipping_status"))
                            is_tracking_added = (new_tracking and new_tracking != order.get("tracking_number"))
                            
                            if is_status_changed or is_tracking_added:
                                self.log(f"   -> Đã bắt được cập nhật: {shopee_status} | Vận đơn: {new_tracking or 'Chưa rõ'}")
                                
                                order["oms_status"] = new_oms
                                order["shipping_status"] = shopee_status
                                order["order_type"] = order_type
                                if new_tracking: order["tracking_number"] = new_tracking
                                if new_carrier: order["shipping_carrier"] = new_carrier
                                
                                payload = {"orders": [order], "items": order.get("items", [])}
                                up_res = requests.post(self.api_update, json=payload)
                                
                                if up_res.status_code == 200:
                                    updated_count += 1
                                    self.log(f"   ✅ Đã chốt sổ tài chính đơn này lên Server!")
                                else:
                                    self.log(f"   ❌ Server từ chối cập nhật: {up_res.text}")
                            else:
                                self.log(f"   -> Đơn đang giữ nguyên trạng thái cũ ({shopee_status}). Bỏ qua cập nhật.")
                        else:
                            self.log(f"   ⚠️ Chưa nhận diện được từ vựng trạng thái: {shopee_status}")
                    else:
                        self.log(f"   ⚠️ Lạ quá, Shopee báo không tìm thấy mã này.")
                        
                except Exception as inner_e:
                    self.log(f"   ❌ Lỗi tra cứu 1 đơn: {inner_e}")
                    
            self.log("-------------------------------------------------")
            self.log(f"🎉 HOÀN TẤT CHIẾN DỊCH! Đã quét {len(orders)} đơn. Chốt sổ thành công {updated_count} đơn sang trạng thái mới.")
            
        except Exception as e:
            self.log(f"❌ Lỗi ở Trái tim Quét Trạng thái: {e}")