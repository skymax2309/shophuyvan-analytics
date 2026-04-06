import time
import hmac
import hashlib
import requests
import json
from datetime import datetime, timedelta

# ==========================================
# CẤU HÌNH CƠ BẢN
# ==========================================
APP_KEY = "135731"
APP_SECRET = "UHMS2CUNhAspEYgNMYZ1ywytbHhCx1wK"

# BẠN HÃY DÁN ACCESS_TOKEN CỦA SHOP VỪA LẤY ĐƯỢC VÀO ĐÂY
ACCESS_TOKEN = "50000300b43gYjmApamTCa6fUdIqEtSCAiBT5KRxDIjMHYgRXZad59N1e7742f7d" 
API_URL = "https://api.lazada.vn/rest"

def generate_sign(api_path, params):
    """Thuật toán băm chữ ký chuẩn Lazada"""
    sorted_params = sorted(params.items())
    sign_string = api_path
    for k, v in sorted_params:
        sign_string += f"{k}{v}"
    
    sign = hmac.new(APP_SECRET.encode('utf-8'), sign_string.encode('utf-8'), hashlib.sha256).hexdigest().upper()
    return sign

def call_lazada_api(api_path, params={}):
    """Hàm gọi API chung có gắn Log dò mìn"""
    try:
        print(f"\n[LOG] ------------------------------------------------")
        print(f"[LOG] Đang chuẩn bị gọi API: {api_path}")
        
        # Gắn tham số bắt buộc
        params["app_key"] = APP_KEY
        params["timestamp"] = str(int(time.time() * 1000))
        params["sign_method"] = "sha256"
        params["access_token"] = ACCESS_TOKEN
        
        # Ký điện tử
        params["sign"] = generate_sign(api_path, params)
        
        print(f"[LOG] Đang gửi Request lên máy chủ Lazada...")
        response = requests.get(API_URL + api_path, params=params)
        
        # Bắt lỗi HTTP
        response.raise_for_status()
        data = response.json()
        
        # Bắt lỗi từ Sàn (Code != "0")
        if data.get("code") != "0":
            print(f"[ERROR] Lazada từ chối. Mã lỗi: {data.get('code')} - {data.get('message')}")
            return None
            
        print(f"[LOG] Gọi API THÀNH CÔNG! Đã nhận được dữ liệu.")
        return data
        
    except requests.exceptions.RequestException as e:
        print(f"[CRITICAL ERROR] Lỗi kết nối mạng hoặc Server sập: {e}")
        input("Nhấn Enter để tiếp tục dò mìn...") # Dừng lại cho Kỹ sư trưởng chụp ảnh
        return None
    except Exception as e:
        print(f"[CRITICAL ERROR] Lỗi không xác định: {e}")
        input("Nhấn Enter để tiếp tục dò mìn...")
        return None

# ==========================================
# CÁC HÀM TEST NGHIỆP VỤ
# ==========================================

def test_lay_don_hang():
    """Test lấy danh sách đơn hàng và trạng thái trong 7 ngày qua"""
    print("\n🚀 BẮT ĐẦU TEST: LẤY ĐƠN HÀNG & TRẠNG THÁI")
    
    # Tính thời gian: Từ 7 ngày trước đến hiện tại (Chuẩn ISO 8601)
    now = datetime.now()
    seven_days_ago = now - timedelta(days=7)
    
    params = {
        "created_after": seven_days_ago.isoformat(timespec='seconds') + "+07:00",
        "sort_direction": "DESC",
        "limit": "5" # Chỉ lấy 5 đơn để xem cấu trúc
    }
    
    data = call_lazada_api("/orders/get", params)
    
    if data and "data" in data and "orders" in data["data"]:
        orders = data["data"]["orders"]
        print(f"[LOG] TÌM THẤY {len(orders)} ĐƠN HÀNG MỚI NHẤT.")
        for idx, order in enumerate(orders):
            print(f"  [{idx+1}] Mã Đơn: {order.get('order_id')} | Trạng thái: {order.get('statuses')} | Doanh thu: {order.get('price')} {order.get('currency')}")
        
        # Lưu file raw để Kỹ sư trưởng xem cấu trúc
        with open("debug_payload_lazada_orders.json", "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        print("[LOG] Đã xuất toàn bộ dữ liệu thô ra file: debug_payload_lazada_orders.json")
    else:
        print("[LOG] Không có đơn hàng nào hoặc cấu trúc dữ liệu bị sai.")

def test_lay_san_pham_va_ton_kho():
    """Test lấy danh sách sản phẩm và thông tin tồn kho"""
    print("\n🚀 BẮT ĐẦU TEST: ĐỒNG BỘ SẢN PHẨM & TỒN KHO")
    
    params = {
        "filter": "all",
        "limit": "5" # Chỉ lấy 5 sản phẩm để xem cấu trúc
    }
    
    data = call_lazada_api("/products/get", params)
    
    if data and "data" in data and "products" in data["data"]:
        products = data["data"]["products"]
        print(f"[LOG] TÌM THẤY {data['data'].get('total_products')} SẢN PHẨM. Đang in 5 SP đầu tiên:")
        
        for idx, p in enumerate(products):
            name = p.get('attributes', {}).get('name', 'Không có tên')
            skus = p.get('skus', [])
            
            print(f"  [{idx+1}] Tên SP: {name}")
            for sku in skus:
                print(f"      - Seller SKU: {sku.get('SellerSku')} | Tồn kho: {sku.get('quantity')} | Giá: {sku.get('price')}")
                
        # Lưu file raw
        with open("debug_payload_lazada_products.json", "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        print("[LOG] Đã xuất toàn bộ dữ liệu thô ra file: debug_payload_lazada_products.json")
    else:
        print("[LOG] Không có sản phẩm nào hoặc cấu trúc dữ liệu bị sai.")

if __name__ == "__main__":
    print("=======================================================")
    print("      TOOL TEST KẾT NỐI API LAZADA (PHIÊN BẢN 1)       ")
    print("=======================================================")
    if ACCESS_TOKEN == "DÁN_ACCESS_TOKEN_VÀO_ĐÂY":
        print("[ERROR] Bạn chưa dán ACCESS_TOKEN vào code. Vui lòng mở code ra và điền vào nhé!")
    else:
        test_lay_don_hang()
        time.sleep(1) # Tránh bị Lazada khóa vì gọi quá nhanh
        test_lay_san_pham_va_ton_kho()
        
    print("\n[LOG] HOÀN TẤT CHƯƠNG TRÌNH TEST.")
