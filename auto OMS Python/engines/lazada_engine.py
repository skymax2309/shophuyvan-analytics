import asyncio
import os
from utils import upload_to_r2, trigger_server_import, extract_pdf_text

class LazadaEngine:
    def __init__(self, log_func, psr):
        self.psr = psr

    async def ensure_login(self, page, shop):
        await page.goto("https://sellercenter.lazada.vn/portal/apps/finance/myIncome/index", wait_until="commit")
        await asyncio.sleep(6)
        if "login" not in page.url and not await page.locator('input[placeholder*="Số điện thoại"]').is_visible():
            return True
        try:
            tk_loc = page.locator('input[placeholder*="Số điện thoại"], input[placeholder*="Email"]').first
            await tk_loc.fill(shop.get("email_login", ""))
            await page.locator('input[type="password"]').first.fill(shop["mat_khau"])
            await page.locator('button:has-text("Đăng nhập")').first.click(force=True)
            await asyncio.sleep(8)
            return "login" not in page.url
        except: return False

    async def lazada_xu_ly_doanh_thu(self, page, shop, THANG_TAI, NAM):
        import calendar
        self.log(f"Đang xử lý DOANH THU Lazada cho shop: {shop['ten_shop']}")
        await page.goto("https://sellercenter.lazada.vn/portal/apps/finance/myIncome/index", wait_until="commit")
        await asyncio.sleep(8)

        # Đăng nhập nếu cần
        if "login" in page.url or await page.locator('input[placeholder*="Số điện thoại"]').is_visible():
            self.log("Đang đăng nhập Lazada...")
            tk_loc = page.locator('input[placeholder*="Số điện thoại"]').first
            await tk_loc.wait_for(state="visible", timeout=15000)
            await tk_loc.fill(shop.get("email_login", ""))
            await asyncio.sleep(1)
            mk_loc = page.locator('input[placeholder*="Mật khẩu"], input[type="password"]').first
            await mk_loc.fill(shop["mat_khau"])
            await asyncio.sleep(1)
            await page.locator('button:has-text("Đăng nhập")').first.click(force=True)
            await asyncio.sleep(10)

        # Đảm bảo đã đăng nhập
        await self.lazada_ensure_login(page, shop)

        # Click Sao kê tháng
        await page.get_by_text("Sao kê tháng").last.click(force=True)
        await asyncio.sleep(5)

        # Tìm tháng và tải
        m_e = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        target_m = m_e[THANG_TAI - 1]
        row = page.locator("div").filter(has_text=target_m).filter(has_text="Tải xuống").last
        await row.get_by_text("Tải xuống").click(force=True)
        await asyncio.sleep(5)

        await page.get_by_text("Tổng quan giao dịch (pdf)").first.click(force=True)
        await asyncio.sleep(5)

        js_taive = 'body > div.next-overlay-wrapper.opened > div.next-overlay-inner.next-dialog-wrapper > div > div > div.next-dialog-body > div > div.sc-jXbUNg.SfdHU > div > table > tbody > tr.next-table-row.first > td.next-table-cell.last > div > div > div'
        folder = shop["thu_muc_luu"]
        if not os.path.exists(folder): os.makedirs(folder)

        async with page.expect_download(timeout=60000) as dl_info:
            await page.evaluate(f'document.querySelector("{js_taive}").click()')
        dl = await dl_info.value
        file_name = f"LAZADA_{shop['ten_shop']}_{NAM}{str(THANG_TAI).zfill(2)}_doanh-thu.pdf"
        full_path = os.path.join(folder, file_name)
        await dl.save_as(full_path)
        self.log(f"🏆 Xong Lazada Doanh Thu tháng {THANG_TAI}")

        if upload_to_r2(full_path, file_name):
            trigger_server_import(file_name, shop['ten_shop'], 'lazada', 'income', full_path)
        
    async def lazada_xu_ly_hoa_don(self, page, shop, THANG_TAI, NAM):
        self.log(f"Đang xử lý HÓA ĐƠN Lazada tháng {THANG_TAI}/{NAM}")
        await page.goto("https://sellercenter.lazada.vn/portal/apps/finance/myIncome/index", wait_until="commit")
        await asyncio.sleep(8)
        await self.lazada_ensure_login(page, shop)
        await page.locator('div.next-tabs-tab-inner:has-text("Hóa đơn")').last.click(force=True)
        await asyncio.sleep(5)

        m_e = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        target_str = f"{m_e[THANG_TAI - 1]} {NAM}"
        has_next_page = True
        empty_pages_count = 0
        cycle_counts = {}

        while has_next_page:
            await asyncio.sleep(3)
            rows = await page.locator("tr.next-table-row").all()
            found_in_current_page = False

            for row in rows:
                try:
                    chu_ky_loc = row.locator("td.next-table-cell.first")
                    if not await chu_ky_loc.is_visible(): continue
                    chu_ky_text = await chu_ky_loc.inner_text()
                    if target_str not in chu_ky_text: continue

                    found_in_current_page = True
                    empty_pages_count = 0
                    safe_chu_ky = chu_ky_text.replace("/","-").replace(":","-").replace("\n","").strip()
                    cycle_counts[safe_chu_ky] = cycle_counts.get(safe_chu_ky, 0) + 1
                    file_name = f"LAZADA_{shop['ten_shop']}_{safe_chu_ky}_{cycle_counts[safe_chu_ky]}.pdf"

                    btn_tai = row.locator("td.next-table-cell.last").get_by_text("Tải xuống")
                    if await btn_tai.is_visible():
                        async with page.expect_download(timeout=60000) as dl_info:
                            await btn_tai.click(force=True)
                        dl = await dl_info.value
                        full_path = os.path.join(shop["thu_muc_luu"], file_name)
                        await dl.save_as(full_path)
                        self.log(f"🏆 Đã lưu hóa đơn: {file_name}")

                        # Phân loại ADS vs Chi Phí bằng cách đọc nội dung PDF
                        pdf_text = self.extract_pdf_text(full_path)
                        is_ads = any(k in pdf_text for k in [
                            "Tài Trợ Hiển Thị", "Tài trợ Hiển Thị",
                            "Sponsored", "tài trợ hiển thị"
                        ])
                        lazada_rtype = "phi-dau-thau" if is_ads else "expense"
                        self.log(f"📋 Phân loại: {'Quảng Cáo ADS' if is_ads else 'Chi Phí'}")

                        if upload_to_r2(full_path, file_name):
                            trigger_server_import(file_name, shop['ten_shop'], 'lazada', lazada_rtype, full_path)
                        await asyncio.sleep(2)
                except:
                    pass

            if not found_in_current_page:
                empty_pages_count += 1
            if empty_pages_count >= 2:
                break

            btn_next = page.locator('button.next-next, button:has-text("Tiếp theo")').last
            if await btn_next.is_visible() and not await btn_next.is_disabled():
                await btn_next.click(force=True)
                await asyncio.sleep(5)
            else:
                has_next_page = False

        self.log(f"✅ Xong hóa đơn Lazada tháng {THANG_TAI}/{NAM}")

    async def lazada_xu_ly_don_hang(self, page, shop, THANG_TAI, NAM):
        import calendar
        self.log(f"Đang xử lý ĐƠN HÀNG Lazada tháng {THANG_TAI}/{NAM}")
        await self.lazada_ensure_login(page, shop)
        await page.goto("https://sellercenter.lazada.vn/apps/order/list?oldVersion=1&status=all", wait_until="commit")
        await asyncio.sleep(8)

        js_tuy_chinh = '#root > section > div.a-l-page-container > div > div.mount-node-container.middle-container-width > div > div > form > div.next-card.next-card-hide-divider > div > div > div > div.expand-body > div:nth-child(1) > div.next-col.next-form-item-control > div > div:nth-child(2) > div > span'
        await page.evaluate(f'document.querySelector("{js_tuy_chinh}").click()')
        await asyncio.sleep(5)

        js_input_ngay = '#createDateRange > div > span:nth-child(1) > input'
        await page.evaluate(f'document.querySelector("{js_input_ngay}").click()')
        await asyncio.sleep(3)

        last_day = calendar.monthrange(int(NAM), THANG_TAI)[1]
        ngay_bat_dau = f"{NAM}-{str(THANG_TAI).zfill(2)}-01"
        ngay_ket_thuc = f"{NAM}-{str(THANG_TAI).zfill(2)}-{str(last_day).zfill(2)}"

        inputs = await page.locator("input[placeholder='YYYY-MM-DD']").all()
        if len(inputs) >= 2:
            await inputs[0].fill(ngay_bat_dau); await inputs[0].press("Enter"); await asyncio.sleep(1)
            await inputs[1].fill(ngay_ket_thuc); await inputs[1].press("Enter"); await asyncio.sleep(1)

        await page.evaluate('''() => {
            document.querySelectorAll("input[placeholder='HH:mm:ss']").forEach(el => {
                el.removeAttribute('disabled'); el.removeAttribute('aria-disabled');
            });
        }''')
        time_inputs = await page.locator("input[placeholder='HH:mm:ss']").all()
        if len(time_inputs) >= 2:
            await time_inputs[0].fill("00:00:00"); await time_inputs[0].press("Enter"); await asyncio.sleep(1)
            await time_inputs[1].fill("23:59:59"); await time_inputs[1].press("Enter"); await asyncio.sleep(1)

        await asyncio.sleep(5)
        js_ok_ngay = 'body > div.next-overlay-wrapper.opened > div > div.next-date-picker-panel-footer > button:nth-child(2) > span'
        await page.evaluate(f'document.querySelector("{js_ok_ngay}").click()')
        await asyncio.sleep(5)

        js_xuat = '#order-toolbar-actions-id > div.order-toolbar-actions-left > button > span:nth-child(1)'
        await page.evaluate(f'document.querySelector("{js_xuat}").click()')
        await asyncio.sleep(3)
        await page.get_by_text("Export All").click(force=True)
        await asyncio.sleep(3)

        js_ok_export = 'body > div.next-overlay-wrapper.opened > div.next-overlay-inner.next-dialog-wrapper > div > div > div.next-dialog-footer.next-align-right > button.next-btn.next-medium.next-btn-primary.next-dialog-btn > span'
        await page.evaluate(f'document.querySelector("{js_ok_export}").click()')
        await asyncio.sleep(5)

        self.log("⏳ Chờ Lazada xuất file đơn hàng (tối đa 5 phút)...")
        btn_tai_ve = page.locator('a:has-text("Tải về Tập Tin"), span:has-text("Tải về Tập Tin")').first
        da_xuat = False
        for _ in range(30):
            if await btn_tai_ve.is_visible() or await page.get_by_text("Các nhiệm vụ chạy thành công!").is_visible():
                da_xuat = True
                break
            await asyncio.sleep(10)
            self.log("... Vẫn đang xuất, vui lòng đợi ...")

        if da_xuat:
            await asyncio.sleep(5)
            async with page.expect_download(timeout=60000) as dl_info:
                await page.locator('text="Tải về Tập Tin"').first.click(force=True)
            dl = await dl_info.value
            ext = dl.suggested_filename.split(".")[-1]
            file_name = f"LAZADA_{shop['ten_shop']}_donhang_{NAM}{str(THANG_TAI).zfill(2)}.{ext}"
            full_path = os.path.join(shop["thu_muc_luu"], file_name)
            await dl.save_as(full_path)
            self.log(f"🏆 Xong đơn hàng Lazada: {file_name}")
            if upload_to_r2(full_path, file_name):
                v2_data = self.psr.parse_lazada_excel(full_path, shop['ten_shop'])
                if v2_data:
                    try:
                        api_url2 = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                        data = json.dumps(v2_data).encode('utf-8')
                        req = urllib.request.Request(api_url2, data=data,
                            headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'},
                            method='POST')
                        with urllib.request.urlopen(req, timeout=60) as res:
                            result = json.loads(res.read().decode())
                            self.log(f"✅ Import Lazada: {result.get('imported_orders',0)} đơn, {result.get('imported_items',0)} items")
                    except Exception as e:
                        self.log(f"⚠️ Lỗi import Lazada V2: {str(e)}")
                trigger_server_import(file_name, shop['ten_shop'], 'lazada', 'orders')
        else:
            self.log("❌ Quá thời gian chờ xuất đơn hàng Lazada!")
            
    async def lazada_xu_ly_don_hang_ngay(self, page, shop, from_date, to_date):
        """Tải đơn hàng Lazada theo khoảng ngày cụ thể"""
        self.log(f"📅 Lazada: tải đơn từ {from_date} đến {to_date}")
        await self.lazada_ensure_login(page, shop)
        await page.goto("https://sellercenter.lazada.vn/apps/order/list?oldVersion=1&status=all", wait_until="commit")
        await asyncio.sleep(8)
        js_tuy_chinh = '#root > section > div.a-l-page-container > div > div.mount-node-container.middle-container-width > div > div > form > div.next-card.next-card-hide-divider > div > div > div > div.expand-body > div:nth-child(1) > div.next-col.next-form-item-control > div > div:nth-child(2) > div > span'
        await page.evaluate(f'document.querySelector("{js_tuy_chinh}").click()')
        await asyncio.sleep(5)
        js_input_ngay = '#createDateRange > div > span:nth-child(1) > input'
        await page.evaluate(f'document.querySelector("{js_input_ngay}").click()')
        await asyncio.sleep(3)
        inputs = await page.locator("input[placeholder='YYYY-MM-DD']").all()
        if len(inputs) >= 2:
            await inputs[0].fill(from_date); await inputs[0].press("Enter"); await asyncio.sleep(1)
            await inputs[1].fill(to_date);   await inputs[1].press("Enter"); await asyncio.sleep(1)
        await asyncio.sleep(5)
        js_ok = 'body > div.next-overlay-wrapper.opened > div > div.next-date-picker-panel-footer > button:nth-child(2) > span'
        await page.evaluate(f'document.querySelector("{js_ok}").click()')
        await asyncio.sleep(5)
        js_xuat = '#order-toolbar-actions-id > div.order-toolbar-actions-left > button > span:nth-child(1)'
        await page.evaluate(f'document.querySelector("{js_xuat}").click()')
        await asyncio.sleep(3)
        await page.get_by_text("Export All").click(force=True)
        await asyncio.sleep(3)
        js_ok_export = 'body > div.next-overlay-wrapper.opened > div.next-overlay-inner.next-dialog-wrapper > div > div > div.next-dialog-footer.next-align-right > button.next-btn.next-medium.next-btn-primary.next-dialog-btn > span'
        await page.evaluate(f'document.querySelector("{js_ok_export}").click()')
        await asyncio.sleep(5)
        for _ in range(30):
            if await page.locator('a:has-text("Tải về Tập Tin")').first.is_visible():
                async with page.expect_download(timeout=60000) as dl_info:
                    await page.locator('text="Tải về Tập Tin"').first.click(force=True)
                dl = await dl_info.value
                ext = dl.suggested_filename.split(".")[-1]
                file_name = f"LAZADA_{shop['ten_shop']}_donhang_{from_date}_{to_date}.{ext}"
                full_path = os.path.join(shop["thu_muc_luu"], file_name)
                await dl.save_as(full_path)
                self.log(f"🏆 Xong đơn hàng Lazada {from_date} → {to_date}")
                # Đơn hàng ngày: chỉ import vào orders_v2, không upload báo cáo
                v2_data = self.psr.parse_lazada_excel(full_path, shop['ten_shop'])
                if v2_data:
                    try:
                        api_url2 = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                        data = json.dumps(v2_data).encode('utf-8')
                        req = urllib.request.Request(api_url2, data=data,
                            headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'},
                            method='POST')
                        with urllib.request.urlopen(req, timeout=60) as res:
                            result = json.loads(res.read().decode())
                            self.log(f"✅ Import Lazada: {result.get('imported_orders',0)} đơn, {result.get('imported_items',0)} items")
                    except Exception as e:
                        self.log(f"⚠️ Lỗi import Lazada V2: {str(e)}")
                break
            await asyncio.sleep(10)
            
    