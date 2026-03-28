# --- CONFIGURATION FILE (V2 - MODULAR) ---
import os
import json

# Thông tin API và Token
API_BASE_URL = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api"
UPLOAD_URL = f"{API_BASE_URL}/upload"
JOBS_URL = f"{API_BASE_URL}/jobs"
SYNC_VARIATIONS_URL = f"{API_BASE_URL}/sync-variations"
IMPORT_ORDERS_V2_URL = f"{API_BASE_URL}/import-orders-v2"
AUTO_IMPORT_TRIGGER_URL = f"{API_BASE_URL}/auto-import-trigger"
R2_TOKEN = "huyvan_secret_2026"

# Tự động định vị file data/shops.json
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(CURRENT_DIR, "data", "shops.json")

# Tự động đọc danh sách Shop từ file JSON
DANH_SACH_SHOP = []
if os.path.exists(DATA_FILE):
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        DANH_SACH_SHOP = json.load(f)
else:
    print(f"⚠️ Cảnh báo: Không tìm thấy file dữ liệu {DATA_FILE}")
