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
                    self.log("✅ Đã Upload file lên R2.")
                    
                    # --- [BỔ SUNG] ĐỌC EXCEL VÀ BẮN GIÁ LÊN DATABASE WEB ---
                    self.log("⏳ Đang bóc tách Giá Khuyến Mãi từ file Excel...")
                    
                    def process_and_push_promo():
                        import pandas as pd
                        import requests
                        try:
                            # Đọc file bằng engine calamine để lách lỗi định dạng
                            try:
                                df = pd.read_excel(file_path, dtype=str, engine='calamine')
                            except:
                                df = pd.read_excel(file_path, dtype=str)
                                
                            # Dò tìm dòng Header thực sự (Shopee hay chèn 3-4 dòng hướng dẫn ở đầu file KM)
                            header_idx = 0
                            for i in range(min(15, len(df))):
                                row_str = " ".join([str(x).lower() for x in df.iloc[i].values])
                                if "sku" in row_str and "giá" in row_str:
                                    header_idx = i + 1
                                    break
                                    
                            if header_idx > 0:
                                try:
                                    df = pd.read_excel(file_path, dtype=str, header=header_idx, engine='calamine')
                                except:
                                    df = pd.read_excel(file_path, dtype=str, header=header_idx)

                            # Tự động quét tìm tên cột (bất chấp Shopee đổi tên)
                            # Ưu tiên lấy SKU Phân Loại trước, nếu không có mới lấy SKU Sản Phẩm
                            COT_SKU = next((c for c in df.columns if "sku phân loại" in str(c).lower()), None) or next((c for c in df.columns if "sku" in str(c).lower()), None)
                            COT_GIA_KM = next((c for c in df.columns if "giá đã giảm" in str(c).lower() or "giá sau giảm" in str(c).lower() or "giá khuyến mãi" in str(c).lower()), None)
                            
                            if not COT_SKU or not COT_GIA_KM:
                                return False, f"Không tìm thấy cột SKU hoặc Giá KM. Các cột đang có: {list(df.columns)}"
                            
                            items = []
                            for _, row in df.iterrows():
                                sku = str(row[COT_SKU]).strip()
                                gia_km_str = str(row[COT_GIA_KM]).replace(',', '').replace('.', '').strip()
                                if sku and sku != 'nan' and gia_km_str.isdigit():
                                    items.append({"sku": sku, "price": float(gia_km_str)})
                                        
                            if not items:
                                return False, "Đã đọc file nhưng không tìm thấy dữ liệu dòng nào có Giá Khuyến Mãi hợp lệ."
                                
                            api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/products/update-promo-prices"
                            payload = {"platform": "shopee", "shop": shop.get("ten_shop", ""), "items": items}
                            res = requests.post(api_url, json=payload)
                            
                            if res.status_code == 200 and res.json().get("success"):
                                return True, f"Đã cập nhật {len(items)} mức Giá KM lên Database Website!"
                            else:
                                return False, f"Lỗi từ Server: {res.text}"
                        except Exception as e:
                            return False, f"Lỗi bóc tách file: {str(e)}"
                    
                    # Chạy ngầm hàm bóc tách để không đơ Tool
                    success, msg = await asyncio.to_thread(process_and_push_promo)
                    if success:
                        self.log(f"🎉 HOÀN THÀNH TÍNH NĂNG 1: {msg}")
                    else:
                        self.log(f"❌ Lỗi cập nhật Giá KM lên Web: {msg}")
                        
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
        self.log("👉 BƯỚC 2: Bắt đầu quá trình Đắp Giá và Up lên Shopee...")
        import os
        import tkinter as tk
        from tkinter import filedialog
        import pandas as pd
        import requests
        
        # --- CẤU HÌNH CỘT EXCEL (Sửa tại đây nếu file Shopee thay đổi tên cột) ---
        COT_SKU = "SKU phân loại"       # Cột chứa mã SKU trong file Shopee
        COT_GIA_MOI = "Giá sau giảm"    # Cột chứa giá khuyến mãi trong file Shopee
        # ------------------------------------------------------------------------

        self.log("👉 Đang mở cửa sổ... Hãy chọn file Excel GỐC mà Bot vừa tải từ Shopee về!")
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        
        thu_muc_luu = shop.get('thu_muc_luu', '').strip()
        file_path_tu_web = filedialog.askopenfilename(
            parent=root, title="Chọn file Excel Shopee Khuyến Mại",
            initialdir=thu_muc_luu if os.path.exists(thu_muc_luu) else "/",
            filetypes=[("Excel files", "*.xlsx *.xls")]
        )
        root.destroy()

        if not file_path_tu_web:
            self.log("⚠️ Đã hủy chọn file. Dừng quá trình Up Giá!")
            return

        self.log(f"✅ Đã chọn file: {os.path.basename(file_path_tu_web)}")
        
        # 2. Gọi API lấy giá mới từ Server
        ten_shop = shop.get('ten_shop', '')
        self.log(f"⏳ Đang tải Bảng Giá Khuyến Mại Mới của shop '{ten_shop}' từ Server...")
        api_url = f"https://huyvan-worker-api.nghiemchihuy.workers.dev/api/products/promo-prices?platform=shopee&shop={ten_shop}"
        
        try:
            res = requests.get(api_url)
            data = res.json()
            if not data.get('success'):
                self.log("❌ Lỗi: Server trả về thất bại!")
                return
                
            bang_gia = data.get('data', [])
            self.log(f"✅ Đã lấy được {len(bang_gia)} mức giá KM mới từ Server.")
            
            # 3. Dùng Pandas đắp giá mới vào file Excel
            if len(bang_gia) > 0:
                self.log("⚙️ Đang đắp Giá Mới vào file Excel...")
                
                # Tạo map nhanh: { "SKU_01": 45000, "SKU_02": 50000 }
                gia_dict = {str(item['platform_sku']).strip(): item['discount_price'] for item in bang_gia if item.get('platform_sku')}
                
                try:
                    try:
                        df = pd.read_excel(file_path_tu_web, dtype=str, engine='calamine')
                    except:
                        df = pd.read_excel(file_path_tu_web, dtype=str)
                        
                    # Dò dòng Header thực sự
                    header_idx = 0
                    for i in range(min(15, len(df))):
                        row_str = " ".join([str(x).lower() for x in df.iloc[i].values])
                        if "sku" in row_str and "giá" in row_str:
                            header_idx = i + 1
                            break
                            
                    if header_idx > 0:
                        try:
                            df = pd.read_excel(file_path_tu_web, dtype=str, header=header_idx, engine='calamine')
                        except:
                            df = pd.read_excel(file_path_tu_web, dtype=str, header=header_idx)

                    # Tự động quét tìm tên cột
                    COT_SKU = next((c for c in df.columns if "sku phân loại" in str(c).lower()), None) or next((c for c in df.columns if "sku" in str(c).lower()), None)
                    COT_GIA_MOI = next((c for c in df.columns if "giá đã giảm" in str(c).lower() or "giá sau giảm" in str(c).lower() or "giá khuyến mãi" in str(c).lower()), None)

                    if COT_SKU and COT_GIA_MOI:
                        count_update = 0
                        for index, row in df.iterrows():
                            sku = str(row[COT_SKU]).strip()
                            if sku in gia_dict:
                                df.at[index, COT_GIA_MOI] = gia_dict[sku]
                                count_update += 1
                                
                        # Lưu ghi đè lại file cũ (Shopee chấp nhận file bị mất vài dòng hướng dẫn ở trên cùng)
                        df.to_excel(file_path_tu_web, index=False)
                        self.log(f"✅ Đã thay đổi thành công {count_update} dòng giá mới vào file!")
                    else:
                        self.log(f"⚠️ CẢNH BÁO: Không tìm thấy cột SKU hoặc Giá. Các cột hiện có: {list(df.columns)}")
                except Exception as e:
                    self.log(f"❌ Lỗi khi xử lý file Excel: {str(e)}")
            else:
                self.log("⚠️ Không có giá KM nào trên Web. Sẽ up file nguyên bản.")

        except Exception as e:
            self.log(f"❌ Lỗi khi kết nối Server lấy Giá: {str(e)}")

        # --- GIAI ĐOẠN 3: PLAYWRIGHT UP FILE LÊN SÀN ---
        self.log("👉 Đang tiến hành đưa file lên Shopee...")
        try:
            try:
                btn_hang_loat = page.locator("button:has-text('Chỉnh sửa hàng loạt'), text='Chỉnh sửa hàng loạt'").first
                if await btn_hang_loat.is_visible(timeout=3000):
                    await btn_hang_loat.click(force=True)
                    import asyncio
                    await asyncio.sleep(2)
            except: pass 

            async with page.expect_file_chooser(timeout=10000) as fc_info:
                btn_chon_file = page.locator("button:has-text('Chọn tập tin')").first
                await btn_chon_file.click(force=True)
            
            file_chooser = await fc_info.value
            await file_chooser.set_files(file_path_tu_web)
            
            self.log("🎉 XUẤT SẮC: Đã đưa file chứa Giá Mới vào hệ thống Shopee thành công!")
            
            self.log("🛑 Đang giữ trình duyệt 30s. Bạn hãy xem Shopee báo 'Thành công' chưa nhé...")
            import asyncio
            await asyncio.sleep(30)
            
        except Exception as e:
            self.log(f"❌ Lỗi Playwright khi Up file lên Shopee: {str(e)}")
