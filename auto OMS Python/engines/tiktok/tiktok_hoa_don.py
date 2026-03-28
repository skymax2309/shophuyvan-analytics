import asyncio
import os
from utils import upload_to_r2, trigger_server_import

class TikTokHoaDon:
    def __init__(self, log_func, auth):
        self.log = log_func
        self.auth = auth

    async def run(self, page, shop, THANG_TAI, NAM):
        self.log(f"Đang xử lý HÓA ĐƠN TikTok tháng {THANG_TAI}/{NAM}")
        
        if not await self.auth.check_and_login(page, shop):
            return
            
        await page.goto("https://seller-vn.tiktok.com/finance/invoice?shop_region=VN", wait_until="commit")
        await asyncio.sleep(8)

        target_period = f"{NAM}-{str(THANG_TAI).zfill(2)}"
        has_next_page = True
        cycle_counts = {}

        while has_next_page:
            await asyncio.sleep(3)
            rows = await page.locator("tr, div.arco-table-tr").all()
            found_in_page = False

            for row in rows:
                try:
                    row_text = await row.inner_text()
                    if target_period in row_text and "Tải xuống" in row_text:
                        found_in_page = True
                        loai_hd = "VanChuyen" if "Tokgistic" in row_text else "ChiPhi"
                        cycle_counts[loai_hd] = cycle_counts.get(loai_hd, 0) + 1
                        btn_tai = row.get_by_text("Tải xuống", exact=True).first
                        async with page.expect_download(timeout=45000) as dl_info:
                            await btn_tai.evaluate("node => node.click()")
                        dl = await dl_info.value
                        file_name = f"{shop['ten_shop']}_hoadon_{loai_hd}_{target_period}_{cycle_counts[loai_hd]}.{dl.suggested_filename.split('.')[-1]}"
                        full_path = os.path.join(shop["thu_muc_luu"], file_name)
                        await dl.save_as(full_path)
                        self.log(f"🏆 Đã lưu: {file_name}")
                        if upload_to_r2(full_path, file_name):
                            trigger_server_import(file_name, shop['ten_shop'], 'tiktok', 'expense')
                        await asyncio.sleep(3)
                except: pass

            btn_next = page.locator('li.arco-pagination-item-next, button.arco-pagination-item-next').first
            try:
                if await btn_next.is_visible() and "disabled" not in str(await btn_next.get_attribute('class')).lower():
                    await btn_next.click(force=True)
                    await asyncio.sleep(5)
                else: has_next_page = False
            except: has_next_page = False

        self.log(f"✅ Xong hóa đơn TikTok tháng {THANG_TAI}/{NAM}")
