import asyncio
from .shopee_auth import ShopeeAuth

class ShopeePromo:
    def __init__(self, log_func, auth, rescue_func=None):
        self.log = log_func
        self.auth = auth # Sử dụng auth được truyền từ ShopeeEngine
        self.rescue_wait = rescue_func

    async def dong_bo_gia_khuyen_mai(self, page, shop, action="up_gia"):
        # 1. GỌI BẢO VỆ RA KIỂM TRA ĐĂNG NHẬP TRƯỚC TIÊN
        is_logged_in = await self.auth.check_and_login(page, shop)
        if not is_logged_in:
            self.log("❌ Dừng tiến trình Khuyến Mại vì chưa đăng nhập thành công!")
            return False

        mo_ta = "CÀO DỮ LIỆU" if action == "tai_file" else "UP GIÁ"
        self.log(f"🚀 Bắt đầu quy trình {mo_ta} Khuyến Mại cho shop: {shop['ten_shop']}")
        
        url_km = "https://banhang.shopee.vn/portal/marketing/list/discount/?discountType=all&status=all&page=1"
        self.log("👉 Bước 1: Đang truy cập Kênh Marketing...")
        await page.goto(url_km, wait_until="commit")
        await asyncio.sleep(5)
        
        self.log("👉 Đang tìm nút 'Chỉnh sửa' của Chương Trình Của Shop...")
        try:
            rows = await page.locator("tbody tr").all()
            found = False
            
            for row in rows:
                text = await row.inner_text()
                if "Chương Trình Của Shop" in text or "Chương trình của Shop" in text:
                    btn_sua = row.locator("text='Chỉnh sửa'")
                    if await btn_sua.count() > 0:
                        await btn_sua.first.click(force=True)
                        self.log("✅ Đã bấm nút 'Chỉnh sửa'. Đang chờ load trang chi tiết...")
                        await asyncio.sleep(8) # Chờ load data sản phẩm
                        found = True
                        break
            
            if not found:
                self.log("⚠️ Không tìm thấy 'Chương Trình Của Shop' nào đang chạy để chỉnh sửa!")
                return False
                
        except Exception as e:
            self.log(f"❌ Lỗi ở Bước 1: {str(e)}")
            return False
            
        self.log("🛑 ĐÃ VÀO TRANG TỔNG QUAN KHUYẾN MÃI.")
        
        # Bấm nút "Chỉnh sửa giảm giá" (Nút mà bạn khoanh đỏ)
        try:
            self.log("👉 Đang tìm và bấm nút 'Chỉnh sửa giảm giá'...")
            btn_edit_discount = page.locator("text='Chỉnh sửa giảm giá'").first
            await btn_edit_discount.click(force=True)
            self.log("✅ Đã bấm nút 'Chỉnh sửa giảm giá'. Đang chờ load bảng dữ liệu...")
            await asyncio.sleep(6) # Chờ 6 giây cho bảng input giá hiện ra
        except Exception as e:
            self.log("⚠️ Không tìm thấy nút 'Chỉnh sửa giảm giá'. Có thể đã ở trong chế độ sửa.")

        # 3. CHIA LUỒNG XỬ LÝ DỰA VÀO NÚT BẤM
        if action == "tai_file":
            await self._xuat_file_excel_km(page, shop)
        elif action == "up_gia":
            await self._nhap_gia_km_tu_web(page, shop)
            
        return True

    # ==========================================
    # NHÁNH 1: TẢI FILE EXCEL KHUYẾN MẠI TỪ SHOPEE
    # ==========================================
    async def _xuat_file_excel_km(self, page, shop):
        self.log("👉 BƯỚC 2: Bắt đầu quá trình tải file Excel Khuyến Mại...")
        
        try:
            # 1. Bấm mở Pop-up Chỉnh sửa hàng loạt (Nếu nó chưa tự hiện)
            try:
                btn_hang_loat = page.locator("button:has-text('Chỉnh sửa hàng loạt'), text='Chỉnh sửa hàng loạt'").first
                if await btn_hang_loat.is_visible(timeout=3000):
                    await btn_hang_loat.click(force=True)
                    self.log("👉 Đã bấm mở bảng 'Chỉnh sửa hàng loạt'.")
                    import asyncio
                    await asyncio.sleep(2)
            except:
                pass # Bỏ qua nếu bảng pop-up đã tự động mở sẵn
                
            # 2. Bấm nút Tải về thông tin sản phẩm và chờ file
            self.log("👉 Đang tìm nút 'Tải về thông tin sản phẩm'...")
            btn_tai_ve = page.locator("text='Tải về thông tin sản phẩm'").first
            
            if await btn_tai_ve.count() > 0:
                self.log("⏳ Đang ra lệnh tải file, vui lòng đợi Shopee xử lý (có thể mất vài chục giây)...")
                import os
                
                # Bắt sự kiện trình duyệt tải file
                async with page.expect_download(timeout=60000) as download_info:
                    await btn_tai_ve.click(force=True)
                
                download = await download_info.value
                
                # 3. Tạo thư mục và Lưu file
                thu_muc_luu = shop.get('thu_muc_luu', '').strip()
                if not thu_muc_luu:
                    self.log("❌ Lỗi: Shop này chưa cấu hình 'Thư mục lưu'. Không thể lưu file!")
                    return
                    
                if not os.path.exists(thu_muc_luu):
                    os.makedirs(thu_muc_luu)
                    
                file_path = os.path.join(thu_muc_luu, download.suggested_filename)
                await download.save_as(file_path)
                
                self.log(f"✅ Đã tải file Excel Khuyến Mại thành công!")
                self.log(f"📁 Đường dẫn: {file_path}")
                
                # --- Bắn file lên Website qua API ---
                self.log("⏳ Đang đẩy file Khuyến Mại lên Website (Cloud R2)...")
                import asyncio
                from utils import upload_to_r2, trigger_server_import
                
                remote_name = f"{shop.get('user_name', 'shop')}_shopee_promo.xlsx"
                
                # Chạy hàm upload ngầm
                ket_qua_up = await asyncio.to_thread(
                    upload_to_r2, 
                    file_path, 
                    remote_name
                )
                
                if ket_qua_up:
                    self.log("✅ Đã Upload file lên R2. Đang báo Server xử lý Khuyến Mại...")
                    # Kích hoạt server xử lý file
                    await asyncio.to_thread(
                        trigger_server_import,
                        remote_name,
                        shop.get('ten_shop', 'KhongRo'),
                        'shopee',
                        'promo_excel'
                    )
                    self.log("🎉 HOÀN THÀNH TÍNH NĂNG 1: Dữ liệu Khuyến Mại đã bắn lên Website!")
                else:
                    self.log("❌ Lỗi: Đẩy file Khuyến Mại lên R2 thất bại.")
                
            else:
                self.log("❌ Không tìm thấy nút 'Tải về thông tin sản phẩm' trên màn hình!")
                
        except Exception as e:
            self.log(f"❌ Lỗi khi tải và up file Excel: {str(e)}")

    # ==========================================
    # NHÁNH 2: UP GIÁ KHUYẾN MẠI TỪ WEB LÊN SHOPEE
    # ==========================================
    async def _nhap_gia_km_tu_web(self, page, shop):
        self.log("👉 BƯỚC 2: Bắt đầu quá trình Up Giá mới lên Shopee...")
        
        # --- LƯU Ý VỀ CODE ---
        # Để không đoán bừa API, mình đang dùng tạm chính cái file bạn vừa tải lúc nãy để test Playwright.
        # Lát nữa test xong, bạn gửi API tải file của Website để mình ráp vào thay thế đoạn lấy file này nhé!
        import os
        thu_muc_luu = shop.get('thu_muc_luu', '').strip()
        file_path_tu_web = os.path.join(thu_muc_luu, "discount_nominate_2026-03-28.xlsx")
        
        if not os.path.exists(file_path_tu_web):
            self.log(f"❌ Lỗi: Không tìm thấy file {file_path_tu_web} để test tải lên!")
            return

        # --- GIAI ĐOẠN 2: PLAYWRIGHT UP FILE LÊN SÀN ---
        try:
            # 1. Bấm mở Pop-up Chỉnh sửa hàng loạt (Nếu nó chưa tự hiện)
            try:
                btn_hang_loat = page.locator("button:has-text('Chỉnh sửa hàng loạt'), text='Chỉnh sửa hàng loạt'").first
                if await btn_hang_loat.is_visible(timeout=3000):
                    await btn_hang_loat.click(force=True)
                    self.log("👉 Đã bấm mở bảng 'Chỉnh sửa hàng loạt'.")
                    import asyncio
                    await asyncio.sleep(2)
            except:
                pass 

            # 2. Bắt sự kiện chọn file của Windows và tải lên
            self.log("👉 Đang tìm và bấm nút 'Chọn tập tin'...")
            
           # Cú pháp bắt buộc của Playwright để xử lý cửa sổ Upload File
            async with page.expect_file_chooser(timeout=10000) as fc_info:
                # Sửa lại cú pháp tìm nút chuẩn để Playwright không bị lỗi CSS
                btn_chon_file = page.locator("button:has-text('Chọn tập tin')").first
                await btn_chon_file.click(force=True)
            
            file_chooser = await fc_info.value
            await file_chooser.set_files(file_path_tu_web)
            
            self.log("✅ Đã đưa file vào hệ thống Shopee thành công!")
            
            # Giữ trình duyệt để Huy quan sát thanh tiến trình của Shopee
            self.log("🛑 Đang giữ trình duyệt 30s. Bạn hãy xem Shopee có báo 'Thành công' hay không nhé...")
            import asyncio
            await asyncio.sleep(30)
            
        except Exception as e:
            self.log(f"❌ Lỗi khi Up file Khuyến Mại lên Shopee: {str(e)}")
