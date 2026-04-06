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
        # BỌC THÉP: Ưu tiên dùng user_name làm định danh chuẩn, fallback về ten_shop
        shop_id = shop.get('user_name', shop.get('ten_shop', 'Unknown'))
        safe_shop_name = shop_id.replace('/', '_')
        self.log(f"🤖 Bắt đầu tải Excel Tiktok cho shop: {shop_id}")
        if not await self.auth.check_and_login(page, shop): return
        await page.goto("https://seller-vn.tiktok.com/product/batch/edit-prods?entry-from=manage&shop_region=VN", wait_until="commit")
        await asyncio.sleep(8)

        try:
            # 1. Tắt popup rác cản đường (nếu có)
            try:
                popups = await page.locator("button:has-text('Đã hiểu'), button:has-text('Đóng'), .TUXModal-close").all()
                for popup in popups:
                    if await popup.is_visible(): await popup.click()
            except: pass

            # 2. Bấm "Chọn các sản phẩm" (Bỏ qua bước Chọn Tất cả thông tin vì TikTok đã mặc định)
            self.log("   ⚙️ Đang bấm nút 'Chọn các sản phẩm'...")
            try:
                await page.locator('button:has-text("Chọn các sản phẩm"), button:has-text("Chọn sản phẩm")').first.click(timeout=15000, force=True)
                await asyncio.sleep(4)
            except Exception as e:
                self.log(f"   ❌ Lỗi không tìm thấy nút 'Chọn sản phẩm': {str(e)[:50]}")
                return

            # 3. Vòng lặp tick chọn toàn bộ sản phẩm trên tất cả các trang
            self.log("   ⚙️ Đang tick chọn toàn bộ sản phẩm...")
            while True:
                await page.evaluate('''() => {
                    // Cập nhật class CSS mới của TikTok: core-checkbox-mask
                    const wrapper = document.querySelector('th .arco-checkbox, th .core-checkbox-mask');
                    if (wrapper) wrapper.click();
                    else { const cb = document.querySelector('th input[type="checkbox"]'); if(cb) cb.click(); }
                }''')
                await asyncio.sleep(3)
                
                # Bấm trang tiếp theo
                status = await page.evaluate('''() => {
                    const next = document.querySelector('.arco-pagination-item-next, .core-pagination-next');
                    if (!next || next.classList.contains('arco-pagination-item-disabled') || next.classList.contains('core-pagination-disabled')) return "disabled";
                    next.click(); return "clicked";
                }''')
                if status != "clicked": break
                await asyncio.sleep(4)

            # 4. Xác nhận và Tạo mẫu
            self.log("   ⚙️ Đang Xác nhận & Yêu cầu Tạo mẫu Excel...")
            await page.locator('button:has-text("Chọn mục đã lọc"), button:has-text("Xác nhận")').first.click(force=True)
            await asyncio.sleep(3)
            await page.locator('button:has-text("Tạo mẫu")').first.click(force=True)
            
            # --- CƠ CHẾ CHỜ TẢI BỌC THÉP ---
            dl = None
            self.log("⏳ Đang chờ TikTok chuẩn bị dữ liệu (Có thể mất 5-10 phút)...")
            
            for i in range(200):
                status = await page.evaluate('''() => {
                    let rows = Array.from(document.querySelectorAll('.arco-table-tr, tbody tr'));
                    let dataRows = rows.filter(r => r.innerText && r.innerText.trim().length > 10);
                    
                    if (dataRows.length > 0) {
                        let txt = dataRows[0].innerText.toLowerCase();
                        if (txt.includes('đang tải') || txt.includes('đang xuất') || txt.includes('đang tạo') || txt.includes('loading')) {
                            return "loading";
                        }
                        
                        let elements = Array.from(dataRows[0].querySelectorAll('*'));
                        let hasDownload = elements.some(el => {
                            let t = (el.innerText || '').trim().toLowerCase();
                            return t === 'tải xuống' || t === 'download';
                        });
                        
                        if (hasDownload) return "ready";
                    }
                    return "waiting";
                }''')
                
                if status == "ready":
                    self.log("✅ Quá trình tạo hoàn tất! Đang dùng Playwright bóp cò tải file...")
                    try:
                        # Bắt chính xác nút "Tải xuống" đầu tiên trên màn hình (Chính là file mới nhất)
                        download_btn = page.locator("button:has-text('Tải xuống'), a:has-text('Tải xuống')").first

                        await download_btn.scroll_into_view_if_needed()
                        await asyncio.sleep(1)

                        async with page.expect_download(timeout=60000) as dl_info:
                            try:
                                # Ưu tiên dùng lực click native của Playwright để kích hoạt React
                                await download_btn.click(force=True)
                            except:
                                # Nếu bị chặn, dùng JS ép click thẳng vào Element đó
                                await download_btn.evaluate("el => el.click()")
                                
                        dl = await dl_info.value
                        break
                    except Exception as e:
                        self.log(f"⚠️ Kích hoạt tải thất bại, đang thử lại... Lỗi: {str(e)[:60]}")
                elif status == "loading" and i % 5 == 0:
                    self.log("⏳ TikTok đang xoay dữ liệu tại dòng 1, vui lòng không tắt trình duyệt...")
                    
                await asyncio.sleep(3)

            if not dl:
                self.log("❌ BÓ TAY: TikTok chặn hoặc quá thời gian không thấy nút Tải xuống xuất hiện.")
                return

            # --- KẾT THÚC CHỜ TẢI, TIẾN HÀNH LƯU FILE ---
            base_dir = os.getcwd() 
            zip_path = os.path.join(base_dir, f"{safe_shop_name}_tiktok.zip")
            await dl.save_as(zip_path)
            self.log(f"✅ Đã lưu file ZIP tại: {zip_path}")

            extract_dir = os.path.join(base_dir, f"{safe_shop_name}_extracted")
            if os.path.exists(extract_dir): shutil.rmtree(extract_dir)
            os.makedirs(extract_dir)

            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)

            for file in os.listdir(extract_dir):
                old_path = os.path.join(extract_dir, file)
                new_name = f"{safe_shop_name}_{file}"
                new_path = os.path.join(extract_dir, new_name)
                os.rename(old_path, new_path)
                
                # Bọc try-except khi đẩy file lên R2 dự phòng, tránh lỗi mạng làm chết quy trình Sync
                try: upload_to_r2(new_path, new_name)
                except: pass
                
                if "template" in new_name.lower() and new_name.endswith('.xlsx'):
                    try: 
                        self.log(f"👉 Bắt đầu đọc dữ liệu sản phẩm TikTok cho: {shop_id}")
                        process_tiktok_excel_and_sync(shop_id, new_path, self.log)
                    except Exception as e: self.log(f"Lỗi sync: {e}")

            os.remove(zip_path)
            shutil.rmtree(extract_dir)
            self.log("🎉 HOÀN TẤT ĐỒNG BỘ TIKTOK!")
        except Exception as e: self.log(f"❌ Lỗi: {str(e)}")

        # ==========================================
    # TÍNH NĂNG CHỜ KẾT NỐI: ĐẨY TỒN KHO LÊN SÀN
    # ==========================================
    async def upload_inventory_excel(self, page, shop, file_path):
        """Hàm này đọc file Excel từ máy tính và bơm thẳng lên Tiktok"""
        shop_id = shop.get('user_name', shop.get('ten_shop', 'Unknown'))
        self.log(f"🚀 [UPLOAD] Bắt đầu đẩy file Tồn kho lên TikTok shop: {shop_id}")
        
        if not os.path.exists(file_path):
            self.log(f"❌ Không tìm thấy file Excel để tải lên tại: {file_path}")
            return False

        if not await self.auth.check_and_login(page, shop): return False
        
        await page.goto("https://seller-vn.tiktok.com/product/batch/edit-prods?entry-from=manage&shop_region=VN", wait_until="commit")
        await asyncio.sleep(8)

        try:
            # 1. Tắt popup quảng cáo nếu có
            try:
                popups = await page.locator("button:has-text('Đã hiểu'), button:has-text('Đóng'), .TUXModal-close").all()
                for popup in popups:
                    if await popup.is_visible(): await popup.click()
            except: pass

            # 2. Chuyển sang Tab "Tải lên" (Dựa theo Log AI của bạn)
            self.log("   ⚙️ Đang chuyển sang Tab 'Tải lên'...")
            try:
                await page.locator('div.pulse-tabs-pane-title-content:has-text("Tải lên"), div:has-text("Tải lên")').first.click(timeout=10000)
                await asyncio.sleep(3)
            except Exception as e:
                self.log(f"   ❌ Lỗi không tìm thấy Tab Tải Lên: {str(e)[:50]}")
                return False

            # 3. Bơm file Excel thẳng vào lỗ hổng Input (Không cần bấm nút "Chọn một file" bằng chuột)
            self.log(f"   📤 Đang bơm file Excel: {os.path.basename(file_path)}")
            file_input = page.locator('input[type="file"], input[accept*="excel"], input[accept*="xls"]').first
            
            # Hàm set_input_files của Playwright sẽ giả lập thao tác User kéo thả file vào web
            await file_input.set_input_files(file_path)
            self.log("   ⏳ Đang chờ TikTok nhai file và xử lý tồn kho...")
            
            # Chờ quá trình upload diễn ra (Khoảng 10 - 15 giây)
            await asyncio.sleep(15)
            self.log("   ✅ Bơm file hoàn tất! Vui lòng kiểm tra trên giao diện TikTok.")
            return True

        except Exception as e:
            self.log(f"   ❌ Lỗi trong quá trình Upload TikTok: {str(e)[:80]}")
            return False