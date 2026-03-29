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
                        
                        if platform == 'shopee':
                            # 1. Đăng nhập / Kiểm tra Cookie (Dùng chung não bộ Login)
                            from engines.shopee.shopee_auth import ShopeeAuth
                            auth = ShopeeAuth(self.so_log_msg)
                            is_logged = await auth.check_and_login(page, shop)
                            
                            if not is_logged:
                                self.so_log_msg("❌ Lỗi: Không thể đăng nhập vào Shopee!")
                                return
                            
                            # 2. Triệu hồi Não bộ (Parser) và Tay sai (Scraper)
                            from parsers.shopee_order_parser import ShopeeOrderParser
                            from engines.shopee.shopee_orders import ShopeeOrderScraper
                            
                            parser = ShopeeOrderParser(self.so_log_msg)
                            scraper = ShopeeOrderScraper(self.so_log_msg, parser)
                            
                            # 3. Kích hoạt cào đơn
                            orders_data = await scraper.scrape_new_orders(page)
                            
                            if orders_data:
                                self.so_log_msg(f"📦 Đã đóng gói thành công {len(orders_data)} đơn. Đang truyền tải lên Server...")
                                
                                # 4. Gửi dữ liệu thẳng lên Cloudflare Worker API
                                import requests
                                import re
                                
                                api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                                
                                payload = {"orders": [], "items": []}
                                
                                for order in orders_data:
                                    # Lọc bỏ chữ để lấy số tiền chuẩn (VD: '₫45.000' -> 45000)
                                    raw_price = re.sub(r'[^\d]', '', order.get("total_price", "0"))
                                    revenue = float(raw_price) if raw_price else 0
                                    
                                    payload["orders"].append({
                                        "order_id": order["order_id"],
                                        "platform": "shopee",
                                        "shop": shop['ten_shop'],
                                        "customer_name": order["buyer_name"],
                                        "revenue": revenue,
                                        "oms_status": "PENDING", # Mặc định đơn mới là Chờ xác nhận
                                        "shipping_status": "Chờ lấy hàng",
                                        "tracking_number": order["tracking_number"],
                                        "shipping_carrier": order["carrier"]
                                    })
                                    
                                    for item in order["items"]:
                                        payload["items"].append({
                                            "order_id": order["order_id"],
                                            "sku": item.get("variation", item["name"]), # Tạm dùng phân loại làm SKU
                                            "product_name": item["name"],
                                            "qty": int(item["quantity"])
                                        })
                                
                                try:
                                    res = requests.post(api_url, json=payload)
                                    if res.status_code == 200:
                                        self.so_log_msg("✅ ĐỒNG BỘ THÀNH CÔNG! Hãy mở App Web trên điện thoại để xem đơn ngay.")
                                    else:
                                        self.so_log_msg(f"❌ Lỗi từ Server API: {res.text}")
                                except Exception as api_err:
                                    self.so_log_msg(f"❌ Lỗi đường truyền mạng: {api_err}")
                            else:
                                self.so_log_msg("⚠️ Không tìm thấy đơn hàng mới nào để cào.")
                        
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
