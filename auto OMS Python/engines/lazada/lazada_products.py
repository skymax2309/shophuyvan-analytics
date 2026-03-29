import asyncio
import os
import shutil

class LazadaProducts:
    def __init__(self, log_func, auth):
        self.log = log_func
        self.auth = auth

    async def run(self, page, shop):
        self.log(f"🤖 Bắt đầu tự động tải 3 file Excel LAZADA cho shop: {shop.get('ten_shop', 'Unnamed')}")
        
        # 1. Kiểm tra đăng nhập
        if not await self.auth.check_and_login(page, shop): 
            return

        # 2. Vào thẳng trang Quản lý Sản Phẩm
        self.log("👉 Đang truy cập Kênh Người Bán Lazada...")
        await page.goto("https://sellercenter.lazada.vn/apps/product/list?tab=online_product", wait_until="commit")
        await asyncio.sleep(5)

        report_types = [
            "Thông tin cơ bản",
            "Số lượng và Giá bán",
            "Ảnh biến thể sản phẩm"
        ]

        # ĐỌC THƯ MỤC LƯU TỪ CẤU HÌNH GIAO DIỆN CỦA BẠN
        base_dir = shop.get('thu_muc_luu', '').strip()
        
        # Fallback: Nếu bạn chưa cấu hình trên UI, tự động lưu vào thư mục gốc của code
        if not base_dir or not os.path.exists(base_dir):
            base_dir = os.path.dirname(os.path.abspath(__file__))
            
        self.log(f"📁 Thư mục đích: {base_dir}")

        try:
            self.log("👉 Đang mở bảng điều khiển Xuất Dữ Liệu...")
            await page.locator("button:has-text('Xuất dữ liệu'), span:has-text('Xuất dữ liệu')").first.click()
            await asyncio.sleep(2)
            await page.locator("text='Xuất toàn bộ'").first.click()
            await asyncio.sleep(4)
        except Exception as e:
            self.log(f"❌ Lỗi không thể mở Menu Xuất dữ liệu: {e}")
            return

        # VÒNG LẶP XỬ LÝ 3 FILE
        for i, report_name in enumerate(report_types):
            self.log(f"==========================================")
            self.log(f"🚀 BẮT ĐẦU TẢI FILE {i+1}/3: [{report_name}]")
            
            try:
                # Nếu không phải file đầu, bấm chọn loại báo cáo
                if i > 0:
                    self.log(f"👉 Chọn loại báo cáo: {report_name}")
                    await page.locator(f"span.label:has-text('{report_name}'), span:has-text('{report_name}')").first.click(force=True)
                    await asyncio.sleep(1)

                # Bấm Xuất File
                await page.locator("button:has-text('Xuất file Excel'), span.next-btn-helper:has-text('Xuất file Excel')").first.click(force=True)
                self.log(f"👉 Đã bóp cò! Lazada đang hiển thị vòng xoay phần trăm (%)...")
                await asyncio.sleep(2) 

                # Vòng lặp kiên nhẫn chờ Pop-up Loading quay xong 100%
                btn_dl = None
                for wait_time in range(100): 
                    # Bắt đúng chữ "Tải về Tập Tin" hoặc "tải về liên kết" như trong ảnh bạn gửi
                    btn_dl = page.locator("a:has-text('Tải về Tập Tin'), a:has-text('tải về liên kết')").first
                    
                    if await btn_dl.is_visible():
                        self.log(f"✅ Lazada đã load 100% và tạo xong file [{report_name}]!")
                        break
                        
                    if wait_time % 5 == 0:
                        self.log(f"⏳ Vẫn đang xoay vòng Loading, vui lòng chờ...")
                    await asyncio.sleep(3)

                if not btn_dl or not await btn_dl.is_visible():
                    self.log(f"❌ Lỗi Timeout: Chờ quá 5 phút không thấy chữ 'Tải về Tập Tin'. Bỏ qua file này.")
                    if i < len(report_types) - 1:
                        self.log("👉 Bấm Quay lại để cứu vãn file tiếp theo...")
                        await page.locator("text='Quay lại trang Xuất dữ liệu'").first.click(force=True)
                        await asyncio.sleep(4)
                    continue

                self.log(f"⏳ Đang kích hoạt Tải file [{report_name}] về máy...")
                await btn_dl.scroll_into_view_if_needed()
                await asyncio.sleep(1)

                try:
                    async with page.expect_download(timeout=60000) as dl_info:
                        await btn_dl.click()
                    dl = await dl_info.value
                except Exception as click_err:
                    self.log(f"⚠️ Click thường hụt, dùng JS ép tải... ({str(click_err)[:30]})")
                    async with page.expect_download(timeout=60000) as dl_info:
                        await btn_dl.evaluate("el => el.click()")
                    dl = await dl_info.value

                # Lưu file
                file_name = f"{shop.get('ten_shop', 'Shop').replace('/', '_')}_lazada_{i+1}.xlsx"
                file_path = os.path.join(base_dir, file_name)
                await dl.save_as(file_path)
                self.log(f"🎉 Đã lưu thành công: {file_name}")

                # Hoàn thành 1 file thì bấm chữ "< Quay lại trang Xuất dữ liệu" ở góc trên bên trái
                if i < len(report_types) - 1:
                    self.log("👉 Đang bấm '< Quay lại trang Xuất dữ liệu' để làm file tiếp theo...")
                    await page.locator("text='Quay lại trang Xuất dữ liệu'").first.click(force=True)
                    await asyncio.sleep(4)

            except Exception as e:
                self.log(f"❌ Lỗi trong quá trình xử lý file [{report_name}]: {e}")
                # Kịch bản thoát hiểm
                if i < len(report_types) - 1:
                    try:
                        await page.locator("text='Quay lại trang Xuất dữ liệu'").first.click(force=True)
                        await asyncio.sleep(4)
                    except: pass

        self.log("==========================================")
        self.log("🏆 HOÀN TẤT BƯỚC 1: ĐÃ KÉO THÀNH CÔNG 3 FILE LAZADA VỀ MÁY!")

        # BƯỚC 2: XÀO NẤU VÀ ĐỒNG BỘ LÊN WEBSITE OMS
        try:
            from utils import process_lazada_excel_and_sync
            safe_shop_name = shop.get('ten_shop', 'Shop').replace('/', '_')
            
            # Chỉ định đúng tên 3 file vừa lưu để đẩy vào bếp
            file_paths = {
                'basic': os.path.join(base_dir, f"{safe_shop_name}_lazada_1.xlsx"),
                'sales': os.path.join(base_dir, f"{safe_shop_name}_lazada_2.xlsx"),
                'media': os.path.join(base_dir, f"{safe_shop_name}_lazada_3.xlsx")
            }
            
            # Kiểm tra xem đủ 3 file trên ổ cứng chưa rồi mới chạy
            if all(os.path.exists(p) for p in file_paths.values()):
                self.log("👉 Chuẩn bị đưa 3 file Lazada vào hệ thống bóc tách...")
                process_lazada_excel_and_sync(shop.get('ten_shop', 'Unnamed'), file_paths, self.log)
            else:
                self.log("⚠️ Cảnh báo: File bị mất tích! Không đủ 3 file Excel trong thư mục để tiến hành xào nấu.")
        except Exception as e:
            self.log(f"❌ Lỗi hệ thống khi kích hoạt mảng đồng bộ Lazada: {e}")
