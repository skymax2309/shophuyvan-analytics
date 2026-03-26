import asyncio
import os
import calendar
import json
import datetime
from utils import upload_to_r2, trigger_server_import

class TikTokEngine:
    def __init__(self, log_func, psr):
        self.log = log_func # Đảm bảo có dòng này để dùng self.log
        self.psr = psr

    async def tiktok_xu_ly_doanh_thu(self, page, shop, THANG_TAI, NAM):
        import calendar # Đã nhấn Tab để thụt vào
        self.log(f"Đang xử lý DOANH THU TikTok tháng {THANG_TAI}/{NAM}")
        await page.goto("https://seller-vn.tiktok.com/finance/transactions?shop_region=VN&tab=settled_tab", wait_until="commit")
        await asyncio.sleep(8)
    
        if "login" in page.url or "account/login" in page.url:
            self.log("TikTok chưa đăng nhập, đang tự login...")
            try:
                tk_loc = page.locator('input[placeholder*="điện thoại"], input[placeholder*="email"], input[name="email"]').first
                await tk_loc.wait_for(state="visible", timeout=10000)
                await tk_loc.fill(shop.get("email_login", ""))
                await asyncio.sleep(1)
                mk_loc = page.locator('input[type="password"]').first
                await mk_loc.fill(shop["mat_khau"])
                await asyncio.sleep(1)
                await page.locator('button:has-text("Đăng nhập")').first.click(force=True)
                await asyncio.sleep(8)
            except Exception as e:
                self.log(f"Lỗi login TikTok: {e}")
                self.rescue_wait("Đăng nhập TikTok thủ công rồi bấm XÁC NHẬN")
    
        # Bấm Xuất
        try:
            await page.evaluate('document.querySelector("#core-tabs-0-panel-0 > div > div.space-y-16 > div.flex.flex-col.space-y-16 > div:nth-child(1) > div.w-200.h-32 > div > div > div.text-base.font-semibold.cursor-pointer.select-none.bg-\\[\\#ECECED\\].text-\\[\\#171718\\].rounded.py-6.px-12.hover\\:bg-gray-200.flex.items-center").click()')
        except:
            try:
                await page.get_by_text("Xuất", exact=True).first.click(force=True)
            except:
                await page.locator('div, span, button').filter(has_text="Xuất").filter(has_not_text="Lịch sử").first.click(force=True)
        await asyncio.sleep(5)
    
        # Chọn ngày
        try:
            await page.evaluate('document.querySelector("body > div:nth-child(9) > span > div.core-popover-content.core-popover-content-br > div > div > div > div > div > div.sc-eywOmQ.epYlkZ.flex.items-center.rounded.border.border-gray-border.hover\\:border-brand-hover > div > div > div:nth-child(1)").click()')
        except:
            try:
                await page.get_by_text("Thời gian bắt đầu").first.click(force=True)
            except:
                await page.locator('div').filter(has_text="Thời gian bắt đầu").last.click(force=True)
        await asyncio.sleep(5)
    
        # Lùi tháng
        target_month_text = f"{str(THANG_TAI).zfill(2)}/{NAM}"
        for _ in range(24):
            current_month_text = await page.locator('.core-picker-header-value').first.inner_text()
            if target_month_text in current_month_text.replace(" ", ""):
                break
            try:
                await page.locator('.core-picker-header').first.locator('svg.arco-icon-left').first.click(force=True)
            except:
                await page.locator('div[class*="-header-icon-prev"]').first.click(force=True)
            await asyncio.sleep(2)
    
        # Chọn ngày 1 và ngày cuối
        last_day = calendar.monthrange(int(NAM), THANG_TAI)[1]
        js_click_exact = '''(args) => {
            const leftPanel = document.querySelectorAll('.core-panel-date-inner, .arco-picker-date-panel')[0];
            if (!leftPanel) return "fail";
            const cells = Array.from(leftPanel.querySelectorAll('div[class*="-picker-cell-inner"], div[class*="-picker-date"]'));
            const matchingCells = cells.filter(c => c.innerText.trim() === args.targetText);
            if (matchingCells.length === 0) return "fail";
            const targetCell = args.isFirst ? matchingCells[0] : matchingCells[matchingCells.length - 1];
            targetCell.click(); return "OK";
        }'''
        await page.evaluate(js_click_exact, {"targetText": "01", "isFirst": True})
        await asyncio.sleep(2)
        await page.evaluate(js_click_exact, {"targetText": str(last_day).zfill(2), "isFirst": False})
        await asyncio.sleep(5)
    
        # Bấm OK
        try:
            await page.evaluate('document.querySelector("body > div:nth-child(10) > span > div > div.bg-white.flex.justify-between.p-12.border-gray-border > div.space-x-12.flex.items-center > button > span").click()')
        except:
            await page.locator('button:has-text("OK")').click(force=True)
        await asyncio.sleep(5)
    
        # Bấm Xuất xanh
        try:
            await page.evaluate('document.querySelector("body > div:nth-child(9) > span > div.core-popover-content.core-popover-content-br > div > div > div > div > div > div.flex.space-x-12.mt-16.justify-end > button.core-btn.core-btn-primary.core-btn-size-default.core-btn-shape-square.pulse-button.pulse-button-size-default > span").click()')
        except:
            await page.locator('button:has-text("Xuất")').last.click(force=True)
        await asyncio.sleep(5)
    
        # Chờ tải
        js_tai = 'body > div:nth-child(9) > span > div.core-popover-content.core-popover-content-br > div > div > div > div > div > div.sc-jeCNp.wuZek.w-full.overflow-x-hidden.overflow-y-auto > div:nth-child(1) > div.flex.items-center.px-24.py-16 > div.relative.ml-auto > button > span'
        for i in range(120):
            try:
                btn_tai = page.locator('button:has-text("Tải xuống"), span:has-text("Tải xuống")').first
                if await btn_tai.is_visible() and not await btn_tai.is_disabled():
                    async with page.expect_download(timeout=30000) as dl_info:
                        try:
                            await page.evaluate(f'document.querySelector("{js_tai}").click()')
                        except:
                            await btn_tai.click(force=True)
                    dl = await dl_info.value
                    if not os.path.exists(shop["thu_muc_luu"]):
                        os.makedirs(shop["thu_muc_luu"])
                    ext = dl.suggested_filename.split(".")[-1]
                    file_name = f"{shop['ten_shop']}_doanhthu_{NAM}{str(THANG_TAI).zfill(2)}.{ext}"
                    full_path = os.path.join(shop["thu_muc_luu"], file_name)
                    await dl.save_as(full_path)
                    self.log(f"🏆 Xong Doanh Thu TikTok tháng {THANG_TAI}")
                    if upload_to_r2(full_path, file_name):
                        # Parse Excel + gửi parsed_json lên server
                        parsed = self.psr.parse_tiktok_excel(full_path)
                        if parsed:
                            try:
                                url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/auto-import-trigger"
                                data = json.dumps({
                                    "file_key":    file_name,
                                    "shop":        shop['ten_shop'],
                                    "platform":    "tiktok",
                                    "report_type": "income",
                                    "parsed_json": json.dumps(parsed),
                                }).encode('utf-8')
                                headers = {'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'}
                                req = urllib.request.Request(url, data=data, headers=headers, method='POST')
                                with urllib.request.urlopen(req, timeout=60) as res:
                                    result = json.loads(res.read().decode())
                                    self.log(f"✅ Upload doanh thu TikTok: {result.get('status')}")
                            except Exception as e:
                                self.log(f"⚠️ Lỗi gửi parsed_json TikTok: {str(e)}")
                        else:
                            trigger_server_import(file_name, shop['ten_shop'], 'tiktok', 'income', full_path)
                    break
            except:
                pass
            await asyncio.sleep(5)
            if i % 6 == 0:
                self.log(f"⏳ Chờ TikTok xử lý file ({i*5}s)...")

    async def tiktok_xu_ly_hoa_don(self, page, shop, THANG_TAI, NAM):
        self.log(f"Đang xử lý HÓA ĐƠN TikTok tháng {THANG_TAI}/{NAM}")
        await page.goto("https://seller-vn.tiktok.com/finance/invoice?shop_region=VN", wait_until="commit")
        await asyncio.sleep(8)

        target_period = f"{NAM}-{str(THANG_TAI).zfill(2)}"
        has_next_page = True
        empty_pages_count = 0
        cycle_counts = {}

        while has_next_page:
            await asyncio.sleep(3)
            rows = await page.locator("tr, div.arco-table-tr").all()
            found_in_current_page = False

            for row in rows:
                try:
                    row_text = await row.inner_text()
                    if target_period in row_text and "Tải xuống" in row_text:
                        found_in_current_page = True
                        empty_pages_count = 0
                        loai_hd = "VanChuyen" if "Tokgistic" in row_text else "ChiPhi"
                        cycle_counts[loai_hd] = cycle_counts.get(loai_hd, 0) + 1
                        file_name = f"{shop['ten_shop']}_hoadon_{loai_hd}_{target_period}_{cycle_counts[loai_hd]}.pdf"

                        btn_tai = row.get_by_text("Tải xuống", exact=True).first
                        if await btn_tai.is_visible():
                            try:
                                async with page.expect_download(timeout=45000) as dl_info:
                                    await btn_tai.evaluate("node => node.click()")
                                dl = await dl_info.value
                                ext = dl.suggested_filename.split(".")[-1]
                                file_name = file_name.replace(".pdf", f".{ext}")
                                full_path = os.path.join(shop["thu_muc_luu"], file_name)
                                await dl.save_as(full_path)
                                self.log(f"🏆 Đã lưu: {file_name}")
                                # Phân loại report_type
                                is_logistics = "VanChuyen" in file_name
                                rtype = "expense"  # TikTok chi phí
                                if upload_to_r2(full_path, file_name):
                                    trigger_server_import(file_name, shop['ten_shop'], 'tiktok', rtype, full_path)
                                await asyncio.sleep(3)
                            except Exception as e:
                                self.log(f"⚠️ Lỗi tải hóa đơn: {e}")
                except:
                    pass

            if not found_in_current_page:
                empty_pages_count += 1
            if empty_pages_count >= 2:
                break

            btn_next = page.locator('li.arco-pagination-item-next, button.arco-pagination-item-next').first
            try:
                class_next = await btn_next.get_attribute('class')
                if await btn_next.is_visible() and "disabled" not in str(class_next).lower():
                    await btn_next.click(force=True)
                    await asyncio.sleep(5)
                else:
                    has_next_page = False
            except:
                has_next_page = False

        self.log(f"✅ Xong hóa đơn TikTok tháng {THANG_TAI}/{NAM}")

    async def tiktok_xu_ly_don_hang(self, page, shop, THANG_TAI, NAM):
        import calendar
        self.log(f"Đang xử lý ĐƠN HÀNG TikTok tháng {THANG_TAI}/{NAM}")
        await page.goto("https://seller-vn.tiktok.com/order?selected_sort=6&tab=all", wait_until="commit")
        await asyncio.sleep(8)

        # Bộ lọc
        try:
            await page.locator('div, button').filter(has_text="Bộ lọc").last.click(force=True)
        except:
            await page.get_by_text("Bộ lọc", exact=True).first.click(force=True)
        await asyncio.sleep(3)

        # Chọn Thời gian đã tạo
        try:
            await page.locator('.arco-picker-range, .core-picker-range').first.click(force=True)
        except:
            await page.locator('div').filter(has_text="Thời gian đã tạo").last.click(force=True)
        await asyncio.sleep(3)

        # Lùi tháng
        target_month_text = f"{str(THANG_TAI).zfill(2)}/{NAM}"
        for _ in range(24):
            current_month_text = await page.locator('.arco-picker-header-value, .core-picker-header-value').first.inner_text()
            if target_month_text in current_month_text.replace(" ", ""):
                break
            try:
                await page.locator('.arco-picker-header, .core-picker-header').first.locator('svg.arco-icon-left').first.click(force=True)
            except:
                await page.locator('div[class*="-header-icon-prev"]').first.click(force=True)
            await asyncio.sleep(2)

        # Chọn ngày
        last_day = calendar.monthrange(int(NAM), THANG_TAI)[1]
        js_click_exact = '''(args) => {
            const leftPanel = document.querySelectorAll('.core-panel-date-inner, .arco-picker-date-panel')[0];
            if (!leftPanel) return "fail";
            const cells = Array.from(leftPanel.querySelectorAll('div[class*="-picker-cell-inner"], div[class*="-picker-date"]'));
            const matchingCells = cells.filter(c => c.innerText.trim() === args.targetText);
            if (matchingCells.length === 0) return "fail";
            const targetCell = args.isFirst ? matchingCells[0] : matchingCells[matchingCells.length - 1];
            targetCell.click(); return "OK";
        }'''
        await page.evaluate(js_click_exact, {"targetText": "01", "isFirst": True})
        await asyncio.sleep(2)
        await page.evaluate(js_click_exact, {"targetText": str(last_day).zfill(2), "isFirst": False})
        await asyncio.sleep(3)

        # Áp dụng
        try:
            await page.get_by_text("Áp dụng", exact=True).last.click(force=True)
        except:
            await page.locator('button').filter(has_text="Áp dụng").first.click(force=True)
        await asyncio.sleep(12)

        # Xuất đơn hàng
        js_click_xuat = '''() => {
            let elements = Array.from(document.querySelectorAll('button, div'));
            let btn = elements.reverse().find(el => el.innerText && el.innerText.trim() === 'Xuất');
            if (btn) { btn.click(); return "OK"; } return "FAIL";
        }'''
        try:
            res = await page.evaluate(js_click_xuat)
            if res != "OK":
                await page.locator('button').filter(has_text="Xuất").first.click(force=True)
        except:
            pass
        await asyncio.sleep(5)

        # Chọn Excel
        try:
            await page.locator('label').filter(has_text="Excel").first.click(force=True)
        except:
            await page.get_by_text("Excel", exact=True).click(force=True)
        await asyncio.sleep(3)

        # Bấm Xuất xanh
        try:
            await page.locator('button.core-btn-primary, button.arco-btn-primary').filter(has_text="Xuất").first.click(force=True)
        except:
            await page.get_by_text("Xuất", exact=True).last.click(force=True)
        await asyncio.sleep(5)

        # Chờ tải
        for i in range(120):
            try:
                btn_tai = page.locator('a, button, span').filter(has_text="Tải xuống").first
                if await btn_tai.is_visible():
                    await asyncio.sleep(5)
                    async with page.expect_download(timeout=60000) as dl_info:
                        try:
                            await btn_tai.evaluate("node => node.click()")
                        except:
                            await btn_tai.click(force=True)
                    dl = await dl_info.value
                    if not os.path.exists(shop["thu_muc_luu"]):
                        os.makedirs(shop["thu_muc_luu"])
                    ext = dl.suggested_filename.split(".")[-1]
                    file_name = f"{shop['ten_shop']}_donhang_{NAM}{str(THANG_TAI).zfill(2)}.{ext}"
                    full_path = os.path.join(shop["thu_muc_luu"], file_name)
                    await dl.save_as(full_path)
                    self.log(f"🏆 Xong Đơn Hàng TikTok tháng {THANG_TAI}")
                    if upload_to_r2(full_path, file_name):
                        v2_data = self.psr.parse_tiktok_order_excel_local(full_path, shop['ten_shop'])
                        if v2_data:
                            try:
                                api_url2 = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                                data = json.dumps(v2_data).encode('utf-8')
                                req = urllib.request.Request(api_url2, data=data,
                                    headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'},
                                    method='POST')
                                with urllib.request.urlopen(req, timeout=60) as res:
                                    result = json.loads(res.read().decode())
                                    self.log(f"✅ Import TikTok: {result.get('imported_orders',0)} đơn, {result.get('imported_items',0)} items")
                            except Exception as e:
                                self.log(f"⚠️ Lỗi import TikTok V2: {str(e)}")
                        trigger_server_import(file_name, shop['ten_shop'], 'tiktok', 'orders', full_path)
                    break
            except:
                pass
            await asyncio.sleep(5)
            if i % 6 == 0:
                self.log(f"⏳ Chờ TikTok xuất đơn hàng ({i*5}s)...")
                
    async def tiktok_xu_ly_don_hang_ngay(self, page, shop, from_date, to_date):
        """Tải đơn hàng TikTok theo khoảng ngày cụ thể"""
        import datetime, calendar
        d = datetime.datetime.strptime(from_date, "%Y-%m-%d")
        THANG_TAI = d.month
        NAM = str(d.year)
        self.log(f"📅 TikTok: tải đơn từ {from_date} đến {to_date}")
        await page.goto("https://seller-vn.tiktok.com/order?selected_sort=6&tab=all", wait_until="commit")
        await asyncio.sleep(8)
        try:
            await page.locator('div, button').filter(has_text="Bộ lọc").last.click(force=True)
        except:
            await page.get_by_text("Bộ lọc", exact=True).first.click(force=True)
        await asyncio.sleep(3)
        try:
            await page.locator('.arco-picker-range, .core-picker-range').first.click(force=True)
        except:
            await page.locator('div').filter(has_text="Thời gian đã tạo").last.click(force=True)
        await asyncio.sleep(3)
        import datetime as dt, calendar
        d_from = dt.datetime.strptime(from_date, "%Y-%m-%d")
        d_to   = dt.datetime.strptime(to_date,   "%Y-%m-%d")
        THANG_TAI = d_from.month
        NAM = str(d_from.year)

        # Lùi tháng về đúng tháng của from_date (copy y chang tiktok_xu_ly_don_hang)
        target_month_text = f"{str(THANG_TAI).zfill(2)}/{NAM}"
        for _ in range(24):
            current_month_text = await page.locator('.core-picker-header-value').first.inner_text()
            if target_month_text in current_month_text.replace(" ", ""):
                break
            try:
                await page.locator('.core-picker-header').first.locator('svg.arco-icon-left').first.click(force=True)
            except:
                await page.locator('div[class*="-header-icon-prev"]').first.click(force=True)
            await asyncio.sleep(2)

        # JS click đúng ngày (copy y chang tiktok_xu_ly_don_hang)
        js_click_exact = '''(args) => {
            const leftPanel = document.querySelectorAll('.core-panel-date-inner, .arco-picker-date-panel')[0];
            if (!leftPanel) return "fail";
            const cells = Array.from(leftPanel.querySelectorAll('div[class*="-picker-cell-inner"], div[class*="-picker-date"]'));
            const matchingCells = cells.filter(c => c.innerText.trim() === args.targetText);
            if (matchingCells.length === 0) return "fail";
            const targetCell = args.isFirst ? matchingCells[0] : matchingCells[matchingCells.length - 1];
            targetCell.click(); return "OK";
        }'''

        # Chọn ngày bắt đầu
        await page.evaluate(js_click_exact, {"targetText": str(d_from.day).zfill(2), "isFirst": True})
        await asyncio.sleep(2)

        # Chọn ngày kết thúc — tìm số không bị ẩn cuối cùng khớp với to_day
        to_day_str = str(d_to.day).zfill(2)
        js_click_to = '''(args) => {
            // Tìm trong CẢ HAI panel (trái + phải)
            const allPanels = document.querySelectorAll('.core-panel-date-inner, .arco-picker-date-panel');
            let found = null;
            for (const panel of allPanels) {
                const cells = Array.from(panel.querySelectorAll('div[class*="-picker-cell-inner"], div[class*="-picker-date"]'));
                const matches = cells.filter(c => {
                    if (c.innerText.trim() !== args.day) return false;
                    // Kiểm tra cell cha không bị disabled/grayed
                    const parent = c.closest('td, div[class*="-cell"]');
                    if (!parent) return true;
                    const cls = parent.className || "";
                    return !cls.includes("disabled") && !cls.includes("gray") && !cls.includes("outside");
                });
                if (matches.length > 0) found = matches[matches.length - 1];
            }
            if (found) { found.click(); return "OK"; }
            return "NOTFOUND";
        }'''
        res = await page.evaluate(js_click_to, {"day": to_day_str})
        self.log(f"📅 Click ngày kết thúc {to_day_str}: {res}")
        await asyncio.sleep(3)

        # Bấm Áp dụng
        try:
            await page.get_by_text("Áp dụng", exact=True).last.click(force=True)
        except:
            await page.locator('button').filter(has_text="Áp dụng").first.click(force=True)
        await asyncio.sleep(8)
        # Xuất và tải
        js_xuat = '''() => {
            let btn = Array.from(document.querySelectorAll('button, div')).reverse()
                .find(el => el.innerText && el.innerText.trim() === 'Xuất');
            if (btn) { btn.click(); return "OK"; } return "FAIL";
        }'''
        await page.evaluate(js_xuat)
        await asyncio.sleep(5)
        try:
            await page.locator('label').filter(has_text="Excel").first.click(force=True)
        except:
            pass
        await asyncio.sleep(3)
        try:
            await page.locator('button.core-btn-primary, button.arco-btn-primary').filter(has_text="Xuất").first.click(force=True)
        except:
            await page.get_by_text("Xuất", exact=True).last.click(force=True)
        await asyncio.sleep(5)
        for i in range(60):
            try:
                btn_tai = page.locator('a, button, span').filter(has_text="Tải xuống").first
                if await btn_tai.is_visible():
                    await asyncio.sleep(3)
                    async with page.expect_download(timeout=60000) as dl_info:
                        await btn_tai.evaluate("node => node.click()")
                    dl = await dl_info.value
                    if not os.path.exists(shop["thu_muc_luu"]):
                        os.makedirs(shop["thu_muc_luu"])
                    ext = dl.suggested_filename.split(".")[-1]
                    file_name = f"{shop['ten_shop']}_donhang_{from_date}_{to_date}.{ext}"
                    full_path = os.path.join(shop["thu_muc_luu"], file_name)
                    await dl.save_as(full_path)
                    self.log(f"🏆 Xong đơn hàng TikTok {from_date} → {to_date}")
                    # Đơn hàng ngày: chỉ import vào orders_v2, không upload báo cáo
                    v2_data = self.psr.parse_tiktok_order_excel_local(full_path, shop['ten_shop'])
                    if v2_data:
                        try:
                            api_url2 = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                            data = json.dumps(v2_data).encode('utf-8')
                            req = urllib.request.Request(api_url2, data=data,
                                headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'},
                                method='POST')
                            with urllib.request.urlopen(req, timeout=60) as res:
                                result = json.loads(res.read().decode())
                                self.log(f"✅ Import TikTok: {result.get('imported_orders',0)} đơn, {result.get('imported_items',0)} items")
                        except Exception as e:
                            self.log(f"⚠️ Lỗi import TikTok V2: {str(e)}")
                    break
            except:
                pass
            await asyncio.sleep(5)
            
            
    