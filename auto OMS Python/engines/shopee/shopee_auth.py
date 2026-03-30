import asyncio
import traceback
import sys
import os

# Import BaseAuth từ thư mục cha (engines)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engines.base_auth import BaseAuth

class ShopeeAuth(BaseAuth):
    def __init__(self, log_func):
        super().__init__(log_func, "Shopee")

    async def check_and_login(self, page, shop):
        self.log_step(f"🔑 Kiểm tra phiên đăng nhập: {shop['ten_shop']}")
        try:
            self.log_step("Đang mở trang chủ bán hàng...")
            await page.goto("https://banhang.shopee.vn/", wait_until="commit")
            await asyncio.sleep(5)
            
            if "login" not in page.url:
                self.log_step("✅ Trạng thái: Đã đăng nhập sẵn.")
                return True
                
            self.log_step("⚠️ Trạng thái: Chưa đăng nhập. Đang điền tài khoản...")
            user_name = shop.get("user_name") or shop.get("tai_khoan", "")
            if user_name:
                try:
                    self.log_step("Đang chờ ô nhập tài khoản xuất hiện...")
                    await page.wait_for_selector('input[placeholder*="Email/Số điện thoại/Tên đăng nhập"]', timeout=10000)
                    await page.locator('input[placeholder*="Email/Số điện thoại/Tên đăng nhập"]').fill(user_name)
                    if shop.get("mat_khau"):
                        await page.locator('input[type="password"]').first.fill(shop["mat_khau"])
                        await page.keyboard.press("Enter")
                    self.log_step("👉 Đã điền xong. Đang chờ bạn xác minh OTP/Captcha...")
                except Exception as e:
                    self.log_step(f"❌ Lỗi khi tự động điền tài khoản: {str(e)}")

            # Đợi tối đa 10 phút (120 lần x 5s) để user có đủ thời gian xác minh Email/OTP
            for _ in range(120): 
                await asyncio.sleep(5)
                if "login" not in page.url:
                    try:
                        is_inside = await page.evaluate('''() => {
                            return !!document.querySelector('.shop-name, .account-name, .brand-name, .seller-name');
                        }''')
                        
                        if is_inside:
                            self.log_step("🎉 Đăng nhập và Xác minh thành công! Đã vào Kênh Người Bán.")
                            return True
                        else:
                            self.log_step("⏳ Đang vướng màn hình Xác minh (Email/OTP). Bạn có 10 phút để xử lý...")
                    except Exception:
                        pass
                        
            self.log_step("❌ Quá thời gian chờ (10 phút). Trình duyệt sẽ tự đóng!")
            return False
            
        except Exception as e:
            self.log_step(f"❌ Lỗi nghiêm trọng trong luồng đăng nhập: {str(e)}")
            self.log_step(traceback.format_exc()) # Dò mìn chính xác dòng bị lỗi
            return False

    async def re_verify(self, page, shop):
        """Xử lý khi Shopee yêu cầu nhập lại mật khẩu xác minh"""
        try:
            pass_input = await page.query_selector('input[type="password"]')
            if pass_input and shop.get("mat_khau"):
                self.log_step("🔒 Shopee yêu cầu xác minh mật khẩu, đang tự động nhập...")
                await page.fill('input[type="password"]', shop["mat_khau"])
                await page.keyboard.press("Enter")
                await asyncio.sleep(8)
        except Exception as e:
            self.log_step(f"❌ Lỗi khi tự động nhập lại mật khẩu: {str(e)}")
