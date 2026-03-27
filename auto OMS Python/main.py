import asyncio
import threading
import customtkinter as ctk
from tkinter import ttk
import json
import urllib.request

# Import cấu hình và tiện ích
from engines.scraper_engine import ScraperEngine
from config import DANH_SACH_SHOP, JOBS_URL
from utils import log_to_widget

# Import các bộ máy xử lý (Engines)
from engines.shopee_engine import ShopeeEngine
from engines.lazada_engine import LazadaEngine
from engines.tiktok_engine import TikTokEngine

# Import bộ đọc dữ liệu (Parsers)
from parsers.shopee_parser import ShopeeParser
from parsers.lazada_parser import LazadaParser
from parsers.tiktok_parser import TikTokParser

from playwright.async_api import async_playwright

class HuyVanApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Huy Vân Auto E-Com - Modular Version")
        self.DANH_SACH_SHOP = DANH_SACH_SHOP
        self.auto_running = False
        
        # Khởi tạo các Engine và Parser
        # Khởi tạo Parser trước
        self.shopee_psr = ShopeeParser(self.log)
        self.lazada_psr = LazadaParser(self.log)
        self.tiktok_psr = TikTokParser(self.log)
        
        # Truyền Parser vào Engine tương ứng
        self.shopee_eng = ShopeeEngine(self.log, self.shopee_psr, self.rescue_wait)
        self.lazada_eng = LazadaEngine(self.log, self.lazada_psr)
        self.tiktok_eng = TikTokEngine(self.log, self.tiktok_psr)
        self.scraper_eng = ScraperEngine(self.log)

        # ── GIAO DIỆN MỚI (PREMIUM) ──────────────────────────────────
        from tkinter import ttk
        import tkinter.messagebox as messagebox

        self.configure(fg_color="#101010")
        self.minsize(150, 600)  # Kích thước gọn gàng hơn

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
        tab_sp     = self.tabview.add("🛍️ Đồng bộ Sản phẩm")

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
        self.btn_login_shop = ctk.CTkButton(tab_quanly, text="🔑 Đăng Nhập / Lưu Phiên", command=self.run_manual_login, fg_color="#f59e0b", hover_color="#d97706")
        self.btn_login_shop.pack(pady=10) # (Nếu các nút khác đang dùng .grid() hoặc .pack(side="left") thì bạn chỉnh lại xíu cho nó xếp hàng ngay ngắn nhé)

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

        # ── TAB ĐỒNG BỘ SẢN PHẨM ─────────────────────────────────
        ctk.CTkLabel(tab_sp, text="🛍️ Đồng bộ Variation từ Shopee",
                     font=("Segoe UI", 14, "bold"), text_color="#FFD700").pack(pady=(15,5))
        ctk.CTkLabel(tab_sp,
                     text="Bot sẽ vào trang Sản phẩm Shopee, lấy tất cả SP + phân loại + SKU + tồn kho → gửi lên OMS",
                     font=("Segoe UI", 11), text_color="#AAAAAA", wraplength=700).pack(pady=(0,10))

        sp_shop_frame = ctk.CTkFrame(tab_sp, fg_color="#1A1A1A")
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

        btn_sp_frame = ctk.CTkFrame(tab_sp, fg_color="transparent")
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

        self.sp_log = ctk.CTkTextbox(tab_sp, height=350, fg_color="#0A0A0A",
                                     text_color="#00FF88", font=("Consolas", 11))
        self.sp_log.pack(fill="both", expand=True, padx=15, pady=(5, 15))

    def log(self, message):
        log_to_widget(self.log_text, message)

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
            self.log("🔍 Đang kiểm tra lệnh từ Server...")
            asyncio.run(self.run_main_logic())
            for _ in range(300): # Đợi 5 phút
                if not self.auto_running: break
                time.sleep(1)
                
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

    def sp_log_msg(self, msg):
        self.sp_log.configure(state="normal")
        self.sp_log.insert("end", msg + "\n")
        self.sp_log.see("end")
        self.sp_log.configure(state="disabled")

    def update_sp_shop_list(self, selected_platform):
        """Tự động đổi danh sách shop khi người dùng chọn Sàn khác"""
        shops = ["Tất cả shop"] + [s["ten_shop"] for s in self.DANH_SACH_SHOP if s.get("platform") == selected_platform]
        self.sp_shop_combo.configure(values=shops)
        self.sp_shop_var.set("Tất cả shop")

    def start_sync_products(self):
        platform = self.sp_san_var.get()
        shop_name = self.sp_shop_var.get()
        
        def _run_sync():
            if platform == "shopee":
                old_log = self.shopee_eng.log
                self.shopee_eng.log = self.sp_log_msg
                asyncio.run(self.shopee_eng.sync_shopee_products(self.DANH_SACH_SHOP, shop_name))
                self.shopee_eng.log = old_log
            else:
                self.sp_log_msg(f"⚠️ Tính năng quét Web của {platform.upper()} đang phát triển. Vui lòng dùng nút 'Bot Đồng Bộ SP Excel' kế bên!")

        threading.Thread(target=_run_sync, daemon=True).start()
        
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
    def run_manual_login(self):
        selected = self.get_selected_shops()
        if not selected:
            self.log("⚠️ Vui lòng tích chọn 1 shop trong bảng trên để Đăng nhập!")
            return
        if len(selected) > 1:
            self.log("⚠️ Chỉ chọn 1 shop mỗi lần để Đăng nhập!")
            return
            
        shop = selected[0]
        def task():
            if hasattr(self, 'btn_login_shop'):
                self.btn_login_shop.configure(state="disabled", text="⏳ Đang mở...")
            try:
                import asyncio
                asyncio.run(self.playwright_manual_login(shop))
            except Exception as e:
                self.log(f"❌ Lỗi hệ thống: {str(e)}")
            finally:
                if hasattr(self, 'btn_login_shop'):
                    self.btn_login_shop.configure(state="normal", text="🔑 Đăng Nhập / Lưu Phiên")
                
        import threading
        threading.Thread(target=task, daemon=True).start()

    async def playwright_manual_login(self, shop):
        self.log(f"🚀 Mở trình duyệt để Đăng nhập & Lưu phiên cho Shop: {shop['ten_shop']}")
        from playwright.async_api import async_playwright
        import asyncio
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
                
                if shop.get('platform') == 'tiktok':
                    await page.goto("https://seller-vn.tiktok.com/", wait_until="commit")
                    await self.tiktok_eng.login_tiktok(page, shop)
                elif shop.get('platform') == 'shopee':
                    await page.goto("https://banhang.shopee.vn/", wait_until="commit")
                    self.log("⏳ Vui lòng đăng nhập Shopee. Trình duyệt tự đóng và lưu sau 3 phút...")
                    await asyncio.sleep(180)
                elif shop.get('platform') == 'lazada':
                    await page.goto("https://sellercenter.lazada.vn/", wait_until="commit")
                    self.log("⏳ Vui lòng đăng nhập Lazada. Trình duyệt tự đóng và lưu sau 3 phút...")
                    await asyncio.sleep(180)
                    
            except Exception as e:
                self.log(f"❌ Lỗi khi mở shop {shop['ten_shop']}: {str(e)}")
            finally:
                await browser.close()
                self.log(f"✅ Đã đóng trình duyệt và lưu phiên (Cookies) cho {shop['ten_shop']}.")


    def run_sync_excel_bot(self):
        platform = self.sp_san_var.get()
        shop_name = self.sp_shop_var.get()
        if shop_name == "Tất cả shop" or not shop_name:
            self.sp_log_msg("⚠️ Vui lòng chọn 1 shop cụ thể (Không chọn 'Tất cả shop') để tải file Excel!")
            return
            
        shop = next((s for s in self.DANH_SACH_SHOP if s.get("ten_shop") == shop_name and s.get("platform") == platform), None)
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
        # Chuyển log xuống màn hình console xanh của tab Đồng Bộ
        old_log_shopee = self.shopee_eng.log
        old_log_tiktok = self.tiktok_eng.log
        self.shopee_eng.log = self.sp_log_msg
        self.tiktok_eng.log = self.sp_log_msg
        
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
                if shop.get('platform') == 'tiktok':
                    await self.tiktok_eng.tai_va_dong_bo_san_pham_excel(page, shop)
                else:
                    await self.shopee_eng.tai_va_dong_bo_san_pham_excel(page, shop)
            except Exception as e:
                self.sp_log_msg(f"❌ Lỗi khi xử lý shop {shop['ten_shop']}: {str(e)}")
            finally:
                await browser.close()
                
        # Trả lại log về vị trí cũ
        self.shopee_eng.log = old_log_shopee
        self.tiktok_eng.log = old_log_tiktok

if __name__ == "__main__":
    HuyVanApp().mainloop()
