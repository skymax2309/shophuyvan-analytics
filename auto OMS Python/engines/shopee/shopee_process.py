import asyncio
import requests
import os
import json
import time
import hmac
import hashlib

class ShopeeOrderProcessor:
    def __init__(self, log_callback):
        self.log = log_callback
        self.api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api"
        # Thông tin API Shopee Open Platform
        self.PARTNER_ID = "2013730"
        self.PARTNER_KEY = "shpk66746e4845745341714d6b63656a5a6c7049524b7444486c4a686c4d4a4d"

    # ==========================================
    # CÔNG CỤ API: LẤY TOKEN VÀ CHỮ KÝ SHOPEE
    # ==========================================
    def _get_api_token(self, shop_name):
        try:
            shopee_id_map = { "chihuy2309": 166563639 }
            target = str(shop_name).strip().lower()
            mapped_id = shopee_id_map.get(target, "")
            
            res = requests.get(f"{self.api_url}/shops/tokens", timeout=10)
            if res.status_code == 200:
                for shop in res.json():
                    if shop.get('platform') == 'shopee':
                        db_user = str(shop.get('user_name') or "").strip().lower()
                        db_shop = str(shop.get('shop_name') or "").strip().lower()
                        if target in [db_user, db_shop] or (mapped_id and str(mapped_id) in [db_user, db_shop]):
                            token = shop.get('access_token')
                            if token: return token
        except: pass
        return None

    def _sign_shopee_api(self, path, access_token, shop_id):
        timestamp = int(time.time())
        base_string = f"{self.PARTNER_ID}{path}{timestamp}{access_token}{shop_id}"
        sign = hmac.new(self.PARTNER_KEY.encode('utf-8'), base_string.encode('utf-8'), hashlib.sha256).hexdigest()
        return f"https://partner.shopeemobile.com{path}?partner_id={self.PARTNER_ID}&timestamp={timestamp}&access_token={access_token}&shop_id={shop_id}&sign={sign}"

    # ==========================================
    # NGÃ BA CHUYỂN LUỒNG (ROUTER)
    # ==========================================
    async def process_confirmed_orders(self, page, shop_name):
        token = self._get_api_token(shop_name)
        if token:
            shopee_id_map = { "chihuy2309": 166563639 }
            shop_id = shopee_id_map.get(str(shop_name).strip().lower())
            if shop_id:
                self.log("-------------------------------------------------")
                self.log(f"⚡ [SHOPEE VIP] Shop '{shop_name}' ĐÃ CÓ TOKEN API!")
                self.log("🚀 Kích hoạt luồng Chuẩn bị hàng & In PDF bằng API SIÊU TỐC...")
                return await self.process_by_api(token, shop_id, shop_name)
                
        self.log("-------------------------------------------------")
        self.log(f"🐌 [SHOPEE THƯỜNG] Chạy luồng Đóng gói bằng Trình duyệt Chrome...")
        return await self.process_by_browser(page, shop_name)

    # ==========================================
    # LUỒNG 1: XỬ LÝ BẰNG API SIÊU TỐC
    # ==========================================
    async def process_by_api(self, token, shop_id, shop_name):
        orders = []
        temp_file = f"temp_print_jobs_{shop_name}.json"
        if os.path.exists(temp_file):
            try:
                with open(temp_file, "r") as f: order_ids = json.load(f)
                os.remove(temp_file)
                orders = order_ids
                self.log(f"🎯 [RADAR API] Nhận lệnh Xử lý & In phiếu {len(orders)} đơn.")
            except: pass

        if not orders:
            try:
                res = requests.get(f"{self.api_url}/orders?oms_status=LOGISTICS_REQUEST_CREATED&platform=shopee&shop={shop_name}&limit=5")
                if res.status_code == 200:
                    orders = [o['order_id'] for o in res.json().get("data", [])]
            except: pass

        if not orders:
            self.log("✅ Không có đơn Shopee nào cần xử lý lúc này.")
            return

        for order_id in orders:
            self.log(f"------------------------------------")
            self.log(f"📦 Đang xử lý Đơn bằng API: {order_id}")
            try:
                # 1. API BẤM CHUẨN BỊ HÀNG (Dùng phương thức Gửi hàng tại bưu cục - Dropoff)
                url_ship = self._sign_shopee_api("/api/v2/logistics/ship_order", token, shop_id)
                res_ship = requests.post(url_ship, json={"order_sn": str(order_id), "dropoff": {}}).json()
                
                if res_ship.get("error") and "already" not in str(res_ship.get("message")).lower():
                    self.log(f"   ⚠️ Lỗi Shopee xác nhận đơn: {res_ship.get('message')}")
                else:
                    self.log(f"   ✅ Đã Xác Nhận Chuẩn Bị Hàng thành công trên Shopee!")

                # 2. API YÊU CẦU TẠO FILE PDF
                url_create_doc = self._sign_shopee_api("/api/v2/logistics/create_shipping_document", token, shop_id)
                payload_doc = {
                    "order_list": [{"order_sn": str(order_id)}],
                    "shipping_document_type": "NORMAL_AIR_WAYBILL"
                }
                res_create = requests.post(url_create_doc, json=payload_doc).json()
                
                # 🌟 PHƯƠNG ÁN: Thử lại 3 lần, mỗi lần cách nhau 3 giây để đợi Sàn duyệt mã vạch
                res_pdf = None
                for retry in range(3):
                    self.log(f"   ⏳ Đang đợi sàn duyệt mã vạch (Lần {retry+1}/3)...")
                    await asyncio.sleep(3)
                    
                    url_download = self._sign_shopee_api("/api/v2/logistics/download_shipping_document", token, shop_id)
                    res_pdf = requests.post(url_download, json=payload_doc)
                    
                    if res_pdf.status_code == 200 and b"%PDF" in res_pdf.content[:10]:
                        break # ✅ Đã lấy được PDF, thoát vòng lặp
                
                if res_pdf and res_pdf.status_code == 200 and b"%PDF" in res_pdf.content[:10]:
                    if not os.path.exists("Phieu_In_PDF"): os.makedirs("Phieu_In_PDF")
                    pdf_path = f"Phieu_In_PDF/{order_id}.pdf"
                    with open(pdf_path, "wb") as f:
                        f.write(res_pdf.content)
                    self.log(f"   🖨️ Đã tải PDF gốc siêu nét từ Shopee API!")
                    
                    # 4. Đẩy PDF lên R2 Cloud
                    self.log(f"   ☁️ Đang đồng bộ PDF lên Cloud...")
                    up_res = requests.put(f"{self.api_url}/upload?file=labels/{order_id}.pdf&token=huyvan_secret_2026", data=res_pdf.content, headers={"Content-Type": "application/pdf"})
                    if up_res.status_code == 200:
                        self.log(f"   ✅ Đồng bộ đám mây thành công!")
                        
                    # 5. Cập nhật trạng thái OMS
                    requests.patch(f"{self.api_url}/orders/{order_id}/oms-status", json={"oms_status": "LOGISTICS_PACKAGED"})
                    self.log(f"   🔄 Đã đồng bộ trạng thái về Web thành 'Đã đóng gói'.")
                else:
                    self.log(f"   ❌ Lỗi tải PDF từ API Shopee. Sàn chưa duyệt xong mã vạch.")
                    
            except Exception as e:
                self.log(f"   ❌ Lỗi hệ thống API Đóng gói: {e}")

        self.log("[*] Phiên xử lý API Shopee kết thúc.")

    # ==========================================
    # LUỒNG 2: XỬ LÝ BẰNG TRÌNH DUYỆT (CHROME)
    # ==========================================
    async def process_by_browser(self, page, shop_name):
        # [GIỮ NGUYÊN TOÀN BỘ CODE PLAYWRIGHT CŨ Ở LƯỢT TRƯỚC CỦA BẠN CHÈN VÀO ĐÂY]
        # (Để tiết kiệm không gian, phần logic Playwright cào Web cũ của hàm process_confirmed_orders được chuyển thành process_by_browser. Bạn chỉ cần paste nguyên cụm code cũ của bạn vào hàm này)
        self.log(f"[*] Bắt đầu quy trình CHUẨN BỊ HÀNG bằng Chrome cho shop: {shop_name}")
        orders = []
        temp_file = f"temp_print_jobs_{shop_name}.json"
        if os.path.exists(temp_file):
            try:
                with open(temp_file, "r") as f: orders = [{"order_id": oid} for oid in json.load(f)]
                os.remove(temp_file)
            except: pass

        if not orders:
            try:
                res = requests.get(f"{self.api_url}/orders?oms_status=LOGISTICS_REQUEST_CREATED&platform=shopee&shop={shop_name}&limit=5")
                if res.status_code == 200: orders = res.json().get("data", [])
            except: pass

        if not orders: return
        
        target_url = "https://banhang.shopee.vn/portal/sale/order"
        await page.goto(target_url, timeout=60000, wait_until="domcontentloaded")
        await asyncio.sleep(5)
        
        try:
            popups = await page.locator("button.eds-button--primary:has-text('Đã hiểu'), button.eds-button--primary:has-text('Later')").all()
            for popup in popups:
                if await popup.is_visible(): await popup.click()
        except: pass

        search_input = page.locator(".shopee-input__input, input[placeholder*='Mã'], input[placeholder*='Order']").first
        
        for order in orders:
            order_id = order['order_id']
            self.log(f"[*] Đang xử lý Mã đơn: {order_id}")
            try:
                await search_input.wait_for(state="visible", timeout=15000)
                await search_input.fill("")
                await asyncio.sleep(0.5)
                await search_input.fill(order_id)
                await asyncio.sleep(2)
                await page.keyboard.press("Enter")
                await asyncio.sleep(4)

                prep_btn = page.locator("button.eds-button--primary:has-text('Chuẩn bị hàng'), button:has-text('Chuẩn bị hàng')").first
                if await prep_btn.is_visible():
                    await prep_btn.click()
                    await asyncio.sleep(2)
                    try:
                        time_slot = page.locator("div.hovered").first
                        if await time_slot.is_visible(): await time_slot.click(); await asyncio.sleep(1)
                    except: pass
                    confirm_btn = page.locator("button.eds-button--primary:has-text('Xác nhận'), button:has-text('Xác nhận')").first
                    if await confirm_btn.is_visible():
                        await confirm_btn.click()
                        await asyncio.sleep(4)
                
                print_btn = page.locator("button:has-text('In phiếu giao'), button.eds-button--primary:has-text('In phiếu giao')").first
                await asyncio.sleep(1) 
                if await print_btn.is_visible():
                    async with page.expect_popup() as new_page_info:
                        await print_btn.click()
                    new_page = await new_page_info.value
                    await new_page.wait_for_load_state("networkidle")
                    await asyncio.sleep(3)
                    
                    try:
                        if not os.path.exists("Phieu_In_PDF"): os.makedirs("Phieu_In_PDF")
                        pdf_path = f"Phieu_In_PDF/{order_id}.pdf"
                        
                        try:
                            await new_page.wait_for_selector('iframe', timeout=10000)
                            frame_element = await new_page.query_selector('iframe')
                            if frame_element:
                                frame = await frame_element.content_frame()
                                if frame:
                                    await frame.wait_for_load_state('networkidle', timeout=15000)
                                    await frame.add_style_tag(content="@media print { @page { margin: 0 !important; } } html, body { overflow: hidden !important; background: #FFFFFF !important; margin: 0 !important; padding: 0 !important; } ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; } * { scrollbar-width: none !important; -ms-overflow-style: none !important; }")
                        except: pass
                        await asyncio.sleep(3)
                        
                        await new_page.evaluate('''() => {
                            document.querySelectorAll('div, section, header').forEach(el => {
                                let txt = el.innerText || '';
                                if ((txt.includes('Xem trước') || txt.includes('thành công') || txt.includes('Tải xuống')) && el.offsetHeight < 300) el.style.display = 'none';
                            });
                            document.querySelectorAll('div[class*="right-panel"], div[class*="config-panel"]').forEach(el => el.style.display = 'none');
                            let preview = document.querySelector('iframe') || document.querySelector('.print-content');
                            if (preview) {
                                preview.style.position = 'fixed'; preview.style.top = '0'; preview.style.left = '0';
                                preview.style.width = '100vw'; preview.style.height = '100vh'; preview.style.zIndex = '9999';
                                preview.style.background = '#FFFFFF';
                            }
                            let style = document.createElement('style');
                            style.innerHTML = `@media print { @page { margin: 0 !important; } html, body { margin: 0 !important; padding: 0 !important; background: #FFFFFF !important; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } } html, body { overflow: hidden !important; background: #FFFFFF !important; } ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; } * { scrollbar-width: none !important; }`;
                            document.head.appendChild(style);
                        }''')
                        await asyncio.sleep(2)
                        
                        await new_page.emulate_media(media="print")
                        await new_page.pdf(path=pdf_path, format="A6", margin={"top": "0", "bottom": "0", "left": "0", "right": "0"}, print_background=True)
                        
                        with open(pdf_path, "rb") as f: pdf_bytes = f.read()
                        up_res = requests.put(f"{self.api_url}/upload?file=labels/{order_id}.pdf&token=huyvan_secret_2026", data=pdf_bytes, headers={"Content-Type": "application/pdf"}, timeout=30)
                        
                    except Exception as pdf_err: pass
                    await new_page.close()
                    
                    requests.patch(f"{self.api_url}/orders/{order_id}/oms-status", json={"oms_status": "LOGISTICS_PACKAGED"})
                    self.log(f"🔄 Đã đồng bộ trạng thái về Web thành 'Đã đóng gói'.")
            except Exception as e:
                continue