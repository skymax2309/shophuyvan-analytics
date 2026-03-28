import asyncio
import os
from utils import upload_to_r2, trigger_server_import

class LazadaDoanhThu:
    def __init__(self, log_func, auth):
        self.log = log_func
        self.auth = auth

    async def run(self, page, shop, THANG_TAI, NAM):
        self.log(f"Đang xử lý DOANH THU Lazada cho shop: {shop['ten_shop']}")
        
        # Kiểm tra đăng nhập
        if not await self.auth.check_and_login(page, shop):
            return
            
        await page.goto("https://sellercenter.lazada.vn/portal/apps/finance/myIncome/index", wait_until="commit")
        await asyncio.sleep(8)

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
        
        thang_nam = f"Tháng {str(THANG_TAI).zfill(2)} {NAM}"
        folder = os.path.join(shop["thu_muc_luu"], thang_nam)
        if not os.path.exists(folder): os.makedirs(folder)

        async with page.expect_download(timeout=60000) as dl_info:
            await page.evaluate(f'document.querySelector("{js_taive}").click()')
        dl = await dl_info.value
        file_name = f"lazada_{shop['ten_shop']}_doanhthu_{NAM}{str(THANG_TAI).zfill(2)}.pdf"
        full_path = os.path.join(folder, file_name)
        await dl.save_as(full_path)
        self.log(f"🏆 Xong Lazada Doanh Thu tháng {THANG_TAI}")

        if upload_to_r2(full_path, file_name):
            trigger_server_import(file_name, shop['ten_shop'], 'lazada', 'income', full_path)
