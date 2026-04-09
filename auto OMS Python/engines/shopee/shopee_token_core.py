import requests
import time
import hmac
import hashlib
import traceback

class ShopeeTokenCore:
    def __init__(self, log_func):
        self.log = log_func
        # Thông tin App Shopee của bác
        self.partner_id = "2013730"
        self.partner_key = "shpk66746e4845745341714d6b63656a5a6c7049524b7444486c4a686c4d4a4d"
        # Đầu mối API Server của hệ thống OMS
        self.server_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api"

    def get_tokens_from_db(self, shop_name):
        """Lấy toàn bộ bộ Token (Access + Refresh) từ Cloudflare Server"""
        try:
            # Bản đồ mapping ID cứng cho các shop đặc thù
            shopee_id_map = { "chihuy2309": "166563639" }
            target = str(shop_name).strip().lower()
            mapped_id = shopee_id_map.get(target, "")
            
            self.log(f"   🔍 Đang lấy dữ liệu Token từ Server cho shop '{shop_name}'...")
            res = requests.get(f"{self.server_url}/shops/tokens", timeout=10)
            
            if res.status_code == 200:
                for shop in res.json():
                    if shop.get('platform') == 'shopee':
                        db_user = str(shop.get('user_name') or "").strip().lower()
                        db_shop = str(shop.get('shop_name') or "").strip().lower()
                        
                        if target in [db_user, db_shop] or (mapped_id and mapped_id in [db_user, db_shop]):
                            return {
                                "access_token": shop.get('access_token'),
                                "refresh_token": shop.get('refresh_token'),
                                "shop_id": mapped_id or str(shop.get('api_shop_id') or "")
                            }
                self.log(f"   ⚠️ Không tìm thấy cấu hình Token của shop '{shop_name}' trên Server.")
            else:
                self.log(f"   ❌ Server trả về lỗi khi lấy Token: {res.status_code} - {res.text}")
        except Exception as e:
            self.log(f"   ❌ Lỗi kết nối đến Server OMS: {e}")
        return None

    def refresh_and_save_token(self, tokens_data, shop_name):
        """Xin cấp lại Token từ Shopee và tự động lưu ngược lên Server"""
        refresh_token = tokens_data.get("refresh_token")
        shop_id = tokens_data.get("shop_id")
        
        if not refresh_token or str(refresh_token).strip() == "null" or not shop_id:
            self.log("   ❌ Shop chưa có Refresh Token. Vui lòng vào trang Web cấp quyền lại!")
            return None

        # 1. Ký chữ ký chuẩn Auth của Shopee (Chỉ dùng partner_id + path + timestamp)
        path = "/api/v2/auth/access_token/get"
        timestamp = int(time.time())
        base_string = f"{self.partner_id}{path}{timestamp}"
        sign = hmac.new(self.partner_key.encode('utf-8'), base_string.encode('utf-8'), hashlib.sha256).hexdigest()
        
        url = f"https://partner.shopeemobile.com{path}?partner_id={self.partner_id}&timestamp={timestamp}&sign={sign}"
        
        self.log(f"   🔄 Đang gõ cửa Shopee xin cấp lại Token mới cho shop '{shop_name}'...")
        try:
            # 2. Gọi API Shopee xin Token mới
            res = requests.post(url, json={
                "refresh_token": refresh_token, 
                "partner_id": int(self.partner_id), 
                "shop_id": int(shop_id)
            }, timeout=15).json()
            
            if res.get("error"):
                self.log(f"   ❌ Shopee từ chối cấp Token: {res.get('message', res.get('error'))}")
                return None
                
            new_access = res.get("access_token")
            new_refresh = res.get("refresh_token")
            self.log("   ✅ Shopee đã cấp Token mới! Đang cất vào Két sắt Server...")
            
            # 3. Đẩy lên Server lưu trữ (Chuẩn bị cho Giai đoạn 2)
            try:
                update_req = requests.post(f"{self.server_url}/shops/update-tokens", json={
                    "shop_id": shop_id, 
                    "access_token": new_access, 
                    "refresh_token": new_refresh
                }, timeout=10)
                
                if update_req.status_code == 200:
                    self.log("   💾 Đã lưu Token mới vào Két sắt thành công. Lần sau chạy sẽ mượt mà!")
                else:
                    self.log(f"   ⚠️ Lỗi cất Token vào Server: {update_req.text}")
            except Exception as e:
                self.log(f"   ⚠️ Không thể kết nối Server để lưu Token: {e}")
                
            return new_access
            
        except Exception as e:
            self.log(f"   ❌ Đứt cáp mạng khi xin Shopee cấp Token: {e}")
            self.log(traceback.format_exc())
            return None

    def sign_api_request(self, path, access_token, shop_id):
        """Hàm chuẩn hóa tạo chữ ký cho MỌI request API thông thường"""
        timestamp = int(time.time())
        base_string = f"{self.partner_id}{path}{timestamp}{access_token}{shop_id}"
        sign = hmac.new(self.partner_key.encode('utf-8'), base_string.encode('utf-8'), hashlib.sha256).hexdigest()
        return f"https://partner.shopeemobile.com{path}?partner_id={self.partner_id}&timestamp={timestamp}&access_token={access_token}&shop_id={shop_id}&sign={sign}"
