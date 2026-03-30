import asyncio
import traceback
import sys
import os

# Import BaseAuth từ thư mục cha (engines)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from base_auth import BaseAuth

class TikTokAuth(BaseAuth):
    def __init__(self, log_func):
        super().__init__(log_func, "TikTok")

    async def check_and_login(self, page, shop):
        ten_shop = shop.get('ten_shop', 'Không rõ')
        self.log_step(f"🔑 Kiểm tra phiên đăng nhập cho shop: {ten_shop}")
        try:
            self.log_step("Đang truy cập trang đăng nhập TikTok...")
            await page.goto("https://seller-vn.tiktok.com/account/login", wait_until="commit")
            try:
                await page.wait_for_load_state("networkidle", timeout=10000)
            except:
                pass
            await asyncio.sleep(5)

            has_pw = await page.locator('input[type="password"]').count() > 0
            if "login" not in page.url and "account/login" not in page.url and not has_pw:
                self.log_step("✅ Trạng thái: Đã đăng nhập sẵn. Cookie còn sống!")
                return True

            self.log_step("⚠️ Trạng thái: Chưa đăng nhập. Tiến hành điền Số điện thoại...")
            try:
                tai_khoan = shop.get("email_login") or shop.get("user_name", "")
                mat_khau = shop.get("mat_khau", "")

                tk_loc = page.locator('input[placeholder*="Số điện thoại"], input[name="mobile"], input[type="text"]').first
                await tk_loc.wait_for(state="visible", timeout=5000)
                await tk_loc.click()
                if tai_khoan:
                    await tk_loc.fill(tai_khoan)
                await asyncio.sleep(1)
                
                mk_loc = page.locator('input[type="password"]').first
                await mk_loc.click()
                if mat_khau:
                    await mk_loc.fill(mat_khau)
                await asyncio.sleep(1)
                
                if tai_khoan and mat_khau:
                    self.log_step("🔑 Đã điền xong. Đang bấm nút Đăng nhập...")
                    btn_login = page.locator('button:has-text("Đăng nhập"), button[type="submit"]').first
                    await btn_login.click(force=True)
                else:
                    self.log_step("⚠️ Thiếu thông tin trong file, mời bạn nhập nốt phần còn thiếu...")
            except Exception as e:
                self.log_step(f"⚠️ Giao diện thay đổi hoặc load chậm: {str(e)}")

            self.log_step("⏳ Mời bạn vượt Captcha/OTP (nếu có). Bot sẽ CHỜ TỐI ĐA 3 PHÚT (180s)...")
            for _ in range(60):
                await asyncio.sleep(3)
                if "login" not in page.url and "account/login" not in page.url and await page.locator('input[type="password"]').count() == 0:
                    self.log_step("🎉 Đăng nhập thành công! Đã tự động lưu lại Cookie mới.")
                    return True
                    
            self.log_step("❌ Quá thời gian chờ đăng nhập (3 phút). Vui lòng chạy lại!")
            return False

        except Exception as e:
            self.log_step(f"❌ Lỗi nghiêm trọng trong luồng đăng nhập: {str(e)}")
            self.log_step(traceback.format_exc())
            return False
