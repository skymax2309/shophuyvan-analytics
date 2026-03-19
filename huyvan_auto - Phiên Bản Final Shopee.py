import asyncio
import os
import threading
import customtkinter as ctk
from playwright.async_api import async_playwright


class HuyVanApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Phần Mềm Kiểm Tra Từng Bước - Huy Vân Store")
        self.geometry("6000x500")
        self.confirm_event = threading.Event()

        # GIAO DIỆN
        self.label = ctk.CTkLabel(self, text="CHẾ ĐỘ KIỂM TRA TỪNG BƯỚC", font=("Arial", 20, "bold"))
        self.label.pack(pady=10)

        self.btn_start = ctk.CTkButton(self, text="1. BẮT ĐẦU CHẠY", command=self.start_bot_thread, fg_color="green")
        self.btn_start.pack(pady=5)

        self.btn_confirm = ctk.CTkButton(self, text="2. XÁC NHẬN ĐỂ ĐI TIẾP", command=self.confirm_step, fg_color="orange", state="disabled")
        self.btn_confirm.pack(pady=5)

        self.log_text = ctk.CTkTextbox(self, width=550, height=250)
        self.log_text.pack(pady=10)
        self.log("Nhấn 'Bắt đầu' để mở trình duyệt...")

    def log(self, message):
        self.log_text.insert("end", f"[*] {message}\n")
        self.log_text.see("end")

    def confirm_step(self):
        self.log("--- Huy đã xác nhận. Đang chạy tiếp... ---")
        self.btn_confirm.configure(state="disabled")
        self.confirm_event.set()

    def wait_for_huy(self, step_name):
        self.log(f"⚠️ ĐÃ XONG: {step_name}")
        self.log("👉 Huy kiểm tra trên Chrome, nếu OK thì bấm 'XÁC NHẬN'...")
        self.btn_confirm.configure(state="normal")
        self.confirm_event.clear()
        self.confirm_event.wait()

    def start_bot_thread(self):
        self.btn_start.configure(state="disabled")
        threading.Thread(target=lambda: asyncio.run(self.main_logic()), daemon=True).start()

    async def main_logic(self):
        THANG_TAI = 2
        NAM = "2026"

        # --- DANH SÁCH CẤU HÌNH 3 SHOP ---
        DANH_SACH_SHOP = [
            {
                "ten_shop": "Huy Vân Store Q.Bình Tân_Shopee_",
                "mat_khau": "Nghiem23091984",
                "thu_muc_luu": r"E:\Doanh Thu Sàn TMDT 2026\LƯU THẾ HẢI\phambich2312",
                "profile_dir": r"C:\Users\Admin\Desktop\HuyVan_Bot_Data_Shop1"
            },
            {
                "ten_shop": "Shophuyvan.vn_Shopee",
                "mat_khau": "Nghiem23091984",
                "thu_muc_luu": r"E:\Doanh Thu Sàn TMDT 2026\LƯU THẾ HẢI\chihuy2309",
                "profile_dir": r"C:\Users\Admin\Desktop\HuyVan_Bot_Data_Shop2"
            },
            {
                "ten_shop": "Khogiadunghuyvan_Shopee",
                "mat_khau": "Nghiem23091984",
                "thu_muc_luu": r"E:\Doanh Thu Sàn TMDT 2026\NGHIÊM CHÍ HUY\chihuy1984",
                "profile_dir": r"C:\Users\Admin\Desktop\HuyVan_Bot_Data_Shop3"
            }
        ]

        async with async_playwright() as p:
            for shop in DANH_SACH_SHOP:
                self.log(f"\n=========================================")
                self.log(f"🚀 BẮT ĐẦU CHẠY TỰ ĐỘNG: {shop['ten_shop']}")
                self.log(f"=========================================")

                context = await p.chromium.launch_persistent_context(
                    user_data_dir=shop["profile_dir"], channel="chrome", headless=False,
                    args=["--disable-blink-features=AutomationControlled"]
                )
                page = context.pages[0]

                try:
                    # --- PHẦN 1: DOANH THU (INCOME STATEMENT) ---
                    await page.goto("https://banhang.shopee.vn/portal/finance/income/statement", wait_until="commit")
                    await asyncio.sleep(10)

                    # Nhập mật khẩu nếu cần
                    pass_input = await page.query_selector('input[type="password"]')
                    if pass_input:
                        await page.fill('input[type="password"]', shop["mat_khau"])
                        await page.click("button.eds-button--primary.action")
                        await asyncio.sleep(10)

                    # Chọn Tháng/Ngày
                    js_path_date = '#app > div > div.app-container > div.page-container.responsive-container.has-sidebar-panel > div.page-content-wrapper.responsive-content-wrapper > div > div > div > div.flex-header > div.eds-popover.eds-popover--light > div.eds-popover__ref > div > button'
                    await page.wait_for_selector(js_path_date)
                    await page.click(js_path_date, force=True)
                    await asyncio.sleep(3)

                    js_path_thang = '#statements-date-picker > div.opts-panel > ul > li:nth-child(2)'
                    await page.click(js_path_thang, force=True)
                    await asyncio.sleep(5)

                    js_path_tieu_de = '#statements-date-picker > div.eds-daterange-picker-panel.date-range-panel > div > div.eds-daterange-picker-panel__body-left > div > div.eds-picker-header > span:nth-child(3)'
                    await page.click(js_path_tieu_de, force=True)
                    await asyncio.sleep(3)

                    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                    target_month = months[THANG_TAI - 1]
                    await page.click(f".eds-month-table__col:has-text('{target_month}')", force=True)
                    await asyncio.sleep(5)

                    ngay_selector = '.eds-date-table__cell-inner.normal:not(.disabled)'
                    all_days = await page.query_selector_all(ngay_selector)
                    if len(all_days) > 0:
                        await all_days[0].click(force=True)
                        await asyncio.sleep(1)
                        await all_days[-1].click(force=True)
                    await asyncio.sleep(10)

                    # Xuất và Tải file Doanh Thu
                    btn_export_path = "#app > div > div.app-container > div.page-container.responsive-container.has-sidebar-panel > div.page-content-wrapper.responsive-content-wrapper > div > div > div > div.table-wrapper > div > div.eds-table__body-container > div.eds-table__main-body > div > div > div.eds-scrollbar__content > table > tbody > tr > td.is-last > div > div > div.eds-popover__ref > button"
                    await page.click(btn_export_path, force=True)
                    await asyncio.sleep(10)

                    for i in range(30): 
                        if not await page.get_by_text("Đang được xử lý").is_visible():
                            async with page.expect_download(timeout=60000) as download_info:
                                await page.get_by_role("button", name="Tải về").first.click(force=True)
                            download = await download_info.value
                            folder_name = f"Tháng {str(THANG_TAI).zfill(2)} {NAM}"
                            final_folder = os.path.join(shop["thu_muc_luu"], folder_name)
                            if not os.path.exists(final_folder): os.makedirs(final_folder)
                            file_name = f"{shop['ten_shop']}_DoanhThu_{NAM}{str(THANG_TAI).zfill(2)}.pdf"
                            await download.save_as(os.path.join(final_folder, file_name))
                            self.log(f"🏆 Xong Doanh Thu: {file_name}")
                            break
                        await asyncio.sleep(10)

                    # --- PHẦN 2: HÓA ĐƠN (INVOICE) ---
                    await page.goto("https://banhang.shopee.vn/portal/finance/income/invoice", wait_until="commit")
                    await asyncio.sleep(10)
                    
                    try:
                        await page.locator('.eds-select, .eds-select__input-wrapper').first.click(force=True)
                        await asyncio.sleep(3)
                        await page.fill('input[placeholder="Select"]', NAM)
                        await asyncio.sleep(3)
                        thang_nam_text = f"Tháng {THANG_TAI} {NAM}"
                        await page.evaluate(f'''(text) => {{
                            const options = document.querySelectorAll('div.eds-option');
                            for (let opt of options) {{
                                if (opt.innerText && opt.innerText.includes(text)) {{ opt.click(); return; }}
                            }}
                        }}''', thang_nam_text)
                        await asyncio.sleep(10)
                    except: self.log("⚠️ Không tự chọn tháng hóa đơn được, Huy xử lý tay nếu cần.")

                    if not await page.get_by_text("Không có hóa đơn").is_visible():
                        muc_tieu_tai = {"Shopee - SVS": "_ADS", "Shopee - Phí rút tiền": "_PhiRutTien", "Shopee - Phí sàn": "_PhiSan"}
                        for ten_phi, duoi_file in muc_tieu_tai.items():
                            row_locator = page.locator(f"tr:has-text('{ten_phi}'), div.eds-table__row:has-text('{ten_phi}')").first
                            if await row_locator.is_visible():
                                btn_master = row_locator.locator("text=Master Invoice").first
                                if await btn_master.is_visible():
                                    async with page.expect_download(timeout=60000) as download_info:
                                        await btn_master.click(force=True)
                                    download = await download_info.value
                                    file_name = f"{shop['ten_shop']}{duoi_file}_{NAM}{str(THANG_TAI).zfill(2)}.pdf"
                                    await download.save_as(os.path.join(final_folder, file_name))
                                    self.log(f"🏆 Xong Hóa Đơn: {file_name}")
                                    await asyncio.sleep(10)

                    # --- PHẦN 3: ĐƠN HÀNG (ORDER) ---
                    await page.goto("https://banhang.shopee.vn/portal/sale/order", wait_until="commit")
                    await asyncio.sleep(10)
                    
                    # Tự động tắt popup quảng cáo
                    await page.evaluate('''() => {
                        const closeIcons = document.querySelectorAll('.close-icon, div[class*="close-icon"] i');
                        for (let icon of closeIcons) { if (icon.offsetParent !== null) icon.click(); }
                    }''')
                    await asyncio.sleep(5)

                    try:
                        # Bấm Xuất
                        await page.evaluate('''() => {
                            const btns = Array.from(document.querySelectorAll('button'));
                            const xuatBtn = btns.find(b => b.innerText && b.innerText.includes('Xuất') && !b.innerText.includes('Lịch sử'));
                            if (xuatBtn) xuatBtn.click();
                        }''')
                        await asyncio.sleep(10)

                        # Mở khung lịch
                        box_thoi_gian = page.locator(".eds-modal__body .eds-date-picker__input, .export-modal .eds-selector__inner").first
                        await box_thoi_gian.click(force=True)
                        await asyncio.sleep(5)

                        # Chọn Tháng
                        tieu_de_thang_js = "body > div.eds-popper-container > div > div.eds-daterange-picker-panel > div > div.eds-daterange-picker-panel__body-left > div > div.eds-picker-header > span:nth-child(3)"
                        await page.evaluate(f'document.querySelector("{tieu_de_thang_js}").click()')
                        await asyncio.sleep(5)

                        target_month_text = f"Tháng {THANG_TAI}"
                        await page.locator(f".eds-month-table__col:has-text('{target_month_text}')").first.click(force=True)
                        await asyncio.sleep(5)

                        # Chốt ngày
                        all_days = await page.query_selector_all('.eds-date-table__cell-inner.normal:not(.disabled)')
                        if len(all_days) > 0:
                            await all_days[0].click(force=True)
                            await asyncio.sleep(2)
                            await all_days[-1].click(force=True)
                        await asyncio.sleep(10)

                        # Bấm nút Xuất màu cam
                        await page.evaluate('''() => {
                            const submitBtn = Array.from(document.querySelectorAll('.eds-modal__footer button, .export-modal button')).find(b => b.innerText.includes('Xuất'));
                            if (submitBtn) submitBtn.click();
                        }''')
                        await asyncio.sleep(10)

                        # Canh tải file Đơn hàng
                        for i in range(30):
                            if not await page.get_by_text("Đang được xử lý").is_visible():
                                btn_taive = page.get_by_role("button", name="Tải về").first
                                if await btn_taive.is_visible():
                                    async with page.expect_download(timeout=60000) as download_info:
                                        await btn_taive.click(force=True)
                                    download = await download_info.value
                                    ten_shop_sach = shop['ten_shop'].replace('_DoanhThu', '').strip()
                                    file_name = f"{ten_shop_sach}_shopee_donhang-{str(THANG_TAI).zfill(2)}.xlsx"
                                    await download.save_as(os.path.join(final_folder, file_name))
                                    self.log(f"🏆 Xong Đơn Hàng: {file_name}")
                                    break
                            await asyncio.sleep(10)
                    except Exception as e:
                        self.log(f"❌ Vấp lỗi phần Đơn Hàng: {e}")
                        self.wait_for_huy("Huy xử lý nốt shop này rồi bấm XÁC NHẬN để sang Shop kế tiếp.")

                    self.log(f"🏁 ĐÃ XONG TẤT CẢ CHO: {shop['ten_shop']}")
                    await asyncio.sleep(5)

                except Exception as e:
                    self.log(f"❌ LỖI NGHIÊM TRỌNG: {str(e)}")
                    self.wait_for_huy("Bấm XÁC NHẬN để bỏ qua lỗi và chạy Shop tiếp theo...")

                await context.close()

        self.log("🎉 CHÚC MỪNG! ĐÃ TẢI XONG TOÀN BỘ 3 SHOP!")
        self.btn_start.configure(state="normal")

if __name__ == "__main__":
    app = HuyVanApp()
    app.mainloop()
