import asyncio

class LazadaAuth:
    def __init__(self, log_func):
        self.log = log_func

    async def check_and_login(self, page, shop):
        ten_shop = shop.get('ten_shop', 'Không rõ')
        self.log(f"🔑 Kiểm tra phiên đăng nhập Lazada cho shop: {ten_shop}")
        
        # Truy cập thẳng vào link Login chuẩn của Lazada để tránh lỗi redirect
        await page.goto("https://sellercenter.lazada.vn/apps/seller/login?redirect_url=https%3A%2F%2Fsellercenter.lazada.vn%2F", wait_until="commit")
        try:
            # Ép bot phải chờ mạng ổn định để giao diện render xong (tối đa 10s)
            await page.wait_for_load_state("networkidle", timeout=10000)
        except:
            pass
        await asyncio.sleep(5)

        # Xác định trang đăng nhập: Có ô password hoặc URL chứa chữ login
        has_pw = await page.locator('input[type="password"]').count() > 0
        is_login_url = "login" in page.url.lower()
        
        if not is_login_url and not has_pw:
            self.log("✅ Trạng thái: Đã đăng nhập sẵn. Cookie còn sống!")
            return True

        self.log("⚠️ Trạng thái: Chưa đăng nhập. Tiến hành điền tài khoản...")
        try:
            # Lấy tài khoản (hỗ trợ cả chuẩn cũ user_name và chuẩn mới email_login)
            tai_khoan = shop.get("email_login") or shop.get("user_name", "")
            mat_khau = shop.get("mat_khau", "")

            tk_loc = page.locator('input[placeholder*="Số điện thoại"], input[placeholder*="Email"]').first
            await tk_loc.wait_for(state="visible", timeout=10000)
            await tk_loc.click() # Bấm để đánh thức form React
            if tai_khoan:
                await tk_loc.fill(tai_khoan)
            await asyncio.sleep(1)
            
            mk_loc = page.locator('input[placeholder*="Mật khẩu"], input[type="password"]').first
            await mk_loc.click()
            if mat_khau:
                await mk_loc.fill(mat_khau)
            await asyncio.sleep(1)
            
            if tai_khoan and mat_khau:
                self.log("🔑 Đã điền xong. Đang bấm nút Đăng nhập...")
                await page.locator('button:has-text("Đăng nhập")').first.click(force=True)
            else:
                self.log("⚠️ Thiếu thông tin trong file, mời bạn nhập nốt phần còn thiếu...")
        except Exception as e:
            self.log("⚠️ Không thể tự điền form, bạn vui lòng nhập thủ công nhé.")

        self.log("⏳ Vui lòng vuốt Captcha hoặc nhập OTP (nếu có). Bot sẽ CHỜ TỐI ĐA 3 PHÚT...")
        for _ in range(60):
            await asyncio.sleep(3)
            # Nếu không còn ô nhập password nữa và url không còn login -> đã vào trong
            if await page.locator('input[type="password"]').count() == 0 and "login" not in page.url.lower():
                self.log("🎉 Đăng nhập thành công! Đã tự động lưu lại Cookie mới.")
                return True
                
        self.log("❌ Quá thời gian chờ đăng nhập (3 phút). Vui lòng chạy lại!")
        return False
