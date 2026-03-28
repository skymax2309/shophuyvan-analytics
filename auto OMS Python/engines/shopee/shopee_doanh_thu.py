import asyncio
import os
from utils import upload_to_r2, trigger_server_import

class ShopeeDoanhThu:
    def __init__(self, log_func, auth):
        self.log = log_func
        self.auth = auth

    async def xu_ly_doanh_thu(self, page, shop, THANG_TAI, NAM):
        self.log(f"Đang xử lý DOANH THU cho shop: {shop['ten_shop']}")
        await page.goto("https://banhang.shopee.vn/portal/finance/income/statement", wait_until="commit")
        await asyncio.sleep(10)
        # Tự nhập mật khẩu
        pass_input = await page.query_selector('input[type="password"]')
        if pass_input:
            await page.fill('input[type="password"]', shop["mat_khau"])
            await page.click("button.eds-button--primary.action")
            await asyncio.sleep(10)
        
        # Click chọn tháng/ngày
        await page.click('#app > div > div.app-container > div.page-container.responsive-container.has-sidebar-panel > div.page-content-wrapper.responsive-content-wrapper > div > div > div > div.flex-header > div.eds-popover.eds-popover--light > div.eds-popover__ref > div > button', force=True)
        await asyncio.sleep(3)
        await page.click('#statements-date-picker > div.opts-panel > ul > li:nth-child(2)', force=True)
        await asyncio.sleep(5)
        await page.click('#statements-date-picker > div.eds-daterange-picker-panel.date-range-panel > div > div.eds-daterange-picker-panel__body-left > div > div.eds-picker-header > span:nth-child(3)', force=True)
        await asyncio.sleep(3)
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        await page.click(f".eds-month-table__col:has-text('{months[THANG_TAI - 1]}')", force=True)
        await asyncio.sleep(5)
        all_days = await page.query_selector_all('.eds-date-table__cell-inner.normal:not(.disabled)')
        if len(all_days) > 0:
            await all_days[0].click(force=True)
            await asyncio.sleep(1)
            await all_days[-1].click(force=True)
        await asyncio.sleep(10)
        
        # Xuất file
        await page.click("#app > div > div.app-container > div.page-container.responsive-container.has-sidebar-panel > div.page-content-wrapper.responsive-content-wrapper > div > div > div > div.table-wrapper > div > div.eds-table__body-container > div.eds-table__main-body > div > div > div.eds-scrollbar__content > table > tbody > tr > td.is-last > div > div > div.eds-popover__ref > button", force=True)
        await asyncio.sleep(10)
        
        da_tai_xong = False
        self.log("Đang canh 'Đang được xử lý' (Đợi tối đa 5 phút)...")

        for i in range(30):
            dang_xu_ly = await page.get_by_text("Đang được xử lý").is_visible()
            if not dang_xu_ly:
                btn_taive = page.get_by_role("button", name="Tải về").first
                if await btn_taive.is_visible():
                    try:
                        async with page.expect_download(timeout=60000) as download_info:
                            await btn_taive.click(force=True)
                        download = await download_info.value
                        folder = os.path.join(shop["thu_muc_luu"], f"Tháng {str(THANG_TAI).zfill(2)} {NAM}")
                        if not os.path.exists(folder): os.makedirs(folder)
                        file_name = f"shopee_{shop['ten_shop']}_doanhthu_{NAM}{str(THANG_TAI).zfill(2)}.pdf"
                        full_path = os.path.join(folder, file_name)
                        await download.save_as(full_path)
                        self.log(f"🏆 THÀNH CÔNG! Đã lưu: {file_name}")
                        
                        # Tự động đẩy lên R2
                        if upload_to_r2(full_path, file_name):
                            trigger_server_import(file_name, shop['ten_shop'], 'shopee', 'income', full_path)
                        
                        da_tai_xong = True
                        break
                    except:
                        self.log("Vấp lỗi nút Tải về, chuẩn bị F5 cứu hộ...")
                        break
            await asyncio.sleep(10)

        # CƠ CHẾ CỨU HỘ
        if not da_tai_xong:
            self.log("⚠️ Loading lâu quá! Đang F5 và chọc thẳng vào Lịch sử báo cáo...")
            await page.reload()
            await asyncio.sleep(10)
            js_history_path = '#app > div > div.app-container > div.page-container.responsive-container.has-sidebar-panel > div.page-content-wrapper.responsive-content-wrapper > div > div > div > div.flex-header > div.remote-component > div > div:nth-child(2) > div.eds-popover__ref > div > button'
            try:
                await page.evaluate(f'document.querySelector("{js_history_path}").click()')
                await asyncio.sleep(5)
                btn_popup = page.get_by_role("button", name="Tải về").first
                if await btn_popup.is_visible():
                    async with page.expect_download(timeout=60000) as download_info:
                        await btn_popup.click(force=True)
                    download = await download_info.value
                    folder = os.path.join(shop["thu_muc_luu"], f"Tháng {str(THANG_TAI).zfill(2)} {NAM}")
                    if not os.path.exists(folder): os.makedirs(folder)
                    file_name = f"shopee_{shop['ten_shop']}_doanhthu_{NAM}{str(THANG_TAI).zfill(2)}.pdf"
                    full_path_rescue = os.path.join(folder, file_name)
                    await download.save_as(full_path_rescue)
                    self.log(f"🏆 CỨU HỘ THÀNH CÔNG! Đã lấy file từ lịch sử.")
                    if upload_to_r2(full_path_rescue, file_name):
                        trigger_server_import(file_name, shop['ten_shop'], 'shopee', 'income', full_path_rescue)
                    da_tai_xong = True
                else:
                    self.log("❌ F5 rồi vẫn không thấy file. Máy bỏ qua để sang phần tiếp theo.")
            except Exception as e:
                self.log(f"❌ Không chọc được nút Lịch sử: {str(e)}")
            await asyncio.sleep(10)
