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

    

    
            

            
    
