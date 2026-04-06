import hmac
import hashlib
import time
import requests
import json

# === 1. ĐIỀN THÔNG TIN BẢO MẬT ===
PARTNER_ID = 2013730
PARTNER_KEY = "shpk66746e4845745341714d6b63656a5a6c7049524b7444486c4a686c4d4a4d"

# === 2. ĐIỀN CHÌA KHÓA VỪA LẤY ĐƯỢC ===
ACCESS_TOKEN = "77725359524b536a7973634d58655646"
SHOP_ID = 166563639 # Chúng ta test thử với 1 shop trong list của bạn

def get_shop_info():
    path = "/api/v2/shop/get_shop_info"
    timestamp = int(time.time())
    
    # 🌟 THUẬT TOÁN TẠO CHỮ KÝ CHO API THƯỜNG (Khác với lúc Ủy quyền)
    # Công thức: partner_id + path + timestamp + access_token + shop_id
    base_string = f"{PARTNER_ID}{path}{timestamp}{ACCESS_TOKEN}{SHOP_ID}"
    sign = hmac.new(PARTNER_KEY.encode(), base_string.encode(), hashlib.sha256).hexdigest()
    
    # Gắn toàn bộ thông số lên URL
    url = f"https://partner.shopeemobile.com{path}?partner_id={PARTNER_ID}&timestamp={timestamp}&access_token={ACCESS_TOKEN}&shop_id={SHOP_ID}&sign={sign}"
    
    print(f"🚀 Đang bắn luồng điện API lấy thông tin Shop {SHOP_ID}...")
    start_time = time.time()
    
    response = requests.get(url)
    
    end_time = time.time()
    print(f"⚡ Tốc độ phản hồi: {round((end_time - start_time) * 1000)} mili-giây!\n")
    
    print("="*50)
    print("🎯 DỮ LIỆU SHOPEE TRẢ VỀ:")
    print("="*50)
    print(json.dumps(response.json(), indent=4, ensure_ascii=False))

if __name__ == "__main__":
    get_shop_info()
