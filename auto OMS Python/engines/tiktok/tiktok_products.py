import asyncio
import os
import zipfile
import shutil
from utils import upload_to_r2

try:
    from utils import process_tiktok_excel_and_sync
except:
    pass

class TikTokProducts:
    def __init__(self, log_func, auth):
        self.log = log_func
        self.auth = auth

    async def run(self, page, shop):
        self.log(f"🤖 Bắt đầu tự động tải file Excel Tiktok cho shop: {shop['ten_shop']}")
        if not await self.auth.check_and_login(page, shop): return
        await page.goto("https://seller-vn.tiktok.com/product/batch/edit-prods?entry-from=manage&shop_region=VN", wait_until="commit")
        await asyncio.sleep(8)

        try:
            await page.get_by_text("Tất cả thông tin", exact=True).first.click(force=True)
            await asyncio.sleep(2)
            await page.locator('button:has-text("Chọn các sản phẩm"), button:has-text("Chọn sản phẩm")').first.click(force=True)
            await asyncio.sleep(4)

            while True:
                await page.evaluate('''() => {
                    const wrapper = document.querySelector('th .arco-checkbox');
                    if (wrapper) wrapper.click();
                    else { const cb = document.querySelector('th input[type="checkbox"]'); if(cb) cb.click(); }
                }''')
                await asyncio.sleep(5)
                status = await page.evaluate('''() => {
                    const next = document.querySelector('.arco-pagination-item-next');
                    if (!next || next.classList.contains('arco-pagination-item-disabled')) return "disabled";
                    next.click(); return "clicked";
                }''')
                if status != "clicked": break
                await asyncio.sleep(5)

            await page.locator('button:has-text("Chọn mục đã lọc"), button:has-text("Xác nhận")').first.click(force=True)
            await asyncio.sleep(3)
            await page.locator('button:has-text("Tạo mẫu")').first.click(force=True)
            await asyncio.sleep(5)

            btn_dl = page.locator('button:has-text("Tải xuống")').first
            for _ in range(60):
                if await btn_dl.is_visible() and not await btn_dl.is_disabled(): break
                await asyncio.sleep(3)

            async with page.expect_download(timeout=120000) as dl_info:
                await btn_dl.click(force=True)
            dl = await dl_info.value
            current_dir = os.path.dirname(os.path.abspath(__file__))
            zip_path = os.path.join(current_dir, f"{shop['ten_shop'].replace('/', '_')}_tiktok.zip")
            await dl.save_as(zip_path)
            self.log(f"✅ Đã tải ZIP: {os.path.basename(zip_path)}")

            extract_dir = os.path.join(current_dir, f"{shop['ten_shop'].replace('/', '_')}_extracted")
            if os.path.exists(extract_dir): shutil.rmtree(extract_dir)
            os.makedirs(extract_dir)

            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)

            for file in os.listdir(extract_dir):
                old_path = os.path.join(extract_dir, file)
                new_name = f"{shop['ten_shop'].replace('/', '_')}_{file}"
                new_path = os.path.join(extract_dir, new_name)
                os.rename(old_path, new_path)
                upload_to_r2(new_path, new_name)
                if "template" in new_name.lower() and new_name.endswith('.xlsx'):
                    try: process_tiktok_excel_and_sync(shop['ten_shop'], new_path, self.log)
                    except Exception as e: self.log(f"Lỗi sync: {e}")

            os.remove(zip_path)
            shutil.rmtree(extract_dir)
            self.log("🎉 HOÀN TẤT ĐỒNG BỘ TIKTOK!")
        except Exception as e: self.log(f"❌ Lỗi: {str(e)}")
