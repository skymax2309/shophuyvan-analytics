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
        # Đã bọc thêm thư mục lưu theo tháng
        thang_nam = f"Tháng {str(THANG_TAI).zfill(2)} {NAM}"
        thu_muc_thang = os.path.join(shop["thu_muc_luu"], thang_nam)
        shop_luu_tam = shop.copy()
        shop_luu_tam["thu_muc_luu"] = thu_muc_thang
        await self._wait_and_download(page, shop_luu_tam, f"tiktok_{shop['ten_shop']}_donhang_{NAM}{str(THANG_TAI).zfill(2)}")

    async def run_by_date(self, page, shop, from_date, to_date):
        self.log(f"📅 TikTok: tải đơn từ {from_date} đến {to_date}")
        if not await self.auth.check_and_login(page, shop): return
        d_from = datetime.datetime.strptime(from_date, "%Y-%m-%d")
        await page.goto("https://seller-vn.tiktok.com/order?selected_sort=6&tab=all", wait_until="commit")
        await asyncio.sleep(8)
        
        await self._apply_filter(page, d_from.month, str(d_from.year), d_from.day, datetime.datetime.strptime(to_date, "%Y-%m-%d").day)
        await self._trigger_export(page)
        thang_nam = f"Tháng {str(d_from.month).zfill(2)} {d_from.year}"
        thu_muc_thang = os.path.join(shop["thu_muc_luu"], thang_nam)
        shop_luu_tam = shop.copy()
        shop_luu_tam["thu_muc_luu"] = thu_muc_thang
        await self._wait_and_download(page, shop_luu_tam, f"tiktok_{shop['ten_shop']}_donhang_{from_date}_{to_date}")

    async def _apply_filter(self, page, month, year, day_start=1, day_end=None):
        import datetime
        import calendar

        if not day_end: day_end = calendar.monthrange(int(year), int(month))[1]
        
        # 1. Tính toán Timestamp chuẩn đến từng mili-giây
        start_dt = datetime.datetime(int(year), int(month), int(day_start), 0, 0, 0)
        end_dt = datetime.datetime(int(year), int(month), int(day_end), 23, 59, 59)
        start_ts = int(start_dt.timestamp() * 1000)
        end_ts = int(end_dt.timestamp() * 1000)
        
        # 2. Tuyệt chiêu: Ép trình duyệt đi thẳng đến URL đã lọc sẵn ngày, BỎ QUA hoàn toàn việc bấm Lịch!
        target_url = f"https://seller-vn.tiktok.com/order?selected_sort=6&tab=all&time_order_created[]={start_ts}&time_order_created[]={end_ts}"
        self.log(f"🚀 [Bypass UI] Ép URL lấy đơn: {day_start}/{month}/{year} -> {day_end}/{month}/{year}")
        
        await page.goto(target_url)
        await asyncio.sleep(5)
        
        # 3. Đấm bay mọi popup ngáng đường nếu có
        try: await page.locator('.arco-dialog-close, .arco-modal-close-icon, svg[class*="close"]').first.click(timeout=2000)
        except: pass
        await asyncio.sleep(2)

    async def _trigger_export(self, page):
        self.log("⏳ Đang bấm Xuất dữ liệu...")
        
        # 1. Đóng mọi popup thông báo sản phẩm sắp hết hàng/quảng cáo
        try:
            await page.locator('.arco-icon-close, .arco-modal-close-icon, [class*="close"]').first.click(timeout=3000)
            await asyncio.sleep(1)
        except: pass

        # 2. Bấm nút Xuất chính
        try:
            btn_xuat = page.locator('button').filter(has_text="Xuất").first
            await btn_xuat.click(timeout=5000)
            await asyncio.sleep(3)
        except:
            await page.evaluate('''() => {
                let target = Array.from(document.querySelectorAll('button, div')).reverse().find(el => el.innerText && el.innerText.trim() === 'Xuất');
                if (target) target.click();
            }''')
            await asyncio.sleep(3)

        # 3. ÉP CHỌN ĐỊNH DẠNG EXCEL (Quan trọng nhất)
        try:
            # Tìm và click vào ô tròn hoặc chữ "Excel"
            excel_option = page.locator('label').filter(has_text="Excel")
            if await excel_option.is_visible():
                await excel_option.click(force=True)
                self.log("✅ Đã chọn định dạng Excel.")
                await asyncio.sleep(1)
        except:
            self.log("⚠️ Không tìm thấy nút chọn Excel, dùng mặc định của sàn.")

        # 4. Bấm nút xác nhận Xuất cuối cùng trong popup
        try:
            confirm_btn = page.locator('.arco-modal-footer button, button:has-text("Xuất")').last
            await confirm_btn.click(timeout=5000)
            self.log("✅ Đã gửi lệnh Xuất file Excel thành công.")
        except:
            # Click bằng tọa độ hoặc JS nếu bị che
            await page.evaluate('''() => {
                let b = Array.from(document.querySelectorAll('button')).find(el => el.innerText === 'Xuất' && el.className.includes('primary'));
                if (b) b.click();
            }''')
        
        await asyncio.sleep(5)

    async def _wait_and_download(self, page, shop, file_prefix):
        self.log("📂 Đang chờ nút Tải xuống xuất hiện tại popup...")
        # Không nhảy trang, đứng im tại popup vừa bấm Xuất

        # Tăng số lần quét lên 100 lần để tool kiên nhẫn đợi file xuất hiện
        for i in range(100):
            if page.is_closed(): return 

            # Quét tìm chính xác thẻ div chứa chữ "Tải xuống" dựa trên HTML thực tế
            btn_download = page.locator('div._content_17wai_1, div:has-text("Tải xuống")').last
            
            try:
                if await btn_download.is_visible(timeout=2000):
                    self.log("✅ Đã thấy nút Tải xuống! Tiến hành bốc file...")
                    async with page.expect_download(timeout=60000) as dl_info:
                        # Dùng force=True vì đôi khi popup thông báo sản phẩm che nhẹ lên nút
                        await btn_download.click(force=True)
                    
                    dl = await dl_info.value
                    if not os.path.exists(shop["thu_muc_luu"]): os.makedirs(shop["thu_muc_luu"])
                    file_name = f"{file_prefix}.{dl.suggested_filename.split('.')[-1]}"
                    full_path = os.path.join(shop["thu_muc_luu"], file_name)
                    
                    await dl.save_as(full_path)
                    self.log(f"🏆 Xong đơn hàng: {file_name}")
                    
                    # Đóng popup sau khi tải xong để sạch giao diện
                    try: await page.locator('button:has-text("Đóng")').click()
                    except: pass

                    # Tiến hành Import
                    if upload_to_r2(full_path, file_name):
                        v2_data = self.psr.parse_tiktok_order_excel_local(full_path, shop['ten_shop'])
                        if v2_data: self._import_to_server(v2_data)
                        trigger_server_import(file_name, shop['ten_shop'], 'tiktok', 'orders')
                    return
            except:
                pass

            if (i + 1) % 5 == 0:
                self.log(f"...Đang đợi file hiện ra trong lịch sử (Lần {i+1}/100)...")
            
            # Đợi 5 giây trước khi quét lại nút
            await asyncio.sleep(5)
            

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
