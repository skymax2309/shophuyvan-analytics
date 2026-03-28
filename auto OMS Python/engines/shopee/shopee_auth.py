import asyncio

class ShopeeAuth:
    def __init__(self, log_func):
        self.log = log_func

    async def check_and_login(self, page, shop):
        self.log(f"🔑 Kiểm tra phiên đăng nhập Shopee: {shop['ten_shop']}")
        await page.goto("https://banhang.shopee.vn/", wait_until="commit")
        await asyncio.sleep(5)
        
        if "login" not in page.url:
            self.log("✅ Trạng thái: Đã đăng nhập sẵn.")
            return True
            
        self.log("⚠️ Trạng thái: Chưa đăng nhập. Đang điền tài khoản...")
        user_name = shop.get("user_name") or shop.get("tai_khoan", "")
        if user_name:
            try:
                await page.wait_for_selector('input[placeholder*="Email/Số điện thoại/Tên đăng nhập"]', timeout=10000)
                await page.locator('input[placeholder*="Email/Số điện thoại/Tên đăng nhập"]').fill(user_name)
                if shop.get("mat_khau"):
                    await page.locator('input[type="password"]').first.fill(shop["mat_khau"])
                    await page.keyboard.press("Enter")
                self.log(f"👉 Đã điền xong. Đang chờ bạn xác minh OTP/Captcha...")
            except: pass

        # Đợi tối đa 10 phút (120 lần x 5s) để user có đủ thời gian xác minh Email/OTP
        for _ in range(120): 
            await asyncio.sleep(5)
            # Shopee đôi khi đá sang trang chủ nhưng lại hiện popup che mất
            if "login" not in page.url:
                try:
                    # Kiểm tra xem đã vào hẳn bên trong và thấy Tên Shop/Brand chưa
                    is_inside = await page.evaluate('''() => {
                        return !!document.querySelector('.shop-name, .account-name, .brand-name, .seller-name');
                    }''')
                    
                    if is_inside:
                        self.log("🎉 Đăng nhập và Xác minh thành công! Đã vào Kênh Người Bán.")
                        return True
                    else:
                        self.log("⏳ Đang vướng màn hình Xác minh (Email/OTP). Bạn có 10 phút để xử lý...")
                except Exception:
                    pass
                    
        self.log("❌ Quá thời gian chờ (10 phút). Trình duyệt sẽ tự đóng!")
        return False

    async def re_verify(self, page, shop):
        """Xử lý khi Shopee yêu cầu nhập lại mật khẩu xác minh"""
        pass_input = await page.query_selector('input[type="password"]')
        if pass_input and shop.get("mat_khau"):
            self.log("🔒 Shopee yêu cầu xác minh mật khẩu, đang tự động nhập...")
            await page.fill('input[type="password"]', shop["mat_khau"])
            await page.keyboard.press("Enter")
            await asyncio.sleep(8)
