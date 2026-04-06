import time
import hmac
import hashlib
import requests
import json

# --- CẤU HÌNH HỆ THỐNG ---
APP_KEY = "135731"
APP_SECRET = "UHMS2CUNhAspEYgNMYZ1ywytbHhCx1wK"
# Địa chỉ cổng VIP của bạn trên Cloudflare
SERVER_TOKEN_URL = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api/shops/tokens"
SHOP_TARGET = "kinhdoanhonlinegiasoc@gmail.com" 

def get_token_from_server():
    """Tự động lên Đám mây lấy Token mới nhất"""
    try:
        print(f"📡 Đang kết nối Server để lấy Token cho {SHOP_TARGET}...")
        res = requests.get(SERVER_TOKEN_URL, timeout=10)
        if res.status_code == 200:
            shops = res.json()
            for shop in shops:
                if shop.get('platform') == 'lazada' and (shop.get('user_name') == SHOP_TARGET or shop.get('shop_name') == SHOP_TARGET):
                    token = shop.get('access_token')
                    if token:
                        print("✅ Đã lấy Token thành công từ Database D1!")
                        return token
        print("❌ Server không trả về Token. Bạn đã bấm 'Kết nối Lazada' trên Web chưa?")
    except Exception as e:
        print(f"❌ Lỗi kết nối Server: {e}")
    return None

def generate_sign(api_path, params):
    sorted_params = sorted(params.items())
    sign_string = api_path
    for k, v in sorted_params:
        sign_string += f"{k}{v}"
    return hmac.new(APP_SECRET.encode('utf-8'), sign_string.encode('utf-8'), hashlib.sha256).hexdigest().upper()

def call_api(path, params, token):
    params.update({
        "app_key": APP_KEY,
        "timestamp": str(int(time.time() * 1000)),
        "sign_method": "sha256",
        "access_token": token
    })
    params["sign"] = generate_sign(path, params)
    return requests.get(f"https://api.lazada.vn/rest{path}", params=params).json()

def soi_van_chuyen():
    # Bước 1: Tự lấy Token
    token = get_token_from_server()
    if not token: return

    from datetime import datetime, timedelta
    # Nới rộng lưới lọc: Lấy các đơn từ 30 ngày trước đến nay
    time_filter = (datetime.now() - timedelta(days=30)).isoformat(timespec='seconds') + "+07:00"

    print(f"🚀 Đang quét đơn hàng từ ngày {time_filter} để 'nội soi'...")
    
    # Bước 2: Lấy danh sách đơn (Thêm tham số update_after)
    params = {
        "update_after": time_filter, 
        "limit": "5", 
        "sort_direction": "DESC"
    }
    res_orders = call_api("/orders/get", params, token)
    orders = res_orders.get("data", {}).get("orders", [])
    
    if not orders:
        print("❌ Vẫn không tìm thấy đơn hàng nào. Hãy kiểm tra xem Shop có đơn trong 30 ngày qua không?")
        # In full lỗi nếu có để dò mìn
        if res_orders.get("code") != "0":
            print(f"Lỗi từ Lazada: {res_orders.get('message')}")
        return

    for o in orders:
        oid = o['order_id']
        print(f"\n🔍 KIỂM TRA ĐƠN: {oid} | Trạng thái sàn: {o.get('statuses')}")
        
        # Bước 3: Chọc vào chi tiết từng Item
        res_items = call_api("/order/items/get", {"order_id": str(oid)}, token)
        items = res_items.get("data", [])
        
        if items:
            first_item = items[0]
            print(f"  📍 shipment_provider: {first_item.get('shipment_provider')}")
            print(f"  📍 tracking_code: {first_item.get('tracking_code')}")
            print(f"  📍 shipping_type: {first_item.get('shipping_type')}")
            
            # Nếu vẫn rỗng, ta soi toàn bộ ruột gan của đơn này
            if not first_item.get('shipment_provider'):
                print("  ⚠️ Dữ liệu thô để tìm ngách giấu tên vận chuyển:")
                print(json.dumps(first_item, indent=2, ensure_ascii=False))
        else:
            print("  ❌ Không lấy được chi tiết Item.")

if __name__ == "__main__":
    soi_van_chuyen()
