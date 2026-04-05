import asyncio
import requests
import os
import json

class TikTokOrderProcessor:
    def __init__(self, log_callback):
        self.log = log_callback
        self.api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api"

    async def process_confirmed_orders(self, page, shop_name):
        self.log(f"[*] Bắt đầu quy trình CHUẨN BỊ HÀNG / IN PHIẾU cho TIKTOK shop: {shop_name}")

        orders = []
        temp_file = f"temp_print_jobs_{shop_name}.json"

        # 1. ĐỌC LỆNH TỪ RADAR TRUYỀN XUỐNG
        if os.path.exists(temp_file):
            try:
                with open(temp_file, "r") as f:
                    order_ids = json.load(f)
                os.remove(temp_file)
                orders = [{"order_id": oid} for oid in order_ids]
                self.log(f"🎯 [RADAR TIKTOK] Nhận lệnh Xử lý & In phiếu cho {len(orders)} đơn.")
            except: pass

        if not orders:
            self.log("✅ Không có đơn TikTok nào cần xử lý lúc này.")
            return

        # 2. TRUY CẬP TRANG QUẢN LÝ ĐƠN (Vào thẳng Tab Tất cả)
        target_url = "https://seller-vn.tiktok.com/order?tab=all"
        await page.goto(target_url, timeout=60000, wait_until="networkidle")
        await asyncio.sleep(6)

        # Tắt popup quảng cáo nếu có
        try:
            popups = await page.locator("button:has-text('Đã hiểu'), button:has-text('Đóng'), .TUXModal-close").all()
            for popup in popups:
                if await popup.is_visible(): await popup.click()
        except: pass

        search_input = page.locator("input[placeholder*='ID đơn hàng'], input[placeholder*='Order ID'], .search-input input").first

        # 3. XỬ LÝ TỪNG ĐƠN HÀNG
        for order in orders:
            order_id = order['order_id']
            self.log(f"------------------------------------")
            self.log(f"[*] Đang xử lý Mã đơn TikTok: {order_id}")

            try:
                # Tìm kiếm đơn
                await search_input.wait_for(state="visible", timeout=15000)
                await search_input.fill("")
                await search_input.fill(order_id)
                await page.keyboard.press("Enter")
                await asyncio.sleep(5) # Chờ TikTok tải kết quả

                # ====================================================
                # PHẦN A: BẤM NÚT XÁC NHẬN VƯỢT POPUP (Dựa trên Log AI)
                # ====================================================
                # Case 1: Đơn chưa chuẩn bị -> Bấm "Sắp xếp vận chuyển"
                arrange_btn = page.locator("button:has-text('Sắp xếp vận chuyển'), button:has-text('Sắp xếp vận chuyển và in')").first
                
                # Case 2: Đơn đã chuẩn bị, chỉ cần in -> Bấm "In tài liệu"
                print_direct_btn = page.locator("button:has-text('In tài liệu'), button:has-text('In nhãn'), button:has-text('Print document')").first
                
                new_page = None

                if await arrange_btn.is_visible():
                    self.log(f"[+] Đơn chưa xử lý. Bắt đầu luồng 'Sắp xếp vận chuyển'...")
                    await arrange_btn.click()
                    await asyncio.sleep(3)

                    # Vượt Popup 1: Chọn "In nhãn vận chuyển..."
                    try:
                        print_chk = page.locator("input[type='checkbox']").first
                        if await print_chk.is_visible():
                            if not await print_chk.is_checked():
                                await print_chk.check()
                    except: pass

                    # Vượt Popup 1: Bấm "Tiếp theo"
                    try:
                        next_btn = page.locator("button:has-text('Tiếp theo'), button:has-text('Xác nhận')").last
                        if await next_btn.is_visible():
                            await next_btn.click()
                            await asyncio.sleep(3)
                    except: pass
                    
                    # Vượt Popup 2: Bấm "In nhãn ngay khi vận chuyển" -> Bật Tab mới
                    final_print_btn = page.locator("button:has-text('In nhãn ngay khi vận chuyển'), button:has-text('In')").last
                    if await final_print_btn.is_visible():
                        self.log("🖨️ Đang mở Tab In Phiếu Giao Hàng...")
                        async with page.expect_popup() as new_page_info:
                            await final_print_btn.click()
                        new_page = await new_page_info.value
                    
                elif await print_direct_btn.is_visible():
                    self.log(f"[+] Đơn đã được xác nhận trước đó. Đang bấm 'In tài liệu'...")
                    async with page.expect_popup() as new_page_info:
                        await print_direct_btn.click()
                    new_page = await new_page_info.value
                
                else:
                    self.log(f"⚠️ Không tìm thấy nút thao tác hợp lệ cho đơn {order_id}.")
                    continue

                # ====================================================
                # PHẦN B: TẢI PDF VỚI "CƯA MÁY 3.0" (Khử Nền Đen, Xóa Cuộn)
                # ====================================================
                if new_page:
                    await new_page.wait_for_load_state("domcontentloaded")
                    
                    # BẮT BUỘC chờ iframe tải xong để khỏi bị đen Bill
                    try:
                        await new_page.wait_for_selector('iframe', timeout=10000)
                        frame_element = await new_page.query_selector('iframe')
                        if frame_element:
                            frame = await frame_element.content_frame()
                            if frame:
                                await frame.wait_for_load_state('networkidle', timeout=15000)
                    except: pass
                    await asyncio.sleep(4) # Chờ TikTok vẽ mã vạch

                    if not os.path.exists("Phieu_In_PDF"):
                        os.makedirs("Phieu_In_PDF")
                    pdf_path = f"Phieu_In_PDF/{order_id}.pdf"

                    # Tiêm Thuốc giải CSS 3.0
                    await new_page.evaluate('''() => {
                        // Xóa header rác của TikTok
                        document.querySelectorAll('div, header').forEach(el => {
                            let txt = el.innerText || '';
                            if ((txt.includes('In') || txt.includes('Tải xuống')) && el.offsetHeight < 150) el.style.display = 'none';
                        });
                        
                        let preview = document.querySelector('iframe') || document.querySelector('.pdf-viewer, #print-container, embed');
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
                                preview.setAttribute('scrolling', 'no');
                                try {
                                    let innerDoc = preview.contentDocument || preview.contentWindow.document;
                                    innerDoc.body.style.overflow = 'hidden';
                                    innerDoc.body.style.background = '#FFFFFF';
                                    let style = innerDoc.createElement('style');
                                    style.innerHTML = '@media print { @page { margin: 0 !important; size: A6;} } ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; } * { scrollbar-width: none !important; }';
                                    innerDoc.head.appendChild(style);
                                } catch(e) {}
                            }
                        }

                        let style = document.createElement('style');
                        style.innerHTML = `
                            @media print { 
                                @page { margin: 0 !important; size: A6; } 
                                html, body { margin: 0 !important; padding: 0 !important; background: #FFFFFF !important; }
                                * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                            }
                            html, body { overflow: hidden !important; background: #FFFFFF !important; }
                            ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
                            * { scrollbar-width: none !important; }
                        `;
                        document.head.appendChild(style);
                    }''')
                    await asyncio.sleep(2)
                    
                    try:
                        await new_page.emulate_media(media="print")
                        await new_page.pdf(path=pdf_path, format="A6", margin={"top": "0", "bottom": "0", "left": "0", "right": "0"}, print_background=True)
                        self.log(f"✅ Đã tải PDF TikTok ĐÚNG CHUẨN tại: {pdf_path}")
                        
                        # Upload lên mây
                        self.log(f"☁️ Đang đồng bộ Phiếu in lên Server...")
                        with open(pdf_path, "rb") as f:
                            pdf_bytes = f.read()
                        upload_url = f"{self.api_url}/upload?file=labels/{order_id}.pdf&token=huyvan_secret_2026"
                        up_res = requests.put(upload_url, data=pdf_bytes, headers={"Content-Type": "application/pdf"}, timeout=30)
                        if up_res.status_code == 200:
                            self.log(f"✅ Đã lưu trữ đám mây thành công: {order_id}.pdf")
                    except Exception as pdf_err:
                        self.log(f"⚠️ Lỗi tải PDF (Vui lòng bật 'Chạy ngầm'): {pdf_err}")
                    
                    await new_page.close()

                    # Báo cáo Server cập nhật lên "Đang đóng gói"
                    try:
                        res = requests.patch(f"{self.api_url}/orders/{order_id}/oms-status", json={"oms_status": "PACKING"})
                        if res.status_code == 200:
                            self.log(f"🔄 Đã đồng bộ trạng thái về Web thành 'Đang đóng gói'.")
                    except: pass

            except Exception as e:
                self.log(f"❌ Bị kẹt khi xử lý đơn {order_id}: {e}")
                continue

        self.log("[*] Phiên xử lý TikTok kết thúc.")
