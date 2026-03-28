import asyncio
import os
import json
import urllib.request
import calendar
from utils import upload_to_r2, trigger_server_import

class LazadaDonHang:
    def __init__(self, log_func, psr, auth):
        self.log = log_func
        self.psr = psr
        self.auth = auth

    async def run_monthly(self, page, shop, THANG_TAI, NAM):
        self.log(f"Đang xử lý ĐƠN HÀNG Lazada tháng {THANG_TAI}/{NAM}")
        if not await self.auth.check_and_login(page, shop): return
        
        await page.goto("https://sellercenter.lazada.vn/apps/order/list?oldVersion=1&status=all", wait_until="commit")
        await asyncio.sleep(8)

        # Logic chọn ngày tháng như cũ
        last_day = calendar.monthrange(int(NAM), THANG_TAI)[1]
        ngay_bat_dau = f"{NAM}-{str(THANG_TAI).zfill(2)}-01"
        ngay_ket_thuc = f"{NAM}-{str(THANG_TAI).zfill(2)}-{str(last_day).zfill(2)}"
        
        await self._select_date_range(page, ngay_bat_dau, ngay_ket_thuc)
        await self._trigger_export(page)
        await self._wait_and_download(page, shop, f"LAZADA_{shop['ten_shop']}_donhang_{NAM}{str(THANG_TAI).zfill(2)}")

    async def run_by_date(self, page, shop, from_date, to_date):
        self.log(f"📅 Lazada: tải đơn từ {from_date} đến {to_date}")
        if not await self.auth.check_and_login(page, shop): return
        
        await page.goto("https://sellercenter.lazada.vn/apps/order/list?oldVersion=1&status=all", wait_until="commit")
        await asyncio.sleep(8)
        
        await self._select_date_range(page, from_date, to_date)
        await self._trigger_export(page)
        await self._wait_and_download(page, shop, f"LAZADA_{shop['ten_shop']}_donhang_{from_date}_{to_date}")

    async def _select_date_range(self, page, start, end):
        js_tuy_chinh = '#root > section > div.a-l-page-container > div > div.mount-node-container.middle-container-width > div > div > form > div.next-card.next-card-hide-divider > div > div > div > div.expand-body > div:nth-child(1) > div.next-col.next-form-item-control > div > div:nth-child(2) > div > span'
        await page.evaluate(f'document.querySelector("{js_tuy_chinh}").click()')
        await asyncio.sleep(5)
        await page.evaluate('document.querySelector("#createDateRange > div > span:nth-child(1) > input").click()')
        await asyncio.sleep(3)
        inputs = await page.locator("input[placeholder='YYYY-MM-DD']").all()
        if len(inputs) >= 2:
            await inputs[0].fill(start); await inputs[0].press("Enter"); await asyncio.sleep(1)
            await inputs[1].fill(end);   await inputs[1].press("Enter"); await asyncio.sleep(1)
        await page.evaluate('document.querySelector("body > div.next-overlay-wrapper.opened > div > div.next-date-picker-panel-footer > button:nth-child(2) > span").click()')
        await asyncio.sleep(5)

    async def _trigger_export(self, page):
        await page.evaluate('document.querySelector("#order-toolbar-actions-id > div.order-toolbar-actions-left > button > span:nth-child(1)").click()')
        await asyncio.sleep(3)
        await page.get_by_text("Export All").click(force=True)
        await asyncio.sleep(3)
        await page.evaluate('document.querySelector("body > div.next-overlay-wrapper.opened > div.next-overlay-inner.next-dialog-wrapper > div > div > div.next-dialog-footer.next-align-right > button.next-btn.next-medium.next-btn-primary.next-dialog-btn > span").click()')
        await asyncio.sleep(5)

    async def _wait_and_download(self, page, shop, file_prefix):
        btn_tai = page.locator('a:has-text("Tải về Tập Tin"), span:has-text("Tải về Tập Tin")').first
        for _ in range(30):
            if await btn_tai.is_visible():
                async with page.expect_download(timeout=60000) as dl_info:
                    await btn_tai.click(force=True)
                dl = await dl_info.value
                ext = dl.suggested_filename.split(".")[-1]
                file_name = f"{file_prefix}.{ext}"
                full_path = os.path.join(shop["thu_muc_luu"], file_name)
                await dl.save_as(full_path)
                self.log(f"🏆 Xong đơn hàng: {file_name}")
                
                v2_data = self.psr.parse_lazada_excel(full_path, shop['ten_shop'])
                if v2_data:
                    self._import_to_server(v2_data)
                break
            await asyncio.sleep(10)

    def _import_to_server(self, data):
        try:
            api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
            req = urllib.request.Request(api_url, data=json.dumps(data).encode('utf-8'),
                                         headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'},
                                         method='POST')
            with urllib.request.urlopen(req, timeout=60) as res:
                result = json.loads(res.read().decode())
                self.log(f"✅ Import: {result.get('imported_orders',0)} đơn")
        except Exception as e: self.log(f"⚠️ Lỗi import: {str(e)}")
