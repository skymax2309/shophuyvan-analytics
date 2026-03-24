import asyncio
import os
import threading
import urllib.request
import urllib.parse
import json
import zipfile
try:
    import openpyxl
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False
try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False
import customtkinter as ctk
from playwright.async_api import async_playwright
class HuyVanApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.confirm_event = threading.Event()

        # --- DANH SÁCH SHOP ---
        self.DANH_SACH_SHOP = [
            {
                "ten_shop": "Huy Vân Store Q.Bình Tân",
                "mat_khau": "Nghiem23091984",
                "thu_muc_luu": r"E:\Doanh Thu Sàn TMDT 2026\LƯU THẾ HẢI\phambich2312",
                "profile_dir": r"C:\Users\Admin\Desktop\HuyVan_Bot_Data_Shop1",
                "platform": "shopee"
            },
            {
                "ten_shop": "shophuyvan.vn",
                "mat_khau": "Nghiem23091984",
                "thu_muc_luu": r"E:\Doanh Thu Sàn TMDT 2026\LƯU THẾ HẢI\chihuy2309",
                "profile_dir": r"C:\Users\Admin\Desktop\HuyVan_Bot_Data_Shop2",
                "platform": "shopee"
            },
            {
                "ten_shop": "KHOGIADUNGHUYVAN",
                "mat_khau": "Nghiem23091984",
                "thu_muc_luu": r"E:\Doanh Thu Sàn TMDT 2026\NGHIÊM CHÍ HUY\chihuy1984",
                "profile_dir": r"C:\Users\Admin\Desktop\HuyVan_Bot_Data_Shop3",
                "platform": "shopee"
            },
            {
                "ten_shop": "ShopHuyVan",
                "email_login": "kinhdoanhonlinegiasoc@gmail.com",
                "mat_khau": "Nghiem23091984$",
                "thu_muc_luu": r"E:\Doanh Thu Sàn TMDT 2026\NGHIÊM CHÍ HUY\lazada",
                "profile_dir": r"C:\Users\Admin\Desktop\HuyVan_Bot_Data_Lazada",
                "platform": "lazada"
            },
            {
                "ten_shop": "ShopHuyVan",
                "email_login": "0909128999",
                "mat_khau": "Nghiem23091984",
                "thu_muc_luu": r"E:\Doanh Thu Sàn TMDT 2026\NGHIÊM CHÍ HUY\tiktok",
                "profile_dir": r"C:\Users\Admin\Desktop\HuyVan_Bot_Data_TikTok",
                "platform": "tiktok"
            }
        ]

        # ── GIAO DIỆN MỚI (PREMIUM) ──────────────────────────────────
        from tkinter import ttk
        import tkinter.messagebox as messagebox

        self.configure(fg_color="#101010")
        self.minsize(1000, 650)

        ctk.CTkLabel(self, text="⚡ AUTO E-COM DATA CENTER",
                     font=("Segoe UI", 24, "bold"),
                     text_color="#00CED1").pack(pady=(15,2))
        ctk.CTkLabel(self, text="Hệ thống tải Doanh thu & Hóa đơn tự động đa sàn",
                     font=("Segoe UI", 11, "italic"),
                     text_color="#AAAAAA").pack(pady=(0,8))

        self.tabview = ctk.CTkTabview(self,
            fg_color="#1A1A1A", segmented_button_fg_color="#262626",
            segmented_button_selected_color="#00CED1",
            segmented_button_selected_hover_color="#00FFFF",
            text_color="white", corner_radius=15,
            border_width=1, border_color="#333333")
        self.tabview.pack(fill="both", expand=True, padx=15, pady=10)
        self.tabview._segmented_button.configure(font=("Segoe UI", 13, "bold"))

        tab_quanly = self.tabview.add("👤 Quản Lý Tài Khoản")
        tab_chay   = self.tabview.add("🚀 Chạy Tự Động (Auto)")

       # ── TAB QUẢN LÝ ──────────────────────────────────────────────
        top_frame = ctk.CTkFrame(tab_quanly, fg_color="transparent")
        top_frame.pack(fill="x", padx=15, pady=(15,5))

        # Form thêm shop
        ctk.CTkLabel(top_frame, text="Thêm Shop Mới:",
                     font=("Segoe UI",14,"bold"),
                     text_color="#FFD700").pack(anchor="w", pady=(0,6))

        form_frame = ctk.CTkFrame(top_frame, fg_color="#222222",
                                   corner_radius=10, border_width=1, border_color="#333333")
        form_frame.pack(fill="x")

        # Hàng 1: Sàn + Tên shop + Tài khoản + Mật khẩu
        self.combo_san_new = ctk.CTkComboBox(form_frame,
            values=["shopee","lazada","tiktok"], width=120, font=("Segoe UI",11))
        self.combo_san_new.set("shopee")
        self.entry_ten_new = ctk.CTkEntry(form_frame, width=160,
            placeholder_text="Tên shop", font=("Segoe UI",11))
        self.entry_tk_new  = ctk.CTkEntry(form_frame, width=180,
            placeholder_text="Email / SĐT", font=("Segoe UI",11))
        self.entry_mk_new  = ctk.CTkEntry(form_frame, width=150,
            placeholder_text="Mật khẩu", show="*", font=("Segoe UI",11))
        self.entry_dir_new = ctk.CTkEntry(form_frame, width=200,
            placeholder_text=r"E:\Doanh Thu\...", font=("Segoe UI",10))
        self.entry_prof_new= ctk.CTkEntry(form_frame, width=200,
            placeholder_text=r"C:\Users\...\Bot_Data", font=("Segoe UI",10))

        for i, (label, widget) in enumerate([
            ("Sàn:", self.combo_san_new),
            ("Tên Shop:", self.entry_ten_new),
            ("Tài khoản:", self.entry_tk_new),
            ("Mật khẩu:", self.entry_mk_new),
        ]):
            ctk.CTkLabel(form_frame, text=label, font=("Segoe UI",11),
                         text_color="#aaa").grid(row=0, column=i*2, padx=(12 if i==0 else 5, 3), pady=12, sticky="e")
            widget.grid(row=0, column=i*2+1, padx=3, pady=12)

        ctk.CTkLabel(form_frame, text="Thư mục lưu:", font=("Segoe UI",11),
                     text_color="#aaa").grid(row=1, column=0, padx=(12,3), pady=(0,12), sticky="e")
        self.entry_dir_new.grid(row=1, column=1, columnspan=3, padx=3, pady=(0,12), sticky="w")
        ctk.CTkLabel(form_frame, text="Profile dir:", font=("Segoe UI",11),
                     text_color="#aaa").grid(row=1, column=4, padx=(5,3), pady=(0,12), sticky="e")
        self.entry_prof_new.grid(row=1, column=5, columnspan=2, padx=3, pady=(0,12), sticky="w")

        # Nút thêm / xóa
        btn_frame = ctk.CTkFrame(top_frame, fg_color="transparent")
        btn_frame.pack(fill="x", pady=(6,0))
        ctk.CTkButton(btn_frame, text="✚ Thêm Shop",
            command=self._add_shop_to_list,
            font=("Segoe UI",12,"bold"),
            fg_color="#28A745", hover_color="#218838",
            height=32, corner_radius=8).pack(side="left", padx=(0,8))
        ctk.CTkButton(btn_frame, text="🗑️ Xóa Shop Đã Chọn",
            command=self._del_shop_from_list,
            font=("Segoe UI",12,"bold"),
            fg_color="#444", hover_color="#DC3545",
            height=32, corner_radius=8).pack(side="left")

        # Bảng danh sách
        list_frame = ctk.CTkFrame(tab_quanly, fg_color="transparent")
        list_frame.pack(fill="both", expand=True, padx=15, pady=(8,15))
        ctk.CTkLabel(list_frame, text="Danh Sách Cửa Hàng (Click [X] để bật/tắt):",
                     font=("Segoe UI",13,"bold"),
                     text_color="#FFD700").pack(anchor="w", pady=(0,6))
        top_frame = list_frame  # reuse top_frame for treeview parent

        style = ttk.Style()
        style.theme_use("default")
        style.configure("Treeview", background="#222222", foreground="white",
                        fieldbackground="#222222", rowheight=32, font=("Segoe UI",10))
        style.map("Treeview", background=[("selected","#333333")], foreground=[("selected","#00CED1")])
        style.configure("Treeview.Heading", background="#333333", foreground="#00CED1",
                        relief="flat", font=("Segoe UI",11,"bold"))

        cols = ("Chon","STT","NenTang","TenShop","Platform")
        self.tree = ttk.Treeview(top_frame, columns=cols, show="headings", height=6)
        for col, w, anchor, head in [
            ("Chon",50,"center","[X]"), ("STT",40,"center","STT"),
            ("NenTang",100,"center","Sàn"), ("TenShop",280,"w","Tên Shop"),
            ("Platform",100,"center","Platform")
        ]:
            self.tree.heading(col, text=head)
            self.tree.column(col, width=w, anchor=anchor)

        # Load shop từ DANH_SACH_SHOP
        for i, shop in enumerate(self.DANH_SACH_SHOP, 1):
            self.tree.insert("", "end",
                values=("☑", i, shop["platform"].upper(), shop["ten_shop"], shop["platform"]),
                tags=(i-1,))
        self.tree.bind("<ButtonRelease-1>", self._toggle_shop_check)
        self.tree.pack(fill="x", pady=(0,8))

        # ── TAB CHẠY ─────────────────────────────────────────────────
        main_frame = ctk.CTkFrame(tab_chay, fg_color="transparent")
        main_frame.pack(fill="both", expand=True, padx=20, pady=15)

        left = ctk.CTkFrame(main_frame, fg_color="#222222", corner_radius=12,
                            border_width=1, border_color="#333333", width=240)
        left.pack(side="left", fill="y", padx=(0,15))
        left.pack_propagate(False)

        ctk.CTkLabel(left, text="🗓️ THỜI GIAN",
                     font=("Segoe UI",14,"bold"),
                     text_color="#FFD700").pack(pady=12)
        tf = ctk.CTkFrame(left, fg_color="transparent")
        tf.pack(fill="x", padx=12)
        ctk.CTkLabel(tf, text="Năm:", font=("Segoe UI",11)).pack(side="left")
        self.entry_nam = ctk.CTkEntry(tf, width=90, font=("Segoe UI",12,"bold"),
                                      text_color="#00CED1", justify="center")
        self.entry_nam.insert(0, "2026")
        self.entry_nam.pack(side="left", padx=5)

        # ── Chế độ chọn thời gian ──
        self.mode_var = ctk.StringVar(value="month")
        mode_frame = ctk.CTkFrame(left, fg_color="transparent")
        mode_frame.pack(fill="x", padx=12, pady=(12,4))
        ctk.CTkRadioButton(mode_frame, text="Theo tháng", variable=self.mode_var,
            value="month", command=self._toggle_date_mode,
            font=("Segoe UI",11), fg_color="#00CED1").pack(side="left", padx=(0,10))
        ctk.CTkRadioButton(mode_frame, text="Theo ngày", variable=self.mode_var,
            value="day", command=self._toggle_date_mode,
            font=("Segoe UI",11), fg_color="#00CED1").pack(side="left")

        # Frame chọn tháng
        self.frame_month = ctk.CTkFrame(left, fg_color="transparent")
        self.frame_month.pack(padx=8)
        self.month_vars = []
        for m in range(1, 13):
            var = ctk.BooleanVar(value=False)
            cb = ctk.CTkCheckBox(self.frame_month, text=f"T{m}", variable=var, width=60,
                                  font=("Segoe UI",11), checkbox_width=18, checkbox_height=18,
                                  fg_color="#00CED1", hover_color="#00FFFF")
            cb.grid(row=(m-1)//3, column=(m-1)%3, padx=8, pady=6)
            self.month_vars.append(var)

        # Frame chọn ngày cụ thể
        self.frame_day = ctk.CTkFrame(left, fg_color="transparent")
        df1 = ctk.CTkFrame(self.frame_day, fg_color="transparent")
        df1.pack(fill="x", padx=4, pady=4)
        ctk.CTkLabel(df1, text="Từ ngày:", font=("Segoe UI",11), width=60).pack(side="left")
        self.entry_from_date = ctk.CTkEntry(df1, width=110, placeholder_text="2026-01-01",
            font=("Segoe UI",11), justify="center")
        self.entry_from_date.pack(side="left", padx=4)
        df2 = ctk.CTkFrame(self.frame_day, fg_color="transparent")
        df2.pack(fill="x", padx=4, pady=4)
        ctk.CTkLabel(df2, text="Đến ngày:", font=("Segoe UI",11), width=60).pack(side="left")
        self.entry_to_date = ctk.CTkEntry(df2, width=110, placeholder_text="2026-01-31",
            font=("Segoe UI",11), justify="center")
        self.entry_to_date.pack(side="left", padx=4)
        # Mặc định ẩn frame ngày
        self.frame_day.pack_forget()

        ctk.CTkLabel(left, text="Loại báo cáo:",
                     font=("Segoe UI",11), text_color="white").pack(anchor="w", padx=12, pady=(12,4))
        self.var_doanh_thu = ctk.BooleanVar(value=True)
        self.var_hoa_don   = ctk.BooleanVar(value=True)
        self.var_don_hang  = ctk.BooleanVar(value=True)
        for var, label in [
            (self.var_doanh_thu,"📊 Doanh Thu"),
            (self.var_hoa_don,  "🧾 Hóa Đơn & Phí"),
            (self.var_don_hang, "📦 Đơn Hàng"),
        ]:
            ctk.CTkCheckBox(left, text=label, variable=var,
                            font=("Segoe UI",11), fg_color="#00CED1").pack(anchor="w", padx=20, pady=3)

        right = ctk.CTkFrame(main_frame, fg_color="transparent")
        right.pack(side="right", fill="both", expand=True)
        self.var_autostart = ctk.BooleanVar(value=self._check_autostart())
        ctk.CTkSwitch(right,
            text="🚀 Tự khởi động cùng Windows",
            variable=self.var_autostart,
            command=self._toggle_autostart,
            font=("Segoe UI",11), text_color="white",
            progress_color="#28A745").pack(anchor="w", pady=(0,4))

        self.var_headless = ctk.BooleanVar(value=False)
        ctk.CTkSwitch(right,
            text="🙈 Chạy ẩn trình duyệt (Headless)",
            variable=self.var_headless,
            font=("Segoe UI",11), text_color="white",
            progress_color="#00CED1").pack(anchor="w", pady=(0,8))

        self.auto_running = False
        self.btn_start = ctk.CTkButton(right,
            text="▶ BẬT CHẾ ĐỘ TỰ ĐỘNG (30s/lần)",
            command=self.toggle_auto,
            font=("Segoe UI",15,"bold"),
            fg_color="#28A745", hover_color="#218838", height=50, corner_radius=10)
        self.btn_start.pack(fill="x", pady=(0,10))

        self.btn_confirm = ctk.CTkButton(right,
            text="⚠️ XÁC NHẬN CỨU HỘ (KHI LỖI)",
            command=self.confirm_step,
            font=("Segoe UI",12,"bold"),
            fg_color="#FF8C00", hover_color="#FFA500", height=36,
            state="disabled")
        self.btn_confirm.pack(fill="x", pady=(0,10))

        ctk.CTkLabel(right, text="📋 NHẬT KÝ HOẠT ĐỘNG",
                     font=("Segoe UI",12,"bold"),
                     text_color="#00CED1").pack(anchor="w")
        self.log_text = ctk.CTkTextbox(right, fg_color="#1A1A1A",
                                        text_color="#DDDDDD",
                                        font=("Consolas",10),
                                        border_width=1, border_color="#333333")
        self.log_text.pack(fill="both", expand=True, pady=(4,0))
    def _toggle_date_mode(self):
        if self.mode_var.get() == "month":
            self.frame_day.pack_forget()
            self.frame_month.pack(padx=8)
        else:
            self.frame_month.pack_forget()
            self.frame_day.pack(padx=8, pady=4)    
    def _check_autostart(self):
        import winreg
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_READ)
            winreg.QueryValueEx(key, "HuyVanBot")
            winreg.CloseKey(key)
            return True
        except:
            return False

    def _toggle_autostart(self):
        import winreg, sys
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE)
        if self.var_autostart.get():
            exe_path = sys.executable
            script   = os.path.abspath(__file__)
            winreg.SetValueEx(key, "HuyVanBot", 0, winreg.REG_SZ,
                f'"{exe_path}" "{script}"')
            self.log("✅ Đã bật tự khởi động cùng Windows!")
        else:
            try:
                winreg.DeleteValue(key, "HuyVanBot")
                self.log("⏹ Đã tắt tự khởi động cùng Windows!")
            except:
                pass
        winreg.CloseKey(key)

    def _add_shop_to_list(self):
        platform = self.combo_san_new.get().strip().lower()
        ten_shop = self.entry_ten_new.get().strip()
        email    = self.entry_tk_new.get().strip()
        matkhau  = self.entry_mk_new.get().strip()
        thu_muc  = self.entry_dir_new.get().strip()
        prof_dir = self.entry_prof_new.get().strip()
        if not ten_shop or not matkhau:
            return
        new_shop = {
            "ten_shop":    ten_shop,
            "email_login": email,
            "mat_khau":    matkhau,
            "thu_muc_luu": thu_muc,
            "profile_dir": prof_dir,
            "platform":    platform,
        }
        self.DANH_SACH_SHOP.append(new_shop)
        idx = len(self.DANH_SACH_SHOP) - 1
        self.tree.insert("", "end",
            values=("☑", idx+1, platform.upper(), ten_shop, platform),
            tags=(idx,))
        # Clear form
        self.entry_ten_new.delete(0, "end")
        self.entry_tk_new.delete(0, "end")
        self.entry_mk_new.delete(0, "end")
        self.entry_dir_new.delete(0, "end")
        self.entry_prof_new.delete(0, "end")

    def _del_shop_from_list(self):
        selected = self.tree.selection()
        if not selected:
            return
        for item in selected:
            idx = int(self.tree.item(item, "tags")[0])
            self.DANH_SACH_SHOP[idx] = None  # đánh dấu xóa
            self.tree.delete(item)
        self.DANH_SACH_SHOP = [s for s in self.DANH_SACH_SHOP if s is not None]
        # Cập nhật lại index trong treeview
        for i, item in enumerate(self.tree.get_children()):
            vals = list(self.tree.item(item, "values"))
            vals[1] = i + 1
            self.tree.item(item, values=vals, tags=(i,))

    def _toggle_shop_check(self, event):
        region = self.tree.identify("region", event.x, event.y)
        if region == "cell" and self.tree.identify_column(event.x) == "#1":
            item = self.tree.focus()
            vals = list(self.tree.item(item, "values"))
            vals[0] = "☐" if vals[0] == "☑" else "☑"
            self.tree.item(item, values=vals)

    def log(self, message):
        self.log_text.insert("end", f"[*] {message}\n")
        self.log_text.see("end")

    def confirm_step(self):
        self.confirm_event.set()
        self.btn_confirm.configure(state="disabled")

    def rescue_wait(self, msg):
        self.log(f"⚠️ DỪNG KHẨN CẤP: {msg}")
        self.btn_confirm.configure(state="normal")
        self.confirm_event.clear()
        self.confirm_event.wait()

    def toggle_auto(self):
        if not self.auto_running:
            self.auto_running = True
            self.btn_start.configure(text="⏹ TẮT CHẾ ĐỘ TỰ ĐỘNG", fg_color="red")
            self.log("🤖 Chế độ tự động BẬT — kiểm tra lệnh mỗi 30s...")
            threading.Thread(target=self.auto_loop, daemon=True).start()
        else:
            self.auto_running = False
            self.btn_start.configure(text="▶ BẬT CHẾ ĐỘ TỰ ĐỘNG (30s/lần)", fg_color="green")
            self.log("⏹ Chế độ tự động ĐÃ TẮT.")

    def auto_loop(self):
        import time
        while self.auto_running:
            self.log("🔍 Đang kiểm tra lệnh mới từ Server...")
            asyncio.run(self.main_logic())

            # ── Scrape đơn hàng mới sau mỗi vòng ──
            self.log("📦 Đang quét đơn hàng mới từ các sàn...")
            asyncio.run(self.scrape_all_new_orders())

            # Chờ 5 phút rồi kiểm tra lại (chia nhỏ để có thể tắt nhanh)
            for _ in range(300):
                if not self.auto_running:
                    break
                time.sleep(1)
        self.log("✅ Vòng lặp tự động đã dừng.")

    def start_bot_thread(self):
        self.btn_start.configure(state="disabled")
        threading.Thread(target=lambda: asyncio.run(self.main_logic()), daemon=True).start()

    def extract_pdf_text(self, local_path):
        """Extract text từ PDF trên máy local dùng pdfplumber"""
        if not HAS_PDFPLUMBER:
            return ""
        try:
            import pdfplumber
            text_parts = []
            with pdfplumber.open(local_path) as pdf:
                for page in pdf.pages:
                    t = page.extract_text()
                    if t:
                        text_parts.append(t)
            return "\n".join(text_parts)
        except Exception as e:
            self.log(f"⚠️ Không extract được PDF text: {str(e)}")
            return ""

    async def lazada_ensure_login(self, page, shop):
        """Đảm bảo đã đăng nhập Lazada — tự động login nếu bị văng ra"""
        await page.goto("https://sellercenter.lazada.vn/portal/apps/finance/myIncome/index", wait_until="commit")
        await asyncio.sleep(6)

        # Kiểm tra có bị redirect về trang login không
        if "login" not in page.url and not await page.locator('input[placeholder*="Số điện thoại"]').is_visible():
            self.log("✅ Lazada: đã đăng nhập sẵn")
            return True

        self.log("🔐 Lazada: chưa đăng nhập, đang tự login...")
        try:
            tk_loc = page.locator('input[placeholder*="Số điện thoại"], input[placeholder*="Email"]').first
            await tk_loc.wait_for(state="visible", timeout=15000)
            await tk_loc.fill(shop.get("email_login", ""))
            await asyncio.sleep(1)
            mk_loc = page.locator('input[placeholder*="Mật khẩu"], input[type="password"]').first
            await mk_loc.fill(shop["mat_khau"])
            await asyncio.sleep(1)
            await page.locator('button:has-text("Đăng nhập")').first.click(force=True)
            await asyncio.sleep(8)

            # Kiểm tra còn trên trang login không
            if "login" in page.url:
                self.log("⚠️ Lazada: login xong nhưng vẫn ở trang login — có thể cần OTP")
                self.rescue_wait("Vui lòng đăng nhập thủ công rồi bấm XÁC NHẬN")
            else:
                self.log("✅ Lazada: đăng nhập thành công")
            return True
        except Exception as e:
            self.log(f"❌ Lỗi tự đăng nhập Lazada: {e}")
            self.rescue_wait("Đăng nhập Lazada thủ công rồi bấm XÁC NHẬN")
            return False

    def parse_tiktok_excel(self, local_path):
        """Parse file Excel doanh thu TikTok → parsed_json để gửi lên server"""
        if not HAS_OPENPYXL:
            self.log("⚠️ Không có openpyxl, bỏ qua parse TikTok Excel")
            return None
        try:
            wb = openpyxl.load_workbook(local_path, data_only=True)

            # ── Sheet Reports: tổng hợp tháng ────────────────────────
            ws_reports = wb["Reports"] if "Reports" in wb.sheetnames else wb.active
            rows = list(ws_reports.iter_rows(values_only=True))

            def find_exact(keyword):
                for r in rows:
                    for c in range(1, 5):  # cột index 1-4
                        if r[c] and str(r[c]).strip() == keyword:
                            return float(r[5] or 0)
                return 0.0

            def ab(v): return abs(float(v or 0))

            total_settlement   = find_exact("Total settlement amount")
            total_revenue      = find_exact("Total Revenue")
            subtotal_after     = find_exact("Subtotal after seller discounts")
            refund_subtotal    = ab(find_exact("Refund subtotal after seller discounts"))
            actual_shipping    = find_exact("Actual shipping fee")
            platform_ship_disc = find_exact("Platform shipping fee discount")
            customer_ship_fee  = find_exact("Customer shipping fee")
            actual_return_ship = find_exact("Actual return shipping fee")
            net_shipping_cost  = abs(actual_shipping + platform_ship_disc + customer_ship_fee + actual_return_ship)
            transaction_fee    = ab(find_exact("Transaction fee"))
            commission_fee     = ab(find_exact("TikTok Shop commission fee"))
            order_handling_fee = ab(find_exact("Order processing fee"))
            sfr_service_fee    = ab(find_exact("SFR service fee"))
            flash_sale_fee     = ab(find_exact("Flash Sale service fee"))
            affiliate_fee      = ab(find_exact("Affiliate Commission"))
            affiliate_ads_fee  = ab(find_exact("Affiliate Shop Ads commission"))
            total_affiliate    = affiliate_fee + affiliate_ads_fee
            tax_vat            = ab(find_exact("VAT withheld by TikTok Shop"))
            tax_pit            = ab(find_exact("PIT withheld by TikTok Shop"))
            gmv_tiktok_ads     = ab(find_exact("GMV Payment for TikTok Ads"))
            total_adjustments  = find_exact("Total adjustments")
            fee_total = transaction_fee + commission_fee + order_handling_fee + sfr_service_fee + flash_sale_fee + total_affiliate
            tax_total = tax_vat + tax_pit

            _month = ""
            for r in rows:
                if r[1] and str(r[1]).strip() == "Time period:":
                    import re
                    mp = re.search(r'(\d{4})/(\d{2})', str(r[5] or ""))
                    if mp:
                        _month = f"{mp.group(1)}-{mp.group(2)}"
                    break

            # ── Sheet Order details: phí từng đơn ────────────────────
            order_details = []
            if "Order details" in wb.sheetnames:
                ws_detail = wb["Order details"]
                detail_headers = []
                for i, row in enumerate(ws_detail.iter_rows(values_only=True)):
                    if i == 0:
                        detail_headers = [str(c).strip() if c else "" for c in row]
                        continue
                    if not any(row):
                        continue
                    r = dict(zip(detail_headers, row))
                    order_id = str(r.get("Order/adjustment ID  ", r.get("Order/adjustment ID", "")) or "").strip()
                    row_type = str(r.get("Type ", r.get("Type", "")) or "").strip()
                    if row_type != "Order" or len(order_id) < 5:
                        continue

                    def g(key): return abs(float(r.get(key, 0) or 0))

                    order_details.append({
                        "order_id":       order_id,
                        "fee_commission": g("TikTok Shop commission fee"),
                        "fee_payment":    g("Transaction fee"),
                        "fee_service":    g("Order processing fee") + g("SFR service fee"),
                        "fee_affiliate":  g("Affiliate Commission"),
                        "fee_piship":     g("Actual shipping fee"),
                        "fee_handling":   0,
                        "fee_ads":        g("GMV Payment for TikTok Ads"),
                        "tax_vat":        g("VAT withheld by TikTok Shop"),
                        "tax_pit":        g("PIT withheld by TikTok Shop"),
                        "total_fees":     g("Total Fees"),
                        "settlement":     float(r.get("Total settlement amount", 0) or 0),
                    })

            wb.close()
            self.log(f"📊 Parse TikTok Excel xong: {len(order_details)} đơn có phí thực")

            return {
                "_month": _month,
                "order_details": order_details,
                "gross_revenue":       total_revenue,
                "refund_amount":       refund_subtotal,
                "net_product_revenue": subtotal_after - refund_subtotal,
                "platform_subsidy":    0,
                "seller_voucher":      0,
                "co_funded_voucher":   0,
                "shipping_net":        -net_shipping_cost,
                "fee_commission":      commission_fee,
                "fee_payment":         transaction_fee,
                "fee_service":         sfr_service_fee + flash_sale_fee,
                "fee_affiliate":       total_affiliate,
                "fee_piship_sfr":      sfr_service_fee,
                "fee_handling":        order_handling_fee,
                "fee_ads":             gmv_tiktok_ads,
                "fee_total":           fee_total,
                "compensation":        max(0, total_adjustments),
                "tax_vat":             tax_vat,
                "tax_pit":             tax_pit,
                "tax_total":           tax_total,
                "total_payout":        total_settlement,
            }
        except Exception as e:
            self.log(f"⚠️ Lỗi parse TikTok Excel: {str(e)}")
            return None
    def parse_tiktok_order_excel_local(self, local_path, shop_name):
        """Parse file Excel đơn hàng TikTok (sheet OrderSKUList) → JSON {orders, items}"""
        if not HAS_OPENPYXL:
            self.log("⚠️ Không có openpyxl, bỏ qua parse TikTok Order Excel")
            return None
        try:
            wb = openpyxl.load_workbook(local_path, data_only=True)
            ws = wb["OrderSKUList"] if "OrderSKUList" in wb.sheetnames else wb.active
            headers = []
            orders_map = {}
            items = []
            import datetime

            for i, row in enumerate(ws.iter_rows(values_only=True)):
                if i == 0:
                    headers = [str(c).strip() if c else "" for c in row]
                    continue
                if not any(row):
                    continue
                r = dict(zip(headers, row))
                order_id = str(r.get("Order ID", "") or "").strip()
                if not order_id or order_id == "Platform unique order ID.":
                    continue

                status      = str(r.get("Order Status", "") or "").strip().lower()
                cancel_type = str(r.get("Cancelation/Return Type", "") or "").strip().lower()
                cancel_reason = str(r.get("Cancel Reason", "") or "").strip()
                sku          = str(r.get("Seller SKU", "") or "").strip()
                product_name = str(r.get("Product Name", "") or "").strip()

                try: qty = int(r.get("Quantity") or 1)
                except: qty = 1

                try: revenue_line = float(r.get("SKU Subtotal After Discount") or 0)
                except: revenue_line = 0.0

                try: order_amount = float(r.get("Order Amount") or 0)
                except: order_amount = 0.0

                # Phân loại đơn
                order_type = "normal"
                if "return" in cancel_type or "hoàn" in status:
                    order_type = "return"
                elif "hủy" in status or "cancel" in status:
                    order_type = "cancel"

                # Chuẩn hóa shipping_status TikTok
                if "awaiting collection" in status or "chờ lấy" in status:
                    shipping_status = "Chờ lấy hàng"
                elif "in transit" in status or "đang giao" in status:
                    shipping_status = "Đang giao"
                elif "delivered" in status or "đã giao" in status or "completed" in status:
                    shipping_status = "Đã giao"
                elif order_type == "cancel":
                    shipping_status = "Đã hủy"
                elif order_type == "return":
                    shipping_status = "Hoàn hàng"
                else:
                    shipping_status = status or ""

                # Ngày: ưu tiên Paid Time, fallback Created Time
                raw_date = str(r.get("Paid Time") or r.get("Created Time") or "").strip()
                order_date = ""
                try:
                    d = datetime.datetime.strptime(raw_date.split(" ")[0] + " " +
                        raw_date.split(" ")[1] + " " + raw_date.split(" ")[2], "%d/%m/%Y %H:%M:%S")
                    order_date = d.strftime("%Y-%m-%d")
                except:
                    try:
                        dm = raw_date[:10]
                        parts = dm.split("/")
                        if len(parts) == 3:
                            order_date = f"{parts[2]}-{parts[1]}-{parts[0]}"
                    except:
                        pass

                revenue = order_amount if order_type == "normal" else 0

                if sku:
                    items.append({
                        "order_id": order_id, "sku": sku,
                        "product_name": product_name, "qty": qty,
                        "revenue_line": revenue_line, "cost_real": 0, "cost_invoice": 0,
                    })

                if order_id not in orders_map:
                    orders_map[order_id] = {
                        "order_id": order_id, "platform": "tiktok", "shop": shop_name,
                        "order_date": order_date, "order_type": order_type,
                        "revenue": revenue, "raw_revenue": order_amount,
                        "cancel_reason": cancel_reason, "return_fee": 0,
                        "shipped": 0, "cost_invoice": 0, "cost_real": 0,
                        "fee": 0, "profit_invoice": 0, "profit_real": 0,
                        "tax_flat": 0, "tax_income": 0,
                        "fee_platform": 0, "fee_payment": 0, "fee_affiliate": 0,
                        "fee_ads": 0, "fee_piship": 0, "fee_service": 0,
                        "fee_packaging": 0, "fee_operation": 0, "fee_labor": 0,
                        "discount_shop": 0, "discount_shopee": 0,
                        "discount_combo": 0, "shipping_return_fee": 0,
                        "shipping_status": shipping_status,
                    }

            wb.close()
            self.log(f"📊 Parse TikTok Order Excel xong: {len(orders_map)} đơn, {len(items)} items")
            return {"orders": list(orders_map.values()), "items": items}
        except Exception as e:
            self.log(f"⚠️ Lỗi parse TikTok Order Excel: {str(e)}")
            return None

    def parse_lazada_excel(self, local_path, shop_name):
        """Parse file Excel đơn hàng Lazada → JSON {orders, items}"""
        if not HAS_OPENPYXL:
            self.log("⚠️ Không có openpyxl, bỏ qua parse Lazada Excel")
            return None
        try:
            wb = openpyxl.load_workbook(local_path, data_only=True)
            ws = wb.active
            headers = []
            orders_map = {}
            items = []

            for i, row in enumerate(ws.iter_rows(values_only=True)):
                if i == 0:
                    headers = [str(c).strip() if c else "" for c in row]
                    continue
                if not any(row):
                    continue

                r = dict(zip(headers, row))
                order_id = str(r.get("orderNumber", "") or "").strip()
                if not order_id:
                    continue

                # Phân loại đơn
                status = str(r.get("status", "") or "").strip().lower()
                failed_reason = str(r.get("buyerFailedDeliveryReason", "") or "").strip()
                refund = float(r.get("refundAmount") or 0)

                order_type = "normal"
                if status in ["canceled", "cancelled"]:
                    order_type = "cancel"
                elif status in ["returned", "return"]:
                    order_type = "return"
                elif refund > 0:
                    order_type = "return"

                # Chuẩn hóa shipping_status Lazada
                if status in ["pending", "unpaid"]:
                    shipping_status = "Chờ xác nhận"
                elif status in ["ready_to_ship", "processing"]:
                    shipping_status = "Chờ lấy hàng"
                elif status in ["shipped"]:
                    shipping_status = "Đang giao"
                elif status in ["delivered"]:
                    shipping_status = "Đã giao"
                elif order_type == "cancel":
                    shipping_status = "Đã hủy"
                elif order_type == "return":
                    shipping_status = "Hoàn hàng"
                else:
                    shipping_status = status or ""

                # Ngày đặt — format "21 Mar 2026 19:45"
                raw_date = str(r.get("createTime", "") or "").strip()
                order_date = ""
                try:
                    import datetime
                    d = datetime.datetime.strptime(raw_date, "%d %b %Y %H:%M")
                    order_date = d.strftime("%Y-%m-%d")
                except:
                    pass

                # Doanh thu
                def to_num(val):
                    try: return round(float(str(val or "0").replace(",", "")))
                    except: return 0

                paid_price  = to_num(r.get("paidPrice"))
                revenue     = paid_price if order_type == "normal" else 0
                raw_revenue = paid_price

                sku          = str(r.get("sellerSku", "") or "").strip()
                product_name = str(r.get("itemName", "") or "").strip()
                cancel_reason = failed_reason or (status if order_type in ["cancel", "return"] else "")

                return_fee = 0
                if order_type == "return":
                    return_fee = 1620
                elif order_type == "cancel" and failed_reason:
                    return_fee = 1620

                # Items
                if sku:
                    items.append({
                        "order_id":     order_id,
                        "sku":          sku,
                        "product_name": product_name,
                        "qty":          1,
                        "revenue_line": revenue,
                        "cost_real":    0,
                        "cost_invoice": 0,
                    })

                # Orders (gộp theo orderNumber)
                if order_id not in orders_map:
                    orders_map[order_id] = {
                        "order_id":      order_id,
                        "platform":      "lazada",
                        "shop":          shop_name,
                        "order_date":    order_date,
                        "order_type":    order_type,
                        "revenue":       revenue,
                        "raw_revenue":   raw_revenue,
                        "cancel_reason": cancel_reason,
                        "return_fee":    return_fee,
                        "shipped":       1 if status == "shipped" else 0,
                        "cost_invoice":  0, "cost_real": 0,
                        "fee": 0, "profit_invoice": 0, "profit_real": 0,
                        "tax_flat": 0, "tax_income": 0,
                        "fee_platform": 0, "fee_payment": 0,
                        "fee_affiliate": 0, "fee_ads": 0,
                        "fee_piship": 0, "fee_service": 0,
                        "fee_packaging": 0, "fee_operation": 0, "fee_labor": 0,
                        "discount_shop": to_num(r.get("sellerDiscountTotal")),
                        "discount_shopee": 0, "discount_combo": 0,
                        "shipping_return_fee": 0,
                        "shipping_status": shipping_status,
                    }
                else:
                    orders_map[order_id]["revenue"]       += revenue
                    orders_map[order_id]["raw_revenue"]   += raw_revenue
                    orders_map[order_id]["discount_shop"] += to_num(r.get("sellerDiscountTotal"))

            wb.close()
            self.log(f"📊 Parse Lazada Excel xong: {len(orders_map)} đơn, {len(items)} items")
            return {"orders": list(orders_map.values()), "items": items}
        except Exception as e:
            self.log(f"⚠️ Lỗi parse Lazada Excel: {str(e)}")
            return None
    def parse_shopee_excel(self, local_path, shop_name):
        """Parse file Excel đơn hàng Shopee → JSON {orders, items}"""
        if not HAS_OPENPYXL:
            self.log("⚠️ Không có openpyxl, bỏ qua parse Excel")
            return None
        try:
            # KHÔNG dùng read_only=True vì bị lỗi chỉ đọc 1 cột
            wb = openpyxl.load_workbook(local_path, data_only=True)
            ws = wb.active
            headers = []
            orders_map = {}
            items = []

            import unicodedata
            for i, row in enumerate(ws.iter_rows(values_only=True)):
                if i == 0:
                    # Normalize NFC toàn bộ headers để tránh lỗi encoding NFD
                    headers = [unicodedata.normalize("NFC", str(c).strip()) if c else "" for c in row]
                    continue
                if not any(row):
                    continue

                r = dict(zip(headers, row))
                order_id = str(r.get("Mã đơn hàng", "") or "").strip()
                if not order_id:
                    continue

                # Phân loại đơn — dùng normalize NFC để tránh lỗi encoding
                def get_col(row, key):
                    # Thử exact match trước
                    val = row.get(key)
                    if val is not None:
                        return str(val or "").strip()
                    # Fallback: normalize NFC rồi so sánh
                    import unicodedata
                    key_nfc = unicodedata.normalize("NFC", key)
                    for k, v in row.items():
                        if unicodedata.normalize("NFC", str(k)) == key_nfc:
                            return str(v or "").strip()
                    return ""

                trang_thai = get_col(r, "Trạng Thái Đơn Hàng")
                ly_do_huy  = get_col(r, "Lý do hủy")
                tra_hang   = get_col(r, "Trạng thái Trả hàng/Hoàn tiền")

                order_type = "normal"
                if trang_thai == "Đã hủy" or ly_do_huy:
                    order_type = "cancel"
                if any(k in tra_hang.lower() for k in ["hoàn tiền", "trả hàng", "chấp thuận"]):
                    order_type = "return"

                # Chuẩn hóa shipping_status từ trạng thái Shopee
                tt_lower = trang_thai.lower()
                if "chờ lấy hàng" in tt_lower or "chờ xác nhận" in tt_lower:
                    shipping_status = "Chờ lấy hàng"
                elif "đang giao" in tt_lower or "đang vận chuyển" in tt_lower:
                    shipping_status = "Đang giao"
                elif "đã giao" in tt_lower or "hoàn thành" in tt_lower:
                    shipping_status = "Đã giao"
                elif "đã hủy" in tt_lower or order_type == "cancel":
                    shipping_status = "Đã hủy"
                elif order_type == "return":
                    shipping_status = "Hoàn hàng"
                else:
                    shipping_status = trang_thai or ""

                # Ngày đặt hàng — hỗ trợ cả 2 format
                ngay = get_col(r, "Ngày đặt hàng")
                order_date = ""
                if "-" in ngay:
                    order_date = ngay[:10]  # Format mới: "2026-01-01 06:10" → lấy "2026-01-01"
                elif "/" in ngay:
                    parts = ngay.split("/")
                    if len(parts) >= 3:
                        order_date = f"{parts[2][:4]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"

                # Doanh thu
                def to_num(val):
                    try: return round(float(str(val).replace(",", "").strip()))
                    except: return 0

                qty = max(1, int(to_num(r.get("Số lượng", 1)) or 1))

                # Doanh thu — ưu tiên file cũ, fallback file mới
                tong_gia_ban   = to_num(r.get("Tổng giá bán (sản phẩm)", 0))
                tong_nguoi_mua = to_num(r.get("Tổng số tiền Người mua thanh toán", 0))
                raw_revenue    = tong_gia_ban if tong_gia_ban > 0 else tong_nguoi_mua
                revenue        = raw_revenue if order_type == "normal" else 0
                return_amount  = raw_revenue if order_type == "return" else 0
                sku = str(r.get("SKU phân loại hàng", "") or "").strip()
                product_name = str(r.get("Tên sản phẩm", "") or "").strip()
                shipped = bool(r.get("Ngày gửi hàng"))

                cancel_reason = ly_do_huy or (trang_thai if order_type == "cancel" else None)
                return_fee = 0
                if order_type == "return":
                    return_fee = 1620
                elif order_type == "cancel" and any(k in (ly_do_huy or "").lower() for k in ["thất bại", "không giao"]):
                    return_fee = 1620

                # Items
                if sku:
                    items.append({
                        "order_id": order_id,
                        "sku": sku,
                        "product_name": product_name,
                        "qty": qty,
                        "revenue_line": revenue,
                        "cost_real": 0,
                        "cost_invoice": 0,
                    })

                # Orders (gộp)
                if order_id not in orders_map:
                    orders_map[order_id] = {
                    "order_id":      order_id,
                    "platform":      "shopee",
                    "shop":          shop_name,
                    "order_date":    order_date,
                    "order_type":    order_type,
                    "revenue":       revenue,
                    "raw_revenue":   raw_revenue,
                    "cancel_reason": cancel_reason,
                    "return_fee":    return_fee,
                    "shipped":       1 if shipped else 0,
                    "cost_invoice":  0, "cost_real": 0,
                    "fee":           0, "profit_invoice": 0, "profit_real": 0,
                    "tax_flat":      0, "tax_income": 0,
                    "fee_platform":  to_num(r.get("Phí cố định", 0)),
                    "fee_payment":   to_num(r.get("Phí thanh toán", 0)),
                    "fee_service":   to_num(r.get("Phí Dịch Vụ", 0)),
                    "fee_affiliate": 0, "fee_ads": 0,
                    "fee_piship":    0,
                    "fee_packaging": 0, "fee_operation": 0, "fee_labor": 0,
                    "discount_shop":         to_num(r.get("Mã giảm giá của Shop", 0)),
                    "discount_shopee":       to_num(r.get("Mã giảm giá của Shopee", 0)),
                    "discount_combo":        to_num(r.get("Giảm giá từ Combo của Shop", 0)),
                    "shipping_return_fee":   to_num(r.get("Phí vận chuyển trả hàng (đơn Trả hàng/hoàn tiền)", 0)),
                    "shipping_status":       shipping_status,
                }
                else:
                    orders_map[order_id]["revenue"]              += revenue
                    orders_map[order_id]["raw_revenue"]          += raw_revenue
                    orders_map[order_id]["discount_shop"]        += to_num(r.get("Mã giảm giá của Shop", 0))
                    orders_map[order_id]["discount_shopee"]      += to_num(r.get("Mã giảm giá của Shopee", 0))
                    orders_map[order_id]["discount_combo"]       += to_num(r.get("Giảm giá từ Combo của Shop", 0))
                    orders_map[order_id]["shipping_return_fee"]  += to_num(r.get("Phí vận chuyển trả hàng (đơn Trả hàng/hoàn tiền)", 0))

            wb.close()
            self.log(f"📊 Parse Excel xong: {len(orders_map)} đơn, {len(items)} items")
            return {"orders": list(orders_map.values()), "items": items}
        except Exception as e:
            self.log(f"⚠️ Lỗi parse Excel: {str(e)}")
            return None

    def trigger_server_import(self, file_key, shop_name, platform, report_type, local_path=None):
        """Kích hoạt Server tự động xử lý file sau khi đã lên R2"""
        try:
            url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/auto-import-trigger"

            # Extract PDF text trên máy local để gửi kèm
            pdf_text = ""
            if local_path and local_path.endswith(".pdf"):
                pdf_text = self.extract_pdf_text(local_path)
                if pdf_text:
                    self.log(f"📄 Đã extract PDF text: {len(pdf_text)} ký tự")

            payload = {
                "file_key":    file_key,
                "shop":        shop_name,
                "platform":    platform,
                "report_type": report_type,
                "pdf_text":    pdf_text,
            }
            # Nếu có parsed_json truyền vào thì gửi kèm
            if hasattr(self, '_pending_parsed_json') and self._pending_parsed_json:
                payload["parsed_json"] = self._pending_parsed_json
                self._pending_parsed_json = None
            data = json.dumps(payload).encode('utf-8')
            
            headers = {'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'}
            req = urllib.request.Request(url, data=data, headers=headers, method='POST')
            with urllib.request.urlopen(req) as res:
                if res.status == 200:
                    self.log(f"⚡ [Auto-Import] Đã báo Server xử lý {report_type} cho Shop: {shop_name}")
        except Exception as e:
            self.log(f"⚠️ Lỗi kích hoạt Import: {str(e)}")

    def upload_to_r2(self, local_path, remote_name):
        try:
            api_upload = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/upload"
            
            with open(local_path, 'rb') as f:
                file_data = f.read()

            # Xác định Content-Type
            ext = remote_name.split('.')[-1].lower()
            content_type = 'application/pdf' if ext == 'pdf' else 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

            req_url = f"{api_upload}?file={urllib.parse.quote(remote_name)}&token=huyvan_secret_2026"
            headers = {
                'Content-Type': content_type,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
            }
            req = urllib.request.Request(req_url, data=file_data, headers=headers, method='PUT')
            with urllib.request.urlopen(req) as res:
                if res.status == 200:
                    self.log(f"☁️ Đã đồng bộ lên Cloud R2: {remote_name}")
                    return True
        except Exception as e:
            self.log(f"⚠️ Lỗi Upload R2: {str(e)}")
        return False

    # ==========================================
    # CÁC MODULE XỬ LÝ ĐỘC LẬP
    # ==========================================
    async def xu_ly_doanh_thu(self, page, shop, THANG_TAI, NAM):
        self.log(f"Đang xử lý DOANH THU cho shop: {shop['ten_shop']}")
        await page.goto("https://banhang.shopee.vn/portal/finance/income/statement", wait_until="commit")
        await asyncio.sleep(10)
        # Tự nhập mật khẩu
        pass_input = await page.query_selector('input[type="password"]')
        if pass_input:
            await page.fill('input[type="password"]', shop["mat_khau"])
            await page.click("button.eds-button--primary.action")
            await asyncio.sleep(10)
        
        # Click chọn tháng/ngày
        await page.click('#app > div > div.app-container > div.page-container.responsive-container.has-sidebar-panel > div.page-content-wrapper.responsive-content-wrapper > div > div > div > div.flex-header > div.eds-popover.eds-popover--light > div.eds-popover__ref > div > button', force=True)
        await asyncio.sleep(3)
        await page.click('#statements-date-picker > div.opts-panel > ul > li:nth-child(2)', force=True)
        await asyncio.sleep(5)
        await page.click('#statements-date-picker > div.eds-daterange-picker-panel.date-range-panel > div > div.eds-daterange-picker-panel__body-left > div > div.eds-picker-header > span:nth-child(3)', force=True)
        await asyncio.sleep(3)
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        await page.click(f".eds-month-table__col:has-text('{months[THANG_TAI - 1]}')", force=True)
        await asyncio.sleep(5)
        all_days = await page.query_selector_all('.eds-date-table__cell-inner.normal:not(.disabled)')
        if len(all_days) > 0:
            await all_days[0].click(force=True)
            await asyncio.sleep(1)
            await all_days[-1].click(force=True)
        await asyncio.sleep(10)
        
        # Xuất file
        await page.click("#app > div > div.app-container > div.page-container.responsive-container.has-sidebar-panel > div.page-content-wrapper.responsive-content-wrapper > div > div > div > div.table-wrapper > div > div.eds-table__body-container > div.eds-table__main-body > div > div > div.eds-scrollbar__content > table > tbody > tr > td.is-last > div > div > div.eds-popover__ref > button", force=True)
        await asyncio.sleep(10)
        
        da_tai_xong = False
        self.log("Đang canh 'Đang được xử lý' (Đợi tối đa 5 phút)...")

        for i in range(30):
            dang_xu_ly = await page.get_by_text("Đang được xử lý").is_visible()
            if not dang_xu_ly:
                btn_taive = page.get_by_role("button", name="Tải về").first
                if await btn_taive.is_visible():
                    try:
                        async with page.expect_download(timeout=60000) as download_info:
                            await btn_taive.click(force=True)
                        download = await download_info.value
                        folder = os.path.join(shop["thu_muc_luu"], f"Tháng {str(THANG_TAI).zfill(2)} {NAM}")
                        if not os.path.exists(folder): os.makedirs(folder)
                        file_name = f"{shop['ten_shop']}_DoanhThu_{NAM}{str(THANG_TAI).zfill(2)}.pdf"
                        full_path = os.path.join(folder, file_name)
                        await download.save_as(full_path)
                        self.log(f"🏆 THÀNH CÔNG! Đã lưu: {file_name}")
                        
                        # Tự động đẩy lên R2
                        if self.upload_to_r2(full_path, file_name):
                            self.trigger_server_import(file_name, shop['ten_shop'], 'shopee', 'income', full_path)
                        
                        da_tai_xong = True
                        break
                    except:
                        self.log("Vấp lỗi nút Tải về, chuẩn bị F5 cứu hộ...")
                        break
            await asyncio.sleep(10)

        # CƠ CHẾ CỨU HỘ
        if not da_tai_xong:
            self.log("⚠️ Loading lâu quá! Đang F5 và chọc thẳng vào Lịch sử báo cáo...")
            await page.reload()
            await asyncio.sleep(10)
            js_history_path = '#app > div > div.app-container > div.page-container.responsive-container.has-sidebar-panel > div.page-content-wrapper.responsive-content-wrapper > div > div > div > div.flex-header > div.remote-component > div > div:nth-child(2) > div.eds-popover__ref > div > button'
            try:
                await page.evaluate(f'document.querySelector("{js_history_path}").click()')
                await asyncio.sleep(5)
                btn_popup = page.get_by_role("button", name="Tải về").first
                if await btn_popup.is_visible():
                    async with page.expect_download(timeout=60000) as download_info:
                        await btn_popup.click(force=True)
                    download = await download_info.value
                    folder = os.path.join(shop["thu_muc_luu"], f"Tháng {str(THANG_TAI).zfill(2)} {NAM}")
                    file_name = f"{shop['ten_shop']}_DoanhThu_{NAM}{str(THANG_TAI).zfill(2)}.pdf"
                    if not os.path.exists(folder): os.makedirs(folder)
                    full_path_rescue = os.path.join(folder, file_name)
                    await download.save_as(full_path_rescue)
                    self.log(f"🏆 CỨU HỘ THÀNH CÔNG! Đã lấy file từ lịch sử.")
                    if self.upload_to_r2(full_path_rescue, file_name):
                        self.trigger_server_import(file_name, shop['ten_shop'], 'shopee', 'income', full_path_rescue)
                    da_tai_xong = True
                else:
                    self.log("❌ F5 rồi vẫn không thấy file. Máy bỏ qua để sang phần tiếp theo.")
            except Exception as e:
                self.log(f"❌ Không chọc được nút Lịch sử: {str(e)}")
            await asyncio.sleep(10)

    async def xu_ly_hoa_don(self, page, shop, THANG_TAI, NAM):
        self.log(f"Đang xử lý HÓA ĐƠN cho shop: {shop['ten_shop']}")
        await page.goto("https://banhang.shopee.vn/portal/finance/income/invoice", wait_until="commit")
        await asyncio.sleep(10)
        # Chọn tháng hóa đơn
        await page.locator('.eds-select, .eds-select__input-wrapper').first.click(force=True)
        await asyncio.sleep(3)
        await page.fill('input[placeholder="Select"]', NAM)
        await asyncio.sleep(3)
        await page.evaluate(f'(txt) => {{ const ops = document.querySelectorAll("div.eds-option"); for(let o of ops) {{ if(o.innerText.includes(txt)) {{ o.click(); return; }} }} }}', f"Tháng {THANG_TAI} {NAM}")
        await asyncio.sleep(10)
        
        if not await page.get_by_text("Không có hóa đơn").is_visible():
            targets = {"Shopee - SVS": "_ADS", "Shopee - Phí rút tiền": "_PhiRutTien", "Shopee - Phí sàn": "_PhiSan"}
            for phi, duoi in targets.items():
                row = page.locator(f"tr:has-text('{phi}'), div.eds-table__row:has-text('{phi}')").first
                if await row.is_visible():
                    btn = row.locator("text=Master Invoice").first
                    if await btn.is_visible():
                        await asyncio.sleep(5)  # Chờ Shopee chuẩn bị file
                        async with page.expect_download(timeout=120000) as dl_info:
                            await btn.click(force=True)
                        dl = await dl_info.value
                        folder = os.path.join(shop["thu_muc_luu"], f"Tháng {str(THANG_TAI).zfill(2)} {NAM}")
                        if not os.path.exists(folder): os.makedirs(folder)
                        file_name = f"{shop['ten_shop']}{duoi}_{NAM}{str(THANG_TAI).zfill(2)}.pdf"
                        full_path = os.path.join(folder, file_name)
                        # Lưu tạm dưới dạng .zip trước
                        zip_path = full_path.replace(".pdf", ".zip")
                        await dl.save_as(zip_path)
                        await asyncio.sleep(3)

                        # Kiểm tra có phải ZIP không rồi giải nén
                        ok_to_upload = True
                        if zipfile.is_zipfile(zip_path):
                            self.log(f"📦 Phát hiện file ZIP, đang giải nén...")
                            with zipfile.ZipFile(zip_path, 'r') as z:
                                pdf_files = [f for f in z.namelist() if f.lower().endswith('.pdf')]
                                if pdf_files:
                                    extracted = z.extract(pdf_files[0], folder)
                                    if os.path.exists(full_path):
                                        os.remove(full_path)
                                    os.rename(extracted, full_path)
                                    self.log(f"✅ Giải nén thành công: {pdf_files[0]}")
                                else:
                                    self.log(f"⚠️ ZIP không chứa PDF, bỏ qua")
                                    ok_to_upload = False
                            os.remove(zip_path)
                        else:
                            # Không phải ZIP, đổi tên thẳng
                            if os.path.exists(full_path):
                                os.remove(full_path)
                            os.rename(zip_path, full_path)

                        if not ok_to_upload:
                            continue

                        # Kiểm tra file hợp lệ (> 5KB)
                        file_size = os.path.getsize(full_path)
                        if file_size < 5000:
                            self.log(f"⚠️ File {duoi} quá nhỏ ({file_size} bytes), bỏ qua")
                            continue

                        self.log(f"🏆 Xong Hóa đơn {duoi} ({file_size // 1024} KB)")

                        # Phân loại đúng report_type
                        if duoi == "_ADS":
                            rtype = "phi-dau-thau"
                        else:
                            rtype = "expense"

                        # Tự động đẩy lên R2
                        if self.upload_to_r2(full_path, file_name):
                            self.trigger_server_import(file_name, shop['ten_shop'], 'shopee', rtype, full_path)
                        
                        await asyncio.sleep(10)

    # ==========================================
    # LAZADA — DOANH THU, HÓA ĐƠN, ĐƠN HÀNG
    # ==========================================
    async def lazada_xu_ly_doanh_thu(self, page, shop, THANG_TAI, NAM):
        import calendar
        self.log(f"Đang xử lý DOANH THU Lazada cho shop: {shop['ten_shop']}")
        await page.goto("https://sellercenter.lazada.vn/portal/apps/finance/myIncome/index", wait_until="commit")
        await asyncio.sleep(8)

        # Đăng nhập nếu cần
        if "login" in page.url or await page.locator('input[placeholder*="Số điện thoại"]').is_visible():
            self.log("Đang đăng nhập Lazada...")
            tk_loc = page.locator('input[placeholder*="Số điện thoại"]').first
            await tk_loc.wait_for(state="visible", timeout=15000)
            await tk_loc.fill(shop.get("email_login", ""))
            await asyncio.sleep(1)
            mk_loc = page.locator('input[placeholder*="Mật khẩu"], input[type="password"]').first
            await mk_loc.fill(shop["mat_khau"])
            await asyncio.sleep(1)
            await page.locator('button:has-text("Đăng nhập")').first.click(force=True)
            await asyncio.sleep(10)

        # Đảm bảo đã đăng nhập
        await self.lazada_ensure_login(page, shop)

        # Click Sao kê tháng
        await page.get_by_text("Sao kê tháng").last.click(force=True)
        await asyncio.sleep(5)

        # Tìm tháng và tải
        m_e = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        target_m = m_e[THANG_TAI - 1]
        row = page.locator("div").filter(has_text=target_m).filter(has_text="Tải xuống").last
        await row.get_by_text("Tải xuống").click(force=True)
        await asyncio.sleep(5)

        await page.get_by_text("Tổng quan giao dịch (pdf)").first.click(force=True)
        await asyncio.sleep(5)

        js_taive = 'body > div.next-overlay-wrapper.opened > div.next-overlay-inner.next-dialog-wrapper > div > div > div.next-dialog-body > div > div.sc-jXbUNg.SfdHU > div > table > tbody > tr.next-table-row.first > td.next-table-cell.last > div > div > div'
        folder = shop["thu_muc_luu"]
        if not os.path.exists(folder): os.makedirs(folder)

        async with page.expect_download(timeout=60000) as dl_info:
            await page.evaluate(f'document.querySelector("{js_taive}").click()')
        dl = await dl_info.value
        file_name = f"LAZADA_{shop['ten_shop']}_{NAM}{str(THANG_TAI).zfill(2)}_doanh-thu.pdf"
        full_path = os.path.join(folder, file_name)
        await dl.save_as(full_path)
        self.log(f"🏆 Xong Lazada Doanh Thu tháng {THANG_TAI}")

        if self.upload_to_r2(full_path, file_name):
            self.trigger_server_import(file_name, shop['ten_shop'], 'lazada', 'income', full_path)

    async def lazada_xu_ly_hoa_don(self, page, shop, THANG_TAI, NAM):
        self.log(f"Đang xử lý HÓA ĐƠN Lazada tháng {THANG_TAI}/{NAM}")
        await page.goto("https://sellercenter.lazada.vn/portal/apps/finance/myIncome/index", wait_until="commit")
        await asyncio.sleep(8)
        await self.lazada_ensure_login(page, shop)
        await page.locator('div.next-tabs-tab-inner:has-text("Hóa đơn")').last.click(force=True)
        await asyncio.sleep(5)

        m_e = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        target_str = f"{m_e[THANG_TAI - 1]} {NAM}"
        has_next_page = True
        empty_pages_count = 0
        cycle_counts = {}

        while has_next_page:
            await asyncio.sleep(3)
            rows = await page.locator("tr.next-table-row").all()
            found_in_current_page = False

            for row in rows:
                try:
                    chu_ky_loc = row.locator("td.next-table-cell.first")
                    if not await chu_ky_loc.is_visible(): continue
                    chu_ky_text = await chu_ky_loc.inner_text()
                    if target_str not in chu_ky_text: continue

                    found_in_current_page = True
                    empty_pages_count = 0
                    safe_chu_ky = chu_ky_text.replace("/","-").replace(":","-").replace("\n","").strip()
                    cycle_counts[safe_chu_ky] = cycle_counts.get(safe_chu_ky, 0) + 1
                    file_name = f"LAZADA_{shop['ten_shop']}_{safe_chu_ky}_{cycle_counts[safe_chu_ky]}.pdf"

                    btn_tai = row.locator("td.next-table-cell.last").get_by_text("Tải xuống")
                    if await btn_tai.is_visible():
                        async with page.expect_download(timeout=60000) as dl_info:
                            await btn_tai.click(force=True)
                        dl = await dl_info.value
                        full_path = os.path.join(shop["thu_muc_luu"], file_name)
                        await dl.save_as(full_path)
                        self.log(f"🏆 Đã lưu hóa đơn: {file_name}")

                        # Phân loại ADS vs Chi Phí bằng cách đọc nội dung PDF
                        pdf_text = self.extract_pdf_text(full_path)
                        is_ads = any(k in pdf_text for k in [
                            "Tài Trợ Hiển Thị", "Tài trợ Hiển Thị",
                            "Sponsored", "tài trợ hiển thị"
                        ])
                        lazada_rtype = "phi-dau-thau" if is_ads else "expense"
                        self.log(f"📋 Phân loại: {'Quảng Cáo ADS' if is_ads else 'Chi Phí'}")

                        if self.upload_to_r2(full_path, file_name):
                            self.trigger_server_import(file_name, shop['ten_shop'], 'lazada', lazada_rtype, full_path)
                        await asyncio.sleep(2)
                except:
                    pass

            if not found_in_current_page:
                empty_pages_count += 1
            if empty_pages_count >= 2:
                break

            btn_next = page.locator('button.next-next, button:has-text("Tiếp theo")').last
            if await btn_next.is_visible() and not await btn_next.is_disabled():
                await btn_next.click(force=True)
                await asyncio.sleep(5)
            else:
                has_next_page = False

        self.log(f"✅ Xong hóa đơn Lazada tháng {THANG_TAI}/{NAM}")

    async def lazada_xu_ly_don_hang(self, page, shop, THANG_TAI, NAM):
        import calendar
        self.log(f"Đang xử lý ĐƠN HÀNG Lazada tháng {THANG_TAI}/{NAM}")
        await self.lazada_ensure_login(page, shop)
        await page.goto("https://sellercenter.lazada.vn/apps/order/list?oldVersion=1&status=all", wait_until="commit")
        await asyncio.sleep(8)

        js_tuy_chinh = '#root > section > div.a-l-page-container > div > div.mount-node-container.middle-container-width > div > div > form > div.next-card.next-card-hide-divider > div > div > div > div.expand-body > div:nth-child(1) > div.next-col.next-form-item-control > div > div:nth-child(2) > div > span'
        await page.evaluate(f'document.querySelector("{js_tuy_chinh}").click()')
        await asyncio.sleep(5)

        js_input_ngay = '#createDateRange > div > span:nth-child(1) > input'
        await page.evaluate(f'document.querySelector("{js_input_ngay}").click()')
        await asyncio.sleep(3)

        last_day = calendar.monthrange(int(NAM), THANG_TAI)[1]
        ngay_bat_dau = f"{NAM}-{str(THANG_TAI).zfill(2)}-01"
        ngay_ket_thuc = f"{NAM}-{str(THANG_TAI).zfill(2)}-{str(last_day).zfill(2)}"

        inputs = await page.locator("input[placeholder='YYYY-MM-DD']").all()
        if len(inputs) >= 2:
            await inputs[0].fill(ngay_bat_dau); await inputs[0].press("Enter"); await asyncio.sleep(1)
            await inputs[1].fill(ngay_ket_thuc); await inputs[1].press("Enter"); await asyncio.sleep(1)

        await page.evaluate('''() => {
            document.querySelectorAll("input[placeholder='HH:mm:ss']").forEach(el => {
                el.removeAttribute('disabled'); el.removeAttribute('aria-disabled');
            });
        }''')
        time_inputs = await page.locator("input[placeholder='HH:mm:ss']").all()
        if len(time_inputs) >= 2:
            await time_inputs[0].fill("00:00:00"); await time_inputs[0].press("Enter"); await asyncio.sleep(1)
            await time_inputs[1].fill("23:59:59"); await time_inputs[1].press("Enter"); await asyncio.sleep(1)

        await asyncio.sleep(5)
        js_ok_ngay = 'body > div.next-overlay-wrapper.opened > div > div.next-date-picker-panel-footer > button:nth-child(2) > span'
        await page.evaluate(f'document.querySelector("{js_ok_ngay}").click()')
        await asyncio.sleep(5)

        js_xuat = '#order-toolbar-actions-id > div.order-toolbar-actions-left > button > span:nth-child(1)'
        await page.evaluate(f'document.querySelector("{js_xuat}").click()')
        await asyncio.sleep(3)
        await page.get_by_text("Export All").click(force=True)
        await asyncio.sleep(3)

        js_ok_export = 'body > div.next-overlay-wrapper.opened > div.next-overlay-inner.next-dialog-wrapper > div > div > div.next-dialog-footer.next-align-right > button.next-btn.next-medium.next-btn-primary.next-dialog-btn > span'
        await page.evaluate(f'document.querySelector("{js_ok_export}").click()')
        await asyncio.sleep(5)

        self.log("⏳ Chờ Lazada xuất file đơn hàng (tối đa 5 phút)...")
        btn_tai_ve = page.locator('a:has-text("Tải về Tập Tin"), span:has-text("Tải về Tập Tin")').first
        da_xuat = False
        for _ in range(30):
            if await btn_tai_ve.is_visible() or await page.get_by_text("Các nhiệm vụ chạy thành công!").is_visible():
                da_xuat = True
                break
            await asyncio.sleep(10)
            self.log("... Vẫn đang xuất, vui lòng đợi ...")

        if da_xuat:
            await asyncio.sleep(5)
            async with page.expect_download(timeout=60000) as dl_info:
                await page.locator('text="Tải về Tập Tin"').first.click(force=True)
            dl = await dl_info.value
            ext = dl.suggested_filename.split(".")[-1]
            file_name = f"LAZADA_{shop['ten_shop']}_donhang_{NAM}{str(THANG_TAI).zfill(2)}.{ext}"
            full_path = os.path.join(shop["thu_muc_luu"], file_name)
            await dl.save_as(full_path)
            self.log(f"🏆 Xong đơn hàng Lazada: {file_name}")
            if self.upload_to_r2(full_path, file_name):
                v2_data = self.parse_lazada_excel(full_path, shop['ten_shop'])
                if v2_data:
                    try:
                        api_url2 = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                        data = json.dumps(v2_data).encode('utf-8')
                        req = urllib.request.Request(api_url2, data=data,
                            headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'},
                            method='POST')
                        with urllib.request.urlopen(req, timeout=60) as res:
                            result = json.loads(res.read().decode())
                            self.log(f"✅ Import Lazada: {result.get('imported_orders',0)} đơn, {result.get('imported_items',0)} items")
                    except Exception as e:
                        self.log(f"⚠️ Lỗi import Lazada V2: {str(e)}")
                self.trigger_server_import(file_name, shop['ten_shop'], 'lazada', 'orders')
        else:
            self.log("❌ Quá thời gian chờ xuất đơn hàng Lazada!")

    async def shopee_xu_ly_don_hang_ngay(self, page, shop, from_date, to_date):
        """Tải đơn hàng Shopee — bấm Xuất rồi tải file mới nhất"""
        self.log(f"📅 Shopee: tải đơn từ {from_date} đến {to_date}")
        await page.goto("https://banhang.shopee.vn/portal/sale/order", wait_until="commit")
        await asyncio.sleep(10)

        # Dọn popup nếu có
        await page.evaluate('() => { document.querySelectorAll(".close-icon, div[class*=\'close-icon\'] i").forEach(i => i.click()) }')
        await asyncio.sleep(3)

        # BƯỚC 1: Bấm nút Xuất
        await page.evaluate('''() => {
            const b = Array.from(document.querySelectorAll("button"))
                .find(x => x.innerText.trim() === "Xuất");
            if(b) b.click()
        }''')
        await asyncio.sleep(5)

        # BƯỚC 2: Modal hiện ra — bấm nút Xuất trong modal
        try:
            btn_xuat_modal = page.locator('button:has-text("Xuất")').last
            await btn_xuat_modal.wait_for(state="visible", timeout=10000)
            await btn_xuat_modal.click(force=True)
            self.log("✅ Đã bấm Xuất trong modal")
        except Exception as e:
            self.log(f"⚠️ Không bấm được Xuất trong modal: {e}")
            return
        await asyncio.sleep(5)

        # BƯỚC 3: Chờ "Đang được xử lý" → chuyển thành nút Tải về
        self.log("⏳ Chờ Shopee xử lý file (tối đa 10 phút)...")
        da_tai = False
        for i in range(60):
            await asyncio.sleep(10)

            dang_xu_ly = await page.get_by_text("Đang được xử lý").is_visible()
            if dang_xu_ly:
                self.log(f"⏳ Shopee đang xử lý... ({(i+1)*10}s)")
                continue

            # BƯỚC 4: Bấm Tải về
            btn_tai = page.get_by_role("button", name="Tải về").first
            if await btn_tai.is_visible():
                async with page.expect_download(timeout=120000) as dl_info:
                    await btn_tai.click(force=True)
                dl = await dl_info.value
                folder = shop["thu_muc_luu"]
                if not os.path.exists(folder):
                    os.makedirs(folder)
                file_name = f"{shop['ten_shop']}_shopee_donhang_{from_date}_{to_date}.xlsx"
                full_path = os.path.join(folder, file_name)
                await dl.save_as(full_path)
                self.log(f"🏆 Xong đơn hàng Shopee {from_date} → {to_date}")

                # Đơn hàng ngày: chỉ import vào orders_v2, không upload báo cáo
                v2_data = self.parse_shopee_excel(full_path, shop['ten_shop'])
                if v2_data:
                    try:
                        api_url2 = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                        data = json.dumps(v2_data).encode('utf-8')
                        req = urllib.request.Request(api_url2, data=data,
                            headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'},
                            method='POST')
                        with urllib.request.urlopen(req, timeout=60) as res:
                            result = json.loads(res.read().decode())
                            self.log(f"✅ Import Shopee: {result.get('imported_orders',0)} đơn, {result.get('imported_items',0)} items")
                    except Exception as e:
                        self.log(f"⚠️ Lỗi import Shopee V2: {str(e)}")
                da_tai = True
                break
            else:
                self.log(f"⏳ Chưa thấy nút Tải về... ({(i+1)*10}s)")

        if not da_tai:
            self.log("❌ Quá thời gian chờ, không tải được file Shopee")

    async def tiktok_xu_ly_don_hang_ngay(self, page, shop, from_date, to_date):
        """Tải đơn hàng TikTok theo khoảng ngày cụ thể"""
        import datetime, calendar
        d = datetime.datetime.strptime(from_date, "%Y-%m-%d")
        THANG_TAI = d.month
        NAM = str(d.year)
        self.log(f"📅 TikTok: tải đơn từ {from_date} đến {to_date}")
        await page.goto("https://seller-vn.tiktok.com/order?selected_sort=6&tab=all", wait_until="commit")
        await asyncio.sleep(8)
        try:
            await page.locator('div, button').filter(has_text="Bộ lọc").last.click(force=True)
        except:
            await page.get_by_text("Bộ lọc", exact=True).first.click(force=True)
        await asyncio.sleep(3)
        try:
            await page.locator('.arco-picker-range, .core-picker-range').first.click(force=True)
        except:
            await page.locator('div').filter(has_text="Thời gian đã tạo").last.click(force=True)
        await asyncio.sleep(3)
        import datetime as dt, calendar
        d_from = dt.datetime.strptime(from_date, "%Y-%m-%d")
        d_to   = dt.datetime.strptime(to_date,   "%Y-%m-%d")
        THANG_TAI = d_from.month
        NAM = str(d_from.year)

        # Lùi tháng về đúng tháng của from_date (copy y chang tiktok_xu_ly_don_hang)
        target_month_text = f"{str(THANG_TAI).zfill(2)}/{NAM}"
        for _ in range(24):
            current_month_text = await page.locator('.core-picker-header-value').first.inner_text()
            if target_month_text in current_month_text.replace(" ", ""):
                break
            try:
                await page.locator('.core-picker-header').first.locator('svg.arco-icon-left').first.click(force=True)
            except:
                await page.locator('div[class*="-header-icon-prev"]').first.click(force=True)
            await asyncio.sleep(2)

        # JS click đúng ngày (copy y chang tiktok_xu_ly_don_hang)
        js_click_exact = '''(args) => {
            const leftPanel = document.querySelectorAll('.core-panel-date-inner, .arco-picker-date-panel')[0];
            if (!leftPanel) return "fail";
            const cells = Array.from(leftPanel.querySelectorAll('div[class*="-picker-cell-inner"], div[class*="-picker-date"]'));
            const matchingCells = cells.filter(c => c.innerText.trim() === args.targetText);
            if (matchingCells.length === 0) return "fail";
            const targetCell = args.isFirst ? matchingCells[0] : matchingCells[matchingCells.length - 1];
            targetCell.click(); return "OK";
        }'''

        # Chọn ngày bắt đầu
        await page.evaluate(js_click_exact, {"targetText": str(d_from.day).zfill(2), "isFirst": True})
        await asyncio.sleep(2)

        # Chọn ngày kết thúc — tìm số không bị ẩn cuối cùng khớp với to_day
        to_day_str = str(d_to.day).zfill(2)
        js_click_to = '''(args) => {
            // Tìm trong CẢ HAI panel (trái + phải)
            const allPanels = document.querySelectorAll('.core-panel-date-inner, .arco-picker-date-panel');
            let found = null;
            for (const panel of allPanels) {
                const cells = Array.from(panel.querySelectorAll('div[class*="-picker-cell-inner"], div[class*="-picker-date"]'));
                const matches = cells.filter(c => {
                    if (c.innerText.trim() !== args.day) return false;
                    // Kiểm tra cell cha không bị disabled/grayed
                    const parent = c.closest('td, div[class*="-cell"]');
                    if (!parent) return true;
                    const cls = parent.className || "";
                    return !cls.includes("disabled") && !cls.includes("gray") && !cls.includes("outside");
                });
                if (matches.length > 0) found = matches[matches.length - 1];
            }
            if (found) { found.click(); return "OK"; }
            return "NOTFOUND";
        }'''
        res = await page.evaluate(js_click_to, {"day": to_day_str})
        self.log(f"📅 Click ngày kết thúc {to_day_str}: {res}")
        await asyncio.sleep(3)

        # Bấm Áp dụng
        try:
            await page.get_by_text("Áp dụng", exact=True).last.click(force=True)
        except:
            await page.locator('button').filter(has_text="Áp dụng").first.click(force=True)
        await asyncio.sleep(8)
        # Xuất và tải
        js_xuat = '''() => {
            let btn = Array.from(document.querySelectorAll('button, div')).reverse()
                .find(el => el.innerText && el.innerText.trim() === 'Xuất');
            if (btn) { btn.click(); return "OK"; } return "FAIL";
        }'''
        await page.evaluate(js_xuat)
        await asyncio.sleep(5)
        try:
            await page.locator('label').filter(has_text="Excel").first.click(force=True)
        except:
            pass
        await asyncio.sleep(3)
        try:
            await page.locator('button.core-btn-primary, button.arco-btn-primary').filter(has_text="Xuất").first.click(force=True)
        except:
            await page.get_by_text("Xuất", exact=True).last.click(force=True)
        await asyncio.sleep(5)
        for i in range(60):
            try:
                btn_tai = page.locator('a, button, span').filter(has_text="Tải xuống").first
                if await btn_tai.is_visible():
                    await asyncio.sleep(3)
                    async with page.expect_download(timeout=60000) as dl_info:
                        await btn_tai.evaluate("node => node.click()")
                    dl = await dl_info.value
                    if not os.path.exists(shop["thu_muc_luu"]):
                        os.makedirs(shop["thu_muc_luu"])
                    ext = dl.suggested_filename.split(".")[-1]
                    file_name = f"{shop['ten_shop']}_donhang_{from_date}_{to_date}.{ext}"
                    full_path = os.path.join(shop["thu_muc_luu"], file_name)
                    await dl.save_as(full_path)
                    self.log(f"🏆 Xong đơn hàng TikTok {from_date} → {to_date}")
                    # Đơn hàng ngày: chỉ import vào orders_v2, không upload báo cáo
                    v2_data = self.parse_tiktok_order_excel_local(full_path, shop['ten_shop'])
                    if v2_data:
                        try:
                            api_url2 = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                            data = json.dumps(v2_data).encode('utf-8')
                            req = urllib.request.Request(api_url2, data=data,
                                headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'},
                                method='POST')
                            with urllib.request.urlopen(req, timeout=60) as res:
                                result = json.loads(res.read().decode())
                                self.log(f"✅ Import TikTok: {result.get('imported_orders',0)} đơn, {result.get('imported_items',0)} items")
                        except Exception as e:
                            self.log(f"⚠️ Lỗi import TikTok V2: {str(e)}")
                    break
            except:
                pass
            await asyncio.sleep(5)

    async def lazada_xu_ly_don_hang_ngay(self, page, shop, from_date, to_date):
        """Tải đơn hàng Lazada theo khoảng ngày cụ thể"""
        self.log(f"📅 Lazada: tải đơn từ {from_date} đến {to_date}")
        await self.lazada_ensure_login(page, shop)
        await page.goto("https://sellercenter.lazada.vn/apps/order/list?oldVersion=1&status=all", wait_until="commit")
        await asyncio.sleep(8)
        js_tuy_chinh = '#root > section > div.a-l-page-container > div > div.mount-node-container.middle-container-width > div > div > form > div.next-card.next-card-hide-divider > div > div > div > div.expand-body > div:nth-child(1) > div.next-col.next-form-item-control > div > div:nth-child(2) > div > span'
        await page.evaluate(f'document.querySelector("{js_tuy_chinh}").click()')
        await asyncio.sleep(5)
        js_input_ngay = '#createDateRange > div > span:nth-child(1) > input'
        await page.evaluate(f'document.querySelector("{js_input_ngay}").click()')
        await asyncio.sleep(3)
        inputs = await page.locator("input[placeholder='YYYY-MM-DD']").all()
        if len(inputs) >= 2:
            await inputs[0].fill(from_date); await inputs[0].press("Enter"); await asyncio.sleep(1)
            await inputs[1].fill(to_date);   await inputs[1].press("Enter"); await asyncio.sleep(1)
        await asyncio.sleep(5)
        js_ok = 'body > div.next-overlay-wrapper.opened > div > div.next-date-picker-panel-footer > button:nth-child(2) > span'
        await page.evaluate(f'document.querySelector("{js_ok}").click()')
        await asyncio.sleep(5)
        js_xuat = '#order-toolbar-actions-id > div.order-toolbar-actions-left > button > span:nth-child(1)'
        await page.evaluate(f'document.querySelector("{js_xuat}").click()')
        await asyncio.sleep(3)
        await page.get_by_text("Export All").click(force=True)
        await asyncio.sleep(3)
        js_ok_export = 'body > div.next-overlay-wrapper.opened > div.next-overlay-inner.next-dialog-wrapper > div > div > div.next-dialog-footer.next-align-right > button.next-btn.next-medium.next-btn-primary.next-dialog-btn > span'
        await page.evaluate(f'document.querySelector("{js_ok_export}").click()')
        await asyncio.sleep(5)
        for _ in range(30):
            if await page.locator('a:has-text("Tải về Tập Tin")').first.is_visible():
                async with page.expect_download(timeout=60000) as dl_info:
                    await page.locator('text="Tải về Tập Tin"').first.click(force=True)
                dl = await dl_info.value
                ext = dl.suggested_filename.split(".")[-1]
                file_name = f"LAZADA_{shop['ten_shop']}_donhang_{from_date}_{to_date}.{ext}"
                full_path = os.path.join(shop["thu_muc_luu"], file_name)
                await dl.save_as(full_path)
                self.log(f"🏆 Xong đơn hàng Lazada {from_date} → {to_date}")
                # Đơn hàng ngày: chỉ import vào orders_v2, không upload báo cáo
                v2_data = self.parse_lazada_excel(full_path, shop['ten_shop'])
                if v2_data:
                    try:
                        api_url2 = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                        data = json.dumps(v2_data).encode('utf-8')
                        req = urllib.request.Request(api_url2, data=data,
                            headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'},
                            method='POST')
                        with urllib.request.urlopen(req, timeout=60) as res:
                            result = json.loads(res.read().decode())
                            self.log(f"✅ Import Lazada: {result.get('imported_orders',0)} đơn, {result.get('imported_items',0)} items")
                    except Exception as e:
                        self.log(f"⚠️ Lỗi import Lazada V2: {str(e)}")
                break
            await asyncio.sleep(10)

    async def xu_ly_don_hang(self, page, shop, THANG_TAI, NAM):
        self.log(f"Đang xử lý ĐƠN HÀNG cho shop: {shop['ten_shop']}")
        await page.goto("https://banhang.shopee.vn/portal/sale/order", wait_until="commit")
        await asyncio.sleep(10)
        # Dọn popup
        await page.evaluate('() => { document.querySelectorAll(".close-icon, div[class*=\'close-icon\'] i").forEach(i => i.click()) }')
        await asyncio.sleep(5)
        # Click Xuất
        await page.evaluate('() => { const b = Array.from(document.querySelectorAll("button")).find(x => x.innerText.includes("Xuất") && !x.innerText.includes("Lịch sử")); if(b) b.click() }')
        await asyncio.sleep(10)
        # Chọn lịch & Chốt ngày
        try:
            await page.locator(".eds-modal__body .eds-date-picker__input, .export-modal .eds-selector__inner").first.click(force=True)
        except:
            await page.evaluate('() => { const el = document.querySelector(".eds-modal__body .eds-date-picker__input, .export-modal .eds-selector__inner"); if(el) el.click() }')
        await asyncio.sleep(5)
        await page.evaluate('document.querySelector("body > div.eds-popper-container > div > div.eds-daterange-picker-panel > div > div.eds-daterange-picker-panel__body-left > div > div.eds-picker-header > span:nth-child(3)").click()')
        await asyncio.sleep(5)
        await page.locator(f".eds-month-table__col:has-text('Tháng {THANG_TAI}')").first.click(force=True)
        await asyncio.sleep(5)
        days = await page.query_selector_all('.eds-date-table__cell-inner.normal:not(.disabled)')
        if days:
            await days[0].click(force=True); await asyncio.sleep(2); await days[-1].click(force=True)
        await asyncio.sleep(10)
        # Bấm nút Xuất cam & Tải về
        await page.evaluate('() => { const s = Array.from(document.querySelectorAll(".eds-modal__footer button, .export-modal button")).find(x => x.innerText.includes("Xuất")); if(s) s.click() }')
        await asyncio.sleep(10)
        self.log("⏳ Chờ Shopee xử lý file đơn hàng (tối đa 10 phút)...")
        for i in range(60):
            await asyncio.sleep(10)
            dang_xu_ly = await page.get_by_text("Đang được xử lý").is_visible()
            if dang_xu_ly:
                self.log(f"⏳ Shopee đang xử lý... ({(i+1)*10}s)")
                continue

            btn = page.get_by_role("button", name="Tải về").first
            if await btn.is_visible():
                async with page.expect_download(timeout=120000) as dl_info:
                    await btn.click(force=True)
                dl = await dl_info.value
                folder = os.path.join(shop["thu_muc_luu"], f"Tháng {str(THANG_TAI).zfill(2)} {NAM}")
                if not os.path.exists(folder):
                    os.makedirs(folder)
                file_name = f"{shop['ten_shop'].replace('_DoanhThu','')}_shopee_donhang_{NAM}{str(THANG_TAI).zfill(2)}.xlsx"
                full_path = os.path.join(folder, file_name)
                await dl.save_as(full_path)
                self.log("🏆 Xong Đơn hàng")

                if self.upload_to_r2(full_path, file_name):
                        # Parse Excel trên máy local rồi gửi JSON lên server
                        v2_data = self.parse_shopee_excel(full_path, shop['ten_shop'])
                        if v2_data:
                            try:
                                api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                                data = json.dumps(v2_data).encode('utf-8')
                                headers = {
                                    'Content-Type': 'application/json',
                                    'User-Agent': 'HuyVanBot/2.0'
                                }
                                req = urllib.request.Request(api_url, data=data, headers=headers, method='POST')
                                with urllib.request.urlopen(req, timeout=60) as res:
                                    result = json.loads(res.read().decode())
                                    self.log(f"✅ Import đơn hàng: {result.get('imported_orders', 0)} đơn, {result.get('imported_items', 0)} items")
                            except Exception as e:
                                self.log(f"⚠️ Lỗi import đơn hàng V2: {str(e)}")
                        # Cũng trigger để lưu vào platform_reports
                        self.trigger_server_import(file_name, shop['ten_shop'], 'shopee', 'orders')

                await asyncio.sleep(5)
                break
            else:
                self.log(f"⏳ Chưa thấy nút Tải về, thử lại... ({(i+1)*10}s)")

    async def tiktok_xu_ly_doanh_thu(self, page, shop, THANG_TAI, NAM):
        import calendar
        self.log(f"Đang xử lý DOANH THU TikTok tháng {THANG_TAI}/{NAM}")
        await page.goto("https://seller-vn.tiktok.com/finance/transactions?shop_region=VN&tab=settled_tab", wait_until="commit")
        await asyncio.sleep(8)

        if "login" in page.url or "account/login" in page.url:
            self.log("TikTok chưa đăng nhập, đang tự login...")
            try:
                tk_loc = page.locator('input[placeholder*="điện thoại"], input[placeholder*="email"], input[name="email"]').first
                await tk_loc.wait_for(state="visible", timeout=10000)
                await tk_loc.fill(shop.get("email_login", ""))
                await asyncio.sleep(1)
                mk_loc = page.locator('input[type="password"]').first
                await mk_loc.fill(shop["mat_khau"])
                await asyncio.sleep(1)
                await page.locator('button:has-text("Đăng nhập")').first.click(force=True)
                await asyncio.sleep(8)
            except Exception as e:
                self.log(f"Lỗi login TikTok: {e}")
                self.rescue_wait("Đăng nhập TikTok thủ công rồi bấm XÁC NHẬN")

        # Bấm Xuất
        try:
            await page.evaluate('document.querySelector("#core-tabs-0-panel-0 > div > div.space-y-16 > div.flex.flex-col.space-y-16 > div:nth-child(1) > div.w-200.h-32 > div > div > div.text-base.font-semibold.cursor-pointer.select-none.bg-\\[\\#ECECED\\].text-\\[\\#171718\\].rounded.py-6.px-12.hover\\:bg-gray-200.flex.items-center").click()')
        except:
            try:
                await page.get_by_text("Xuất", exact=True).first.click(force=True)
            except:
                await page.locator('div, span, button').filter(has_text="Xuất").filter(has_not_text="Lịch sử").first.click(force=True)
        await asyncio.sleep(5)

        # Chọn ngày
        try:
            await page.evaluate('document.querySelector("body > div:nth-child(9) > span > div.core-popover-content.core-popover-content-br > div > div > div > div > div > div.sc-eywOmQ.epYlkZ.flex.items-center.rounded.border.border-gray-border.hover\\:border-brand-hover > div > div > div:nth-child(1)").click()')
        except:
            try:
                await page.get_by_text("Thời gian bắt đầu").first.click(force=True)
            except:
                await page.locator('div').filter(has_text="Thời gian bắt đầu").last.click(force=True)
        await asyncio.sleep(5)

        # Lùi tháng
        target_month_text = f"{str(THANG_TAI).zfill(2)}/{NAM}"
        for _ in range(24):
            current_month_text = await page.locator('.core-picker-header-value').first.inner_text()
            if target_month_text in current_month_text.replace(" ", ""):
                break
            try:
                await page.locator('.core-picker-header').first.locator('svg.arco-icon-left').first.click(force=True)
            except:
                await page.locator('div[class*="-header-icon-prev"]').first.click(force=True)
            await asyncio.sleep(2)

        # Chọn ngày 1 và ngày cuối
        last_day = calendar.monthrange(int(NAM), THANG_TAI)[1]
        js_click_exact = '''(args) => {
            const leftPanel = document.querySelectorAll('.core-panel-date-inner, .arco-picker-date-panel')[0];
            if (!leftPanel) return "fail";
            const cells = Array.from(leftPanel.querySelectorAll('div[class*="-picker-cell-inner"], div[class*="-picker-date"]'));
            const matchingCells = cells.filter(c => c.innerText.trim() === args.targetText);
            if (matchingCells.length === 0) return "fail";
            const targetCell = args.isFirst ? matchingCells[0] : matchingCells[matchingCells.length - 1];
            targetCell.click(); return "OK";
        }'''
        await page.evaluate(js_click_exact, {"targetText": "01", "isFirst": True})
        await asyncio.sleep(2)
        await page.evaluate(js_click_exact, {"targetText": str(last_day).zfill(2), "isFirst": False})
        await asyncio.sleep(5)

        # Bấm OK
        try:
            await page.evaluate('document.querySelector("body > div:nth-child(10) > span > div > div.bg-white.flex.justify-between.p-12.border-gray-border > div.space-x-12.flex.items-center > button > span").click()')
        except:
            await page.locator('button:has-text("OK")').click(force=True)
        await asyncio.sleep(5)

        # Bấm Xuất xanh
        try:
            await page.evaluate('document.querySelector("body > div:nth-child(9) > span > div.core-popover-content.core-popover-content-br > div > div > div > div > div > div.flex.space-x-12.mt-16.justify-end > button.core-btn.core-btn-primary.core-btn-size-default.core-btn-shape-square.pulse-button.pulse-button-size-default > span").click()')
        except:
            await page.locator('button:has-text("Xuất")').last.click(force=True)
        await asyncio.sleep(5)

        # Chờ tải
        js_tai = 'body > div:nth-child(9) > span > div.core-popover-content.core-popover-content-br > div > div > div > div > div > div.sc-jeCNp.wuZek.w-full.overflow-x-hidden.overflow-y-auto > div:nth-child(1) > div.flex.items-center.px-24.py-16 > div.relative.ml-auto > button > span'
        for i in range(120):
            try:
                btn_tai = page.locator('button:has-text("Tải xuống"), span:has-text("Tải xuống")').first
                if await btn_tai.is_visible() and not await btn_tai.is_disabled():
                    async with page.expect_download(timeout=30000) as dl_info:
                        try:
                            await page.evaluate(f'document.querySelector("{js_tai}").click()')
                        except:
                            await btn_tai.click(force=True)
                    dl = await dl_info.value
                    if not os.path.exists(shop["thu_muc_luu"]):
                        os.makedirs(shop["thu_muc_luu"])
                    ext = dl.suggested_filename.split(".")[-1]
                    file_name = f"{shop['ten_shop']}_doanhthu_{NAM}{str(THANG_TAI).zfill(2)}.{ext}"
                    full_path = os.path.join(shop["thu_muc_luu"], file_name)
                    await dl.save_as(full_path)
                    self.log(f"🏆 Xong Doanh Thu TikTok tháng {THANG_TAI}")
                    if self.upload_to_r2(full_path, file_name):
                        # Parse Excel + gửi parsed_json lên server
                        parsed = self.parse_tiktok_excel(full_path)
                        if parsed:
                            try:
                                url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/auto-import-trigger"
                                data = json.dumps({
                                    "file_key":    file_name,
                                    "shop":        shop['ten_shop'],
                                    "platform":    "tiktok",
                                    "report_type": "income",
                                    "parsed_json": json.dumps(parsed),
                                }).encode('utf-8')
                                headers = {'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'}
                                req = urllib.request.Request(url, data=data, headers=headers, method='POST')
                                with urllib.request.urlopen(req, timeout=60) as res:
                                    result = json.loads(res.read().decode())
                                    self.log(f"✅ Upload doanh thu TikTok: {result.get('status')}")
                            except Exception as e:
                                self.log(f"⚠️ Lỗi gửi parsed_json TikTok: {str(e)}")
                        else:
                            self.trigger_server_import(file_name, shop['ten_shop'], 'tiktok', 'income', full_path)
                    break
            except:
                pass
            await asyncio.sleep(5)
            if i % 6 == 0:
                self.log(f"⏳ Chờ TikTok xử lý file ({i*5}s)...")

    async def tiktok_xu_ly_hoa_don(self, page, shop, THANG_TAI, NAM):
        self.log(f"Đang xử lý HÓA ĐƠN TikTok tháng {THANG_TAI}/{NAM}")
        await page.goto("https://seller-vn.tiktok.com/finance/invoice?shop_region=VN", wait_until="commit")
        await asyncio.sleep(8)

        target_period = f"{NAM}-{str(THANG_TAI).zfill(2)}"
        has_next_page = True
        empty_pages_count = 0
        cycle_counts = {}

        while has_next_page:
            await asyncio.sleep(3)
            rows = await page.locator("tr, div.arco-table-tr").all()
            found_in_current_page = False

            for row in rows:
                try:
                    row_text = await row.inner_text()
                    if target_period in row_text and "Tải xuống" in row_text:
                        found_in_current_page = True
                        empty_pages_count = 0
                        loai_hd = "VanChuyen" if "Tokgistic" in row_text else "ChiPhi"
                        cycle_counts[loai_hd] = cycle_counts.get(loai_hd, 0) + 1
                        file_name = f"{shop['ten_shop']}_hoadon_{loai_hd}_{target_period}_{cycle_counts[loai_hd]}.pdf"

                        btn_tai = row.get_by_text("Tải xuống", exact=True).first
                        if await btn_tai.is_visible():
                            try:
                                async with page.expect_download(timeout=45000) as dl_info:
                                    await btn_tai.evaluate("node => node.click()")
                                dl = await dl_info.value
                                ext = dl.suggested_filename.split(".")[-1]
                                file_name = file_name.replace(".pdf", f".{ext}")
                                full_path = os.path.join(shop["thu_muc_luu"], file_name)
                                await dl.save_as(full_path)
                                self.log(f"🏆 Đã lưu: {file_name}")
                                # Phân loại report_type
                                is_logistics = "VanChuyen" in file_name
                                rtype = "expense"  # TikTok chi phí
                                if self.upload_to_r2(full_path, file_name):
                                    self.trigger_server_import(file_name, shop['ten_shop'], 'tiktok', rtype, full_path)
                                await asyncio.sleep(3)
                            except Exception as e:
                                self.log(f"⚠️ Lỗi tải hóa đơn: {e}")
                except:
                    pass

            if not found_in_current_page:
                empty_pages_count += 1
            if empty_pages_count >= 2:
                break

            btn_next = page.locator('li.arco-pagination-item-next, button.arco-pagination-item-next').first
            try:
                class_next = await btn_next.get_attribute('class')
                if await btn_next.is_visible() and "disabled" not in str(class_next).lower():
                    await btn_next.click(force=True)
                    await asyncio.sleep(5)
                else:
                    has_next_page = False
            except:
                has_next_page = False

        self.log(f"✅ Xong hóa đơn TikTok tháng {THANG_TAI}/{NAM}")

    async def tiktok_xu_ly_don_hang(self, page, shop, THANG_TAI, NAM):
        import calendar
        self.log(f"Đang xử lý ĐƠN HÀNG TikTok tháng {THANG_TAI}/{NAM}")
        await page.goto("https://seller-vn.tiktok.com/order?selected_sort=6&tab=all", wait_until="commit")
        await asyncio.sleep(8)

        # Bộ lọc
        try:
            await page.locator('div, button').filter(has_text="Bộ lọc").last.click(force=True)
        except:
            await page.get_by_text("Bộ lọc", exact=True).first.click(force=True)
        await asyncio.sleep(3)

        # Chọn Thời gian đã tạo
        try:
            await page.locator('.arco-picker-range, .core-picker-range').first.click(force=True)
        except:
            await page.locator('div').filter(has_text="Thời gian đã tạo").last.click(force=True)
        await asyncio.sleep(3)

        # Lùi tháng
        target_month_text = f"{str(THANG_TAI).zfill(2)}/{NAM}"
        for _ in range(24):
            current_month_text = await page.locator('.arco-picker-header-value, .core-picker-header-value').first.inner_text()
            if target_month_text in current_month_text.replace(" ", ""):
                break
            try:
                await page.locator('.arco-picker-header, .core-picker-header').first.locator('svg.arco-icon-left').first.click(force=True)
            except:
                await page.locator('div[class*="-header-icon-prev"]').first.click(force=True)
            await asyncio.sleep(2)

        # Chọn ngày
        last_day = calendar.monthrange(int(NAM), THANG_TAI)[1]
        js_click_exact = '''(args) => {
            const leftPanel = document.querySelectorAll('.core-panel-date-inner, .arco-picker-date-panel')[0];
            if (!leftPanel) return "fail";
            const cells = Array.from(leftPanel.querySelectorAll('div[class*="-picker-cell-inner"], div[class*="-picker-date"]'));
            const matchingCells = cells.filter(c => c.innerText.trim() === args.targetText);
            if (matchingCells.length === 0) return "fail";
            const targetCell = args.isFirst ? matchingCells[0] : matchingCells[matchingCells.length - 1];
            targetCell.click(); return "OK";
        }'''
        await page.evaluate(js_click_exact, {"targetText": "01", "isFirst": True})
        await asyncio.sleep(2)
        await page.evaluate(js_click_exact, {"targetText": str(last_day).zfill(2), "isFirst": False})
        await asyncio.sleep(3)

        # Áp dụng
        try:
            await page.get_by_text("Áp dụng", exact=True).last.click(force=True)
        except:
            await page.locator('button').filter(has_text="Áp dụng").first.click(force=True)
        await asyncio.sleep(12)

        # Xuất đơn hàng
        js_click_xuat = '''() => {
            let elements = Array.from(document.querySelectorAll('button, div'));
            let btn = elements.reverse().find(el => el.innerText && el.innerText.trim() === 'Xuất');
            if (btn) { btn.click(); return "OK"; } return "FAIL";
        }'''
        try:
            res = await page.evaluate(js_click_xuat)
            if res != "OK":
                await page.locator('button').filter(has_text="Xuất").first.click(force=True)
        except:
            pass
        await asyncio.sleep(5)

        # Chọn Excel
        try:
            await page.locator('label').filter(has_text="Excel").first.click(force=True)
        except:
            await page.get_by_text("Excel", exact=True).click(force=True)
        await asyncio.sleep(3)

        # Bấm Xuất xanh
        try:
            await page.locator('button.core-btn-primary, button.arco-btn-primary').filter(has_text="Xuất").first.click(force=True)
        except:
            await page.get_by_text("Xuất", exact=True).last.click(force=True)
        await asyncio.sleep(5)

        # Chờ tải
        for i in range(120):
            try:
                btn_tai = page.locator('a, button, span').filter(has_text="Tải xuống").first
                if await btn_tai.is_visible():
                    await asyncio.sleep(5)
                    async with page.expect_download(timeout=60000) as dl_info:
                        try:
                            await btn_tai.evaluate("node => node.click()")
                        except:
                            await btn_tai.click(force=True)
                    dl = await dl_info.value
                    if not os.path.exists(shop["thu_muc_luu"]):
                        os.makedirs(shop["thu_muc_luu"])
                    ext = dl.suggested_filename.split(".")[-1]
                    file_name = f"{shop['ten_shop']}_donhang_{NAM}{str(THANG_TAI).zfill(2)}.{ext}"
                    full_path = os.path.join(shop["thu_muc_luu"], file_name)
                    await dl.save_as(full_path)
                    self.log(f"🏆 Xong Đơn Hàng TikTok tháng {THANG_TAI}")
                    if self.upload_to_r2(full_path, file_name):
                        v2_data = self.parse_tiktok_order_excel_local(full_path, shop['ten_shop'])
                        if v2_data:
                            try:
                                api_url2 = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                                data = json.dumps(v2_data).encode('utf-8')
                                req = urllib.request.Request(api_url2, data=data,
                                    headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'},
                                    method='POST')
                                with urllib.request.urlopen(req, timeout=60) as res:
                                    result = json.loads(res.read().decode())
                                    self.log(f"✅ Import TikTok: {result.get('imported_orders',0)} đơn, {result.get('imported_items',0)} items")
                            except Exception as e:
                                self.log(f"⚠️ Lỗi import TikTok V2: {str(e)}")
                        self.trigger_server_import(file_name, shop['ten_shop'], 'tiktok', 'orders', full_path)
                    break
            except:
                pass
            await asyncio.sleep(5)
            if i % 6 == 0:
                self.log(f"⏳ Chờ TikTok xuất đơn hàng ({i*5}s)...")

    async def scrape_all_new_orders(self):
        """Vòng lặp chính: mở trình duyệt và scrape đơn mới từ tất cả shop đang bật"""
        shops = self.get_selected_shops()
        if not shops:
            self.log("⚠️ Chưa chọn shop nào để quét đơn.")
            return

        async with async_playwright() as p:
            for shop in shops:
                if not self.auto_running:
                    break
                try:
                    context = await p.chromium.launch_persistent_context(
                        user_data_dir=shop["profile_dir"],
                        channel="chrome",
                        headless=self.var_headless.get(),
                        args=["--disable-blink-features=AutomationControlled"]
                    )
                    page = context.pages[0]

                    platform = shop.get("platform", "shopee")
                    if platform == "shopee":
                        await self.scrape_new_orders_shopee(page, shop)
                    elif platform == "lazada":
                        await self.scrape_new_orders_lazada(page, shop)
                    elif platform == "tiktok":
                        await self.scrape_new_orders_tiktok(page, shop)

                    await context.close()
                except Exception as e:
                    self.log(f"❌ Lỗi scrape đơn shop {shop['ten_shop']}: {str(e)}")

    async def scrape_new_orders_lazada(self, page, shop):
        """Scrape đơn hàng mới từ Lazada Seller Center"""
        self.log(f"📦 [{shop['ten_shop']}] Đang lấy đơn mới Lazada...")
        try:
            await page.goto("https://sellercenter.lazada.vn/portal/apps/seller-order-manage/orders",
                            wait_until="domcontentloaded")
            await asyncio.sleep(6)
            orders = []
            rows = await page.query_selector_all('[class*="order-item-wrap"], [class*="order-row"]')
            for row in rows[:50]:
                try:
                    order_id_el = await row.query_selector('[class*="order-id"], [class*="orderId"]')
                    order_id = (await order_id_el.inner_text()).strip() if order_id_el else ""
                    if not order_id:
                        continue
                    orders.append({
                        "order_id":        order_id,
                        "platform":        "lazada",
                        "shop":            shop["ten_shop"],
                        "order_date":      __import__('datetime').date.today().isoformat(),
                        "order_type":      "normal",
                        "oms_status":      "PENDING",
                        "shipping_status": "Chờ xác nhận",
                        "revenue": 0, "raw_revenue": 0,
                        "cost_invoice": 0, "cost_real": 0,
                        "fee": 0, "profit_invoice": 0, "profit_real": 0,
                        "tax_flat": 0, "tax_income": 0,
                        "fee_platform": 0, "fee_payment": 0, "fee_affiliate": 0, "fee_ads": 0,
                        "fee_piship": 0, "fee_service": 0, "fee_packaging": 0,
                        "fee_operation": 0, "fee_labor": 0,
                        "cancel_reason": None, "return_fee": 0, "shipped": 0,
                        "discount_shop": 0, "discount_shopee": 0,
                        "discount_combo": 0, "shipping_return_fee": 0,
                    })
                except:
                    continue
            if orders:
                api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                data = json.dumps({"orders": orders, "items": []}).encode('utf-8')
                req = urllib.request.Request(api_url, data=data,
                    headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'},
                    method='POST')
                with urllib.request.urlopen(req, timeout=30) as res:
                    result = json.loads(res.read().decode())
                    self.log(f"✅ Đã import {result.get('imported_orders',0)} đơn mới Lazada")
        except Exception as e:
            self.log(f"⚠️ Lỗi scrape đơn Lazada: {str(e)}")

    async def scrape_new_orders_tiktok(self, page, shop):
        """Scrape đơn hàng mới từ TikTok Shop Seller Center"""
        self.log(f"📦 [{shop['ten_shop']}] Đang lấy đơn mới TikTok...")
        try:
            await page.goto("https://seller-vn.tiktok.com/order/list?status=AWAITING_SHIPMENT",
                            wait_until="domcontentloaded")
            await asyncio.sleep(6)
            orders = []
            rows = await page.query_selector_all('[class*="order-item"], [class*="orderItem"]')
            for row in rows[:50]:
                try:
                    order_id_el = await row.query_selector('[class*="order-id"], [class*="orderId"]')
                    order_id = (await order_id_el.inner_text()).strip() if order_id_el else ""
                    if not order_id:
                        continue
                    orders.append({
                        "order_id":        order_id,
                        "platform":        "tiktok",
                        "shop":            shop["ten_shop"],
                        "order_date":      __import__('datetime').date.today().isoformat(),
                        "order_type":      "normal",
                        "oms_status":      "PENDING",
                        "shipping_status": "Chờ xác nhận",
                        "revenue": 0, "raw_revenue": 0,
                        "cost_invoice": 0, "cost_real": 0,
                        "fee": 0, "profit_invoice": 0, "profit_real": 0,
                        "tax_flat": 0, "tax_income": 0,
                        "fee_platform": 0, "fee_payment": 0, "fee_affiliate": 0, "fee_ads": 0,
                        "fee_piship": 0, "fee_service": 0, "fee_packaging": 0,
                        "fee_operation": 0, "fee_labor": 0,
                        "cancel_reason": None, "return_fee": 0, "shipped": 0,
                        "discount_shop": 0, "discount_shopee": 0,
                        "discount_combo": 0, "shipping_return_fee": 0,
                    })
                except:
                    continue
            if orders:
                api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                data = json.dumps({"orders": orders, "items": []}).encode('utf-8')
                req = urllib.request.Request(api_url, data=data,
                    headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'},
                    method='POST')
                with urllib.request.urlopen(req, timeout=30) as res:
                    result = json.loads(res.read().decode())
                    self.log(f"✅ Đã import {result.get('imported_orders',0)} đơn mới TikTok")
        except Exception as e:
            self.log(f"⚠️ Lỗi scrape đơn TikTok: {str(e)}")
            
    async def scrape_new_orders_shopee(self, page, shop):
        self.log(f"📦 [{shop['ten_shop']}] Đang quét đơn Shopee (Tab Chờ xác nhận)...")
        try:
            # 1. Chuyển sang dùng 'commit' thay vì 'networkidle' để tránh chờ đợi vô ích
            # Commit nghĩa là chỉ cần URL thay đổi và Server bắt đầu gửi dữ liệu là ta đi tiếp
            try:
                await page.goto(
                    "https://banhang.shopee.vn/portal/sale/order?tab=toProcess", 
                    wait_until="commit", 
                    timeout=60000 # Tăng giới hạn lên 60s cho chắc chắn
                )
            except Exception as e:
                self.log(f"⚠️ Trang load hơi chậm, nhưng Bot vẫn sẽ cố gắng quét...")

            # 2. Đợi đúng cái khung chứa danh sách đơn hàng hiện ra (tối đa 20s)
            # Selector này bền vững hơn vì nó nhắm vào khung chứa dữ liệu chính
            self.log("⏳ Đang đợi danh sách đơn hàng hiển thị...")
            await page.wait_for_selector(".order-item-wrapper, .order-card, .order-list-content", timeout=20000)
            
            # Nghỉ 3 giây để đảm bảo JavaScript của Shopee render xong mã đơn
            await asyncio.sleep(3) 

            # 3. Cuộn trang nhẹ để kích hoạt tải dữ liệu (Lazy load)
            await page.mouse.wheel(0, 1000)
            await asyncio.sleep(2)

            orders = []
            # Lấy tất cả các dòng đơn hàng
            rows = await page.query_selector_all(".order-item-wrapper, .order-card, [class*='order-item']")
            
            for row in rows[:50]:
                try:
                    # Selector tìm Order ID linh hoạt (bao gồm cả selector span Huyền gửi)
                    id_el = await row.query_selector(".order-id-text, .order-id, [class*='id-text'], .order-identifiers span")
                    if not id_el: continue
                    
                    raw_id = await id_el.inner_text()
                    # Làm sạch chuỗi: xóa chữ "Mã đơn hàng", dấu # và khoảng trắng
                    order_id = raw_id.replace("Mã đơn hàng", "").replace("#", "").split(':')[-1].strip()
                    
                    if order_id and len(order_id) > 5:
                        orders.append({
                        "order_id":      str(order_id),
                        "platform":      "shopee",
                        "shop":          str(shop["ten_shop"]),
                        "order_date":    __import__('datetime').datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "order_type":    "normal",
                        "oms_status":    "PENDING",
                        "shipping_status": "Chờ xác nhận",
                        "revenue": 0.0, "raw_revenue": 0.0,
                        "cost_invoice": 0.0, "cost_real": 0.0,
                        "fee": 0.0, "profit_invoice": 0.0, "profit_real": 0.0,
                        "tax_flat": 0.0, "tax_income": 0.0,
                        "fee_platform": 0.0, "fee_payment": 0.0, "fee_affiliate": 0.0, "fee_ads": 0.0,
                        "fee_piship": 0.0, "fee_service": 0.0, "fee_packaging": 0.0,
                        "fee_operation": 0.0, "fee_labor": 0.0,
                        "cancel_reason": "", # Không để None/Null
                        "return_fee": 0.0, "shipped": 0,
                        "discount_shop": 0.0, "discount_shopee": 0.0,
                        "discount_combo": 0.0, "shipping_return_fee": 0.0
                    })
                except:
                    continue

            # 4. Gửi dữ liệu về OMS nếu tìm thấy đơn
            if orders:
                api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/import-orders-v2"
                payload = json.dumps({"orders": orders, "items": []}).encode('utf-8')
                req = urllib.request.Request(api_url, data=payload, method='POST',
                                             headers={'Content-Type': 'application/json', 'User-Agent': 'HuyVanBot/2.0'})
                
                with urllib.request.urlopen(req, timeout=15) as res:
                    self.log(f"✅ Thành công: Đã lấy {len(orders)} đơn mới từ {shop['ten_shop']}.")
            else:
                self.log(f"ℹ️ {shop['ten_shop']} hiện tại chưa thấy đơn mới nào.")

        except Exception as e:
            self.log(f"❌ Lỗi quét Shopee ({shop['ten_shop']}): {str(e)}")            

    async def main_logic(self):
        # --- GỌI API LẤY DANH SÁCH LỆNH TỪ CLOUDFLARE D1 ---
        api_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/jobs"
        self.log("🌐 Đang kết nối Server lấy danh sách lệnh chạy...")
        
        try:
            # Ngụy trang User-Agent để tránh lỗi 403 Forbidden
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

        # Kiểm tra chế độ ngày cụ thể (chạy thủ công, không qua jobs)
        if self.mode_var.get() == "day":
            from_date = self.entry_from_date.get().strip()
            to_date   = self.entry_to_date.get().strip()
            if not from_date or not to_date:
                self.log("⚠️ Vui lòng nhập đủ Từ ngày và Đến ngày!")
                return
            # Tạo job giả từ ngày được chọn
            import datetime
            d = datetime.datetime.strptime(from_date, "%Y-%m-%d")
            jobs_data = [{
                "id": "manual",
                "shop_name": s["ten_shop"],
                "month": d.month,
                "year": str(d.year),
                "platform": s["platform"],
                "task_type": "all",
                "_from_date": from_date,
                "_to_date": to_date,
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
                task_type = job.get('task_type', 'all')

                # Khớp lệnh Server với cấu hình thư mục ở máy Local
                shop = next((s for s in self.DANH_SACH_SHOP if s["ten_shop"] == shop_name), None)
                if not shop:
                    self.log(f"⚠️ Bỏ qua lệnh ID {job_id}: Không tìm thấy shop '{shop_name}' trong máy.")
                    continue

                self.log(f"\n🚀 ĐANG CHẠY LỆNH (ID: {job_id}) SHOP: {shop_name} - Tháng {THANG_TAI}/{NAM}")
                context = await p.chromium.launch_persistent_context(
    user_data_dir=shop["profile_dir"], channel="chrome", headless=self.var_headless.get(),
                    args=["--disable-blink-features=AutomationControlled"]
                )
                page = context.pages[0]

                try:
                    platform_job = job.get('platform', 'shopee')

                    # --- TIKTOK ---
                    from_date = job.get('from_date') or None
                    to_date   = job.get('to_date')   or None

                    if platform_job == 'tiktok':
                        if task_type in ['doanh_thu', 'all']:
                            await self.tiktok_xu_ly_doanh_thu(page, shop, THANG_TAI, NAM)
                        if task_type in ['hoa_don', 'all']:
                            await self.tiktok_xu_ly_hoa_don(page, shop, THANG_TAI, NAM)
                        if task_type in ['don_hang', 'all']:
                            if from_date and to_date:
                                await self.tiktok_xu_ly_don_hang_ngay(page, shop, from_date, to_date)
                            else:
                                await self.tiktok_xu_ly_don_hang(page, shop, THANG_TAI, NAM)

                    elif platform_job == 'lazada':
                        if task_type in ['doanh_thu', 'all']:
                            await self.lazada_xu_ly_doanh_thu(page, shop, THANG_TAI, NAM)
                        if task_type in ['hoa_don', 'all']:
                            await self.lazada_xu_ly_hoa_don(page, shop, THANG_TAI, NAM)
                        if task_type in ['don_hang', 'all']:
                            if from_date and to_date:
                                await self.lazada_xu_ly_don_hang_ngay(page, shop, from_date, to_date)
                            else:
                                await self.lazada_xu_ly_don_hang(page, shop, THANG_TAI, NAM)

                    else:
                        if task_type in ['doanh_thu', 'all']:
                            await self.xu_ly_doanh_thu(page, shop, THANG_TAI, NAM)
                        if task_type in ['hoa_don', 'all']:
                            await self.xu_ly_hoa_don(page, shop, THANG_TAI, NAM)
                        if task_type in ['don_hang', 'all']:
                            if from_date and to_date:
                                await self.shopee_xu_ly_don_hang_ngay(page, shop, from_date, to_date)
                            else:
                                await self.xu_ly_don_hang(page, shop, THANG_TAI, NAM)

                    # --- SAU KHI XONG, BÁO CÁO HOÀN THÀNH LÊN SERVER ---
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

    def get_selected_shops(self):
        """Lấy danh sách shop được tích ☑ từ treeview"""
        selected = []
        for item in self.tree.get_children():
            vals = self.tree.item(item, "values")
            if vals[0] == "☑":
                idx = int(self.tree.item(item, "tags")[0])
                selected.append(self.DANH_SACH_SHOP[idx])
        return selected

if __name__ == "__main__":
    HuyVanApp().mainloop()
