import asyncio
import os
import json
import urllib.request
from utils import upload_to_r2, trigger_server_import

class ShopeeDonHang:
    def __init__(self, log_func, psr, auth):
        self.log = log_func
        self.psr = psr
        self.auth = auth

    async def xu_ly_don_hang(self, page, shop, THANG_TAI, NAM):
        self.log(f"Đang xử lý ĐƠN HÀNG cho shop: {shop['ten_shop']}")
        await page.goto("https://banhang.shopee.vn/portal/sale/order", wait_until="commit")
        await asyncio.sleep(10)
        # Dọn popup
        await page.evaluate('() => { document.querySelectorAll(".close-icon, div[class*=\'close-icon\'] i").forEach(i => i.click()) }')
        await asyncio.sleep(5)
        # Click Xuất
        await page.evaluate('() => { const b = Array.from(document.querySelectorAll("button")).find(x => x.innerText.includes("Xuất") && !x.innerText.includes("Lịch sử")); if(b) b.click() }')
        await asyncio.sleep(10)
        # Chọn lịch & Chốt ngày
        try:
            await page.locator(".eds-modal__body .eds-date-picker__input, .export-modal .eds-selector__inner").first.click(force=True)
        except:
            await page.evaluate('() => { const el = document.querySelector(".eds-modal__body .eds-date-picker__input, .export-modal .eds-selector__inner"); if(el) el.click() }')
        await asyncio.sleep(5)
        await page.evaluate('document.querySelector("body > div.eds-popper-container > div > div.eds-daterange-picker-panel > div > div.eds-daterange-picker-panel__body-left > div > div.eds-picker-header > span:nth-child(3)").click()')
        await asyncio.sleep(5)
        await page.locator(f".eds-month-table__col:has-text('Tháng {THANG_TAI}')").first.click(force=True)
        await asyncio.sleep(5)
        days = await page.query_selector_all('.eds-date-table__cell-inner.normal:not(.disabled)')
        if days:
            await days[0].click(force=True); await asyncio.sleep(2); await days[-1].click(force=True)
        await asyncio.sleep(10)
        # Bấm nút Xuất cam & Tải về
        await page.evaluate('() => { const s = Array.from(document.querySelectorAll(".eds-modal__footer button, .export-modal button")).find(x => x.innerText.includes("Xuất")); if(s) s.click() }')
        await asyncio.sleep(10)
        self.log("⏳ Chờ Shopee xử lý file đơn hàng (tối đa 10 phút)...")
        for i in range(60):
            await asyncio.sleep(10)
            dang_xu_ly = await page.get_by_text("Đang được xử lý").is_visible()
            if dang_xu_ly:
                self.log(f"⏳ Shopee đang xử lý... ({(i+1)*10}s)")
                continue

            btn = page.get_by_role("button", name="Tải về").first
            if await btn.is_visible():
                async with page.expect_download(timeout=120000) as dl_info:
                    await btn.click(force=True)
                dl = await dl_info.value
                folder = os.path.join(shop["thu_muc_luu"], f"Tháng {str(THANG_TAI).zfill(2)} {NAM}")
                if not os.path.exists(folder):
                    os.makedirs(folder)
                file_name = f"{shop['ten_shop'].replace('_DoanhThu','')}_shopee_donhang_{NAM}{str(THANG_TAI).zfill(2)}.xlsx"
                full_path = os.path.join(folder, file_name)
                await dl.save_as(full_path)
                self.log("🏆 Xong Đơn hàng")

                if upload_to_r2(full_path, file_name):
                    v2_data = self.psr.parse_shopee_excel(full_path, shop['ten_shop'])
                    if v2_data:
                        try:
                            import json, urllib.request
                            api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                            data = json.dumps(v2_data).encode('utf-8')
                            headers = {'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'}
                            req = urllib.request.Request(api_url, data=data, headers=headers, method='POST')
                            with urllib.request.urlopen(req, timeout=60) as res:
                                result = json.loads(res.read().decode())
                                self.log(f"✅ Import đơn hàng: {result.get('imported_orders', 0)} đơn, {result.get('imported_items', 0)} items")
                        except Exception as e:
                            self.log(f"⚠️ Lỗi import đơn hàng V2: {str(e)}")
                    trigger_server_import(file_name, shop['ten_shop'], 'shopee', 'orders')

                await asyncio.sleep(5)
                break
            else:
                self.log(f"⏳ Chưa thấy nút Tải về, thử lại... ({(i+1)*10}s)")

    async def shopee_xu_ly_don_hang_ngay(self, page, shop, from_date, to_date):
        """Tải đơn hàng Shopee — bấm Xuất rồi tải file mới nhất"""
        self.log(f"📅 Shopee: tải đơn từ {from_date} đến {to_date}")
        await page.goto("https://banhang.shopee.vn/portal/sale/order", wait_until="commit")
        await asyncio.sleep(10)

        await page.evaluate('() => { document.querySelectorAll(".close-icon, div[class*=\'close-icon\'] i").forEach(i => i.click()) }')
        await asyncio.sleep(3)

        await page.evaluate('''() => {
            const b = Array.from(document.querySelectorAll("button"))
                .find(x => x.innerText.trim() === "Xuất");
            if(b) b.click()
        }''')
        await asyncio.sleep(5)

        try:
            btn_xuat_modal = page.locator('button:has-text("Xuất")').last
            await btn_xuat_modal.wait_for(state="visible", timeout=10000)
            await btn_xuat_modal.click(force=True)
            self.log("✅ Đã bấm Xuất trong modal")
        except Exception as e:
            self.log(f"⚠️ Không bấm được Xuất trong modal: {e}")
            return
        await asyncio.sleep(5)

        self.log("⏳ Chờ Shopee xử lý file (tối đa 10 phút)...")
        da_tai = False
        for i in range(60):
            await asyncio.sleep(10)

            dang_xu_ly = await page.get_by_text("Đang được xử lý").is_visible()
            if dang_xu_ly:
                self.log(f"⏳ Shopee đang xử lý... ({(i+1)*10}s)")
                continue

            btn_tai = page.get_by_role("button", name="Tải về").first
            if await btn_tai.is_visible():
                async with page.expect_download(timeout=120000) as dl_info:
                    await btn_tai.click(force=True)
                dl = await dl_info.value
                folder = shop["thu_muc_luu"]
                if not os.path.exists(folder):
                    os.makedirs(folder)
                file_name = f"{shop['ten_shop']}_shopee_donhang_{from_date}_{to_date}.xlsx"
                full_path = os.path.join(folder, file_name)
                await dl.save_as(full_path)
                self.log(f"🏆 Xong đơn hàng Shopee {from_date} → {to_date}")

                v2_data = self.psr.parse_shopee_excel(full_path, shop['ten_shop'])
                if v2_data:
                    try:
                        import json, urllib.request
                        api_url2 = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                        data = json.dumps(v2_data).encode('utf-8')
                        req = urllib.request.Request(api_url2, data=data,
                            headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'},
                            method='POST')
                        with urllib.request.urlopen(req, timeout=60) as res:
                            result = json.loads(res.read().decode())
                            self.log(f"✅ Import Shopee: {result.get('imported_orders',0)} đơn, {result.get('imported_items',0)} items")
                    except Exception as e:
                        self.log(f"⚠️ Lỗi import Shopee V2: {str(e)}")
                da_tai = True
                break
            else:
                self.log(f"⏳ Chưa thấy nút Tải về... ({(i+1)*10}s)")

        if not da_tai:
            self.log("❌ Quá thời gian chờ, không tải được file Shopee")
