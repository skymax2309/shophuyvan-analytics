import time
import hmac
import hashlib
import requests
import json

APP_KEY = "135731"
APP_SECRET = "UHMS2CUNhAspEYgNMYZ1ywytbHhCx1wK"
CODE = "0_135731_9VlX3TBv1X9TKwGVSHW0CFGD54"

def generate_lazada_sign(api_path, params):
    # Sắp xếp tham số theo bảng chữ cái
    sorted_params = sorted(params.items())
    
    # Ghép chuỗi chuẩn thuật toán Lazada
    sign_string = api_path
    for k, v in sorted_params:
        sign_string += f"{k}{v}"
        
    # Mã hóa HMAC-SHA256
    sign = hmac.new(APP_SECRET.encode('utf-8'), sign_string.encode('utf-8'), hashlib.sha256).hexdigest().upper()
    return sign

def get_lazada_token():
    api_path = "/auth/token/create"
    url = "https://auth.lazada.com/rest" + api_path
    
    params = {
        "app_key": APP_KEY,
        "timestamp": str(int(time.time() * 1000)),
        "sign_method": "sha256",
        "code": CODE
    }
    
    params["sign"] = generate_lazada_sign(api_path, params)
    
    print("⏳ Đang kết nối với Server Lazada để đúc Chìa khóa...")
    # Lazada yêu cầu nối tham số trực tiếp trên URL hoặc form-data
    response = requests.post(url, params=params) 
    
    print("\n" + "="*50)
    print("🎯 KẾT QUẢ TỪ LAZADA:")
    print("="*50)
    
    data = response.json()
    print(json.dumps(data, indent=4))
    
    if data.get("code") == "0":
        print("\n🎉 THÀNH CÔNG RỰC RỠ!")
        print("Hãy COPY và LƯU KỸ 'access_token' và 'refresh_token' nhé!")
    else:
        print("\n❌ LỖI RỒI: Mã Code có thể đã hết hạn hoặc đã được sử dụng.")
        print("👉 CÁCH SỬA: Lấy lại link ủy quyền, sinh mã code mới và thay vào biến CODE.")

if __name__ == "__main__":
    get_lazada_token()
