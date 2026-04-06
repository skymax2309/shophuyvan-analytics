import hmac
import hashlib
import time
import urllib.parse

# === 1. ĐIỀN THÔNG TIN APP CỦA BẠN VÀO ĐÂY ===
PARTNER_ID = 2013730 # Sửa lại thành Partner ID của bạn (Nhập số, không có ngoặc kép)
PARTNER_KEY = "shpk66746e4845745341714d6b63656a5a6c7049524b7444486c4a686c4d4a4d" 

# Dùng Google làm điểm hứng dữ liệu tạm thời
REDIRECT_URL = "https://api.shophuyvan.vn"

def generate_auth_url():
    timestamp = int(time.time())
    
    # 2. Thuật toán mã hóa chuẩn Shopee API v2
    base_string = f"{PARTNER_ID}/api/v2/shop/auth_partner{timestamp}"
    sign = hmac.new(PARTNER_KEY.encode(), base_string.encode(), hashlib.sha256).hexdigest()
    
    # 3. Tạo link (Dành cho môi trường Live - Trực tiếp)
    url = f"https://partner.shopeemobile.com/api/v2/shop/auth_partner?partner_id={PARTNER_ID}&timestamp={timestamp}&sign={sign}&redirect={urllib.parse.quote(REDIRECT_URL)}"
    
    print("\n" + "="*50)
    print("🚀 LINK ỦY QUYỀN SHOPEE CỦA BẠN ĐÂY:")
    print("="*50)
    print(url)
    print("="*50)

if __name__ == "__main__":
    generate_auth_url()
