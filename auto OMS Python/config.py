# --- CONFIGURATION FILE ---
import os

# Thông tin API và Token
API_BASE_URL = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api"
UPLOAD_URL = f"{API_BASE_URL}/upload"
JOBS_URL = f"{API_BASE_URL}/jobs"
SYNC_VARIATIONS_URL = f"{API_BASE_URL}/sync-variations"
IMPORT_ORDERS_V2_URL = f"{API_BASE_URL}/import-orders-v2"
AUTO_IMPORT_TRIGGER_URL = f"{API_BASE_URL}/auto-import-trigger"
R2_TOKEN = "huyvan_secret_2026"

# Danh sách Shop (Dữ liệu gốc từ file của Huy)
DANH_SACH_SHOP = [
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