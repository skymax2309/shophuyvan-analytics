import customtkinter as ctk
import threading
import asyncio

class SyncOrderTab(ctk.CTkFrame):
    def __init__(self, master, app):
        super().__init__(master, fg_color="transparent")
        self.app = app
        self.pack(fill="both", expand=True)
        self._build_ui()

    def _build_ui(self):
        ctk.CTkLabel(self, text="📦 Quản lý & Xử lý Đơn hàng Tự động",
                     font=("Segoe UI", 16, "bold"), text_color="#00FF88").pack(pady=(15,5))
        ctk.CTkLabel(self,
                     text="Bot sẽ tự động quét đơn mới trên Sàn và thực hiện các thao tác: Xác nhận, Đóng gói, Lấy mã vận đơn.",
                     font=("Segoe UI", 11), text_color="#AAAAAA", wraplength=700).pack(pady=(0,10))

        # --- KHU VỰC CHỌN SÀN & SHOP ---
        so_shop_frame = ctk.CTkFrame(self, fg_color="#1A1A1A", corner_radius=10)
        so_shop_frame.pack(padx=20, fill="x")
        
        ctk.CTkLabel(so_shop_frame, text="Chọn Sàn:", text_color="white",
                     font=("Segoe UI", 12, "bold")).grid(row=0, column=0, padx=10, pady=12)
        self.so_san_var = ctk.StringVar(value="shopee")
        self.so_san_combo = ctk.CTkComboBox(so_shop_frame, values=["shopee", "tiktok", "lazada"],
                                            variable=self.so_san_var, width=120, command=self.update_so_shop_list)
        self.so_san_combo.grid(row=0, column=1, padx=10, pady=12)

        ctk.CTkLabel(so_shop_frame, text="Chọn Shop:", text_color="white",
                     font=("Segoe UI", 12, "bold")).grid(row=0, column=2, padx=10, pady=12)
        self.so_shop_var = ctk.StringVar(value="Tất cả shop")
        self.so_shop_combo = ctk.CTkComboBox(so_shop_frame, values=["Tất cả shop"],
                                              variable=self.so_shop_var, width=280)
        self.so_shop_combo.grid(row=0, column=3, padx=10, pady=12)
        
        self.update_so_shop_list("shopee")

        # --- KHU VỰC NÚT BẤM (ACTION BUTTONS) ---
        btn_so_frame = ctk.CTkFrame(self, fg_color="transparent")
        btn_so_frame.pack(pady=15)

        self.btn_scrape_orders = ctk.CTkButton(btn_so_frame, text="⬇️ Bot Cào Đơn Mới",
                                         fg_color="#3b82f6", text_color="white", hover_color="#2563eb",
                                         font=("Segoe UI", 13, "bold"), height=35,
                                         command=lambda: self.run_order_bot("scrape"))
        self.btn_scrape_orders.pack(side="left", padx=10)

        self.btn_process_orders = ctk.CTkButton(btn_so_frame, text="⚙️ Bot Xử Lý Đơn (Chuẩn Bị Hàng)",
                                         fg_color="#ea580c", text_color="white", hover_color="#c2410c",
                                         font=("Segoe UI", 13, "bold"), height=35,
                                         command=lambda: self.run_order_bot("process"))
        self.btn_process_orders.pack(side="left", padx=10)

        # --- KHU VỰC LOG ---
        ctk.CTkLabel(self, text="📋 Nhật ký hoạt động của Bot:", font=("Segoe UI", 11, "bold"), text_color="#AAAAAA").pack(anchor="w", padx=20)
        self.so_log = ctk.CTkTextbox(self, height=250, fg_color="#0A0A0A",
                                     text_color="#00CED1", font=("Consolas", 12))
        self.so_log.pack(fill="both", expand=True, padx=20, pady=(5, 20))

    def so_log_msg(self, msg):
        self.so_log.configure(state="normal")
        self.so_log.insert("end", msg + "\n")
        self.so_log.see("end")
        self.so_log.configure(state="disabled")

    def update_so_shop_list(self, selected_platform):
        shops = ["Tất cả shop"] + [s["ten_shop"] for s in self.app.DANH_SACH_SHOP if s.get("platform") == selected_platform]
        self.so_shop_combo.configure(values=shops)
        self.so_shop_var.set("Tất cả shop")

    def run_order_bot(self, action):
        platform = self.so_san_var.get()
        shop_name = self.so_shop_var.get()
        
        if shop_name == "Tất cả shop" or not shop_name:
            self.so_log_msg("⚠️ Vui lòng chọn 1 shop cụ thể để chạy Bot Đơn hàng!")
            return
            
        shop_data = next((s for s in self.app.DANH_SACH_SHOP if s.get("ten_shop") == shop_name and s.get("platform") == platform), None)
        if not shop_data:
            self.so_log_msg("❌ Lỗi: Không tìm thấy thông tin Profile của shop này!")
            return
            
        def task():
            btn_active = self.btn_scrape_orders if action == "scrape" else self.btn_process_orders
            old_text = btn_active.cget("text")
            btn_active.configure(state="disabled", text="⏳ Bot Đang Chạy...")
            
            try:
                asyncio.run(self.playwright_order_job(shop_data, action))
            except Exception as e:
                self.so_log_msg(f"❌ Lỗi hệ thống: {str(e)}")
            finally:
                btn_active.configure(state="normal", text=old_text)
                
        threading.Thread(target=task, daemon=True).start()

    async def playwright_order_job(self, shop, action):
        self.so_log_msg(f"🚀 Khởi động Bot Đơn Hàng cho Shop: {shop['ten_shop']}")
        
        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as p:
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
                    
                    if action == "scrape":
                        self.so_log_msg("👉 Kịch bản: CÀO ĐƠN HÀNG MỚI")
                        # (Code điều hướng cào đơn sẽ được cắm vào đây)
                        await asyncio.sleep(2)
                        self.so_log_msg("✅ Đang chờ phát triển kịch bản cào đơn...")
                        
                    elif action == "process":
                        self.so_log_msg("👉 Kịch bản: TỰ ĐỘNG CHUẨN BỊ HÀNG (PACKING)")
                        # (Code điều hướng click xác nhận đơn sẽ cắm vào đây)
                        await asyncio.sleep(2)
                        self.so_log_msg("✅ Đang chờ phát triển kịch bản xử lý đơn...")
                        
                except Exception as e:
                    self.so_log_msg(f"❌ Lỗi khi xử lý shop {shop['ten_shop']}: {str(e)}")
                finally:
                    await browser.close()
        except Exception as e:
            self.so_log_msg(f"❌ Lỗi khởi tạo Playwright: {str(e)}")
