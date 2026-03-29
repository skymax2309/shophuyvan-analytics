import customtkinter as ctk
from config import DANH_SACH_SHOP

# Import các bộ máy xử lý (Engines)
from engines.shopee_engine import ShopeeEngine
from engines.shopee.shopee_promo import ShopeePromo
from engines.lazada_engine import LazadaEngine
from engines.tiktok_engine import TikTokEngine
from engines.scraper_engine import ScraperEngine

# Import bộ đọc dữ liệu (Parsers)
from parsers.shopee_parser import ShopeeParser
from parsers.lazada_parser import LazadaParser
from parsers.tiktok_parser import TikTokParser

class HuyVanApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Huy Vân Auto E-Com - Modular Version")
        self.DANH_SACH_SHOP = DANH_SACH_SHOP
        
        # Khởi tạo Parser trước
        self.shopee_psr = ShopeeParser(self.log)
        self.lazada_psr = LazadaParser(self.log)
        self.tiktok_psr = TikTokParser(self.log)
        
        # Truyền Parser vào Engine tương ứng
        self.shopee_eng = ShopeeEngine(self.log, self.shopee_psr, self.rescue_wait)
        self.lazada_eng = LazadaEngine(self.log, self.lazada_psr)
        self.tiktok_eng = TikTokEngine(self.log, self.tiktok_psr)
        self.scraper_eng = ScraperEngine(self.log)

        # Thiết lập giao diện
        self.configure(fg_color="#101010")
        self.geometry("900x720") # Kéo giãn form để hiển thị đầy đủ nút và Switch
        self.resizable(False, False) # Khóa kéo giãn để tránh nhảy layout

        # Khai báo biến Global dùng chung cho tất cả các Tab
        self.var_autostart = ctk.BooleanVar(value=self._check_autostart())
        self.var_headless = ctk.BooleanVar(value=False)

        ctk.CTkLabel(self, text="⚡ AUTO E-COM DATA CENTER",
                     font=("Segoe UI", 24, "bold"), text_color="#00CED1").pack(pady=(15,2))
        ctk.CTkLabel(self, text="Hệ thống tải Doanh thu & Hóa đơn tự động đa sàn",
                     font=("Segoe UI", 11, "italic"), text_color="#AAAAAA").pack(pady=(0,8))

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
        tab_donhang = self.tabview.add("📦 Quản lý Đơn hàng") # <-- BỔ SUNG TAB MỚI

        # ── NHÚNG CÁC TAB TỪ MODULE BÊN NGOÀI VÀO ──
        from ui.login_tab import LoginTab
        self.login_tab = LoginTab(tab_quanly, self)

        from ui.auto_run_tab import AutoRunTab
        self.auto_run_tab = AutoRunTab(tab_chay, self)

        from ui.sync_product_tab import SyncProductTab
        self.sync_product_tab = SyncProductTab(tab_sp, self)

        # <-- GỌI FILE GIAO DIỆN BOT ĐƠN HÀNG -->
        from ui.sync_order_tab import SyncOrderTab
        self.sync_order_tab = SyncOrderTab(tab_donhang, self)

    # ── CÁC HÀM CẦU NỐI (DELEGATORS) ──
    def log(self, message):
        """Chuyển log xuống Tab Auto Run nếu có, không thì in ra Console"""
        if hasattr(self, 'auto_run_tab'):
            self.auto_run_tab.log(message)
        else:
            print(f"[*] {message}")

    def rescue_wait(self, msg):
        if hasattr(self, 'auto_run_tab'):
            self.auto_run_tab.rescue_wait(msg)

    def _refresh_auto_shop_list(self):
        if hasattr(self, 'auto_run_tab'):
            self.auto_run_tab._refresh_auto_shop_list()

    # ── CÁC HÀM CẤU HÌNH GLOBAL ──
    def _check_autostart(self):
        import winreg
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_READ)
            winreg.QueryValueEx(key, "HuyVanBot")
            winreg.CloseKey(key)
            return True
        except:
            return False

    def _toggle_autostart(self):
        import winreg, sys, os
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE)
        if self.var_autostart.get():
            exe_path = sys.executable
            script = os.path.abspath(sys.argv[0]) # Dùng argv[0] để gọi file gốc
            winreg.SetValueEx(key, "HuyVanBot", 0, winreg.REG_SZ, f'"{exe_path}" "{script}"')
            self.log("✅ Đã bật tự khởi động cùng Windows!")
        else:
            try:
                winreg.DeleteValue(key, "HuyVanBot")
                self.log("⏹ Đã tắt tự khởi động cùng Windows!")
            except:
                pass
        winreg.CloseKey(key)
