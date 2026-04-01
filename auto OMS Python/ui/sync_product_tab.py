import customtkinter as ctk
import threading
import asyncio

class SyncProductTab(ctk.CTkFrame):
    def __init__(self, master, app):
        super().__init__(master, fg_color="transparent")
        self.app = app
        self.pack(fill="both", expand=True)
        self._build_ui()

    def _build_ui(self):
        ctk.CTkLabel(self, text="🛍️ Đồng bộ Variation từ Shopee",
                     font=("Segoe UI", 14, "bold"), text_color="#FFD700").pack(pady=(15,5))
        ctk.CTkLabel(self,
                     text="Bot sẽ vào trang Sản phẩm Shopee, lấy tất cả SP + phân loại + SKU + tồn kho → gửi lên OMS",
                     font=("Segoe UI", 11), text_color="#AAAAAA", wraplength=700).pack(pady=(0,10))

        sp_shop_frame = ctk.CTkFrame(self, fg_color="#1A1A1A")
        sp_shop_frame.pack(padx=20, fill="x")
        
        # Ô 1: Chọn Sàn
        ctk.CTkLabel(sp_shop_frame, text="Chọn Sàn:", text_color="white",
                     font=("Segoe UI", 12)).grid(row=0, column=0, padx=10, pady=8)
        self.sp_san_var = ctk.StringVar(value="shopee")
        self.sp_san_combo = ctk.CTkComboBox(sp_shop_frame, values=["shopee", "tiktok", "lazada"],
                                            variable=self.sp_san_var, width=120, command=self.update_sp_shop_list)
        self.sp_san_combo.grid(row=0, column=1, padx=10, pady=8)

        # Ô 2: Chọn Shop
        ctk.CTkLabel(sp_shop_frame, text="Chọn Shop:", text_color="white",
                     font=("Segoe UI", 12)).grid(row=0, column=2, padx=10, pady=8)
        self.sp_shop_var = ctk.StringVar(value="Tất cả shop")
        self.sp_shop_combo = ctk.CTkComboBox(sp_shop_frame, values=["Tất cả shop"],
                                              variable=self.sp_shop_var, width=280)
        self.sp_shop_combo.grid(row=0, column=3, padx=10, pady=8)
        
        # Mặc định load danh sách shop của Shopee lúc mới mở App
        self.update_sp_shop_list("shopee")

        btn_sp_frame = ctk.CTkFrame(self, fg_color="transparent")
        btn_sp_frame.pack(pady=10)

        ctk.CTkButton(btn_sp_frame, text="▶ Quét Sản phẩm Web",
                      fg_color="#00CED1", text_color="black",
                      font=("Segoe UI", 13, "bold"),
                      command=self.start_sync_products).pack(side="left", padx=10)

        self.btn_sync_excel = ctk.CTkButton(btn_sp_frame, text="📊 Bot Đồng Bộ SP Excel",
                      fg_color="#10b981", text_color="white", hover_color="#059669",
                      font=("Segoe UI", 13, "bold"),
                      command=self.run_sync_excel_bot)
        self.btn_sync_excel.pack(side="left", padx=10)

        # Nút 1: Tải File Khuyến Mại (Từ Sàn -> Web)
        self.btn_tai_km = ctk.CTkButton(btn_sp_frame, text="⬇️ Cào Giá KM Shopee -> Web",
                                         fg_color="#3b82f6", text_color="white", hover_color="#2563eb",
                                         font=("Segoe UI", 13, "bold"),
                                         command=lambda: self.run_sync_khuyen_mai_bot("tai_file"))
        self.btn_tai_km.pack(side="left", padx=10)

        # Nút 2: Up Giá Khuyến Mại (Từ Web -> Sàn)
        self.btn_sync_km = ctk.CTkButton(btn_sp_frame, text="⬆️ Up Giá KM Web -> Shopee",
                                         fg_color="#ea580c", text_color="white", hover_color="#c2410c",
                                         font=("Segoe UI", 13, "bold"),
                                         command=lambda: self.run_sync_khuyen_mai_bot("up_gia"))
        self.btn_sync_km.pack(side="left", padx=10)

        # (Đã xóa ô sp_log cũ để nhường chỗ cho Global Log bám đáy của Main Window)

    def sp_log_msg(self, msg):
        # Chuyển hướng dòng chảy log ra thẳng cửa sổ chính
        self.app.log(msg)

    def update_sp_shop_list(self, selected_platform):
        shops = ["Tất cả shop"] + [s["ten_shop"] for s in self.app.DANH_SACH_SHOP if s.get("platform") == selected_platform]
        self.sp_shop_combo.configure(values=shops)
        self.sp_shop_var.set("Tất cả shop")

    def start_sync_products(self):
        platform = self.sp_san_var.get()
        shop_name = self.sp_shop_var.get()
        
        def _run_sync():
            if platform == "shopee":
                old_log = self.app.shopee_eng.log
                self.app.shopee_eng.log = self.sp_log_msg
                asyncio.run(self.app.shopee_eng.sync_shopee_products(self.app.DANH_SACH_SHOP, shop_name))
                self.app.shopee_eng.log = old_log
            else:
                self.sp_log_msg(f"⚠️ Tính năng quét Web của {platform.upper()} đang phát triển. Vui lòng dùng nút 'Bot Đồng Bộ SP Excel' kế bên!")

        threading.Thread(target=_run_sync, daemon=True).start()

    def run_sync_excel_bot(self):
        platform = self.sp_san_var.get()
        shop_name = self.sp_shop_var.get()
        if shop_name == "Tất cả shop" or not shop_name:
            self.sp_log_msg("⚠️ Vui lòng chọn 1 shop cụ thể (Không chọn 'Tất cả shop') để tải file Excel!")
            return
            
        shop = next((s for s in self.app.DANH_SACH_SHOP if s.get("ten_shop") == shop_name and s.get("platform") == platform), None)
        if not shop:
            self.sp_log_msg("❌ Lỗi: Không tìm thấy thông tin shop! Hãy kiểm tra xem tài khoản đã thêm đúng Sàn chưa.")
            return
            
        def task():
            self.btn_sync_excel.configure(state="disabled", text="⏳ Bot Đang Chạy...")
            try:
                asyncio.run(self.playwright_excel_job(shop))
            except Exception as e:
                self.sp_log_msg(f"❌ Lỗi hệ thống: {str(e)}")
            finally:
                self.btn_sync_excel.configure(state="normal", text="📊 Bot Đồng Bộ SP Excel")
                
        threading.Thread(target=task, daemon=True).start()

    async def playwright_excel_job(self, shop):
        old_log_shopee = self.app.shopee_eng.log
        old_log_tiktok = self.app.tiktok_eng.log
        self.app.shopee_eng.log = self.sp_log_msg
        self.app.tiktok_eng.log = self.sp_log_msg
        
        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as p:
                self.sp_log_msg(f"🚀 Mở trình duyệt tải Excel cho Shop: {shop['ten_shop']}")
                browser = await p.chromium.launch_persistent_context(
                    user_data_dir=shop['profile_dir'],
                    channel="chrome",
                    headless=False,
                    viewport={"width": 1280, "height": 720},
                    args=["--disable-blink-features=AutomationControlled"]
                )
                try:
                    page = browser.pages[0] if browser.pages else await browser.new_page()
                    platform = shop.get('platform', '').lower()
                    
                    if platform == 'tiktok':
                        await self.app.tiktok_eng.tai_va_dong_bo_san_pham_excel(page, shop)
                        
                    elif platform == 'lazada':
                        import sys
                        import os
                        current_dir = os.path.dirname(os.path.abspath(__file__))
                        root_dir = os.path.dirname(current_dir)
                        if root_dir not in sys.path:
                            sys.path.append(root_dir)
                            
                        try:
                            from lazada_products import LazadaProducts
                        except ModuleNotFoundError:
                            try:
                                from engines.lazada.lazada_products import LazadaProducts
                            except ModuleNotFoundError:
                                self.sp_log_msg("❌ Lỗi: Không tìm thấy file lazada_products.py.")
                                return
                                
                        # CƠ CHẾ TỰ ĐỘNG ĐĂNG NHẬP THÔNG MINH CHO LAZADA
                        class LazadaAuth:
                            def __init__(self, log_func):
                                self.log = log_func

                            async def check_and_login(self, page, shop_data):
                                self.log("🔑 Kiểm tra phiên đăng nhập Lazada...")
                                await page.goto("https://sellercenter.lazada.vn/apps/product/list?tab=online_product", wait_until="commit")
                                await asyncio.sleep(4)
                                
                                if "login" in page.url or "register" in page.url:
                                    self.log("⚠️ Cookie hết hạn! Bot sẽ TỰ ĐỘNG điền User/Pass...")
                                    
                                    # Chuyển sang trang Login chuẩn để gõ User/Pass
                                    await page.goto("https://sellercenter.lazada.vn/apps/seller/login", wait_until="commit")
                                    await asyncio.sleep(3)
                                    
                                    try:
                                        self.log(f"👉 Tự động điền tài khoản: {shop_data.get('user_name', '')}")
                                        await page.locator("input#account").fill(shop_data.get("user_name", ""))
                                        await asyncio.sleep(1)
                                        
                                        self.log("👉 Tự động điền mật khẩu...")
                                        await page.locator("input#password").fill(shop_data.get("mat_khau", ""))
                                        await asyncio.sleep(1)
                                        
                                        self.log("👉 Bóp cò Đăng nhập...")
                                        await page.locator('button[type="submit"], button:has-text("Đăng nhập")').first.click(force=True)
                                        await asyncio.sleep(6) # Đợi Lazada tải hệ thống
                                        
                                        # Kiểm tra xem có qua được không hay bị kẹt Captcha/OTP
                                        if "login" in page.url:
                                            self.log("❌ Đăng nhập kẹt (Có thể sai Pass hoặc Lazada bắt kéo mã mảnh ghép/OTP).")
                                            self.log("⏳ Xin mời xử lý nốt trên trình duyệt (Bot chờ tối đa 5 phút)...")
                                            for i in range(100):
                                                if "login" not in page.url and "register" not in page.url:
                                                    self.log("✅ Đã vượt qua xác thực bảo mật!")
                                                    return True
                                                await asyncio.sleep(3)
                                            return False
                                        else:
                                            self.log("✅ Tự động đăng nhập Lazada THÀNH CÔNG!")
                                            return True
                                            
                                    except Exception as e:
                                        self.log(f"❌ Lỗi lúc gõ tài khoản: {e}")
                                        return False
                                else:
                                    self.log("✅ Trạng thái: Đã đăng nhập sẵn. Cookie còn sống!")
                                    return True
                                    
                        auth_instance = LazadaAuth(self.sp_log_msg)
                        lz_bot = LazadaProducts(self.sp_log_msg, auth_instance)
                        await lz_bot.run(page, shop)
                        
                    elif platform == 'shopee':
                        await self.app.shopee_eng.tai_va_dong_bo_san_pham_excel(page, shop)
                        
                    else:
                        self.sp_log_msg(f"❌ Lỗi: Nền tảng '{platform}' chưa được hỗ trợ!")
                        
                except Exception as e:
                    self.sp_log_msg(f"❌ Lỗi khi xử lý shop {shop['ten_shop']}: {str(e)}")
                finally:
                    await browser.close()
        finally:
            self.app.shopee_eng.log = old_log_shopee
            self.app.tiktok_eng.log = old_log_tiktok

    def run_sync_khuyen_mai_bot(self, action="up_gia"):
        platform = self.sp_san_var.get()
        shop_name = self.sp_shop_var.get()
        
        if platform != "shopee":
            self.sp_log_msg("⚠️ Tính năng Khuyến Mãi hiện tại chỉ mới hỗ trợ sàn Shopee!")
            return
        if shop_name == "Tất cả shop" or not shop_name:
            self.sp_log_msg("⚠️ Vui lòng chọn 1 shop cụ thể (Không chọn 'Tất cả shop')!")
            return
            
        shop_data = None
        for s in self.app.DANH_SACH_SHOP:
            if s and s.get("ten_shop") == shop_name and s.get("platform") == platform:
                shop_data = s
                break
                
        if not shop_data:
            self.sp_log_msg("❌ Lỗi: Không tìm thấy thông tin shop!")
            return
            
        def task(shop_target=shop_data, act=action):
            if not shop_target: return
            
            btn_active = self.btn_tai_km if act == "tai_file" else self.btn_sync_km
            old_text = btn_active.cget("text")
            btn_active.configure(state="disabled", text="⏳ Đang Chạy...")
            
            try:
                import asyncio
                asyncio.run(self.playwright_khuyen_mai_job(shop_target, act))
            except Exception as e:
                self.sp_log_msg(f"❌ Lỗi hệ thống: {str(e)}")
            finally:
                btn_active.configure(state="normal", text=old_text)
                
        threading.Thread(target=task, daemon=True).start()

    async def playwright_khuyen_mai_job(self, shop, action):
        if not shop: return
            
        old_log_shopee = self.app.shopee_eng.log
        self.app.shopee_eng.log = self.sp_log_msg
        
        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as p:
                ten_shop = shop.get('ten_shop', 'Không rõ')
                thu_muc = shop.get('profile_dir', '')
                
                mo_ta = "TẢI FILE" if action == "tai_file" else "UP GIÁ"
                self.sp_log_msg(f"🚀 Mở trình duyệt {mo_ta} Khuyến Mại cho Shop: {ten_shop}")
                browser = await p.chromium.launch_persistent_context(
                    user_data_dir=thu_muc, channel="chrome", headless=False,
                    viewport={"width": 1280, "height": 720},
                    args=["--disable-blink-features=AutomationControlled"]
                )
                try:
                    page = browser.pages[0] if browser.pages else await browser.new_page()
                    # MÓC NỐI SANG ENGINE SHOPEE: Truyền thêm biến action để phân luồng
                    await self.app.shopee_eng.promo.dong_bo_gia_khuyen_mai(page, shop, action)
                except Exception as e:
                    self.sp_log_msg(f"❌ Lỗi khi xử lý shop {ten_shop}: {str(e)}")
                finally:
                    await browser.close()
        finally:
            self.app.shopee_eng.log = old_log_shopee
