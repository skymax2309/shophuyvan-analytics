import customtkinter as ctk
import threading
import requests
import time
import json
import asyncio
from datetime import datetime

# Mượn lại bộ máy cào đơn cũ làm "Động cơ ngầm" (Không cần viết lại Playwright)
from ui.sync_order_tab import SyncOrderTab

class OMSRadarTab(ctk.CTkFrame):
    def __init__(self, master, app):
        super().__init__(master, fg_color="transparent")
        self.app = app
        self.is_auto_running = False
        self.browser_lock = threading.Lock()
        
        # 🌟 KHỞI TẠO BỘ MÁY CŨ NHƯNG GIẤU ĐI (KHÔNG VẼ LÊN MÀN HÌNH)
        self.legacy_engine = SyncOrderTab(master, app)
        self.legacy_engine.pack_forget() 
        
        self._build_ui()
        
        # 🌟 VẼ GIAO DIỆN RADAR LÊN MÀN HÌNH
        self.pack(fill="both", expand=True)

    def _build_ui(self):
        ctk.CTkLabel(self, text="📡 TRUNG TÂM RADAR NHẬN LỆNH 24/7",
                     font=("Segoe UI", 22, "bold"), text_color="#00FF88").pack(pady=(30, 10))
        ctk.CTkLabel(self,
                     text="Hệ thống đã nâng cấp lên chuẩn SaaS: Mọi thao tác điều khiển đều nằm trên Website.\nPhần mềm này chỉ đóng vai trò như một Vệ tinh chạy ngầm và chờ lệnh từ Đám mây.",
                     font=("Segoe UI", 13), text_color="#AAAAAA", wraplength=600).pack(pady=(0, 30))

        auto_frame = ctk.CTkFrame(self, fg_color="#1A1A1A", corner_radius=15, border_width=1, border_color="#333333")
        auto_frame.pack(padx=30, fill="x", pady=15)

        # --- NÚT BẬT AUTO SIÊU TO KHỔNG LỒ ---
        self.btn_auto = ctk.CTkButton(auto_frame, text="▶️ BẬT RADAR NHẬN LỆNH",
                                      fg_color="#16a34a", text_color="white", hover_color="#15803d",
                                      font=("Segoe UI", 24, "bold"), height=80, width=400,
                                      command=self.toggle_auto)
        self.btn_auto.pack(pady=40)

        # Đổi value=False để MẶC ĐỊNH LÀ HIỆN CHROME (Chống Shopee chặn)
        self.hide_browser_var = ctk.BooleanVar(value=False)
        self.chk_hide_browser = ctk.CTkCheckBox(auto_frame, text="👻 Chạy ngầm (Không bật Chrome, không chiếm chuột)",
                                                variable=self.hide_browser_var, text_color="#fbbf24", font=("Segoe UI", 14, "bold"))
        self.chk_hide_browser.pack(pady=(0, 30))

    def so_log_msg(self, msg):
        self.app.log(msg)

    def toggle_auto(self):
        if not self.is_auto_running:
            self.is_auto_running = True
            self.btn_auto.configure(text="⏹ ĐANG CHẠY RADAR (BẤM ĐỂ TẮT)", fg_color="#dc2626", hover_color="#b91c1c")
            self.so_log_msg("🚀 Bắt đầu khởi động Radar vệ tinh...")
            
            # Đồng bộ cấu hình "Chạy ngầm" sang cho bộ máy ẩn
            if hasattr(self.legacy_engine, 'hide_browser_var'):
                self.legacy_engine.hide_browser_var = self.hide_browser_var 
                
            threading.Thread(target=self.listen_loop_worker, daemon=True).start()
        else:
            self.is_auto_running = False
            self.btn_auto.configure(text="▶️ BẬT RADAR NHẬN LỆNH", fg_color="#16a34a", hover_color="#15803d")
            self.so_log_msg("🛑 Đã gửi lệnh dừng Radar. Đang chờ luồng hoàn tất...")

    def listen_loop_worker(self):
        """📡 Luồng Radar: Bơm 100% lệnh từ Web (SaaS) xuống Bot"""
        api_jobs = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/jobs"
        self.so_log_msg("📡 [RADAR] Kênh thu phát vệ tinh đã mở! Đang hóng lệnh từ Website...")
        
        while self.is_auto_running:
            now = datetime.now()
            # Nghỉ đêm từ 23h đến 5h sáng (Tùy chỉnh nếu cần)
            if now.hour >= 23 or now.hour < 5:
                time.sleep(60)
                continue

            if self.browser_lock.acquire(blocking=False):
                try:
                    res_jobs = requests.get(api_jobs, timeout=10)
                    if res_jobs.status_code == 200:
                        res_data = res_jobs.json()
                        # Dò mìn cấu trúc JSON: Nếu API bọc trong "data" thì bóc ra, không thì lấy nguyên
                        jobs = res_data.get("data", []) if isinstance(res_data, dict) else res_data
                        if not jobs: jobs = [] # Cứu hộ nếu API trả về rỗng (null)
                        
                        # Bọc thép vòng lặp: Chỉ lấy các phần tử là Dictionary và có status = pending
                        pending_jobs = [j for j in jobs if isinstance(j, dict) and j.get('status') == 'pending']
                        
                        for job in pending_jobs:
                            job_id = job.get('id')
                            task_type = job.get('task_type')
                            
                            # Xử lý an toàn chuỗi payload (Chống sập do NoneType)
                            payload_raw = job.get('payload')
                            if not payload_raw: payload_raw = '[]' 
                            
                            try:
                                payload = json.loads(payload_raw) if isinstance(payload_raw, str) else payload_raw
                            except:
                                payload = []
                            
                            # Khóa Lệnh lại để tránh chạy trùng 2 lần
                            requests.patch(f"{api_jobs}/{job_id}", json={"status": "processing"}, timeout=10)
                            
                            # ── BỘ ĐIỀU PHỐI (TASK ROUTER) ──
                            if task_type == 'print_label':
                                # THÁO NÚT THẮT 0 ĐƠN: Xử lý linh hoạt cả List và Dict
                                if isinstance(payload, list):
                                    order_ids = payload
                                elif isinstance(payload, dict):
                                    order_ids = payload.get('order_ids', [])
                                else:
                                    order_ids = []
                                
                                job_shop = job.get('shop_name', '')
                                job_platform = job.get('platform', 'shopee').lower()
                                
                                self.so_log_msg(f"🖨️ [RADAR] Nhận lệnh Chuẩn bị hàng: {len(order_ids)} đơn của Shop {job_shop}!")
                                
                                # Ghi giấy nhớ riêng cho từng Shop 
                                temp_file = f"temp_print_jobs_{job_shop}.json"
                                with open(temp_file, "w") as f:
                                    json.dump(order_ids, f)
                                    
                                shop_data = next((s for s in self.app.DANH_SACH_SHOP if s.get("ten_shop") == job_shop), None)
                                
                                # THÁO NÚT THẮT CHROME: Luồng Độc lập cho Lazada API
                                if job_platform == 'lazada':
                                    self.so_log_msg("⚡ [RADAR] Kích hoạt luồng In API siêu tốc cho Lazada (Bỏ qua Chrome)...")
                                    try:
                                        # Tìm và nạp động cơ API Lazada
                                        import sys, os
                                        try:
                                            from lazada_process import LazadaOrderProcessor
                                        except ImportError:
                                            from engines.lazada.lazada_process import LazadaOrderProcessor
                                            
                                        lz_processor = LazadaOrderProcessor(self.so_log_msg)
                                        asyncio.run(lz_processor.process_confirmed_orders(None, job_shop))
                                    except Exception as err:
                                        self.so_log_msg(f"❌ Lỗi kích hoạt API Lazada: {err}")
                                else:
                                    # Các sàn Shopee/TikTok vẫn giữ nguyên luồng Chrome cũ
                                    if shop_data and hasattr(self.legacy_engine, 'playwright_order_job'):
                                        asyncio.run(self.legacy_engine.playwright_order_job(shop_data, "process"))

                            elif task_type == 'scrape_orders':
                                self.so_log_msg("⚡ [RADAR] Nhận lệnh từ Web: KÉO ĐƠN MỚI TỐC ĐỘ CAO!")
                                for shop_data in [s for s in self.app.DANH_SACH_SHOP if s.get("platform") in ["shopee", "tiktok", "lazada"]]:
                                    if hasattr(self.legacy_engine, 'playwright_order_job'):
                                        asyncio.run(self.legacy_engine.playwright_order_job(shop_data, "scrape_new_only"))

                            # LUỒNG MỚI: QUÉT HÀNH TRÌNH (BẰNG CÁO ĐA TAB SIÊU TỐC)
                            elif task_type == 'sync_status':
                                self.so_log_msg("🔍 [RADAR] Nhận lệnh từ Web: ĐỒNG BỘ HÀNH TRÌNH (Bỏ qua Tab Chờ Lấy Hàng)!")
                                for shop_data in [s for s in self.app.DANH_SACH_SHOP if s.get("platform") in ["shopee", "tiktok", "lazada"]]:
                                    if hasattr(self.legacy_engine, 'playwright_order_job'):
                                        # Truyền mã lệnh ĐẶC NHIỆM: Chỉ quét hành trình
                                        asyncio.run(self.legacy_engine.playwright_order_job(shop_data, "status_only"))
                                    
                            # Báo cáo hoàn thành lên Web
                            requests.patch(f"{api_jobs}/{job_id}", json={"status": "completed"}, timeout=10)
                            self.so_log_msg(f"✅ [RADAR] Bot đã xử lý xong lệnh từ Web!")
                            
                except Exception as e:
                    # BẬT LOG DÒ MÌN THEO QUY TẮC 15 (Chỉ ẩn lỗi mạng vặt)
                    err_msg = str(e).lower()
                    if "timeout" not in err_msg and "connection" not in err_msg:
                        self.so_log_msg(f"⚠️ [LỖI RADAR]: {e}")
                finally:
                    self.browser_lock.release()
            
            # Quét hộp thư 10 giây 1 lần
            for _ in range(10):
                if not self.is_auto_running: break
                time.sleep(1)
