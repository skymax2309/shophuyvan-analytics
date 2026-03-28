import asyncio
import os
import zipfile
from utils import upload_to_r2, trigger_server_import

class ShopeeHoaDon:
    def __init__(self, log_func, auth):
        self.log = log_func
        self.auth = auth

    async def xu_ly_hoa_don(self, page, shop, THANG_TAI, NAM):
        self.log(f"Đang xử lý HÓA ĐƠN cho shop: {shop['ten_shop']}")
        await page.goto("https://banhang.shopee.vn/portal/finance/income/invoice", wait_until="commit")
        await asyncio.sleep(10)
        # Chọn tháng hóa đơn
        await page.locator('.eds-select, .eds-select__input-wrapper').first.click(force=True)
        await asyncio.sleep(3)
        await page.fill('input[placeholder="Select"]', NAM)
        await asyncio.sleep(3)
        await page.evaluate(f'(txt) => {{ const ops = document.querySelectorAll("div.eds-option"); for(let o of ops) {{ if(o.innerText.includes(txt)) {{ o.click(); return; }} }} }}', f"Tháng {THANG_TAI} {NAM}")
        await asyncio.sleep(10)
        
        if not await page.get_by_text("Không có hóa đơn").is_visible():
            targets = {"Shopee - SVS": "_ADS", "Shopee - Phí rút tiền": "_PhiRutTien", "Shopee - Phí sàn": "_PhiSan"}
            for phi, duoi in targets.items():
                row = page.locator(f"tr:has-text('{phi}'), div.eds-table__row:has-text('{phi}')").first
                if await row.is_visible():
                    btn = row.locator("text=Master Invoice").first
                    if await btn.is_visible():
                        await asyncio.sleep(5)
                        async with page.expect_download(timeout=120000) as dl_info:
                            await btn.click(force=True)
                        dl = await dl_info.value
                        folder = os.path.join(shop["thu_muc_luu"], f"Tháng {str(THANG_TAI).zfill(2)} {NAM}")
                        if not os.path.exists(folder): os.makedirs(folder)
                        file_name = f"shopee_{shop['ten_shop']}_hoadon{duoi}_{NAM}{str(THANG_TAI).zfill(2)}.pdf"
                        full_path = os.path.join(folder, file_name)
                        zip_path = full_path.replace(".pdf", ".zip")
                        await dl.save_as(zip_path)
                        await asyncio.sleep(3)

                        ok_to_upload = True
                        if zipfile.is_zipfile(zip_path):
                            self.log(f"📦 Phát hiện file ZIP, đang giải nén...")
                            with zipfile.ZipFile(zip_path, 'r') as z:
                                pdf_files = [f for f in z.namelist() if f.lower().endswith('.pdf')]
                                if pdf_files:
                                    extracted = z.extract(pdf_files[0], folder)
                                    if os.path.exists(full_path):
                                        os.remove(full_path)
                                    os.rename(extracted, full_path)
                                    self.log(f"✅ Giải nén thành công: {pdf_files[0]}")
                                else:
                                    self.log(f"⚠️ ZIP không chứa PDF, bỏ qua")
                                    ok_to_upload = False
                            os.remove(zip_path)
                        else:
                            if os.path.exists(full_path):
                                os.remove(full_path)
                            os.rename(zip_path, full_path)

                        if not ok_to_upload:
                            continue

                        file_size = os.path.getsize(full_path)
                        if file_size < 5000:
                            self.log(f"⚠️ File {duoi} quá nhỏ ({file_size} bytes), bỏ qua")
                            continue

                        self.log(f"🏆 Xong Hóa đơn {duoi} ({file_size // 1024} KB)")

                        if duoi == "_ADS":
                            rtype = "phi-dau-thau"
                        else:
                            rtype = "expense"

                        if upload_to_r2(full_path, file_name):
                            trigger_server_import(file_name, shop['ten_shop'], 'shopee', rtype, full_path)
                        
                        await asyncio.sleep(10)
