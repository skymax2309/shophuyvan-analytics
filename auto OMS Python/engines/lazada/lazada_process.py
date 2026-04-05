import asyncio
import requests
import os
import json

class LazadaOrderProcessor:
    def __init__(self, log_callback):
        self.log = log_callback
        self.api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api"

    async def process_confirmed_orders(self, page, shop_name):
        self.log(f"[*] Bắt đầu quy trình CHUẨN BỊ HÀNG / IN PHIẾU cho LAZADA shop: {shop_name}")

        orders = []
        temp_file = f"temp_print_jobs_{shop_name}.json"
        
        # 1. ĐỌC LỆNH TỪ RADAR TRUYỀN XUỐNG
        if os.path.exists(temp_file):
            try:
                with open(temp_file, "r") as f:
                    order_ids = json.load(f)
                os.remove(temp_file)
                orders = [{"order_id": oid} for oid in order_ids]
                self.log(f"🎯 [RADAR LAZADA] Nhận lệnh Xử lý & In phiếu cho {len(orders)} đơn.")
            except: pass

        if not orders:
            self.log("✅ Không có đơn Lazada nào cần xử lý lúc này.")
            return

        # 2. TRUY CẬP TRANG QUẢN LÝ ĐƠN LAZADA (Vào thẳng Tab Tất cả để dễ tìm)
        target_url = "https://sellercenter.lazada.vn/apps/order/list"
        await page.goto(target_url, timeout=60000, wait_until="networkidle")
        await asyncio.sleep(5)

        # Tắt popup cản đường của Lazada
        try:
            popups = await page.locator("button.next-dialog-close, button:has-text('Đóng'), button.close-btn").all()
            for popup in popups:
                if await popup.is_visible(): await popup.click()
        except: pass

        # Bắt ô tìm kiếm
        search_input = page.locator("input[placeholder*='Mã'], input[placeholder*='Order'], .next-input input").first

        # 3. XỬ LÝ TỪNG ĐƠN HÀNG
        for order in orders:
            order_id = order['order_id']
            self.log(f"------------------------------------")
            self.log(f"[*] Đang xử lý Mã đơn Lazada: {order_id}")

            try:
                # Điền mã đơn và tìm kiếm
                await search_input.wait_for(state="visible", timeout=15000)
                await search_input.fill("")
                await search_input.fill(order_id)
                await page.keyboard.press("Enter")
                await asyncio.sleep(4) # Chờ Lazada lọc đơn

                # ====================================================
                # PHẦN A: BẤM NÚT ĐÓNG GÓI & CHỌN LOẠI PHIẾU (Dựa trên Log AI)
                # ====================================================
                pack_print_btn = page.locator("button:has-text('Đóng gói & In'), button:has-text('In')").first
                
                if await pack_print_btn.is_visible():
                    self.log(f"[+] Đã tìm thấy nút thao tác, tiến hành click...")
                    await pack_print_btn.click()
                    await asyncio.sleep(2)
                    
                    # Chờ Popup hiện lên và chọn "Mã vận đơn"
                    try:
                        # Bắt tag "Mã vận đơn" như log bạn gửi
                        waybill_tag = page.locator("span.next-tag-body:has-text('Mã vận đơn'), span:has-text('Mã vận đơn')").first
                        if await waybill_tag.is_visible():
                            await waybill_tag.click()
                            await asyncio.sleep(1)
                    except: pass

                    # Bấm nút "Chỉ in" (Print)
                    print_confirm_btn = page.locator("button:has-text('Chỉ in'), button:has-text('In')").last
                    
                    # Bắt sự kiện Lazada mở Tab mới chứa file PDF
                    self.log(f"🖨️ Đang mở Tab In Phiếu Giao Hàng...")
                    async with page.expect_popup() as new_page_info:
                        await print_confirm_btn.click()
                    
                    new_page = await new_page_info.value
                else:
                    self.log(f"⚠️ Không tìm thấy nút 'Đóng gói & In' cho đơn {order_id}.")
                    continue

                # ====================================================
                # PHẦN B: TẢI PDF VỚI "CƯA MÁY 3.0" (Xóa đen, Khử cuộn)
                # ====================================================
                await new_page.wait_for_load_state("domcontentloaded")
                
                # BẮT BUỘC chờ iframe tải xong
                try:
                    await new_page.wait_for_selector('iframe', timeout=10000)
                    frame_element = await new_page.query_selector('iframe')
                    if frame_element:
                        frame = await frame_element.content_frame()
                        if frame:
                            await frame.wait_for_load_state('networkidle', timeout=15000)
                except: pass
                await asyncio.sleep(3) 

                if not os.path.exists("Phieu_In_PDF"):
                    os.makedirs("Phieu_In_PDF")
                pdf_path = f"Phieu_In_PDF/{order_id}.pdf"
                
                # CƯA MÁY 3.0: Triệt tiêu thanh cuộn & Ép nền trắng
                await new_page.evaluate('''() => {
                    // Xóa thanh header rác của Lazada
                    document.querySelectorAll('div, section, header').forEach(el => {
                        let txt = el.innerText || '';
                        if (txt.includes('In') && el.offsetHeight < 100) el.style.display = 'none';
                    });
                    
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
                
                # Tải PDF
                try:
                    await new_page.emulate_media(media="print")
                    await new_page.pdf(path=pdf_path, format="A6", margin={"top": "0", "bottom": "0", "left": "0", "right": "0"}, print_background=True)
                    self.log(f"✅ Đã tải PDF Lazada ĐÚNG CHUẨN tại: {pdf_path}")
                    
                    # ĐỒNG BỘ LÊN ĐÁM MÂY
                    self.log(f"☁️ Đang đồng bộ Phiếu in lên Server...")
                    with open(pdf_path, "rb") as f:
                        pdf_bytes = f.read()
                    upload_url = f"{self.api_url}/upload?file=labels/{order_id}.pdf&token=huyvan_secret_2026"
                    up_res = requests.put(upload_url, data=pdf_bytes, headers={"Content-Type": "application/pdf"}, timeout=30)
                    if up_res.status_code == 200:
                        self.log(f"✅ Đã lưu trữ đám mây thành công: {order_id}.pdf")
                        
                except Exception as pdf_err:
                    self.log(f"⚠️ Chú ý: Hãy bật chế độ 'Chạy ngầm' (hoặc đảm bảo tắt Print Preview) để lưu PDF tự động!")
                    
                await new_page.close()
                
                # CẬP NHẬT TRẠNG THÁI SERVER LÊN "ĐANG ĐÓNG GÓI"
                try:
                    res = requests.patch(f"{self.api_url}/orders/{order_id}/oms-status", json={"oms_status": "PACKING"})
                    if res.status_code == 200:
                        self.log(f"🔄 Đã đồng bộ trạng thái về Web thành 'Đang đóng gói'.")
                except Exception as e:
                    pass

            except Exception as e:
                self.log(f"❌ Bị kẹt khi xử lý đơn {order_id}: {e}")
                continue

        self.log("[*] Phiên xử lý Lazada kết thúc.")
