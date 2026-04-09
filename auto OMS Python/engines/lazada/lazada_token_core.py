import requests
import time
import hmac
import hashlib
import traceback

class LazadaTokenCore:
    def __init__(self, log_func):
        self.log = log_func
        # Lấy chuẩn từ cấu hình auth.js bác đã gửi
        self.app_key = "135731"
        self.app_secret = "UHMS2CUNhAspEYgNMYZ1ywytbHhCx1wK"
        self.server_url = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api"

    def get_tokens_from_db(self, shop_name):
        """Lấy Token từ CSDL Server"""
        try:
            target = str(shop_name).strip().lower()
            self.log(f"   🔍 Đang lấy dữ liệu Token Lazada từ Server cho shop '{shop_name}'...")
            
            res = requests.get(f"{self.server_url}/shops/tokens", timeout=10)
            if res.status_code == 200:
                for shop in res.json():
                    if shop.get('platform') == 'lazada':
                        db_user = str(shop.get('user_name') or "").strip().lower()
                        db_shop = str(shop.get('shop_name') or "").strip().lower()
                        
                        # Quét khớp tên shop hoặc email (user_name)
                        if target in [db_user, db_shop] or target in db_user.split('@')[0]:
                            return {
                                "access_token": shop.get('access_token'),
                                "refresh_token": shop.get('refresh_token'),
                                "shop_id": str(shop.get('api_shop_id') or "")
                            }
            self.log(f"   ⚠️ Không tìm thấy cấu hình Token Lazada của shop '{shop_name}' trên Server.")
        except Exception as e:
            self.log(f"   ❌ Lỗi kết nối đến Server OMS: {e}")
        return None

    def refresh_and_save_token(self, tokens_data, shop_name):
        """Gọi API Lazada xin Token mới và lưu ngược lên Server"""
        refresh_token = tokens_data.get("refresh_token")
        shop_id = tokens_data.get("shop_id")
        
        if not refresh_token or str(refresh_token).strip() == "null":
            self.log("   ❌ Shop chưa có Refresh Token. Vui lòng lên Web bấm [Cấp quyền Lazada Mới]!")
            return None

        api_path = "/auth/token/refresh"
        params = {
            "app_key": self.app_key,
            "timestamp": str(int(time.time() * 1000)),
            "sign_method": "sha256",
            "refresh_token": refresh_token
        }

        # Thuật toán ký chuẩn Lazada (Sắp xếp A-Z -> Ghép chuỗi -> HMAC-SHA256)
        sort_dict = sorted(params.items())
        sign_string = api_path
        for k, v in sort_dict:
            sign_string += f"{k}{v}"
            
        sign = hmac.new(self.app_secret.encode('utf-8'), sign_string.encode('utf-8'), hashlib.sha256).hexdigest().upper()
        params["sign"] = sign

        self.log(f"   🔄 Đang gọi Lazada xin cấp lại Token mới cho shop '{shop_name}'...")
        try:
            url = "https://auth.lazada.com/rest" + api_path
            res = requests.post(url, params=params, timeout=15).json()
            
            # Lazada trả về code "0" là thành công
            if res.get("code") != "0":
                self.log(f"   ❌ Lazada từ chối cấp Token: {res.get('message', res)}")
                return None
                
            new_access = res.get("access_token")
            new_refresh = res.get("refresh_token")
            self.log("   ✅ Lazada đã cấp Token mới! Đang cất vào Két sắt Server...")
            
            # Lưu lên Server OMS
            try:
                update_req = requests.post(f"{self.server_url}/shops/update-tokens", json={
                    "shop_id": shop_id, 
                    "access_token": new_access, 
                    "refresh_token": new_refresh
                }, timeout=10)
                
                if update_req.status_code == 200:
                    self.log("   💾 Đã lưu Token Lazada mới vào CSDL thành công!")
                else:
                    self.log(f"   ⚠️ Lỗi cất Token Lazada vào Server: {update_req.text}")
            except Exception as e:
                self.log(f"   ⚠️ Lỗi gọi API Server OMS: {e}")
                
            return new_access
            
        except Exception as e:
            self.log(f"   ❌ Đứt cáp mạng khi xin Lazada cấp Token: {e}")
            self.log(traceback.format_exc())
            return None

    def create_api_request(self, api_path, access_token, additional_params=None):
        """Hàm tự động tạo Link và tham số (Kèm Chữ Ký) cho MỌI request API Lazada"""
        params = {
            "app_key": self.app_key,
            "timestamp": str(int(time.time() * 1000)),
            "sign_method": "sha256",
            "access_token": access_token
        }
        
        if additional_params:
            params.update(additional_params)

        sort_dict = sorted(params.items())
        sign_string = api_path
        for k, v in sort_dict:
            sign_string += f"{k}{v}"
            
        sign = hmac.new(self.app_secret.encode('utf-8'), sign_string.encode('utf-8'), hashlib.sha256).hexdigest().upper()
        params["sign"] = sign
        
        # Trả về URL đầu cuối và bộ Parameters để Request.post hoặc Request.get
        return "https://api.lazada.vn/rest" + api_path, params
