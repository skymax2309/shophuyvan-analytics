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
            await page.get_by_text("Tất cả thông tin", exact=True).first.click(force=True)
            await asyncio.sleep(2)
            await page.locator('button:has-text("Chọn các sản phẩm"), button:has-text("Chọn sản phẩm")').first.click(force=True)
            await asyncio.sleep(4)

            while True:
                await page.evaluate('''() => {
                    const wrapper = document.querySelector('th .arco-checkbox');
                    if (wrapper) wrapper.click();
                    else { const cb = document.querySelector('th input[type="checkbox"]'); if(cb) cb.click(); }
                }''')
                await asyncio.sleep(5)
                status = await page.evaluate('''() => {
                    const next = document.querySelector('.arco-pagination-item-next');
                    if (!next || next.classList.contains('arco-pagination-item-disabled')) return "disabled";
                    next.click(); return "clicked";
                }''')
                if status != "clicked": break
                await asyncio.sleep(5)

            await page.locator('button:has-text("Chọn mục đã lọc"), button:has-text("Xác nhận")').first.click(force=True)
            await asyncio.sleep(3)
            await page.locator('button:has-text("Tạo mẫu")').first.click(force=True)
            self.log("👉 Đã bấm Tạo mẫu. Đang chờ TikTok chuẩn bị file (Có thể mất 5-10 phút)...")

            # Vòng lặp kiên nhẫn 10 phút (200 vòng x 3s)
            for i in range(200):
                # KHÓA MẮT BOT: Chỉ nhìn vào dòng đầu tiên của bảng dữ liệu (tbody tr)
                first_row = page.locator("tbody tr").first
                dang_tai_visible = await first_row.locator("text='Đang tải', text='Đang xuất', text='Đang tạo', text='Loading', text='Exporting'").first.is_visible()
                
                if dang_tai_visible:
                    if i % 5 == 0:
                        self.log("⏳ TikTok đang xoay chuẩn bị dữ liệu tại dòng 1, vui lòng không tắt trình duyệt...")
                    await asyncio.sleep(3)
                    continue
                    
                # Tìm nút Tải Xuống nằm gọn trong dòng 1
                btn_dl = first_row.locator("text='Tải xuống', text='Download'").first
                
                if await btn_dl.is_visible():
                    self.log("✅ Quá trình tạo hoàn tất! Chuẩn bị lấy file về...")
                    break
                    
                await asyncio.sleep(3)

            self.log("⏳ Đang tiêm Javascript bọc thép để kích hoạt nút Tải Dòng 1...")
            try:
                async with page.expect_download(timeout=60000) as dl_info:
                    # Dùng JS can thiệp sâu: Tìm chữ Tải xuống, sau đó tự leo lên thẻ Button/A bọc ngoài để click
                    await page.evaluate("""() => {
                        let firstRow = document.querySelector('table tbody tr:nth-child(1)');
                        if (firstRow) {
                            let elements = Array.from(firstRow.querySelectorAll('button, a, span'));
                            let target = elements.find(el => el.innerText && el.innerText.includes('Tải xuống'));
                            if (target) {
                                // Móc ngược lên tìm thẻ button/a thực sự chứa sự kiện tải
                                let clickable = target.closest('button, a') || target;
                                clickable.click();
                            } else {
                                throw new Error("Không tìm thấy chữ Tải xuống trong JS");
                            }
                        } else {
                            throw new Error("Không tìm thấy dòng 1 của bảng dữ liệu");
                        }
                    }""")
                dl = await dl_info.value
            except Exception as e:
                self.log(f"⚠️ JS lõi bị chặn, thử đòn cuối bằng tọa độ... ({str(e)[:50]})")
                try:
                    # Chốt mục tiêu fallback
                    first_row = page.locator("tbody tr").first
                    btn_dl = first_row.locator("button, a").filter(has_text="Tải xuống").first
                    await btn_dl.scroll_into_view_if_needed()
                    
                    async with page.expect_download(timeout=60000) as dl_info:
                        await btn_dl.click(force=True)
                    dl = await dl_info.value
                except Exception as ex:
                    self.log(f"❌ BÓ TAY: TikTok chặn hoàn toàn mọi lệnh click. Lỗi: {str(ex)}")
                    return
            except Exception as e:
                self.log("⚠️ Click thường bị từ chối, đang ép tải bằng Javascript lõi...")
                async with page.expect_download(timeout=60000) as dl_info:
                    # Chạy thẳng vào lõi JS, tìm thẻ cha để click nếu thẻ hiện tại là thẻ span bị vô hiệu hóa sự kiện
                    await btn_dl.evaluate("el => { const parent = el.closest('button, a') || el; parent.click(); }")
                dl = await dl_info.value
            
            # ÉP LƯU RA THƯ MỤC GỐC (auto OMS Python)
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
                        # ÉP DÙNG shop_id CHUẨN XỊN THAY VÌ ten_shop
                        process_tiktok_excel_and_sync(shop_id, new_path, self.log)
                    except Exception as e: self.log(f"Lỗi sync: {e}")

            os.remove(zip_path)
            shutil.rmtree(extract_dir)
            self.log("🎉 HOÀN TẤT ĐỒNG BỘ TIKTOK!")
        except Exception as e: self.log(f"❌ Lỗi: {str(e)}")
