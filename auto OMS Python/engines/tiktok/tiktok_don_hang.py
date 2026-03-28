import asyncio
import os
import calendar
import json
import urllib.request
import datetime
from utils import upload_to_r2, trigger_server_import

class TikTokDonHang:
    def __init__(self, log_func, psr, auth):
        self.log = log_func
        self.psr = psr
        self.auth = auth

    async def run_monthly(self, page, shop, THANG_TAI, NAM):
        self.log(f"Đang xử lý ĐƠN HÀNG TikTok tháng {THANG_TAI}/{NAM}")
        if not await self.auth.check_and_login(page, shop): return
        await page.goto("https://seller-vn.tiktok.com/order?selected_sort=6&tab=all", wait_until="commit")
        await asyncio.sleep(8)
        
        await self._apply_filter(page, THANG_TAI, NAM)
        await self._trigger_export(page)
        await self._wait_and_download(page, shop, f"{shop['ten_shop']}_donhang_{NAM}{str(THANG_TAI).zfill(2)}")

    async def run_by_date(self, page, shop, from_date, to_date):
        self.log(f"📅 TikTok: tải đơn từ {from_date} đến {to_date}")
        if not await self.auth.check_and_login(page, shop): return
        d_from = datetime.datetime.strptime(from_date, "%Y-%m-%d")
        await page.goto("https://seller-vn.tiktok.com/order?selected_sort=6&tab=all", wait_until="commit")
        await asyncio.sleep(8)
        
        await self._apply_filter(page, d_from.month, str(d_from.year), d_from.day, datetime.datetime.strptime(to_date, "%Y-%m-%d").day)
        await self._trigger_export(page)
        await self._wait_and_download(page, shop, f"{shop['ten_shop']}_donhang_{from_date}_{to_date}")

    async def _apply_filter(self, page, month, year, day_start=1, day_end=None):
        if not day_end: day_end = calendar.monthrange(int(year), month)[1]
        try: await page.get_by_text("Bộ lọc", exact=True).first.click(force=True)
        except: pass
        await asyncio.sleep(3)
        await page.locator('.arco-picker-range, .core-picker-range').first.click(force=True)
        await asyncio.sleep(3)
        
        target_month = f"{str(month).zfill(2)}/{year}"
        for _ in range(24):
            if target_month in (await page.locator('.core-picker-header-value').first.inner_text()).replace(" ",""): break
            await page.locator('.core-picker-header').first.locator('svg.arco-icon-left').first.click(force=True)
            await asyncio.sleep(2)

        js_click = '''(args) => {
            const leftPanel = document.querySelectorAll('.core-panel-date-inner, .arco-picker-date-panel')[0];
            const cells = Array.from(leftPanel.querySelectorAll('div[class*="-picker-cell-inner"], div[class*="-picker-date"]'));
            const matches = cells.filter(c => c.innerText.trim() === args.target);
            matches[args.isFirst ? 0 : matches.length-1].click();
        }'''
        await page.evaluate(js_click, {"target": str(day_start).zfill(2), "isFirst": True})
        await asyncio.sleep(2)
        await page.evaluate(js_click, {"target": str(day_end).zfill(2), "isFirst": False})
        await asyncio.sleep(3)
        await page.get_by_text("Áp dụng", exact=True).last.click(force=True)
        await asyncio.sleep(12)

    async def _trigger_export(self, page):
        await page.evaluate('''() => {
            let btn = Array.from(document.querySelectorAll('button, div')).reverse().find(el => el.innerText && el.innerText.trim() === 'Xuất');
            if (btn) btn.click();
        }''')
        await asyncio.sleep(5)
        try: await page.locator('label').filter(has_text="Excel").first.click(force=True)
        except: pass
        await asyncio.sleep(3)
        await page.get_by_text("Xuất", exact=True).last.click(force=True)
        await asyncio.sleep(5)

    async def _wait_and_download(self, page, shop, file_prefix):
        for i in range(120):
            btn = page.locator('a, button, span').filter(has_text="Tải xuống").first
            if await btn.is_visible():
                async with page.expect_download(timeout=60000) as dl_info:
                    await btn.evaluate("node => node.click()")
                dl = await dl_info.value
                if not os.path.exists(shop["thu_muc_luu"]): os.makedirs(shop["thu_muc_luu"])
                file_name = f"{file_prefix}.{dl.suggested_filename.split('.')[-1]}"
                full_path = os.path.join(shop["thu_muc_luu"], file_name)
                self.log(f"📍 ĐƯỜNG DẪN THỰC TẾ ĐANG LƯU FILE: {full_path}")
                await dl.save_as(full_path)
                self.log(f"🏆 Xong đơn hàng: {file_name}")
                if upload_to_r2(full_path, file_name):
                    v2_data = self.psr.parse_tiktok_order_excel_local(full_path, shop['ten_shop'])
                    if v2_data: self._import_to_server(v2_data)
                    trigger_server_import(file_name, shop['ten_shop'], 'tiktok', 'orders')
                break
            await asyncio.sleep(5)

    def _import_to_server(self, data):
        try:
            api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
            req = urllib.request.Request(api_url, data=json.dumps(data).encode('utf-8'), headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'}, method='POST')
            with urllib.request.urlopen(req, timeout=60) as res:
                result = json.loads(res.read().decode())
                self.log(f"✅ Import: {result.get('imported_orders',0)} đơn")
        except Exception as e: self.log(f"⚠️ Lỗi import: {str(e)}")
