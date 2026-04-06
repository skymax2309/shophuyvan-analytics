import hmac
import hashlib
import time
import requests
import json

# === 1. THÔNG TIN HỆ THỐNG ===
PARTNER_ID = 2013730
PARTNER_KEY = "shpk66746e4845745341714d6b63656a5a6c7049524b7444486c4a686c4d4a4d"

# === 2. CHIẾN LỢI PHẨM VỪA LẤY ĐƯỢC ===
SHOP_ID = 166563639
# Nếu báo lỗi, hãy lấy lại link ủy quyền trên Chrome để copy Code mới nhất dán vào đây:
CODE = "4a7a71427a4870776d694f4c6d567076" 

def get_access_token():
    path = "/api/v2/auth/token/get"
    timestamp = int(time.time())
    
    # Tạo chữ ký (Sign) thuật toán Shopee
    base_string = f"{PARTNER_ID}{path}{timestamp}"
    sign = hmac.new(PARTNER_KEY.encode(), base_string.encode(), hashlib.sha256).hexdigest()
    
    url = f"https://partner.shopeemobile.com{path}?partner_id={PARTNER_ID}&timestamp={timestamp}&sign={sign}"
    
    # Gói hàng gửi cho Shopee
    payload = {
        "code": CODE,
        "shop_id": SHOP_ID,
        "partner_id": PARTNER_ID
    }
    
    headers = {"Content-Type": "application/json"}
    
    print("⏳ Đang kết nối với Server Shopee để đúc Chìa khóa...")
    response = requests.post(url, json=payload, headers=headers)
    
    print("\n" + "="*50)
    print("🎯 KẾT QUẢ TỪ SHOPEE:")
    print("="*50)
    
    data = response.json()
    print(json.dumps(data, indent=4))
    
    if data.get("error"):
        print("\n❌ LỖI RỒI: Có thể mã Code đã hết hạn (quá 10 phút).")
        print("👉 CÁCH SỬA: Hãy copy lại Link Ủy Quyền, dán vào Chrome để lấy mã Code mới và thử lại!")
    else:
        print("\n🎉 THÀNH CÔNG RỰC RỠ!")
        print("Hãy COPY và LƯU KỸ 2 chuỗi 'access_token' và 'refresh_token' vừa hiện ra nhé. Nó chính là linh hồn của hệ thống mới!")

if __name__ == "__main__":
    get_access_token()
