import customtkinter as ctk
import threading
import asyncio
import random
from datetime import datetime, timedelta

class SyncOrderTab(ctk.CTkFrame):
    def __init__(self, master, app):
        super().__init__(master, fg_color="transparent")
        self.app = app
        
        # Biến kiểm soát Đa luồng & Auto
        self.is_auto_running = False
        self.mutex_lock = False 
        self.auto_thread = None
        
        self.pack(fill="both", expand=True)
        self._build_ui()

    def _build_ui(self):
        ctk.CTkLabel(self, text="📦 TRUNG TÂM AUTO ĐƠN HÀNG 24/7",
                     font=("Segoe UI", 16, "bold"), text_color="#00FF88").pack(pady=(15,5))
        ctk.CTkLabel(self,
                     text="Hệ thống tự động xoay vòng đa Shop, tích hợp ngủ đông ban đêm và khóa an toàn chống xung đột.",
                     font=("Segoe UI", 11), text_color="#AAAAAA", wraplength=700).pack(pady=(0,10))

        # --- KHU VỰC CÀI ĐẶT AUTO ---
        auto_frame = ctk.CTkFrame(self, fg_color="#1A1A1A", corner_radius=10)
        auto_frame.pack(padx=20, fill="x", pady=5)

        ctk.CTkLabel(auto_frame, text="⏳ Thời gian nghỉ giữa các vòng (phút):", text_color="white", font=("Segoe UI", 12, "bold")).grid(row=0, column=0, padx=10, pady=12)
        
        self.delay_min = ctk.CTkEntry(auto_frame, width=50, justify="center")
        self.delay_min.insert(0, "15")
        self.delay_min.grid(row=0, column=1, padx=5, pady=12)
        
        ctk.CTkLabel(auto_frame, text="đến", text_color="white").grid(row=0, column=2)
        
        self.delay_max = ctk.CTkEntry(auto_frame, width=50, justify="center")
        self.delay_max.insert(0, "30")
        self.delay_max.grid(row=0, column=3, padx=5, pady=12)

        self.btn_auto = ctk.CTkButton(auto_frame, text="▶️ BẬT AUTO ALL SHOP",
                                         fg_color="#16a34a", text_color="white", hover_color="#15803d",
                                         font=("Segoe UI", 13, "bold"), height=35,
                                         command=self.toggle_auto)
        self.btn_auto.grid(row=0, column=4, padx=20, pady=12)

        # --- KHU VỰC CHẠY TAY (MANUAL) ---
        manual_frame = ctk.CTkFrame(self, fg_color="transparent")
        manual_frame.pack(pady=10)
        
        ctk.CTkLabel(manual_frame, text="Chạy thủ công:").pack(side="left", padx=5)
        self.so_shop_var = ctk.StringVar(value="Tất cả shop")
        self.so_shop_combo = ctk.CTkComboBox(manual_frame, values=["Tất cả shop"], variable=self.so_shop_var, width=180)
        self.so_shop_combo.pack(side="left", padx=5)
        self.update_so_shop_list("shopee")

        self.btn_scrape_orders = ctk.CTkButton(manual_frame, text="⬇️ Cào đơn mới", width=120, fg_color="#3b82f6", hover_color="#2563eb",
                                         command=lambda: self.run_order_bot("scrape"))
        self.btn_scrape_orders.pack(side="left", padx=5)

        self.btn_process_orders = ctk.CTkButton(manual_frame, text="⚙️ Chuẩn bị hàng", width=120, fg_color="#ea580c", hover_color="#c2410c",
                                         command=lambda: self.run_order_bot("process"))
        self.btn_process_orders.pack(side="left", padx=5)

        # Nút Quét Trạng Thái (Phương án B)
        self.btn_check_status = ctk.CTkButton(manual_frame, text="🔍 Quét Trạng thái", width=120, fg_color="#8b5cf6", hover_color="#7c3aed",
                                         command=lambda: self.run_order_bot("status"))
        self.btn_check_status.pack(side="left", padx=5)

        # --- KHU VỰC LOG ---
        self.so_log = ctk.CTkTextbox(self, height=350, fg_color="#0A0A0A", text_color="#00CED1", font=("Consolas", 12))
        self.so_log.pack(fill="both", expand=True, padx=20, pady=(5, 20))

    def so_log_msg(self, msg):
        self.so_log.configure(state="normal")
        time_str = datetime.now().strftime("%H:%M:%S")
        self.so_log.insert("end", f"[{time_str}] {msg}\n")
        self.so_log.see("end")
        self.so_log.configure(state="disabled")

    def update_so_shop_list(self, selected_platform):
        shops = ["Tất cả shop"] + [s["ten_shop"] for s in self.app.DANH_SACH_SHOP if s.get("platform") == selected_platform]
        self.so_shop_combo.configure(values=shops)
        self.so_shop_var.set("Tất cả shop")

    # ==========================================
    # LÕI ĐIỀU KHIỂN AUTO (AUTO HUB CORE - LUỒNG KÉP)
    # ==========================================
    def toggle_auto(self):
        if not self.is_auto_running:
            self.is_auto_running = True
            self.btn_auto.configure(text="⏹️ TẮT AUTO", fg_color="#dc2626", hover_color="#b91c1c")
            self.so_log_msg("🟢 KÍCH HOẠT: LUỒNG CÀO ĐƠN (30P) & RADAR LẮNG NGHE WEB (10S)!")
            
            # Khởi động 2 luồng song song
            self.auto_thread = threading.Thread(target=self.auto_loop_worker, daemon=True)
            self.listen_thread = threading.Thread(target=self.listen_loop_worker, daemon=True)
            self.auto_thread.start()
            self.listen_thread.start()
        else:
            self.is_auto_running = False
            self.btn_auto.configure(text="▶️ BẬT AUTO ALL SHOP", fg_color="#16a34a", hover_color="#15803d")
            self.so_log_msg("🛑 ĐANG TẮT AUTO... (Bot sẽ dừng sau khi hoàn thành chu kỳ hiện tại)")

    def listen_loop_worker(self):
        """📡 Luồng Radar: Quét Server 10 giây/lần xem Kho có bấm Xác Nhận không"""
        import requests
        import time
        api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/orders?oms_status=CONFIRMED&platform=shopee&limit=50"
        
        while self.is_auto_running:
            now = datetime.now()
            if now.hour >= 21 or now.hour < 6:
                time.sleep(60) # Đêm thì Radar quét chậm lại 1 phút/lần
                continue
                
            if not self.mutex_lock: # Chỉ quét nếu Bot đang rảnh (không bị vướng lúc đang cào đơn)
                try:
                    res = requests.get(api_url, timeout=10)
                    if res.status_code == 200:
                        data = res.json()
                        orders = data.get("data", [])
                        
                        if orders:
                            # Tìm xem Web vừa duyệt đơn của shop nào
                            shops_to_process = set([o["shop"] for o in orders])
                            self.so_log_msg(f"🔔 [RADAR] Web vừa Xác nhận đơn của: {', '.join(shops_to_process)}!")
                            
                            for shop_name in shops_to_process:
                                if not self.is_auto_running: break
                                shop_data = next((s for s in self.app.DANH_SACH_SHOP if s.get("ten_shop") == shop_name), None)
                                
                                if shop_data:
                                    self.so_log_msg(f"⚡ Đang mượn Tab Shopee để xử lý GẤP cho {shop_name}...")
                                    self.mutex_lock = True
                                    try:
                                        # Bơm lệnh process (Chuẩn bị hàng) chạy ngay lập tức
                                        asyncio.run(self.playwright_order_job(shop_data, "process"))
                                    except Exception as e:
                                        self.so_log_msg(f"❌ Lỗi xử lý Radar: {e}")
                                    finally:
                                        self.mutex_lock = False
                                        time.sleep(3) # Nghỉ 3s trước khi sang shop khác
                except Exception:
                    pass # Lỗi mạng nhẹ thì bỏ qua, 10s sau Radar quét lại
                    
            # Đứng chờ 10 giây rồi lặp lại
            for _ in range(10):
                if not self.is_auto_running: break
                time.sleep(1)

    def auto_loop_worker(self):
        """🚜 Luồng Máy Cày: 15-30 phút đi cào đơn mới 1 lần cho nhẹ máy"""
        while self.is_auto_running:
            now = datetime.now()
            hour = now.hour
            
            # --- CƠ CHẾ NGỦ ĐÔNG (21:00 - 06:00) ---
            if hour >= 21 or hour < 6:
                target = now.replace(hour=6, minute=0, second=0, microsecond=0)
                if hour >= 21: target += timedelta(days=1)
                sleep_seconds = (target - now).total_seconds()
                
                self.so_log_msg(f"🌙 Đã {now.strftime('%H:%M')}. Luồng Máy cày đi ngủ, sáng mai cào tiếp!")
                for _ in range(int(sleep_seconds // 5)):
                    if not self.is_auto_running: break
                    import time
                    time.sleep(5)
                continue 

            # --- VÒNG LẶP CÀO ĐƠN MỚI ---
            shopee_shops = [s for s in self.app.DANH_SACH_SHOP if s.get("platform") == "shopee"]
            if not shopee_shops:
                self.so_log_msg("⚠️ Không có shop Shopee nào để chạy auto!")
                self.toggle_auto()
                break

            self.so_log_msg("-------------------------------------------------")
            self.so_log_msg(f"🔄 BẮT ĐẦU CHU KỲ CÀO ĐƠN {len(shopee_shops)} SHOP")
            
            for shop in shopee_shops:
                if not self.is_auto_running: break
                
                self.so_log_msg(f"[*] Khóa an toàn: Đang Cào đơn Shop {shop['ten_shop']}...")
                self.mutex_lock = True
                try:
                    # Truyền lệnh scrape (Chỉ cào đơn)
                    asyncio.run(self.playwright_order_job(shop, "scrape")) 
                except Exception as e:
                    self.so_log_msg(f"❌ Lỗi Auto Shop {shop['ten_shop']}: {e}")
                finally:
                    self.mutex_lock = False
                
                import time
                time.sleep(3)

            # --- NGHỈ GIẢ LẬP CON NGƯỜI ---
            if not self.is_auto_running: break
            
            try:
                d_min, d_max = int(self.delay_min.get()), int(self.delay_max.get())
            except:
                d_min, d_max = 15, 30
                
            sleep_mins = random.randint(d_min, d_max)
            self.so_log_msg("-------------------------------------------------")
            self.so_log_msg(f"⏳ Cào đơn xong. Bot sẽ nghỉ {sleep_mins} phút (Radar vẫn đang canh lệnh Web)...")
            
            for _ in range(sleep_mins * 60 // 5):
                if not self.is_auto_running: break
                import time
                time.sleep(5)

    # ==========================================
    # CHUẨN ĐẦU VÀO VÀ THỰC THI (PLAYWRIGHT CORE)
    # ==========================================
    def run_order_bot(self, action):
        if self.mutex_lock:
            self.so_log_msg("🚦 HỆ THỐNG ĐANG BẬT ĐÈN ĐỎ: Bot Auto đang dở tay làm việc, vui lòng đợi vài giây rồi bấm lại...")
            return

        shop_name = self.so_shop_var.get()
        if shop_name == "Tất cả shop" or not shop_name:
            self.so_log_msg("⚠️ Vui lòng chọn 1 shop cụ thể ở ô bên cạnh để chạy tay!")
            return
            
        shop_data = next((s for s in self.app.DANH_SACH_SHOP if s.get("ten_shop") == shop_name), None)
        if not shop_data: return
            
        def task():
            self.mutex_lock = True
            try:
                asyncio.run(self.playwright_order_job(shop_data, action))
            except Exception as e:
                self.so_log_msg(f"❌ Lỗi: {e}")
            finally:
                self.mutex_lock = False
                
        threading.Thread(target=task, daemon=True).start()

    async def playwright_order_job(self, shop, action):
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
                
                if platform != 'shopee': return

                from engines.shopee.shopee_auth import ShopeeAuth
                auth = ShopeeAuth(self.so_log_msg)
                is_logged = await auth.check_and_login(page, shop)
                if not is_logged:
                    self.so_log_msg("❌ Không thể đăng nhập vào Shopee!")
                    return

                # --- NHIỆM VỤ 1: CÀO ĐƠN ---
                if action in ["scrape", "auto_all"]:
                    self.so_log_msg("👉 Thực thi: CÀO ĐƠN HÀNG MỚI")
                    from parsers.shopee_order_parser import ShopeeOrderParser
                    from engines.shopee.shopee_orders import ShopeeOrderScraper
                    
                    parser = ShopeeOrderParser(self.so_log_msg)
                    scraper = ShopeeOrderScraper(self.so_log_msg, parser)
                    orders_data = await scraper.scrape_new_orders(page)
                    
                    if orders_data:
                        self.so_log_msg(f"📦 Thu thập được {len(orders_data)} đơn. Đang tải lên Server...")
                        import requests, re
                        api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                        payload = {"orders": [], "items": []}
                        
                        from datetime import datetime
                        for order in orders_data:
                            raw_price = re.sub(r'[^\d]', '', order.get("total_price", "0"))
                            revenue = float(raw_price) if raw_price else 0
                            
                            # Phân loại trạng thái dựa vào Tab cào được
                            tab_src = order.get("tab_source", "Chờ lấy hàng")
                            oms_st = "PENDING"
                            ship_st = "Chờ lấy hàng"
                            
                            order_type = "normal"
                            if tab_src == "Đang giao":
                                oms_st = "HANDED_OVER"
                                ship_st = "Đang giao"
                            elif tab_src == "Đã giao":
                                oms_st = "COMPLETED"
                                ship_st = "Hoàn thành"
                            elif tab_src == "Đã hủy":
                                oms_st = "CANCELLED_TRANSIT"
                                ship_st = "Đã hủy"
                                order_type = "cancel"

                            payload["orders"].append({
                                "order_id": order["order_id"],
                                "order_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                                "order_type": order_type,
                                "platform": "shopee",
                                "shop": shop['ten_shop'],
                                "customer_name": order["buyer_name"],
                                "revenue": revenue,
                                "oms_status": oms_st,
                                "shipping_status": ship_st,
                                "tracking_number": order["tracking_number"],
                                "shipping_carrier": order["carrier"]
                            })
                            
                            for item in order["items"]:
                                payload["items"].append({
                                    "order_id": order["order_id"],
                                    "sku": "", 
                                    "variation_name": item.get("variation", ""), 
                                    "product_name": item["name"],
                                    "qty": int(item.get("quantity", 1) if str(item.get("quantity", "1")).isdigit() else 1),
                                    "image_url": item.get("image", "")
                                })
                        try:
                            self.so_log_msg(f"🔎 [RADAR] Bot chuẩn bị gửi: {len(payload['orders'])} Đơn và {len(payload['items'])} Sản phẩm!")
                            res = requests.post(api_url, json=payload)
                            if res.status_code == 200:
                                self.so_log_msg("✅ Đồng bộ dữ liệu Cào đơn thành công!")
                            else:
                                self.so_log_msg(f"❌ Lỗi từ Server API: {res.text}")
                        except Exception as e:
                            self.so_log_msg(f"❌ Lỗi đường truyền mạng: {e}")
                    else:
                        self.so_log_msg("✅ Không có đơn mới nào ở tab Chờ lấy hàng.")

                # --- NHIỆM VỤ 2: XỬ LÝ ĐƠN ---
                if action in ["process", "auto_all"]:
                    self.so_log_msg("👉 Thực thi: TỰ ĐỘNG CHUẨN BỊ HÀNG")
                    from engines.shopee.shopee_process import ShopeeOrderProcessor
                    processor = ShopeeOrderProcessor(self.so_log_msg)
                    await processor.process_confirmed_orders(page, shop['ten_shop'])

                # --- NHIỆM VỤ 3: QUÉT TRẠNG THÁI (PHƯƠNG ÁN B) ---
                if action == "status":
                    self.so_log_msg("👉 Thực thi: QUÉT TRẠNG THÁI BẰNG API")
                    from engines.shopee.shopee_status_core import ShopeeStatusCore
                    status_bot = ShopeeStatusCore(self.so_log_msg)
                    await status_bot.scan_and_update(page, shop['ten_shop'])

            finally:
                await browser.close()
