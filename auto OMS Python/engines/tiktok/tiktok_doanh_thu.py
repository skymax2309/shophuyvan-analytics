import asyncio
import os
import calendar
import json
import urllib.request
from utils import upload_to_r2, trigger_server_import

class TikTokDoanhThu:
    def __init__(self, log_func, psr, auth):
        self.log = log_func
        self.psr = psr
        self.auth = auth

    async def run(self, page, shop, THANG_TAI, NAM):
        self.log(f"Đang xử lý DOANH THU TikTok tháng {THANG_TAI}/{NAM}")
        
        if not await self.auth.check_and_login(page, shop):
            return
            
        await page.goto("https://seller-vn.tiktok.com/finance/transactions?shop_region=VN&tab=settled_tab", wait_until="commit")
        await asyncio.sleep(8)
    
        try:
            await page.evaluate('document.querySelector("#core-tabs-0-panel-0 > div > div.space-y-16 > div.flex.flex-col.space-y-16 > div:nth-child(1) > div.w-200.h-32 > div > div > div.text-base.font-semibold.cursor-pointer.select-none.bg-\\[\\#ECECED\\].text-\\[\\#171718\\].rounded.py-6.px-12.hover\\:bg-gray-200.flex.items-center").click()')
        except:
            await page.get_by_text("Xuất", exact=True).first.click(force=True)
        await asyncio.sleep(5)
    
        try:
            await page.get_by_text("Thời gian bắt đầu").first.click(force=True)
        except:
            await page.locator('div').filter(has_text="Thời gian bắt đầu").last.click(force=True)
        await asyncio.sleep(5)
    
        target_month_text = f"{str(THANG_TAI).zfill(2)}/{NAM}"
        for _ in range(24):
            current_month_text = await page.locator('.core-picker-header-value').first.inner_text()
            if target_month_text in current_month_text.replace(" ", ""):
                break
            await page.locator('.core-picker-header').first.locator('svg.arco-icon-left').first.click(force=True)
            await asyncio.sleep(2)
    
        last_day = calendar.monthrange(int(NAM), THANG_TAI)[1]
        js_click_exact = '''(args) => {
            const leftPanel = document.querySelectorAll('.core-panel-date-inner, .arco-picker-date-panel')[0];
            const cells = Array.from(leftPanel.querySelectorAll('div[class*="-picker-cell-inner"], div[class*="-picker-date"]'));
            const matchingCells = cells.filter(c => c.innerText.trim() === args.targetText);
            const targetCell = args.isFirst ? matchingCells[0] : matchingCells[matchingCells.length - 1];
            targetCell.click(); return "OK";
        }'''
        await page.evaluate(js_click_exact, {"targetText": "01", "isFirst": True})
        await asyncio.sleep(2)
        await page.evaluate(js_click_exact, {"targetText": str(last_day).zfill(2), "isFirst": False})
        await asyncio.sleep(5)
    
        await page.locator('button:has-text("OK")').click(force=True)
        await asyncio.sleep(5)
        await page.locator('button:has-text("Xuất")').last.click(force=True)
        await asyncio.sleep(5)
    
        js_tai = 'body > div:nth-child(9) > span > div.core-popover-content.core-popover-content-br > div > div > div > div > div > div.sc-jeCNp.wuZek.w-full.overflow-x-hidden.overflow-y-auto > div:nth-child(1) > div.flex.items-center.px-24.py-16 > div.relative.ml-auto > button > span'
        for i in range(120):
            try:
                btn_tai = page.locator('button:has-text("Tải xuống"), span:has-text("Tải xuống")').first
                if await btn_tai.is_visible() and not await btn_tai.is_disabled():
                    async with page.expect_download(timeout=30000) as dl_info:
                        try: await page.evaluate(f'document.querySelector("{js_tai}").click()')
                        except: await btn_tai.click(force=True)
                    dl = await dl_info.value
                    thang_nam = f"Tháng {str(THANG_TAI).zfill(2)} {NAM}"
                    folder = os.path.join(shop["thu_muc_luu"], thang_nam)
                    if not os.path.exists(folder): os.makedirs(folder)
                    file_name = f"tiktok_{shop['ten_shop']}_doanhthu_{NAM}{str(THANG_TAI).zfill(2)}.{dl.suggested_filename.split('.')[-1]}"
                    full_path = os.path.join(folder, file_name)
                    await dl.save_as(full_path)
                    self.log(f"🏆 Xong Doanh Thu TikTok tháng {THANG_TAI}")
                    if upload_to_r2(full_path, file_name):
                        parsed = self.psr.parse_tiktok_excel(full_path)
                        if parsed:
                            self._trigger_import(file_name, shop['ten_shop'], parsed)
                        else:
                            trigger_server_import(file_name, shop['ten_shop'], 'tiktok', 'income')
                    break
            except: pass
            await asyncio.sleep(5)

    def _trigger_import(self, file_name, shop_name, parsed_data):
        try:
            url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/auto-import-trigger"
            data = json.dumps({"file_key": file_name, "shop": shop_name, "platform": "tiktok", "report_type": "income", "parsed_json": json.dumps(parsed_data)}).encode('utf-8')
            req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'}, method='POST')
            with urllib.request.urlopen(req, timeout=60) as res:
                result = json.loads(res.read().decode())
                self.log(f"✅ Upload TikTok: {result.get('status')}")
        except Exception as e: self.log(f"⚠️ Lỗi import: {str(e)}")
