import asyncio
import requests
import os
import json

class ShopeeOrderProcessor:
    def __init__(self, log_callback):
        self.log = log_callback
        self.api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api"

    async def process_confirmed_orders(self, page, shop_name):
        self.log(f"[*] Bắt đầu quy trình CHUẨN BỊ HÀNG / IN PHIẾU cho shop: {shop_name}")

        orders = []
        
        # 1. KIỂM TRA XEM CÓ LỆNH IN PDF TỪ RADAR TRUYỀN XUỐNG KHÔNG (Đọc giấy nhớ)
        if os.path.exists("temp_print_jobs.json"):
            try:
                with open("temp_print_jobs.json", "r") as f:
                    order_ids = json.load(f)
                os.remove("temp_print_jobs.json") # Đọc xong xé bỏ giấy nhớ ngay
                orders = [{"order_id": oid} for oid in order_ids]
                self.log(f"🎯 [RADAR GIAO VIỆC] Nhận lệnh Xử lý & In phiếu khẩn cấp cho {len(orders)} đơn.")
            except: pass

        # 2. NẾU KHÔNG CÓ LỆNH KHẨN, TỰ ĐỘNG LẤY ĐƠN 'CONFIRMED' TRÊN SERVER NHƯ CŨ
        if not orders:
            try:
                self.log("[*] Đang quét danh sách đơn 'Đã xác nhận' trên Server...")
                res = requests.get(f"{self.api_url}/orders?oms_status=CONFIRMED&platform=shopee&shop={shop_name}&limit=5")
                if res.status_code == 200:
                    data = res.json()
                    orders = data.get("data", [])
            except Exception as e:
                self.log(f"❌ Lỗi kết nối Server: {e}")
                return

        if not orders:
            self.log("✅ Không có đơn hàng nào cần xử lý lúc này.")
            return

        # 3. TRUY CẬP TRANG QUẢN LÝ ĐƠN SHOPEE
        target_url = "https://banhang.shopee.vn/portal/sale/order?type=toship&source=all"
        await page.goto(target_url, timeout=60000, wait_until="domcontentloaded")
        await asyncio.sleep(5)

        # Tắt popup cản đường
        try:
            popups = await page.locator("button.eds-button--primary:has-text('Đã hiểu'), button.eds-button--primary:has-text('Later')").all()
            for popup in popups:
                if await popup.is_visible(): await popup.click()
        except: pass

        # --- 🌟 MẮT THẦN ĐA TRÒNG: Bọc thép ô tìm kiếm (Chống lỗi Timeout) ---
        search_input = page.locator(".shopee-input__input, input[placeholder*='Mã'], input[placeholder*='Order'], input[placeholder*='Nhập']").first

        # 4. XỬ LÝ TỪNG ĐƠN HÀNG
        for order in orders:
            order_id = order['order_id']
            self.log(f"------------------------------------")
            self.log(f"[*] Đang xử lý Mã đơn: {order_id}")

            try:
                # Điền mã đơn
                await search_input.wait_for(state="visible", timeout=15000)
                await search_input.fill("")
                await search_input.fill(order_id)
                await page.keyboard.press("Enter")
                await asyncio.sleep(4)

                # ====================================================
                # PHẦN A: KIỂM TRA VÀ BẤM NÚT "CHUẨN BỊ HÀNG"
                # ====================================================
                prep_btn = page.locator("button.eds-button--primary:has-text('Chuẩn bị hàng'), button:has-text('Chuẩn bị hàng')").first
                
                if await prep_btn.is_visible():
                    await prep_btn.click()
                    self.log(f"[+] Đã click 'Chuẩn bị hàng' cho đơn {order_id}!")
                    await asyncio.sleep(2)
                    
                    # Xử lý chọn thời gian lấy hàng nếu Shopee yêu cầu
                    try:
                        time_slot = page.locator("div.hovered").first
                        if await time_slot.is_visible():
                            await time_slot.click()
                            await asyncio.sleep(1)
                    except: pass

                    # Bấm Xác nhận
                    confirm_btn = page.locator("button.eds-button--primary:has-text('Xác nhận'), button:has-text('Xác nhận')").first
                    if await confirm_btn.is_visible():
                        await confirm_btn.click()
                        self.log(f"✅ Đã xác nhận chuẩn bị hàng thành công cho đơn {order_id}!")
                        await asyncio.sleep(4) # Chờ Shopee load lại giao diện thành "In phiếu giao"
                    else:
                        self.log(f"⚠️ Không tìm thấy nút Xác nhận cho đơn {order_id}.")
                else:
                    self.log(f"[i] Đơn {order_id} đã được chuẩn bị từ trước, chuyển thẳng sang bước In Phiếu.")

                # ====================================================
                # PHẦN B: TỰ ĐỘNG TẢI PHIẾU GIAO HÀNG (PDF)
                # ====================================================
                print_btn = page.locator("button:has-text('In phiếu giao')").first
                if await print_btn.is_visible():
                    self.log(f"🖨️ Bắt đầu tải Phiếu Giao Hàng PDF...")
                    
                    # Bắt sự kiện Shopee mở Tab mới chứa file PDF
                    async with page.expect_popup() as new_page_info:
                        await print_btn.click()
                    
                    new_page = await new_page_info.value
                    await new_page.wait_for_load_state("networkidle")
                    await asyncio.sleep(3) # Chờ Shopee render ra mã vạch
                    
                    # Lưu file PDF (CHÚ Ý: Chức năng này bắt buộc phải tick ô 'Chạy ngầm')
                    try:
                        if not os.path.exists("Phieu_In_PDF"):
                            os.makedirs("Phieu_In_PDF")
                        pdf_path = f"Phieu_In_PDF/{order_id}.pdf"
                        
                        # --- BỌC THÉP: DỌN SẠCH GIAO DIỆN RÁC CỦA SHOPEE TRƯỚC KHI IN ---
                        await new_page.evaluate('''() => {
                            let junkSelectors = [
                                'div[class*="right-panel"]', 
                                'div[class*="config-panel"]', 
                                '.shopee-modal__container', 
                                '.shopee-modal__overlay', 
                                'div[class*="modal"]',
                                'header', '.header', '#shopee-top',
                                'div[class*="success"]' // Xóa khung "Phiếu đã được tạo thành công"
                            ];
                            junkSelectors.forEach(sel => {
                                document.querySelectorAll(sel).forEach(el => el.style.display = 'none');
                            });
                            
                            document.body.style.backgroundColor = 'white';
                            
                            // Ép phần tem in full màn hình
                            let preview = document.querySelector('div[class*="left-panel"], div[class*="preview"], .print-content');
                            if (preview) {
                                preview.style.width = '100%';
                                preview.style.position = 'absolute';
                                preview.style.top = '0';
                                preview.style.left = '0';
                                preview.style.transform = 'none';
                            }
                        }''')
                        await asyncio.sleep(1.5) # Chờ giao diện làm phẳng
                        
                        await new_page.emulate_media(media="print")
                        # Ẩn lề rác mặc định của Chrome, đặt tem tràn viền A6
                        await new_page.pdf(path=pdf_path, format="A6", margin={"top": "0", "bottom": "0", "left": "0", "right": "0"}, print_background=True)
                        self.log(f"✅ Đã tải file PDF chuẩn không dính rác tại: {pdf_path}")
                        
                        # --- ĐỒNG BỘ LÊN ĐÁM MÂY (SERVER R2) ---
                        try:
                            self.log(f"☁️ Đang đồng bộ Phiếu in của đơn {order_id} lên Server...")
                            with open(pdf_path, "rb") as f:
                                pdf_bytes = f.read()
                            
                            upload_url = f"{self.api_url}/upload?file=labels/{order_id}.pdf&token=huyvan_secret_2026"
                            up_res = requests.put(upload_url, data=pdf_bytes, headers={"Content-Type": "application/pdf"}, timeout=30)
                            
                            if up_res.status_code == 200:
                                self.log(f"✅ Đã lưu trữ đám mây thành công: {order_id}.pdf")
                            else:
                                self.log(f"⚠️ Lỗi đẩy file lên mây: {up_res.text}")
                        except Exception as e_up:
                            self.log(f"⚠️ Lỗi kết nối khi upload mây: {e_up}")
                            
                    except Exception as pdf_err:
                        self.log(f"⚠️ Chú ý: Không thể tải PDF do bạn đang tắt chế độ 'Chạy ngầm'. Vui lòng tick 'Chạy ngầm' để Auto tải PDF!")
                        
                    await new_page.close()
                    
                    # Bắn API lên Server báo cáo đơn này đã có tem và sẵn sàng Đóng Gói
                    try:
                        res = requests.patch(f"{self.api_url}/orders/{order_id}/oms-status", json={"oms_status": "PACKING"})
                        if res.status_code == 200:
                            self.log(f"🔄 Đã đồng bộ trạng thái về Web thành 'Đang đóng gói'.")
                    except Exception as e:
                        self.log(f"⚠️ Lỗi cập nhật API OMS: {e}")
                else:
                    self.log(f"⚠️ Đơn {order_id} chưa có nút 'In phiếu giao' (Sàn có thể đang duyệt hoặc bị lỗi).")

            except Exception as e:
                self.log(f"❌ Bị kẹt khi xử lý đơn {order_id}: {e}")
                continue

        self.log("[*] Phiên xử lý kết thúc.")