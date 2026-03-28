import asyncio

class TikTokAuth:
    def __init__(self, log_func):
        self.log = log_func

    async def check_and_login(self, page, shop):
        ten_shop = shop.get('ten_shop', 'Không rõ')
        self.log(f"🔑 Kiểm tra phiên đăng nhập TikTok cho shop: {ten_shop}")
        
        # Truy cập thẳng vào link Login chuẩn của TikTok
        await page.goto("https://seller-vn.tiktok.com/account/login", wait_until="commit")
        try:
            await page.wait_for_load_state("networkidle", timeout=10000)
        except:
            pass
        await asyncio.sleep(5)

        has_pw = await page.locator('input[type="password"]').count() > 0
        if "login" not in page.url and "account/login" not in page.url and not has_pw:
            self.log("✅ Trạng thái: Đã đăng nhập sẵn. Cookie còn sống!")
            return True

        self.log("⚠️ Trạng thái: Chưa đăng nhập. Tiến hành điền Số điện thoại...")
        try:
            # Lấy tài khoản (hỗ trợ cả chuẩn cũ user_name và chuẩn mới email_login)
            tai_khoan = shop.get("email_login") or shop.get("user_name", "")
            mat_khau = shop.get("mat_khau", "")

            # Ưu tiên tìm ô Số điện thoại theo giao diện mới nhất
            tk_loc = page.locator('input[placeholder*="Số điện thoại"], input[name="mobile"], input[type="text"]').first
            await tk_loc.wait_for(state="visible", timeout=5000)
            await tk_loc.click()
            if tai_khoan:
                await tk_loc.fill(tai_khoan)
            await asyncio.sleep(1)
            
            # Điền Mật khẩu
            mk_loc = page.locator('input[type="password"]').first
            await mk_loc.click()
            if mat_khau:
                await mk_loc.fill(mat_khau)
            await asyncio.sleep(1)
            
            if tai_khoan and mat_khau:
                self.log("🔑 Đã điền xong. Đang bấm nút Đăng nhập...")
                btn_login = page.locator('button:has-text("Đăng nhập"), button[type="submit"]').first
                await btn_login.click(force=True)
            else:
                self.log("⚠️ Thiếu thông tin trong file, mời bạn nhập nốt phần còn thiếu...")
        except Exception as e:
            self.log("⚠️ Giao diện thay đổi hoặc load chậm, bạn hãy tự điền bằng tay nhé.")

        self.log("⏳ Mời bạn vượt Captcha/OTP (nếu có). Bot sẽ CHỜ TỐI ĐA 3 PHÚT (180s)...")
        for _ in range(60):
            await asyncio.sleep(3)
            # Nếu hết chữ login và không còn ô password -> Thành công
            if "login" not in page.url and "account/login" not in page.url and await page.locator('input[type="password"]').count() == 0:
                self.log("🎉 Đăng nhập thành công! Đã tự động lưu lại Cookie mới.")
                return True
                
        self.log("❌ Quá thời gian chờ đăng nhập (3 phút). Vui lòng chạy lại!")
        return False
