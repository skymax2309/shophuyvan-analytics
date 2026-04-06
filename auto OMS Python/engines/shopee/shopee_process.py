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
        
        # 1. KIỂM TRA XEM CÓ LỆNH IN PDF TỪ RADAR TRUYỀN XUỐNG KHÔNG (Đọc giấy nhớ theo Shop)
        temp_file = f"temp_print_jobs_{shop_name}.json"
        if os.path.exists(temp_file):
            try:
                with open(temp_file, "r") as f:
                    order_ids = json.load(f)
                os.remove(temp_file) # Đọc xong xé bỏ giấy nhớ ngay
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
        # BỌC THÉP: Ép Bot vào thẳng Tab "Tất cả" để lôi cổ đơn hàng ra dù nó ở bất kỳ trạng thái nào
        target_url = "https://banhang.shopee.vn/portal/sale/order"
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
                # Điền mã đơn và tìm kiếm (CÓ NHỊP THỞ CHỐNG LAG)
                await search_input.wait_for(state="visible", timeout=15000)
                await search_input.fill("")
                await asyncio.sleep(0.5) # Chờ xíu cho Shopee kịp xóa rác cũ
                
                await search_input.fill(order_id)
                self.log(f"   ⏳ Đang chờ 2s để Shopee nhận diện mã đơn...")
                await asyncio.sleep(2) # Tĩnh tâm 2s theo thiết kế của Kỹ sư trưởng
                
                await page.keyboard.press("Enter")
                await asyncio.sleep(4) # Chờ kết quả hiển thị

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
                        
                        # --- BỌC THÉP: CƯA MÁY 3.0 (CHỜ RENDER IFRAME & DIỆT THANH CUỘN) ---
                        # 1. BẮT BUỘC phải chờ khung iframe tải xong nội dung (Triệt tiêu bệnh Đen Bill)
                        try:
                            await new_page.wait_for_selector('iframe', timeout=10000)
                            frame_element = await new_page.query_selector('iframe')
                            if frame_element:
                                frame = await frame_element.content_frame()
                                if frame:
                                    # Chờ mọi tín hiệu mạng bên trong iframe im ắng
                                    await frame.wait_for_load_state('networkidle', timeout=15000)
                        except: pass
                        await asyncio.sleep(3) # Tĩnh tâm thêm 3 giây để Canvas mã vạch vẽ xong
                        
                        # 2. Xử lý DOM: Giết thanh cuộn từ trong trứng nước
                        await new_page.evaluate('''() => {
                            // Dọn rác UI Shopee
                            document.querySelectorAll('div, section, header').forEach(el => {
                                let txt = el.innerText || '';
                                if ((txt.includes('Xem trước') || txt.includes('thành công') || txt.includes('Tải xuống')) && el.offsetHeight < 300) {
                                    el.style.display = 'none';
                                }
                            });
                            document.querySelectorAll('div[class*="right-panel"], div[class*="config-panel"]').forEach(el => el.style.display = 'none');
                            
                            // Bắt iframe và bóp chết thanh cuộn
                            let preview = document.querySelector('iframe') || document.querySelector('.print-content');
                            if (preview) {
                                preview.style.position = 'fixed';
                                preview.style.top = '0';
                                preview.style.left = '0';
                                preview.style.width = '100vw';
                                preview.style.height = '100vh';
                                preview.style.zIndex = '9999';
                                preview.style.border = 'none';
                                preview.style.background = '#FFFFFF';
                                
                                if (preview.tagName === 'IFRAME') {
                                    preview.setAttribute('scrolling', 'no'); // Khóa cuộn thẻ HTML
                                    try {
                                        // Xuyên thủng vào trong iframe nếu cùng origin
                                        let innerDoc = preview.contentDocument || preview.contentWindow.document;
                                        innerDoc.body.style.overflow = 'hidden';
                                        innerDoc.body.style.background = '#FFFFFF';
                                        let style = innerDoc.createElement('style');
                                        style.innerHTML = '@media print { @page { margin: 0 !important; } } ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; } * { scrollbar-width: none !important; }';
                                        innerDoc.head.appendChild(style);
                                    } catch(e) {}
                                }
                            }

                            // Tiêm thuốc giải cho trang chính
                            let style = document.createElement('style');
                            style.innerHTML = `
                                @media print { 
                                    @page { margin: 0 !important; } 
                                    html, body { margin: 0 !important; padding: 0 !important; background: #FFFFFF !important; }
                                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                                }
                                html, body { overflow: hidden !important; background: #FFFFFF !important; }
                                ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
                                * { scrollbar-width: none !important; }
                            `;
                            document.head.appendChild(style);
                        }''')
                        await asyncio.sleep(2) # Chờ CSS ngấm
                        
                        await new_page.emulate_media(media="print")
                        # Ẩn lề rác mặc định của Chrome, đặt tem tràn viền A6
                        await new_page.pdf(path=pdf_path, format="A6", margin={"top": "0", "bottom": "0", "left": "0", "right": "0"}, print_background=True)
                        self.log(f"✅ Đã tải file PDF ĐÚNG CHUẨN KHÔNG RÁC tại: {pdf_path}")
                        
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