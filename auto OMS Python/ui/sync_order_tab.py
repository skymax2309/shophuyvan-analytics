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
        self.browser_lock = threading.Lock() # SỬ DỤNG KHÓA THÉP CỦA HỆ ĐIỀU HÀNH
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
        # --- KHU VỰC CÀI ĐẶT AUTO & LIMIT ---
        auto_frame = ctk.CTkFrame(self, fg_color="#1A1A1A", corner_radius=10)
        auto_frame.pack(padx=20, fill="x", pady=5)

        # Hàng 1: Thời gian nghỉ
        ctk.CTkLabel(auto_frame, text="⏳ Thời gian nghỉ (phút):", text_color="white", font=("Segoe UI", 12, "bold")).grid(row=0, column=0, padx=10, pady=8, sticky="w")
        
        delay_f = ctk.CTkFrame(auto_frame, fg_color="transparent")
        delay_f.grid(row=0, column=1, pady=8, sticky="w")
        self.delay_min = ctk.CTkEntry(delay_f, width=40, justify="center")
        self.delay_min.insert(0, "15")
        self.delay_min.pack(side="left")
        ctk.CTkLabel(delay_f, text="đến", text_color="white").pack(side="left", padx=5)
        self.delay_max = ctk.CTkEntry(delay_f, width=40, justify="center")
        self.delay_max.insert(0, "30")
        self.delay_max.pack(side="left")

        # Nút Bật Auto (Gộp qua cột bên phải cho gọn)
        self.btn_auto = ctk.CTkButton(auto_frame, text="▶️ BẬT AUTO ALL SHOP",
                                         fg_color="#16a34a", text_color="white", hover_color="#15803d",
                                         font=("Segoe UI", 13, "bold"), height=35,
                                         command=self.toggle_auto)
        self.btn_auto.grid(row=0, column=2, rowspan=2, padx=20, pady=10)

        # Hàng 2: Bảng điều khiển Số lượng (Limit)
        ctk.CTkLabel(auto_frame, text="⚙️ Giới hạn số đơn lấy:", text_color="white", font=("Segoe UI", 12, "bold")).grid(row=1, column=0, padx=10, pady=8, sticky="w")
        
        limit_f = ctk.CTkFrame(auto_frame, fg_color="transparent")
        limit_f.grid(row=1, column=1, pady=8, sticky="w")
        
        ctk.CTkLabel(limit_f, text="Mới:", text_color="white").pack(side="left")
        self.limit_new = ctk.CTkEntry(limit_f, width=40, justify="center")
        self.limit_new.insert(0, "100")
        self.limit_new.pack(side="left", padx=(2, 10))

        ctk.CTkLabel(limit_f, text="Đang giao:", text_color="white").pack(side="left")
        self.limit_ship = ctk.CTkEntry(limit_f, width=40, justify="center")
        self.limit_ship.insert(0, "50")
        self.limit_ship.pack(side="left", padx=(2, 10))

        ctk.CTkLabel(limit_f, text="Xong/Hủy:", text_color="white").pack(side="left")
        self.limit_done = ctk.CTkEntry(limit_f, width=40, justify="center")
        self.limit_done.insert(0, "20")
        self.limit_done.pack(side="left", padx=(2, 0))

        # 👻 CHECKBOX TÍNH NĂNG ẨN TRÌNH DUYỆT
        self.hide_browser_var = ctk.BooleanVar(value=True) # Mặc định True (Tự động ẩn cho mượt)
        self.chk_hide_browser = ctk.CTkCheckBox(auto_frame, text="👻 Chạy ngầm (Ẩn trình duyệt)", 
                                                variable=self.hide_browser_var, text_color="#fbbf24", font=("Segoe UI", 12, "bold"))
        self.chk_hide_browser.grid(row=1, column=2, padx=20, pady=8, sticky="w")

        # --- KHU VỰC CHẠY TAY (MANUAL) ---
        manual_frame = ctk.CTkFrame(self, fg_color="transparent")
        manual_frame.pack(pady=10)
        
        ctk.CTkLabel(manual_frame, text="Chạy thủ công:").pack(side="left", padx=5)
        self.so_shop_var = ctk.StringVar(value="Tất cả shop")
        self.so_shop_combo = ctk.CTkComboBox(manual_frame, values=["Tất cả shop"], variable=self.so_shop_var, width=180)
        self.so_shop_combo.pack(side="left", padx=5)
        self.update_so_shop_list()

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
        # (Đã chuyển về Trạm Log Cố Định ở Main Window để giao diện thoáng hơn)

    def so_log_msg(self, msg):
        # Chuyển hướng dòng chảy log ra thẳng cửa sổ chính
        self.app.log(msg)

    def update_so_shop_list(self, selected_platform=None):
        if selected_platform:
            shops = ["Tất cả shop"] + [s["ten_shop"] for s in self.app.DANH_SACH_SHOP if s.get("platform") == selected_platform]
        else:
            shops = ["Tất cả shop"] + [s["ten_shop"] for s in self.app.DANH_SACH_SHOP if s.get("platform") in ["shopee", "tiktok", "lazada"]]
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
        """📡 Luồng Radar: Quét Server 10s/lần xem Kho có bấm Xác Nhận hoặc Gửi Lệnh In PDF không"""
        import requests
        import time
        import json
        import os
        
        api_orders = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/orders?oms_status=CONFIRMED&platform=shopee&limit=50"
        api_jobs = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/jobs"
        
        while self.is_auto_running:
            now = datetime.now()
            if now.hour >= 21 or now.hour < 6:
                time.sleep(60) 
                continue
                
            if self.browser_lock.acquire(blocking=False):
                try:
                    # 1. MẮT THẦN QUÉT LỆNH ĐIỀU KHIỂN TỪ WEB (IN PDF, CÀO ĐƠN MỚI)
                    try:
                        res_jobs = requests.get(api_jobs, timeout=10)
                        if res_jobs.status_code == 200:
                            jobs = res_jobs.json()
                            pending_jobs = [j for j in jobs if j.get('status') == 'pending']
                            
                            for job in pending_jobs:
                                job_id = job.get('id')
                                task_type = job.get('task_type')
                                payload = json.loads(job.get('payload', '{}'))
                                
                                # Khóa Lệnh lại để không bị chạy trùng
                                requests.patch(f"{api_jobs}/{job_id}", json={"status": "processing"}, timeout=10)
                                
                                if task_type == 'print_label':
                                    order_ids = payload.get('order_ids', [])
                                    self.so_log_msg(f"🖨️ [RADAR] Đã bắt được lệnh IN PHIẾU GIAO cho {len(order_ids)} đơn!")
                                    
                                    # Viết giấy nhớ giao việc cho Bot Shopee
                                    with open("temp_print_jobs.json", "w") as f:
                                        json.dump(order_ids, f)
                                        
                                    # Khởi động Bot Shopee đi lấy PDF ngay lập tức
                                    shop_data = next((s for s in self.app.DANH_SACH_SHOP if s.get("platform") == "shopee"), None)
                                    if shop_data:
                                        self.so_log_msg("⚡ Đang khởi động Bot Shopee để lấy file PDF...")
                                        try:
                                            asyncio.run(self.playwright_order_job(shop_data, "process"))
                                        except Exception as e:
                                            self.so_log_msg(f"❌ Lỗi Radar In Phiếu: {e}")
                                    
                                elif task_type == 'scrape_orders':
                                    self.so_log_msg("⚡ [RADAR] Nhận lệnh KÉO ĐƠN MỚI từ Web! Đang khởi động Máy Cày...")
                                    
                                # Đánh dấu xong Lệnh để dọn rác DB
                                requests.patch(f"{api_jobs}/{job_id}", json={"status": "completed"}, timeout=10)
                    except Exception as e_job:
                        pass # Bỏ qua nếu hộp thư Lệnh bị lỗi mạng

                    # 2. MẮT THẦN QUÉT ĐƠN HÀNG XÁC NHẬN (CŨ)
                    res = requests.get(api_orders, timeout=10)
                    if res.status_code == 200:
                        data = res.json()
                        orders = data.get("data", [])
                        
                        if orders:
                            shops_to_process = set([o["shop"] for o in orders])
                            self.so_log_msg(f"🔔 [RADAR] Web vừa Xác nhận đơn của: {', '.join(shops_to_process)}!")
                            
                            for shop_name in shops_to_process:
                                if not self.is_auto_running: break
                                shop_data = next((s for s in self.app.DANH_SACH_SHOP if s.get("ten_shop") == shop_name), None)
                                
                                if shop_data:
                                    self.so_log_msg(f"⚡ Đang mượn Tab Shopee để xử lý GẤP cho {shop_name}...")
                                    try:
                                        asyncio.run(self.playwright_order_job(shop_data, "process"))
                                    except Exception as e:
                                        self.so_log_msg(f"❌ Lỗi xử lý Radar: {e}")
                                    finally:
                                        time.sleep(3)
                except Exception as e:
                    pass 
                finally:
                    self.browser_lock.release() 
                    
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
            target_shops = [s for s in self.app.DANH_SACH_SHOP if s.get("platform") in ["shopee", "tiktok", "lazada"]]
            if not target_shops:
                self.so_log_msg("⚠️ Không có shop Shopee/TikTok/Lazada nào để chạy auto!")
                self.toggle_auto()
                break

            self.so_log_msg("-------------------------------------------------")
            self.so_log_msg(f"🔄 BẮT ĐẦU CHU KỲ CÀO ĐƠN {len(target_shops)} SHOP (SHOPEE + TIKTOK + LAZADA)")
            
            for shop in target_shops:
                if not self.is_auto_running: break
                
                self.so_log_msg(f"[*] Khóa an toàn: Đang Cào đơn Shop {shop['ten_shop']}...")
                self.browser_lock.acquire() # BẤM KHÓA: Radar bên ngoài phải đứng chờ
                try:
                    # Truyền lệnh scrape (Chỉ cào đơn)
                    asyncio.run(self.playwright_order_job(shop, "scrape")) 
                except Exception as e:
                    self.so_log_msg(f"❌ Lỗi Auto Shop {shop['ten_shop']}: {e}")
                finally:
                    self.browser_lock.release() # MỞ KHÓA: Radar được phép vào
                
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
        if self.browser_lock.locked(): # Kiểm tra xem ổ khóa thật có đang bị bấm không
            self.so_log_msg("🚦 HỆ THỐNG ĐANG BẬT ĐÈN ĐỎ: Bot Auto đang dở tay làm việc, vui lòng đợi vài giây rồi bấm lại...")
            return

        shop_name = self.so_shop_var.get()
        if shop_name == "Tất cả shop" or not shop_name:
            self.so_log_msg("⚠️ Vui lòng chọn 1 shop cụ thể ở ô bên cạnh để chạy tay!")
            return
            
        shop_data = next((s for s in self.app.DANH_SACH_SHOP if s.get("ten_shop") == shop_name), None)
        if not shop_data: return
            
        def task():
            self.browser_lock.acquire() # BẤM KHÓA khi chạy tay
            try:
                asyncio.run(self.playwright_order_job(shop_data, action))
            except Exception as e:
                self.so_log_msg(f"❌ Lỗi: {e}")
            finally:
                self.browser_lock.release() # MỞ KHÓA khi chạy xong
                
        threading.Thread(target=task, daemon=True).start()

    async def playwright_order_job(self, shop, action):
        # Đọc trạng thái từ Checkbox trên UI
        is_hidden = self.hide_browser_var.get()
        
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch_persistent_context(
                user_data_dir=shop['profile_dir'],
                channel="chrome",
                headless=is_hidden, # 🌟 ĐÃ KẾT NỐI: Nhận lệnh từ UI
                viewport={"width": 1280, "height": 720},
                args=["--disable-blink-features=AutomationControlled"]
            )
            try:
                page = browser.pages[0] if browser.pages else await browser.new_page()
                platform = shop.get('platform', '').lower()
                if platform not in ['shopee', 'tiktok', 'lazada']: return

                # Đăng nhập linh hoạt theo sàn
                if platform == 'shopee':
                    from engines.shopee.shopee_auth import ShopeeAuth
                    auth = ShopeeAuth(self.so_log_msg)
                elif platform == 'tiktok':
                    from engines.tiktok.tiktok_auth import TikTokAuth
                    auth = TikTokAuth(self.so_log_msg)
                elif platform == 'lazada':
                    from engines.lazada.lazada_auth import LazadaAuth
                    auth = LazadaAuth(self.so_log_msg)
                    
                is_logged = await auth.check_and_login(page, shop)
                if not is_logged:
                    self.so_log_msg(f"❌ Không thể đăng nhập vào {platform.upper()}!")
                    return

                # --- NHIỆM VỤ 1: CÀO ĐƠN ---
                if action in ["scrape", "auto_all", "scrape_new_only", "status_only"]:
                    self.so_log_msg(f"👉 Thực thi: CÀO ĐƠN HÀNG ({platform.upper()}) - Mã: {action}")
                    
                    if action == "scrape_new_only": scrape_mode = "new_only"
                    elif action == "status_only": scrape_mode = "status_only"
                    else: scrape_mode = "all"
                    
                    orders_data = []
                    
                    # 🚀 Lấy số lượng Limit từ Giao diện
                    try:
                        limits = {
                            "new": int(self.limit_new.get()),
                            "shipping": int(self.limit_ship.get()),
                            "done": int(self.limit_done.get())
                        }
                    except:
                        limits = {"new": 100, "shipping": 50, "done": 20}
                    
                    if platform == 'shopee':
                        from parsers.shopee_order_parser import ShopeeOrderParser
                        from engines.shopee.shopee_orders import ShopeeOrderScraper
                        parser = ShopeeOrderParser(self.so_log_msg)
                        scraper = ShopeeOrderScraper(self.so_log_msg, parser)
                        # Đã bơm Limits, Shop name và CHẾ ĐỘ QUÉT vào cho Bộ não Shopee
                        orders_data = await scraper.scrape_new_orders(page, limits=limits, shop_name=shop['ten_shop'], mode=scrape_mode)
                    elif platform == 'tiktok':
                        from parsers.tiktok_order_parser import TiktokOrderParser
                        from engines.tiktok.tiktok_orders import TiktokOrderScraper
                        parser = TiktokOrderParser(self.so_log_msg)
                        scraper = TiktokOrderScraper(self.so_log_msg, parser)
                        # 🌟 Đã móc dây điện: Truyền Limits, Tên Shop và CHẾ ĐỘ QUÉT xuống cho Bot TikTok
                        orders_data = await scraper.scrape_new_orders(page, limits=limits, shop_name=shop['ten_shop'], mode=scrape_mode)
                    elif platform == 'lazada':
                        from parsers.lazada_order_parser import LazadaOrderParser
                        from engines.lazada.lazada_orders import LazadaOrderScraper
                        parser = LazadaOrderParser(self.so_log_msg)
                        scraper = LazadaOrderScraper(self.so_log_msg, parser)
                        # 🌟 Truyền CHẾ ĐỘ QUÉT xuống cho Bot Lazada
                        orders_data = await scraper.scrape_new_orders(page, shop_name=shop['ten_shop'], mode=scrape_mode)
                    
                    if orders_data:
                        self.so_log_msg(f"📦 Thu thập được {len(orders_data)} đơn. Đang tải lên Server...")
                        import requests
                        
                        api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                        payload = {"orders": [], "items": []}
                        
                        # --- [BỌC THÉP] KHỬ TRÙNG LẶP (DEDUPLICATION) TRƯỚC KHI GỬI ---
                        unique_orders = {}
                        for order in orders_data:
                            o_id = order.get("order_id")
                            if o_id:
                                # Dùng Dictionary để ép trùng: Đơn xuất hiện 2 lần ở 2 Tab sẽ đè lên nhau thành 1
                                unique_orders[o_id] = order
                                
                        # Đóng gói dữ liệu ĐỘC BẢN để đẩy lên API
                        for o_id, order in unique_orders.items():
                            # 1. Tách thông tin Đơn hàng chính
                            order_info = order.copy()
                            if "items" in order_info:
                                del order_info["items"]
                            payload["orders"].append(order_info)
                            
                            # 2. Tách danh sách Sản phẩm (Items)
                            if "items" in order:
                                for item in order["items"]:
                                    item_payload = item.copy()
                                    item_payload["order_id"] = o_id
                                    payload["items"].append(item_payload)
                        try:
                            self.so_log_msg(f"🔎 [RADAR] Bot chuẩn bị gửi: {len(payload['orders'])} Đơn và {len(payload['items'])} Sản phẩm!")
                            res = requests.post(api_url, json=payload, timeout=45) # Tăng timeout tránh lỗi 500
                            
                            if res.status_code == 200:
                                res_data = res.json()
                                self.so_log_msg(f"✅ [SERVER] Thành công! Đã xử lý: {res_data.get('inserted', 0)} đơn mới, {res_data.get('updated', 0)} cập nhật.")
                            else:
                                # 🔴 ĐÂY LÀ DÒNG QUAN TRỌNG ĐỂ BIẾT LỖI DATABASE
                                self.so_log_msg(f"❌ [LỖI SERVER {res.status_code}] Nội dung: {res.text}")
                                # Nếu bị lỗi, in ra 1 đơn mẫu để kiểm tra cấu trúc
                                if payload['orders']:
                                    self.so_log_msg(f"📝 Mẫu đơn gửi lỗi: {payload['orders'][0]['order_id']} | Status: {payload['orders'][0].get('shipping_status')}")
                        except Exception as e:
                            self.so_log_msg(f"❌ [LỖI KẾT NỐI] Không thể gửi dữ liệu: {e}")
                    else:
                        self.so_log_msg(f"✅ Không có đơn mới nào trên {platform.upper()}.")

                # --- NHIỆM VỤ 2: XỬ LÝ ĐƠN ---
                if action in ["process", "auto_all"]:
                    if platform == 'shopee':
                        self.so_log_msg("👉 Thực thi: TỰ ĐỘNG CHUẨN BỊ HÀNG SHOPEE")
                        from engines.shopee.shopee_process import ShopeeOrderProcessor
                        processor = ShopeeOrderProcessor(self.so_log_msg)
                        await processor.process_confirmed_orders(page, shop['ten_shop'])
                    else:
                        self.so_log_msg(f"⚠️ Chức năng Chuẩn bị hàng chưa hỗ trợ tự động cho {platform.upper()}")

                # --- NHIỆM VỤ 3: QUÉT TRẠNG THÁI (PHƯƠNG ÁN B) ---
                if action == "status":
                    if platform == 'shopee':
                        self.so_log_msg("👉 Thực thi: QUÉT TRẠNG THÁI BẰNG API SHOPEE")
                        from engines.shopee.shopee_status_core import ShopeeStatusCore
                        status_bot = ShopeeStatusCore(self.so_log_msg)
                        await status_bot.scan_and_update(page, shop['ten_shop'])
                    elif platform == 'tiktok':
                        self.so_log_msg("👉 Thực thi: QUÉT TRẠNG THÁI UI TIKTOK (DẠNG THẺ)")
                        from engines.tiktok.tiktok_status_core import TikTokStatusCore
                        status_bot = TikTokStatusCore(self.so_log_msg)
                        await status_bot.scan_and_update(page, shop['ten_shop'])
                    else:
                        self.so_log_msg(f"⚠️ Chức năng Quét Trạng Thái chưa hỗ trợ cho {platform.upper()}")

            finally:
                await browser.close()
