import asyncio
import os
from utils import upload_to_r2, trigger_server_import, extract_pdf_text

class LazadaHoaDon:
    def __init__(self, log_func, auth):
        self.log = log_func
        self.auth = auth

    async def run(self, page, shop, THANG_TAI, NAM):
        self.log(f"Đang xử lý HÓA ĐƠN Lazada tháng {THANG_TAI}/{NAM}")
        
        if not await self.auth.check_and_login(page, shop):
            return
            
        await page.goto("https://sellercenter.lazada.vn/portal/apps/finance/myIncome/index", wait_until="commit")
        await asyncio.sleep(8)
        await page.locator('div.next-tabs-tab-inner:has-text("Hóa đơn")').last.click(force=True)
        await asyncio.sleep(5)

        m_e = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        target_str = f"{m_e[THANG_TAI - 1]} {NAM}"
        has_next_page = True
        empty_pages_count = 0
        cycle_counts = {}

        while has_next_page:
            await asyncio.sleep(3)
            rows = await page.locator("tr.next-table-row").all()
            found_in_current_page = False

            for row in rows:
                try:
                    chu_ky_loc = row.locator("td.next-table-cell.first")
                    if not await chu_ky_loc.is_visible(): continue
                    chu_ky_text = await chu_ky_loc.inner_text()
                    if target_str not in chu_ky_text: continue

                    found_in_current_page = True
                    empty_pages_count = 0
                    safe_chu_ky = chu_ky_text.replace("/","-").replace(":","-").replace("\n","").strip()
                    cycle_counts[safe_chu_ky] = cycle_counts.get(safe_chu_ky, 0) + 1
                    file_name = f"LAZADA_{shop['ten_shop']}_{safe_chu_ky}_{cycle_counts[safe_chu_ky]}.pdf"

                    btn_tai = row.locator("td.next-table-cell.last").get_by_text("Tải xuống")
                    if await btn_tai.is_visible():
                        async with page.expect_download(timeout=60000) as dl_info:
                            await btn_tai.click(force=True)
                        dl = await dl_info.value
                        full_path = os.path.join(shop["thu_muc_luu"], file_name)
                        await dl.save_as(full_path)
                        self.log(f"🏆 Đã lưu hóa đơn: {file_name}")

                        try:
                            pdf_text = extract_pdf_text(full_path)
                            is_ads = any(k in pdf_text for k in ["Tài Trợ Hiển Thị", "Sponsored"])
                            lazada_rtype = "phi-dau-thau" if is_ads else "expense"
                        except:
                            lazada_rtype = "expense"

                        if upload_to_r2(full_path, file_name):
                            trigger_server_import(file_name, shop['ten_shop'], 'lazada', lazada_rtype, full_path)
                        await asyncio.sleep(2)
                except: pass

            if not found_in_current_page: empty_pages_count += 1
            if empty_pages_count >= 2: break

            btn_next = page.locator('button.next-next, button:has-text("Tiếp theo")').last
            if await btn_next.is_visible() and not await btn_next.is_disabled():
                await btn_next.click(force=True)
                await asyncio.sleep(5)
            else: has_next_page = False

        self.log(f"✅ Xong hóa đơn Lazada tháng {THANG_TAI}/{NAM}")
