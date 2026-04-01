import customtkinter as ctk
import threading
import asyncio
import json
import urllib.request
import os
import sys
from tkcalendar import DateEntry
from playwright.async_api import async_playwright

class AutoRunTab(ctk.CTkFrame):
    def __init__(self, master, app):
        super().__init__(master, fg_color="transparent")
        self.app = app
        self.pack(fill="both", expand=True)
        
        self.auto_running = False
        self.confirm_event = threading.Event()
        
        self._build_ui()

    def _build_ui(self):
        main_frame = ctk.CTkFrame(self, fg_color="transparent")
        main_frame.pack(fill="both", expand=True, padx=20, pady=15)

        left = ctk.CTkFrame(main_frame, fg_color="#222222", corner_radius=12,
                            border_width=1, border_color="#333333", width=240)
        left.pack(side="left", fill="y", padx=(0,15))
        left.pack_propagate(False)

        ctk.CTkLabel(left, text="🗓️ THỜI GIAN",
                     font=("Segoe UI",13,"bold"),
                     text_color="#FFD700").pack(pady=(8, 4))
        tf = ctk.CTkFrame(left, fg_color="transparent")
        tf.pack(fill="x", padx=10, pady=(0, 4))
        ctk.CTkLabel(tf, text="Năm:", font=("Segoe UI",12, "bold"), text_color="white").pack(side="left")
        self.entry_nam = ctk.CTkEntry(tf, width=70, height=24, font=("Segoe UI",12,"bold"),
                                      text_color="#00CED1", justify="center")
        self.entry_nam.insert(0, "2026")
        self.entry_nam.pack(side="left", padx=5)

        self.mode_var = ctk.StringVar(value="month")
        mode_frame = ctk.CTkFrame(left, fg_color="transparent")
        mode_frame.pack(fill="x", padx=10, pady=(4,4))
        ctk.CTkRadioButton(mode_frame, text="Theo tháng", variable=self.mode_var,
            value="month", command=self._toggle_date_mode,
            font=("Segoe UI",12, "bold"), text_color="white", fg_color="#00CED1").pack(side="left", padx=(0,8))
        ctk.CTkRadioButton(mode_frame, text="Theo ngày", variable=self.mode_var,
            value="day", command=self._toggle_date_mode,
            font=("Segoe UI",12, "bold"), text_color="white", fg_color="#00CED1").pack(side="left")

        self.frame_month = ctk.CTkFrame(left, fg_color="transparent")
        self.frame_month.pack(padx=8)
        self.month_vars = []
        for m in range(1, 13):
            var = ctk.BooleanVar(value=False)
            cb = ctk.CTkCheckBox(self.frame_month, text=f"T{m}", variable=var, width=60,
                                  font=("Segoe UI", 11, "bold"), text_color="white", checkbox_width=18, checkbox_height=18,
                                  fg_color="#00CED1", hover_color="#00FFFF")
            cb.grid(row=(m-1)//3, column=(m-1)%3, padx=8, pady=6)
            self.month_vars.append(var)

        self.frame_day = ctk.CTkFrame(left, fg_color="transparent")
        df1 = ctk.CTkFrame(self.frame_day, fg_color="transparent")
        df1.pack(fill="x", padx=4, pady=2)
        ctk.CTkLabel(df1, text="Từ ngày:", font=("Segoe UI",12, "bold"), text_color="white", width=65).pack(side="left")
        self.entry_from_date = DateEntry(df1, width=12, font=("Segoe UI", 11, "bold"), 
                                         background="#00CED1", foreground="white", borderwidth=2,
                                         date_pattern="yyyy-mm-dd", justify="center")
        self.entry_from_date.pack(side="left", padx=4, pady=2)
        
        df2 = ctk.CTkFrame(self.frame_day, fg_color="transparent")
        df2.pack(fill="x", padx=4, pady=2)
        ctk.CTkLabel(df2, text="Đến ngày:", font=("Segoe UI",12, "bold"), text_color="white", width=65).pack(side="left")
        self.entry_to_date = DateEntry(df2, width=12, font=("Segoe UI", 11, "bold"), 
                                       background="#00CED1", foreground="white", borderwidth=2,
                                       date_pattern="yyyy-mm-dd", justify="center")
        self.entry_to_date.pack(side="left", padx=4, pady=2)
        self.frame_day.pack_forget()

        ctk.CTkLabel(left, text="Loại báo cáo:",
                     font=("Segoe UI", 12, "bold"), text_color="white").pack(anchor="w", padx=12, pady=(12,4))
        self.var_doanh_thu = ctk.BooleanVar(value=True)
        self.var_hoa_don   = ctk.BooleanVar(value=True)
        self.var_don_hang  = ctk.BooleanVar(value=True)
        for var, label in [
            (self.var_doanh_thu,"📊 Doanh Thu"),
            (self.var_hoa_don,  "🧾 Hóa Đơn & Phí"),
            (self.var_don_hang, "📦 Đơn Hàng"),
        ]:
            ctk.CTkCheckBox(left, text=label, variable=var, text_color="white",
                            font=("Segoe UI", 11, "bold"), fg_color="#00CED1").pack(anchor="w", padx=20, pady=3)

        right = ctk.CTkFrame(main_frame, fg_color="transparent")
        right.pack(side="right", fill="both", expand=True)

        ctk.CTkLabel(right, text="🛒 CHỌN SHOP CẦN CHẠY", font=("Segoe UI", 12, "bold"), text_color="white").pack(anchor="w", pady=(0, 4))
        self.auto_shop_frame = ctk.CTkScrollableFrame(right, height=85, fg_color="#222222", corner_radius=8, border_width=1, border_color="#333333")
        self.auto_shop_frame.pack(fill="x", pady=(0, 8))
        self.auto_shop_vars = {} 
        self._refresh_auto_shop_list()

        self.btn_start = ctk.CTkButton(right,
            text="▶ BẬT CHẾ ĐỘ TỰ ĐỘNG (30s/lần)",
            command=self.toggle_auto,
            font=("Segoe UI", 13, "bold"),
            fg_color="#28A745", hover_color="#218838", height=36, corner_radius=8)
        self.btn_start.pack(fill="x", pady=(0, 8))

        self.btn_confirm = ctk.CTkButton(right,
            text="⚠️ XÁC NHẬN CỨU HỘ (KHI LỖI)",
            command=self.confirm_step,
            font=("Segoe UI", 12, "bold"),
            fg_color="#FF8C00", hover_color="#FFA500", height=32,
            state="disabled", corner_radius=8)
        self.btn_confirm.pack(fill="x", pady=(0, 8))

    def log(self, message):
        # Chuyển hướng dòng chảy log ra thẳng cửa sổ chính
        self.app.log(message)

    def toggle_auto(self):
        if not self.auto_running:
            self.auto_running = True
            self.btn_start.configure(text="⏹ TẮT CHẾ ĐỘ TỰ ĐỘNG", fg_color="red")
            self.log("🤖 Chế độ tự động BẬT...")
            threading.Thread(target=self.auto_loop, daemon=True).start()
        else:
            self.auto_running = False
            self.btn_start.configure(text="▶ BẬT CHẾ ĐỘ TỰ ĐỘNG", fg_color="#28A745")
            self.log("⏹ Chế độ tự động ĐÃ TẮT.")

    def auto_loop(self):
        import time
        while self.auto_running:
            self.log("🔍 Đang kiểm tra lệnh mới từ Server...")
            asyncio.run(self.run_main_logic())
            
            # Đếm ngược 30 giây để người dùng biết tool vẫn đang sống
            for i in range(30, 0, -1): 
                if not self.auto_running: 
                    break
                if i % 10 == 0: # Chỉ in log mỗi 10s để đỡ rác màn hình
                    self.log(f"⏳ Quét lại sau {i} giây...")
                time.sleep(1)

    def confirm_step(self):
        self.confirm_event.set()
        self.btn_confirm.configure(state="disabled")

    def rescue_wait(self, msg):
        self.log(f"⚠️ DỪNG KHẨN CẤP: {msg}")
        self.btn_confirm.configure(state="normal")
        self.confirm_event.clear()
        self.confirm_event.wait()

    def _toggle_date_mode(self):
        if self.mode_var.get() == "month":
            self.frame_day.pack_forget()
            self.frame_month.pack(padx=8)
        else:
            self.frame_month.pack_forget()
            self.frame_day.pack(padx=8, pady=4)    

    def _refresh_auto_shop_list(self):
        for widget in self.auto_shop_frame.winfo_children():
            widget.destroy()
        self.auto_shop_vars.clear()
        for idx, shop in enumerate(self.app.DANH_SACH_SHOP):
            var = ctk.BooleanVar(value=True) 
            cb = ctk.CTkCheckBox(self.auto_shop_frame, text=f"[{shop['platform'].upper()}] {shop['ten_shop']}",
                                 variable=var, font=("Segoe UI", 11, "bold"), text_color="white",
                                 fg_color="#00CED1", hover_color="#00FFFF")
            cb.pack(anchor="w", pady=4, padx=5)
            self.auto_shop_vars[idx] = var

    def get_selected_shops(self):
        selected = []
        for idx, var in self.auto_shop_vars.items():
            if var.get():
                selected.append(self.app.DANH_SACH_SHOP[idx])
        return selected

    async def run_main_logic(self):
        api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/jobs"
        self.log("🌐 Đang kết nối Server lấy danh sách lệnh chạy...")
        
        try:
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'}
            req = urllib.request.Request(api_url, method="GET", headers=headers)
            with urllib.request.urlopen(req) as response:
                jobs_data = json.loads(response.read().decode())
            
            if not jobs_data:
                self.log("✅ Không có lệnh chờ (pending) nào.")
                return
            self.log(f"📥 Tìm thấy {len(jobs_data)} lệnh chờ xử lý.")
        except Exception as e:
            self.log(f"❌ Lỗi kết nối API Server: {str(e)}")
            return

        # TIỀN XỬ LÝ LỆNH TỪ SERVER (Giải quyết triệt để lỗi từ khóa ALL và lệch tên Shop)
        expanded_jobs = []
        for job in jobs_data:
            plat = str(job.get('platform', 'shopee')).lower()
            s_name = str(job.get('shop_name', ''))
            
            matched = False
            for s in self.app.DANH_SACH_SHOP:
                s_plat = str(s.get("platform", "shopee")).lower()
                
                # 1. Kiểm tra khớp sàn (hoặc nếu server gửi lệnh chạy tất cả sàn 'ALL')
                if plat != "all" and plat != s_plat:
                    continue
                    
                # 2. Kiểm tra khớp tên shop hoặc user_name (hoặc nếu server gửi lệnh 'ALL')
                if s_name.upper() != "ALL" and s_name != s.get("ten_shop") and s_name != s.get("user_name"):
                    continue
                
                # 3. Tạo bản sao của lệnh, nhưng gán ĐÍCH DANH user_name để làm ID chuẩn
                new_job = job.copy()
                new_job['shop_name'] = s.get("user_name") 
                new_job['platform'] = s_plat
                expanded_jobs.append(new_job)
                matched = True
                
            if not matched:
                 self.log(f"⚠️ Bỏ qua lệnh ID {job.get('id')}: Không tìm thấy User Name '{s_name}' sàn '{plat}' trong máy.")
        
        # Đưa danh sách lệnh đã được chuẩn hóa vào luồng xử lý chính
        jobs_data = expanded_jobs

        if self.mode_var.get() == "day":
            from_date = self.entry_from_date.get().strip()
            to_date   = self.entry_to_date.get().strip()
            if not from_date or not to_date:
                self.log("⚠️ Vui lòng nhập đủ Từ ngày và Đến ngày!")
                return
            import datetime
            d = datetime.datetime.strptime(from_date, "%Y-%m-%d")
            jobs_data = [{
                "id": "manual",
                "shop_name": s.get("user_name", s["ten_shop"]),
                "month": d.month,
                "year": str(d.year),
                "platform": s["platform"],
                "task_type": "all",
                "from_date": from_date,
                "to_date": to_date,
            } for s in self.get_selected_shops()]
            if not jobs_data:
                self.log("⚠️ Chưa chọn shop nào!")
                return

        async with async_playwright() as p:
            for job in jobs_data:
                shop_name = job['shop_name']
                THANG_TAI = int(job['month'])
                NAM = str(job['year'])
                job_id = job['id']
                
                # CHUẨN HÓA DỮ LIỆU TỪ SERVER: Ép về chữ thường để tránh bị lướt qua lệnh
                task_type = str(job.get('task_type') or 'all').strip().lower()
                platform_job = str(job.get('platform') or 'shopee').strip().lower()

                # TÌM CHÍNH XÁC: Luôn khớp theo User Name (Tài khoản) LẪN Tên Sàn để tuyệt đối không bị lệch
                shop_goc = next((s for s in self.app.DANH_SACH_SHOP if s.get("user_name") == shop_name and s.get("platform", "shopee") == platform_job), None)
                if not shop_goc:
                    self.log(f"⚠️ Bỏ qua lệnh ID {job_id}: Không tìm thấy shop '{shop_name}' sàn '{platform_job}' trong máy.")
                    continue

                # TẠO THƯ MỤC THÁNG: Copy cấu hình gốc và tự động chèn thêm folder "MMYYYY" vào đường dẫn lưu
                shop = shop_goc.copy()
                thang_nam_dir = f"{str(THANG_TAI).zfill(2)}{NAM}"
                shop["thu_muc_luu"] = os.path.join(shop.get("thu_muc_luu", ""), thang_nam_dir)

                self.log(f"\n🚀 ĐANG CHẠY LỆNH (ID: {job_id}) SHOP: {shop_name} ({platform_job.upper()}) - Tháng {THANG_TAI}/{NAM}")
                self.log(f"📂 Thư mục lưu file: {shop['thu_muc_luu']}")
                
                if not os.path.exists(shop["profile_dir"]):
                    os.makedirs(shop["profile_dir"])

                context = await p.chromium.launch_persistent_context(
                    user_data_dir=shop["profile_dir"], channel="chrome", headless=self.app.var_headless.get(),
                    args=["--disable-blink-features=AutomationControlled"]
                )
                page = context.pages[0]

                try:
                    from_date = job.get('from_date') or None
                    to_date   = job.get('to_date')   or None

                    if platform_job == 'tiktok':
                        if task_type in ['doanh_thu', 'all'] and hasattr(self.app.tiktok_eng, 'tiktok_xu_ly_doanh_thu'):
                            await self.app.tiktok_eng.tiktok_xu_ly_doanh_thu(page, shop, THANG_TAI, NAM)
                        if task_type in ['hoa_don', 'all'] and hasattr(self.app.tiktok_eng, 'tiktok_xu_ly_hoa_don'):
                            await self.app.tiktok_eng.tiktok_xu_ly_hoa_don(page, shop, THANG_TAI, NAM)
                        if task_type in ['don_hang', 'all']:
                            if from_date and to_date and hasattr(self.app.tiktok_eng, 'tiktok_xu_ly_don_hang_ngay'):
                                await self.app.tiktok_eng.tiktok_xu_ly_don_hang_ngay(page, shop, from_date, to_date)
                            elif hasattr(self.app.tiktok_eng, 'tiktok_xu_ly_don_hang'):
                                await self.app.tiktok_eng.tiktok_xu_ly_don_hang(page, shop, THANG_TAI, NAM)

                    elif platform_job == 'lazada':
                        if task_type in ['doanh_thu', 'all'] and hasattr(self.app.lazada_eng, 'lazada_xu_ly_doanh_thu'):
                            await self.app.lazada_eng.lazada_xu_ly_doanh_thu(page, shop, THANG_TAI, NAM)
                        if task_type in ['hoa_don', 'all'] and hasattr(self.app.lazada_eng, 'lazada_xu_ly_hoa_don'):
                            await self.app.lazada_eng.lazada_xu_ly_hoa_don(page, shop, THANG_TAI, NAM)
                        if task_type in ['don_hang', 'all']:
                            if from_date and to_date and hasattr(self.app.lazada_eng, 'lazada_xu_ly_don_hang_ngay'):
                                await self.app.lazada_eng.lazada_xu_ly_don_hang_ngay(page, shop, from_date, to_date)
                            elif hasattr(self.app.lazada_eng, 'lazada_xu_ly_don_hang'):
                                await self.app.lazada_eng.lazada_xu_ly_don_hang(page, shop, THANG_TAI, NAM)

                    else:
                        if task_type in ['doanh_thu', 'all'] and hasattr(self.app.shopee_eng, 'xu_ly_doanh_thu'):
                            await self.app.shopee_eng.xu_ly_doanh_thu(page, shop, THANG_TAI, NAM)
                        if task_type in ['hoa_don', 'all'] and hasattr(self.app.shopee_eng, 'xu_ly_hoa_don'):
                            await self.app.shopee_eng.xu_ly_hoa_don(page, shop, THANG_TAI, NAM)
                        if task_type in ['don_hang', 'all']:
                            if from_date and to_date and hasattr(self.app.shopee_eng, 'shopee_xu_ly_don_hang_ngay'):
                                await self.app.shopee_eng.shopee_xu_ly_don_hang_ngay(page, shop, from_date, to_date)
                            elif hasattr(self.app.shopee_eng, 'xu_ly_don_hang'):
                                await self.app.shopee_eng.xu_ly_don_hang(page, shop, THANG_TAI, NAM)

                    try:
                        patch_url = f"{api_url}/{job_id}"
                        patch_data = json.dumps({"status": "completed"}).encode('utf-8')
                        patch_headers = {
                            'Content-Type': 'application/json',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
                        }
                        patch_req = urllib.request.Request(patch_url, data=patch_data, method="PATCH", headers=patch_headers)
                        with urllib.request.urlopen(patch_req) as res:
                            self.log(f"✅ Đã báo cáo hoàn thành lệnh ID {job_id} lên Server.")
                    except Exception as e:
                        self.log(f"⚠️ Lỗi cập nhật trạng thái lên Server: {str(e)}")

                except Exception as e:
                    self.log(f"❌ Lỗi xử lý shop {shop['ten_shop']}: {str(e)}")
                    self.rescue_wait("Xác nhận để chuyển sang lệnh tiếp theo.")
                finally:
                    await context.close()

        self.log("🎉 ĐÃ CHẠY XONG TOÀN BỘ LỆNH TỪ SERVER!")
